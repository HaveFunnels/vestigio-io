import {
	FreshnessState,
	IdGenerator,
	Inference,
	InferenceCategory,
	makeRef,
	Scoping,
	Signal,
} from "../domain";

// ──────────────────────────────────────────────
// External Recon Inference — Wave 12 Brand Echo
//
// Consumes the 12 signals produced by extractOffSiteReconSignals and
// emits up to 13 inferences (findings). Each function is small,
// single-purpose, and returns either [] (signal absent / not
// triggering) or [oneInference].
//
// Severity follows Vestigio's standard: low / medium / high /
// critical. We bias toward "medium" by default and only escalate to
// "high" when the signal carries quantitative weight (e.g. 8+
// unanswered Trustpilot complaints, or "Não recomendada" badge on
// Reclame Aqui).
//
// The business_model parameter gates SaaS-specific findings (e.g.
// HN invisibility only matters for SaaS / tech B2B). Other findings
// fire across all verticals.
// ──────────────────────────────────────────────

interface ReconInput {
	first: (attr: string) => Signal | undefined;
	byKey: Map<string, Signal>;
	scoping: Scoping;
	cycle_ref: string;
	ids: IdGenerator;
	business_model: string | null;
	/**
	 * Wave 13 Wave B — prior-cycle signal snapshot keyed by signal_key.
	 * When present, enables trajectory inferences (score-up/score-down,
	 * new citation, lost citation). When undefined (first audit OR
	 * caller doesn't have prior data) trajectory inferences are
	 * no-ops — they emit nothing.
	 */
	prior_cycle_signals_by_key?: Map<string, Signal>;
}

function createInference(params: {
	inference_key: string;
	category: InferenceCategory;
	conclusion: string;
	conclusion_value: string;
	severity_hint?: string;
	confidence: number;
	scoping: Scoping;
	cycle_ref: string;
	ids: IdGenerator;
	signal_refs: string[];
	evidence_refs: string[];
	reasoning: string;
	reasoning_slots?: Record<string, string | number>;
}): Inference {
	const now = new Date();
	return {
		id: params.ids.next(),
		inference_key: params.inference_key,
		category: params.category,
		scoping: params.scoping,
		cycle_ref: params.cycle_ref,
		freshness: {
			observed_at: now,
			fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
			freshness_state: FreshnessState.Fresh,
			staleness_reason: null,
		},
		conclusion: params.conclusion,
		conclusion_value: params.conclusion_value,
		severity_hint: params.severity_hint || null,
		confidence: params.confidence,
		signal_refs: params.signal_refs,
		evidence_refs: params.evidence_refs,
		reasoning: params.reasoning,
		reasoning_slots: params.reasoning_slots,
		description: null,
		created_at: now,
		updated_at: now,
	};
}

function listingVoidInference(
	signalKey: string,
	platform: { label: string; inference_key: string; category: InferenceCategory },
	input: ReconInput,
): Inference[] {
	const sig = input.byKey.get(signalKey);
	if (!sig) return [];
	if (sig.value !== "false") return [];
	return [
		createInference({
			inference_key: platform.inference_key,
			category: platform.category,
			conclusion: platform.inference_key,
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `No listing found on ${platform.label}. Buyers researching the category on ${platform.label} never encounter the brand. Even a skeletal profile beats invisibility. At minimum, claim the page and add basic copy + screenshots.`,
		}),
	];
}

function inferIndustryListings(input: ReconInput): Inference[] {
	// G2 + Capterra are SaaS-specific software directories. Listing voids on
	// these platforms are signal only for SaaS / B2B software businesses —
	// for ecommerce / lead-gen / consumer brands, a missing G2 page is
	// neither a problem nor an opportunity.
	// Product Hunt accepts non-SaaS launches (consumer apps, physical
	// products, AI tools) so it stays universal. Wikipedia is universal.
	const isSaas = input.business_model === "saas";
	const out: Inference[] = [];
	if (isSaas) {
		out.push(
			...listingVoidInference("off_site.g2_listing", {
				label: "G2",
				inference_key: "g2_listing_void",
				category: InferenceCategory.G2ListingVoid,
			}, input),
			...listingVoidInference("off_site.capterra_listing", {
				label: "Capterra",
				inference_key: "capterra_listing_void",
				category: InferenceCategory.CapterraListingVoid,
			}, input),
		);
	}
	out.push(
		...listingVoidInference("off_site.producthunt_listing", {
			label: "Product Hunt",
			inference_key: "producthunt_listing_void",
			category: InferenceCategory.ProductHuntListingVoid,
		}, input),
		...listingVoidInference("off_site.wikipedia_listing", {
			label: "Wikipedia",
			inference_key: "wikipedia_listing_void",
			category: InferenceCategory.WikipediaListingVoid,
		}, input),
	);
	return out;
}

function inferBrandedSerpInvisible(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.branded_serp_own_visible");
	if (!sig || sig.value === "true") return [];
	return [
		createInference({
			inference_key: "branded_serp_invisible",
			category: InferenceCategory.BrandedSerpInvisible,
			conclusion: "branded_serp_invisible",
			conclusion_value: "true",
			severity_hint: "high",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Searching for the brand name returns zero results pointing to the brand's own domain on page 1. Direct traffic that should land on the brand is being absorbed by other sites. Audit on-page SEO basics (title tag includes brand, branded H1, canonical to root), publish a press kit page, and submit to Google Search Console with the brand as a focus query.`,
		}),
	];
}

