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
  KatanaDiscoveryPayload,
  IdGenerator,
} from "../../../packages/domain";
import { isKatanaAvailable, runKatanaScan } from "../../katana/runner";
import { normalizeKatanaResults } from "../../../packages/katana-adapter/normalizer";

export const katanaDiscoveryPass: EnrichmentPass = {
  name: "katana_discovery",
  label: "Deep Route Discovery (Katana)",

  shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
    if (ctx.mode !== "full") {
      return { run: false, reason: "Katana only runs in full mode." };
    }
    // Previously gated on `spa_detected` + `evaluateKatanaConditions`
    // heuristic. Both were too restrictive: SSR-heavy sites (e.g.
    // havefunnels) embed JS bundles with routes/endpoints worth
    // extracting via -jc, and the conditions heuristic relied on
    // surface signals that don't reflect the value of bundle parsing.
    // Confirmed against 30 days of havefunnels cycles where Katana
    // never fired despite 30 full cycles. Cost cap stays in run():
    // max_pages=100, timeout=120s.
    return {
      run: true,
      reason: "Full-mode audit — will check katana binary at runtime.",
    };
  },

  async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
    const start = Date.now();

    const available = await isKatanaAvailable();
    if (!available) {
      return {
        pass_name: "katana_discovery",
        status: "skipped",
        reason: "Katana binary not installed or not in PATH.",
        evidence_added: [],
        duration_ms: Date.now() - start,
        attempts: 1,
      };
    }

    try {
      ctx.emit({
        type: "stage_progress",
        stage: "enrichment",
        data: { message: "Running deep JS route discovery..." },
        timestamp: new Date(),
      });

      const scanResult = await runKatanaScan({
        target: ctx.landing_url,
        max_depth: 3,
        max_pages: 100,
        timeout_seconds: 120,
        rate_limit: 10,
        same_host_only: true,
        // Empty — the commercial classifier downstream already filters by
        // route intent; we don't need Katana-level priority biasing.
        priority_patterns: [],
      });

      const knownUrls = new Set([...ctx.coverage.keys()]);
      const normalized = normalizeKatanaResults(scanResult.results, knownUrls);

      if (normalized.total_relevant === 0) {
        return {
          pass_name: "katana_discovery",
          status: "completed",
          reason: `Discovered ${scanResult.urls_discovered} URLs — none commercially relevant beyond static crawl.`,
          evidence_added: [],
          duration_ms: Date.now() - start,
          attempts: 1,
        };
      }

      const ids = new IdGenerator("kat");
      const evidence: Evidence[] = normalized.classified_routes.map((route) => ({
        id: ids.next(),
        // KatanaClassifiedRoute exposes `url` (the discovered URL) — the
        // payload field is also just `url` on the classified side. Evidence
        // row keeps `subject_ref` + `discovered_url` for ergonomic indexing
        // downstream.
        evidence_key: `katana_${route.discovery_family}_${route.url}`,
        evidence_type: EvidenceType.KatanaDiscovery,
        subject_ref: route.url,
        source_kind: SourceKind.KatanaCrawl,
        collection_method: CollectionMethod.ExternalToolScan,
        scoping: ctx.scoping,
        cycle_ref: ctx.cycle_ref,
        payload: {
          type: "katana_discovery",
          discovered_url: route.url,
          discovery_method: route.discovery_method,
          route_intent: route.route_intent,
          discovery_family: route.discovery_family,
          is_net_new: route.is_net_new,
          is_commercial_surface: route.is_commercial_surface,
          appears_guessable: route.appears_guessable,
        } as KatanaDiscoveryPayload,
        freshness: {
          observed_at: new Date(),
          fresh_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
          freshness_state: FreshnessState.Fresh,
          staleness_reason: null,
        },
        // Quality score reflects the classifier's confidence in the route
        // being a real commercial surface (scale 0-100 matches other producers).
        quality_score: Math.max(50, Math.min(95, route.confidence)),
        created_at: new Date(),
        updated_at: new Date(),
      }));

      return {
        pass_name: "katana_discovery",
        status: "completed",
        reason: `${normalized.total_relevant} commercially relevant routes from ${scanResult.urls_discovered} discovered URLs.`,
        evidence_added: evidence,
        duration_ms: Date.now() - start,
        attempts: 1,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[katana-discovery-pass] error:", msg);
      return buildFailedResult("katana_discovery", `Katana scan failed: ${msg}`, Date.now() - start, 1);
    }
  },
};
