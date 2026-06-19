import { describe, it, expect } from "vitest";
import { humanizeSurfaceLabel } from "./surface-label";

describe("humanizeSurfaceLabel", () => {
	it("returns empty string for empty input", () => {
		expect(humanizeSurfaceLabel("")).toBe("");
		expect(humanizeSurfaceLabel("   ")).toBe("");
	});

	it("translates known root path", () => {
		expect(humanizeSurfaceLabel("/")).toContain("Site");
	});

	it("translates checkout path", () => {
		expect(humanizeSurfaceLabel("/checkout")).toContain("Checkout");
	});

	it("renders arrow flow with ' → ' separator", () => {
		const out = humanizeSurfaceLabel("/cart → /checkout");
		expect(out).toMatch(/→/);
		expect(out).toContain("Checkout");
	});

	it("renders comma list with ' + ' separator", () => {
		const out = humanizeSurfaceLabel("/checkout, /pricing");
		expect(out).toMatch(/\+/);
		expect(out).toContain("Checkout");
	});

	it("translates known parenthetical as subtitle", () => {
		const out = humanizeSurfaceLabel("/ (sitewide security headers)");
		expect(out).toContain("·");
		expect(out).toContain("Site");
	});

	it("falls back to raw path for unknown surface", () => {
		expect(humanizeSurfaceLabel("/totally-unknown-path-xyz")).toBe(
			"/totally-unknown-path-xyz",
		);
	});

	it("strips unknown parenthetical jargon entirely", () => {
		// "behavioral" jargão técnico — não traduzível, descarta
		const out = humanizeSurfaceLabel("/checkout (behavioral)");
		expect(out).toContain("Checkout");
		expect(out).not.toContain("behavioral");
		expect(out).not.toContain("(");
	});

	it("handles case-insensitive lookups", () => {
		const out = humanizeSurfaceLabel("/CHECKOUT");
		expect(out).toContain("Checkout");
	});

	it("preserves arrow flow with multiple hops", () => {
		const out = humanizeSurfaceLabel("/cart → /checkout → /thank-you");
		const arrows = (out.match(/→/g) || []).length;
		expect(arrows).toBe(2);
	});
});