function inferCompetitorBrandHijack(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.competitor_brand_hijack");
	if (!sig || sig.value !== "true") return [];
	const count = sig.numeric_value ?? 0;
	const severity = count >= 5 ? "high" : "medium";
	return [
		createInference({
			inference_key: "competitor_brand_hijack_serp",
			category: InferenceCategory.CompetitorBrandHijackSerp,
			conclusion: "competitor_brand_hijack_serp",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${count} non-brand domains rank above the brand's own site when someone searches the brand name. Competitors and affiliates are intercepting branded search traffic the brand should own. ${sig.description}`,
		}),
	];
}

function inferAffiliateOutranksOwn(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.affiliate_outranks_own");
	if (!sig || sig.value !== "true") return [];
	const count = sig.numeric_value ?? 0;
	return [
		createInference({
			inference_key: "affiliate_outranks_own",
			category: InferenceCategory.AffiliateOutranksOwn,
			conclusion: "affiliate_outranks_own",
			conclusion_value: count >= 3 ? "high" : "medium",
			severity_hint: count >= 3 ? "high" : "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${count} affiliate / review-site domains outrank the brand on its own search. ${sig.description} Every click from these pages to a competitor is a commission the brand pays AND a lost direct conversion. Reclaim by: building a stronger brand pages, suing for trademark on review pages that misrepresent.`,
		}),
	];
}

function inferCategoryIntentInvisible(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.category_intent_visible");
	if (!sig || sig.value === "true") return [];
	return [
		createInference({
			inference_key: "category_intent_invisible",
			category: InferenceCategory.CategoryIntentInvisible,
			conclusion: "category_intent_invisible",
			conclusion_value: "true",
			severity_hint: "high",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `When buyers shop the category (e.g. "[category] alternatives" or "best [category]"), the brand is invisible on page 1. Every buyer comparing options finds competitors first. Build comparison pages, target alternatives keywords, and chase 3rd-party "best of" listicles for the category.`,
		}),
	];
}

function inferTrustpilotComplaintCluster(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.trustpilot_complaint_cluster");
	if (!sig) return [];
	const severity = sig.value === "high" ? "high" : "medium";
	const count = sig.numeric_value ?? 0;
	return [
		createInference({
			inference_key: "trustpilot_complaint_cluster",
			category: InferenceCategory.TrustpilotComplaintCluster,
			conclusion: "trustpilot_complaint_cluster",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${count} negative reviews on Trustpilot have no owner response. Buyers who research the brand see complaints with no rebuttal. Every unanswered 1-2★ review costs trust and conversion. Assign someone to respond within 48h. A short empathetic reply to a 5-month-old complaint still moves the credibility needle.`,
		}),
	];
}

function inferTrustpilotResponseSilence(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.trustpilot_response_silence");
	if (!sig) return [];
	const severity = sig.value === "high" ? "high" : "medium";
	return [
		createInference({
			inference_key: "trustpilot_response_silence",
			category: InferenceCategory.TrustpilotResponseSilence,
			conclusion: "trustpilot_response_silence",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Owner response rate is ${sig.numeric_value ?? 0}% on Trustpilot. Industry benchmark is >70%. Silence on the review platform signals "we don't engage with feedback". The most common reason high-intent prospects pick a competitor with similar features but visible care. Set up an alert for any new review and target sub-48h response.`,
		}),
	];
}

function inferReclameAquiReputation(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.reclame_aqui_reputation_critical");
	if (!sig) return [];
	const severity = sig.value === "high" ? "high" : "medium";
	return [
		createInference({
			inference_key: "reclame_aqui_reputation_critical",
			category: InferenceCategory.ReclameAquiReputationCritical,
			conclusion: "reclame_aqui_reputation_critical",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Brazilian buyers check Reclame Aqui BEFORE purchase. ${sig.description} Restoring this reputation requires public resolution of pending complaints + a structured response pattern. The page is the single most important off-site asset for any BR consumer brand.`,
		}),
	];
}

function inferHnTechAudienceInvisible(input: ReconInput): Inference[] {
	// SaaS / tech-adjacent businesses only — for an ecommerce brand,
	// zero HN mentions is a neutral signal.
	if (input.business_model !== "saas") return [];
	const sig = input.byKey.get("off_site.hn_mention_count");
	if (!sig || sig.value !== "zero") return [];
	return [
		createInference({
			inference_key: "hn_tech_audience_invisible",
			category: InferenceCategory.HnTechAudienceInvisible,
			conclusion: "hn_tech_audience_invisible",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Zero mentions of the brand on Hacker News. For a SaaS / developer-adjacent product, this means the tech early-adopter audience has never discussed it. Neither in launch threads, "Show HN," nor comparison posts. Worth a Show HN launch with a real story, or a deep-dive technical post that hits the front page.`,
		}),
	];
}

function inferRedditForumAbsence(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.reddit_forum_absence");
	if (!sig || sig.value !== "zero") return [];
	return [
		createInference({
			inference_key: "reddit_forum_absence",
			category: InferenceCategory.RedditForumAbsence,
			conclusion: "reddit_forum_absence",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `The brand is absent from question / recommendation threads on Reddit. When users ask "best [category]" or "alternative to X," nobody surfaces this brand. Reddit recommendations are a major B2B and consumer purchase signal in 2026. Strategies: seed authentic founder presence in 2-3 relevant subs, ask happy customers for honest mentions, and watch for unaddressed brand questions weekly.`,
		}),
	];
}

