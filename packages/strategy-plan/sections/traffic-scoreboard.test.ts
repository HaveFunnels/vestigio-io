import { describe, it, expect } from "vitest";
import {
	judge,
	DAYS_BEFORE_SCORING,
	OUTCOME_MATERIAL_POINTS,
	MEASURED_BASE_DISAPPEARANCE,
} from "./traffic-scoreboard";

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
		// The threshold is no longer a flat 5 points, so the movement
		// has to clear the combined uncertainty of both measurements.
		// On the 1000-session fixture that lands near 5,6 points, which
		// is why exactly 5 now reads "igual".
		//
		// This changed deliberately. A campaign is recorded BECAUSE its
		// rate was extreme, and an extreme rate returns toward the
		// middle on its own: at n=80 pure binomial noise moves the rate
		// 5 or more points about 53% of the time. A flat floor handed
		// more than half the board a verdict for free, tilted toward
		// "melhorou" by the selection that put it there.
		const wide = 12;
		expect(judge({ ...BASE, laterPct: 70 - wide }).outcome).toBe("melhorou");
		expect(judge({ ...BASE, laterPct: 70 + wide }).outcome).toBe("piorou");
		// Still symmetric, which was the point of the original test: a
		// rule that counts a fall as a win and an equal rise as noise
		// is a rule designed to flatter whoever wrote it.
		expect(judge({ ...BASE, laterPct: 70 - 5 }).outcome).toBe(
			judge({ ...BASE, laterPct: 70 + 5 }).outcome,
		);
	});

	it("demands more movement from a thin campaign than a fat one", () => {
		// Where the noise lives. The same 8-point move is a finding on
		// 4000 sessions and nothing on 90.
		const thin = judge({
			...BASE,
			originalSessions: 90,
			laterSessions: 90,
			laterPct: 62,
		});
		const fat = judge({
			...BASE,
			originalSessions: 4000,
			laterSessions: 4000,
			laterPct: 62,
		});
		expect(thin.outcome).toBe("igual");
		expect(fat.outcome).toBe("melhorou");
	});

	it("refuses to read vanished traffic as the operator acting", () => {
		// This assertion used to demand the opposite, and it was wrong.
		// Measured on the live account: 91 of the 111 campaigns that
		// cleared the session floor fell below the share within 21 days,
		// and nobody had advised anything about any of them. 82%.
		//
		// So traffic stopping proves nothing about adherence, and a
		// scoreboard that read it as adherence would have reported 82%
		// for free, carrying no information, in the number most likely
		// to end up in a renewal conversation.
		const r = judge({ ...BASE, laterSessions: 40, laterPct: 70 });
		expect(r.outcome).toBe("sumiu");
		expect(r.acted).toBe(null);
	});

	it("accepts the operator's own change log as evidence of adherence", () => {
		// The only corroboration available, because it is the only one
		// that comes from outside our own measurement.
		const r = judge({ ...BASE, laterSessions: 40, laterPct: 70, loggedChange: true });
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
		// Null rather than false: we do not know whether they acted, and
		// claiming they did not is as much of an invention as claiming
		// they did.
		expect(r.acted).toBe(null);
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

describe("the money veto", () => {
	// The defect that mattered most in this file: it scored blindPct
	// against blindPct, with no reference to an order, to revenue, or to
	// the column the operator fills by hand. So it could declare
	// victory in a week the business earned less, and nothing in the
	// code prevented that sentence.
	//
	// It is also the sentence that would prove to an operator, once and
	// permanently, that this product optimises a metric which is not
	// theirs.

	it("refuses to call it a win when the business earned less", () => {
		const r = judge({
			...BASE,
			laterPct: 40,
			declaredBefore: 120,
			declaredAfter: 80,
		});
		expect(r.moneyFell).toBe(true);
		expect(r.outcome).not.toBe("melhorou");
		expect(r.outcome).toBe("igual");
	});

	it("still calls it a win when the business held or grew", () => {
		const r = judge({
			...BASE,
			laterPct: 40,
			declaredBefore: 120,
			declaredAfter: 140,
		});
		expect(r.moneyFell).toBe(false);
		expect(r.outcome).toBe("melhorou");
	});

	it("does not veto a loss, because a loss is already honest", () => {
		// The veto exists to stop us flattering ourselves, not to soften
		// a bad result. A worse rate plus less money stays "piorou".
		const r = judge({
			...BASE,
			laterPct: 90,
			declaredBefore: 120,
			declaredAfter: 80,
		});
		expect(r.outcome).toBe("piorou");
	});

	it("says nothing about money when the operator filled nothing", () => {
		// The state of every account today. No declaration is not a
		// declaration of zero, and the absence must not quietly block
		// every win.
		const r = judge({ ...BASE, laterPct: 40 });
		expect(r.moneyFell).toBe(false);
		expect(r.outcome).toBe("melhorou");
	});

	it("names the base rate it has to be discounted against", () => {
		// A rate you cannot discount is a rate you should not believe.
		expect(MEASURED_BASE_DISAPPEARANCE).toBeGreaterThan(0.5);
	});
});
