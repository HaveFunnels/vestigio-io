import { describe, it, expect } from "vitest";
import { cleanPageTitle, labelFromPath, pageEntityLabel } from "./page-label";

// ONDA 4.1 — entities, not paths. Vertical-agnostic by construction.

describe("cleanPageTitle", () => {
	it("keeps the specific half of a branded title", () => {
		expect(cleanPageTitle("VedaPlus® Kit Potes Herméticos | Casa Montelle", "casamontelle.com")).toBe(
			"VedaPlus® Kit Potes Herméticos",
		);
		expect(cleanPageTitle("Casa Montelle | Kit Potes Herméticos de Vidro", "casamontelle.com")).toBe(
			"Kit Potes Herméticos de Vidro",
		);
	});
	it("handles dash separators and SaaS titles", () => {
		expect(cleanPageTitle("Preços e Planos – Acme CRM")).toBe("Preços e Planos");
		expect(cleanPageTitle("Checkout | Casa Montelle", "casamontelle.com")).toBe("Checkout");
	});
	it("null/short titles fall through", () => {
		expect(cleanPageTitle(null)).toBeNull();
		expect(cleanPageTitle(" a ")).toBeNull();
	});
	it("caps very long titles with an ellipsis", () => {
		const long = "X".repeat(100);
		expect(cleanPageTitle(long)!.length).toBeLessThanOrEqual(70);
	});
});

describe("labelFromPath / pageEntityLabel", () => {
	it("de-slugs the last segment", () => {
		expect(labelFromPath("/products/limpamax-robo-aspirador")).toBe("limpamax robo aspirador");
		expect(labelFromPath("/")).toBe("página inicial");
	});
	it("prefers the title, falls back to the path", () => {
		expect(pageEntityLabel("Robô Aspirador LimpaMax | Loja", "/products/limpamax")).toBe(
			"Robô Aspirador LimpaMax",
		);
		expect(pageEntityLabel(null, "/pages/contact")).toBe("contact");
	});
});
