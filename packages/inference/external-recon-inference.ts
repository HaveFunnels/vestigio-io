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
			reasoning: `No listing found on ${platform.label}. Buyers researching the category on ${platform.label} never encounter the brand. Even a skeletal profile beats invisibility — at minimum, claim the page and add basic copy + screenshots.`,
		}),
	];
}

function inferIndustryListings(input: ReconInput): Inference[] {
	return [
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
	];
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
			reasoning: `${count} negative reviews on Trustpilot have no owner response. Buyers who research the brand see complaints with no rebuttal — every unanswered 1-2★ review costs trust and conversion. Assign someone to respond within 48h. A short empathetic reply to a 5-month-old complaint still moves the credibility needle.`,
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
			reasoning: `Owner response rate is ${sig.numeric_value ?? 0}% on Trustpilot. Industry benchmark is >70%. Silence on the review platform signals "we don't engage with feedback" — the most common reason high-intent prospects pick a competitor with similar features but visible care. Set up an alert for any new review and target sub-48h response.`,
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
			reasoning: `Zero mentions of the brand on Hacker News. For a SaaS / developer-adjacent product, this means the tech early-adopter audience has never discussed it — neither in launch threads, "Show HN," nor comparison posts. Worth a Show HN launch with a real story, or a deep-dive technical post that hits the front page.`,
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
			reasoning: `Visible category demand on Reddit but no brand presence. ${sig.description} This is the highest-conversion-potential surface: people actively shopping the category are signal of high purchase intent — and competitors are getting the recommendations instead. Tactics: identify the top 3 most-active subs, share a non-promotional post about a problem the brand solves, and respond to existing threads asking for tools in the space (without spamming — Reddit moderators penalize obvious self-promo).`,
		}),
	];
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
	];
}