function inferRedditCategoryDemandUnmet(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.reddit_category_demand_unmet");
	if (!sig) return [];
	const severity = sig.value === "high" ? "high" : "medium";
	return [
		createInference({
			inference_key: "reddit_category_demand_unmet",
			category: InferenceCategory.RedditCategoryDemandUnmet,
			conclusion: "reddit_category_demand_unmet",
			conclusion_value: severity,
			severity_hint: severity,
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Visible category demand on Reddit but no brand presence. ${sig.description} This is the highest-conversion-potential surface: people actively shopping the category are signal of high purchase intent. And competitors are getting the recommendations instead. Tactics: identify the top 3 most-active subs, share a non-promotional post about a problem the brand solves, and respond to existing threads asking for tools in the space (without spamming. Reddit moderators penalize obvious self-promo).`,
		}),
	];
}

// ──────────────────────────────────────────────
// Wave 13 — AI Visibility inferences
//
// Two new patterns this wave introduces:
//
//   1) POSITIVE findings (severity_hint: "none") — strengths to protect.
//      Vestigio is mostly risk-oriented, but for AI visibility a positive
//      finding ("you own the branded AI Overview") is itself competitive
//      intelligence worth surfacing. The customer's pack UI can render
//      these as "Confirmed Strengths" instead of "Risks."
//
//   2) COMPOSITE state (ai_visibility_score) — single 0-100 metric
//      derived from all sub-signals. Persisted as an inference so it
//      shows up in trajectory views across audits.
//
// Wave B adds: competitive citation intel, action opportunities, and
// trajectory inferences derived from cross-cycle deltas.
// ──────────────────────────────────────────────

const AI_VIS_SIG_WEIGHTS = {
	branded_serp: 15,
	wikipedia: 15,
	schema: 15,
	bot_access: 10,
	llms_txt: 10,
	machine_readable_pricing: 10,
	comparison_ownership: 10,
	third_party_citations: 15,
} as const;

function aiVisibilityScore(input: ReconInput): { score: number; breakdown: Record<string, number> } {
	const breakdown: Record<string, number> = {
		branded_serp: 0,
		wikipedia: 0,
		schema: 0,
		bot_access: 0,
		llms_txt: 0,
		machine_readable_pricing: 0,
		comparison_ownership: 0,
		third_party_citations: 0,
	};

	const brandedSerp = input.byKey.get("off_site.branded_serp_own_visible");
	if (brandedSerp?.value === "true") breakdown.branded_serp = AI_VIS_SIG_WEIGHTS.branded_serp;

	const wiki = input.byKey.get("off_site.ai_wikipedia_authority");
	if (wiki?.value === "authoritative") breakdown.wikipedia = AI_VIS_SIG_WEIGHTS.wikipedia;
	else if (wiki?.value === "thin_or_outdated") breakdown.wikipedia = AI_VIS_SIG_WEIGHTS.wikipedia / 2;

	const schema = input.byKey.get("off_site.ai_schema_coverage");
	if (schema?.value === "comprehensive") breakdown.schema = AI_VIS_SIG_WEIGHTS.schema;
	else if (schema) breakdown.schema = AI_VIS_SIG_WEIGHTS.schema / 3;

	const bots = input.byKey.get("off_site.ai_bot_access");
	if (bots?.value === "optimal") breakdown.bot_access = AI_VIS_SIG_WEIGHTS.bot_access;

	const llmsTxt = input.byKey.get("off_site.ai_llms_txt_presence");
	if (llmsTxt?.value === "present") breakdown.llms_txt = AI_VIS_SIG_WEIGHTS.llms_txt;

	// Machine-readable pricing (/pricing.md) is only relevant for SaaS +
	// lead_gen — businesses with plan-tier pricing that AI agents compare
	// programmatically. Ecommerce uses Product/Offer schema for the same
	// purpose. For ecommerce we redistribute the machine_readable_pricing
	// weight (10pts) to schema (becomes 25pts max) so the total score
	// remains 0-100 across business models.
	const isPricingPlanBased = input.business_model === "saas" || input.business_model === "lead_gen";
	const mrPricing = input.byKey.get("off_site.ai_machine_readable_pricing");
	if (isPricingPlanBased) {
		if (mrPricing?.value === "present") {
			breakdown.machine_readable_pricing = AI_VIS_SIG_WEIGHTS.machine_readable_pricing;
		}
	} else {
		// Ecommerce/hybrid: boost schema weight by the machine_readable_pricing slot.
		if (schema?.value === "comprehensive") {
			breakdown.schema = AI_VIS_SIG_WEIGHTS.schema + AI_VIS_SIG_WEIGHTS.machine_readable_pricing;
		} else if (schema) {
			breakdown.schema = Math.round((AI_VIS_SIG_WEIGHTS.schema + AI_VIS_SIG_WEIGHTS.machine_readable_pricing) / 3);
		}
	}

	const comparison = input.byKey.get("off_site.ai_comparison_ownership");
	if (comparison?.value === "owned") breakdown.comparison_ownership = AI_VIS_SIG_WEIGHTS.comparison_ownership;

	// Third-party citations score: combine Wikipedia + (G2 + Capterra
	// only for SaaS) + non-absent Reddit. Each present source adds
	// proportionally. For ecommerce / lead-gen brands, G2 + Capterra
	// are not part of the citation pool — counting them would penalize
	// brands that have no reason to be there.
	const isSaas = input.business_model === "saas";
	const sources3p: boolean[] = [
		input.byKey.get("off_site.wikipedia_listing")?.value === "true",
		...(isSaas
			? [
				input.byKey.get("off_site.g2_listing")?.value === "true",
				input.byKey.get("off_site.capterra_listing")?.value === "true",
			]
			: []),
		input.byKey.get("off_site.reddit_forum_absence")?.value !== "zero",
	];
	const presentCount = sources3p.filter(Boolean).length;
	breakdown.third_party_citations = Math.round(
		(AI_VIS_SIG_WEIGHTS.third_party_citations * presentCount) / sources3p.length,
	);

	const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
	return { score, breakdown };
}

function inferAiVisibilityScore(input: ReconInput): Inference[] {
	const { score, breakdown } = aiVisibilityScore(input);
	// Only emit when we have at least one signal contributing (i.e.
	// recon ran). If all weights are zero AND we have zero recon
	// signals it means external_recon pass didn't run yet.
	const anyAiSignal = [
		"off_site.ai_bot_access",
		"off_site.ai_llms_txt_presence",
		"off_site.ai_schema_coverage",
		"off_site.ai_wikipedia_authority",
		"off_site.ai_comparison_ownership",
	].some((k) => input.byKey.has(k));
	if (!anyAiSignal) return [];

	const severity = score < 30 ? "high" : score < 60 ? "medium" : "low";
	const signal_refs = [
		"off_site.branded_serp_own_visible",
		"off_site.ai_wikipedia_authority",
		"off_site.ai_schema_coverage",
		"off_site.ai_bot_access",
		"off_site.ai_llms_txt_presence",
		"off_site.ai_machine_readable_pricing",
		"off_site.ai_comparison_ownership",
	]
		.map((k) => input.byKey.get(k))
		.filter((s): s is Signal => !!s)
		.map((s) => makeRef("signal", s.id));

	return [
		createInference({
			inference_key: "ai_visibility_score",
			category: InferenceCategory.AiVisibilityScore,
			conclusion: "ai_visibility_score",
			conclusion_value: String(score),
			severity_hint: severity,
			confidence: 80,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs,
			evidence_refs: [],
			reasoning: `AI Visibility Score: ${score}/100. Breakdown: branded SERP ${breakdown.branded_serp}, Wikipedia ${breakdown.wikipedia}, schema ${breakdown.schema}, bot access ${breakdown.bot_access}, llms.txt ${breakdown.llms_txt}, machine-readable pricing ${breakdown.machine_readable_pricing}, comparison ownership ${breakdown.comparison_ownership}, third-party citations ${breakdown.third_party_citations}.${score < 60 ? ` Below 60 means AI assistants struggle to recommend the brand confidently. Highest-leverage gaps first: ${Object.entries(breakdown).filter(([, v]) => v === 0).map(([k]) => k).slice(0, 3).join(", ")}.` : ` Strong AI footprint. Protect and extend.`}`,
			reasoning_slots: { score, ...breakdown },
		}),
	];
}

// ── Negative AI Visibility findings ──

function inferAiBotsBlocked(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_bot_access");
	if (!sig || sig.value === "optimal") return [];
	return [
		createInference({
			inference_key: "ai_bots_blocked",
			category: InferenceCategory.AiBotsBlocked,
			conclusion: "ai_bots_blocked",
			conclusion_value: String(sig.numeric_value ?? 0),
			severity_hint: (sig.numeric_value ?? 0) >= 3 ? "high" : "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${sig.numeric_value} AI crawler(s) blocked in robots.txt. Each blocked bot is a platform that physically cannot cite the brand. Even if your content would otherwise be the best answer. ${sig.description} Fix: review robots.txt and remove Disallow rules for GPTBot, ClaudeBot, PerplexityBot, Google-Extended unless deliberate.`,
		}),
	];
}

