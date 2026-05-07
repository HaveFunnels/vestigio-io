import {
  Evidence,
  Scoping,
  FreshnessState,
  Decision,
  Action,
  Inference,
  Signal,
  makeRef,
} from '../../packages/domain';
import { recomputeAll, MultiPackResult } from '../../packages/workspace';
import type { CycleSnapshot } from '../../packages/change-detection';
import { GraphQuery } from '../../packages/graph';
import { buildGraph } from '../../packages/graph';
import type {
  RootCause,
  GlobalAction,
  DecisionLink,
  DecisionIntelligenceResult,
} from '../../packages/intelligence';
import { projectAll, ProjectionResult, FindingProjection, ActionProjection, WorkspaceProjection, ChangeReportProjection, EngineTranslations } from '../../packages/projections';
import { buildAllMaps, MapDefinition } from '../../packages/maps';
import { McpRequestScope } from './types';

// ──────────────────────────────────────────────
// Context Assembler — bridge between MCP and engine
//
// MCP never calls engine internals directly.
// This module runs the engine pipeline and returns
// structured context for MCP tools and resources.
// ──────────────────────────────────────────────

export interface EngineContext {
  result: MultiPackResult;
  scope: McpRequestScope;
  cycle_ref: string;
  root_domain: string;
  landing_url: string;
  translations?: EngineTranslations;
  /** Persisted findings from DB — used as supplement when hot-path recompute
   *  misses findings that depend on LLM enrichment from previous cycles. */
  persistedFindings?: FindingProjection[];
  /** Cached projectAll() output — avoids redundant recomputation across
   *  multiple tool calls within the same request. Invalidated on loadContext(). */
  _projectionCache?: ProjectionResult;
}

export function assembleContext(
  evidence: Evidence[],
  scope: McpRequestScope,
  cycle_ref: string,
  root_domain: string,
  landing_url: string,
  conversion_proximity: number,
  is_production: boolean,
  translations?: EngineTranslations,
  // Wave 0.7: Optional previous snapshot for change detection. When the
  // caller pre-loads it from PrismaSnapshotStore (in ensureContext or
  // bootstrapMcpContextSync), the engine output gets a populated
  // change_report and FindingProjections gain real change_class values.
  // Stays optional to keep all existing test callers compatible.
  previousSnapshot?: CycleSnapshot | null,
): EngineContext {
  const scoping: Scoping = {
    workspace_ref: scope.workspace_ref,
    environment_ref: scope.environment_ref,
    subject_ref: scope.subject_ref || `website:${root_domain}`,
    path_scope: scope.path_scope || null,
  };

  const result = recomputeAll({
    evidence,
    scoping,
    cycle_ref,
    root_domain,
    landing_url,
    conversion_proximity,
    is_production,
    previous_snapshot: previousSnapshot ?? null,
    translations,
  });

  return { result, scope, cycle_ref, root_domain, landing_url, translations };
}

// ── Cached projection accessor ──────────────────
// projectAll() is pure (same input → same output) so we cache
// on first call and reuse across all tool invocations in the request.

function getCachedProjections(ctx: EngineContext): ProjectionResult {
  if (!ctx._projectionCache) {
    ctx._projectionCache = projectAll(ctx.result, ctx.translations);
  }
  return ctx._projectionCache;
}

// Accessors — typed getters over context, no business logic

export function getScaleDecision(ctx: EngineContext): Decision {
  return ctx.result.scale_readiness.decision;
}

export function getRevenueDecision(ctx: EngineContext): Decision {
  return ctx.result.revenue_integrity.decision;
}

export function getAllDecisions(ctx: EngineContext): Decision[] {
  return [
    ctx.result.scale_readiness.decision,
    ctx.result.revenue_integrity.decision,
  ];
}

export function getScaleActions(ctx: EngineContext): Action[] {
  return ctx.result.scale_readiness.actions;
}

export function getRevenueActions(ctx: EngineContext): Action[] {
  return ctx.result.revenue_integrity.actions;
}

export function getInferences(ctx: EngineContext): Inference[] {
  return ctx.result.inferences;
}

