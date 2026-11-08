import { describe, it, expect } from "vitest";
import {
	stitch,
	pickOutcomeKind,
	mondayOf,
	MIN_PAIRED_WEEKS,
	RATE_NOISE_POINTS,
} from "./traffic-ground-truth";

// ──────────────────────────────────────────────
// The stitch, tested against the temptation it exists to resist.
//
// Every test here is about NOT claiming something. The engineering is
// twenty lines of sign comparison; the thing that can actually hurt a
// customer is the sentence we print on top of it.
//
// The accountant on the council named the failure mode before we built
// it: a number without its definition stops being auditable the moment
// it leaves the screen. A direction-agreement count printed as if it
// were a correlation is exactly that, and on eight weeks of data it is
// worse, because the reader will act on it.
// ──────────────────────────────────────────────

function weeks(pcts: number[], start = "2026-09-07"): { week: string; blindPct: number; sessions: number }[] {
	const base = new Date(`${start}T00:00:00.000Z`).getTime();
	return pcts.map((blindPct, i) => ({
		week: new Date(base + i * 7 * 86400000).toISOString().slice(0, 10),
		blindPct,
		sessions: 500,
	}));
}

function truth(showed: (number | null)[], start = "2026-09-07") {
	const base = new Date(`${start}T00:00:00.000Z`).getTime();
	return showed.map((s, i) => ({
		week: new Date(base + i * 7 * 86400000).toISOString().slice(0, 10),
		booked: null as number | null,
		showed: s,
		revenueBrl: null as number | null,
		note: null as string | null,
	}));
}

describe("choosing which column the operator actually keeps", () => {
	it("prefers who turned up over who booked", () => {
		// Closer to money. A booking that no-shows is not a patient.
		const rows = truth([30, 28]).map((r) => ({ ...r, booked: 40 }));
		expect(pickOutcomeKind(rows)).toBe("showed");
	});

	it("falls back to bookings, then to money typed from memory", () => {
		const booked = truth([null, null]).map((r) => ({ ...r, booked: 40 }));
		expect(pickOutcomeKind(booked)).toBe("booked");
		const money = truth([null, null]).map((r) => ({ ...r, revenueBrl: 9000 }));
		expect(pickOutcomeKind(money)).toBe("revenue");
	});

	it("says nothing when one week was filled and then abandoned", () => {
		// One row is not a column. A series built on a column filled
		// once looks continuous and is not, which is worse than empty.
		expect(pickOutcomeKind(truth([30]))).toBe(null);
		expect(pickOutcomeKind([])).toBe(null);
	});
});

describe("refusing to claim a relationship", () => {
	it("stays unsayable until there are enough paired weeks", () => {
		// Three clean opposite moves. The pattern is perfect and the
		// answer is still no.
		const s = stitch(weeks([40, 50, 40, 50]), truth([30, 20, 30, 20]));
		expect(s.together).toBe(3);
		expect(s.paired).toBe(3);
		expect(s.sayable).toBe(false);
	});

	it("becomes sayable only at the stated floor", () => {
		const s = stitch(
			weeks([40, 50, 40, 50, 40, 50]),
			truth([30, 20, 30, 20, 30, 20]),
		);
		expect(s.paired).toBe(5);
		expect(s.paired).toBe(MIN_PAIRED_WEEKS);
		expect(s.sayable).toBe(true);
	});

	it("counts weeks that contradict the story with the same arithmetic", () => {
		// Waste up AND bookings up. Real, and it must land in `against`
		// rather than being dropped for being inconvenient.
		const s = stitch(weeks([40, 50]), truth([30, 40]));
		expect(s.against).toBe(1);
		expect(s.together).toBe(0);
	});

	it("never reports more agreement than it has pairs", () => {
		const s = stitch(
			weeks([40, 50, 40, 55, 42, 50]),
			truth([30, 20, 31, 19, 30, 21]),
		);
		expect(s.together + s.against).toBe(s.paired);
	});
});

