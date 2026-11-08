// ──────────────────────────────────────────────
// The v1 monthly plan is retired.
//
// The gate lives at the chokepoint rather than at each caller, and
// that is a correction rather than a preference. The first attempt
// gated the monthly cron and the enrichment passes, which looked like
// it had worked: semantic_enrichment and micro_copy went to zero and
// stayed there, 91% of the bill gone. But strategy_plan.* kept firing
// at ~8 calls an hour on day 8 of the month, from two doors inside the
// hourly audit cycle that the cron gate never covered.
//
// Gating one entry point and declaring the spend dead is precisely the
// pattern this codebase already learned to distrust: ship the
// collection without tracing the consumption. So the switch sits in
// the two functions every path has to go through, which also covers
// any caller nobody has found yet.
//
// Duplicated from src/libs/v1-plan-flag.ts on purpose: this package is
// imported by the audit runner, which does not resolve src/ paths.
//
// Reversible with V1_PLAN_ENABLED=true.
// ──────────────────────────────────────────────

export function isV1PlanEnabled(): boolean {
	return process.env.V1_PLAN_ENABLED === "true";
}
