import {
  FreshnessState,
  DecisionImpact,
  EffectiveSeverity,
  makeRef,
} from '../../packages/domain';
import {
  EngineContext,
  getScaleDecision,
  getRevenueDecision,
  getAllDecisions,
  getRootCauses,
  getGlobalActions,
  getDecisionLinks,
  getIntelligence,
  getOverallFreshness,
} from './context';
import {
  WorkspaceSummaryView,
  PackSummaryView,
  RootCauseSummaryView,
  ActionSummaryView,
  DecisionExplainabilityView,
  PreflightStatusView,
  PreflightItemView,
  RevenueIntegritySummaryView,
  GraphPathSummaryView,
  HealthStatus,
} from './types';

// ──────────────────────────────────────────────
// Resource Providers — typed read-only projections
// Each resource consumes EngineContext and returns
// a stable view. No business logic here.
// ──────────────────────────────────────────────

export function getWorkspaceSummary(ctx: EngineContext): WorkspaceSummaryView {
  const scale = getScaleDecision(ctx);
  const revenue = getRevenueDecision(ctx);
  const rootCauses = getRootCauses(ctx);
  const globalActions = getGlobalActions(ctx);
  const freshness = getOverallFreshness(ctx);

  const scalePack: PackSummaryView = {
    pack_key: 'scale_readiness_pack',
    label: 'Scale Readiness',
    decision_key: scale.decision_key,
    decision_impact: scale.decision_impact,
    effective_severity: scale.effective_severity,
    confidence: scale.confidence_score,
    summary: scale.why.summary,
  };

  const revenuePack: PackSummaryView = {
    pack_key: 'revenue_integrity_pack',
    label: 'Revenue Integrity',
    decision_key: revenue.decision_key,
    decision_impact: revenue.decision_impact,
    effective_severity: revenue.effective_severity,
    confidence: revenue.confidence_score,
    summary: revenue.why.summary,
  };

  const rootCauseViews = rootCauses.map(toRootCauseView);
  const actionViews = globalActions.slice(0, 10).map(a => toActionView(a, rootCauses));

  const overallConfidence = Math.round(
    (scale.confidence_score + revenue.confidence_score) / 2,
  );

  return {
    workspace_ref: ctx.scope.workspace_ref,
    environment_ref: ctx.scope.environment_ref,
    cycle_ref: ctx.cycle_ref,
    packs: [scalePack, revenuePack],
    root_causes: rootCauseViews,
    prioritized_actions: actionViews,
    overall_health: computeHealth(scale.decision_impact, revenue.decision_impact),
    confidence: overallConfidence,
    freshness,
  };
}

export function getDecisionExplainability(
  ctx: EngineContext,
  packKey: string,
): DecisionExplainabilityView | null {
  const decision = packKey === 'scale_readiness_pack'
    ? getScaleDecision(ctx)
    : packKey === 'revenue_integrity_pack'
      ? getRevenueDecision(ctx)
      : null;

  if (!decision) return null;

  const links = getDecisionLinks(ctx);
  const rootCauses = getRootCauses(ctx);
  const link = links.find(l => l.pack_key === packKey);

  const linkedRCs = (link?.root_cause_refs || [])
    .map(r => rootCauses.find(rc => makeRef('root_cause', rc.id) === r.root_cause_ref))
    .filter((rc): rc is NonNullable<typeof rc> => rc != null)
    .map(toRootCauseView);

  return {
    decision_key: decision.decision_key,
    question_key: decision.question_key,
    pack_key: packKey,
    summary: decision.why.summary,
    confidence: decision.confidence_score,
    freshness: decision.freshness.freshness_state,
    effective_severity: decision.effective_severity,
    decision_impact: decision.decision_impact,
    why_signals: decision.why.signals,
    why_inferences: decision.why.inferences,
    why_evidence_count: decision.why.evidence_refs.length,
    actions: decision.actions,
    root_causes: linkedRCs,
  };
}

