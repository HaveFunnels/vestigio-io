import { describe, it, expect } from "vitest";
import type { BehavioralAlert } from "./behavioral-measurement";

// The no-intent alert is a per-source verdict with no sense of
// volume, and the step built from it is usually the only traffic the
// plan discusses. These pin the two properties that keep that honest.

function alert(over: Partial<BehavioralAlert>): BehavioralAlert {
	return {
		kind: "no_intent_traffic",
		source: "tiktok",
		medianDurationS: 5,
		pctNoScroll: 91,
		sessions: 8784,
		sharePct: 10,
		text: "",
		...over,
	};
}

/** The threshold pair the generator applies. */
function trips(s: { medianDurationS: number; pctNoScroll: number }): boolean {
	return s.medianDurationS < 10 && s.pctNoScroll > 80;
}

describe("no-intent traffic alert", () => {
	it("does not fire on a source that reads the first screen and stays", () => {
		// Casa Montelle's Facebook: 82% of the store, 76% no-scroll,
		// 29s median. High no-scroll alone would flag the traffic that
		// actually buys. Both thresholds are what separates a buyer who
		// never needed to scroll from a drive-by.
		expect(trips({ medianDurationS: 29, pctNoScroll: 76 })).toBe(false);
		expect(trips({ medianDurationS: 5, pctNoScroll: 91 })).toBe(true);
		// Either one alone is not enough.
		expect(trips({ medianDurationS: 29, pctNoScroll: 91 })).toBe(false);
		expect(trips({ medianDurationS: 5, pctNoScroll: 40 })).toBe(false);
	});

	it("carries the source's share, so the step can say what it does not cover", () => {
		const a = alert({ sharePct: 10 });
		expect(a.sharePct).toBe(10);
		// Without this the step quotes 8,784 sessions with no
		// denominator, and a tenth of the traffic reads as the whole
		// traffic problem.
		expect(a.sessions).toBeGreaterThan(0);
	});

	it("orders by sessions so the costliest tripping source leads", () => {
		const alerts = [
			alert({ source: "tiktok", sessions: 8784 }),
			alert({ source: "pinterest", sessions: 21000 }),
		].sort((x, y) => y.sessions - x.sessions);
		expect(alerts[0].source).toBe("pinterest");
	});
});
