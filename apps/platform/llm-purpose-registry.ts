// ──────────────────────────────────────────────
// LLM Purpose Registry — dead-spend detector ground truth.
//
// Every `purpose` string passed to callModel should be listed here
// with its downstream consumer path(s). Used by
// scripts/audit-llm-purposes.ts to flag:
//
//   - Purposes seen in TokenCostLedger that aren't in the registry
//     (= someone added a new LLM call without registering its
//     consumer; could be dead spend)
//   - Purposes in the registry whose `consumerPaths` files don't
//     reference the produced outputs (= write-only dead spend)
//   - Purposes marked status='deprecated' but still firing
//     (= incomplete cleanup; the producer is still spending money
//     even after the consumer was removed)
//
// MAINTENANCE: when you add a new callModel site:
//   1. Add an entry here with consumerPaths + outputs
//   2. Run `npx tsx scripts/audit-llm-purposes.ts` to verify
//   3. status='active' once both producer and consumer ship
//
// When you delete a downstream consumer:
//   1. Set status='deprecated' here BEFORE deleting the producer
//   2. Run the audit — it will flag the producer as orphan
//   3. Remove the producer call, then remove the registry entry
//
// This keeps producers and consumers from drifting silently apart
// (the exact pattern that produced the 2026-06-24 perception_classifier
// dead-spend finding).
// ──────────────────────────────────────────────

export type PurposeStatus = "active" | "deprecated" | "gated";

export interface PurposeRegistryEntry {
	purpose: string;
	/** What this LLM call produces in plain words. */
	produces: string;
	/** Files that read the output of this purpose (grep targets). */
	consumerPaths: string[];
	/** Field names or signal keys the consumer reads from this LLM output. */
	outputs: string[];
	/** Current state:
	 *   - active: producer + consumer both wired, money well spent.
	 *   - deprecated: producer still firing, consumer gone or never wired.
	 *     Audit will flag any deprecated purpose with recent ledger
	 *     entries.
	 *   - gated: producer only fires when an env flag is on. Expect
	 *     zero/low ledger activity. */
	status: PurposeStatus;
	notes?: string;
}

