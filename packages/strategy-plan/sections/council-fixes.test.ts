import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	MAX_FALSE_ZERO_RISK,
	CHECKOUT_REACH_BLOCKS_CUT,
	marginOfError,
	browserKindOf,
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
	/** Typed from what sess() returns, so the compiler catches a bad
	 *  fixture instead of vitest swallowing it. */
	type Row = ReturnType<typeof sess>[number];
	function accountWith(offender: Row[], convRate = 0.02) {
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

describe("Agresti-Coull, and the margin that used to read zero", () => {
	it("never reports perfect certainty from a finite sample", () => {
		// The failure that made this urgent: plain Wald's half-width
		// collapses to zero at the extremes, so a campaign with 0 mute
		// visits in 80 sessions got a margin of 0,0 points. That number
		// is printed as the uncertainty warning which justified lowering
		// the session floor from 300 to 80, so it read loudest-is-zero
		// exactly where the uncertainty was greatest.
		expect(marginOfError(0, 80)).toBeGreaterThan(2);
		expect(marginOfError(100, 80)).toBeGreaterThan(2);
		expect(marginOfError(0, 5000)).toBeGreaterThan(0);
	});

	it("is widest in the middle and narrows with sample size", () => {
		expect(marginOfError(50, 80)).toBeGreaterThan(marginOfError(5, 80));
		expect(marginOfError(27, 80)).toBeGreaterThan(marginOfError(27, 300));
		expect(marginOfError(27, 300)).toBeGreaterThan(marginOfError(27, 5000));
	});

	it("covers the control group's regime, which is where Wald broke", () => {
		// np is about 13 at the 300-session control minimum with a 4,5%
		// rate. That is the canonical regime where the normal
		// approximation stops holding, and it is also where the account
		// verdict's only external evidence lives.
		expect(marginOfError(4.5, 300)).toBeGreaterThan(1.5);
	});

	it("stays reproducible on paper, which was the stated objection", () => {
		// Agresti-Coull IS "add 2 successes and 2 failures, then do
		// Wald". Asserted as arithmetic so the claim in the comment
		// cannot rot: x=0, n=80 gives pTilde = 2/84.
		const pTilde = 2 / 84;
		const byHand = Math.round(100 * 1.96 * Math.sqrt((pTilde * (1 - pTilde)) / 84) * 10) / 10;
		expect(marginOfError(0, 80)).toBe(byHand);
	});
});

describe("a campaign is judged against the others, not against itself", () => {
	it("still detects the outlier in a five-campaign account", () => {
		// The dentist, the lawyer, the accountant. With five campaigns
		// the judged campaign IS the median or half of it, so the old
		// self-inclusive median produced `points` near zero by
		// construction and the detector went structurally blind on the
		// exact segment the product is trying to reach.
		const rows = [
			...sess(700, MUTE, "RUIM|700000000001"),
			...sess(300, { max_scroll_depth: 60 }, "RUIM|700000000001"),
		];
		for (let i = 0; i < 4; i++) {
			rows.push(...sess(120, MUTE, `BOA${i}|60000000000${i}`));
			rows.push(...sess(880, BUYS, `BOA${i}|60000000000${i}`));
		}
		const st = buildTrafficStatement(rows, WIN);
		const bad = st.campaigns.find((c) => c.platformId === "700000000001")!;
		// 70% against peers at 12%: the gap has to survive.
		expect(bad.pointsAboveAccount).toBeGreaterThan(40);
		expect(["cortar", "corrigir"]).toContain(bad.verdict);
	});

	it("does not invent a gap when every campaign is identical", () => {
		// Leave-one-out must not manufacture signal: with all campaigns
		// at the same rate the peer median equals the campaign's own
		// rate and points stays at zero.
		const rows = [];
		for (let i = 0; i < 5; i++) {
			rows.push(...sess(300, MUTE, `IGUAL${i}|50000000000${i}`));
			rows.push(...sess(700, { max_scroll_depth: 60 }, `IGUAL${i}|50000000000${i}`));
		}
		const st = buildTrafficStatement(rows, WIN);
		for (const c of st.campaigns) {
			expect(Math.abs(c.pointsAboveAccount)).toBeLessThan(1);
		}
	});
});

describe("implausibility is judged on the cautious end too", () => {
	it("does not call a thin campaign unmeasurable on two sessions", () => {
		// It used to compare the point estimate. At n=80 the margin
		// around p=0,9 is about 7 points, so two sessions decided
		// whether the row was a recommendation or a shrug, and because
		// a point estimate crosses 90 by noise far more often in a thin
		// campaign, thin rows were pushed into silence.
		const rows = [
			// 92% observed, but the cautious end is well under 90.
			...sess(92, MUTE, "FINA|400000000001"),
			...sess(8, { max_scroll_depth: 60 }, "FINA|400000000001"),
		];
		for (let i = 0; i < 4; i++) {
			rows.push(...sess(150, MUTE, `OK${i}|30000000000${i}`));
			rows.push(...sess(850, BUYS, `OK${i}|30000000000${i}`));
		}
		const st = buildTrafficStatement(rows, WIN);
		const thin = st.campaigns.find((c) => c.platformId === "400000000001")!;
		expect(thin.arrivedBlindPct).toBeGreaterThan(90);
		expect(thin.blindPctLow).toBeLessThan(90);
		expect(thin.verdict).not.toBe("medicao_suspeita");
	});

	it("still flags instrumentation failure when even the cautious end is absurd", () => {
		const rows = [
			...sess(1000, MUTE, "QUEBRADA|400000000002"),
			...sess(1000, BUYS, "OK|300000000009"),
		];
		const st = buildTrafficStatement(rows, WIN);
		const broken = st.campaigns.find((c) => c.platformId === "400000000002")!;
		expect(broken.blindPctLow).toBeGreaterThanOrEqual(90);
		expect(broken.verdict).toBe("medicao_suspeita");
	});
});

describe("the operator's own numbers audit our measurement", () => {
	/** A service account: WhatsApp business, no checkout anywhere. */
	function dentistAccount(declared: {
		weeks: number;
		booked: number;
		showed: number;
		revenueBrl: number;
	} | null) {
		const rows = [];
		for (let i = 0; i < 5; i++) {
			// Every session mute, and crucially zero contacts measured.
			rows.push(...sess(200, MUTE, `C${i}|20000000000${i}`));
			rows.push(...sess(100, { max_scroll_depth: 60 }, `C${i}|20000000000${i}`));
		}
		return buildTrafficStatement(rows, {
			...WIN,
			conversionModel: "whatsapp",
			declared,
		});
	}

	it("blocks every cut when the operator declared results we did not measure", () => {
		// The guard that only an outside number can provide. The
		// commerce branch cannot fire for a dentist, because he has no
		// checkout to reach. If he typed 40 patients and we counted zero
		// contacts, our side is losing the conversion, and without this
		// every campaign reads "pausing costs nothing" and gets cut.
		// Same defect this file has now shipped in four costumes.
		const st = dentistAccount({ weeks: 5, booked: 52, showed: 40, revenueBrl: 0 });
		expect(st.conversionSuspect.blocked).toBe(true);
		expect(st.conversionSuspect.reason).toContain("celulas semanais");
		expect(st.campaigns.filter((c) => c.verdict === "cortar").length).toBe(0);
	});

	it("accepts declared revenue as evidence too, not only appointments", () => {
		const st = dentistAccount({ weeks: 4, booked: 0, showed: 0, revenueBrl: 18000 });
		expect(st.conversionSuspect.blocked).toBe(true);
	});

	it("stays out of the way when the operator filled nothing", () => {
		// No declaration is not a declaration of zero. The product must
		// not start blocking cuts just because the column is empty,
		// which is its state on every account today.
		const st = dentistAccount(null);
		expect(st.conversionSuspect.blocked).toBe(false);
	});

	it("stays out of the way when the operator declared zero", () => {
		// A week with zero patients declared is real information and it
		// agrees with measuring zero. Nothing is broken.
		const st = dentistAccount({ weeks: 5, booked: 0, showed: 0, revenueBrl: 0 });
		expect(st.conversionSuspect.blocked).toBe(false);
	});

	it("does not fire when we measured what they declared", () => {
		const rows = [];
		for (let i = 0; i < 5; i++) {
			rows.push(...sess(200, MUTE, `C${i}|20000000000${i}`));
			rows.push(
				...sess(
					100,
					{ max_scroll_depth: 60, contact_started: true, contact_channels: ["whatsapp"] },
					`C${i}|20000000000${i}`,
				),
			);
		}
		const st = buildTrafficStatement(rows, {
			...WIN,
			conversionModel: "whatsapp",
			declared: { weeks: 5, booked: 52, showed: 40, revenueBrl: 0 },
		});
		expect(st.conversionSuspect.blocked).toBe(false);
	});
});

describe("webview against real browser", () => {
	it("classifies the three tokens that carry Brazilian DR traffic", () => {
		expect(browserKindOf("Mozilla/5.0 (iPhone) FBAN/FBIOS;FBAV/450")).toBe("webview");
		expect(browserKindOf("Mozilla/5.0 (Linux; Android 13) Instagram 300.0")).toBe("webview");
		expect(browserKindOf("Mozilla/5.0 (Android) FB_IAB/FB4A;FBAV/450")).toBe("webview");
		expect(browserKindOf("Mozilla/5.0 (iPhone) Safari/604.1")).toBe("browser");
		expect(browserKindOf("Mozilla/5.0 (Windows NT 10.0) Chrome/120")).toBe("browser");
		expect(browserKindOf(null)).toBe("unknown");
		expect(browserKindOf("")).toBe("unknown");
	});

	it("splits the paid rate by instrument, not by visitor", () => {
		// The comparison that was impossible before. An in-app webview
		// and a real browser are not the same instrument, so a rate
		// difference between them is not a difference between visitors.
		const rows = [
			...sess(400, MUTE, "A|100000000001").map((r) => ({
				...r,
				userAgent: "Mozilla/5.0 (iPhone) FBAN/FBIOS",
			})),
			...sess(600, { max_scroll_depth: 60 }, "A|100000000001").map((r) => ({
				...r,
				userAgent: "Mozilla/5.0 (iPhone) FBAN/FBIOS",
			})),
			...sess(500, MUTE, "A|100000000001").map((r) => ({
				...r,
				userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
			})),
			...sess(500, { max_scroll_depth: 60 }, "A|100000000001").map((r) => ({
				...r,
				userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
			})),
		];
		const st = buildTrafficStatement(rows, WIN);
		expect(st.byBrowserKind.webview?.blindPct).toBe(40);
		expect(st.byBrowserKind.browser?.blindPct).toBe(50);
	});

	it("reports null rather than zero when a kind never appeared", () => {
		// Null is unknown. A zero would read as "no waste in that
		// bucket", which is a different and false claim.
		const st = buildTrafficStatement(
			sess(200, MUTE, "A|100000000002").map((r) => ({
				...r,
				userAgent: "Mozilla/5.0 (iPhone) FBAN/FBIOS",
			})),
			WIN,
		);
		expect(st.byBrowserKind.webview).not.toBe(null);
		expect(st.byBrowserKind.browser).toBe(null);
	});

	it("does not assume the webview is the worse instrument", () => {
		// Four of nine specialists predicted the webview would inflate
		// the mute rate: smaller viewport, colder cache, slower paint,
		// a free swipe back. Measured on the live account it is the
		// other way round, 25% in the webview against 34,2% in a plain
		// browser, a 9,2 point gap pointing the opposite way.
		//
		// Which is why this is a reported split and not a correction
		// factor. Had it shipped as a correction built on the predicted
		// direction, it would have adjusted every rate the wrong way.
		const st = buildTrafficStatement(
			[
				...sess(100, MUTE, "A|100000000003").map((r) => ({
					...r,
					userAgent: "Mozilla/5.0 (iPhone) FBAN/FBIOS",
				})),
				...sess(900, { max_scroll_depth: 60 }, "A|100000000003").map((r) => ({
					...r,
					userAgent: "Mozilla/5.0 (iPhone) FBAN/FBIOS",
				})),
				...sess(400, MUTE, "A|100000000003").map((r) => ({
					...r,
					userAgent: "Mozilla/5.0 (Windows) Chrome/120",
				})),
				...sess(600, { max_scroll_depth: 60 }, "A|100000000003").map((r) => ({
					...r,
					userAgent: "Mozilla/5.0 (Windows) Chrome/120",
				})),
			],
			WIN,
		);
		// The engine reports whichever direction the data shows.
		expect(st.byBrowserKind.webview!.blindPct).toBeLessThan(
			st.byBrowserKind.browser!.blindPct,
		);
	});
});
