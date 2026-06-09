import {
	CollectionMethod,
	Evidence,
	EvidenceType,
	FreshnessState,
	IdGenerator,
	SourceKind,
	isSerpExcluded as sharedIsSerpExcluded,
	type SerpResultsPayload,
} from "../../../packages/domain";
import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import { getSerpProvider, searchWithCache } from "../../serp/provider";
import { prisma } from "../../../src/libs/prismaDb";

// ──────────────────────────────────────────────
// SERP observation enrichment pass — Wave 25
//
// Polite, cached SERP scrape of:
//   1. <brand_name>                — 1 query, intent=brand
//   2. <category_keyword> × top 3  — 3 queries, intent=category
//
// Total: ≤4 queries per env per cycle. Tavily basic tier handles
// thousands of req/mo at $0.04/1k. Cache TTL of 24h means a re-run
// inside the same day is free.
//
// Skips entirely when:
//   - No SERP provider configured (TAVILY_API_KEY missing)
//   - Not full-mode (hot/warm cycles skip — same as competitor-fetch)
//   - Cannot derive an env id from scoping
//
// Auto-discovery side effect lives in this pass too: at the end,
// any host that appeared in ≥2 result lists and isn't a known
// competitor (or your own apex, social media, news, etc.) gets
// upserted as a CompetitorDomain row with discoveryMethod='auto',
// active=false. Owner pins to activate via the CompetitorRadar UI.
// ──────────────────────────────────────────────

const SERP_RESULT_COUNT = 10;
const PASS_NAME = "serp_observation";

// Exclusion list is the shared SERP_EXCLUDED_HOSTS in
// packages/domain/serp-exclusions.ts so the signal extractor at
// packages/signals/competitive-signals.ts uses the exact same set
// without drift.

interface BrandTokens {
	primary: string;
	categoryKeywords: string[];
	locale: string;
}

function extractBrandTokens(rootDomain: string, businessModel: string | null, industry?: string | null): BrandTokens {
	// Brand name = first label of the domain, separator-split if
	// hyphenated. Examples:
	//   havefunnels.com   → "havefunnels"
	//   nubank.com.br      → "nubank"
	//   my-cool-shop.io    → "my cool shop"
	const apex = rootDomain.replace(/^www\./, "").toLowerCase();
	const firstLabel = apex.split(".")[0] || apex;
	const primary = firstLabel.replace(/-/g, " ").trim();

	// Category keywords — derived from business_model + industry. Keep
	// the keyword list short (≤3) to stay under the free-tier budget.
	// Industry is what DomainFingerprint stores per env (Wave 19c) —
	// e.g. "saas funnel builder", "e-commerce fashion".
	const cats: string[] = [];
	const ind = (industry || "").trim().toLowerCase();
	if (ind.length > 3) cats.push(ind);
	// Always add a model-flavored anchor query so even fingerprint-less
	// envs get one category sample.
	if (businessModel === "saas") cats.push("melhor saas");
	else if (businessModel === "ecommerce") cats.push("loja online");
	else if (businessModel === "lead_gen") cats.push("plataforma de gestão");
	else if (businessModel === "services") cats.push("serviços profissionais");
	else if (businessModel === "app_conversion") cats.push("aplicativo mobile");
	else if (businessModel === "enterprise") cats.push("software empresarial");
	else if (businessModel === "hybrid") cats.push("plataforma digital");
	return { primary, categoryKeywords: cats.slice(0, 3), locale: "pt-BR" };
}

function envIdFromRef(environmentRef: string): string | null {
	const idx = environmentRef.indexOf(":");
	if (idx < 0) return null;
	return environmentRef.slice(idx + 1) || null;
}

async function loadKnownContext(envId: string): Promise<{
	ownApex: string | null;
	curatedDomains: Set<string>;
	industry: string | null;
}> {
	try {
		const [env, comps, fingerprint] = await Promise.all([
			prisma.environment.findUnique({
				where: { id: envId },
				select: { domain: true },
			}),
			prisma.competitorDomain.findMany({
				where: { environmentId: envId },
				select: { domain: true },
			}),
			prisma.domainFingerprint.findUnique({
				where: { environmentId: envId },
				select: { industry: true },
			}),
		]);
		return {
			ownApex: env?.domain.toLowerCase() ?? null,
			curatedDomains: new Set(comps.map((c) => c.domain.toLowerCase())),
			industry: fingerprint?.industry ?? null,
		};
	} catch (err) {
		console.warn(
			"[serp-observation] failed to load env context:",
			err instanceof Error ? err.message : err,
		);
		return { ownApex: null, curatedDomains: new Set(), industry: null };
	}
}

