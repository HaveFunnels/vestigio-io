import {
  Decision,
  Action,
  Finding,
  Inference,
  DecisionImpact,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Chargeback Analysis Workspace
// Answers: "Am I exposed to chargebacks?"
// ──────────────────────────────────────────────

export interface ChargebackWorkspaceConfig {
  name: string;
  scoping: import('../domain').Scoping;
  landing_url: string;
  cycle_ref: string;
}

export interface ChargebackWorkspaceResult {
  context: ChargebackContext;
  findings: Finding[];
  summary: ChargebackSummary;
}

export interface ChargebackContext {
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  risk_factors: ChargebackRiskFactor[];
  policy_gaps: string[];
  support_gaps: string[];
  decision_ref: string;
  cycle_ref: string;
}

export interface ChargebackRiskFactor {
  title: string;
  description: string;
  severity: string;
  inference_ref: string | null;
}

export interface ChargebackSummary {
  where_disputes_happen: string[];
  what_creates_refund_pressure: string[];
  confidence_score: number;
  risk_score: number;
}

export function createChargebackWorkspace(
  config: ChargebackWorkspaceConfig,
  decision: Decision,
  actions: Action[],
  inferences: Inference[],
): ChargebackWorkspaceResult {
  const ids = new IdGenerator('cb');
  const now = new Date();

  const chargebackInferenceKeys = new Set([
    'refund_policy_gap',
    'support_unreachable',
    'expectation_misalignment',
    'dispute_risk_elevated',
  ]);

  const chargebackInferences = inferences.filter(i => chargebackInferenceKeys.has(i.inference_key));

  // Risk factors
  const riskFactors: ChargebackRiskFactor[] = [];
  for (const inf of chargebackInferences) {
    if (inf.conclusion_value === 'low' && inf.severity_hint === 'low') continue;
    riskFactors.push({
      title: formatFactorTitle(inf.inference_key),
      description: inf.reasoning,
      severity: inf.severity_hint || 'medium',
      inference_ref: makeRef('inference', inf.id),
    });
  }

  // Policy gaps
  const policyGaps: string[] = [];
  const refundGap = chargebackInferences.find(i => i.inference_key === 'refund_policy_gap');
  if (refundGap && refundGap.conclusion_value !== 'low') policyGaps.push(refundGap.reasoning);
  const policyInf = inferences.find(i => i.inference_key === 'policy_gap');
  if (policyInf && policyInf.conclusion_value !== 'none' && policyInf.conclusion_value !== 'low') {
    policyGaps.push(policyInf.reasoning);
  }

  // Support gaps
  const supportGaps: string[] = [];
  const supportInf = chargebackInferences.find(i => i.inference_key === 'support_unreachable');
  if (supportInf && supportInf.conclusion_value !== 'low') supportGaps.push(supportInf.reasoning);

  // Risk level
  const riskLevel = decisionToRiskLevel(decision);

  const context: ChargebackContext = {
    risk_level: riskLevel,
    risk_factors: riskFactors,
    policy_gaps: policyGaps,
    support_gaps: supportGaps,
    decision_ref: makeRef('decision', decision.id),
    cycle_ref: config.cycle_ref,
  };

  // Summary
  const whereDisputes: string[] = [];
  const refundPressure: string[] = [];

  for (const rf of riskFactors.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))) {
    whereDisputes.push(rf.title);
  }

  if (decision.actions.primary) refundPressure.push(decision.actions.primary);
  for (const s of decision.actions.secondary.slice(0, 3)) refundPressure.push(s);

  const summary: ChargebackSummary = {
    where_disputes_happen: whereDisputes,
    what_creates_refund_pressure: refundPressure,
    confidence_score: decision.confidence_score,
    risk_score: decision.raw_risk_score || 0,
  };

  // Findings
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
      page_url: config.landing_url,
      journey_stage: null,
      created_at: now,
      updated_at: now,
    }));

  return { context, findings, summary };
}

function formatFactorTitle(key: string): string {
  const titles: Record<string, string> = {
    refund_policy_gap: 'Refund policy gap',
    support_unreachable: 'Support unreachable',
    expectation_misalignment: 'Customer expectation misalignment',
    dispute_risk_elevated: 'Elevated dispute risk',
  };
  return titles[key] || key.replace(/_/g, ' ');
}

function decisionToRiskLevel(d: Decision): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  switch (d.decision_impact) {
    case DecisionImpact.Incident:
    case DecisionImpact.BlockLaunch: return 'critical';
    case DecisionImpact.FixBeforeScale: return 'high';
    case DecisionImpact.Optimize: return 'medium';
    case DecisionImpact.Observe: return (d.raw_risk_score || 0) > 10 ? 'low' : 'none';
  }
}

function severityRank(s: string): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : s === 'low' ? 1 : 0;
}
