import {
	FreshnessState,
	IdGenerator,
	Inference,
	InferenceCategory,
	Scoping,
} from "../domain";

// ──────────────────────────────────────────────
// Cross-pack synthesis — Wave 14
//
// Runs AFTER all per-pack inference engines have produced their
// individual findings. Looks for COMBINATIONS that, when co-present,
// reveal a deeper diagnosis than any single finding does on its own.
//
// Why this matters: a Trustpilot complaint cluster on its own is "fix
// your reputation." A low AI Visibility Score on its own is "publish
// llms.txt + schema." But BOTH together = "your reputation is actively
// blocking AI citation, so investing in schema first is wasted effort"
// — that's the kind of insight only a CFO-level audit produces.
//
// Each synthesis function:
//   1) Checks specific inference_keys are present in the input set
//   2) Emits a single compound inference if the combination fires
//   3) References the contributing inferences in signal_refs (so the
//      UI can show "this fires because of A, B, C")
//
// All compound insights have severity_hint = "high" by design — the
// fact that they fire AT ALL means multiple risks compound.
// ──────────────────────────────────────────────

interface SynthesisInput {
	inferences: Inference[];
	scoping: Scoping;
	cycle_ref: string;
	ids: IdGenerator;
}

function has(inferences: Inference[], key: string): Inference | undefined {
	return inferences.find((i) => i.inference_key === key);
}

function hasAny(inferences: Inference[], keys: string[]): Inference | undefined {
	for (const k of keys) {
		const found = has(inferences, k);
		if (found) return found;
	}
	return undefined;
}

function createCompoundInference(
	input: SynthesisInput,
	params: {
		inference_key: string;
		category: InferenceCategory;
		conclusion_value: string;
		reasoning: string;
		signal_refs: string[];
		evidence_refs: string[];
	},
): Inference {
	const now = new Date();
	return {
		id: input.ids.next(),
		inference_key: params.inference_key,
		category: params.category,
		scoping: input.scoping,
		cycle_ref: input.cycle_ref,
		freshness: {
			observed_at: now,
			fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
			freshness_state: FreshnessState.Fresh,
			staleness_reason: null,
		},
		conclusion: params.inference_key,
		conclusion_value: params.conclusion_value,
		severity_hint: "high",
		confidence: 85,
		signal_refs: params.signal_refs,
		evidence_refs: params.evidence_refs,
		reasoning: params.reasoning,
		reasoning_slots: {},
		description: null,
		created_at: now,
		updated_at: now,
	};
}

function refsFrom(...sources: (Inference | undefined)[]): { signals: string[]; evidence: string[] } {
	const signals = new Set<string>();
	const evidence = new Set<string>();
	for (const s of sources) {
		if (!s) continue;
		for (const r of s.signal_refs ?? []) signals.add(r);
		for (const r of s.evidence_refs ?? []) evidence.add(r);
	}
	return { signals: Array.from(signals), evidence: Array.from(evidence) };
}

// ──────────────────────────────────────────────
// Synthesis functions — one per compound insight
// ──────────────────────────────────────────────