function inferNoLlmsTxt(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_llms_txt_presence");
	if (!sig || sig.value === "present") return [];
	return [
		createInference({
			inference_key: "no_llms_txt",
			category: InferenceCategory.NoLlmsTxt,
			conclusion: "no_llms_txt",
			conclusion_value: "true",
			severity_hint: "low",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `No /llms.txt file. This is a 15-minute quick win: a short markdown file at the root that tells AI assistants what the product does, who it's for, and links to key pages (pricing, docs, comparisons). When AI parses your site, llms.txt anchors the summary instead of letting it guess from random page snippets. Specification: https://llmstxt.org`,
		}),
	];
}

function inferNoMachineReadablePricing(input: ReconInput): Inference[] {
	// /pricing.md is plan-tier specific (SaaS + lead_gen). Ecommerce uses
	// Product/Offer schema for the same purpose — gating prevents false
	// noise for ecommerce sites that have no /pricing page concept.
	if (input.business_model !== "saas" && input.business_model !== "lead_gen") return [];
	const sig = input.byKey.get("off_site.ai_machine_readable_pricing");
	if (!sig || sig.value === "present") return [];
	return [
		createInference({
			inference_key: "no_machine_readable_pricing",
			category: InferenceCategory.NoMachineReadablePricing,
			conclusion: "no_machine_readable_pricing",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `No /pricing.md or /pricing.txt file. AI agents increasingly compare products programmatically on behalf of buyers. Opaque pricing pages (JavaScript-rendered, behind "contact sales", or scattered across plan-feature tables) get skipped in favor of competitors with parseable plan data. A 30-line markdown file with tier names + monthly prices + key limits unblocks that flow.`,
		}),
	];
}

function inferSchemaMarkupMissingForProduct(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_product_schema_missing");
	if (!sig || sig.value !== "true") return [];
	return [
		createInference({
			inference_key: "schema_markup_missing_for_product",
			category: InferenceCategory.SchemaMarkupMissingForProduct,
			conclusion: "schema_markup_missing_for_product",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Product / SoftwareApplication JSON-LD is missing on key commercial pages. AI assistants weight structured data heavily. Without Product schema, the AI has to guess what's on the page from prose. Princeton GEO study found schema-rich content gets cited 30-40% more. Highest-priority fix: add Product schema + Offer schema to /pricing first.`,
		}),
	];
}

