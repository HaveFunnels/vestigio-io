import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────
// The gate that stopped the v1 bill, pinned by name.
//
// The enrichment runner skips three passes by string name when
// V1_PLAN_ENABLED is off. That is a cheap gate with one silent failure
// mode: rename a pass and the set stops matching, every pass runs
// again, and the only symptom is the invoice three weeks later. There
// is no error, no log and no broken screen.
//
// It was worth ~US$ 112 over sixty days when it was measured, 76% of
// it in semantic enrichment alone, for evidence that only the retired
// monthly plan ever read.
// ──────────────────────────────────────────────

const ROOT = process.cwd();

function read(p: string): string {
	return readFileSync(join(ROOT, p), "utf8");
}

/** The names the runner gates on. */
function gatedNames(): string[] {
	const src = read("workers/ingestion/enrichment/runner.ts");
	const block = src.match(/const V1_LLM_PASSES = new Set\(\[([\s\S]*?)\]\)/);
	if (!block) throw new Error("V1_LLM_PASSES is gone from the enrichment runner");
	return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("the v1 LLM gate still matches real passes", () => {
	it("gates exactly the passes that spend on the retired chain", () => {
		expect(gatedNames().sort()).toEqual([
			"perception_classifier",
			"semantic_enrichment",
			"surface_inventory",
		]);
	});

	it("every gated name is a pass that actually exists", () => {
		// The silent failure: a rename makes the gate a no-op and the
		// spend resumes with nothing to see.
		const files: Record<string, string> = {
			semantic_enrichment: "workers/ingestion/enrichment/semantic-enrichment.ts",
			perception_classifier: "workers/ingestion/enrichment/perception-classifier.ts",
			surface_inventory: "workers/ingestion/enrichment/surface-inventory.ts",
		};
		for (const name of gatedNames()) {
			const path = files[name];
			expect(path, `no file mapped for gated pass "${name}"`).toBeTruthy();
			expect(read(path)).toContain(`PASS_NAME = "${name}"`);
		}
	});

	it("defaults to off, so the bill does not resume by omission", () => {
		const flag = read("src/libs/v1-plan-flag.ts");
		// Opt-in by equality against "true": any other value, including
		// unset, leaves it off.
		expect(flag).toMatch(/process\.env\.V1_PLAN_ENABLED === "true"/);
	});

	it("the monthly plan cron returns before doing any work", () => {
		const src = read("src/instrumentation-node.ts");
		const i = src.indexOf("const runStrategyPlanMonthly");
		const j = src.indexOf("withLeadership", i);
		// The guard has to sit before the leadership lease, not inside
		// the body: taking the lease is already a database round trip
		// per tick for work that will not happen.
		expect(src.slice(i, j)).toContain("if (!isV1PlanEnabled()) return;");
	});

	it("gates the plan at the chokepoint, not only at the cron", () => {
		// The correction that mattered. Gating the monthly cron and the
		// enrichment passes looked like it had worked: semantic
		// enrichment and micro_copy went to zero and stayed there, 91%
		// of the bill. But strategy_plan.* kept firing at ~8 calls an
		// hour on day 8 of the month, from two doors inside the hourly
		// audit cycle that the cron gate never covered. The switch has
		// to sit where every path converges.
		const gen = read("packages/strategy-plan/generator.ts");
		expect(gen).toContain("if (!isV1PlanEnabled()) {");
		expect(gen).toContain("V1PlanRetiredError");

		const ren = read("packages/strategy-plan/renarrate.ts");
		expect(ren).toMatch(/if \(!isV1PlanEnabled\(\)\) return \{ fired: false/);
	});

	it("the package carries its own flag, since it cannot import from src", () => {
		const flag = read("packages/strategy-plan/v1-retired.ts");
		expect(flag).toMatch(/process\.env\.V1_PLAN_ENABLED === "true"/);
	});

	it("the audit cycle really does route through those two functions", () => {
		// If a third door opens, this is the test that should start
		// looking wrong.
		const cycle = read("apps/audit-runner/run-cycle.ts");
		expect(cycle).toContain("generateAndPersistPlan");
		expect(cycle).toContain("maybeTriggerRenarrative");
	});
});
