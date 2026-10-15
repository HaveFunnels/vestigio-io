import { describe, it, expect } from "vitest";
import { disambiguateLabels } from "./page-label";

describe("disambiguateLabels", () => {
	it("names the path only where the title does not identify one page", () => {
		// Casa Montelle's real case: one product, three URLs, one title.
		const pages = disambiguateLabels([
			{ path: "/products/vedaplus", label: "Kit Potes Herméticos" },
			{ path: "/products/vedaplus-kit", label: "Kit Potes Herméticos" },
			{ path: "/products/vedaplus-kit-potes-hermeticos", label: "Kit Potes Herméticos" },
			{ path: "/c/NX-34D2", label: "Checkout" },
		]);
		expect(pages[0].label).toBe("Kit Potes Herméticos (/products/vedaplus)");
		expect(pages[1].label).toBe("Kit Potes Herméticos (/products/vedaplus-kit)");
		expect(pages[2].label).toBe(
			"Kit Potes Herméticos (/products/vedaplus-kit-potes-hermeticos)",
		);
		// Untouched: it was never ambiguous.
		expect(pages[3].label).toBe("Checkout");
	});

	it("leaves a list with no collisions exactly as it was", () => {
		const input = [
			{ path: "/", label: "página inicial" },
			{ path: "/cart", label: "Carrinho" },
		];
		const out = disambiguateLabels(input.map((p) => ({ ...p })));
		expect(out.map((p) => p.label)).toEqual(["página inicial", "Carrinho"]);
	});

	it("does not merge rows, because distinct-session counts cannot be added", () => {
		// Three paths in, three paths out. A visitor who saw two of the
		// URLs would be counted twice by any merge.
		const out = disambiguateLabels([
			{ path: "/a", label: "Same" },
			{ path: "/b", label: "Same" },
		]);
		expect(out).toHaveLength(2);
	});
});
