import { SurfaceKind } from "../domain";

// ──────────────────────────────────────────────
// Inference accepted-surfaces manifest — Wave 22.5 Tier 2
//
// Each inference declares which SurfaceKinds it accepts. The engine
// gate (see filterInferencesByAcceptedSurface) drops inferences whose
// stamped surface_kind doesn't match the declared accepted set, so a
// SaaS-app-only inference can never fire on a public-marketing page
// and vice versa.
//
// Default policy: an inference NOT listed here accepts every surface.
// This keeps the migration window forgiving — only the inferences
// where the surface gate adds real value need to be declared. Tier 3
// migrates this list to live alongside each inference's definition
// (so the file we don't need to keep two sources in sync).
//
// Authoring rules:
//   - Authenticated-only: list ONLY ['authenticated'] for inferences
//     that are SaaS-product-experience problems. They fire when a
//     paying user hits the app, not when a visitor hits the marketing
//     page. Adding to this list = "don't fire this on /pricing."
//   - Public-only: list ONLY ['public'] for inferences that make
//     sense for visitors but not paid users (refund policy presence,
//     checkout trust signals, public-page CTA hygiene).
//   - Mixed-only: list ['mixed'] for compound inferences that NEED
//     both surfaces (landing_app_mismatch — comparing the landing
//     promise vs the in-app reality).
//   - Multi: list multiple kinds when the inference is broadly
//     applicable. E.g. ['public', 'authenticated'] for a finding
//     that fires on either surface but never on cross-surface
//     evidence.
//   - Mixed-compatible: when 'public' or 'authenticated' is in the
//     list, the gate ALSO accepts 'mixed' for that inference, because
//     a Mixed inference is an aggregation of surfaces and would be
//     unfair to drop. The acceptance check uses isSurfaceAccepted()
//     below.
// ──────────────────────────────────────────────

