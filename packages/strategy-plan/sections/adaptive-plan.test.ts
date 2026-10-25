import { describe, it, expect } from "vitest";
import {
	buildAdaptivePlan,
	classifyClaim,
	selectPriorities,
	type PlanFinding,
} from "./adaptive-plan";

function f(over: Partial<PlanFinding> = {}): PlanFinding {
	return {
		inferenceKey: "guarantee_invisible_at_decision",
		surface: "/cart",
		severity: "high",
		confidence: 42,
		status: "confirmed",
		cyclesSeen: 254,
		changeClass: "stable_risk",
		origin: null,
		claimType: null,
		impactMidpoint: 7500,
		impactMin: 3750,
		impactMax: 11250,
		title: "Sua garantia existe mas está escondida",
		reasoning: "Garantia visível ao lado do CTA aumenta conversão.",
		rootCause: "O momento do pagamento amplifica dúvida",
		sourceUrl: "https://casamontelle.com/cart",
		basisType: "heuristic",
		confidenceTier: "medium",
		...over,
	};
}

function pixel(over: Partial<PlanFinding> = {}): PlanFinding {
	return f({
		inferenceKey: "measured_dead_clicks",
		surface: "/c/NX-1",
		confidence: 90,
		origin: "pixel",
		claimType: "behavioral",
		impactMidpoint: 0,
		impactMin: 0,
		impactMax: 0,
		title: null,
		basisType: null,
		confidenceTier: null,
		cyclesSeen: 1,
		status: "created",
		changeClass: null,
		evidence: [{ count: 1656, sessions: 10546, friction_rate_pct: 37.5 }],
		...over,
	});
}

describe("claim classification", () => {
	it("never promotes a heuristic to a defect", () => {
		// Every crawler finding in production carries
		// basis_type='heuristic' with confidence 41-60. Calling any of
		// them a defect would be asserting a reproduction we never did.
		expect(classifyClaim(f())).toBe("inference");
		expect(classifyClaim(f({ severity: "critical", confidence: 60 }))).toBe("inference");
	});

	it("classifies a pixel finding as behavioural, not as a defect", () => {
		expect(classifyClaim(pixel())).toBe("behavioral");
		// Even with origin missing, the declared claim type wins.
		expect(classifyClaim(f({ claimType: "behavioral", origin: null }))).toBe("behavioral");
	});

	it("honours an explicit defect or anomaly when one is declared", () => {
		expect(classifyClaim(f({ claimType: "defect" }))).toBe("defect");
		expect(classifyClaim(f({ claimType: "anomaly" }))).toBe("anomaly");
	});
});

describe("money is labelled by provenance", () => {
	it("attaches an estimate only to an inference", () => {
		const p = buildAdaptivePlan({ findings: [f()], resolved: [] });
		expect(p.priorities[0].estimatedMonthlyLossBrl).toEqual({
			min: 3750,
			mid: 7500,
			max: 11250,
		});
	});

	it("shows no number at all on a measured observation", () => {
		// impact 0 means "not modelled". Printing R$ 0 would read as
		// "this costs nothing", which is a different and false claim.
		const p = buildAdaptivePlan({ findings: [pixel()], resolved: [] });
		expect(p.priorities[0].estimatedMonthlyLossBrl).toBeNull();
		expect(JSON.stringify(p.priorities[0])).not.toContain('"mid":0');
	});

	it("sums exposure from inferences only, and nulls it when there is none", () => {
		const both = buildAdaptivePlan({ findings: [f(), pixel()], resolved: [] });
		expect(both.executive.estimatedExposureBrl).toBe(7500);
		const onlyMeasured = buildAdaptivePlan({ findings: [pixel()], resolved: [] });
		// Null, not 0: zero would read as "nothing at stake".
		expect(onlyMeasured.executive.estimatedExposureBrl).toBeNull();
	});
});

