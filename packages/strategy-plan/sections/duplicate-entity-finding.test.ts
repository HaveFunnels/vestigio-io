import { describe, it, expect } from "vitest";
import { buildBehavioralFindings } from "./behavioral-findings";

// measured-friction has found this for a while and behavioralJson has
// shown it for a while, and it never became a finding. On the 2026-11
// plan of a paying customer that left the most valuable number in the
// document with no title, no priority and no step: 37,506 measured
// sessions split across four URLs serving one product.

const WINDOW = { windowStart: "2026-10-06", windowEnd: "2026-11-05" };

function frictionWith(duplicateEntities: unknown[]) {
	return {
		friction: {
			basis: "pixel_measured",
			windowStart: WINDOW.windowStart,
			windowEnd: WINDOW.windowEnd,
			sampleSessions: 65_196,
			pages: [],
			duplicateEntities,
		},
		...WINDOW,
	} as unknown as Parameters<typeof buildBehavioralFindings>[0];
}

const casaMontelle = {
	label: "Kit Potes Herméticos de Vidro + Brinde Exclusivo",
	totalSessions: 37_506,
	paths: [
		{ path: "/products/vedaplus-kit-potes-hermeticos", sessions: 25_581 },
		{ path: "/products/vedaplus-kit", sessions: 9_643 },
		{ path: "/products/vedaplus-kit-potes-hermeticos-de-vidro", sessions: 2_151 },
		{ path: "/products/vedaplus", sessions: 131 },
	],
};

describe("duplicate entity splitting traffic", () => {
	it("becomes a finding instead of staying in the JSON", () => {
		const { findings } = buildBehavioralFindings(frictionWith([casaMontelle]));
		const f = findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic");
		expect(f).toBeTruthy();
		expect(f!.title).toContain("4 endereços");
	});

	it("is pixel-measured and carries no modelled money", () => {
		const { findings } = buildBehavioralFindings(frictionWith([casaMontelle]));
		const f = findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")!;
		expect(f.origin).toBe("pixel");
		expect(f.claim_type).toBe("behavioral");
		// Zero means NOT MODELLED. A count may not be dressed as a loss.
		expect(f.impact.midpoint).toBe(0);
	});

	it("keeps every URL's own session count as evidence", () => {
		const { findings } = buildBehavioralFindings(frictionWith([casaMontelle]));
		const f = findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")!;
		// `evidence` is carried on the behavioural findings but is not on
		// the FindingProjection type, same as the existing friction
		// findings, which build the object with an `as unknown` cast.
		const ev = (f as unknown as { evidence: { path: string; sessions: number }[] }).evidence;
		expect(ev).toHaveLength(4);
		expect(ev.map((e) => e.sessions)).toEqual([25_581, 9_643, 2_151, 131]);
		// Surface is the biggest URL, and it is the lifecycle identity, so
		// it has to be deterministic.
		expect(f.surface).toBe("/products/vedaplus-kit-potes-hermeticos");
	});

	it("prescribes the canonical URL, naming how many to redirect", () => {
		const { findings } = buildBehavioralFindings(frictionWith([casaMontelle]));
		const f = findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")!;
		expect(f.root_cause).toContain("3");
		expect(f.root_cause).toContain(casaMontelle.label);
		expect(f.root_cause).not.toContain("—");
	});

	it("severity follows how much traffic is actually split", () => {
		const big = buildBehavioralFindings(frictionWith([casaMontelle]));
		expect(
			big.findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")!.severity,
		).toBe("high");

		const small = buildBehavioralFindings(
			frictionWith([
				{
					label: "Tábua de corte",
					totalSessions: 900,
					paths: [
						{ path: "/products/tabua", sessions: 600 },
						{ path: "/products/tabua-de-corte", sessions: 300 },
					],
				},
			]),
		);
		expect(
			small.findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")!.severity,
		).toBe("medium");
	});

	it("stays quiet below the session floor, and says why", () => {
		const { findings, rejections } = buildBehavioralFindings(
			frictionWith([
				{
					label: "Item raro",
					totalSessions: 40,
					paths: [
						{ path: "/products/a", sessions: 25 },
						{ path: "/products/b", sessions: 15 },
					],
				},
			]),
		);
		expect(findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")).toBeFalsy();
		expect(rejections.some((r) => r.reason.includes("duplicate entity"))).toBe(true);
	});

	it("ignores a single-URL entity", () => {
		const { findings } = buildBehavioralFindings(
			frictionWith([
				{
					label: "Só um",
					totalSessions: 50_000,
					paths: [{ path: "/products/only", sessions: 50_000 }],
				},
			]),
		);
		expect(findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")).toBeFalsy();
	});
});
