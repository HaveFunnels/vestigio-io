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

// Strip business-model meta-prefixes from the classified industry
// string before using it as a SERP query. The Wave 19c industry
// classifier (apps/audit-runner/populate-domain-fingerprint.ts) often
// returns labels like "B2B SaaS - customer engagement platform" — the
// "B2B SaaS -" prefix is taxonomy metadata that doesn't help Tavily
// (it returns generic B2B/SaaS content rather than the actual category
// peers). Trimming to "customer engagement platform" yields much
// tighter SERP results that match the real vertical leaders.
function sanitizeIndustryForSerp(ind: string): string {
	return ind
		.replace(/^(b2b\s+saas|b2c\s+saas|saas|paas|iaas|b2b|b2c)\s*[-:]\s*/i, "")
		.trim();
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
	//
	// Anchor strategy: industry-derived query when available, otherwise
	// fall back to a generic model anchor ("melhor saas"). The anchor
	// fires ONLY as fallback because in industry-set envs it adds noise
	// — "melhor saas" returns every SaaS in PT-BR content rather than
	// the actual category peers. Once domain-fingerprint classifies
	// industry (cycle 1 for any new env post-G1 fix), every subsequent
	// cycle queries the precise vertical instead.
	const cats: string[] = [];
	const ind = sanitizeIndustryForSerp((industry || "").trim().toLowerCase());
	if (ind.length > 3) {
		cats.push(ind);
	} else {
		// Industry classification missing — use a model-flavored anchor
		// so cycle 1 still discovers something. After G1's parse fix
		// (apps/audit-runner/populate-domain-fingerprint.ts) this branch
		// should be rare in production.
		if (businessModel === "saas") cats.push("melhor saas");
		else if (businessModel === "ecommerce") cats.push("loja online");
		else if (businessModel === "lead_gen") cats.push("plataforma de gestão");
		else if (businessModel === "services") cats.push("serviços profissionais");
		else if (businessModel === "app_conversion") cats.push("aplicativo mobile");
		else if (businessModel === "enterprise") cats.push("software empresarial");
		else if (businessModel === "hybrid") cats.push("plataforma digital");
	}
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

// Auto-activation budget for discovered candidates.
//
// Bootstrap (active count = 0): activate top N new so peer-mode passes
// have something to work with on the very first cycle.
//
// Top-up (active count between 1 and target): each subsequent cycle
// activates up to N more new discoveries until the env reaches target.
// This way better candidates discovered in later cycles (e.g. once
// industry classification improves the SERP query) get into the active
// set without manual intervention — replacing the prior "only bootstrap
// once when empty" rule that froze the active set to the first cycle's
// often-mediocre picks.
//
// Cap (active count >= target): stop auto-activating to avoid runaway
// competitor-fetch + customer-voice cost. Owner must deactivate stale
// ones (via UI or auto-deactivation cron — future work) to make room.
const BOOTSTRAP_TOP_N_WHEN_EMPTY = 5;
const AUTO_ACTIVATE_PER_CYCLE_NEW = 2;
const TARGET_ACTIVE_COUNT = 10;

async function upsertAutoDiscoveries(
	envId: string,
	candidates: Set<string>,
): Promise<number> {
	if (candidates.size === 0) return 0;

	const activeCount = await prisma.competitorDomain.count({
		where: { environmentId: envId, active: true },
	}).catch(() => 0);

	let activationBudget = 0;
	let mode: "bootstrap" | "topup" | "at_cap" = "at_cap";
	if (activeCount === 0) {
		activationBudget = BOOTSTRAP_TOP_N_WHEN_EMPTY;
		mode = "bootstrap";
	} else if (activeCount < TARGET_ACTIVE_COUNT) {
		activationBudget = Math.min(
			AUTO_ACTIVATE_PER_CYCLE_NEW,
			TARGET_ACTIVE_COUNT - activeCount,
		);
		mode = "topup";
	}

	let activatedRemaining = activationBudget;
	let created = 0;
	let newlyActivated = 0;
	for (const domain of candidates) {
		try {
			// upsert: existing rows keep their state (owner may have
			// manually pinned earlier). Activation only applies to
			// newly-created rows — existing rows hit the update branch
			// (empty) and keep whatever active flag they currently have.
			// The way we detect "newly created" is to check before/after
			// counts; here we just attempt to activate up to budget.
			const shouldActivate = activatedRemaining > 0;
			const result = await prisma.competitorDomain.upsert({
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
				select: { id: true, addedAt: true, active: true },
			});
			// Detect "newly created in this call" by addedAt within last
			// 2s — if older, it was a pre-existing row that update {} left
			// untouched, so we don't count its activation budget.
			const wasNew = Date.now() - result.addedAt.getTime() < 2000;
			if (shouldActivate && wasNew) {
				activatedRemaining--;
				newlyActivated++;
			}
			created++;
		} catch (err) {
			console.warn(
				`[serp-observation] failed to upsert auto-discovery ${domain}:`,
				err instanceof Error ? err.message : err,
			);
		}
	}
	if (mode === "bootstrap" && newlyActivated > 0) {
		console.log(
			`[serp-observation] env=${envId} had 0 curated competitors. Bootstrap-activated ${newlyActivated} discovered candidate(s)`,
		);
	} else if (mode === "topup" && newlyActivated > 0) {
		console.log(
			`[serp-observation] env=${envId} top-up activated ${newlyActivated} new candidate(s) (active was ${activeCount}/${TARGET_ACTIVE_COUNT})`,
		);
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
