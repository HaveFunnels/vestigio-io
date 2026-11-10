import { describe, it, expect } from "vitest";
import { decomposeDrift, DRIFT_EDGE_WEEKS } from "./traffic-series";

// ──────────────────────────────────────────────
// Was it the page, or was it what you bought?
//
// The council's statistician predicted this and the live account
// confirmed it: of 34,5 points of drift, 23,1 are mix and minus 0,2 is
// behaviour. The campaigns did not get worse. The operator moved budget
// toward campaigns that were always worse.
//
// The product was about to say "your page is degrading" and send
// someone to fix a page that never changed. These tests exist so it
// cannot say that again.
// ──────────────────────────────────────────────

const WEEKS = [
	"2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07",
	"2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12",
];

function account(n = WEEKS.length) {
	return WEEKS.slice(0, n).map((week) => ({
		week,
		sessions: 1000,
		blind: 300,
		blindPct: 30,
	}));
}

/** Weekly campaign rows: campaigns[week][key] = [sessions, blind]. */
function weeks(spec: Record<string, Record<string, [number, number]>>) {
	const m = new Map<string, Map<string, { sessions: number; blind: number }>>();
	for (const [wk, camps] of Object.entries(spec)) {
		const inner = new Map<string, { sessions: number; blind: number }>();
		for (const [k, [sessions, blind]] of Object.entries(camps)) {
			inner.set(k, { sessions, blind });
		}
		m.set(wk, inner);
	}
	return m;
}

/** Same rows on every week in a range, so only the ends differ. */
function flat(
	early: Record<string, [number, number]>,
	late: Record<string, [number, number]>,
) {
	const spec: Record<string, Record<string, [number, number]>> = {};
	WEEKS.forEach((wk, i) => {
		spec[wk] = i < WEEKS.length / 2 ? early : late;
	});
	return weeks(spec);
}

describe("pure mix: nothing got worse, the money moved", () => {
	// Two campaigns with FIXED rates, 10% and 60%. The operator shifts
	// weight from the good one to the bad one. The pooled rate climbs a
	// long way and not one campaign changed.
	const d = decomposeDrift(
		account(),
		flat(
			{ boa: [900, 90], ruim: [100, 60] },
			{ boa: [100, 10], ruim: [900, 540] },
		),
	)!;

	it("attributes essentially all of it to mix", () => {
		expect(d.usable).toBe(false); // only 2 campaigns at both ends
		expect(Math.abs(d.behaviourPoints)).toBeLessThan(0.5);
		expect(d.mixPoints).toBeGreaterThan(30);
	});

	it("reports behaviour as zero, which is the whole point", () => {
		// If this ever returns a non-zero behaviour term, the product
		// will again tell an operator to fix a page that did not change.
		expect(d.behaviourPoints).toBeCloseTo(0, 1);
	});
});

describe("pure behaviour: same money, worse results", () => {
	const d = decomposeDrift(
		account(),
		flat(
			{ a: [500, 50], b: [300, 30], c: [200, 20] },
			{ a: [500, 250], b: [300, 150], c: [200, 100] },
		),
	)!;

	it("attributes it to behaviour, not mix", () => {
		expect(d.usable).toBe(true);
		expect(d.behaviourPoints).toBeGreaterThan(30);
		expect(Math.abs(d.mixPoints)).toBeLessThan(0.5);
	});
});

describe("the terms add up to the movement they explain", () => {
	it("behaviour plus mix equals the total", () => {
		const d = decomposeDrift(
			account(),
			flat(
				{ a: [600, 60], b: [400, 160] },
				{ a: [300, 60], b: [700, 350] },
			),
		)!;
		expect(d.behaviourPoints + d.mixPoints).toBeCloseTo(d.totalPoints, 1);
	});

	it("explains the pooled change it was built from", () => {
		// The decomposition must reconstruct the real pooled difference
		// between the two ends, or the two numbers on screen are
		// describing something else.
		const early = { a: [600, 60], b: [400, 160] } as Record<string, [number, number]>;
		const late = { a: [300, 60], b: [700, 350] } as Record<string, [number, number]>;
		const pooled = (x: Record<string, [number, number]>) => {
			const s = Object.values(x).reduce((n, v) => n + v[0], 0);
			const b = Object.values(x).reduce((n, v) => n + v[1], 0);
			return (100 * b) / s;
		};
		const d = decomposeDrift(account(), flat(early, late))!;
		expect(d.totalPoints).toBeCloseTo(pooled(late) - pooled(early), 0);
	});
});

describe("campaigns that exist at only one end are mix", () => {
	it("treats an entering campaign as a buying decision", () => {
		// The dominant case on the real account: 357 campaigns, 20 live.
		// A campaign that did not exist at the start cannot have "got
		// worse", so all of its contribution is mix.
		const d = decomposeDrift(
			account(),
			flat(
				{ velha: [1000, 100] },
				{ velha: [500, 50], nova: [500, 400] },
			),
		)!;
		expect(Math.abs(d.behaviourPoints)).toBeLessThan(0.5);
		expect(d.mixPoints).toBeGreaterThan(20);
	});
});

describe("refusing to split when it cannot", () => {
	it("returns null below the minimum week count", () => {
		expect(decomposeDrift(account(3), flat({ a: [100, 10] }, { a: [100, 50] }))).toBe(null);
	});

	it("marks itself unusable on too few shared campaigns", () => {
		// Two campaigns cannot carry a decomposition, and saying so
		// beats printing a confident split of noise.
		const d = decomposeDrift(
			account(),
			flat({ a: [600, 60], b: [400, 40] }, { a: [400, 40], b: [600, 300] }),
		)!;
		expect(d.campaigns).toBe(2);
		expect(d.usable).toBe(false);
	});

	it("returns null when a whole end has no campaign rows", () => {
		const spec: Record<string, Record<string, [number, number]>> = {};
		WEEKS.forEach((wk, i) => {
			if (i >= DRIFT_EDGE_WEEKS) spec[wk] = { a: [100, 50] };
		});
		expect(decomposeDrift(account(), weeks(spec))).toBe(null);
	});
});
