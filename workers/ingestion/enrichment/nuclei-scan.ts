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
  NucleiMatchPayload,
  IdGenerator,
} from "../../../packages/domain";
import { isNucleiAvailable, runNucleiScan } from "../../nuclei/runner";
import { normalizeNucleiMatches } from "../../../packages/nuclei-adapter/normalizer";
import type { CommercialDownsideFamily } from "../../../packages/nuclei-adapter/types";

const ALL_FAMILIES: CommercialDownsideFamily[] = [
  "payment_integrity",
  "channel_trust",
  "commerce_continuity",
  "trust_posture",
  "abuse_exposure",
];

export const nucleiScanPass: EnrichmentPass = {
  name: "nuclei_scan",
  label: "Security Scan (Nuclei)",

  shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
    if (ctx.mode !== "full") {
      return { run: false, reason: "Nuclei scan only runs in full mode." };
    }
    return { run: true, reason: "Full-mode audit — will check if nuclei binary is available at runtime." };
  },

  async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
    const start = Date.now();

    const available = await isNucleiAvailable();
    if (!available) {
      return {
        pass_name: "nuclei_scan",
        status: "skipped",
        reason: "Nuclei binary not installed or not in PATH. Rule-based security signals continue working.",
        evidence_added: [],
        duration_ms: Date.now() - start,
        attempts: 1,
      };
    }

    try {
      ctx.emit({
        type: "stage_progress",
        stage: "enrichment",
        data: { message: "Running curated security scan..." },
        timestamp: new Date(),
      });

      const scanResult = await runNucleiScan({
        targets: [ctx.landing_url],
        families: ALL_FAMILIES,
        max_templates: 50,
        timeout_seconds: 120,
        rate_limit: 10,
      });

      const normalized = normalizeNucleiMatches(scanResult.matches);

      if (normalized.length === 0 && scanResult.errors.length === 0) {
        return {
          pass_name: "nuclei_scan",
          status: "completed",
          reason: `Scanned ${scanResult.templates_executed} templates — no commercial-relevant matches found.`,
          evidence_added: [],
          duration_ms: Date.now() - start,
          attempts: 1,
        };
      }

      const ids = new IdGenerator("nuc");
      const evidence: Evidence[] = normalized.map((match) => ({
        id: ids.next(),
        evidence_key: `nuclei_${match.check_id}_${match.matched_at}`,
        evidence_type: EvidenceType.NucleiMatch,
        subject_ref: match.matched_at,
        source_kind: SourceKind.NucleiScan,
        collection_method: CollectionMethod.ExternalToolScan,
        scoping: ctx.scoping,
        cycle_ref: ctx.cycle_ref,
        payload: {
          type: "nuclei_match",
          check_id: match.check_id,
          downside_family: match.downside_family,
          matched_at: match.matched_at,
          is_commercial_surface: match.is_commercial_surface,
          commercial_interpretation: match.commercial_interpretation,
          confidence: match.confidence,
          severity_weight: match.severity_weight,
          technical_detail: match.technical_detail,
        } as NucleiMatchPayload,
        freshness: {
          observed_at: new Date(),
          fresh_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
          freshness_state: FreshnessState.Fresh,
          staleness_reason: null,
        },
        // Nuclei confidence already lives on 0–100; cap within the quality
        // band other producers use so downstream scoring stays comparable.
        quality_score: Math.max(50, Math.min(95, match.confidence)),
        created_at: new Date(),
        updated_at: new Date(),
      }));

      return {
        pass_name: "nuclei_scan",
        status: "completed",
        reason: `${normalized.length} match(es) from ${scanResult.templates_executed} templates in ${scanResult.duration_ms}ms.`,
        evidence_added: evidence,
        duration_ms: Date.now() - start,
        attempts: 1,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[nuclei-scan-pass] error:", msg);
      return buildFailedResult("nuclei_scan", `Nuclei scan failed: ${msg}`, Date.now() - start, 1);
    }
  },
};
