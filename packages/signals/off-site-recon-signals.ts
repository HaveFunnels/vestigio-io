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

	// ── Reddit — 1 signal (forum_question_orphaned) ──
	const reddit = sources.get("reputation_reddit");
	if (reddit) {
		const p = reddit.payload as OffSiteReconPayload;
		// Skip silently if Reddit auth was missing — that's a config gap,
		// not a real signal of forum absence.
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
		}
	}
}