function inferUnfindableInComparisonSearches(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_comparison_ownership");
	if (!sig || sig.value === "owned") return [];
	if (sig.value === "no_comparison_presence") {
		// Different finding — emit only when there IS comparison activity
		// but the brand is absent.
		return [];
	}
	return [
		createInference({
			inference_key: "unfindable_in_comparison_searches",
			category: InferenceCategory.UnfindableInComparisonSearches,
			conclusion: "unfindable_in_comparison_searches",
			conclusion_value: "true",
			severity_hint: "high",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `${sig.numeric_value} comparison pages exist for "<brand> vs ..." queries. But the brand's own domain doesn't surface in top 3. Competitors are authoring the comparison narrative. AI assistants summarize "<brand> vs X" using whoever owns those pages. Fix: publish own "<brand> vs <top competitor>" comparison pages on the brand's domain.`,
		}),
	];
}

function inferWikipediaArticleThinOrOutdated(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_wikipedia_authority");
	if (!sig || sig.value === "authoritative") return [];
	if (sig.value !== "thin_or_outdated") return [];
	return [
		createInference({
			inference_key: "wikipedia_article_thin_or_outdated",
			category: InferenceCategory.WikipediaArticleThinOrOutdated,
			conclusion: "wikipedia_article_thin_or_outdated",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Wikipedia article exists but is thin or stale (${sig.description}). Wikipedia accounts for ~7.8% of all ChatGPT citations. Stub articles get cited far less than substantive, recently-edited ones. Expand the article with sourced facts (founding date, leadership, product timeline, notable customers, press coverage). Don't author edits yourself. Recruit independent editors or provide press kit material that gets picked up.`,
		}),
	];
}

// ── Positive AI Visibility findings (strengths to protect) ──

function inferWikipediaAuthoritative(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_wikipedia_authority");
	if (!sig || sig.value !== "authoritative") return [];
	return [
		createInference({
			inference_key: "wikipedia_article_authoritative",
			category: InferenceCategory.WikipediaArticleAuthoritative,
			conclusion: "wikipedia_article_authoritative",
			conclusion_value: "true",
			severity_hint: "none",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Wikipedia article is substantive and recently maintained. This is a major AI visibility asset. ${sig.description} Protect it: monitor for vandalism, keep the press kit fresh so independent editors have sources for updates.`,
		}),
	];
}

function inferSchemaMarkupComprehensive(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_schema_coverage");
	if (!sig || sig.value !== "comprehensive") return [];
	return [
		createInference({
			inference_key: "schema_markup_comprehensive",
			category: InferenceCategory.SchemaMarkupComprehensive,
			conclusion: "schema_markup_comprehensive",
			conclusion_value: "true",
			severity_hint: "none",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Schema markup is comprehensive (${sig.numeric_value} AI-priority types present). AI assistants get full structured context when parsing the site. ${sig.description} Maintain this. Every new page should include relevant schema.`,
		}),
	];
}

function inferAiBotAccessOptimal(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_bot_access");
	if (!sig || sig.value !== "optimal") return [];
	return [
		createInference({
			inference_key: "ai_bot_access_optimal",
			category: InferenceCategory.AiBotAccessOptimal,
			conclusion: "ai_bot_access_optimal",
			conclusion_value: "true",
			severity_hint: "none",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `All major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bingbot) can access the site. Maximum citation pool available.`,
		}),
	];
}

function inferPricingMachineReadable(input: ReconInput): Inference[] {
	// Mirror of the negative case — only meaningful for plan-tier pricing.
	if (input.business_model !== "saas" && input.business_model !== "lead_gen") return [];
	const sig = input.byKey.get("off_site.ai_machine_readable_pricing");
	if (!sig || sig.value !== "present") return [];
	return [
		createInference({
			inference_key: "pricing_machine_readable",
			category: InferenceCategory.PricingMachineReadable,
			conclusion: "pricing_machine_readable",
			conclusion_value: "true",
			severity_hint: "none",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Machine-readable pricing (/pricing.md or /pricing.txt) is present. AI agents doing programmatic vendor comparison can parse plan data without rendering JavaScript or hitting a sales wall.`,
		}),
	];
}

function inferBrandedQueryOwnsAiOverview(input: ReconInput): Inference[] {
	// Approximation: own_present AND own_rank === 0 on branded SERP.
	// AI Overviews lean heavily on top-ranked own-domain results for
	// branded queries.
	const sig = input.byKey.get("off_site.branded_serp_own_visible");
	if (!sig || sig.value !== "true") return [];
	if (sig.numeric_value !== 0) return [];
	return [
		createInference({
			inference_key: "branded_query_owns_ai_overview",
			category: InferenceCategory.BrandedQueryOwnsAiOverview,
			conclusion: "branded_query_owns_ai_overview",
			conclusion_value: "true",
			severity_hint: "none",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Own domain ranks #1 on branded search. When AI assistants answer "what is <brand>", they cite the brand's own page first. Protect canonical title + meta description; ensure homepage stays on-message.`,
		}),
	];
}

