import { describe, it, expect } from "vitest";
import { buildRealPathSet, resolveFindingSurface } from "./engine";

// The contract these pin down: a finding may only cite a page the crawl
// saw. The Sept/2026 cross-exam found findings anchored on /pricing,
// /features, /about and /support — all 404 on the audited store — and
// scored them as fabricated. These tests are the regression fence.

const realPaths = buildRealPathSet([
	{ payload: { url: "https://loja.com/" } },
	{ payload: { url: "https://loja.com/products/vedaplus" } },
	{ payload: { url: "https://loja.com/checkout" } },
	{ payload: { page_url: "https://loja.com/policies/privacy-policy" } },
]);

describe("buildRealPathSet", () => {
	it("collects pathnames from evidence urls, always including sitewide", () => {
		expect(realPaths.has("/")).toBe(true);
		expect(realPaths.has("/products/vedaplus")).toBe(true);
		expect(realPaths.has("/checkout")).toBe(true);
	});
	it("does not invent paths nobody crawled", () => {
		expect(realPaths.has("/pricing")).toBe(false);
	});
});

describe("resolveFindingSurface", () => {
	it("prefers the finding's own evidence url over any taxonomy", () => {
		expect(
			resolveFindingSurface("policy_gap", "https://loja.com/products/vedaplus", realPaths),
		).toBe("/products/vedaplus");
	});

	it("keeps only taxonomy tokens the crawl actually saw", () => {
		// commercial_pages_slow maps to '/checkout, /cart, /pricing (runtime)'.
		// Only /checkout exists on this site; /cart and /pricing must not
		// be cited.
		const s = resolveFindingSurface("commercial_pages_slow", null, realPaths);
		expect(s).toContain("/checkout");
		expect(s).not.toContain("/pricing");
		expect(s).not.toContain("/cart");
	});

	it("matches page-type prefixes against real deeper paths", () => {
		// '/product' should survive via the real '/products/vedaplus'.
		const s = resolveFindingSurface(
			"social_previews_fail_commercial_value", // '/product, /pricing (social sharing)'
			null,
			realPaths,
		);
		expect(s).toContain("/product");
		expect(s).not.toContain("/pricing");
	});

	it("falls back to sitewide when nothing in the taxonomy is real", () => {
		const none = buildRealPathSet([{ payload: { url: "https://loja.com/" } }]);
		expect(resolveFindingSurface("commercial_pages_slow", null, none)).toBe("/");
	});

	it("anchors host-only (off-site) evidence as sitewide, not as a fake path", () => {
		expect(resolveFindingSurface("lookalike_domain_competing_for_traffic", "loja-clone.com", realPaths)).toBe("/");
	});

	it("never leaks the parenthetical annotations into customer-facing surfaces", () => {
		const s = resolveFindingSurface("commercial_pages_slow", null, realPaths);
		expect(s).not.toContain("(");
	});
});