// Cap on auto-activation when bootstrapping an env that has zero
// curated competitors. Picks N candidates to come up `active=true`
// so downstream peer-mode passes (competitor-fetch, surface-inventory
// peer comparison, customer-voice delta) fire immediately instead of
// waiting for a customer that may never visit the CompetitorRadar UI.
// The customer can deactivate any later via the same UI.
const AUTO_ACTIVATE_TOP_N_WHEN_EMPTY = 5;

async function upsertAutoDiscoveries(
	envId: string,
	candidates: Set<string>,
): Promise<number> {
	if (candidates.size === 0) return 0;

	// Bootstrap path: when the env has zero active curated competitors,
	// auto-activate the first N discovered candidates so peer-mode
	// passes have something to chew on. Without this, an env that never
	// curates manually stays competitor-blind forever (the prior
	// design assumed manual curation as a non-optional step).
	const activeCount = await prisma.competitorDomain.count({
		where: { environmentId: envId, active: true },
	}).catch(() => 0);
	const shouldBootstrapActivate = activeCount === 0;
	let activatedRemaining = shouldBootstrapActivate
		? AUTO_ACTIVATE_TOP_N_WHEN_EMPTY
		: 0;

	let created = 0;
	for (const domain of candidates) {
		try {
			// upsert: existing rows keep their state (owner may have
			// manually pinned earlier). When bootstrapping (zero curated),
			// the first AUTO_ACTIVATE_TOP_N_WHEN_EMPTY new rows come up
			// active so the rest of the pipeline can use them. After
			// that, new candidates land inactive (owner sees them and
			// activates via the CompetitorRadar UI, or via the manual
			// curation flow we'll add when workspaces page is deprecated).
			const shouldActivate = activatedRemaining > 0;
			await prisma.competitorDomain.upsert({
				where: {
					environmentId_domain: { environmentId: envId, domain },
				},
				create: {
					environmentId: envId,
					domain,
					discoveryMethod: "auto",
					active: shouldActivate,
				},
				update: {}, // never overwrite owner curation
			});
			if (shouldActivate) activatedRemaining--;
			created++;
		} catch (err) {
			console.warn(
				`[serp-observation] failed to upsert auto-discovery ${domain}:`,
				err instanceof Error ? err.message : err,
			);
		}
	}
	if (shouldBootstrapActivate) {
		const activated = AUTO_ACTIVATE_TOP_N_WHEN_EMPTY - activatedRemaining;
		if (activated > 0) {
			console.log(
				`[serp-observation] env=${envId} had 0 curated competitors — bootstrap-activated ${activated} discovered candidate(s)`,
			);
		}
	}
	return created;
}

function isExcluded(host: string, ownApex: string | null): boolean {
	return sharedIsSerpExcluded(host, ownApex);
}