function inferComparisonPageOwnsVsQuery(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_comparison_ownership");
	if (!sig || sig.value !== "owned") return [];
	return [
		createInference({
			inference_key: "comparison_page_owns_vs_query",
			category: InferenceCategory.ComparisonPageOwnsVsQuery,
			conclusion: "comparison_page_owns_vs_query",
			conclusion_value: "true",
			severity_hint: "none",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Brand owns its own "<brand> vs <competitor>" comparison narrative on page 1. AI assistants summarize comparison queries using whoever ranks first. That's you. Maintain these comparison pages with fresh feature/pricing data.`,
		}),
	];
}

function inferHighAuthorityThirdPartyCitations(input: ReconInput): Inference[] {
	// Composite: brand has ≥2 of (Wikipedia, G2 listed, Capterra listed,
	// Reddit non-absent). That's the "AI-favored citation triad."
	const wiki = input.byKey.get("off_site.wikipedia_listing")?.value === "true";
	const g2 = input.byKey.get("off_site.g2_listing")?.value === "true";
	const capterra = input.byKey.get("off_site.capterra_listing")?.value === "true";
	const redditAbsent = input.byKey.get("off_site.reddit_forum_absence")?.value === "zero";
	const presentCount = [wiki, g2, capterra, !redditAbsent].filter(Boolean).length;
	if (presentCount < 2) return [];

	const sources: string[] = [];
	if (wiki) sources.push("Wikipedia");
	if (g2) sources.push("G2");
	if (capterra) sources.push("Capterra");
	if (!redditAbsent) sources.push("Reddit");

	return [
		createInference({
			inference_key: "high_authority_third_party_citations",
			category: InferenceCategory.HighAuthorityThirdPartyCitations,
			conclusion: "high_authority_third_party_citations",
			conclusion_value: String(presentCount),
			severity_hint: "none",
			confidence: 80,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [],
			evidence_refs: [],
			reasoning: `Brand is cited across ${presentCount} authoritative third-party surfaces (${sources.join(", ")}). Per Princeton GEO study, brands are 6.5× more likely to be cited via third-party sources than their own domain. This is structural moat. Invest in keeping these listings current.`,
		}),
	];
}

// ──────────────────────────────────────────────
// Wave B — Competitive intel + Action opportunities + Trajectory
// ──────────────────────────────────────────────

function inferCompetitorOwnsCategoryQuery(input: ReconInput): Inference[] {
	// When category_intent SERP has the brand invisible AND there are
	// strong competitor domains in top 5 → competitor owns the category.
	const sig = input.byKey.get("off_site.category_intent_visible");
	if (!sig || sig.value === "true") return [];
	// We need access to competitor list — pull from evidence directly
	// through the related branded_serp signal which carries competitor
	// domains.
	const branded = input.byKey.get("off_site.competitor_brand_hijack");
	const competitorList = branded?.description?.match(/Top hijackers: ([^.]+)/)?.[1] ?? "competitors";
	return [
		createInference({
			inference_key: "competitor_owns_category_query",
			category: InferenceCategory.CompetitorOwnsCategoryQuery,
			conclusion: "competitor_owns_category_query",
			conclusion_value: "true",
			severity_hint: "high",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Category-intent SERP is dominated by ${competitorList}. When AI assistants answer "best <category>", these competitors get cited and you don't. Build a "best <category> [year]" listicle page on your own domain AND get featured in 2-3 independent listicles.`,
		}),
	];
}

function inferCompetitorOwnsComparison(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_comparison_ownership");
	if (!sig || sig.value !== "competitor_owned") return [];
	// Pull competitor domains owning the vs query from signal description
	const m = sig.description?.match(/Competitors authoring: ([^.]+)/);
	const competitors = m?.[1] ?? "competitors";
	return [
		createInference({
			inference_key: "competitor_owns_comparison",
			category: InferenceCategory.CompetitorOwnsComparison,
			conclusion: "competitor_owns_comparison",
			conclusion_value: "true",
			severity_hint: "high",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Comparison query for the brand is authored by ${competitors}. When buyers shop, AI assistants summarize "<brand> vs X" using the competitor's framing. Your weaknesses are highlighted, your strengths buried. Counter with own comparison page using fair side-by-side criteria.`,
		}),
	];
}

function inferWikipediaGapToFill(input: ReconInput): Inference[] {
	// Wikipedia missing = high opportunity for brands above a certain
	// "notability threshold" (heuristic: has any 3rd-party listing).
	const wiki = input.byKey.get("off_site.wikipedia_listing");
	if (!wiki || wiki.value !== "false") return [];
	const hasOtherListing =
		input.byKey.get("off_site.g2_listing")?.value === "true" ||
		input.byKey.get("off_site.capterra_listing")?.value === "true" ||
		input.byKey.get("off_site.producthunt_listing")?.value === "true";
	if (!hasOtherListing) return [];
	return [
		createInference({
			inference_key: "wikipedia_gap_to_fill",
			category: InferenceCategory.WikipediaGapToFill,
			conclusion: "wikipedia_gap_to_fill",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: 75,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", wiki.id)],
			evidence_refs: wiki.evidence_refs,
			reasoning: `No Wikipedia article, but the brand has industry-listing presence. Meaning it likely meets notability for an article. Wikipedia is responsible for ~7.8% of ChatGPT citations. Action: collect 3-5 independent press references, draft a notability-compliant article, and submit via WP:AfC (Articles for Creation). Don't author it yourself.`,
		}),
	];
}

