import {
	CollectionMethod,
	Evidence,
	EvidenceType,
	FreshnessState,
	IdGenerator,
	SourceKind,
	type CompetitorDeepSnapshotPayload,
} from "../../../packages/domain";
import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import { prisma } from "../../../src/libs/prismaDb";
import { safeFetch, type SafeFetchResult } from "./competitor-fetch";

// ──────────────────────────────────────────────
// Wave 23 P0.2 + P1.2 — Competitor Deep Fetch
//
// Sobe o competitor pipeline além de homepage-only. Pra cada concorrente
// ativo do env:
//
//   1) Pricing page detection — probe ordenado em paths comuns
//      (`/pricing`, `/plans`, `/precos`, `/planos`, `/preco`). Primeiro
//      200 OK ganha. Extrai pricing tiers via regex (money pattern +
//      heading proximity).
//
//   2) Blog index detection — probe em `/blog`, `/posts`, `/articles`,
//      `/insights`, `/news`. Primeiro 200 OK ganha. Conta articles +
//      tenta extrair data do post mais recente.
//
// Por que separado do competitor-fetch.ts: aquele já fetcha a homepage
// e tem cap próprio. Esse adiciona 2 fetches por concorrente (pricing
// + blog) — mantemos como pass separado pra fail isolado (se blog der
// timeout, pricing ainda persiste).
//
// Cap: mesmo MAX_COMPETITORS_PER_CYCLE da homepage. Razão: mesmo
// orçamento de I/O por ciclo.
//
// Gated to full-mode only — shallow refreshes pulam.
// ──────────────────────────────────────────────

const MAX_COMPETITORS_PER_CYCLE = 25;

const PRICING_PATHS = [
	"/pricing",
	"/plans",
	"/precos",
	"/planos",
	"/preco",
	"/precos-e-planos",
	"/pricing-plans",
	"/precos.html",
];

const BLOG_PATHS = [
	"/blog",
	"/posts",
	"/articles",
	"/insights",
	"/news",
	"/recursos",
	"/blog/posts",
];

interface CompetitorRow {
	id: string;
	domain: string;
}

function envIdFromRef(environmentRef: string): string | null {
	const idx = environmentRef.indexOf(":");
	if (idx < 0) return null;
	return environmentRef.slice(idx + 1) || null;
}

async function loadActiveCompetitors(envId: string): Promise<CompetitorRow[]> {
	try {
		const rows = await prisma.competitorDomain.findMany({
			where: { environmentId: envId, active: true },
			orderBy: { addedAt: "desc" },
			take: MAX_COMPETITORS_PER_CYCLE,
			select: { id: true, domain: true },
		});
		return rows;
	} catch (err) {
		console.warn(
			"[competitor-deep-fetch] failed to load CompetitorDomain rows:",
			err instanceof Error ? err.message : err,
		);
		return [];
	}
}

// ── Pricing extraction ───────────────────────────────────────

interface PricingTier {
	label: string | null;
	amount: number | null;
	currency: string | null;
	interval: "month" | "year" | "one_time" | null;
	amount_raw: string;
}

// Regex pra valores monetários comuns: $99, $99.99, R$ 49, R$ 1.499,
// €29.50 etc. Aceita opcionalmente "/mês", "/mo", "/year" etc.
const MONEY_REGEX =
	/(?:(\$|R\$|€|£|US\$)\s*)([\d]+(?:[.,]\d{1,3})?(?:[.,]\d{3})?)(?:\s*\/\s*(mês|mes|month|mo|year|yr|ano))?/gi;

function inferCurrency(symbol: string): string {
	if (symbol === "$" || symbol.toUpperCase() === "US$") return "USD";
	if (symbol === "R$") return "BRL";
	if (symbol === "€") return "EUR";
	if (symbol === "£") return "GBP";
	return "USD";
}

function inferInterval(raw: string | undefined): PricingTier["interval"] {
	if (!raw) return null;
	const lower = raw.toLowerCase();
	if (lower === "month" || lower === "mes" || lower === "mês" || lower === "mo") return "month";
	if (lower === "year" || lower === "yr" || lower === "ano") return "year";
	return null;
}

function parseAmount(raw: string): number | null {
	// "1.499,90" (BR) ou "1,499.90" (US). Heurística: vírgula seguida
	// de 2 dígitos no fim = decimal BR; ponto seguido de 2 dígitos no
	// fim = decimal US.
	let normalized = raw;
	if (/,\d{2}$/.test(normalized)) {
		// BR style — strip dots, replace comma com point
		normalized = normalized.replace(/\./g, "").replace(",", ".");
	} else if (/\.\d{2}$/.test(normalized)) {
		// US style — strip commas
		normalized = normalized.replace(/,/g, "");
	} else {
		// Sem decimal — strip todos separadores
		normalized = normalized.replace(/[.,]/g, "");
	}
	const n = parseFloat(normalized);
	return Number.isFinite(n) ? n : null;
}

