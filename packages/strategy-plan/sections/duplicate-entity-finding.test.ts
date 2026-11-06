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

describe("measured findings arrive with text, not undefined", () => {
	// The findings with the highest confidence in the whole plan (80 to
	// 90, the only ones actually counted) reached the customer rendering
	// "causa: undefined efeito: undefined razao: undefined base=undefined
	// fonte=undefined". Three independent reviewers of the same document
	// caught it, including the least technical of them, who said it made
	// her doubt everything else. The heuristic half was well written.
	const WIN = { windowStart: "2026-10-06", windowEnd: "2026-11-05" };

	function input(extra: Record<string, unknown>) {
		return {
			friction: {
				basis: "pixel_measured",
				windowStart: WIN.windowStart,
				windowEnd: WIN.windowEnd,
				sampleSessions: 65_196,
				pages: [],
				duplicateEntities: [],
				...extra,
			},
			...WIN,
		} as unknown as Parameters<typeof buildBehavioralFindings>[0];
	}

	const REQUIRED = ["cause", "effect", "reasoning", "basis_type", "source_url"] as const;

	it("fills every text field on a friction finding", () => {
		const { findings } = buildBehavioralFindings(
			input({
				pages: [
					{
						path: "/c/NX-1",
						label: "Checkout",
						sessions: 7_167,
						sessionsWithFriction: 2_710,
						frictionRatePct: 37.8,
						deadClicks: 1_289,
						hesitationsNearCta: 2_984,
						inputAbandons: 2_382,
						formRetries: 88,
						backtracks: 32,
					},
				],
			}),
		);
		expect(findings.length).toBeGreaterThan(0);
		for (const f of findings) {
			const r = f as unknown as Record<string, unknown>;
			for (const field of REQUIRED) {
				expect(r[field], `${f.inference_key} has no ${field}`).toBeTruthy();
			}
			// 'measured' is the value the plan's language rules key off.
			expect(r.basis_type).toBe("measured");
			// The reasoning has to carry the count, or it is not a
			// measurement, it is an adjective.
			expect(String(r.reasoning)).toMatch(/\d/);
		}
	});

	it("fills every text field on the duplicate-entity finding", () => {
		const { findings } = buildBehavioralFindings(
			input({
				duplicateEntities: [
					{
						label: "Kit Potes Herméticos",
						totalSessions: 37_506,
						paths: [
							{ path: "/products/a", sessions: 25_581 },
							{ path: "/products/b", sessions: 9_643 },
						],
					},
				],
			}),
		);
		const f = findings.find((x) => x.inference_key === "duplicate_entity_splits_traffic")!;
		const r = f as unknown as Record<string, unknown>;
		for (const field of REQUIRED) {
			expect(r[field], `no ${field}`).toBeTruthy();
		}
		// Every URL and its count belong in the reasoning: that is the
		// whole evidence, and it is what made four reviewers stop.
		expect(String(r.reasoning)).toContain("/products/a");
		expect(String(r.reasoning)).toContain("25581");
		expect(String(r.effect)).not.toContain("—");
	});

	it("never asserts a cause for something it only counted", () => {
		const { findings } = buildBehavioralFindings(
			input({
				pages: [
					{
						path: "/c/NX-1",
						label: "Checkout",
						sessions: 7_167,
						sessionsWithFriction: 2_710,
						frictionRatePct: 37.8,
						deadClicks: 1_289,
						hesitationsNearCta: 0,
						inputAbandons: 0,
						formRetries: 0,
						backtracks: 0,
					},
				],
			}),
		);
		for (const f of findings) {
			const r = f as unknown as Record<string, unknown>;
			// A count says WHERE the buyer stopped, never WHY. The cause
			// text must describe the observation, not diagnose it.
			expect(String(r.cause)).not.toMatch(/porque|por causa|devido/i);
		}
	});
});

