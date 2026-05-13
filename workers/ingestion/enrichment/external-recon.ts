import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import {
	Evidence,
	EvidenceType,
	SourceKind,
	CollectionMethod,
	FreshnessState,
	IdGenerator,
} from "../../../packages/domain";
import type { OffSiteReconPayload, OffSiteReconSource } from "../../../packages/domain";
import { probeIndustryListings } from "./external-recon/industry-listings";
import { scrapeBrandedSerp, scrapeCategoryIntentSerp } from "./external-recon/ddg-serp";
import { scrapeTrustpilot } from "./external-recon/trustpilot";
import { scrapeReclameAqui } from "./external-recon/reclame-aqui";
import { scrapeHackerNews } from "./external-recon/hacker-news";
import { queryReddit } from "./external-recon/reddit";

// ──────────────────────────────────────────────
// External Reconnaissance — Wave 12 Brand Echo Pack
//
// Collects signals from OUTSIDE the customer's domain to power the
// off-site reputation + off-site discoverability + industry listing
// findings. Every source must be zero-cost.
//
// Frequency: this pass is EXPENSIVE (many external fetches with
// timeouts) so it should not run on every audit cycle. The cron
// scheduler in instrumentation-node owns the cadence — typically
// once per week per environment. The in-pipeline `shouldRun` gates
// to full-mode + a freshness check so a manual full-mode audit can
// also trigger it if last recon was >7 days ago.
//
// Atomicity: each sub-fetcher is wrapped in try/catch. A failure in
// one source (e.g. Reddit OAuth not configured) NEVER blocks the
// others. We emit one evidence per source attempted, with
// reachable=false when the fetch couldn't complete.
// ──────────────────────────────────────────────

/** Brand tokens are derived from the root domain. e.g. havefunnels.com → "havefunnels". */
function deriveBrandToken(rootDomain: string): string {
	const stripped = rootDomain.replace(/^www\./, "");
	const firstLabel = stripped.split(".")[0] || stripped;
	return firstLabel.toLowerCase();
}

function shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
	if (ctx.mode !== "full") {
		return {
			run: false,
			reason: `mode is '${ctx.mode}' — external recon only runs in full-mode audits`,
		};
	}
	if (!ctx.root_domain) {
		return { run: false, reason: "missing root_domain" };
	}
	return {
		run: true,
		reason: "Full-mode audit — collecting off-site reputation, discoverability, industry listings",
	};
}

function buildEvidence(
	source: OffSiteReconSource,
	brandToken: string,
	fetchedUrl: string,
	reachable: boolean,
	data: Record<string, unknown>,
	ctx: EnrichmentContext,
	ids: IdGenerator,
	errorKind?: OffSiteReconPayload["error_kind"],
): Evidence {
	const now = new Date();
	// External recon is fresh for 7 days — these external sources don't
	// change minute-to-minute and re-fetching every cycle would burn the
	// shared infrastructure we don't own (DDG, Trustpilot, etc.).
	const freshUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
	const payload: OffSiteReconPayload = {
		type: "off_site_recon",
		source,
		brand_token: brandToken,
		reachable,
		data,
		fetched_url: fetchedUrl,
		...(errorKind ? { error_kind: errorKind } : {}),
	};
	// We cast through unknown because EnrichmentResult.evidence_added is
	// strictly typed against the domain Evidence interface, which doesn't
	// expose url / confidence / quality_score directly (they live on the
	// payload union for some types). Other enrichment passes use the same
	// pattern — see subdomain-discovery.ts.
	return {
		id: ids.next(),
		evidence_key: `off_site_recon:${source}:${brandToken}`,
		subject_ref: `brand_echo:${ctx.root_domain}`,
		evidence_type: EvidenceType.OffSiteRecon,
		url: fetchedUrl,
		scoping: ctx.scoping,
		cycle_ref: ctx.cycle_ref,
		freshness: {
			observed_at: now,
			fresh_until: freshUntil,
			freshness_state: FreshnessState.Fresh,
			staleness_reason: null,
		},
		source_kind: SourceKind.HttpFetch,
		collection_method: CollectionMethod.ExternalToolScan,
		confidence: reachable ? 80 : 30,
		quality_score: reachable ? 75 : 25,
		payload,
		collected_at: now,
		created_at: now,
		updated_at: now,
		quality_hint: null,
		enrichment_source: null,
		enrichment_model: null,
	} as unknown as Evidence;
}

async function run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
	const start = Date.now();
	const ids = new IdGenerator("recon");
	const brand = deriveBrandToken(ctx.root_domain);
	const evidence: Evidence[] = [];

	// All fetchers run in parallel — each is independent + bounded by
	// its own timeout. Promise.allSettled() so a single rejection never
	// cascades. Each sub-result yields exactly one evidence entry.
	const results = await Promise.allSettled([
		probeIndustryListings(brand),
		scrapeBrandedSerp(brand, ctx.root_domain),
		scrapeCategoryIntentSerp(brand, ctx.business_model),
		scrapeTrustpilot(brand, ctx.root_domain),
		scrapeReclameAqui(brand),
		scrapeHackerNews(brand),
		queryReddit(brand),
	]);

	const sources: OffSiteReconSource[][] = [
		// industry listings expand into 4 sources
		[
			"industry_listing_g2",
			"industry_listing_capterra",
			"industry_listing_producthunt",
			"industry_listing_wikipedia",
		],
		["serp_branded_search"],
		["serp_category_intent"],
		["reputation_trustpilot"],
		["reputation_reclame_aqui"],
		["reputation_hackernews"],
		["reputation_reddit"],
	];

	for (let i = 0; i < results.length; i++) {
		const res = results[i];
		const sourceGroup = sources[i];
		if (res.status === "fulfilled") {
			// industry_listings returns an array of 4 sub-results
			const items = Array.isArray(res.value) ? res.value : [res.value];
			for (let j = 0; j < items.length; j++) {
				const item = items[j];
				const source = sourceGroup[j] ?? sourceGroup[0];
				evidence.push(
					buildEvidence(
						source,
						brand,
						item.fetched_url,
						item.reachable,
						item.data,
						ctx,
						ids,
						item.error_kind,
					),
				);
			}
		} else {
			// Whole sub-fetcher threw — record one failed evidence per
			// source slot so the inference layer can still reason about
			// "we tried and failed" vs "we never tried."
			const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
			for (const source of sourceGroup) {
				evidence.push(
					buildEvidence(
						source,
						brand,
						"",
						false,
						{ error: reason.slice(0, 200) },
						ctx,
						ids,
						"unknown",
					),
				);
			}
		}
	}

	return {
		pass_name: "external_recon",
		status: "completed",
		reason: `Collected ${evidence.length} off-site recon evidence entries for ${brand}`,
		evidence_added: evidence,
		duration_ms: Date.now() - start,
		attempts: 1,
	};
}

export const externalReconPass: EnrichmentPass = {
	name: "external_recon",
	label: "External Reconnaissance",
	shouldRun,
	run,
};
