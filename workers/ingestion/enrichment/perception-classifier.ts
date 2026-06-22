import {
	CollectionMethod,
	type ContentEnrichmentPayload,
	type Evidence,
	EvidenceType,
	FreshnessState,
	IdGenerator,
	SourceKind,
} from "../../../packages/domain";
import {
	buildPerceptionPrompt,
	parsePerceptionResponse,
	PERCEPTION_CACHE_FLOOR,
	type PageForPerception,
} from "../../../packages/perception";
import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import { callModel, isLlmEnabled } from "../../../apps/mcp/llm/client";
import { buildEnrichmentLlmContext } from "./llm-context";
import { prisma } from "../../../src/libs/prismaDb";

// ──────────────────────────────────────────────
// Perception classifier — PV.2 (multi-vertical coverage track)
//
// One aggregate Haiku call over the crawled page set → a BusinessContext:
// the perceived business vertical (from the closed PV.0 PerceivedVertical
// taxonomy) + the purpose of each page (from the closed SurfacePurpose
// taxonomy). Emits ONE ContentEnrichment evidence (enrichment_type=
// 'business_perception') and, when confident, caches the vertical on the
// Environment row.
//
// PRODUCE-ONLY by design (PV.2): nothing consumes this evidence yet and the
// cached perceivedVertical is read by nobody until PV.3 wires
// resolveEffectiveVertical at the run-cycle chokepoint. So this pass perceives
// + caches WITHOUT changing any finding — you can observe what it perceives on
// real cycles before it affects output. Wiring is PV.3; calibration is PV.6.
//
// Freshness-gated to ~weekly: re-perceives only when the cached vertical is
// null or older than 7d. The EnrichmentContext exposes mode (full/shallow) but
// not the cold/warm/hot cycle type, so this gate — not a cold-only check —
// keeps the cost bounded (~$0.012 per re-perception).
// ──────────────────────────────────────────────

const PASS_NAME = "perception_classifier";
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function envIdFromRef(environmentRef: string): string | null {
	const idx = environmentRef.indexOf(":");
	if (idx < 0) return null;
	return environmentRef.slice(idx + 1) || null;
}

function completed(
	reason: string,
	evidence: Evidence[],
	start: number,
): EnrichmentResult {
	return {
		pass_name: PASS_NAME,
		status: "completed",
		reason,
		evidence_added: evidence,
		duration_ms: Date.now() - start,
		attempts: 1,
		cost_units: evidence.length > 0 ? 1 : 0,
	};
}

