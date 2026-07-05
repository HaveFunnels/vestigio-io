/**
 * Chromium pool — keeps a small set of warm browser processes around,
 * dispenses fresh `BrowserContext` objects to callers, and reclaims
 * them on release. Each context starts clean (no cookies, no storage),
 * so isolation between unrelated renders is preserved even though the
 * underlying browser is reused.
 *
 * Why pool: Chromium cold-launch is ~1–3s and ~300MB of RSS per
 * process. A typical cycle renders 10–30 pages; without pooling, every
 * render pays that cold-start cost and the worker memory profile
 * oscillates by ~3GB per minute (allocate, run, free). With pooling
 * three warm browsers stay resident, the contexts are cheap (~30ms,
 * ~50MB), and the GC has much less to do.
 *
 * Legacy `acquireBrowserSlot`/`releaseBrowserSlot` API is preserved so
 * any caller that still launches its own browser keeps the
 * concurrency-cap behaviour. New callers should prefer
 * `withBrowserContext()` to get a clean context backed by a warm
 * browser.
 *
 * Tunable via env: `CHROMIUM_POOL_SIZE` (default 3).
 */

import { chromium, type Browser, type BrowserContext, type LaunchOptions } from "playwright";

const POOL_SIZE = Math.max(1, Number(process.env.CHROMIUM_POOL_SIZE || "3"));

// ──────────────────────────────────────────────
// Legacy semaphore (slot only — still used by callers that launch their
// own browser, e.g. authenticated-runtime which needs custom args)
// ──────────────────────────────────────────────

let inUse = 0;
const slotWaiters: Array<() => void> = [];

export async function acquireBrowserSlot(): Promise<void> {
	if (inUse < POOL_SIZE) {
		inUse += 1;
		return;
	}
	await new Promise<void>((resolve) => {
		slotWaiters.push(() => {
			inUse += 1;
			resolve();
		});
	});
}

export function releaseBrowserSlot(): void {
	if (inUse > 0) inUse -= 1;
	const next = slotWaiters.shift();
	if (next) next();
}

// ──────────────────────────────────────────────
// Browser pool — warm Chromium processes ready for context creation
// ──────────────────────────────────────────────

interface PoolEntry {
	browser: Browser;
	inUseContexts: number;
	createdAt: number;
}

const idleBrowsers: PoolEntry[] = [];
const browserWaiters: Array<(entry: PoolEntry) => void> = [];
let totalBrowsers = 0;

// Recycle browsers after this many uses to prevent memory leaks from
// long-running Chromium processes (history pages, leftover render data).
const MAX_USES_PER_BROWSER = Number(process.env.CHROMIUM_MAX_USES || "200");

// Chromium sandbox handling. On Linux, Chromium's setuid or user-
// namespace sandbox refuses to start when the parent process runs as
// UID 0 (root) — the current shipping default because the Docker
// image ships without a USER directive. Setting `--no-sandbox` is the
// standard workaround for that constraint. It has a real security
// cost: a renderer exploit in Chromium then lands directly on the
// host container without a syscall boundary, giving arbitrary access
// to the Next.js process's env vars (NEXTAUTH_SECRET, Stripe key, DB
// creds, R2 keys, Anthropic key). See M7 H2.
//
// Toggle for the migration path: set CHROMIUM_ENABLE_SANDBOX=1 in the
// runtime env once the container runs as a non-root user. Recommended
// Dockerfile change (deferred to a separate ops PR because it also
// touches PLAYWRIGHT_BROWSERS_PATH permissions and needs staging
// validation):
//
//   RUN groupadd -r vestigio && useradd -r -g vestigio -u 1001 vestigio
//   RUN mkdir -p /app/.cache && chown -R vestigio:vestigio /app
//   ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
//   USER vestigio
//
// Until that lands and CHROMIUM_ENABLE_SANDBOX=1 is set, --no-sandbox
// remains the default so we don't regress today. Ops can flip the
// env var to opt in per environment (dev/staging first).
const SANDBOX_ENABLED = process.env.CHROMIUM_ENABLE_SANDBOX === "1";
const LAUNCH_OPTIONS: LaunchOptions = {
	headless: true,
	// --disable-dev-shm-usage helps with low-RAM Docker containers
	// (Railway, Render small instances). Without it Chromium tries to
	// use 64MB of /dev/shm by default and crashes when it can't.
	args: SANDBOX_ENABLED
		? ["--disable-dev-shm-usage"]
		: ["--disable-dev-shm-usage", "--no-sandbox"],
};

async function spawnBrowser(): Promise<PoolEntry> {
	const browser = await chromium.launch(LAUNCH_OPTIONS);
	totalBrowsers += 1;
	// If the browser ever disconnects unexpectedly (crash, OOM, GPU
	// glitch), make sure we don't keep handing out a dead Browser.
	browser.on("disconnected", () => {
		totalBrowsers = Math.max(0, totalBrowsers - 1);
		// Remove from idle pool if it was idle when it died.
		const idx = idleBrowsers.findIndex((e) => e.browser === browser);
		if (idx >= 0) idleBrowsers.splice(idx, 1);
	});
	return { browser, inUseContexts: 0, createdAt: Date.now() };
}