function compoundReputationBlocksAiCitation(input: SynthesisInput): Inference[] {
	const reputation = hasAny(input.inferences, [
		"trustpilot_complaint_cluster",
		"trustpilot_response_silence",
		"reclame_aqui_reputation_critical",
	]);
	const aiViz = has(input.inferences, "ai_visibility_score");
	if (!reputation || !aiViz) return [];
	const score = parseInt(aiViz.conclusion_value, 10);
	if (isNaN(score) || score >= 60) return [];
	const refs = refsFrom(reputation, aiViz);
	return [
		createCompoundInference(input, {
			inference_key: "compound_reputation_blocks_ai_citation",
			category: InferenceCategory.CompoundReputationBlocksAiCitation,
			conclusion_value: `score=${score}`,
			reasoning: `Your reputation problem is actively blocking AI search citation. AI Visibility Score is ${score}/100 AND there's a visible reputation issue (Trustpilot or Reclame Aqui flags). Schema markup + llms.txt won't fix this. AI assistants weight reputation signals heavily and route around brands with public unresolved complaints. ORDER MATTERS: respond to outstanding reviews first (1-2 weeks), THEN invest in schema/llms.txt. Otherwise you're publishing structured data into a citation pool that AI deliberately skips.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundInvisibleAndUnclear(input: SynthesisInput): Inference[] {
	const invisible = has(input.inferences, "category_intent_invisible");
	const unclear = hasAny(input.inferences, [
		"value_proposition_buried",
		"unclear_conversion_intent",
	]);
	if (!invisible || !unclear) return [];
	const refs = refsFrom(invisible, unclear);
	return [
		createCompoundInference(input, {
			inference_key: "compound_invisible_and_unclear",
			category: InferenceCategory.CompoundInvisibleAndUnclear,
			conclusion_value: "true",
			reasoning: `Double leak: buyers shopping your category can't find you on page 1. AND when the rare visitor does land on your homepage, the value prop is buried so they bounce. Fixing only one of these is wasted spend. Sequence: (1) clarify the value prop above the fold first (1 week), then (2) drive category-intent SEO/SEM. Without step 1, every paid click compounds the leak.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundBrandAuthorityCrisis(input: SynthesisInput): Inference[] {
	const branded = has(input.inferences, "branded_serp_invisible");
	const hijack = has(input.inferences, "competitor_brand_hijack_serp");
	const affiliate = has(input.inferences, "affiliate_outranks_own");
	const count = [branded, hijack, affiliate].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(branded, hijack, affiliate);
	return [
		createCompoundInference(input, {
			inference_key: "compound_brand_authority_crisis",
			category: InferenceCategory.CompoundBrandAuthorityCrisis,
			conclusion_value: String(count),
			reasoning: `Brand authority crisis on ${count}/3 fronts. Competitors, affiliates, or both are outranking your own domain on YOUR brand name. Every buyer typing your brand into search hits someone else first. Three-prong response in parallel: (a) SEO/technical. Fix title/H1/canonical/schema so the homepage is the most authoritative branded result; (b) IP enforcement. File Google Ads Trademark Complaints for any competitor running paid ads on your trademark; (c) affiliate partnership. Convert top affiliate domains from commission-takers to direct partners. Each prong alone is half a fix. Only the combination restores branded SERP control.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundAiAgentInvisibility(input: SynthesisInput): Inference[] {
	const noLlms = has(input.inferences, "no_llms_txt");
	const noSchema = has(input.inferences, "schema_markup_missing_for_product");
	const noPricing = has(input.inferences, "no_machine_readable_pricing");
	const count = [noLlms, noSchema, noPricing].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(noLlms, noSchema, noPricing);
	return [
		createCompoundInference(input, {
			inference_key: "compound_ai_agent_invisibility",
			category: InferenceCategory.CompoundAiAgentInvisibility,
			conclusion_value: String(count),
			reasoning: `AI agents comparing products programmatically can't parse you on ${count}/3 critical surfaces (llms.txt + Product schema + machine-readable pricing). When a buyer asks ChatGPT "compare top 5 tools for X," your brand gets filtered out before the LLM even reads your page. Because the agent's first pass is structured-data extraction, and you have none. 30-minute action covers all three: (1) /llms.txt with your one-paragraph value prop + links, (2) Product + Offer JSON-LD on /pricing, (3) /pricing.md mirroring your plans. Single biggest 2026 lift in AI-mediated buying journeys.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundMobileCommerceBroken(input: SynthesisInput): Inference[] {
	const conv = has(input.inferences, "mobile_conversion_gap");
	const form = has(input.inferences, "mobile_form_friction_elevated");
	const cta = has(input.inferences, "mobile_cta_timing_degraded");
	const count = [conv, form, cta].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(conv, form, cta);
	return [
		createCompoundInference(input, {
			inference_key: "compound_mobile_commerce_broken",
			category: InferenceCategory.CompoundMobileCommerceBroken,
			conclusion_value: String(count),
			reasoning: `Mobile commerce broken on ${count}/3 dimensions (conversion gap, form friction, CTA timing). This is not a "tune-up". This is a structural mobile UX failure that's leaking the majority of your traffic (most paid traffic is mobile). Action: pick up a real Android + iOS device, walk through signup-to-checkout, and write down every friction point. Don't use Chrome DevTools mobile mode. It lies about font rendering, keyboard behavior, and tap-target reach zones. Ship a separate mobile-first /checkout if needed.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundFunnelTripleLeak(input: SynthesisInput): Inference[] {
	const cart = hasAny(input.inferences, ["checkout_abandonment_revenue_leak", "checkout_abandon_no_feedback"]);
	const failedPayment = has(input.inferences, "failed_payment_revenue_drain");
	const churn = hasAny(input.inferences, ["subscriber_churn_unsustainable", "low_repeat_purchase_rate"]);
	const count = [cart, failedPayment, churn].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(cart, failedPayment, churn);
	return [
		createCompoundInference(input, {
			inference_key: "compound_funnel_triple_leak",
			category: InferenceCategory.CompoundFunnelTripleLeak,
			conclusion_value: String(count),
			reasoning: `Revenue leaks at ${count}/3 funnel stages: top (cart abandonment), middle (failed payments), bottom (churn). This compounds. Fixing only cart abandonment to acquire more customers feeds the middle/bottom leaks. Sequence: (1) fix failed payments first (Stripe Smart Retries + dunning emails = 30-50% recovery, 1 week of work); (2) then cancel-flow + retention offers (reduce churn 20-30%, 2 weeks); (3) THEN attack cart abandonment with the retention engine in place. Without this order, every new customer is leaking out the bottom while you spend more to get them in the top.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundPaidAcquisitionBurn(input: SynthesisInput): Inference[] {
	const friction = has(input.inferences, "paid_traffic_friction_elevated");
	const trust = has(input.inferences, "paid_traffic_trust_gap");
	const mobile = has(input.inferences, "paid_mobile_compounding_waste");
	const count = [friction, trust, mobile].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(friction, trust, mobile);
	return [
		createCompoundInference(input, {
			inference_key: "compound_paid_acquisition_burn",
			category: InferenceCategory.CompoundPaidAcquisitionBurn,
			conclusion_value: String(count),
			reasoning: `Paid acquisition is compounding waste across ${count}/3 dimensions (friction + trust + mobile). Each dollar you spend hits friction, then a trust gap, then a degraded mobile experience. The conversion rate is multiplicative across these. If CR is 1% but each layer adds 30% friction, your effective CR is 0.34%. Pause campaigns OR ship a separate paid-only landing page (sub-2s mobile load, single CTA, no nav, message-match headline, trust strip above fold). Don't increase budget until paid-landing CR is within 20% of organic-landing CR.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundTrustJourneyCollapse(input: SynthesisInput): Inference[] {
	const checkout = has(input.inferences, "trust_break_in_checkout");
	const mobile = has(input.inferences, "mobile_trust_weaker_than_desktop");
	const deficit = has(input.inferences, "trust_deficit_conversion_drag");
	const count = [checkout, mobile, deficit].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(checkout, mobile, deficit);
	return [
		createCompoundInference(input, {
			inference_key: "compound_trust_journey_collapse",
			category: InferenceCategory.CompoundTrustJourneyCollapse,
			conclusion_value: String(count),
			reasoning: `Trust collapses progressively along the buyer's journey: weak on first impression, weaker on mobile, broken at checkout. Buyers who DO want to pay are signaling hesitation because the proof signals aren't where they decide. Action: take the most powerful single trust signal (named customer testimonial with photo OR a specific outcome number) and place it adjacent to the primary CTA on homepage + adjacent to the Buy button on checkout. Then audit mobile. Most trust signals are below the fold or load late.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundSaasActivationToExpansion(input: SynthesisInput): Inference[] {
	const activation = hasAny(input.inferences, ["activation_blocked", "activation_friction_high"]);
	const upgrade = has(input.inferences, "upgrade_invisible");
	const expansion = has(input.inferences, "no_expansion_path");
	const count = [activation, upgrade, expansion].filter(Boolean).length;
	if (count < 2) return [];
	const refs = refsFrom(activation, upgrade, expansion);
	return [
		createCompoundInference(input, {
			inference_key: "compound_saas_activation_to_expansion_blocked",
			category: InferenceCategory.CompoundSaasActivationToExpansionBlocked,
			conclusion_value: String(count),
			reasoning: `SaaS loop is broken: users don't activate, those who do don't see upgrade, those on paid have no expansion path. This is the silent killer of SaaS unit economics. Each new user becomes a low-LTV one-off instead of a compounding revenue source. Fix in order: (1) cut activation to 3 steps and ship a 60-second quick win, (2) add usage-triggered upgrade prompts at the moment users hit plan limits (not in billing settings), (3) build seat expansion or premium add-ons so existing customers can spend more. Without all three, paid acquisition is a bucket with a hole.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundDeadAdSpend(input: SynthesisInput): Inference[] {
	const dead = has(input.inferences, "ad_creative_dead_destination");
	const noVis = has(input.inferences, "ads_without_conversion_visibility");
	if (!dead || !noVis) return [];
	const refs = refsFrom(dead, noVis);
	return [
		createCompoundInference(input, {
			inference_key: "compound_dead_ad_spend",
			category: InferenceCategory.CompoundDeadAdSpend,
			conclusion_value: "dark_waste",
			reasoning: `Dark waste detected: ads are sending traffic to dead pages AND you have no conversion tracking to even see it happening. This is the worst combination. You can't optimize what you can't measure, and the budget is being spent on impressions that go nowhere. STOP all paid spend NOW until: (1) every active ad's destination URL returns 200 + loads as expected, AND (2) conversion events (purchase / signup / lead) fire correctly in Meta/Google. This is a 4-hour fix that's blocking accurate ROI on everything you've spent in the last 90 days.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundPricingUnclearAndUnparseable(input: SynthesisInput): Inference[] {
	const unclear = hasAny(input.inferences, [
		"pricing_page_framing_unclear",
		"pricing_page_complexity_paralysis",
		"price_hidden_behind_interaction",
	]);
	const unparseable = has(input.inferences, "no_machine_readable_pricing");
	if (!unclear || !unparseable) return [];
	const refs = refsFrom(unclear, unparseable);
	return [
		createCompoundInference(input, {
			inference_key: "compound_pricing_unclear_and_unparseable",
			category: InferenceCategory.CompoundPricingUnclearAndUnparseable,
			conclusion_value: "true",
			reasoning: `Pricing fails on both audiences: humans hit unclear framing/hidden numbers AND AI agents can't parse your plans. You're losing buyers who want to compare AND you're invisible to AI-mediated buying journeys. Single action covers both: rewrite /pricing with (a) exact monthly + annual prices visible without interaction, (b) clear "what's included per tier" table, (c) recommended plan badge on one tier, AND publish /pricing.md mirroring the same structure for AI agents. 2-3 hours of work, double-layer impact.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

function compoundCategoryInvisibleAndAuthorityThin(input: SynthesisInput): Inference[] {
	const category = has(input.inferences, "category_intent_invisible");
	const authority = hasAny(input.inferences, [
		"wikipedia_listing_void",
		"wikipedia_article_thin_or_outdated",
	]);
	if (!category || !authority) return [];
	const refs = refsFrom(category, authority);
	return [
		createCompoundInference(input, {
			inference_key: "compound_category_invisible_and_authority_thin",
			category: InferenceCategory.CompoundCategoryInvisibleAndAuthorityThin,
			conclusion_value: "true",
			reasoning: `Bottom-of-stack visibility: you're invisible in category-intent search AND have no Wikipedia authority signal. When AI assistants answer "best <category>", they preferentially cite brands with both SERP presence AND Wikipedia entity recognition. You have neither. Action: (1) build an SEO-grade "best <category> [year]" listicle on your own domain targeting alternatives keywords; (2) collect 3-5 independent press references and submit a Wikipedia article via WP:AfC. Both moves are 3-4 weeks but compound. Wikipedia citation lifts everything else.`,
			signal_refs: refs.signals,
			evidence_refs: refs.evidence,
		}),
	];
}

export function computeCrossPackSynthesis(input: SynthesisInput): Inference[] {
	return [
		...compoundReputationBlocksAiCitation(input),
		...compoundInvisibleAndUnclear(input),
		...compoundBrandAuthorityCrisis(input),
		...compoundAiAgentInvisibility(input),
		...compoundMobileCommerceBroken(input),
		...compoundFunnelTripleLeak(input),
		...compoundPaidAcquisitionBurn(input),
		...compoundTrustJourneyCollapse(input),
		...compoundSaasActivationToExpansion(input),
		...compoundDeadAdSpend(input),
		...compoundPricingUnclearAndUnparseable(input),
		...compoundCategoryInvisibleAndAuthorityThin(input),
	];
}
