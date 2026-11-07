import { describe, it, expect } from "vitest";
import { moveSentence, weekStamp } from "./traffic-move-alert";
import type { TrafficMove } from "../../packages/strategy-plan/sections/traffic-statement";

function move(over: Partial<TrafficMove> = {}): TrafficMove {
	return {
		kind: "campaign",
		label: "(CBO | H1-H10 | PT) ABERTO 35+ FEM",
		nowPct: 91,
		beforePct: 83,
		deltaPoints: 8,
		nowSessions: 420,
		beforeSessions: 398,
		direction: "worse",
		samePage: true,
		purchases: 0,
		path: "/products/vedaplus-kit-potes-hermeticos",
		...over,
	};
}

describe("the dedupe tag's week stamp", () => {
	it("is stable across every day of the same week", () => {
		// The cron ticks hourly and fires on Mondays, so the stamp has to
		// be the thing that makes the send once-per-week rather than the
		// schedule. A stamp that rolled mid-week would send twice.
		const monday = weekStamp(new Date("2026-11-02T09:00:00Z"));
		const sunday = weekStamp(new Date("2026-11-08T23:00:00Z"));
		expect(monday).toBe(sunday);
	});

	it("rolls over to the next week on Monday", () => {
		expect(weekStamp(new Date("2026-11-08T23:00:00Z"))).not.toBe(
			weekStamp(new Date("2026-11-09T01:00:00Z")),
		);
	});

	it("reads as an ISO week", () => {
		expect(weekStamp(new Date("2026-11-02T12:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
	});

	it("keeps a year-end week with the year ISO assigns it", () => {
		// 2026-12-31 is a Thursday, so its week belongs to 2026 and must
		// not be stamped 2027, which would let the same week alert twice.
		expect(weekStamp(new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
	});
});

describe("the sentence the operator receives", () => {
	it("is the one the reviewer asked for", () => {
		// "a campanha X estava em 83% e está em 91%, nada mudou no
		// criativo". The last clause is the part that makes the number
		// worth reading instead of arguing with, so it is only said when
		// the landing page really is unchanged.
		const s = moveSentence(move());
		expect(s).toContain("estava em 83% e está em 91%");
		expect(s).toContain("piorou 8 pontos");
		expect(s).toContain("cai na mesma página de antes");
	});

	it("does not claim the page is unchanged when it is not", () => {
		expect(moveSentence(move({ samePage: false }))).not.toContain("mesma página");
	});

	it("never recommends touching something without saying what it earns", () => {
		// Five reviewers found the old verdict telling them to cut a
		// campaign that was still selling. The alert must not reintroduce
		// that by arriving without the other half of the trade.
		const s = moveSentence(move({ purchases: 12 }));
		expect(s).toContain("12 compras");
		expect(s).toContain("não é para pausar sem olhar");
	});

	it("says compra in the singular for one", () => {
		expect(moveSentence(move({ purchases: 1 }))).toContain("1 compra nesta semana");
	});

	it("uses pt-BR decimals", () => {
		const s = moveSentence(move({ nowPct: 55.6, beforePct: 45.4, deltaPoints: 10.2 }));
		expect(s).toContain("55,6%");
		expect(s).toContain("45,4%");
		expect(s).toContain("10,2 pontos");
	});

	it("reports an improvement as an improvement", () => {
		const s = moveSentence(move({ direction: "better", deltaPoints: -12 }));
		expect(s).toContain("melhorou 12 pontos");
	});

	it("names a page and a term correctly", () => {
		expect(moveSentence(move({ kind: "page", label: "/products/x" }))).toMatch(
			/^A página \/products\/x/,
		);
		expect(moveSentence(move({ kind: "term", label: "rescisao gratis" }))).toMatch(
			/^O termo rescisao gratis/,
		);
	});
});
