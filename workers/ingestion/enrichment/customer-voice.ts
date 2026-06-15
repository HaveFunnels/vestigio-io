import {
	CollectionMethod,
	type CustomerVoiceSnapshotPayload,
	type Evidence,
	EvidenceType,
	FreshnessState,
	IdGenerator,
	SourceKind,
} from "../../../packages/domain";
import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import { scrapeReclameAqui } from "./external-recon/reclame-aqui";
import { prisma } from "../../../src/libs/prismaDb";

// ──────────────────────────────────────────────
// Customer Voice enricher — Wave 27 (Reclame Aqui only)
//
// Captures Reclame Aqui reputation data for the env's own brand AND
// each curated competitor so the signal extractor can compute a
// reputation/resolution-index delta.
//
// Why DDG SERP and not direct scrape: Reclame Aqui is a Cloudflare-
// protected React SPA — no public API, JS-rendered content. The
// existing scrapeReclameAqui() function (Wave 12) reads DDG SERP
// snippets which carry the post-render badge + index text. Less
// rich than direct scraping but stable, ToS-friendly, zero auth.
//
// Cost model:
//   - 1 DDG SERP request per brand (yours + each competitor)
//   - Capped at 5 competitors / cycle (cost + signal density)
//   - At 1k envs daily: ~6 requests × 1000 × 30 = 180k DDG calls/mo
//     (DDG isn't priced — only fragile under heavy load)
//
// Gated to full-mode audits AND requires at least 1 active
// curated competitor (no competitor → no peer-comparison → no
// reason to run).
// ──────────────────────────────────────────────

const PASS_NAME = "customer_voice";
const MAX_COMPETITORS_PER_CYCLE = 5;
const PLATFORM_RECLAME_AQUI: CustomerVoiceSnapshotPayload["platform"] =
	"reclame_aqui";

function envIdFromRef(environmentRef: string): string | null {
	const idx = environmentRef.indexOf(":");
	if (idx < 0) return null;
	return environmentRef.slice(idx + 1) || null;
}

// Brand token = first label of the apex domain, hyphens → spaces.
// Same convention as brand-intel-scan / serp-observation.
function brandTokenFromDomain(domain: string): string {
	const apex = domain.replace(/^www\./, "").toLowerCase();
	const firstLabel = apex.split(".")[0] || apex;
	return firstLabel.replace(/-/g, " ").trim();
}

async function loadActiveCompetitors(
	envId: string,
): Promise<Array<{ id: string; domain: string }>> {
	try {
		return await prisma.competitorDomain.findMany({
			where: { environmentId: envId, active: true },
			orderBy: { addedAt: "desc" },
			take: MAX_COMPETITORS_PER_CYCLE,
			select: { id: true, domain: true },
		});
	} catch (err) {
		console.warn(
			"[customer-voice] failed to load competitors:",
			err instanceof Error ? err.message : err,
		);
		return [];
	}
}

interface ScrapeAttempt {
	source_label: string;
	brand_token: string;
	competitor_domain: string | null; // null for self
}

async function snapshotOne(
	attempt: ScrapeAttempt,
): Promise<CustomerVoiceSnapshotPayload> {
	const fetched_at = new Date().toISOString();
	try {
		const result = await scrapeReclameAqui(attempt.brand_token);
		if (!result.reachable) {
			return {
				type: "customer_voice_snapshot",
				source_label: attempt.source_label,
				brand_token: attempt.brand_token,
				platform: PLATFORM_RECLAME_AQUI,
				listed: false,
				company_page_url: null,
				reputation_label: null,
				resolution_index: null,
				complaints_total: null,
				snippet_excerpt: null,
				unlisted_reason: result.error_kind || "unreachable",
				fetched_at,
				fetched_url: result.fetched_url,
			};
		}
		const data = result.data as {
			listed: boolean;
			reason?: string;
			company_page_url?: string;
			reputation_label?: string | null;
			resolution_index?: number | null;
			complaints_total?: number | null;
			snippet_excerpt?: string;
		};
		return {
			type: "customer_voice_snapshot",
			source_label: attempt.source_label,
			brand_token: attempt.brand_token,
			platform: PLATFORM_RECLAME_AQUI,
			listed: data.listed,
			company_page_url: data.company_page_url ?? null,
			reputation_label: data.reputation_label ?? null,
			resolution_index: data.resolution_index ?? null,
			complaints_total: data.complaints_total ?? null,
			snippet_excerpt: data.snippet_excerpt ?? null,
			unlisted_reason: data.listed ? null : data.reason || "no_profile",
			fetched_at,
			fetched_url: result.fetched_url,
		};
	} catch (err) {
		return {
			type: "customer_voice_snapshot",
			source_label: attempt.source_label,
			brand_token: attempt.brand_token,
			platform: PLATFORM_RECLAME_AQUI,
			listed: false,
			company_page_url: null,
			reputation_label: null,
			resolution_index: null,
			complaints_total: null,
			snippet_excerpt: null,
			unlisted_reason: err instanceof Error ? err.message : String(err),
			fetched_at,
			fetched_url: "https://html.duckduckgo.com/html/",
		};
	}
}

