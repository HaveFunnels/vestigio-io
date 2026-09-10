import { describe, it, expect } from "vitest";
import { buildAdLedger } from "./ad-ledger";

// ONDA 2.2 — spend × measured sessions × attributed revenue. Pins the
// join semantics and the honesty gates.

const behavioral = {
	sources: [
		{ source: "facebook", sessions: 17281, sharePct: 90, medianDurationS: 30, pctNoScroll: 79, pctFormStarted: 12 },
		{ source: "instagram", sessions: 500, sharePct: 3, medianDurationS: 40, pctNoScroll: 60, pctFormStarted: 10 },
		{ source: "tiktok", sessions: 1050, sharePct: 5, medianDurationS: 5, pctNoScroll: 90, pctFormStarted: 6 },
		{ source: "google_ads", sessions: 200, sharePct: 1, medianDurationS: 25, pctNoScroll: 70, pctFormStarted: 8 },
	],
};

const meta = (over: object = {}) => ({
	provider: "meta_ads",
	syncMetadata: JSON.stringify({
		ad_spend_30d: 12000,
		attributed_revenue_30d: 30000,
		currency: "BRL",
		synced_at: "2026-09-09T00:00:00Z",
		...over,
	}),
});

describe("buildAdLedger", () => {
	it("crosses platform spend with measured sessions by source identity", () => {
		const out = buildAdLedger([meta()], behavioral, "pt-BR")!;
		expect(out.rows).toHaveLength(1);
		const r = out.rows[0];
		expect(r.platform).toBe("meta_ads");
		expect(r.measuredSessions).toBe(17781); // facebook + instagram, never tiktok
		expect(r.spend30d).toBe(12000);
		expect(r.attributedRevenue30d).toBe(30000);
		expect(r.costPerSession).toBeCloseTo(12000 / 17781, 2);
	});

	it("weights dwell median by sessions across matched sources", () => {
		const out = buildAdLedger([meta()], behavioral, "pt-BR")!;
		// (30*17281 + 40*500) / 17781 ≈ 30
		expect(out.rows[0].medianDurationS).toBe(30);
	});

	it("hides a connected-but-idle platform (spend 0)", () => {
		expect(buildAdLedger([meta({ ad_spend_30d: 0 })], behavioral, "pt-BR")).toBeNull();
	});

	it("returns null with no connections — never a fabricated ledger", () => {
		expect(buildAdLedger([], behavioral, "pt-BR")).toBeNull();
	});

	it("survives missing behavioral (spend-only row, no false zeroes as measures)", () => {
		const out = buildAdLedger([meta()], null, "pt-BR")!;
		const r = out.rows[0];
		expect(r.measuredSessions).toBe(0);
		expect(r.medianDurationS).toBeNull();
		expect(r.costPerSession).toBeNull();
	});

	it("attributed revenue absent stays null, never 0", () => {
		const out = buildAdLedger([meta({ attributed_revenue_30d: null })], behavioral, "pt-BR")!;
		expect(out.rows[0].attributedRevenue30d).toBeNull();
	});

	it("declares the attribution caveat in the note", () => {
		const out = buildAdLedger([meta()], behavioral, "pt-BR")!;
		expect(out.note).toMatch(/não devem ser somados/);
	});
});