function extractTierLabel(html: string, moneyIndex: number): string | null {
	// Olha pra trás na string a partir de moneyIndex pra achar uma
	// heading próxima (h1/h2/h3 ou texto em strong/b).
	const window = html.slice(Math.max(0, moneyIndex - 400), moneyIndex);
	const headingMatch =
		window.match(/<h[1-3][^>]*>\s*([^<]{2,40})\s*<\/h[1-3]>(?:[\s\S]{0,100})$/i) ||
		window.match(/<(?:strong|b)[^>]*>\s*([^<]{2,40})\s*<\/(?:strong|b)>(?:[\s\S]{0,100})$/i);
	if (!headingMatch) return null;
	return headingMatch[1].trim().slice(0, 40);
}

function extractPricingTiers(html: string): PricingTier[] {
	const tiers: PricingTier[] = [];
	const seenAmounts = new Set<string>();
	const matches = Array.from(html.matchAll(MONEY_REGEX));
	for (const m of matches) {
		const symbol = m[1] ?? "$";
		const amountRaw = m[2] ?? "";
		const intervalRaw = m[3];
		const amount = parseAmount(amountRaw);
		const key = `${symbol}${amountRaw}${intervalRaw ?? ""}`;
		if (seenAmounts.has(key)) continue;
		seenAmounts.add(key);
		const label = m.index !== undefined ? extractTierLabel(html, m.index) : null;
		tiers.push({
			label,
			amount,
			currency: inferCurrency(symbol),
			interval: inferInterval(intervalRaw),
			amount_raw: m[0],
		});
		if (tiers.length >= 10) break;
	}
	return tiers;
}

function detectFreeTier(html: string): boolean {
	return /\b(?:gr[áa]tis|free|gratu[íi]to|free\s*plan|free\s*forever|sem\s*custo|R\$\s*0|\$\s*0)\b/i.test(
		html,
	);
}

// ── Blog content velocity ───────────────────────────────────

function countBlogPosts(html: string): number | null {
	// Estratégia 1: <article> tags
	const articleCount = (html.match(/<article\b/gi) || []).length;
	if (articleCount >= 3) return articleCount;

	// Estratégia 2: links que parecem post URLs (paths longos com slash
	// + slug com hífens, característicos de slug de post)
	const postLinkMatches = html.matchAll(
		/<a\b[^>]+href=["'](?:[^"']*?\/(?:blog|posts|articles|p)\/)?([a-z0-9-]{8,80})["']/gi,
	);
	const uniqueSlugs = new Set<string>();
	for (const m of postLinkMatches) {
		const slug = m[1];
		if (slug.includes("-")) uniqueSlugs.add(slug);
	}
	if (uniqueSlugs.size >= 3) return uniqueSlugs.size;

	return null;
}

