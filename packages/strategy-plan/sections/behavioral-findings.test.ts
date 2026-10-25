import { describe, it, expect, afterEach } from "vitest";
import {
	buildBehavioralFindings,
	areBehavioralFindingsEnabled,
	MIN_SESSIONS_FOR_FINDING,
	MIN_AFFECTED_SESSIONS,
	MIN_FRICTION_RATE_PCT,
	MIN_COUNT_PER_KIND,
} from "./behavioral-findings";
import type { FrictionPageStats } from "./measured-friction";

function page(over: Partial<FrictionPageStats> = {}): FrictionPageStats {
	return {
		path: "/c/NX-1",
		label: "Checkout",
		sessions: 10_546,
		deadClicks: 1_656,
		hesitationsNearCta: 4_895,
		inputAbandons: 3_109,
		backtracks: 0,
		formRetries: 108,
		sessionsWithFriction: 4_052,
		frictionRatePct: 37.5,
		...over,
	};
}

function build(pages: FrictionPageStats[]) {
	return buildBehavioralFindings({
		friction: {
			basis: "pixel_measured",
			windowStart: "2026-09-16",
			windowEnd: "2026-10-15",
			sampleSessions: 77_804,
			pages,
		},
		windowStart: "2026-09-16",
		windowEnd: "2026-10-15",
	});
}

const original = process.env.BEHAVIORAL_FINDINGS_ENABLED;
afterEach(() => {
	if (original === undefined) delete process.env.BEHAVIORAL_FINDINGS_ENABLED;
	else process.env.BEHAVIORAL_FINDINGS_ENABLED = original;
});

describe("emission flag", () => {
	it("is off unless explicitly enabled", () => {
		// hero-metrics aggregates Finding rows, so emitting these would
		// silently move the numbers in the existing plan. Phase 1 must
		// be provably inert.
		delete process.env.BEHAVIORAL_FINDINGS_ENABLED;
		expect(areBehavioralFindingsEnabled()).toBe(false);
		process.env.BEHAVIORAL_FINDINGS_ENABLED = "1";
		expect(areBehavioralFindingsEnabled()).toBe(false);
		process.env.BEHAVIORAL_FINDINGS_ENABLED = "true";
		expect(areBehavioralFindingsEnabled()).toBe(true);
	});
});

describe("what a measurement is allowed to claim", () => {
	it("never calls a measurement a defect, and never goes critical", () => {
		// Casa Montelle loses 94.4% between product and cart and nothing
		// in the system can say why. Promoting a rate to a critical
		// defect would be inventing a diagnosis.
		const { findings } = build([page()]);
		expect(findings.length).toBeGreaterThan(0);
		for (const f of findings) {
			expect((f as unknown as { claim_type: string }).claim_type).toBe("behavioral");
			expect((f as unknown as { origin: string }).origin).toBe("pixel");
			expect(f.severity).not.toBe("critical");
		}
	});

	it("attaches no invented money", () => {
		const { findings } = build([page()]);
		for (const f of findings) {
			expect(f.impact.midpoint).toBe(0);
			expect(f.impact.monthly_range.min).toBe(0);
			expect(f.impact.monthly_range.max).toBe(0);
		}
	});

	it("carries the sample the percentage came from", () => {
		const { findings } = build([page()]);
		const ev = (findings[0] as unknown as { evidence: Record<string, unknown>[] }).evidence[0];
		expect(ev.path).toBe("/c/NX-1");
		expect(ev.sessions).toBe(10_546);
		expect(ev.sessions_with_friction).toBe(4_052);
		expect(ev.friction_rate_pct).toBe(37.5);
		expect(ev.window_start).toBe("2026-09-16");
	});
});

describe("sufficiency", () => {
	it("rejects a page below the session floor", () => {
		const { findings, rejections } = build([page({ sessions: 150 })]);
		expect(findings).toHaveLength(0);
		expect(rejections[0].reason).toContain(String(MIN_SESSIONS_FOR_FINDING));
	});

	it("rejects when too few distinct sessions are affected", () => {
		// One rage-clicking visitor must not be able to create a
		// finding on their own.
		const { findings, rejections } = build([
			page({ sessionsWithFriction: 10, frictionRatePct: 40 }),
		]);
		expect(findings).toHaveLength(0);
		expect(rejections[0].reason).toContain(String(MIN_AFFECTED_SESSIONS));
	});

	it("rejects a real but unremarkable rate", () => {
		const { findings, rejections } = build([
			page({ frictionRatePct: 4.3, sessionsWithFriction: 1_375, sessions: 32_307 }),
		]);
		expect(findings).toHaveLength(0);
		expect(rejections[0].reason).toContain(String(MIN_FRICTION_RATE_PCT));
	});
});

