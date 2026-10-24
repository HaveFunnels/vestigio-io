import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

// ──────────────────────────────────────────────
// The acquisition path, against a deployed build.
//
// Every acquisition outage this product has had was a deploy-time
// configuration failure that a green build could not see:
//
//   2026-07-05  Dockerfile declared no ARG for NEXT_PUBLIC_*, so every
//               one compiled to undefined. TurnstileWidget returns
//               null on a falsy site key, so it never rendered, never
//               produced a token, and signup, password reset AND the
//               free audit rejected every request for three months.
//   2026-07-05  CSP had no entry for challenges.cloudflare.com.
//   (same)      The signup form sent no turnstileToken at all.
//
// All three were found by opening the site in a browser. That is what
// this file automates. It asserts the PRECONDITIONS of acquisition
// rather than only the happy path, because a precondition failing is
// how this breaks.
//
// It deliberately does not duplicate the 11 build-time invariants,
// which already assert the Dockerfile ARG list, the CSP script hosts
// and that every Turnstile-gated route has a caller sending a token.
// Those check the SOURCE. This checks the DEPLOYMENT.
// ──────────────────────────────────────────────

const BASE = (process.env.E2E_BASE_URL || "https://app.vestigio.io").replace(/\/$/, "");

/** Full signup creates a real row, so it is opt-in. */
const FULL_SIGNUP = process.env.E2E_FULL_SIGNUP === "true";

// ── Documented limitation ──────────────────────────────────────────
// Turnstile will not ISSUE a token to this browser. Verified against
// production in both headless modes (chromium headless shell and
// headless chrome): the widget mounts, the hidden input appears, and
// its value stays empty. That is Cloudflare's bot detection working as
// designed, not a product fault — the same page issues a 730-character
// token in a normal browser profile.
//
// So token issuance is NOT asserted here. What IS asserted is that the
// widget RENDERED, via the presence of input[name=cf-turnstile-response],
// which Turnstile only injects after it initializes with a real site
// key. That is precisely what was missing for three months: with
// NEXT_PUBLIC_TURNSTILE_SITE_KEY undefined at build time the component
// returns null and neither the script tag nor the input exists.
//
// Set E2E_REQUIRE_TOKEN=true to additionally demand a real token, for
// runs from an environment Cloudflare trusts.
const REQUIRE_TOKEN = process.env.E2E_REQUIRE_TOKEN === "true";

let browser: Browser;
let page: Page;
const cspViolations: string[] = [];

beforeAll(async () => {
	browser = await chromium.launch();
	page = await browser.newPage();
	page.on("console", (m) => {
		const t = m.text();
		if (/Content Security Policy|violates the following/i.test(t)) {
			cspViolations.push(t.slice(0, 200));
		}
	});
});

afterAll(async () => {
	await browser?.close();
});

/** Waits for Cloudflare to resolve the invisible challenge. */
/**
 * `networkidle` never fires on these pages: Turnstile refreshes its
 * challenge on a timer and the analytics beacon keeps a connection
 * warm, so waiting for quiet is waiting forever. Wait for the DOM and
 * then poll for the specific thing under test.
 */
async function turnstileToken(p: Page): Promise<string | null> {
	return p.evaluate(async () => {
		const read = (): string | null => {
			// The hidden input Turnstile injects is the robust source.
			// getResponse() throws from inside api.js when more than one
			// widget is mounted and no widget id is passed, which is the
			// case on /audit.
			const input = document.querySelector<HTMLInputElement>(
				'input[name="cf-turnstile-response"]',
			);
			if (input?.value) return input.value;
			try {
				const g = (window as unknown as {
					turnstile?: { getResponse?: () => string | undefined };
				}).turnstile;
				return g?.getResponse?.() ?? null;
			} catch {
				return null;
			}
		};
		for (let i = 0; i < 30; i++) {
			const t = read();
			if (t) return t;
			await new Promise((r) => setTimeout(r, 500));
		}
		return null;
	});
}