export const serpObservationPass: EnrichmentPass = {
	name: PASS_NAME,
	label: "Observando SERPs do peer set",

	shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
		if (ctx.mode !== "full") {
			return {
				run: false,
				reason: `Skipped: SERP observation runs only in full-mode audits (mode=${ctx.mode})`,
			};
		}
		const provider = getSerpProvider();
		if (!provider) {
			return {
				run: false,
				reason:
					"Skipped: no SERP provider configured (set TAVILY_API_KEY)",
			};
		}
		const envId = envIdFromRef(ctx.scoping.environment_ref);
		if (!envId) {
			return {
				run: false,
				reason: "Skipped: cannot derive environmentId from scoping",
			};
		}
		return { run: true, reason: "Brand + category SERP observation" };
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		try {
			const provider = getSerpProvider();
			if (!provider) {
				return buildFailedResult(
					PASS_NAME,
					"no SERP provider available",
					Date.now() - start,
					1,
				);
			}
			const envId = envIdFromRef(ctx.scoping.environment_ref);
			if (!envId) {
				return buildFailedResult(
					PASS_NAME,
					"cannot derive environmentId from scoping",
					Date.now() - start,
					1,
				);
			}
			const knownCtx = await loadKnownContext(envId);
			const tokens = extractBrandTokens(
				ctx.root_domain,
				ctx.business_model,
				knownCtx.industry,
			);

			const queries: Array<{ q: string; intent: "brand" | "category" }> = [
				{ q: tokens.primary, intent: "brand" },
				...tokens.categoryKeywords.map(
					(k) => ({ q: k, intent: "category" as const }),
				),
			];

			ctx.emit({
				type: "pass_progress",
				pass: PASS_NAME,
				message: `Running ${queries.length} SERP queries (${provider.name})`,
			} as any);

			// Track candidate hosts for auto-discovery: domain → query count.
			const hostQueryCount = new Map<string, number>();
			const evidenceIds = new IdGenerator("ev_serp");
			const now = new Date();
			const evidence: Evidence[] = [];

			for (const { q, intent } of queries) {
				const sr = await searchWithCache(
					envId,
					provider,
					q,
					tokens.locale,
					SERP_RESULT_COUNT,
				);
				if (!sr) continue;

				const payload: SerpResultsPayload = {
					type: "serp_results",
					provider: sr.provider,
					query: sr.query,
					locale: sr.locale,
					query_intent: intent,
					is_navigational: sr.is_navigational,
					results: sr.results.map((r) => ({
						rank: r.rank,
						url: r.url,
						host: r.host,
						title: r.title,
						snippet: r.snippet,
						is_paid: !!r.is_paid,
					})),
					related: sr.related,
					total_results: sr.total_results,
					fetched_at: sr.fetched_at,
					from_cache: sr.from_cache,
				};

				evidence.push({
					id: evidenceIds.next(),
					evidence_key: `serp_results:${sr.provider}:${q}`,
					evidence_type: EvidenceType.SerpResults,
					subject_ref: `serp_query:${q}`,
					scoping: ctx.scoping,
					cycle_ref: ctx.cycle_ref,
					freshness: {
						observed_at: now,
						fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
						freshness_state: FreshnessState.Fresh,
						staleness_reason: null,
					},
					source_kind: SourceKind.HttpFetch,
					collection_method: CollectionMethod.StaticFetch,
					payload,
					quality_score: sr.results.length === 0 ? 30 : 80,
					content_hash: null,
					created_at: now,
					updated_at: now,
				});

				// Track each host for auto-discovery.
				const seenInThisQuery = new Set<string>();
				for (const r of sr.results.slice(0, 5)) {
					const host = r.host;
					if (!host || isExcluded(host, knownCtx.ownApex)) continue;
					if (seenInThisQuery.has(host)) continue;
					seenInThisQuery.add(host);
					hostQueryCount.set(host, (hostQueryCount.get(host) || 0) + 1);
				}

				// Pace between live calls. Tavily is permissive (>3 qps on
				// basic tier) but a small pause keeps us friendly. Cache
				// hits don't need pacing — skipped automatically.
				if (!sr.from_cache) {
					await new Promise((r) => setTimeout(r, 350));
				}
			}

			// Auto-discovery threshold is adaptive to query budget.
			// Original "host in ≥2 query top-5s" was reasonable when the
			// pass was designed for 4 queries (brand + 3 categories) —
			// but envs without industry fingerprint only generate 2
			// queries (brand + 1 model anchor), making ≥2 impossible
			// for orthogonal queries (a host rarely co-occurs in a brand
			// search AND a generic category search).
			//
			// Confirmed against havefunnels: 30+ days of full cycles
			// produced zero auto-discovered candidates because industry
			// was null → only 2 queries fired → threshold ≥2 unreachable.
			//
			// Threshold = max(1, ceil(queryCount / 3)):
			//   2 queries → 1 (any top-5 hit counts; exclusion list does the lifting)
			//   3 queries → 1
			//   4 queries → 2 (original behavior)
			//   6+ queries → 2-3 (stricter as signal density grows)
			const queryCount = queries.length;
			const autoDiscoveryThreshold = Math.max(1, Math.ceil(queryCount / 3));
			const candidates = new Set<string>();
			for (const [host, count] of hostQueryCount.entries()) {
				if (count < autoDiscoveryThreshold) continue;
				if (knownCtx.curatedDomains.has(host)) continue;
				candidates.add(host);
			}
			const autoCreated = await upsertAutoDiscoveries(envId, candidates);

			return {
				pass_name: PASS_NAME,
				status: "completed",
				reason: `Observed ${evidence.length} SERP query(ies); ${autoCreated} auto-discovered candidate(s)`,
				evidence_added: evidence,
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		} catch (err) {
			return buildFailedResult(
				PASS_NAME,
				`serp-observation threw: ${err instanceof Error ? err.message : String(err)}`,
				Date.now() - start,
				1,
			);
		}
	},
};

export const __testing = {
	extractBrandTokens,
	isExcluded,
};