describe("per-kind sufficiency", () => {
	it("drops a kind whose own count is trivial, even on a qualifying page", () => {
		// Found by dry run against real data: a page with 4,179 sessions
		// cleared every page-level floor and emitted "1 input
		// abandoned". A finding with a count of 1 is noise wearing a
		// lifecycle.
		const { findings, rejections } = build([
			page({ inputAbandons: 1, formRetries: 5, backtracks: 0 }),
		]);
		const keys = findings.map((f) => f.inference_key);
		expect(keys).not.toContain("measured_input_abandon");
		expect(keys).not.toContain("measured_form_retry");
		// The substantial kinds on the same page still come through.
		expect(keys).toContain("measured_dead_clicks");
		expect(rejections.some((r) => r.reason.includes(String(MIN_COUNT_PER_KIND)))).toBe(true);
	});
});

describe("severity and confidence", () => {
	it("needs both a big population and a high rate to reach high", () => {
		const big = build([page({ frictionRatePct: 37.5, sessionsWithFriction: 4_052 })]);
		expect(big.findings[0].severity).toBe("high");
		// Same scary percentage, small population.
		const small = build([
			page({ sessions: 400, frictionRatePct: 37.5, sessionsWithFriction: 150 }),
		]);
		expect(small.findings[0].severity).toBe("medium");
	});

	it("derives confidence from sample size, not from how bad it looks", () => {
		const huge = build([page({ sessions: 30_000 })]);
		const small = build([page({ sessions: 250, sessionsWithFriction: 100 })]);
		expect(huge.findings[0].confidence).toBeGreaterThan(small.findings[0].confidence);
	});
});

describe("deduplication", () => {
	it("emits one finding per friction kind, never two with the same key", () => {
		// Finding is unique on (cycleId, inferenceKey) — surface is NOT
		// in the constraint. Emitting per (kind, page) collapsed three
		// pages into one row whose surface became the comma-joined
		// "/c/NX-…, /products/vedaplus-kit, /", corrupting the lifecycle
		// identity. Found by running it against production.
		const { findings } = build([
			page({ path: "/c/NX-1", backtracks: 0 }),
			page({ path: "/", sessions: 2338, deadClicks: 44, hesitationsNearCta: 384,
				inputAbandons: 7, formRetries: 0, backtracks: 0,
				sessionsWithFriction: 304, frictionRatePct: 13 }),
		]);
		const keys = findings.map((f) => f.inference_key);
		expect(new Set(keys).size, "duplicate inference keys").toBe(keys.length);
		for (const f of findings) {
			expect(String(f.surface)).not.toContain(",");
		}
	});

	it("points surface at the page carrying the most of that friction", () => {
		const { findings } = build([
			page({ path: "/small", sessions: 2338, deadClicks: 44, hesitationsNearCta: 0,
				inputAbandons: 0, formRetries: 0, backtracks: 0,
				sessionsWithFriction: 304, frictionRatePct: 13 }),
			page({ path: "/big", deadClicks: 1656, hesitationsNearCta: 0,
				inputAbandons: 0, formRetries: 0, backtracks: 0 }),
		]);
		const dead = findings.find((f) => f.inference_key === "measured_dead_clicks")!;
		expect(dead.surface).toBe("/big");
	});

	it("keeps every contributing page's numbers in the evidence", () => {
		// Grouping by kind must not lose the per-page detail.
		const { findings } = build([
			page({ path: "/a", deadClicks: 100, hesitationsNearCta: 0, inputAbandons: 0,
				formRetries: 0, backtracks: 0 }),
			page({ path: "/b", deadClicks: 50, hesitationsNearCta: 0, inputAbandons: 0,
				formRetries: 0, backtracks: 0 }),
		]);
		const dead = findings.find((f) => f.inference_key === "measured_dead_clicks")!;
		const ev = (dead as unknown as { evidence: Record<string, unknown>[] }).evidence;
		expect(ev).toHaveLength(2);
		expect(ev.map((e) => e.path).sort()).toEqual(["/a", "/b"]);
		expect(ev.map((e) => e.count)).toEqual([100, 50]);
	});

	it("keeps the lifecycle identity free of counts and page labels", () => {
		// Identity is (environmentId, inferenceKey, surface). A key that
		// encoded the count would never match across cycles, so nothing
		// could ever be 'persistent' or 'resolved'.
		const { findings } = build([page()]);
		for (const f of findings) {
			expect(f.inference_key).toMatch(/^measured_[a-z_]+$/);
			expect(f.inference_key).not.toMatch(/\d/);
		}
	});
});
