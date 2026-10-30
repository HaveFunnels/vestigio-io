import { describe, it, expect } from "vitest";
import { readingFor, READING, MINOR_SHARE_PCT } from "./SourceReadings";

// Median dwell and % no-scroll only mean something as a pair, and the
// old block showed them as two separate columns, which required the
// reader to know that. These pin the pairing.
//
// Values are Casa Montelle's real measured sources.

describe("the pair, read as one thing", () => {
	it("calls 5s with 91% no-scroll a pass-through", () => {
		expect(readingFor({ medianDurationS: 5, pctNoScroll: 91 })).toBe("drive_by");
	});

	it("calls 29s with 76% no-scroll someone reading the first screen", () => {
		// Facebook, 82% of the store's traffic. Judged on no-scroll
		// alone it would look identical to Tiktok, and it is the
		// traffic that actually buys.
		expect(readingFor({ medianDurationS: 29, pctNoScroll: 76 })).toBe("first_screen");
	});

	it("needs BOTH a short visit and a high no-scroll rate to be a pass-through", () => {
		// A long visit that never scrolls is a first-screen read, not a
		// drive-by. This is the same pairing the alert threshold uses.
		expect(readingFor({ medianDurationS: 45, pctNoScroll: 95 })).not.toBe("drive_by");
		expect(readingFor({ medianDurationS: 4, pctNoScroll: 30 })).not.toBe("drive_by");
	});

	it("reads the remaining real sources", () => {
		expect(readingFor({ medianDurationS: 6, pctNoScroll: 28 })).toBe("scrolls");
		expect(readingFor({ medianDurationS: 47, pctNoScroll: 20 })).toBe("explores");
	});

	it("never claims a cause", () => {
		// "Passa sem ler" describes measured behaviour. It must not say
		// the creative is bad, which the data cannot support.
		for (const r of Object.values(READING)) {
			expect(r.label.toLowerCase()).not.toMatch(/ruim|errad|culpa|criativo/);
			expect(r.help.toLowerCase()).not.toMatch(/porque o anúncio|criativo ruim/);
		}
		expect(READING.drive_by.help).toContain("não a qualidade do anúncio");
	});

	it("has a help line for every reading, so the label is never bare", () => {
		for (const key of ["drive_by", "explores", "scrolls", "first_screen", "mixed"] as const) {
			expect(READING[key].label.length).toBeGreaterThan(3);
			expect(READING[key].help.length).toBeGreaterThan(20);
		}
	});

	it("collapses origins that are noise for the decision", () => {
		// rptn at 433 sessions and instagram at 180 clear the
		// 100-session floor but are 0% of traffic. Keeping them inline
		// is what stops the block scaling to ten origins.
		expect(MINOR_SHARE_PCT).toBeGreaterThan(0);
		expect(MINOR_SHARE_PCT).toBeLessThanOrEqual(5);
	});
});
