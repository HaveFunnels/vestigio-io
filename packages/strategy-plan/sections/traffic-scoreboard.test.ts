import { describe, it, expect } from "vitest";
import { judge, DAYS_BEFORE_SCORING, OUTCOME_MATERIAL_POINTS } from "./traffic-scoreboard";

// ──────────────────────────────────────────────
// The rule that scores us.
//
// This file is adversarial on purpose, and against ourselves. Every
// test below asks the same question: can this rule be made to report
// a hit it did not earn?
//
// That matters more here than in any other test in the repo, because
// a scoreboard is only worth something if it can print a number we
// would rather not publish. The reviewer who asked for it said the
// quiet part: "qualquer um publica o acerto. O produto é quem publica
// o erro."
// ──────────────────────────────────────────────

const BASE = {
	claimedPct: 70,
	laterPct: 70,
	laterSessions: 1000,
	originalSessions: 1000,
	rulerThen: 2,
	rulerNow: 2,
};

describe("judging one of our own recommendations", () => {
	it("calls it melhorou only when the rate actually fell", () => {
		expect(judge({ ...BASE, laterPct: 50 }).outcome).toBe("melhorou");
	});

	it("calls it piorou when the rate rose, and does not hide it", () => {
		// The test that gives the scoreboard its value. If this ever
		// starts returning anything else, we are publishing a hit rate
		// that cannot go down.
		expect(judge({ ...BASE, laterPct: 85 }).outcome).toBe("piorou");
	});

	it("calls small movement igual in both directions", () => {
		// Symmetric on purpose. A rule that counts -4 points as a win and
		// +4 points as noise is a rule designed to flatter whoever wrote
		// it.
		const down = judge({ ...BASE, laterPct: 70 - (OUTCOME_MATERIAL_POINTS - 1) });
		const up = judge({ ...BASE, laterPct: 70 + (OUTCOME_MATERIAL_POINTS - 1) });
		expect(down.outcome).toBe("igual");
		expect(up.outcome).toBe("igual");
	});

	it("treats the threshold identically on both sides", () => {
		expect(judge({ ...BASE, laterPct: 70 - OUTCOME_MATERIAL_POINTS }).outcome).toBe("melhorou");
		expect(judge({ ...BASE, laterPct: 70 + OUTCOME_MATERIAL_POINTS }).outcome).toBe("piorou");
	});

	it("reads vanished traffic as the operator acting, not as a win", () => {
		// A paused campaign is the recommendation being followed. It is
		// recorded as "sumiu" and as acted, and deliberately NOT as
		// "melhorou": we recommended the cut, so counting the cut itself
		// as a confirmed improvement would be scoring our own advice
		// against its own execution.
		const r = judge({ ...BASE, laterSessions: 40, laterPct: 70 });
		expect(r.outcome).toBe("sumiu");
		expect(r.acted).toBe(true);
	});

	it("reads no later data at all as sumiu rather than igual", () => {
		expect(judge({ ...BASE, laterPct: null, laterSessions: 0 }).outcome).toBe("sumiu");
	});

	it("refuses to score across a change of ruler", () => {
		// The honest abstention. A claim measured under one definition of
		// "did nothing" cannot be checked against an outcome measured
		// under another, and saying so costs us a row on the board.
		const r = judge({ ...BASE, laterPct: 20, rulerThen: 1, rulerNow: 2 });
		expect(r.outcome).toBe("indefinido");
		expect(r.acted).toBe(false);
	});

	it("abstains even when the ruler change would have flattered us", () => {
		// The same case, pointed the other way: a huge apparent
		// improvement across a ruler change is exactly the row a
		// dishonest scoreboard would keep.
		expect(judge({ ...BASE, laterPct: 0, rulerThen: 1, rulerNow: 2 }).outcome).toBe(
			"indefinido",
		);
	});

	it("waits three weeks before judging anything", () => {
		// Not a behaviour of judge() but of the sweep that calls it, and
		// asserted here because the number is the claim: a prediction
		// nobody has had time to act on is not a miss.
		expect(DAYS_BEFORE_SCORING).toBeGreaterThanOrEqual(21);
	});

	it("uses the same materiality floor as the weekly alert", () => {
		// If these two ever diverge, the product tells the customer a
		// 5-point move matters and then scores itself as if it did not.
		expect(OUTCOME_MATERIAL_POINTS).toBe(5);
	});
});

describe("the scoreboard cannot be gamed by picking what to record", () => {
	it("judges a verdict we got wrong as wrong even when traffic grew", () => {
		// Growing traffic plus a worse rate is the realistic shape of a
		// bad call: the operator scaled what we told them to fix.
		const r = judge({ ...BASE, laterPct: 88, laterSessions: 5000 });
		expect(r.outcome).toBe("piorou");
	});

	it("does not call a verdict sumiu just because traffic dipped", () => {
		// 30% of the original is a dip, not a pause. Reading it as
		// "sumiu" would quietly convert ordinary seasonality into
		// evidence that our advice was followed.
		expect(judge({ ...BASE, laterSessions: 300, laterPct: 82 }).outcome).toBe("piorou");
	});
});
