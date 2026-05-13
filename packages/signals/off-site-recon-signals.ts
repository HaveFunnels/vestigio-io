import {
	Evidence,
	EvidenceType,
	Signal,
	Scoping,
	SignalCategory,
	IdGenerator,
	makeRef,
} from "../domain";
import type { OffSiteReconPayload } from "../domain";
import { createSignal } from "./create";

// ──────────────────────────────────────────────
// Off-Site Recon signals — Wave 12 Brand Echo
//
// Reads OffSiteRecon evidence (one per source per cycle) and emits
// boolean/severity signals the inference engine consumes. The
// inference engine then produces the 13 Brand Echo findings.
//
// Design notes:
//   - Each emitter gates on payload.reachable. Unreachable evidence
//     means "we tried and failed" — no signal emitted (so we don't
//     produce a finding from a Trustpilot timeout, for example).
//   - auth_missing on Reddit is special: it means the feature is
//     disabled by config, not that the brand is silent on Reddit.
//     We skip signal emission entirely in that case.
//   - Confidence is reduced for signals derived from heuristic-y
//     scraping (DDG SERP affiliate detection) and high for binary
//     reachability checks (G2 listing exists yes/no).
// ──────────────────────────────────────────────

function bySource(
	evidence: Evidence[],
): Map<string, Evidence> {
	const map = new Map<string, Evidence>();
	for (const e of evidence) {
		const p = e.payload as OffSiteReconPayload;
		if (!map.has(p.source)) {
			map.set(p.source, e);
		}
	}
	return map;
}

