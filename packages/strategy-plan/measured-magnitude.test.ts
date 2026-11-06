import { describe, it, expect } from "vitest";
import {
	revenuePerSession,
	revenueAtStake,
	sessionShare,
	measuredMagnitude,
	explainMagnitude,
} from "./measured-magnitude";

// Numbers below are the customer's real 2026-11 cycle: declared
// monthly revenue 198,000, measured sessions 65,190.
const REV = 198_000;
const SESS = 65_190;

describe("revenuePerSession", () => {
	it("derives from one declared number and one measured count", () => {
		expect(revenuePerSession(REV, SESS)).toBeCloseTo(3.0373, 3);
	});

	it("returns null rather than falling back to a constant", () => {
		// The whole defect this replaces was a magnitude built on
		// FALLBACK_INPUTS.monthly_revenue = 50_000. A null is honest; a
		// fallback is the bug.
		expect(revenuePerSession(null, SESS)).toBeNull();
		expect(revenuePerSession(0, SESS)).toBeNull();
		expect(revenuePerSession(REV, 0)).toBeNull();
		expect(revenuePerSession(REV, null)).toBeNull();
	});
});

describe("revenueAtStake", () => {
	const per = revenuePerSession(REV, SESS);

	it("prices the measured checkout friction the plan published at R$ 0", () => {
		// 2,710 sessions with friction on the checkout page.
		expect(revenueAtStake(2_710, per)).toBe(8_231);
	});

	it("prices the contact-page friction a service business would care about", () => {
		expect(revenueAtStake(180, per)).toBe(547);
	});

	it("is null when nothing was measured", () => {
		expect(revenueAtStake(0, per)).toBeNull();
		expect(revenueAtStake(100, null)).toBeNull();
	});
});

describe("sessionShare", () => {
	it("exposes how much of the site a finding actually touches", () => {
		// This is the number that stops the overclaim: the duplicate-URL
		// finding covers 57.7% of all sessions, so its magnitude is a
		// pass-through, not a loss.
		expect(sessionShare(37_590, SESS)).toBeCloseTo(0.5766, 3);
		expect(sessionShare(2_710, SESS)).toBeCloseTo(0.0416, 3);
	});

	it("never exceeds 1 even if a count is inconsistent", () => {
		expect(sessionShare(99_999, SESS)).toBe(1);
	});
});

describe("measuredMagnitude", () => {
	it("ranks the measured checkout above a heuristic security finding", () => {
		// The published plan had security_header_weakness at R$ 376 and
		// the measured checkout friction at R$ 0, so the ordering was
		// inverted. 8,231 > 376 puts it back.
		const m = measuredMagnitude(2_710, SESS, REV)!;
		expect(m.revenueAtStakeBrl).toBe(8_231);
		expect(m.revenueAtStakeBrl).toBeGreaterThan(376);
	});

	it("returns null when the customer declared no revenue", () => {
		expect(measuredMagnitude(2_710, SESS, null)).toBeNull();
	});

	it("carries the declared figure so the reader can audit it", () => {
		const m = measuredMagnitude(2_710, SESS, REV)!;
		expect(m.monthlyRevenueBrl).toBe(REV);
		expect(m.measuredSessions).toBe(SESS);
		expect(m.affectedSessions).toBe(2_710);
	});
});

describe("explainMagnitude", () => {
	const m = measuredMagnitude(2_710, SESS, REV)!;

	it("states it is pass-through and not loss, in the customer's own numbers", () => {
		const s = explainMagnitude(m);
		expect(s).toContain("2.710");
		expect(s).toContain("65.190");
		expect(s).toContain("4,2%");
		// The distinction is the point of the module.
		expect(s).toContain("não receita perdida");
	});

	it("carries no em-dash and no interpunct", () => {
		for (const loc of ["pt-BR", "en"]) {
			const s = explainMagnitude(m, loc);
			expect(s).not.toContain("—");
			expect(s).not.toContain("·");
		}
	});
});