function inferLlmsTxtQuickWin(input: ReconInput): Inference[] {
	// Bundle action covers llms.txt + pricing.md as one 15-min win.
	// pricing.md is plan-tier specific, so gate to SaaS + lead_gen. The
	// standalone llms.txt-only opportunity stays covered by `no_llms_txt`
	// (universal). Ecommerce customers see that one instead.
	if (input.business_model !== "saas" && input.business_model !== "lead_gen") return [];
	const sig = input.byKey.get("off_site.ai_llms_txt_presence");
	if (!sig || sig.value === "present") return [];
	return [
		createInference({
			inference_key: "llms_txt_quick_win",
			category: InferenceCategory.LlmsTxtQuickWin,
			conclusion: "llms_txt_quick_win",
			conclusion_value: "true",
			severity_hint: "low",
			confidence: 90,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `15-minute action: publish /llms.txt and /pricing.md at the site root. Standard markdown that AI agents parse to understand your product + pricing programmatically. Expected lift in AI Overview citation rate over 30-90 days: 10-25% based on industry benchmarks.`,
		}),
	];
}

function inferSchemaPriorityList(input: ReconInput): Inference[] {
	const sig = input.byKey.get("off_site.ai_schema_coverage");
	if (!sig || sig.value === "comprehensive") return [];
	return [
		createInference({
			inference_key: "schema_priority_list",
			category: InferenceCategory.SchemaPriorityList,
			conclusion: "schema_priority_list",
			conclusion_value: "true",
			severity_hint: "medium",
			confidence: sig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", sig.id)],
			evidence_refs: sig.evidence_refs,
			reasoning: `Schema priority list for the brand: 1) Organization + WebSite on homepage (entity recognition); 2) Product or SoftwareApplication + Offer on /pricing (AI agent comparison parseability); 3) FAQPage anywhere with Q&A content (direct extraction); 4) BreadcrumbList site-wide (site structure hint). Implementation: 1-2 hours per page type, lift in AI citation rate measurable within 60 days.`,
		}),
	];
}

function inferThirdPartyCitationTarget(input: ReconInput): Inference[] {
	// When G2 or Capterra is missing AND the brand has SaaS business model,
	// emit "go get listed" action.
	if (input.business_model !== "saas") return [];
	const g2 = input.byKey.get("off_site.g2_listing");
	const capterra = input.byKey.get("off_site.capterra_listing");
	const missing: string[] = [];
	if (g2?.value === "false") missing.push("G2");
	if (capterra?.value === "false") missing.push("Capterra");
	if (missing.length === 0) return [];
	return [
		createInference({
			inference_key: "third_party_citation_target",
			category: InferenceCategory.ThirdPartyCitationTarget,
			conclusion: "third_party_citation_target",
			conclusion_value: missing.join(","),
			severity_hint: "medium",
			confidence: 85,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", g2?.id ?? capterra?.id ?? "")],
			evidence_refs: [...(g2?.evidence_refs ?? []), ...(capterra?.evidence_refs ?? [])],
			reasoning: `Missing presence on ${missing.join(" and ")}. These are the highest-leverage citation targets for SaaS. AI assistants prefer category-listed products with review counts >50. Action: claim profiles (free), seed 10-15 reviews from happy customers in first 30 days, target review count parity with median competitor in your category.`,
		}),
	];
}

function inferHighLeverageQueryUnowned(input: ReconInput): Inference[] {
	// When category_intent is invisible AND visibility score is low,
	// surface the specific query the brand should target.
	const catSig = input.byKey.get("off_site.category_intent_visible");
	if (!catSig || catSig.value === "true") return [];
	const queryHint =
		catSig.description?.match(/"([^"]+)"/)?.[1] ?? "[category] alternatives";
	return [
		createInference({
			inference_key: "high_leverage_query_unowned",
			category: InferenceCategory.HighLeverageQueryUnowned,
			conclusion: "high_leverage_query_unowned",
			conclusion_value: queryHint,
			severity_hint: "high",
			confidence: catSig.confidence,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [makeRef("signal", catSig.id)],
			evidence_refs: catSig.evidence_refs,
			reasoning: `High-leverage query "${queryHint}" is buying-intent traffic the brand is missing entirely. Action: write an 800-1200 word answer page on own domain with FAQ schema, add "best of" listicle inclusion outreach (3-5 independent sites), and amplify via Reddit/HN authentic founder presence in matching subs.`,
		}),
	];
}

// ──────────────────────────────────────────────
// Wave B trajectory — cross-cycle deltas
// ──────────────────────────────────────────────

function priorAiVisibilityScore(input: ReconInput): number | null {
	if (!input.prior_cycle_signals_by_key) return null;
	const fakeInput: ReconInput = {
		...input,
		byKey: input.prior_cycle_signals_by_key,
		prior_cycle_signals_by_key: undefined,
	};
	return aiVisibilityScore(fakeInput).score;
}

function inferAiVisibilityTrajectory(input: ReconInput): Inference[] {
	const prior = priorAiVisibilityScore(input);
	if (prior === null) return [];
	const current = aiVisibilityScore(input).score;
	const delta = current - prior;
	if (Math.abs(delta) < 5) return []; // ignore noise
	const improved = delta > 0;
	return [
		createInference({
			inference_key: improved ? "ai_visibility_trajectory_improved" : "ai_visibility_trajectory_declined",
			category: improved
				? InferenceCategory.AiVisibilityTrajectoryImproved
				: InferenceCategory.AiVisibilityTrajectoryDeclined,
			conclusion: improved ? "ai_visibility_trajectory_improved" : "ai_visibility_trajectory_declined",
			conclusion_value: `${delta > 0 ? "+" : ""}${delta}`,
			severity_hint: improved ? "none" : Math.abs(delta) >= 15 ? "high" : "medium",
			confidence: 75,
			scoping: input.scoping,
			cycle_ref: input.cycle_ref,
			ids: input.ids,
			signal_refs: [],
			evidence_refs: [],
			reasoning: improved
				? `AI Visibility Score: ${prior} → ${current} (+${delta}) since last audit. Whatever changed (new Wikipedia edit, schema rollout, llms.txt published) is working. Keep it going.`
				: `AI Visibility Score: ${prior} → ${current} (${delta}) since last audit. Either something broke (schema removed, bot blocked, listing lost) OR a competitor improved their footprint and pushed you down. Investigate before AI weight decays further.`,
			reasoning_slots: { prior_score: prior, current_score: current, delta },
		}),
	];
}

