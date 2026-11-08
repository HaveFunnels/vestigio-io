import { describe, it, expect } from "vitest";
import { foldDay, type TrafficRollupRow } from "./traffic-rollup";
import {
	buildTrafficStatement,
	RULER_VERSION,
	type StatementSessionInput,
} from "./traffic-statement";

const DAY = "2026-11-08";

function sess(over: Record<string, unknown> = {}, eventCount = 5): StatementSessionInput {
	return {
		aggregate: {
			max_scroll_depth: 0,
			surface_progression: ["a"],
			attribution: {
				first_touch: {
					source: "FB",
					campaign: "Promo|111111111111",
					landing_url: "https://loja.com.br/products/x",
				},
			},
			...over,
		},
		eventCount,
		userAgent: null,
	};
}

function many(n: number, over: Record<string, unknown> = {}, eventCount = 5) {
	return Array.from({ length: n }, () => sess(over, eventCount));
}

const pick = (rows: TrafficRollupRow[], dimension: string, key: string) =>
	rows.find((r) => r.dimension === dimension && r.key === key);

describe("the day folds into one row per dimension", () => {
	it("counts a session once in each dimension it belongs to", () => {
		const rows = foldDay(DAY, many(10), null);
		expect(pick(rows, "campaign", "111111111111")!.sessions).toBe(10);
		expect(pick(rows, "page", "/products/x")!.sessions).toBe(10);
		expect(pick(rows, "account", "_")!.sessions).toBe(10);
	});

	it("keeps the day's totals in their own row, not smeared on every row", () => {
		const rows = foldDay(
			DAY,
			[
				...many(6),
				...many(4, {
					attribution: {
						first_touch: {
							source: "FB",
							campaign: "Outra|222222222222",
							landing_url: "https://loja.com.br/products/y",
						},
					},
				}),
			],
			null,
		);
		expect(rows.filter((r) => r.dimension === "campaign")).toHaveLength(2);
		expect(pick(rows, "account", "_")!.sessions).toBe(10);
	});

	it("sums cleanly across days, which is what makes a 90-day read a SUM", () => {
		// The property the whole table rests on: a session has one
		// startedAt and one first-touch campaign, so it lands in exactly
		// one bucket and nothing double-counts over a range.
		const a = foldDay("2026-11-07", many(7), null);
		const b = foldDay("2026-11-08", many(5), null);
		const total =
			pick(a, "campaign", "111111111111")!.sessions +
			pick(b, "campaign", "111111111111")!.sessions;
		expect(total).toBe(12);
	});

	it("applies the same bot gate the statement applies", () => {
		// If the series counted bounces and the screen did not, the two
		// would disagree forever and nobody could tell which was right.
		const rows = foldDay(DAY, [...many(8), ...many(4, {}, 2)], null);
		expect(pick(rows, "account", "_")!.sessions).toBe(8);
	});

	it("stores paid traffic only, never the organic control", () => {
		const rows = foldDay(
			DAY,
			[...many(5), ...many(9, { attribution: { first_touch: { source: "direct" } } })],
			null,
		);
		expect(pick(rows, "account", "_")!.sessions).toBe(5);
	});

	it("is empty for a day with nothing in it", () => {
		expect(foldDay(DAY, [], null)).toEqual([]);
	});
});

describe("the series cannot disagree with the screen", () => {
	it("counts blind sessions by the same rule the statement uses", () => {
		const rows = [
			// Did nothing at all.
			...many(300),
			// Saw a CTA without scrolling: not blind, in both places.
			...many(200, { max_scroll_depth: 0, cta_viewed_count: 2 }),
		];
		const folded = foldDay(DAY, rows, null);
		const st = buildTrafficStatement(rows, {
			windowStart: DAY,
			windowEnd: DAY,
		});
		expect(pick(folded, "campaign", "111111111111")!.blind).toBe(300);
		expect(st.campaigns[0].arrivedBlind).toBe(300);
	});

	it("counts the action by the business model, same as the statement", () => {
		const rows = many(400, {
			max_scroll_depth: 0,
			surface_progression: ["a"],
			contact_channels: ["whatsapp"],
			contact_started: true,
			attribution: {
				first_touch: { source: "FB", campaign: "Promo|111111111111" },
			},
		});
		// A store's contact click is support and does not count.
		expect(pick(foldDay(DAY, rows, "checkout"), "account", "_")!.action).toBe(0);
		// A service business converts on exactly that.
		expect(pick(foldDay(DAY, rows, "whatsapp"), "account", "_")!.action).toBe(400);
		// Either way it is recorded as a contact.
		expect(pick(foldDay(DAY, rows, "checkout"), "account", "_")!.contacts).toBe(400);
	});

	it("keeps the campaign name so a series survives a rename", () => {
		const rows = foldDay(DAY, many(3), null);
		expect(pick(rows, "campaign", "111111111111")!.label).toBe("Promo");
		// The key is the platform id, so renaming does not fork the series.
		expect(pick(rows, "campaign", "111111111111")!.key).toBe("111111111111");
	});

	it("declares which ruler is in force", () => {
		// Bumped whenever sawNothing changes. The headline already moved
		// from 70.1% to 29.5% once with the verdict inverting, and
		// nothing recorded that the measurement had changed underneath.
		expect(RULER_VERSION).toBe(2);
	});
});

describe("memory is what dissolves the session floor", () => {
	it("accumulates a campaign that is too small to judge in any single month", () => {
		// Seven reviewers worked out that no campaign of theirs clears
		// 300 sessions in a month, so their statement comes back empty.
		// Six campaigns of 150 are invisible monthly and are 5.400
		// sessions a quarter.
		const perDay = 5;
		const days = Array.from({ length: 90 }, (_, i) =>
			foldDay(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`, many(perDay), null),
		);
		const total = days.reduce(
			(n, rows) => n + (pick(rows, "campaign", "111111111111")?.sessions ?? 0),
			0,
		);
		expect(total).toBe(450);
		// Which clears the floor that one month of the same traffic never would.
		expect(perDay * 30).toBeLessThan(300);
		expect(total).toBeGreaterThan(300);
	});
});