export function extractOffSiteReconSignals(
	byType: Map<EvidenceType, Evidence[]>,
	scoping: Scoping,
	cycle_ref: string,
	signals: Signal[],
	ids: IdGenerator,
): void {
	const reconEvidence = byType.get(EvidenceType.OffSiteRecon) || [];
	if (reconEvidence.length === 0) return;

	const sources = bySource(reconEvidence);

	// ── Industry listings — 4 signals, one per platform ──
	for (const platform of [
		{ source: "industry_listing_g2", key: "off_site.g2_listing", label: "G2" },
		{
			source: "industry_listing_capterra",
			key: "off_site.capterra_listing",
			label: "Capterra",
		},
		{
			source: "industry_listing_producthunt",
			key: "off_site.producthunt_listing",
			label: "Product Hunt",
		},
		{
			source: "industry_listing_wikipedia",
			key: "off_site.wikipedia_listing",
			label: "Wikipedia",
		},
	] as const) {
		const e = sources.get(platform.source);
		if (!e) continue;
		const p = e.payload as OffSiteReconPayload;
		if (!p.reachable) continue;
		const listed = p.data?.listed === true;
		signals.push(
			createSignal({
				ids,
				signal_key: platform.key,
				category: SignalCategory.Discoverability,
				attribute: `off_site.listing.${platform.source}`,
				value: listed ? "true" : "false",
				confidence: 85,
				scoping,
				cycle_ref,
				evidence_refs: [makeRef("evidence", e.id)],
				description: listed
					? `Listing found on ${platform.label}.`
					: `No listing on ${platform.label} — industry buyers won't find the brand there.`,
			}),
		);
	}

	// ── Branded SERP — 3 signals (own_invisible, competitor_in_top3, affiliate_outranks) ──
	const brandedSerp = sources.get("serp_branded_search");
	if (brandedSerp) {
		const p = brandedSerp.payload as OffSiteReconPayload;
		if (p.reachable) {
			const ownPresent = p.data?.own_present === true;
			const ownRank = typeof p.data?.own_rank === "number" ? (p.data.own_rank as number) : -1;
			const competitorDomains = (p.data?.top_competitor_domains as string[] | undefined) ?? [];
			const affiliateDomains = (p.data?.affiliate_domains_in_top10 as string[] | undefined) ?? [];

			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.branded_serp_own_visible",
					category: SignalCategory.Discoverability,
					attribute: "off_site.branded_serp.own_visible",
					value: ownPresent ? "true" : "false",
					numeric_value: ownRank,
					confidence: 75,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", brandedSerp.id)],
					description: ownPresent
						? `Brand owns rank ${ownRank + 1} on its own branded search.`
						: `Brand is INVISIBLE on its own branded search — page 1 has zero results for the brand domain.`,
				}),
			);

			// Competitor hijack: someone other than the brand sits in top 3.
			if (competitorDomains.length > 0 && (!ownPresent || ownRank > 2)) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.competitor_brand_hijack",
						category: SignalCategory.BrandIntegrity,
						attribute: "off_site.branded_serp.competitor_top3",
						value: "true",
						numeric_value: competitorDomains.length,
						confidence: 70,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", brandedSerp.id)],
						description: `${competitorDomains.length} non-brand domains rank above the brand on its own branded search. Top hijackers: ${competitorDomains.slice(0, 3).join(", ")}.`,
					}),
				);
			}

			// Affiliate outranks: any affiliate-style domain in top 10 while own is not present or below rank 3.
			if (affiliateDomains.length > 0 && (!ownPresent || ownRank >= 3)) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.affiliate_outranks_own",
						category: SignalCategory.BrandIntegrity,
						attribute: "off_site.branded_serp.affiliate_dominance",
						value: "true",
						numeric_value: affiliateDomains.length,
						confidence: 65,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", brandedSerp.id)],
						description: `Affiliate / review-site domains outrank the brand on its own search. Domains: ${affiliateDomains.slice(0, 3).join(", ")}.`,
					}),
				);
			}
		}
	}

	// ── Category-intent SERP — 1 signal (own_invisible_for_category) ──
	const categorySerp = sources.get("serp_category_intent");
	if (categorySerp) {
		const p = categorySerp.payload as OffSiteReconPayload;
		if (p.reachable) {
			const ownVisible = p.data?.own_visible === true;
			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.category_intent_visible",
					category: SignalCategory.Discoverability,
					attribute: "off_site.category_serp.own_visible",
					value: ownVisible ? "true" : "false",
					confidence: 70,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", categorySerp.id)],
					description: ownVisible
						? `Brand appears on the comparison-intent SERP (e.g. "[brand] alternatives").`
						: `Brand is INVISIBLE on the comparison-intent SERP — buyers shopping the category never see it on page 1.`,
				}),
			);
		}
	}

	// ── Trustpilot — 2 signals (complaint_cluster, response_silence) ──
	const trustpilot = sources.get("reputation_trustpilot");
	if (trustpilot) {
		const p = trustpilot.payload as OffSiteReconPayload;
		if (p.reachable && p.data?.listed === true) {
			const negUnanswered = (p.data?.negative_unanswered_count as number) ?? 0;
			const responseRate = (p.data?.owner_response_rate as number) ?? 0;
			const reviewCount = (p.data?.review_count as number) ?? 0;
			const rating = (p.data?.rating as number | null) ?? null;

			if (negUnanswered >= 3) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.trustpilot_complaint_cluster",
						category: SignalCategory.Trust,
						attribute: "off_site.trustpilot.unanswered_complaints",
						value: negUnanswered >= 8 ? "high" : "medium",
						numeric_value: negUnanswered,
						confidence: 80,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", trustpilot.id)],
						description: `${negUnanswered} negative reviews on Trustpilot have no owner response. Buyers reading reviews see unaddressed complaints.${rating ? ` Overall rating: ${rating}/5.` : ""}`,
					}),
				);
			}

			if (reviewCount >= 10 && responseRate < 0.5) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.trustpilot_response_silence",
						category: SignalCategory.Trust,
						attribute: "off_site.trustpilot.response_rate",
						value: responseRate < 0.2 ? "high" : "medium",
						numeric_value: Math.round(responseRate * 100),
						confidence: 80,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", trustpilot.id)],
						description: `Owner responds to ${Math.round(responseRate * 100)}% of Trustpilot reviews (${reviewCount} total). Low response rate signals "we don't care" to comparison shoppers.`,
					}),
				);
			}
		}
	}

	// ── Reclame Aqui — 1 signal (reputation_critical, BR-specific) ──
	const reclameAqui = sources.get("reputation_reclame_aqui");
	if (reclameAqui) {
		const p = reclameAqui.payload as OffSiteReconPayload;
		if (p.reachable && p.data?.listed === true) {
			const resolutionIndex = (p.data?.resolution_index as number | null) ?? null;
			const reputationLabel = (p.data?.reputation_label as string | null) ?? null;
			const complaintsLast6mo = (p.data?.complaints_last_6mo as number | null) ?? null;

			const labelIsCritical =
				reputationLabel === "Ruim" ||
				reputationLabel === "Não recomendada" ||
				reputationLabel === "Regular";
			const indexIsCritical = resolutionIndex !== null && resolutionIndex < 6;

			if (labelIsCritical || indexIsCritical) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.reclame_aqui_reputation_critical",
						category: SignalCategory.Trust,
						attribute: "off_site.reclame_aqui.reputation",
						value:
							reputationLabel === "Não recomendada" || (resolutionIndex !== null && resolutionIndex < 4)
								? "high"
								: "medium",
						numeric_value: resolutionIndex ?? null,
						confidence: 85,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", reclameAqui.id)],
						description: `Reclame Aqui flags the brand as "${reputationLabel ?? "low resolution"}"${resolutionIndex !== null ? ` with index ${resolutionIndex}/10` : ""}${complaintsLast6mo !== null ? ` (${complaintsLast6mo} complaints last 6 months)` : ""}. Brazilian buyers check this BEFORE purchase.`,
					}),
				);
			}
		}
	}

	// ── Hacker News — 1 signal (tech audience invisibility) ──
	const hn = sources.get("reputation_hackernews");
	if (hn) {
		const p = hn.payload as OffSiteReconPayload;
		if (p.reachable) {
			const totalHits = (p.data?.total_hits as number) ?? 0;
			const showHnCount = (p.data?.show_hn_count as number) ?? 0;
			// HN invisibility = SaaS-relevant signal (tech audience never
			// discusses the brand). We emit always; the inference layer
			// gates on business_model.
			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.hn_mention_count",
					category: SignalCategory.Discoverability,
					attribute: "off_site.hackernews.total_hits",
					value: totalHits === 0 ? "zero" : totalHits < 5 ? "low" : "ok",
					numeric_value: totalHits,
					confidence: 70,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", hn.id)],
					description:
						totalHits === 0
							? `No mentions of the brand on Hacker News. Tech early-adopters have never discussed it.`
							: `${totalHits} HN mentions found (${showHnCount} Show HN posts).`,
				}),
			);
		}
	}

	// ── Reddit (via DDG site-restricted search) — 2 signals ──
	// We hit DuckDuckGo with `site:reddit.com "<brand>"` rather than
	// the Reddit API (which closed commercial access in 2024). The
	// signal shape is the same as when this used OAuth: question-thread
	// absence + versus-mention pattern. Slightly shallower data, no
	// rate-limit / ToS risk.
	const reddit = sources.get("reputation_reddit");
	if (reddit) {
		const p = reddit.payload as OffSiteReconPayload;
		if (p.reachable) {
			const questionThreadCount = (p.data?.question_thread_count as number) ?? 0;
			const versusMentionCount = (p.data?.versus_mention_count as number) ?? 0;
			const totalHits = (p.data?.total_hits as number) ?? 0;

			if (questionThreadCount === 0 && totalHits >= 0) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.reddit_forum_absence",
						category: SignalCategory.Discoverability,
						attribute: "off_site.reddit.question_threads",
						value: "zero",
						numeric_value: 0,
						confidence: 65,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", reddit.id)],
						description: `Brand is absent from question threads on Reddit — when users ask "best X" or "alternatives to Y," nobody mentions this brand.`,
					}),
				);
			}

			if (versusMentionCount >= 2) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.reddit_versus_pattern",
						category: SignalCategory.BrandIntegrity,
						attribute: "off_site.reddit.versus_threads",
						value: versusMentionCount >= 5 ? "high" : "medium",
						numeric_value: versusMentionCount,
						confidence: 70,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", reddit.id)],
						description: `${versusMentionCount} Reddit threads compare the brand AGAINST another product. Customer is being actively compared — make sure the brand is winning the narrative.`,
					}),
				);
			}

			// Category-level demand: did the broader space (category
			// alternatives, "best X" threads) discuss the brand at all?
			// When there's visible demand but the brand never surfaces,
			// that's the strongest "unmet opportunity" signal we can
			// extract from public Reddit without API access.
			const categoryDemand = (p.data?.category_demand_signals as number) ?? 0;
			const categoryBrandSurfaced = (p.data?.category_brand_surfaced as number) ?? 0;
			const categoryBrandAbsent = (p.data?.category_brand_absent_threads as number) ?? 0;

			if (categoryDemand >= 3 && categoryBrandSurfaced === 0) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.reddit_category_demand_unmet",
						category: SignalCategory.Discoverability,
						attribute: "off_site.reddit.category_demand_unmet",
						value: categoryDemand >= 8 ? "high" : "medium",
						numeric_value: categoryDemand,
						confidence: 70,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", reddit.id)],
						description: `${categoryDemand} Reddit threads in the brand's category are actively asking for tool recommendations — and the brand is mentioned in ZERO of them. Visible demand, invisible brand.`,
					}),
				);
			} else if (categoryDemand >= 5 && categoryBrandSurfaced < categoryDemand * 0.2) {
				// Weaker variant: brand surfaces in <20% of category threads.
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.reddit_category_demand_unmet",
						category: SignalCategory.Discoverability,
						attribute: "off_site.reddit.category_demand_unmet",
						value: "medium",
						numeric_value: categoryBrandAbsent,
						confidence: 60,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", reddit.id)],
						description: `Of ${categoryDemand} category-recommendation threads on Reddit, the brand surfaces in only ${categoryBrandSurfaced}. ${categoryBrandAbsent} buyers asking for category tools never see this brand in the answers.`,
					}),
				);
			}
		}
	}

	// ──────────────────────────────────────────────
	// Wave 13 — AI Visibility signals (5 sources)
	//
	// We emit BOTH polarities (positive + negative) so the inference
	// layer can produce "strength to protect" findings as well as
	// "leak to fix." Polarity is encoded in the signal value (e.g.
	// "blocked" vs "allowed", "comprehensive" vs "thin").
	// ──────────────────────────────────────────────

	// ── AI Bot Access (robots.txt) ──
	const botAccess = sources.get("ai_bot_access");
	if (botAccess) {
		const p = botAccess.payload as OffSiteReconPayload;
		if (p.reachable) {
			const blockedBots = (p.data?.blocked_bots as string[]) ?? [];
			const allAllowed = p.data?.all_ai_bots_allowed === true;
			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.ai_bot_access",
					category: SignalCategory.Discoverability,
					attribute: "off_site.ai.bot_access",
					value: allAllowed ? "optimal" : "blocked",
					numeric_value: blockedBots.length,
					confidence: 90,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", botAccess.id)],
					description: allAllowed
						? `All major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bingbot) are allowed in robots.txt.`
						: `${blockedBots.length} AI crawler(s) blocked in robots.txt: ${blockedBots.slice(0, 4).join(", ")}. These platforms cannot cite the brand.`,
				}),
			);
		}
	}

	// ── AI Machine-Readable Artifacts (llms.txt + pricing.md) ──
	const machineReadable = sources.get("ai_machine_readable");
	if (machineReadable) {
		const p = machineReadable.payload as OffSiteReconPayload;
		if (p.reachable) {
			const hasLlmsTxt = p.data?.has_llms_txt === true;
			const hasMachineReadablePricing = p.data?.has_machine_readable_pricing === true;

			// llms.txt presence signal — emit positive OR negative
			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.ai_llms_txt_presence",
					category: SignalCategory.Discoverability,
					attribute: "off_site.ai.llms_txt",
					value: hasLlmsTxt ? "present" : "absent",
					confidence: 95,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", machineReadable.id)],
					description: hasLlmsTxt
						? `/llms.txt is present (${p.data?.llms_txt_size ?? 0} bytes). AI assistants can read a tailored summary of the product.`
						: `No /llms.txt — AI assistants infer what the product does from generic page parsing instead of a brand-authored summary.`,
				}),
			);

			// pricing.md / pricing.txt presence signal
			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.ai_machine_readable_pricing",
					category: SignalCategory.Discoverability,
					attribute: "off_site.ai.machine_readable_pricing",
					value: hasMachineReadablePricing ? "present" : "absent",
					confidence: 95,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", machineReadable.id)],
					description: hasMachineReadablePricing
						? `Machine-readable pricing (/pricing.md or /pricing.txt) is present. AI agents doing programmatic comparison can parse it.`
						: `No machine-readable pricing artifact — AI agents comparing tools programmatically may skip this brand entirely.`,
				}),
			);
		}
	}

	// ── AI Schema Audit (JSON-LD coverage) ──
	const schemaAudit = sources.get("ai_schema_audit");
	if (schemaAudit) {
		const p = schemaAudit.payload as OffSiteReconPayload;
		if (p.reachable) {
			const comprehensive = p.data?.schema_comprehensive === true;
			const hasProduct = p.data?.has_product_schema === true;
			const pricingHasProduct = p.data?.pricing_has_product_schema === true;
			const missing = (p.data?.missing_ai_priorities as string[]) ?? [];

			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.ai_schema_coverage",
					category: SignalCategory.Discoverability,
					attribute: "off_site.ai.schema_coverage",
					value: comprehensive ? "comprehensive" : "thin",
					numeric_value: ((p.data?.ai_relevant_types_present as string[]) ?? []).length,
					confidence: 85,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", schemaAudit.id)],
					description: comprehensive
						? `Schema markup is comprehensive — Organization/WebSite + Product/SoftwareApplication + FAQPage/HowTo all present. AI assistants get full structured context.`
						: `Schema markup is thin. Missing AI-priority types: ${missing.join(", ")}. AI assistants must infer instead of extract.`,
				}),
			);

			// Specific product-schema-on-pricing signal — critical for B2B SaaS
			if (!hasProduct || !pricingHasProduct) {
				signals.push(
					createSignal({
						ids,
						signal_key: "off_site.ai_product_schema_missing",
						category: SignalCategory.Discoverability,
						attribute: "off_site.ai.product_schema_missing",
						value: "true",
						confidence: 80,
						scoping,
						cycle_ref,
						evidence_refs: [makeRef("evidence", schemaAudit.id)],
						description: `Product / SoftwareApplication JSON-LD missing${!pricingHasProduct ? " on /pricing" : ""}. AI agents comparing products programmatically skip pages without parseable Product entities.`,
					}),
				);
			}
		}
	}

	// ── AI Wikipedia Depth (article quality + freshness) ──
	const wikiDepth = sources.get("ai_wikipedia_depth");
	if (wikiDepth) {
		const p = wikiDepth.payload as OffSiteReconPayload;
		if (p.reachable && p.data?.exists === true) {
			const isAuthoritative = p.data?.is_authoritative === true;
			const isSubstantive = p.data?.is_substantive === true;
			const isFresh = p.data?.is_fresh === true;

			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.ai_wikipedia_authority",
					category: SignalCategory.Discoverability,
					attribute: "off_site.ai.wikipedia_authority",
					value: isAuthoritative ? "authoritative" : "thin_or_outdated",
					numeric_value: (p.data?.extract_length as number) ?? null,
					confidence: 85,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", wikiDepth.id)],
					description: isAuthoritative
						? `Wikipedia article is substantive (${p.data?.extract_length} chars) and recently edited (${p.data?.months_since_edit}mo ago). AI assistants will cite this confidently.`
						: `Wikipedia article exists but is ${!isSubstantive ? "thin (<800 chars)" : ""}${!isSubstantive && !isFresh ? " AND " : ""}${!isFresh ? "stale (>18mo since last edit)" : ""}. AI assistants weight authoritativeness — stub/stale articles get cited less.`,
				}),
			);
		}
	}

	// ── AI Comparison Ownership (<brand> vs queries) ──
	const comparisonOwn = sources.get("ai_comparison_ownership");
	if (comparisonOwn) {
		const p = comparisonOwn.payload as OffSiteReconPayload;
		if (p.reachable) {
			const ownOwnsVs = p.data?.own_owns_vs_query === true;
			const versusHitCount = (p.data?.versus_hit_count as number) ?? 0;
			const competitorOwningDomains =
				(p.data?.competitor_domains_owning_vs as string[]) ?? [];

			signals.push(
				createSignal({
					ids,
					signal_key: "off_site.ai_comparison_ownership",
					category: SignalCategory.Discoverability,
					attribute: "off_site.ai.comparison_ownership",
					value: ownOwnsVs ? "owned" : versusHitCount > 0 ? "competitor_owned" : "no_comparison_presence",
					numeric_value: versusHitCount,
					confidence: 75,
					scoping,
					cycle_ref,
					evidence_refs: [makeRef("evidence", comparisonOwn.id)],
					description: ownOwnsVs
						? `Brand owns the "<brand> vs" SERP (rank ${p.data?.own_vs_rank}). When AI compares products, this page anchors the narrative.`
						: versusHitCount > 0
						? `${versusHitCount} comparison pages exist for "<brand> vs ..." but the brand's own domain doesn't surface in top 3. Competitors authoring: ${competitorOwningDomains.slice(0, 3).join(", ")}.`
						: `No "<brand> vs" comparison pages found on page 1. Either the brand is too small to be compared OR no one is publishing comparisons.`,
				}),
			);
		}
	}
}