export function getPreflightStatus(ctx: EngineContext): PreflightStatusView {
  const ws = ctx.result.scale_readiness.workspace;
  const decision = getScaleDecision(ctx);

  return {
    overall_status: ws.evaluation.summary.overall_status,
    readiness_score: ws.evaluation.summary.readiness_score,
    confidence: ws.evaluation.summary.confidence_score,
    blockers: ws.evaluation.blockers.map(toPreflightItemView),
    risks: ws.evaluation.risks.map(toPreflightItemView),
    decision_summary: decision.why.summary,
    freshness: decision.freshness.freshness_state,
  };
}

export function getRevenueIntegritySummary(ctx: EngineContext): RevenueIntegritySummaryView {
  const ws = ctx.result.revenue_integrity.workspace;
  const decision = getRevenueDecision(ctx);

  return {
    decision_key: decision.decision_key,
    risk_level: ws.context.estimated_risk_level,
    confidence: ws.summary.confidence_score,
    freshness: decision.freshness.freshness_state,
    leakage_points: ws.context.leakage_points.map(lp => ({
      title: lp.title,
      description: lp.description,
      severity: lp.severity,
    })),
    trust_issues: ws.context.trust_issues,
    measurement_gaps: ws.context.measurement_gaps,
    where_money_is_lost: ws.summary.where_money_is_lost,
    what_to_fix_first: ws.summary.what_to_fix_first,
  };
}

export function getRootCausesSummary(ctx: EngineContext): RootCauseSummaryView[] {
  return getRootCauses(ctx).map(toRootCauseView);
}

export function getPrioritizedActionsSummary(ctx: EngineContext): ActionSummaryView[] {
  const rootCauses = getRootCauses(ctx);
  return getGlobalActions(ctx).map(a => toActionView(a, rootCauses));
}

export function getGraphPathSummary(ctx: EngineContext): GraphPathSummaryView {
  const stats = ctx.result.graph_stats;
  return {
    total_nodes: stats.total_nodes,
    total_edges: stats.total_edges,
    internal_pages: stats.internal_nodes,
    external_hosts: stats.external_nodes,
    providers: [], // would come from graph query — summary only
    policies: [],
    redirect_count: stats.edge_types['redirect'] || 0,
    trust_gaps: 0, // would come from trust boundary query
  };
}

// ──────────────────────────────────────────────
// View Helpers
// ──────────────────────────────────────────────

function toRootCauseView(rc: import('../../packages/intelligence').RootCause): RootCauseSummaryView {
  return {
    root_cause_key: rc.root_cause_key,
    title: rc.title,
    severity: rc.severity,
    confidence: rc.confidence,
    impact_types: rc.impact_types,
    affected_packs: rc.affected_packs,
    inference_count: rc.contributing_inferences.length,
  };
}

function toActionView(
  a: import('../../packages/intelligence').GlobalAction,
  rootCauses: import('../../packages/intelligence').RootCause[],
): ActionSummaryView {
  const rc = a.root_cause_ref
    ? rootCauses.find(r => makeRef('root_cause', r.id) === a.root_cause_ref)
    : null;
  return {
    action_key: a.action_key,
    title: a.title,
    priority: a.priority,
    severity: a.severity,
    confidence: a.confidence,
    cross_pack_impact: a.cross_pack_impact,
    action_type: a.action_type,
    root_cause_title: rc?.title || null,
  };
}

function toPreflightItemView(item: { title: string; description: string; severity: string }): PreflightItemView {
  return { title: item.title, description: item.description, severity: item.severity };
}

function computeHealth(scaleImpact: DecisionImpact, revenueImpact: DecisionImpact): HealthStatus {
  const worst = [scaleImpact, revenueImpact];
  if (worst.includes(DecisionImpact.Incident) || worst.includes(DecisionImpact.BlockLaunch)) return 'critical';
  if (worst.includes(DecisionImpact.FixBeforeScale)) return 'at_risk';
  if (worst.includes(DecisionImpact.Optimize)) return 'at_risk';
  return 'healthy';
}
