// ──────────────────────────────────────────────
// The v1 monthly plan, and everything that exists only to feed it.
//
// The product is the Extrato de Tráfego Pago now. The 55.000-character
// monthly plan is retired, and so is the LLM chain underneath it: its
// enrichment passes produce evidence that nothing outside the plan
// reads.
//
// This is a flag rather than a delete, deliberately. Deleting the
// chain means touching the signal engine, the inference packs, the
// workspace engine and the plan sections at once, and none of that is
// needed to stop the money. The flag stops the money today and the
// deletion can be a separate, unhurried decision.
//
// What it was actually costing, measured on the production ledger
// rather than guessed, because the guess was wrong by a factor of
// twenty. The monthly plan's own generation is US$ 6.47 across its
// entire history. The chain feeding it is not:
//
//   last 60 days          US$ 112.68
//   semantic_enrichment    US$ 85.42   76%
//   micro_copy             US$ 17.25   15%
//   strategy_plan.*        US$  3.39    3%
//
// Still running at ~US$ 0.52/day when this shipped, all of it for a
// document nobody will open again.
//
// Default OFF. Set V1_PLAN_ENABLED=true to bring it back, which is
// what makes this reversible: nothing is deleted, the passes still
// exist, and one variable restores the old behaviour.
// ──────────────────────────────────────────────

export function isV1PlanEnabled(): boolean {
	return process.env.V1_PLAN_ENABLED === "true";
}

/**
 * Should a pass that spends LLM money on the v1 chain run?
 *
 * Named for the cost rather than the feature, because the reason to
 * skip is the bill. A pass that costs nothing is not gated by this
 * even when only the plan reads it: the crawl, the DNS checks and the
 * behavioural aggregation stay on, since the pixel and the traffic
 * statement sit on top of them.
 */
export function shouldSpendOnV1Llm(): boolean {
	return isV1PlanEnabled();
}