export function getSignals(ctx: EngineContext): Signal[] {
  return ctx.result.signals;
}

export function getIntelligence(ctx: EngineContext): DecisionIntelligenceResult {
  return ctx.result.intelligence;
}

export function getRootCauses(ctx: EngineContext): RootCause[] {
  return ctx.result.intelligence.root_causes;
}

export function getGlobalActions(ctx: EngineContext): GlobalAction[] {
  return ctx.result.intelligence.global_actions;
}

export function getDecisionLinks(ctx: EngineContext): DecisionLink[] {
  return ctx.result.intelligence.decision_links;
}

export function getImpactSummary(ctx: EngineContext): import('../../packages/impact').ImpactSummary {
  return ctx.result.impact.summary;
}

export function getValueCases(ctx: EngineContext): import('../../packages/impact').QuantifiedValueCase[] {
  return ctx.result.impact.value_cases;
}

export function getProjections(ctx: EngineContext): ProjectionResult {
  return getCachedProjections(ctx);
}

export function getFindingProjections(ctx: EngineContext): FindingProjection[] {
  const recomputed = getCachedProjections(ctx).findings;

  // Merge persisted findings that the hot-path didn't reproduce.
  // This happens when the latest evidence cycle is warm (no LLM) but a
  // previous cold cycle produced LLM-dependent findings (copy_alignment, etc.).
  // Without this merge, workspaces like "Copy" appear empty despite findings
  // existing in the DB from a prior cycle.
  if (!ctx.persistedFindings || ctx.persistedFindings.length === 0) {
    return recomputed;
  }

  const recomputedKeys = new Set(recomputed.map(f => f.inference_key));
  const supplemental = ctx.persistedFindings.filter(
    f => !recomputedKeys.has(f.inference_key) && f.confidence_tier !== 'low'
  );

  if (supplemental.length === 0) return recomputed;
  return [...recomputed, ...supplemental];
}

export function getActionProjections(ctx: EngineContext): ActionProjection[] {
  return getCachedProjections(ctx).actions;
}

export function getWorkspaceProjections(ctx: EngineContext): WorkspaceProjection[] {
  const projections = getCachedProjections(ctx);

  // Supplement workspace findings with persisted data from previous cycles
  if (ctx.persistedFindings && ctx.persistedFindings.length > 0) {
    const recomputedKeys = new Set(projections.findings.map(f => f.inference_key));
    const supplemental = ctx.persistedFindings.filter(
      f => !recomputedKeys.has(f.inference_key) && f.confidence_tier !== 'low'
    );
    if (supplemental.length > 0) {
      // Inject supplemental findings into their matching workspaces
      for (const ws of projections.workspaces) {
        const packKey = (ws as any).pack_key?.replace('_pack', '') || '';
        const matching = supplemental.filter(f => f.pack === packKey);
        if (matching.length > 0) {
          ws.findings = [...ws.findings, ...matching];
          ws.summary.issue_count += matching.length;
        }
      }
    }
  }

  return projections.workspaces;
}

export function getChangeReport(ctx: EngineContext): ChangeReportProjection | null {
  return getCachedProjections(ctx).change_report;
}

export function getMaps(ctx: EngineContext): MapDefinition[] {
  const projections = getCachedProjections(ctx);
  return buildAllMaps(projections, ctx.result, ctx.translations);
}

export function getMap(ctx: EngineContext, mapType: string): MapDefinition | null {
  const maps = getMaps(ctx);
  return maps.find(m => m.type === mapType) || null;
}

export function getOverallFreshness(ctx: EngineContext): FreshnessState {
  const scale = ctx.result.scale_readiness.decision.freshness.freshness_state;
  const revenue = ctx.result.revenue_integrity.decision.freshness.freshness_state;
  if (scale === FreshnessState.Expired || revenue === FreshnessState.Expired) return FreshnessState.Expired;
  if (scale === FreshnessState.Stale || revenue === FreshnessState.Stale) return FreshnessState.Stale;
  if (scale === FreshnessState.Unknown || revenue === FreshnessState.Unknown) return FreshnessState.Unknown;
  return FreshnessState.Fresh;
}
