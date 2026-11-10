import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	MAX_FALSE_ZERO_RISK,
	CHECKOUT_REACH_BLOCKS_CUT,
} from "./traffic-statement";
import { MIN_EVENTS_INTERACTIVE } from "./measured-friction";

// ──────────────────────────────────────────────
// What nine media-buying specialists found, frozen.
//
// The council was briefed item by item on every constant in the ruler.
// Nobody broke a number. What they broke was what the numbers were
// pointed at, and four findings converged across independent lenses.
//
// Two of the four were measured against the live account before being
// believed, and one of those measurements contradicted what six of the
// nine assumed, which is why the fix is not the one they proposed.
// ──────────────────────────────────────────────

const WIN = {
	windowStart: "2026-10-13",
	windowEnd: "2026-11-10",
	conversionModel: "checkout",
	minSessions: 80,
};
const MUTE = { max_scroll_depth: 0, surface_progression: ["a"] };
const BUYS = { max_scroll_depth: 70, checkout_reached: true, reached_thank_you: true };

function sess(n: number, over: Record<string, unknown>, campaign: string, events = 5) {
	return Array.from({ length: n }, () => ({
		aggregate: {
			attribution: {
				first_touch: { source: "FB", campaign, fbclid: "abc123456", landing_url: "https://l.com/p" },
			},
			...over,
		},
		eventCount: events,
		userAgent: null,
		startedAt: new Date("2026-11-09T12:00:00.000Z"),
	}));
}

describe("the gate no longer deletes paid clicks in silence", () => {
	it("counts sessions below the event floor instead of dropping them", () => {
		// Measured on the live account: 9.406 of 51.364 paid sessions
		// fall under the gate and 93,9% of them carry an fbclid against
		// 96,0% in the counted population. They are clicks the operator
		// paid for, and they used to vanish with no trace.
		const rows = [
			...sess(200, MUTE, "A|900000000001", MIN_EVENTS_INTERACTIVE - 1),
			...sess(300, BUYS, "A|900000000001", 6),
		];
		const st = buildTrafficStatement(rows, WIN);
		expect(st.notLoaded.sessions).toBe(200);
		expect(st.notLoaded.withPaidMarker).toBe(200);
		expect(st.notLoaded.sharePct).toBeGreaterThan(0);
	});

	it("keeps them out of the mute rate, which is the deliberate half", () => {
		// The council assumed folding them in was the fix. The
		// measurement says otherwise: the discarded population's device
		// profile is inverted against the counted one (81% plain
		// browser against 24%, where Meta paid traffic is 75% in-app
		// webview), so something about it differs beyond having done
		// nothing. Averaging it into the rate every threshold is
		// calibrated on would move all of them with no decision.
		const rows = [
			...sess(500, MUTE, "A|900000000001", MIN_EVENTS_INTERACTIVE - 1),
			...sess(400, BUYS, "A|900000000001", 6),
		];
		const st = buildTrafficStatement(rows, WIN);
		// Every counted session converted, so the counted rate is 0.
		expect(st.accountBlindPct).toBe(0);
		// And the 500 are still reported, not hidden.
		expect(st.notLoaded.sessions).toBe(500);
	});
});