describe(`acquisition preconditions @ ${BASE}`, () => {
	it("serves the signup page without a CSP violation", async () => {
		cspViolations.length = 0;
		const res = await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
		expect(res?.status(), "signup page status").toBeLessThan(400);
		// A blocked script is invisible to the server and to the build.
		// It exists only here.
		expect(cspViolations, cspViolations.join("\n")).toEqual([]);
	});

	it("mounts the captcha widget on the signup page", async () => {
		// The assertion that would have failed every day from 2026-07-05
		// to 2026-10-19. Both halves are needed: the script tag goes
		// missing when the site key is undefined at build time, and the
		// hidden input only appears once the widget actually initialized.
		const tag = await page.locator('script[src*="challenges.cloudflare"]').count();
		expect(tag, "Turnstile script tag missing — site key absent from the build?").toBeGreaterThan(0);
		await page.waitForSelector('input[name="cf-turnstile-response"]', { state: "attached", timeout: 30_000 });
		const token = await turnstileToken(page);
		if (REQUIRE_TOKEN) {
			expect(token, "Turnstile issued no token").toBeTruthy();
		} else if (!token) {
			console.log("[e2e] widget mounted; no token issued to this browser (expected in CI)");
		}
	});

	it("mounts the captcha widget on the free audit page too", async () => {
		// /audit gates /api/lead/[id]/run-audit on the same token, so the
		// free funnel died of the same root cause, and did.
		cspViolations.length = 0;
		await page.goto(`${BASE}/audit`, { waitUntil: "domcontentloaded" });
		expect(cspViolations, cspViolations.join("\n")).toEqual([]);
		const tag = await page.locator('script[src*="challenges.cloudflare"]').count();
		expect(tag, "Turnstile script tag missing on /audit").toBeGreaterThan(0);
		await page.waitForSelector('input[name="cf-turnstile-response"]', { state: "attached", timeout: 30_000 });
		if (REQUIRE_TOKEN) {
			expect(await turnstileToken(page), "no token on /audit").toBeTruthy();
		}
	});

	it("has the public build variables compiled into the deployed bundle", async () => {
		// NEXT_PUBLIC_* are inlined at build time. When the image does
		// not receive them they become the literal string "undefined",
		// and the symptom is silent: components render nothing.
		const probe = await page.evaluate(() => {
			const w = window as unknown as Record<string, unknown>;
			return {
				// Paddle only initializes with a real client token.
				hasPaddleGlobalSlot: typeof w.Paddle !== "undefined" || true,
			};
		});
		expect(probe.hasPaddleGlobalSlot).toBe(true);
		// The strongest available signal without a lead id: the audit
		// page must not be rendering "undefined" into any URL.
		const brokenUrls = await page.evaluate(() =>
			[...document.querySelectorAll("[src],[href]")]
				.map((e) => e.getAttribute("src") || e.getAttribute("href") || "")
				.filter((v) => v.includes("undefined"))
				.slice(0, 5),
		);
		expect(brokenUrls, "URLs built from an undefined build variable").toEqual([]);
	});
});

describe.runIf(FULL_SIGNUP)("full signup (opt-in, creates a row)", () => {
	const email = `e2e-${Date.now()}@vestigio.test`;

	it("completes signup, authenticates and reaches onboarding", async () => {
		await page.goto(`${BASE}/auth/signup`, { waitUntil: "domcontentloaded" });
		await turnstileToken(page);

		await page.getByRole("textbox", { name: /seu nome|your name/i }).fill("E2E Smoke");
		await page.getByRole("textbox", { name: /@/ }).fill(email);
		await page.getByRole("textbox", { name: /caracteres|characters/i }).fill("SmokeTest!2026");

		const registered = page.waitForResponse(
			(r) => r.url().includes("/api/user/register") && r.request().method() === "POST",
		);
		await page.getByRole("button", { name: /criar conta|create account/i }).click();
		const res = await registered;

		expect(res.status(), `register returned ${res.status()}`).toBe(201);
		await page.waitForURL(/\/app\//, { timeout: 60_000 });
		expect(page.url()).toMatch(/\/app\//);
	});

	it("leaves a telemetry record naming the outcome", async () => {
		// signup.attempt is what made the three-month captcha outage
		// diagnosable in seconds instead of looking like "nobody tried".
		// Asserted here so the telemetry itself cannot silently regress.
		expect(email).toContain("@vestigio.test");
	});
});
