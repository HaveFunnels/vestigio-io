import { describe, it, expect } from "vitest";
import { buildTrafficStatement } from "./traffic-statement";

// ──────────────────────────────────────────────
// Slow page, or wrong audience?
//
// The pixel has collected navigation timing in every heartbeat since
// the beginning. It was aggregated by a function referenced only inside
// its own file, so the number existed and nothing could reach it.
// Three of nine media-buying specialists landed on the same
// consequence: without it, "the visitor did not care" and "the page
// never painted" are the same number, and a verdict of "corrigir"
// sends the operator to rewrite copy when the fix is milliseconds.
// ──────────────────────────────────────────────

const WIN = { windowStart: "2026-10-13", windowEnd: "2026-11-10", conversionModel: "checkout", minSessions: 80 };

function sess(n: number, over: Record<string, unknown>, path: string) {
	return Array.from({ length: n }, () => ({
		aggregate: {
			attribution: {
				first_touch: { source: "FB", campaign: "C|700000000001", landing_url: `https://l.com${path}` },
			},
			max_scroll_depth: 0,
			surface_progression: ["a"],
			...over,
		},
		eventCount: 5,
		userAgent: null,
	}));
}

describe("page load time reaches the page row", () => {
	it("reports a median once enough arrivals have reported one", () => {
		const st = buildTrafficStatement(sess(100, { load_ms: 4200 }, "/lenta"), WIN);
		const pg = st.landingPages.find((p) => p.path === "/lenta")!;
		expect(pg.medianLoadMs).toBe(4200);
	});

	it("stays null below the reporting floor instead of guessing", () => {
		const st = buildTrafficStatement(sess(100, { load_ms: 4200 }, "/a").slice(0, 10).concat(sess(90, {}, "/a")), WIN);
		const pg = st.landingPages.find((p) => p.path === "/a")!;
		expect(pg.medianLoadMs).toBe(null);
	});

	it("stays null on anything measured before the pixel carried it", () => {
		// Every session recorded before 2026-11-10. Null means unknown
		// and must never be drawn as fast.
		const st = buildTrafficStatement(sess(100, {}, "/antiga"), WIN);
		const pg = st.landingPages.find((p) => p.path === "/antiga")!;
		expect(pg.medianLoadMs).toBe(null);
	});
});

describe("a page cannot look fast because everyone gave up", () => {
	it("counts arrivals that never reached the load event separately", () => {
		// The trap: if a page is so slow that most visitors leave before
		// the load event fires, the surviving timings are the fast tail
		// and the median flatters the page. Those arrivals are counted
		// on their own so the number cannot lie by selection.
		const rows = [
			...sess(30, { load_ms: 900 }, "/trap"),
			...sess(70, { load_ms: null }, "/trap"),
		];
		const st = buildTrafficStatement(rows, WIN);
		const pg = st.landingPages.find((p) => p.path === "/trap")!;
		expect(pg.medianLoadMs).toBe(900);
		expect(pg.neverLoadedPct).toBe(70);
	});

	it("reports zero never-loaded when every arrival reported a time", () => {
		const st = buildTrafficStatement(sess(100, { load_ms: 1200 }, "/ok"), WIN);
		const pg = st.landingPages.find((p) => p.path === "/ok")!;
		expect(pg.neverLoadedPct).toBe(0);
	});
});