export const PURPOSE_REGISTRY: PurposeRegistryEntry[] = [
	// ── Semantic enrichment (Wave 3.10 copy analysis) ──
	{
		purpose: "semantic_enrichment.homepage_hero",
		produces: "Hero value-prop + headline-formula + CTA-specificity scores for the homepage / landing pages.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["value_prop_score", "headline_formula_match", "cta_specificity_score"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.above_fold_density",
		produces: "Above-fold clutter score (pop-ups / competing CTAs / autoplay) per commercial page.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["density_score", "competing_ctas"],
		status: "gated",
		notes: "2026-06-24: switched from Haiku LLM to DOM heuristic. Schema preserved; producer no longer LLM-driven. Ledger entries for this purpose should drop to zero after the change ships.",
	},
	{
		purpose: "semantic_enrichment.social_proof_placement",
		produces: "Social proof presence + placement score on commercial pages.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["placement_score", "social_proof_count"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.objection_handling",
		produces: "Coverage of buyer objections on pricing/product/checkout pages.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["objection_coverage_score", "addressed_objections"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.urgency_scarcity",
		produces: "Detected urgency/scarcity claims + believability score.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["urgency_score", "manipulative_claims"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.onboarding_copy",
		produces: "Onboarding flow copy clarity + activation friction.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["onboarding_clarity_score", "activation_blockers"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.error_page_recovery",
		produces: "Error page recovery quality (404/500 helpfulness).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["recovery_score", "missing_recovery_elements"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.navigation_clarity",
		produces: "Navigation labels clarity / jargon detection across all pages.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["clarity_score", "jargon_labels"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.policy_quality",
		produces: "Privacy/terms/refund policy completeness + readability.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["policy_completeness", "policy_clarity_score"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.checkout_trust",
		produces: "Trust signals presence in checkout flow.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["trust_signal_count", "missing_trust_elements"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.cta_clarity",
		produces: "CTA clarity / verb-noun specificity score.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["cta_clarity_score", "vague_ctas"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.product_page_quality",
		produces: "Product page quality (benefits / features / proof).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["product_page_score", "missing_elements"],
		status: "active",
	},
	{
		purpose: "semantic_enrichment.pricing_page_framing",
		produces: "Pricing-page framing (anchoring, tier framing, charm).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["framing_score", "missing_anchoring"],
		status: "active",
	},

	// ── Other enrichment surfaces ──
	{
		purpose: "copy_seo_tension",
		produces: "Conflict score between SEO-targeted copy and conversion-targeted copy.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["tension_score", "conflicting_pages"],
		status: "active",
	},
	{
		purpose: "micro_copy",
		produces: "Friction in micro-copy (form labels, errors, button copy).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["friction_score", "friction_locations"],
		status: "active",
	},
	{
		purpose: "pricing_psychology",
		produces: "Deeper pricing psychology audit (charm pricing, anchoring, GBB).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["psychology_score", "missing_psychology_elements"],
		status: "active",
	},
	{
		purpose: "localization_quality",
		produces: "i18n quality (machine-translation tells, locale-specific tone).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["localization_score", "mt_artifacts"],
		status: "active",
	},
	{
		purpose: "content_staleness",
		produces: "Detected stale content (outdated copyright, year mentions, dead links).",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["staleness_score", "stale_elements"],
		status: "active",
	},
	{
		purpose: "page_purpose_validation",
		produces: "Confirms inferred page type against actual content.",
		consumerPaths: ["packages/classification/page-classifier.ts"],
		outputs: ["confirmed_page_type"],
		status: "active",
	},
	{
		purpose: "ad_message_match",
		produces: "Ad-to-landing match score for paid traffic.",
		consumerPaths: ["packages/signals/engine.ts"],
		outputs: ["match_score", "drift_indicators"],
		status: "active",
	},

	// ── Framework lens (cold cycle) ──
	{
		purpose: "framework_lens.cold_cycle",
		produces: "Per-framework copy audit (CommandersIntent, JTBD, AIDA, etc.) per page slot. LLM output persists in CopyFrameworkAudit table; consumer reads the table, not the LLM response shape.",
		consumerPaths: [
			"packages/strategy-plan/sections/copy-lens.ts",
			"src/components/strategy/sections/CopyLens.tsx",
			"src/app/api/library/strategy/[month]/copy-lens-full",
		],
		outputs: ["copyFrameworkAudit", "CopyFrameworkAudit", "framework_id"],
		status: "active",
	},

	// ── Domain fingerprint (quarterly) ──
	{
		purpose: "domain_fingerprint",
		produces: "Industry classification + locale + detected platforms snapshot for the env.",
		consumerPaths: ["apps/mcp/llm/pipeline.ts", "src/app/api/chat/route.ts"],
		outputs: ["industry", "detected_platforms", "perceived_vertical"],
		status: "active",
	},

	// ── Strategy plan sections (monthly, generated in run-cycle) ──
	{
		purpose: "strategy_plan.monthly_thesis",
		produces: "Editorial 1-paragraph Tese for the month.",
		consumerPaths: ["src/components/strategy/sections/MonthlyThesis.tsx"],
		outputs: ["thesis_text"],
		status: "active",
	},
	{
		purpose: "strategy_plan.narrative_what_happened",
		produces: "Editorial narrative summarizing the cycle's discoveries.",
		consumerPaths: ["src/components/strategy/sections/"],
		outputs: ["narrative_text"],
		status: "active",
	},
	{
		purpose: "strategy_plan.next_step_reasoning",
		produces: "Reasoning paragraph for each Próximo passo (why this, what to expect).",
		consumerPaths: ["src/components/strategy/sections/NextSteps.tsx"],
		outputs: ["reasoning"],
		status: "active",
	},
	{
		purpose: "strategy_plan.value_preview_narrative",
		produces: "Pre-plan value preview narrative for prospects. Persists as MonthlyStrategyPlan.valuePreviewNarrative column.",
		consumerPaths: [
			"src/app/api/library/strategy/[month]/route.ts",
			"src/components/strategy/types.ts",
			"src/components/strategy/mock-data.ts",
		],
		outputs: ["valuePreviewNarrative"],
		status: "active",
	},

	// ── Chat pipeline (MCP) ──
	{
		purpose: "input_guard",
		produces: "Prompt-injection / off-topic detection on user chat input.",
		consumerPaths: ["apps/mcp/llm/pipeline.ts"],
		outputs: ["safe", "category"],
		status: "active",
	},
	{
		purpose: "core_chat",
		produces: "Main chat response with tool use.",
		consumerPaths: ["apps/mcp/llm/pipeline.ts", "src/app/api/chat/route.ts"],
		outputs: ["response_text", "tool_calls"],
		status: "active",
	},
	{
		purpose: "output_classifier",
		produces: "Output safety classification on chat response.",
		consumerPaths: ["apps/mcp/llm/pipeline.ts"],
		outputs: ["safe", "issues"],
		status: "active",
	},
	{
		purpose: "context_summary",
		produces: "Conversation context summarization for long chats.",
		consumerPaths: ["apps/mcp/llm/pipeline.ts"],
		outputs: ["summary"],
		status: "active",
	},

	// ── Journey narration ──
	{
		purpose: "narrative_synthesis",
		produces: "3-sentence buyer-journey narrative for funnel abandonment view.",
		consumerPaths: ["src/lib/journey-narrator.ts", "src/app/api/library/strategy/[month]/journeys/route.ts"],
		outputs: ["narrative"],
		status: "active",
	},

	// ── Gated / dead-spend candidates ──
	{
		purpose: "business_perception",
		produces: "Perceived business vertical + per-page purpose classification.",
		consumerPaths: ["(none — PV.3 not wired)"],
		outputs: ["perceived_vertical", "surface_purposes"],
		status: "gated",
		notes: "2026-06-24: gated behind VESTIGIO_PERCEPTION_PV3_WIRED='true'. No consumer until PV.3 ships. Audit script should see zero/low entries once gate takes effect.",
	},
];

/** Look up a purpose entry. Returns null if the purpose isn't
 *  registered — the audit script treats that as a flag. */
export function findPurposeEntry(purpose: string): PurposeRegistryEntry | null {
	return PURPOSE_REGISTRY.find((p) => p.purpose === purpose) || null;
}
