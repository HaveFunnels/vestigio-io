import {
  Decision,
  Action,
  Finding,
  Inference,
  EffectiveSeverity,
  DecisionImpact,
  FreshnessState,
  Scoping,
  Freshness,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Revenue Analysis Workspace
// Answers: "Where am I losing money?"
// ──────────────────────────────────────────────

export interface RevenueWorkspaceConfig {
  name: string;
  scoping: Scoping;
  landing_url: string;
  cycle_ref: string;
}

export interface RevenueWorkspaceResult {
  context: RevenueContext;
  findings: Finding[];
  summary: RevenueSummary;
}

export interface RevenueContext {
  estimated_risk_level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  leakage_points: LeakagePoint[];
  trust_issues: string[];
  measurement_gaps: string[];
  decision_ref: string;
  cycle_ref: string;
}

export interface LeakagePoint {
  title: string;
  description: string;
  severity: string;
  inference_ref: string | null;
  evidence_refs: string[];
}

export interface RevenueSummary {
  where_money_is_lost: string[];
  what_to_fix_first: string[];
  confidence_score: number;
  risk_score: number;
}

export function createRevenueWorkspace(
  config: RevenueWorkspaceConfig,
  decision: Decision,
  actions: Action[],
  inferences: Inference[],
): RevenueWorkspaceResult {
  const ids = new IdGenerator('rev');
  const now = new Date();

  // Revenue-relevant inference keys
  const revenueInferenceKeys = new Set([
    'conversion_flow_fragmented',
    'friction_on_critical_path',
    'revenue_leakage',
    'trust_break_in_checkout',
    'measurement_blindspot',
    'unclear_conversion_intent',
  ]);

  const revenueInferences = inferences.filter(i => revenueInferenceKeys.has(i.inference_key));

  // Build leakage points from revenue inferences
  const leakagePoints: LeakagePoint[] = [];
  for (const inf of revenueInferences) {
    if (inf.conclusion_value === 'low' && inf.severity_hint === 'low') continue;

    leakagePoints.push({
      title: formatLeakageTitle(inf.inference_key),
      description: inf.reasoning,
      severity: inf.severity_hint || 'medium',
      inference_ref: makeRef('inference', inf.id),
      evidence_refs: inf.evidence_refs,
    });
  }

  // Build trust issues
  const trustIssues: string[] = [];
  const trustBreak = revenueInferences.find(i => i.inference_key === 'trust_break_in_checkout');
  if (trustBreak && trustBreak.conclusion_value !== 'low') {
    trustIssues.push(trustBreak.reasoning);
  }
  const policyInf = inferences.find(i => i.inference_key === 'policy_gap');
  if (policyInf && policyInf.conclusion_value !== 'none') {
    trustIssues.push(policyInf.reasoning);
  }

  // Build measurement gaps
  const measurementGaps: string[] = [];
  const blindspot = revenueInferences.find(i => i.inference_key === 'measurement_blindspot');
  if (blindspot && blindspot.conclusion_value !== 'low') {
    measurementGaps.push(blindspot.reasoning);
  }
  const measCoverage = inferences.find(i => i.inference_key === 'measurement_coverage');
  if (measCoverage && measCoverage.conclusion_value === 'false') {
    measurementGaps.push(measCoverage.reasoning);
  }

  // Estimated risk level
  const riskLevel = decisionToRiskLevel(decision);

  // Context
  const context: RevenueContext = {
    estimated_risk_level: riskLevel,
    leakage_points: leakagePoints,
    trust_issues: trustIssues,
    measurement_gaps: measurementGaps,
    decision_ref: makeRef('decision', decision.id),
    cycle_ref: config.cycle_ref,
  };

  // Summary
  const whereLost: string[] = [];
  const whatToFix: string[] = [];

  for (const lp of leakagePoints.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))) {
    whereLost.push(lp.title);
  }

  if (decision.actions.primary) {
    whatToFix.push(decision.actions.primary);
  }
  for (const s of decision.actions.secondary.slice(0, 3)) {
    whatToFix.push(s);
  }

  const summary: RevenueSummary = {
    where_money_is_lost: whereLost,
    what_to_fix_first: whatToFix,
    confidence_score: decision.confidence_score,
    risk_score: decision.raw_risk_score || 0,
  };

  // Findings — revenue-scoped projections from actions
  const findings: Finding[] = actions
    .filter(a => a.action_type !== 'verification')
    .map(action => ({
      id: ids.next(),
      finding_key: action.action_key,
      scoping: config.scoping,
      cycle_ref: config.cycle_ref,
      decision_ref: action.decision_ref,
      title: action.title,
      description: action.description,
      technical_detail: null,
      severity: action.severity,
      confidence: decision.confidence_score,
      evidence_refs: action.evidence_refs,
      remediation: action.title,
      remediation_steps: action.remediation_steps,
      estimated_effort_hours: action.estimated_effort_hours,
      verification_strategy: action.verification_strategy,
      verification_notes: action.verification_notes,
      verification_eta_seconds: action.verification_eta_seconds,
      page_url: config.landing_url,
      journey_stage: null,
      created_at: now,
      updated_at: now,
    }));

  return { context, findings, summary };
}

function formatLeakageTitle(inferenceKey: string): string {
  const titles: Record<string, string> = {
    conversion_flow_fragmented: 'Fragmented conversion flow',
    friction_on_critical_path: 'Friction on critical revenue path',
    revenue_leakage: 'Revenue leakage points',
    trust_break_in_checkout: 'Trust break at checkout',
    measurement_blindspot: 'Measurement blind spot',
    unclear_conversion_intent: 'Unclear conversion intent',
  };
  return titles[inferenceKey] || inferenceKey.replace(/_/g, ' ');
}

function decisionToRiskLevel(
  decision: Decision,
): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  switch (decision.decision_impact) {
    case DecisionImpact.Incident: return 'critical';
    case DecisionImpact.BlockLaunch: return 'critical';
    case DecisionImpact.FixBeforeScale: return 'high';
    case DecisionImpact.Optimize: return 'medium';
    case DecisionImpact.Observe:
      return (decision.raw_risk_score || 0) > 10 ? 'low' : 'none';
  }
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}
