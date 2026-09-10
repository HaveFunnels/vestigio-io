import { describe, it, expect } from "vitest";
import { computeMeasuredFriction } from "./measured-friction";

// ONDA 3.2 — counted friction per page from compact timelines. Pins the
// scan semantics, the near-CTA rule and the honesty gates.

const START = new Date("2026-08-10T00:00:00Z");
const END = new Date("2026-09-09T00:00:00Z");

type Entry = [number, string, number, Record<string, unknown>?];

function row(entries: Entry[], urls: string[]): { timeline: string; urls: string } {
	return { timeline: JSON.stringify(entries), urls: JSON.stringify(urls) };
}

const URLS = ["https://loja.com/", "https://loja.com/products/kit", "https://loja.com/cart"];

function frictionSession(): { timeline: string; urls: string } {
	return row(
		[
			[0, "page_view", 0],
			[3000, "page_view", 1],
			[5000, "dead_click", 1],
			[8000, "hesitation_pause", 1, { near_cta: true }],
		],
		URLS,
	);
}

function cleanSession(): { timeline: string; urls: string } {
	return row(
		[
			[0, "page_view", 0],
			[2000, "page_view", 1],
			[4000, "cta_click", 1, { label: "Comprar" }],
		],
		URLS,
	);
}

describe("computeMeasuredFriction", () => {
	it("counts friction events per page with session receipts", () => {
		const rows = [
			...Array.from({ length: 40 }, frictionSession),
			...Array.from({ length: 60 }, cleanSession),
		];
		const out = computeMeasuredFriction(rows, START, END)!;
		expect(out.sampleSessions).toBe(100);
		const pdp = out.pages.find((p) => p.path === "/products/kit")!;
		expect(pdp.sessions).toBe(100);
		expect(pdp.deadClicks).toBe(40);
		expect(pdp.hesitationsNearCta).toBe(40);
		expect(pdp.sessionsWithFriction).toBe(40);
		expect(pdp.frictionRatePct).toBe(40);
	});

	it("a pause AWAY from the CTA is engagement, not friction", () => {
		const rows = Array.from({ length: 50 }, () =>
			row([[0, "page_view", 1], [5000, "hesitation_pause", 1, { near_cta: false }]], URLS),
		);
		expect(computeMeasuredFriction(rows, START, END)).toBeNull();
	});

	it("pages below the session floor never rank — no noise percentages", () => {
		const rows = [
			...Array.from({ length: 10 }, frictionSession), // /products/kit: 10 sessions < 30
			...Array.from({ length: 40 }, () => row([[0, "page_view", 0]], URLS)),
		];
		const out = computeMeasuredFriction(rows, START, END);
		expect(out?.pages.find((p) => p.path === "/products/kit")).toBeUndefined();
	});

	it("ranks by sessions AFFECTED, not by raw event volume", () => {
		const noisy = Array.from({ length: 35 }, () =>
			// one session, many dead clicks on /cart
			row([[0, "page_view", 2], [1000, "dead_click", 2], [1100, "dead_click", 2], [1200, "dead_click", 2]], URLS),
		).slice(0, 1);
		const wide = Array.from({ length: 35 }, () =>
			row([[0, "page_view", 1], [1000, "dead_click", 1]], URLS),
		);
		const filler = Array.from({ length: 40 }, () =>
			row([[0, "page_view", 2]], URLS),
		);
		const out = computeMeasuredFriction([...noisy, ...wide, ...filler], START, END)!;
		expect(out.pages[0].path).toBe("/products/kit");
	});

	it("malformed rows are skipped, never crash", () => {
		const rows = [
			{ timeline: "not-json", urls: "[]" },
			...Array.from({ length: 40 }, frictionSession),
		];
		const out = computeMeasuredFriction(rows, START, END)!;
		expect(out.pages.length).toBeGreaterThan(0);
	});
});