function extractLatestPostDate(html: string): string | null {
	// Date pubdate (semantic), datetime attr, JSON-LD datePublished
	const datetimeMatch = html.match(
		/<time\b[^>]*\sdatetime=["'](\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}[\d:Z+-]*)?)["']/i,
	);
	if (datetimeMatch) return datetimeMatch[1];

	const jsonLdMatch = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
	if (jsonLdMatch) return jsonLdMatch[1];

	// Fallback: padrão DD/MM/AAAA ou Mês AAAA — pulamos por agora pra evitar false positives
	return null;
}

// ── Probe + fetch helpers ────────────────────────────────────

async function probePath(
	baseDomain: string,
	paths: string[],
): Promise<{ url: string; html: string } | null> {
	for (const path of paths) {
		const url = `https://${baseDomain}${path}`;
		try {
			const res: SafeFetchResult = await safeFetch(url);
			if (res.status_code >= 200 && res.status_code < 300 && res.body.length > 200) {
				return { url, html: res.body };
			}
		} catch {
			// Try next path
		}
	}
	return null;
}

// ── Snapshot orchestration ───────────────────────────────────

async function snapshotDeep(competitorDomain: string): Promise<CompetitorDeepSnapshotPayload> {
	const fetched_at = new Date().toISOString();

	// Pricing
	let pricingPayload: Pick<
		CompetitorDeepSnapshotPayload,
		"pricing_url" | "pricing_fetch_failed" | "pricing_error" | "pricing_tiers" | "has_free_tier" | "tier_count"
	>;
	try {
		const found = await probePath(competitorDomain, PRICING_PATHS);
		if (!found) {
			pricingPayload = {
				pricing_url: null,
				pricing_fetch_failed: false,
				pricing_error: "no_path_matched",
				pricing_tiers: [],
				has_free_tier: false,
				tier_count: 0,
			};
		} else {
			const tiers = extractPricingTiers(found.html);
			pricingPayload = {
				pricing_url: found.url,
				pricing_fetch_failed: false,
				pricing_error: null,
				pricing_tiers: tiers,
				has_free_tier: detectFreeTier(found.html),
				tier_count: tiers.length,
			};
		}
	} catch (err) {
		pricingPayload = {
			pricing_url: null,
			pricing_fetch_failed: true,
			pricing_error: err instanceof Error ? err.message : String(err),
			pricing_tiers: [],
			has_free_tier: false,
			tier_count: 0,
		};
	}

	// Blog
	let blogPayload: Pick<
		CompetitorDeepSnapshotPayload,
		"blog_url" | "blog_fetch_failed" | "blog_error" | "blog_post_count" | "blog_latest_post_date"
	>;
	try {
		const found = await probePath(competitorDomain, BLOG_PATHS);
		if (!found) {
			blogPayload = {
				blog_url: null,
				blog_fetch_failed: false,
				blog_error: "no_path_matched",
				blog_post_count: null,
				blog_latest_post_date: null,
			};
		} else {
			blogPayload = {
				blog_url: found.url,
				blog_fetch_failed: false,
				blog_error: null,
				blog_post_count: countBlogPosts(found.html),
				blog_latest_post_date: extractLatestPostDate(found.html),
			};
		}
	} catch (err) {
		blogPayload = {
			blog_url: null,
			blog_fetch_failed: true,
			blog_error: err instanceof Error ? err.message : String(err),
			blog_post_count: null,
			blog_latest_post_date: null,
		};
	}

	return {
		type: "competitor_deep_snapshot",
		competitor_domain: competitorDomain,
		...pricingPayload,
		...blogPayload,
		fetched_at,
	};
}

export const competitorDeepFetchPass: EnrichmentPass = {
	name: "competitor_deep_fetch",
	label: "Pricing e velocidade de conteúdo dos concorrentes",

	shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
		if (ctx.mode !== "full") {
			return {
				run: false,
				reason: `Skipped: deep-fetch runs only in full-mode (mode=${ctx.mode})`,
			};
		}
		const envId = envIdFromRef(ctx.scoping.environment_ref);
		if (!envId) {
			return {
				run: false,
				reason: "Skipped: cannot derive environmentId from scoping",
			};
		}
		return {
			run: true,
			reason: "Pricing + blog probe of curated competitors",
		};
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		try {
			const envId = envIdFromRef(ctx.scoping.environment_ref);
			if (!envId) {
				return buildFailedResult(
					competitorDeepFetchPass.name,
					"cannot derive environmentId from scoping",
					Date.now() - start,
					1,
				);
			}
			const competitors = await loadActiveCompetitors(envId);
			if (competitors.length === 0) {
				return {
					pass_name: competitorDeepFetchPass.name,
					status: "completed",
					reason: "No active competitor domains configured for this env",
					evidence_added: [],
					duration_ms: Date.now() - start,
					attempts: 1,
				};
			}

			ctx.emit({
				type: "pass_progress",
				pass: competitorDeepFetchPass.name,
				message: `Probing pricing + blog for ${competitors.length} competitor(s)`,
			} as any);

			const snapshots = await Promise.all(
				competitors.map((c) =>
					snapshotDeep(c.domain).catch(
						(err): CompetitorDeepSnapshotPayload => ({
							type: "competitor_deep_snapshot",
							competitor_domain: c.domain,
							pricing_url: null,
							pricing_fetch_failed: true,
							pricing_error: err instanceof Error ? err.message : String(err),
							pricing_tiers: [],
							has_free_tier: false,
							tier_count: 0,
							blog_url: null,
							blog_fetch_failed: true,
							blog_error: err instanceof Error ? err.message : String(err),
							blog_post_count: null,
							blog_latest_post_date: null,
							fetched_at: new Date().toISOString(),
						}),
					),
				),
			);

			const evidenceIds = new IdGenerator("ev_compet_deep");
			const now = new Date();
			const evidence: Evidence[] = snapshots.map((payload) => ({
				id: evidenceIds.next(),
				evidence_key: `competitor_deep_snapshot:${payload.competitor_domain}`,
				evidence_type: EvidenceType.CompetitorDeepSnapshot,
				subject_ref: `competitor:${payload.competitor_domain}`,
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
				quality_score:
					payload.pricing_url || payload.blog_url ? 75 : 35,
				content_hash: null,
				created_at: now,
				updated_at: now,
			}));

			const pricingHits = snapshots.filter((s) => s.pricing_url).length;
			const blogHits = snapshots.filter((s) => s.blog_url).length;
			return {
				pass_name: competitorDeepFetchPass.name,
				status: "completed",
				reason: `${snapshots.length} competitor(s) probed; ${pricingHits} pricing + ${blogHits} blog detected`,
				evidence_added: evidence,
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		} catch (err) {
			return buildFailedResult(
				competitorDeepFetchPass.name,
				`competitor-deep-fetch threw: ${err instanceof Error ? err.message : String(err)}`,
				Date.now() - start,
				1,
			);
		}
	},
};