export const customerVoicePass: EnrichmentPass = {
	name: PASS_NAME,
	label: "Capturando voz do cliente (Reclame Aqui)",

	shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
		if (ctx.mode !== "full") {
			return {
				run: false,
				reason: `Skipped: runs only in full-mode audits (mode=${ctx.mode})`,
			};
		}
		if (!envIdFromRef(ctx.scoping.environment_ref)) {
			return { run: false, reason: "Skipped: cannot derive environmentId" };
		}
		// Brand token derivation requires a domain; bail if root_domain
		// is empty (shouldn't happen in production but defensive).
		if (!ctx.root_domain || ctx.root_domain.length < 3) {
			return { run: false, reason: "Skipped: no root_domain for brand token" };
		}
		return {
			run: true,
			reason: "Reclame Aqui snapshot for self + curated competitors",
		};
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		try {
			const envId = envIdFromRef(ctx.scoping.environment_ref);
			if (!envId) {
				return buildFailedResult(
					PASS_NAME,
					"cannot derive environmentId",
					Date.now() - start,
					1,
				);
			}

			const competitors = await loadActiveCompetitors(envId);
			// No peers → no comparison signal can fire. Skip with a clear
			// completed status so the cycle log shows the no-op explicitly.
			if (competitors.length === 0) {
				return {
					pass_name: PASS_NAME,
					status: "completed",
					reason: "No active competitors. Customer voice delta needs ≥1 peer",
					evidence_added: [],
					duration_ms: Date.now() - start,
					attempts: 1,
				};
			}

			const ownBrand = brandTokenFromDomain(ctx.root_domain);
			const attempts: ScrapeAttempt[] = [
				{
					source_label: "self",
					brand_token: ownBrand,
					competitor_domain: null,
				},
				...competitors.map((c) => ({
					source_label: `competitor:${c.domain}`,
					brand_token: brandTokenFromDomain(c.domain),
					competitor_domain: c.domain,
				})),
			];

			ctx.emit({
				type: "pass_progress",
				pass: PASS_NAME,
				message: `Querying Reclame Aqui via DDG for ${attempts.length} brand(s)`,
			} as any);

			// Run sequentially with a small pace to be polite to DDG.
			const snapshots: CustomerVoiceSnapshotPayload[] = [];
			for (let i = 0; i < attempts.length; i++) {
				const payload = await snapshotOne(attempts[i]);
				snapshots.push(payload);
				if (i < attempts.length - 1) {
					await new Promise((r) => setTimeout(r, 600));
				}
			}

			const evidenceIds = new IdGenerator("ev_cvoice");
			const now = new Date();
			const evidence: Evidence[] = snapshots.map((payload) => ({
				id: evidenceIds.next(),
				evidence_key: `customer_voice_snapshot:${PLATFORM_RECLAME_AQUI}:${payload.source_label}`,
				evidence_type: EvidenceType.CustomerVoiceSnapshot,
				subject_ref:
					payload.source_label === "self"
						? ctx.scoping.subject_ref || `website:${ctx.root_domain}`
						: payload.source_label,
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
				quality_score: payload.listed ? 70 : 30,
				content_hash: null,
				created_at: now,
				updated_at: now,
			}));

			const listedCount = snapshots.filter((s) => s.listed).length;
			return {
				pass_name: PASS_NAME,
				status: "completed",
				reason: `Customer voice: ${listedCount}/${snapshots.length} brands listed on Reclame Aqui`,
				evidence_added: evidence,
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		} catch (err) {
			return buildFailedResult(
				PASS_NAME,
				`customer-voice threw: ${err instanceof Error ? err.message : String(err)}`,
				Date.now() - start,
				1,
			);
		}
	},
};

export const __testing = {
	brandTokenFromDomain,
};
