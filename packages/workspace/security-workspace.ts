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
// Security Posture Workspace
// Answers: "Is my visible security posture costing me money?"
// ──────────────────────────────────────────────

export interface SecurityWorkspaceConfig {
  name: string;
  scoping: import('../domain').Scoping;
  landing_url: string;
  cycle_ref: string;
}

export interface SecurityWorkspaceResult {
  context: SecurityContext;
  findings: Finding[];
  summary: SecuritySummary;
}

export interface SecurityContext {
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  risk_factors: SecurityRiskFactor[];
  checkout_risks: string[];
  infrastructure_risks: string[];
  trust_signal_gaps: string[];
  decision_ref: string;
  cycle_ref: string;
}

export interface SecurityRiskFactor {
  title: string;
  description: string;
  severity: string;
  inference_ref: string | null;
}

export interface SecuritySummary {
  what_buyers_see: string[];
  what_attackers_see: string[];
  what_breaks_silently: string[];
  confidence_score: number;
  risk_score: number;
}

const SECURITY_INFERENCE_KEYS = new Set([
  'security_header_weakness',
  'mixed_content_exposure',
  'sensitive_endpoint_exposed',
  'checkout_script_hijack_risk',
  'buyer_session_theft_risk',
  'checkout_clickjack_risk',
  'payment_data_unencrypted',
  'error_page_information_leak',
  'email_deliverability_risk',
  'cors_misconfiguration_risk',
  'rate_limiting_absent_on_commerce',
  'predictable_order_urls',
]);

const BUYER_VISIBLE_KEYS = new Set([
  'security_header_weakness',
  'mixed_content_exposure',
  'email_deliverability_risk',
]);

const ATTACKER_VISIBLE_KEYS = new Set([
  'sensitive_endpoint_exposed',
  'checkout_script_hijack_risk',
  'cors_misconfiguration_risk',
  'rate_limiting_absent_on_commerce',
  'predictable_order_urls',
  'error_page_information_leak',
  'checkout_clickjack_risk',
]);

const SILENT_BREAK_KEYS = new Set([
  'mixed_content_exposure',
  'payment_data_unencrypted',
  'buyer_session_theft_risk',
]);

export function createSecurityWorkspace(
  config: SecurityWorkspaceConfig,
  decision: Decision,
  actions: Action[],
  inferences: Inference[],
): SecurityWorkspaceResult {
  const ids = new IdGenerator('sec');
  const now = new Date();

  const securityInferences = inferences.filter(i => SECURITY_INFERENCE_KEYS.has(i.inference_key));

  const riskFactors: SecurityRiskFactor[] = [];
  for (const inf of securityInferences) {
    if (inf.conclusion_value === 'low' && inf.severity_hint === 'low') continue;
    riskFactors.push({
      title: formatFactorTitle(inf.inference_key),
      description: inf.reasoning,
      severity: inf.severity_hint || 'medium',
      inference_ref: makeRef('inference', inf.id),
    });
  }

  const checkoutRisks: string[] = [];
  const infrastructureRisks: string[] = [];
  const trustGaps: string[] = [];

  for (const inf of securityInferences) {
    if (inf.conclusion_value === 'low') continue;
    if (['checkout_script_hijack_risk', 'checkout_clickjack_risk', 'payment_data_unencrypted', 'mixed_content_exposure'].includes(inf.inference_key)) {
      checkoutRisks.push(inf.reasoning);
    }
    if (['sensitive_endpoint_exposed', 'error_page_information_leak', 'cors_misconfiguration_risk', 'rate_limiting_absent_on_commerce', 'predictable_order_urls'].includes(inf.inference_key)) {
      infrastructureRisks.push(inf.reasoning);
    }
    if (['security_header_weakness', 'buyer_session_theft_risk', 'email_deliverability_risk'].includes(inf.inference_key)) {
      trustGaps.push(inf.reasoning);
    }
  }

  const riskLevel = decisionToRiskLevel(decision);

  const context: SecurityContext = {
    risk_level: riskLevel,
    risk_factors: riskFactors,
    checkout_risks: checkoutRisks,
    infrastructure_risks: infrastructureRisks,
    trust_signal_gaps: trustGaps,
    decision_ref: makeRef('decision', decision.id),
    cycle_ref: config.cycle_ref,
  };

  const whatBuyersSee: string[] = [];
  const whatAttackersSee: string[] = [];
  const whatBreaksSilently: string[] = [];

  for (const rf of riskFactors.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))) {
    const key = securityInferences.find(i => makeRef('inference', i.id) === rf.inference_ref)?.inference_key;
    if (key && BUYER_VISIBLE_KEYS.has(key)) whatBuyersSee.push(rf.title);
    if (key && ATTACKER_VISIBLE_KEYS.has(key)) whatAttackersSee.push(rf.title);
    if (key && SILENT_BREAK_KEYS.has(key)) whatBreaksSilently.push(rf.title);
  }

  const summary: SecuritySummary = {
    what_buyers_see: whatBuyersSee,
    what_attackers_see: whatAttackersSee,
    what_breaks_silently: whatBreaksSilently,
    confidence_score: decision.confidence_score,
    risk_score: decision.raw_risk_score || 0,
  };

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

function formatFactorTitle(key: string): string {
  const titles: Record<string, string> = {
    security_header_weakness: 'Browser trust signals missing',
    mixed_content_exposure: 'Checkout breaks silently',
    sensitive_endpoint_exposed: 'Infrastructure credentials exposed',
    checkout_script_hijack_risk: 'Checkout script hijack risk',
    buyer_session_theft_risk: 'Buyer session theft risk',
    checkout_clickjack_risk: 'Checkout clickjack risk',
    payment_data_unencrypted: 'Payment data unencrypted',
    error_page_information_leak: 'Error pages leak system details',
    email_deliverability_risk: 'Order emails may not arrive',
    cors_misconfiguration_risk: 'Cross-origin requests unrestricted',
    rate_limiting_absent_on_commerce: 'No rate limiting on commerce',
    predictable_order_urls: 'Order data URLs predictable',
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
