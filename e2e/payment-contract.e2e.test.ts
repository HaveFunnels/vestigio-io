import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resolvePlanFromPriceId, getPlanConfigs } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// The payment path, without moving money.
//
// A real charge is out of bounds, and the Paddle sandbox is not a
// usable substitute here (the MP sandbox is separately known to
// diverge from production on the card flow). So this is a CONTRACT
// test over the one failure that silently costs a customer their plan:
//
//   resolvePlanFromPriceId returns "free" for any price id it does not
//   recognise. The webhook then provisions a PAYING customer onto the
//   free tier, and the only trace is a logPaymentPathFailure line.
//
// That cannot be caught by a unit test with fixtures, because the
// mapping lives in PlatformConfig.plan_configs in the database and is
// edited through the admin UI. It has to be asserted against the real
// configuration.
//
// DOCUMENTED LIMITATION: this does not prove Paddle will deliver a
// webhook, nor that promoteLeadToOrg completes inside its transaction.
// Those need a real transaction and remain a manual step.
// ──────────────────────────────────────────────

const prisma = new PrismaClient();

describe("payment contract: price id → plan", () => {
	it("has plan configs at all", async () => {
		const plans = await getPlanConfigs();
		expect(plans.length, "PlatformConfig.plan_configs is empty").toBeGreaterThan(0);
	});

	it("resolves every configured price id to a paying plan, never free", async () => {
		const plans = await getPlanConfigs();
		const ids: { id: string; plan: string; field: string }[] = [];
		for (const p of plans) {
			for (const field of [
				"priceId",
				"paddlePriceId",
				"paddleAnnualPriceId",
			] as const) {
				const v = (p as unknown as Record<string, string | undefined>)[field];
				if (v && v.trim()) ids.push({ id: v, plan: p.key, field });
			}
		}
		expect(ids.length, "no Paddle price ids configured").toBeGreaterThan(0);

		const broken: string[] = [];
		for (const { id, plan, field } of ids) {
			const resolved = await resolvePlanFromPriceId(id);
			if (resolved === "free" || resolved !== plan) {
				broken.push(`${field}=${id} → "${resolved}" (expected "${plan}")`);
			}
		}
		expect(
			broken,
			`price ids that would provision a paying customer wrongly:\n${broken.join("\n")}`,
		).toEqual([]);
	});

	it("still returns free for an unknown id, so the guard itself works", async () => {
		// The fallback must stay a fallback. If this ever returns a real
		// plan, an unrecognised webhook would silently grant access.
		expect(await resolvePlanFromPriceId("pri_definitely_not_configured")).toBe("free");
	});

	it("has the live price id the landing page checkout uses mapped", async () => {
		// NEXT_PUBLIC_PADDLE_LP_PRICE_ID is what openCheckout() sends.
		// Unmapped, the payment completes and provisions as free.
		const lp = process.env.NEXT_PUBLIC_PADDLE_LP_PRICE_ID;
		if (!lp) {
			console.log("[e2e] NEXT_PUBLIC_PADDLE_LP_PRICE_ID not set in this env — skipped");
			return;
		}
		expect(await resolvePlanFromPriceId(lp)).not.toBe("free");
	});

	it("has a webhook secret configured, so signatures are verified", async () => {
		// Without it the handler cannot distinguish a real Paddle event
		// from a forged one.
		//
		// Conditional because this is a production secret and is not
		// present on a developer machine. Asserting it from a dev shell
		// would only ever report the absence of a local copy, which is
		// the correct state. In CI, where the job runs with the
		// deployment's environment, the assertion is live.
		const secret = process.env.PADDLE_WEBHOOK_SECRET || "";
		if (!secret) {
			console.log("[e2e] PADDLE_WEBHOOK_SECRET absent from this env — assertion skipped");
			return;
		}
		expect(secret.length, "PADDLE_WEBHOOK_SECRET looks truncated").toBeGreaterThan(10);
	});

	it("disconnects", async () => {
		await prisma.$disconnect();
	});
});
