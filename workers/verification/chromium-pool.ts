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

const LAUNCH_OPTIONS: LaunchOptions = {
	headless: true,
	// Disabling /dev/shm helps with low-RAM Docker containers (Railway,
	// Render small instances). Without it Chromium tries to use 64MB of
	// /dev/shm by default and crashes when it can't.
	args: ["--disable-dev-shm-usage", "--no-sandbox"],
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
 */
export async function withBrowserContext<T>(
	contextOptions: Parameters<Browser["newContext"]>[0],
	callback: (context: BrowserContext) => Promise<T>,
): Promise<T> {
	const entry = await acquirePoolEntry();
	entry.inUseContexts += 1;
	const context = await entry.browser.newContext(contextOptions);
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