describe("ignoring movement that is not movement", () => {
	it("skips weeks where the rate barely moved", () => {
		const s = stitch(
			weeks([40, 40 + (RATE_NOISE_POINTS - 1)]),
			truth([30, 15]),
		);
		expect(s.paired).toBe(0);
	});

	it("skips weeks where the outcome barely moved", () => {
		// 40 to 42 bookings is not a change in a dentist's week.
		const s = stitch(weeks([40, 60]), truth([40, 42]));
		expect(s.paired).toBe(0);
	});

	it("skips weeks the operator did not fill, without breaking the chain", () => {
		const s = stitch(
			weeks([40, 50, 40, 50]),
			truth([30, null, 30, 20]),
		);
		// Only the last transition has both ends filled.
		expect(s.paired).toBe(1);
		expect(s.filledWeeks).toBe(3);
	});

	it("does not divide by a week with zero outcome", () => {
		// A dentist who saw nobody. The honest handling is to skip the
		// pair, not to produce Infinity and call it a signal.
		const s = stitch(weeks([40, 60]), truth([0, 20]));
		expect(s.paired).toBe(0);
		expect(Number.isFinite(s.together)).toBe(true);
	});
});

describe("attaching what the operator changed", () => {
	it("files a change into the week it happened in", () => {
		const s = stitch(weeks([40, 50]), truth([30, 20]), [
			{ happenedOn: "2026-09-16", what: "trocamos a foto do produto" },
		]);
		// 2026-09-14 is the second Monday, so the 16th belongs to it.
		expect(s.weeks[0].changes).toEqual([]);
		expect(s.weeks[1].changes).toEqual(["trocamos a foto do produto"]);
	});

	it("keeps a change on the week's first and last day", () => {
		const s = stitch(weeks([40, 50]), truth([30, 20]), [
			{ happenedOn: "2026-09-07", what: "primeiro dia" },
			{ happenedOn: "2026-09-13", what: "ultimo dia" },
			{ happenedOn: "2026-09-14", what: "semana seguinte" },
		]);
		expect(s.weeks[0].changes).toEqual(["primeiro dia", "ultimo dia"]);
		expect(s.weeks[1].changes).toEqual(["semana seguinte"]);
	});

	it("carries the note through without interpreting it", () => {
		// Read by a human. The moment we parse it we start being wrong
		// about it.
		const t = truth([30, 20]);
		t[1].note = "feriado na quinta, fechamos";
		const s = stitch(weeks([40, 50]), t);
		expect(s.weeks[1].note).toBe("feriado na quinta, fechamos");
	});
});

describe("the join key", () => {
	// Verified against the production server (PostgreSQL 18.6) on every
	// case below, then pinned here. A mismatch does not throw: the
	// operator's row lands on a week the series cannot find, and the
	// stitch is silently empty forever.
	const PG_WEEK: Record<string, string> = {
		// A Monday stays put.
		"2026-11-02": "2026-11-02",
		// Mid-week rolls back.
		"2026-11-04": "2026-11-02",
		// Sunday belongs to the week that started six days earlier,
		// which is the case a naive getDay() implementation gets wrong.
		"2026-11-08": "2026-11-02",
		"2026-11-09": "2026-11-09",
		// Across a year boundary, in both directions.
		"2026-01-01": "2025-12-29",
		"2026-12-31": "2026-12-28",
		// And across a February, leap year or not.
		"2026-03-01": "2026-02-23",
	};

	it("agrees with date_trunc('week') on every case checked against the server", () => {
		for (const [day, expected] of Object.entries(PG_WEEK)) {
			expect(mondayOf(day)?.toISOString().slice(0, 10), day).toBe(expected);
		}
	});

	it("refuses a date it cannot parse instead of guessing a week", () => {
		expect(mondayOf("")).toBe(null);
		expect(mondayOf("semana que vem")).toBe(null);
	});

	it("is stable under a timestamp with a time component", () => {
		// The browser sometimes sends a full ISO string. Late-evening
		// local times are exactly where a naive local-time
		// implementation slips a day and lands on the wrong week.
		expect(mondayOf("2026-11-08T23:59:59.000Z")?.toISOString().slice(0, 10)).toBe(
			"2026-11-02",
		);
	});
});
