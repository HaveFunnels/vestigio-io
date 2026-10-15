import { describe, it, expect } from "vitest";
import { findDuplicateEntities } from "./measured-friction";

// One product reachable at several URLs. Nothing in a store reports
// this, because from the inside every URL is a working page.

describe("findDuplicateEntities", () => {
	it("groups Casa Montelle's five handles for one product", () => {
		const title = "VedaPlus® - Kit Potes Herméticos de Vidro | Casa Montelle";
		const titles = new Map<string, string | null>([
			["/products/vedaplus-kit-potes-hermeticos", title],
			["/products/vedaplus", title],
			["/products/vedaplus-kit-potes-hermeticos-de-vidro", title],
			["/products/vedaplus-kit", title],
			["/products/vedaplus%c2%ae-kit-potes-hermeticos-de-vidro-brinde-exclusivo-copia", title],
			["/products/limpamax", "LimpaMax™ Robô Aspirador | Casa Montelle"],
		]);
		const sessions = new Map([
			["/products/vedaplus-kit-potes-hermeticos", 32316],
			["/products/vedaplus", 11004],
			["/products/vedaplus-kit-potes-hermeticos-de-vidro", 6164],
			["/products/vedaplus-kit", 3881],
			["/products/vedaplus%c2%ae-kit-potes-hermeticos-de-vidro-brinde-exclusivo-copia", 12],
			["/products/limpamax", 19103],
		]);

		const out = findDuplicateEntities(titles, sessions, "casamontelle.com");
		expect(out).toHaveLength(1);
		expect(out[0].paths).toHaveLength(5);
		expect(out[0].totalSessions).toBe(53377);
		// Biggest first, so the reader knows which handle to keep.
		expect(out[0].paths[0].path).toBe("/products/vedaplus-kit-potes-hermeticos");
		// The 12-session "-copia" handle is included even though it
		// would never clear a ranking floor. It is the one that proves
		// the group is duplicates rather than distinct SKUs.
		expect(out[0].paths[4].sessions).toBe(12);
	});

	it("never groups on a path-derived fallback label", () => {
		// With no crawled title the label comes from the path itself,
		// so grouping on it would invent duplicates out of slug
		// coincidence.
		const titles = new Map<string, string | null>([
			["/products/alpha", null],
			["/products/beta", null],
		]);
		const sessions = new Map([
			["/products/alpha", 5000],
			["/products/beta", 5000],
		]);
		expect(findDuplicateEntities(titles, sessions, "loja.com")).toHaveLength(0);
	});

	it("does not call a zero-traffic URL a traffic split", () => {
		// Casa Montelle's crawl finds both /c/NX-… (10,556 sessions)
		// and a bare /checkout (zero). They share a title, but a URL
		// nobody reaches is not dividing anything, and reporting it
		// turns housekeeping into a finding.
		const titles = new Map<string, string | null>([
			["/c/NX-34D2C1686479", "Checkout | Casa Montelle"],
			["/checkout", "Checkout | Casa Montelle"],
		]);
		const sessions = new Map([
			["/c/NX-34D2C1686479", 10556],
			["/checkout", 0],
		]);
		expect(findDuplicateEntities(titles, sessions, "casamontelle.com")).toHaveLength(0);
	});

	it("leaves a single-URL product alone", () => {
		const titles = new Map<string, string | null>([
			["/products/only", "Único | Loja"],
		]);
		expect(
			findDuplicateEntities(titles, new Map([["/products/only", 9000]]), "loja.com"),
		).toHaveLength(0);
	});

	it("ignores a duplicate pair nobody visits", () => {
		// Two dead handles are housekeeping, not a revenue finding.
		const titles = new Map<string, string | null>([
			["/products/x-old", "Produto X | Loja"],
			["/products/x", "Produto X | Loja"],
		]);
		const sessions = new Map([
			["/products/x-old", 1],
			["/products/x", 2],
		]);
		expect(findDuplicateEntities(titles, sessions, "loja.com")).toHaveLength(0);
	});
});
