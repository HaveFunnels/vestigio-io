import { describe, it, expect } from "vitest";
import { computeWhatChanged, type ProbeRowInput } from "./what-changed";

// ONDA 2.3 — the longitudinal diff over PageProbe. Pins the honesty
// rules: two consecutive failures for "caiu", medians for "mais
// lenta", quiet state instead of silence.

const START = new Date("2026-09-01T00:00:00Z");
const END = new Date("2026-09-30T00:00:00Z");

function probe(
	url: string,
	day: number,
	over: Partial<ProbeRowInput> = {},
): ProbeRowInput {
	return {
		url,
		statusCode: 200,
		fetchMs: 300,
		changedFromPrior: false,
		observedAt: new Date(Date.UTC(2026, 8, day)),
		...over,
	};
}

describe("computeWhatChanged", () => {
	it("null with no probes — section absent, never fabricated", () => {
		expect(computeWhatChanged([], START, END, "pt-BR")).toBeNull();
	});

	it("a page that went down needs TWO consecutive failures", () => {
		const flaky = [
			probe("https://loja.com/cart", 1),
			probe("https://loja.com/cart", 2, { statusCode: 500 }),
			probe("https://loja.com/cart", 3),
		];
		const out1 = computeWhatChanged(flaky, START, END, "pt-BR")!;
		expect(out1.rows.some((r) => r.kind === "went_down")).toBe(false);
		// one blip + recovery reads as came_back, not an outage
		expect(out1.rows.some((r) => r.kind === "came_back")).toBe(true);

		const down = [
			probe("https://loja.com/cart", 1),
			probe("https://loja.com/cart", 2, { statusCode: 500 }),
			probe("https://loja.com/cart", 3, { statusCode: 500 }),
		];
		const out2 = computeWhatChanged(down, START, END, "pt-BR")!;
		const row = out2.rows.find((r) => r.kind === "went_down")!;
		expect(row).toBeTruthy();
		expect(row.path).toBe("/cart");
		expect(row.detail).toContain("HTTP 500");
	});

	it("content changes are counted with the last-change date", () => {
		const probes = [
			probe("https://loja.com/", 1),
			probe("https://loja.com/", 2, { changedFromPrior: true }),
			probe("https://loja.com/", 3, { changedFromPrior: true }),
		];
		const out = computeWhatChanged(probes, START, END, "pt-BR")!;
		const row = out.rows.find((r) => r.kind === "content_changed")!;
		expect(row.detail).toContain("2 vezes");
	});

	it("latency degradation uses medians and both thresholds", () => {
		const fast = [1, 2, 3].map((d) => probe("https://loja.com/p", d, { fetchMs: 400 }));
		const slow = [4, 5, 6].map((d) => probe("https://loja.com/p", d, { fetchMs: 1800 }));
		const out = computeWhatChanged([...fast, ...slow], START, END, "pt-BR")!;
		const row = out.rows.find((r) => r.kind === "slower")!;
		expect(row.detail).toContain("400ms");
		expect(row.detail).toContain("1800ms");

		// 2x but under the 1500ms floor → not reported (fast is fast)
		const f2 = [1, 2, 3].map((d) => probe("https://loja.com/q", d, { fetchMs: 200 }));
		const s2 = [4, 5, 6].map((d) => probe("https://loja.com/q", d, { fetchMs: 500 }));
		const out2 = computeWhatChanged([...f2, ...s2], START, END, "pt-BR")!;
		expect(out2.rows.some((r) => r.kind === "slower")).toBe(false);
	});

	it("quiet window keeps the probed-pages proof with zero rows", () => {
		const probes = [1, 2, 3].flatMap((d) => [
			probe("https://loja.com/", d),
			probe("https://loja.com/cart", d),
		]);
		const out = computeWhatChanged(probes, START, END, "pt-BR")!;
		expect(out.rows).toHaveLength(0);
		expect(out.probedPages).toBe(2);
	});

	it("down sorts above everything else", () => {
		const probes = [
			probe("https://loja.com/a", 1, { changedFromPrior: true }),
			probe("https://loja.com/z", 1),
			probe("https://loja.com/z", 2, { statusCode: 404 }),
			probe("https://loja.com/z", 3, { statusCode: 404 }),
		];
		const out = computeWhatChanged(probes, START, END, "pt-BR")!;
		expect(out.rows[0].kind).toBe("went_down");
	});
});