describe("selection", () => {
	it("puts counted behaviour ahead of a heuristic of equal severity", () => {
		const p = buildAdaptivePlan({ findings: [f(), pixel()], resolved: [] });
		expect(p.priorities[0].claim).toBe("behavioral");
		expect(p.priorities[1].claim).toBe("inference");
	});

	it("drops resolved, positive and low-severity findings", () => {
		const kept = selectPriorities([
			f(),
			f({ inferenceKey: "a", status: "resolved" }),
			f({ inferenceKey: "b", severity: "none" }),
			f({ inferenceKey: "c", severity: "medium" }),
		]);
		expect(kept).toHaveLength(1);
		expect(kept[0].inferenceKey).toBe("guarantee_invisible_at_decision");
	});

	it("caps the list at five so the reader is not handed a backlog", () => {
		// Distinct surfaces, so the per-surface cap is not what limits
		// the list here — the point is the overall ceiling.
		const many = Array.from({ length: 12 }, (_, i) =>
			f({ inferenceKey: `k${i}`, surface: `/p${i}`, confidence: 60 - i }),
		);
		expect(selectPriorities(many)).toHaveLength(5);
	});

	it("never lets one page become the whole document", () => {
		// Casa Montelle's checkout carries five measured frictions, all
		// high severity. "Measured first" filled the entire list with one
		// URL and the reader got nothing about the other 14 findings.
		// Caught by the dry run against real data.
		const checkout = Array.from({ length: 5 }, (_, i) =>
			pixel({ inferenceKey: `m${i}`, surface: "/c/NX-1" }),
		);
		const others = Array.from({ length: 4 }, (_, i) =>
			f({ inferenceKey: `h${i}`, surface: `/p${i}` }),
		);
		const kept = selectPriorities([...checkout, ...others]);
		expect(kept).toHaveLength(5);
		expect(kept.filter((k) => k.surface === "/c/NX-1")).toHaveLength(2);
		// The measured page still leads.
		expect(kept[0].surface).toBe("/c/NX-1");
		// And the heuristics are no longer starved.
		expect(kept.filter((k) => k.surface !== "/c/NX-1")).toHaveLength(3);
	});

	it("keeps a medium-severity measured finding, which severity alone would drop", () => {
		// The point of the pixel path: a counted observation earns its
		// place on being counted, not on a severity label.
		const kept = selectPriorities([pixel({ severity: "medium" })]);
		expect(kept).toHaveLength(1);
	});
});

describe("an empty month is a valid plan", () => {
	it("says so instead of inventing a priority", () => {
		const p = buildAdaptivePlan({ findings: [], resolved: [] });
		expect(p.priorities).toHaveLength(0);
		expect(p.executive.priorityCount).toBe(0);
		expect(p.executive.estimatedExposureBrl).toBeNull();
		expect(p.executive.summary).toContain("Nada de severidade alta");
	});

	it("still reports what was resolved", () => {
		const p = buildAdaptivePlan({
			findings: [],
			resolved: [f({ title: "Checkout sem HTTPS", status: "resolved" })],
		});
		expect(p.evolution.resolvedCount).toBe(1);
		expect(p.evolution.resolved[0].headline).toBe("Checkout sem HTTPS");
	});
});

describe("evolution", () => {
	it("separates new from persistent from returned", () => {
		const p = buildAdaptivePlan({
			findings: [
				f({ inferenceKey: "new1", surface: "/a", cyclesSeen: 1, status: "created" }),
				f({ inferenceKey: "persist1", surface: "/b", cyclesSeen: 254, status: "confirmed" }),
				f({ inferenceKey: "back1", surface: "/c", status: "regressed", cyclesSeen: 1 }),
			],
			resolved: [],
		});
		const byKind = p.priorities.map((x) => x.lifecycle);
		expect(byKind).toContain("new");
		expect(byKind).toContain("persistent");
		expect(byKind).toContain("returned");
		expect(p.evolution.persistentCount).toBe(1);
	});
});

describe("part C", () => {
	it("gives a measured finding a pixel-verifiable check", () => {
		const p = buildAdaptivePlan({ findings: [pixel()], resolved: [] });
		expect(p.actions[0].howToVerify).toContain("pixel");
		expect(p.actions[0].howToVerify).toContain("/c/NX-1");
	});

	it("gives an inference a check against the page itself", () => {
		const p = buildAdaptivePlan({ findings: [f()], resolved: [] });
		expect(p.actions[0].howToVerify).toContain("casamontelle.com/cart");
	});

	it("emits one action per priority, in the same order", () => {
		const p = buildAdaptivePlan({ findings: [f(), pixel()], resolved: [] });
		expect(p.actions.map((a) => a.rank)).toEqual([1, 2]);
	});
});