async function acquirePoolEntry(): Promise<PoolEntry> {
	const reusable = idleBrowsers.pop();
	if (reusable && reusable.browser.isConnected()) {
		return reusable;
	}
	if (totalBrowsers < POOL_SIZE) {
		return await spawnBrowser();
	}
	return await new Promise<PoolEntry>((resolve) => {
		browserWaiters.push(resolve);
	});
}

async function releasePoolEntry(entry: PoolEntry): Promise<void> {
	if (!entry.browser.isConnected()) {
		// Crashed mid-use. Drop it.
		const next = browserWaiters.shift();
		if (next) {
			try {
				const replacement = await spawnBrowser();
				next(replacement);
			} catch {
				// best-effort; the waiter will time out via its caller
			}
		}
		return;
	}
	// Recycle after MAX_USES_PER_BROWSER uses to bound memory drift.
	if (entry.inUseContexts >= MAX_USES_PER_BROWSER) {
		try {
			await entry.browser.close();
		} catch {
			// disconnect handler will decrement totalBrowsers
		}
		const next = browserWaiters.shift();
		if (next) {
			try {
				const replacement = await spawnBrowser();
				next(replacement);
			} catch {
				// best-effort
			}
		}
		return;
	}
	const next = browserWaiters.shift();
	if (next) {
		next(entry);
	} else {
		idleBrowsers.push(entry);
	}
}

/**
 * Run `callback` with a fresh `BrowserContext` backed by a pooled,
 * warm Chromium. Context is closed on exit so cookies/storage from
 * one render don't leak into the next. The browser itself stays in
 * the pool.
 *
 * Honours the same `CHROMIUM_POOL_SIZE` concurrency limit as the
 * legacy `acquireBrowserSlot` — callers don't need both.
 *
 * ## SSRF filtering
 *
 * By default every request the browser makes is DNS-checked against
 * isUrlSafeForFetch — the same private-IP / IMDS / link-local /
 * loopback rejection used by the Node fetch path. Blocks the
 * attack described in M7 H1: a customer configures their env
 * domain to point at 169.254.169.254 (or Railway-internal) and
 * the audit-runner's Playwright pipeline fetches it, then
 * screenshots the internal response back into their Plano's
 * evidence — cross-tenant read of internal HTTP surfaces.
 *
 * PDF export is the only known legitimate consumer that navigates
 * to loopback (its target is 127.0.0.1:PORT for the print-mode
 * strategy plan render). It passes `allowPrivateAddresses: true`
 * to opt out. Every other caller should leave the default in
 * place.
 *
 * The DNS check uses Node's built-in resolver cache; typical
 * pages reuse hostnames heavily so overhead is bounded to (unique
 * hosts × lookup time) rather than requests × lookup time.
 */
export interface BrowserContextOptions {
	allowPrivateAddresses?: boolean;
}

export async function withBrowserContext<T>(
	contextOptions: Parameters<Browser["newContext"]>[0],
	callback: (context: BrowserContext) => Promise<T>,
	options: BrowserContextOptions = {},
): Promise<T> {
	const entry = await acquirePoolEntry();
	entry.inUseContexts += 1;
	const context = await entry.browser.newContext(contextOptions);

	if (!options.allowPrivateAddresses) {
		// Lazy-import so this file doesn't pull the SSRF package into
		// contexts that would otherwise never load it (test envs, cold
		// imports from unrelated tools).
		const { isUrlSafeForFetch } = await import(
			"../../packages/url-normalize/ssrf"
		);
		await context.route("**/*", async (route, request) => {
			try {
				const safety = await isUrlSafeForFetch(request.url());
				if (!safety.safe) {
					// `blockedbyclient` shows up as the request status in
					// Playwright's tracing so a failing screenshot is
					// self-explanatory in logs.
					await route.abort("blockedbyclient");
					return;
				}
				await route.continue();
			} catch {
				// SSRF check itself blew up (malformed URL, DNS lookup
				// exception); fail-closed — safer to drop the request
				// than let a checker error open the vector.
				await route.abort("failed").catch(() => {});
			}
		});
	}

	try {
		return await callback(context);
	} finally {
		try {
			await context.close();
		} catch {
			// page already closed / disconnected — ignore
		}
		await releasePoolEntry(entry);
	}
}

// ──────────────────────────────────────────────
// Observability
// ──────────────────────────────────────────────

export function getPoolStats(): {
	inUse: number;
	capacity: number;
	waiters: number;
	idleBrowsers: number;
	totalBrowsers: number;
	browserWaiters: number;
} {
	return {
		inUse,
		capacity: POOL_SIZE,
		waiters: slotWaiters.length,
		idleBrowsers: idleBrowsers.length,
		totalBrowsers,
		browserWaiters: browserWaiters.length,
	};
}

/** Test/shutdown hook — close every warm browser. */
export async function shutdownChromiumPool(): Promise<void> {
	const all = [...idleBrowsers];
	idleBrowsers.length = 0;
	for (const entry of all) {
		try {
			await entry.browser.close();
		} catch {
			// best-effort
		}
	}
}