function inferCitationDeltas(input: ReconInput): Inference[] {
	if (!input.prior_cycle_signals_by_key) return [];
	const out: Inference[] = [];

	const CITATION_SIGNALS: Array<{ key: string; label: string; positiveValue?: string }> = [
		{ key: "off_site.wikipedia_listing", label: "Wikipedia article" },
		{ key: "off_site.g2_listing", label: "G2 listing" },
		{ key: "off_site.capterra_listing", label: "Capterra listing" },
		{ key: "off_site.producthunt_listing", label: "Product Hunt listing" },
		{ key: "off_site.ai_wikipedia_authority", label: "Authoritative Wikipedia article", positiveValue: "authoritative" },
	];

	for (const { key, label, positiveValue } of CITATION_SIGNALS) {
		const priorSig = input.prior_cycle_signals_by_key.get(key);
		const currentSig = input.byKey.get(key);
		const priorPresent = positiveValue
			? priorSig?.value === positiveValue
			: priorSig?.value === "true";
		const currentPresent = positiveValue
			? currentSig?.value === positiveValue
			: currentSig?.value === "true";

		if (!priorPresent && currentPresent) {
			out.push(
				createInference({
					inference_key: "new_citation_detected",
					category: InferenceCategory.NewCitationDetected,
					conclusion: "new_citation_detected",
					conclusion_value: label,
					severity_hint: "none",
					confidence: 80,
					scoping: input.scoping,
					cycle_ref: input.cycle_ref,
					ids: input.ids,
					signal_refs: currentSig ? [makeRef("signal", currentSig.id)] : [],
					evidence_refs: currentSig?.evidence_refs ?? [],
					reasoning: `New citation surface detected: ${label}. AI citation pool just grew. Surface this internally + amplify (announce on social, link to it from homepage trust strip).`,
				}),
			);
		} else if (priorPresent && !currentPresent) {
			out.push(
				createInference({
					inference_key: "lost_citation_detected",
					category: InferenceCategory.LostCitationDetected,
					conclusion: "lost_citation_detected",
					conclusion_value: label,
					severity_hint: "high",
					confidence: 80,
					scoping: input.scoping,
					cycle_ref: input.cycle_ref,
					ids: input.ids,
					signal_refs: priorSig ? [makeRef("signal", priorSig.id)] : [],
					evidence_refs: priorSig?.evidence_refs ?? [],
					reasoning: `Lost citation: ${label} was present last audit, gone now. Investigate immediately. Possible reasons: listing claimed but profile got deleted, Wikipedia article merged/deleted via AfD, G2/Capterra moderation removed page. AI weight will decay within weeks if not restored.`,
				}),
			);
		}
	}
	return out;
}

export function computeExternalReconInferences(input: ReconInput): Inference[] {
	return [
		...inferIndustryListings(input),
		...inferBrandedSerpInvisible(input),
		...inferCompetitorBrandHijack(input),
		...inferAffiliateOutranksOwn(input),
		...inferCategoryIntentInvisible(input),
		...inferTrustpilotComplaintCluster(input),
		...inferTrustpilotResponseSilence(input),
		...inferReclameAquiReputation(input),
		...inferHnTechAudienceInvisible(input),
		...inferRedditForumAbsence(input),
		...inferRedditCategoryDemandUnmet(input),
		// Wave 13 — AI Visibility (Wave A: negative findings)
		...inferAiBotsBlocked(input),
		...inferNoLlmsTxt(input),
		...inferNoMachineReadablePricing(input),
		...inferSchemaMarkupMissingForProduct(input),
		...inferUnfindableInComparisonSearches(input),
		...inferWikipediaArticleThinOrOutdated(input),
		// Wave 13 — AI Visibility (Wave A: positive findings / strengths)
		...inferWikipediaAuthoritative(input),
		...inferSchemaMarkupComprehensive(input),
		...inferAiBotAccessOptimal(input),
		...inferPricingMachineReadable(input),
		...inferBrandedQueryOwnsAiOverview(input),
		...inferComparisonPageOwnsVsQuery(input),
		...inferHighAuthorityThirdPartyCitations(input),
		// Wave 13 — AI Visibility (Wave A: composite state)
		...inferAiVisibilityScore(input),
		// Wave 13 — AI Visibility (Wave B: competitive citation intel)
		...inferCompetitorOwnsCategoryQuery(input),
		...inferCompetitorOwnsComparison(input),
		// Wave 13 — AI Visibility (Wave B: action opportunities)
		...inferWikipediaGapToFill(input),
		...inferLlmsTxtQuickWin(input),
		...inferSchemaPriorityList(input),
		...inferThirdPartyCitationTarget(input),
		...inferHighLeverageQueryUnowned(input),
		// Wave 13 — AI Visibility (Wave B: trajectory — fires only when
		// prior_cycle_signals_by_key is populated by caller)
		...inferAiVisibilityTrajectory(input),
		...inferCitationDeltas(input),
	];
}