describe("measured magnitude, and where it must not go", () => {
	const WIN = { windowStart: "2026-10-06", windowEnd: "2026-11-05" };
	const REV = 198_000;
	const SESS = 65_190;

	function input(extra: Record<string, unknown>) {
		return {
			friction: {
				basis: "pixel_measured",
				windowStart: WIN.windowStart,
				windowEnd: WIN.windowEnd,
				sampleSessions: 55_015,
				pages: [],
				duplicateEntities: [],
				...extra,
			},
			monthlyRevenueBrl: REV,
			measuredSessions: SESS,
			...WIN,
		} as unknown as Parameters<typeof buildBehavioralFindings>[0];
	}

	const page = {
		path: "/c/NX-1",
		label: "Checkout",
		sessions: 7_167,
		sessionsWithFriction: 2_710,
		frictionRatePct: 37.8,
		deadClicks: 1_289,
		hesitationsNearCta: 2_984,
		inputAbandons: 2_382,
		formRetries: 88,
		backtracks: 32,
	};

	it("gives each friction KIND its own magnitude, not one shared number", () => {
		// First attempt used the page's friction sessions for every kind
		// and produced the identical R$ 7,887 five times on the live
		// cycle. 88 form retries cannot weigh the same as 2,382 abandoned
		// fields, and a reader spots that immediately.
		const { findings } = buildBehavioralFindings(input({ pages: [page] }));
		const byKey = new Map(
			findings.map((f) => [
				f.inference_key,
				(f as unknown as Record<string, unknown>).measured_magnitude as {
					revenueAtStakeBrl: number;
					affectedSessions: number;
				} | null,
			]),
		);
		const values = [...byKey.values()].filter(Boolean).map((m) => m!.revenueAtStakeBrl);
		expect(values.length).toBeGreaterThan(1);
		expect(new Set(values).size).toBeGreaterThan(1);

		// Bounded by both counts, because sessions-per-kind is unknown.
		for (const m of byKey.values()) {
			if (!m) continue;
			expect(m.affectedSessions).toBeLessThanOrEqual(page.sessionsWithFriction);
		}
		// Form retries are the rarest kind, so the smallest magnitude.
		const retry = byKey.get("measured_form_retry");
		if (retry) expect(retry.affectedSessions).toBe(88);
	});

	it("NEVER writes the magnitude into impact.midpoint", () => {
		// openLossExposure sums impactMidpoint. Putting a measured
		// magnitude there would mix it into a heuristic total and
		// double-count revenue that overlapping findings each describe.
		// It would also push the capped exposure straight to the 40%
		// ceiling, which is the failure this whole approach avoids.
		const { findings } = buildBehavioralFindings(
			input({
				pages: [page],
				duplicateEntities: [
					{
						label: "Kit",
						totalSessions: 37_590,
						paths: [
							{ path: "/products/a", sessions: 25_665 },
							{ path: "/products/b", sessions: 9_643 },
						],
					},
				],
			}),
		);
		expect(findings.length).toBeGreaterThan(1);
		for (const f of findings) {
			expect(f.impact.midpoint, `${f.inference_key} leaked into the exposure sum`).toBe(0);
			expect(f.impact.monthly_range.min).toBe(0);
			expect(f.impact.monthly_range.max).toBe(0);
		}
	});

	it("uses the affected population, never every session on the page", () => {
		const { findings } = buildBehavioralFindings(input({ pages: [page] }));
		for (const f of findings) {
			const m = (f as unknown as Record<string, unknown>).measured_magnitude as {
				affectedSessions: number;
			} | null;
			if (!m) continue;
			// 7,167 merely visited the page. Pricing against that would
			// charge the whole page for one kind of friction.
			expect(m.affectedSessions).toBeLessThan(page.sessions);
			expect(m.affectedSessions).toBeLessThanOrEqual(page.sessionsWithFriction);
		}
		// The lead kind on this fixture is dead clicks, 1,289 occurrences,
		// which is below the page's 2,710 friction sessions and is
		// therefore the binding bound.
		const dead = findings.find((f) => f.inference_key === "measured_dead_clicks");
		const m = (dead as unknown as Record<string, unknown>).measured_magnitude as {
			affectedSessions: number;
		};
		expect(m.affectedSessions).toBe(1_289);
	});

	it("omits the magnitude when revenue was never declared", () => {
		const { findings } = buildBehavioralFindings({
			...input({ pages: [page] }),
			monthlyRevenueBrl: null,
		} as unknown as Parameters<typeof buildBehavioralFindings>[0]);
		const f = findings[0] as unknown as Record<string, unknown>;
		// Null, not a fallback. A magnitude built on a constant is the
		// defect this replaces.
		expect(f.measured_magnitude).toBeNull();
	});
});