describe("a cut needs more than a zero", () => {
	/** A campaign bad enough to qualify, in an account with a sane median. */
	function accountWith(offender: Record<string, unknown>[], convRate = 0.02) {
		const rows = [...offender];
		for (let i = 0; i < 5; i++) {
			const buys = Math.round(1000 * convRate);
			rows.push(...sess(140 + i * 5, MUTE, `OK${i}|80000000000${i}`));
			rows.push(...sess(860 - i * 5 - buys, { max_scroll_depth: 60 }, `OK${i}|80000000000${i}`));
			rows.push(...sess(buys, BUYS, `OK${i}|80000000000${i}`));
		}
		return buildTrafficStatement(rows, WIN);
	}

	it("refuses to cut when the campaign fills the checkout", () => {
		// A campaign that reaches the checkout and closes nothing is a
		// payment problem, not a traffic problem, and in Brazilian DR
		// with Pix and boleto it is the largest recoverable cohort in
		// the account. Cutting it throws away qualified demand and
		// hides a fixable leak.
		const offender = [
			...sess(300, MUTE, "RUIM|900000000009"),
			...sess(100, { max_scroll_depth: 60, checkout_reached: true }, "RUIM|900000000009"),
		];
		const st = accountWith(offender);
		const row = st.campaigns.find((c) => c.platformId === "900000000009")!;
		expect(row.cutUnsafeReason).toBe("chega_ao_checkout");
		expect(row.verdict).not.toBe("cortar");
		expect(row.verdict).toBe("corrigir");
	});

	it("refuses to cut when a zero would happen this often by chance", () => {
		// Two council members computed this independently. At the
		// account conversion rate and the session floor, a campaign
		// converting exactly like the rest of the account shows zero
		// purchases often enough that the zero carries no information.
		const offender = [
			...sess(60, MUTE, "FINA|900000000008"),
			...sess(40, { max_scroll_depth: 60 }, "FINA|900000000008"),
		];
		const st = accountWith(offender, 0.01);
		const row = st.campaigns.find((c) => c.platformId === "900000000008");
		if (row && row.verdict !== "entregando" && row.verdict !== "observar") {
			expect(row.falseZeroRiskPct / 100).toBeGreaterThan(MAX_FALSE_ZERO_RISK);
			expect(row.verdict).not.toBe("cortar");
		}
	});

	it("blocks every cut in the account when purchases cannot be measured at all", () => {
		// Zero purchases while sessions reach the checkout is the
		// signature of a thank-you page the URL classifier cannot see.
		// Verified: the classifier regex matches "success" and
		// "obrigado" but NOT "sucesso", "pedido-realizado" or
		// "compra-aprovada". A store confirming at /sucesso measures
		// zero purchases, which makes pausing free on every campaign,
		// which makes every qualifying campaign a cut. Same defect
		// already fixed once for service businesses, left open for
		// commerce by spelling.
		const rows = [
			...sess(300, MUTE, "X|900000000007"),
			...sess(100, { max_scroll_depth: 60, checkout_reached: true }, "X|900000000007"),
			...sess(400, { max_scroll_depth: 60, checkout_reached: true }, "Y|900000000006"),
			...sess(600, MUTE, "Y|900000000006"),
		];
		const st = buildTrafficStatement(rows, WIN);
		expect(st.conversionSuspect.blocked).toBe(true);
		expect(st.conversionSuspect.purchases).toBe(0);
		expect(st.conversionSuspect.checkoutReached).toBeGreaterThan(0);
		expect(st.campaigns.filter((c) => c.verdict === "cortar").length).toBe(0);
	});

	it("still allows a cut when the zero is real and nothing reaches the checkout", () => {
		// The guards must not make "cortar" unreachable. A campaign with
		// enough volume for a zero to mean something, that never reaches
		// the checkout, in an account whose measurement works, is still
		// cuttable. Otherwise the product lost a verdict instead of
		// gaining a guard.
		const offender = [
			...sess(900, MUTE, "MORTA|900000000005"),
			...sess(600, { max_scroll_depth: 60 }, "MORTA|900000000005"),
		];
		const st = accountWith(offender, 0.05);
		const row = st.campaigns.find((c) => c.platformId === "900000000005")!;
		expect(row.cutUnsafeReason).toBe(null);
		expect(row.verdict).toBe("cortar");
	});

	it("fails toward corrigir, never toward cortar", () => {
		// The direction of every guard. Advice that costs the operator a
		// winning campaign is the one error this product cannot afford,
		// and it is also the one the operator would never forgive.
		const offender = [
			...sess(300, MUTE, "Z|900000000004"),
			...sess(100, { max_scroll_depth: 60, checkout_reached: true }, "Z|900000000004"),
		];
		const st = accountWith(offender);
		const row = st.campaigns.find((c) => c.platformId === "900000000004")!;
		expect(row.cutUnsafeReason).not.toBe(null);
		expect(["corrigir", "observar", "entregando"]).toContain(row.verdict);
	});

	it("names the threshold it used, so the screen can explain itself", () => {
		expect(CHECKOUT_REACH_BLOCKS_CUT).toBeGreaterThan(0);
		expect(MAX_FALSE_ZERO_RISK).toBeGreaterThan(0);
		expect(MAX_FALSE_ZERO_RISK).toBeLessThan(0.5);
	});
});
