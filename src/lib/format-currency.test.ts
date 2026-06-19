import { describe, it, expect } from "vitest";
import {
	getCurrencySymbol,
	fmtCurrency,
	fmtCurrencyCents,
	fmtCurrencyUnits,
} from "./format-currency";

describe("getCurrencySymbol", () => {
	it("returns the right symbol for known currencies", () => {
		expect(getCurrencySymbol("USD")).toBe("$");
		expect(getCurrencySymbol("BRL")).toBe("R$");
		expect(getCurrencySymbol("EUR")).toBe("€");
		expect(getCurrencySymbol("GBP")).toBe("£");
	});

	it("falls back to $ for unknown currency", () => {
		expect(getCurrencySymbol("XYZ")).toBe("$");
		expect(getCurrencySymbol("")).toBe("$");
	});
});

describe("fmtCurrency (whole units, abbreviated)", () => {
	it("formats sub-thousand values rounded", () => {
		expect(fmtCurrency(500, "USD")).toBe("$500");
		expect(fmtCurrency(999, "USD")).toBe("$999");
		expect(fmtCurrency(0, "USD")).toBe("$0");
	});

	it("abbreviates thousands with 1 decimal", () => {
		expect(fmtCurrency(1000, "USD")).toBe("$1.0k");
		expect(fmtCurrency(42500, "USD")).toBe("$42.5k");
		expect(fmtCurrency(999999, "USD")).toBe("$1000.0k");
	});

	it("abbreviates millions with 1 decimal", () => {
		expect(fmtCurrency(1_000_000, "USD")).toBe("$1.0M");
		expect(fmtCurrency(3_400_000, "USD")).toBe("$3.4M");
	});

	it("honors currency symbol", () => {
		expect(fmtCurrency(1500, "BRL")).toBe("R$1.5k");
		expect(fmtCurrency(2_500_000, "EUR")).toBe("€2.5M");
	});

	it("defaults to USD when currency omitted", () => {
		expect(fmtCurrency(100)).toMatch(/^\$/);
	});
});

describe("fmtCurrencyCents (locale-aware, cents input)", () => {
	it("formats sub-thousand dollar amounts with locale-correct symbol", () => {
		// USD: $5
		expect(fmtCurrencyCents(500, "USD")).toMatch(/\$5/);
		// BRL: pt-BR uses R$
		expect(fmtCurrencyCents(500, "BRL")).toMatch(/R\$\s*5/);
	});

	it("abbreviates thousands with k suffix", () => {
		expect(fmtCurrencyCents(150_000, "USD")).toMatch(/\$1\.5k/);
		expect(fmtCurrencyCents(150_000, "BRL")).toMatch(/R\$\s*1,5k/);
	});

	it("abbreviates millions with M suffix", () => {
		expect(fmtCurrencyCents(250_000_000, "USD")).toMatch(/\$2\.5M/);
	});

	it("treats negative cents the same way (uses abs)", () => {
		expect(fmtCurrencyCents(-500, "USD")).toMatch(/\$5/);
		expect(fmtCurrencyCents(-150_000, "USD")).toMatch(/\$1\.5k/);
	});

	it("falls back to en-US locale for unknown currency", () => {
		const out = fmtCurrencyCents(150_000, "XYZ");
		expect(out).toMatch(/1\.5k/);
	});
});

describe("fmtCurrencyUnits (whole units, locale-aware)", () => {
	it("renders zero as em-dash when zeroAsDash", () => {
		expect(fmtCurrencyUnits(0, "USD", { zeroAsDash: true })).toBe("—");
		expect(fmtCurrencyUnits(0, "BRL", { zeroAsDash: true })).toBe("—");
	});

	it("renders zero as currency when zeroAsDash off", () => {
		expect(fmtCurrencyUnits(0, "USD")).toMatch(/\$0/);
	});

	it("auto mode abbreviates >= 1000 to k", () => {
		expect(fmtCurrencyUnits(1500, "USD")).toMatch(/\$1\.5k/);
	});

	it("auto mode keeps full format under 1000", () => {
		expect(fmtCurrencyUnits(500, "USD")).toMatch(/\$500/);
	});

	it("explicit full mode disables k abbreviation", () => {
		expect(fmtCurrencyUnits(1500, "USD", { mode: "full" })).toMatch(/\$1,500/);
	});

	it("explicit k mode abbreviates even small values", () => {
		expect(fmtCurrencyUnits(500, "USD", { mode: "k" })).toMatch(/\$0\.5k/);
	});

	it("respects BRL locale formatting", () => {
		expect(fmtCurrencyUnits(1500, "BRL")).toMatch(/R\$\s*1,5k/);
	});
});
