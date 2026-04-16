import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import {
	Evidence,
	EvidenceType,
	SourceKind,
	CollectionMethod,
	FreshnessState,
	BrandImpersonationMatchPayload,
	IdGenerator,
} from "../../../packages/domain";
import { runBrandScan } from "../../brand-intel/scanner";
import type { BrandImpersonationCandidate } from "../../../packages/brand-adapter/types";

// ──────────────────────────────────────────────
// Brand Intelligence Scan — enrichment pass
//
// Bridges workers/brand-intel/scanner.ts into the audit cycle. Pre-
// existing code: the scanner was written (DNS + HTTP + similarity
// scoring), the signal engine already consumes
// BrandImpersonationMatchPayload evidence to emit 6 findings
// (lookalike_domain_competing_for_traffic,
// external_sites_mimicking_brand, etc.) — but NOTHING in the pipeline
// was actually invoking runBrandScan. The 6 findings never fired.
//
// This pass is a thin wrapper:
//   1. Derive brand tokens from the root domain (strip TLD + split
//      on dashes; good enough for single-word brands, and real
//      integration can later pull from BusinessProfile).
//   2. Call runBrandScan with capped candidates + rate limit.
//   3. Convert each high/medium-confidence candidate to evidence.
//   4. Skip low-confidence — they'd flood the signal engine with
//      false positives and the scanner already filters by threshold.
//
// Gated to full-mode audits to keep shallow refreshes fast.
// ──────────────────────────────────────────────

function deriveBrandTokens(rootDomain: string): string[] {
	// `exemplolojas.com.br` → ["exemplolojas"]
	// `my-cool-shop.io` → ["my-cool-shop", "my", "cool", "shop"]
	// Full + split forms maximize match rate without drifting.
	const host = rootDomain
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.split("/")[0];
	const bareName = host.split(".")[0];
	if (!bareName) return [];
	const tokens = new Set<string>();
	tokens.add(bareName);
	for (const part of bareName.split(/[-_]+/)) {
		if (part.length >= 3) tokens.add(part);
	}
	return Array.from(tokens);
}

function candidateToEvidence(
	ids: IdGenerator,
	ctx: EnrichmentContext,
	candidate: BrandImpersonationCandidate,
): Evidence {
	return {
		id: ids.next(),
		evidence_key: `brand_${candidate.domain}`,
		evidence_type: EvidenceType.BrandImpersonationMatch,
		subject_ref: candidate.domain,
		source_kind: SourceKind.BrandIntelScan,
		collection_method: CollectionMethod.ExternalToolScan,
		scoping: ctx.scoping,
		cycle_ref: ctx.cycle_ref,
		payload: {
			type: "brand_impersonation_match",
			lookalike_domain: candidate.domain,
			threat_type: candidate.threat_type,
			is_active: candidate.is_active,
			domain_similarity: candidate.domain_similarity,
			has_brand_tokens: candidate.has_brand_tokens,
			title_similarity: candidate.title_similarity,
			has_commerce_signals: candidate.has_commerce_signals,
			confidence_score: candidate.confidence_score,
			commercial_interpretation: candidate.commercial_interpretation,
			brand_keyword_density: candidate.brand_keyword_density,
			has_sensitive_path: candidate.has_sensitive_path,
			has_credential_capture: candidate.has_credential_capture,
			has_payment_capture: candidate.has_payment_capture,
			favicon_similarity_score: candidate.favicon_similarity_score,
		} as BrandImpersonationMatchPayload,
		freshness: {
			observed_at: new Date(),
			fresh_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			freshness_state: FreshnessState.Fresh,
			staleness_reason: null,
		},
		quality_score: Math.max(50, Math.min(95, candidate.confidence_score)),
		created_at: new Date(),
		updated_at: new Date(),
	};
}

export const brandIntelScanPass: EnrichmentPass = {
	name: "brand_intel_scan",
	label: "Brand Impersonation Scan",

	shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
		if (ctx.mode !== "full") {
			return {
				run: false,
				reason: "Brand impersonation scan only runs in full-mode audits.",
			};
		}
		const tokens = deriveBrandTokens(ctx.root_domain);
		if (tokens.length === 0) {
			return {
				run: false,
				reason:
					"No brand tokens could be derived from the root domain — brand scan skipped.",
			};
		}
		return { run: true, reason: "Full-mode audit with derivable brand tokens." };
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		const tokens = deriveBrandTokens(ctx.root_domain);

		try {
			ctx.emit({
				type: "stage_progress",
				stage: "enrichment",
				data: { message: "Scanning for lookalike domains…" },
				timestamp: new Date(),
			});

			const rootHost = ctx.root_domain
				.replace(/^https?:\/\//, "")
				.replace(/^www\./, "")
				.split("/")[0];

			const scanResult = await runBrandScan({
				root_domain: rootHost,
				brand_tokens: tokens,
				max_candidates: 200,
				dns_timeout_ms: 3000,
				rate_limit: 10,
				min_similarity: 40,
				deep_analysis: true,
			});

			// Only emit evidence for high + medium confidence — low
			// confidence would flood the signal engine with false
			// positives and the threshold already filtered by 40.
			const significant = [
				...scanResult.high_confidence,
				...scanResult.medium_confidence,
			];

			if (significant.length === 0) {
				return {
					pass_name: "brand_intel_scan",
					status: "completed",
					reason: `Scanned ${scanResult.candidates_generated} candidates (${scanResult.candidates_active} active) — no significant lookalike matches.`,
					evidence_added: [],
					duration_ms: Date.now() - start,
					attempts: 1,
				};
			}

			const ids = new IdGenerator("bim");
			const evidence = significant.map((c) => candidateToEvidence(ids, ctx, c));

			return {
				pass_name: "brand_intel_scan",
				status: "completed",
				reason: `${significant.length} lookalike match(es) from ${scanResult.candidates_generated} candidates in ${scanResult.duration_ms}ms.`,
				evidence_added: evidence,
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("[brand-intel-scan-pass] error:", msg);
			return buildFailedResult(
				"brand_intel_scan",
				`Brand scan failed: ${msg}`,
				Date.now() - start,
				1,
			);
		}
	},
};