export const INFERENCE_ACCEPTED_SURFACES: Record<string, ReadonlyArray<SurfaceKind>> = {
	// ── SaaS growth readiness pack ──
	// These inferences are about the post-signup product experience.
	// extractSaasSignals only consumes Authenticated* evidence by
	// construction, so the signal-level surface is already
	// Authenticated. The gate here makes the contract explicit and
	// prevents future signal extractors from accidentally producing
	// these inferences from non-auth evidence.
	activation_blocked: [SurfaceKind.Authenticated],
	activation_friction_high: [SurfaceKind.Authenticated],
	unclear_next_step: [SurfaceKind.Authenticated],
	empty_state_without_guidance: [SurfaceKind.Authenticated],
	navigation_overcomplex: [SurfaceKind.Authenticated],
	feature_discovery_poor: [SurfaceKind.Authenticated],
	upgrade_invisible: [SurfaceKind.Authenticated],
	upgrade_timing_wrong: [SurfaceKind.Authenticated],
	no_expansion_path: [SurfaceKind.Authenticated],
	onboarding_no_quick_win: [SurfaceKind.Authenticated],
	saas_activation_gap_heuristic: [SurfaceKind.Authenticated],

	// ── funnel_journey pack — structural / flow problems IN-APP ──
	// These inference rules in funnel-moment-inference.ts filter to
	// `getAppEvidence` (URL containing /app, /dashboard, /onboarding).
	// Declaring them authenticated-only here makes the gate enforce it
	// at the inference layer, so a future refactor that drops the
	// in-extractor filter can't silently start producing these
	// findings from public pages.
	first_value_path_unclear: [SurfaceKind.Authenticated],
	support_response_expectation_gap: [SurfaceKind.Authenticated],
	billing_transparency_absent: [SurfaceKind.Authenticated],
	upgrade_value_gap: [SurfaceKind.Authenticated],
	referral_path_nonexistent: [SurfaceKind.Authenticated],
	success_story_feedback_loop_broken: [SurfaceKind.Authenticated],
	mobile_journey_friction_compound: [SurfaceKind.Authenticated],

	// ── Cross-surface compound inferences ──
	// landing_app_mismatch is THE canonical example: it compares the
	// landing-page promise (Public) vs the post-signup product reality
	// (Authenticated). It NEEDS both sides; if it fires from a
	// single-surface signal set, that's a bug. Mixed-only here.
	landing_app_mismatch: [SurfaceKind.Mixed],
	subscriber_churn_elevated: [SurfaceKind.Authenticated],

	// ── Public-surface-only conversion plumbing ──
	// Checkout trust + refund policy + chargeback-defenses fire from
	// the public-facing checkout. They aren't meaningful inside the
	// authenticated app (paid users don't hit refund policy or
	// public-checkout copy). Restricting them to Public keeps the
	// app-experience workspace clean.
	trust_boundary_crossed: [SurfaceKind.Public],
	policy_gap: [SurfaceKind.Public],
	checkout_integrity: [SurfaceKind.Public],
	revenue_path_fragile: [SurfaceKind.Public],
	conversion_flow_fragmented: [SurfaceKind.Public],
	friction_on_critical_path: [SurfaceKind.Public],
	revenue_leakage: [SurfaceKind.Public],
	trust_break_in_checkout: [SurfaceKind.Public],
	unclear_conversion_intent: [SurfaceKind.Public],
	refund_policy_gap: [SurfaceKind.Public],
	support_unreachable: [SurfaceKind.Public],
	expectation_misalignment: [SurfaceKind.Public],
	dispute_risk_elevated: [SurfaceKind.Public],
	post_purchase_confirmation_absent: [SurfaceKind.Public],
	post_purchase_proof_too_weak: [SurfaceKind.Public],

	// ── Funnel-journey structural inferences on the PUBLIC funnel ──
	// These fire from the public-checkout / cart / landing journey,
	// NOT from authenticated pages. They're funnel_journey pack but
	// surface-wise they belong to Public.
	navigation_dead_ends: [SurfaceKind.Public],
	page_depth_before_conversion: [SurfaceKind.Public],
	checkout_identity_break: [SurfaceKind.Public],
	payment_options_invisible: [SurfaceKind.Public],

	// ── Copy / first-impression inferences ──
	// All public-surface copy quality and first-impression findings
	// fire on the marketing site. The app's micro-copy has different
	// rules (matched by separate inference families). Public-only.
	value_proposition_buried: [SurfaceKind.Public],
	social_proof_ineffective: [SurfaceKind.Public],
	social_proof_generic: [SurfaceKind.Public],
	cta_competing_or_unclear: [SurfaceKind.Public],
	cta_clarity_weak_on_commercial: [SurfaceKind.Public],
	trust_copy_absent_at_decision: [SurfaceKind.Public],
	checkout_trust_language_absent: [SurfaceKind.Public],
	objection_unaddressed: [SurfaceKind.Public],
	urgency_dark_pattern: [SurfaceKind.Public],
	urgency_mechanics_absent: [SurfaceKind.Public],
	copy_funnel_misalignment: [SurfaceKind.Public],
	copy_cross_page_inconsistent: [SurfaceKind.Public],
	product_page_copy_generic: [SurfaceKind.Public],
	pricing_page_framing_unclear: [SurfaceKind.Public],
	pricing_without_context: [SurfaceKind.Public],
	guarantee_invisible_at_decision: [SurfaceKind.Public],
	navigation_confusing: [SurfaceKind.Public],
	above_fold_cluttered: [SurfaceKind.Public],
	localization_persuasion_lost: [SurfaceKind.Public],
	seo_conversion_conflict: [SurfaceKind.Public],
	copy_stale_references: [SurfaceKind.Public],
	hero_outcome_absent: [SurfaceKind.Public],
	cognitive_load_first_screen: [SurfaceKind.Public],
	primary_cta_delayed: [SurfaceKind.Public],
	specificity_deficit: [SurfaceKind.Public],
	proof_of_work_missing: [SurfaceKind.Public],
	feature_benefit_disconnect: [SurfaceKind.Public],
	comparison_absent: [SurfaceKind.Public],
	objection_echo_chamber: [SurfaceKind.Public],
	social_channels_decorative: [SurfaceKind.Public],
};

/**
 * Decide whether an inference's stamped surface_kind is acceptable
 * given its declared accepted_surfaces.
 *
 * Special-case: a Mixed inference is ALWAYS accepted when the
 * inference's declared set includes Public OR Authenticated, because
 * Mixed is the aggregation of multiple surfaces and dropping it would
 * silently lose cross-surface findings. Inferences that genuinely
 * MUST be Mixed (landing_app_mismatch) declare exactly ['mixed'] and
 * the gate enforces that.
 */
export function isSurfaceAccepted(
	stampedKind: SurfaceKind | undefined | null,
	declared: ReadonlyArray<SurfaceKind> | undefined,
): boolean {
	if (!declared || declared.length === 0) return true; // unrestricted
	const effective = stampedKind ?? SurfaceKind.Public;

	// Mixed always passes if Public or Authenticated is in the declared
	// set (and the declared set is not strictly Mixed-only).
	if (effective === SurfaceKind.Mixed) {
		if (declared.includes(SurfaceKind.Mixed)) return true;
		if (declared.includes(SurfaceKind.Public) || declared.includes(SurfaceKind.Authenticated)) {
			return true;
		}
		return false;
	}

	// Unknown rolls up to Public via effectiveSurfaceKind — already
	// handled at the start of this function. So at this point effective
	// is Public or Authenticated.
	return declared.includes(effective);
}