export const perceptionClassifierPass: EnrichmentPass = {
	name: PASS_NAME,
	label: "Percebendo o tipo de negócio",

	shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
		if (ctx.mode !== "full") {
			return { run: false, reason: `Skipped: full-mode only (mode=${ctx.mode})` };
		}
		if (!isLlmEnabled()) {
			return { run: false, reason: "Skipped: LLM disabled (ANTHROPIC_API_KEY missing)" };
		}
		if (!envIdFromRef(ctx.scoping.environment_ref)) {
			return { run: false, reason: "Skipped: cannot derive environmentId" };
		}
		return { run: true, reason: "Perceiving business vertical + surface purposes" };
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		try {
			const envId = envIdFromRef(ctx.scoping.environment_ref);
			if (!envId) {
				return buildFailedResult(PASS_NAME, "cannot derive environmentId", Date.now() - start, 1);
			}

			// Freshness gate — re-perceive at most ~weekly. Vertical doesn't
			// change cycle-to-cycle, so this bounds cost without a cold-only flag.
			const existing = await prisma.environment
				.findUnique({ where: { id: envId }, select: { perceivedVerticalUpdatedAt: true } })
				.catch(() => null);
			if (
				existing?.perceivedVerticalUpdatedAt &&
				Date.now() - existing.perceivedVerticalUpdatedAt.getTime() < FRESH_MS
			) {
				return completed("perception fresh (<7d), skipped", [], start);
			}

			// Gather crawled pages (title / h1 / snippet) — the LLM judges the
			// vertical from the whole site, so one aggregate call over all pages.
			const pages: PageForPerception[] = [];
			const validUrls = new Set<string>();
			for (const ev of ctx.evidence) {
				if (ev.evidence_type !== EvidenceType.PageContent) continue;
				const p = ev.payload as {
					url?: string;
					title?: string | null;
					h1?: string | null;
					body_text_snippet?: string | null;
				};
				if (!p.url || validUrls.has(p.url)) continue;
				validUrls.add(p.url);
				pages.push({
					url: p.url,
					title: p.title ?? null,
					h1: p.h1 ?? null,
					snippet: p.body_text_snippet ?? null,
				});
			}
			if (pages.length === 0) {
				return completed("no page_content evidence to perceive from", [], start);
			}

			const { system, user } = buildPerceptionPrompt(pages);
			const result = await callModel(
				"haiku_4_5",
				[{ role: "user", content: user }],
				{ max_tokens: 1500, temperature: 0.2, system },
				buildEnrichmentLlmContext("business_perception", ctx.scoping, ctx.cycle_ref),
			);
			const textBlock = result.content.find((b: { type: string }) => b.type === "text");
			if (!textBlock || textBlock.type !== "text") {
				return completed("no text block in LLM response", [], start);
			}

			const perception = parsePerceptionResponse(textBlock.text, validUrls);
			if (!perception) {
				// Fail-closed: malformed JSON or out-of-ontology vertical → emit
				// nothing, leave perceivedVertical untouched (falls back to onboarding).
				return completed("perception parse failed (fail-closed)", [], start);
			}

			const now = new Date();
			const ids = new IdGenerator("ev_perception");
			const payload: ContentEnrichmentPayload = {
				type: "content_enrichment",
				enrichment_type: "business_perception",
				source_evidence_key: `perception:${ctx.root_domain}`,
				source_url: ctx.landing_url,
				scores: { clarity_score: 0, readability_grade: "n/a" },
				flags: { ambiguity_flags: [], regulatory_gaps: [] },
				missing_elements: [],
				results: {
					vertical: perception.vertical,
					vertical_confidence: perception.vertical_confidence,
					reasoning: perception.reasoning,
					surfaces: perception.surfaces,
				},
				confidence: Math.round(perception.vertical_confidence * 100),
				model_used: result.model,
				cached: false,
			};
			const evidence: Evidence = {
				id: ids.next(),
				evidence_key: "content_enrichment:business_perception:self",
				evidence_type: EvidenceType.ContentEnrichment,
				subject_ref: ctx.scoping.subject_ref,
				scoping: ctx.scoping,
				cycle_ref: ctx.cycle_ref,
				freshness: {
					observed_at: now,
					fresh_until: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
					freshness_state: FreshnessState.Fresh,
					staleness_reason: null,
				},
				source_kind: SourceKind.HttpFetch,
				collection_method: CollectionMethod.ApiCall,
				payload,
				quality_score: payload.confidence,
				created_at: now,
				updated_at: now,
			};

			ctx.emit({
				type: "pass_progress",
				pass: PASS_NAME,
				message: `Perceived vertical=${perception.vertical} (${Math.round(
					perception.vertical_confidence * 100,
				)}%), ${perception.surfaces.length} surface(s) labeled`,
			} as never);

			// Cache the vertical on the Environment only when confident enough.
			// Below the floor we still return the evidence (observable) but keep
			// perceivedVertical null so reconciliation stays on the onboarding prior.
			if (perception.vertical_confidence >= PERCEPTION_CACHE_FLOOR) {
				prisma.environment
					.update({
						where: { id: envId },
						data: {
							perceivedVertical: perception.vertical,
							perceivedVerticalConfidence: perception.vertical_confidence,
							perceivedVerticalUpdatedAt: now,
						},
					})
					.catch((err: unknown) => {
						console.warn(
							`[${PASS_NAME}] perceivedVertical cache write failed:`,
							err instanceof Error ? err.message : err,
						);
					});
			}

			return completed(
				`perceived vertical=${perception.vertical} conf=${perception.vertical_confidence}`,
				[evidence],
				start,
			);
		} catch (err) {
			return buildFailedResult(
				PASS_NAME,
				err instanceof Error ? err.message : String(err),
				Date.now() - start,
				1,
			);
		}
	},
};
