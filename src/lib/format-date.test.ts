import { describe, it, expect } from "vitest";
import { formatDate, formatDateLong, formatDateTime } from "./format-date";

const ISO_DATE = "2026-01-05T12:00:00Z";

describe("formatDate", () => {
	it("returns empty string for nullish input", () => {
		expect(formatDate(null, "en-US")).toBe("");
		expect(formatDate(undefined, "pt-BR")).toBe("");
	});

	it("returns empty string for invalid date", () => {
		expect(formatDate("not-a-date", "en-US")).toBe("");
	});

	it("accepts Date / string / number inputs", () => {
		const dateObj = new Date(ISO_DATE);
		const timestamp = dateObj.getTime();
		const a = formatDate(dateObj, "en-US");
		const b = formatDate(ISO_DATE, "en-US");
		const c = formatDate(timestamp, "en-US");
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it("uses pt-BR ordering for pt-BR locale (day first)", () => {
		const out = formatDate(ISO_DATE, "pt-BR");
		// 5 January 2026 in pt-BR: typically "05/01/2026"
		expect(out).toMatch(/^0?5/);
	});

	it("uses en-US ordering for en-US locale (month first)", () => {
		const out = formatDate(ISO_DATE, "en-US");
		// January 5, 2026 in en-US: typically "1/5/2026"
		expect(out).toMatch(/^1\//);
	});

	it("falls back to en-US when locale missing", () => {
		const expected = formatDate(ISO_DATE, "en-US");
		expect(formatDate(ISO_DATE, null)).toBe(expected);
		expect(formatDate(ISO_DATE, undefined)).toBe(expected);
	});

	it("strips region suffix when only base locale is mapped", () => {
		// "pt" with no region — should still hit pt-BR formatting via the
		// language-only fallback in resolveLocale.
		const out = formatDate(ISO_DATE, "pt");
		expect(out).toMatch(/^0?5/);
	});
});

describe("formatDateLong", () => {
	it("returns empty for nullish", () => {
		expect(formatDateLong(null, "en-US")).toBe("");
	});

	it("includes the year in the output", () => {
		expect(formatDateLong(ISO_DATE, "en-US")).toContain("2026");
		expect(formatDateLong(ISO_DATE, "pt-BR")).toContain("2026");
	});

	it("includes month name for pt-BR (janeiro)", () => {
		const out = formatDateLong(ISO_DATE, "pt-BR").toLowerCase();
		expect(out).toContain("janeiro");
	});

	it("includes month name for en-US (january)", () => {
		const out = formatDateLong(ISO_DATE, "en-US").toLowerCase();
		expect(out).toContain("january");
	});
});

describe("formatDateTime", () => {
	it("returns empty for nullish", () => {
		expect(formatDateTime(null, "en-US")).toBe("");
	});

	it("includes the date portion", () => {
		expect(formatDateTime(ISO_DATE, "en-US")).toContain("2026");
	});

	it("output differs from formatDate (carries time)", () => {
		const dateOnly = formatDate(ISO_DATE, "en-US");
		const withTime = formatDateTime(ISO_DATE, "en-US");
		expect(withTime).not.toBe(dateOnly);
		expect(withTime.length).toBeGreaterThan(dateOnly.length);
	});
});
