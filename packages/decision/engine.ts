import {
  Signal,
  Inference,
  RiskEvaluation,
  Decision,
  DecisionStatus,
  DecisionClass,
  DecisionImpact,
  EffectiveSeverity,
  FreshnessState,
  Scoping,
  PrimaryOutcome,
  makeRef,
} from '../domain';
import { evaluateRisk, RiskInput } from '../risk';
import type { EngineTranslations } from '../projections/types';

// ──────────────────────────────────────────────
// Decision Engine — answers business questions
// ──────────────────────────────────────────────

import { IdGenerator } from '../domain';

export interface DecisionInput {
  question_key: string;
  scoping: Scoping;
  cycle_ref: string;
  signals: Signal[];
  inferences: Inference[];
  conversion_proximity: number;
  is_production: boolean;
  translations?: EngineTranslations;
}

export interface DecisionResult {
  decision: Decision;
  risk_evaluation: RiskEvaluation;
}

export function produceDecision(input: DecisionInput): DecisionResult {
  // 1. Evaluate risk
  const riskInput: RiskInput = {
    question_key: input.question_key,
    subject_ref: input.scoping.subject_ref,
    cycle_ref: input.cycle_ref,
    signals: input.signals,
    inferences: input.inferences,
    conversion_proximity: input.conversion_proximity,
    is_production: input.is_production,
  };

  const riskEval = evaluateRisk(riskInput);
  const ids = new IdGenerator('dec');

  // 2. Determine decision key and outcome
  const { decision_key, category, primary_outcome } = resolveDecisionOutcome(
    input.question_key,
    riskEval,
  );

  // 3. Build explainability
  const why = buildWhy(input.signals, input.inferences, riskEval);

  // 4. Build actions
  const actions = buildActions(input.question_key, riskEval, input.inferences, input.translations);

  // 5. Build summary
  const summary = buildSummary(decision_key, riskEval, input.translations);

  const now = new Date();
  const decision: Decision = {
    id: ids.next(),
    decision_key,
    question_key: input.question_key,
    scoping: input.scoping,
    cycle_ref: input.cycle_ref,
    freshness: {
      observed_at: now,
      fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    status: DecisionStatus.Created,
    category,
    confidence_score: riskEval.confidence_score,
    raw_risk_score: riskEval.raw_risk_score,
    raw_upside_score: null,
    effective_severity: riskEval.effective_severity,
    decision_impact: riskEval.decision_impact,
    primary_outcome,
    why: {
      ...why,
      summary,
    },
    actions,
    value_case: null,
    projections: {
      findings: [],
      incidents: [],
      opportunities: [],
      preflight_checks: [],
    },
    created_at: now,
    updated_at: now,
  };

  return { decision, risk_evaluation: riskEval };
}

function resolveDecisionOutcome(
  questionKey: string,
  risk: RiskEvaluation,
): { decision_key: string; category: DecisionClass; primary_outcome: PrimaryOutcome } {
  if (questionKey === 'is_it_safe_to_scale_traffic') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return {
        decision_key: 'unsafe_to_scale_traffic',
        category: DecisionClass.Risk,
        primary_outcome: 'incident',
      };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return {
        decision_key: 'fix_before_scale',
        category: DecisionClass.Risk,
        primary_outcome: 'incident',
      };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return {
        decision_key: 'ready_with_risks',
        category: DecisionClass.State,
        primary_outcome: 'observation',
      };
    }
    return {
      decision_key: 'safe_to_scale',
      category: DecisionClass.State,
      primary_outcome: 'observation',
    };
  }

  if (questionKey === 'is_there_revenue_leakage_in_high_intent_paths') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return {
        decision_key: 'revenue_leakage_detected',
        category: DecisionClass.Risk,
        primary_outcome: 'incident',
      };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return {
        decision_key: 'revenue_at_risk',
        category: DecisionClass.Risk,
        primary_outcome: 'incident',
      };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return {
        decision_key: 'revenue_path_fragile',
        category: DecisionClass.State,
        primary_outcome: 'observation',
      };
    }
    return {
      decision_key: 'revenue_integrity_stable',
      category: DecisionClass.State,
      primary_outcome: 'observation',
    };
  }

  if (questionKey === 'is_chargeback_pressure_elevated') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return {
        decision_key: 'high_chargeback_risk',
        category: DecisionClass.Risk,
        primary_outcome: 'incident',
      };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return {
        decision_key: 'moderate_chargeback_risk',
        category: DecisionClass.Risk,
        primary_outcome: 'incident',
      };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return {
        decision_key: 'low_chargeback_risk',
        category: DecisionClass.State,
        primary_outcome: 'observation',
      };
    }
    return {
      decision_key: 'chargeback_resilience_strong',
      category: DecisionClass.State,
      primary_outcome: 'observation',
    };
  }

  // ── Behavioral workspace questions (pixel-dependent) ──

  if (questionKey === 'is_first_session_conversion_leaking') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'first_session_conversion_critically_low', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'first_session_conversion_below_benchmark', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'first_session_conversion_improvable', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'first_session_conversion_healthy', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  if (questionKey === 'are_user_actions_driving_revenue') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'actions_disconnected_from_revenue', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'action_value_misaligned', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'action_value_improvable', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'action_value_aligned', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  if (questionKey === 'is_paid_traffic_reaching_conversion') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'paid_traffic_wasted', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'paid_traffic_friction_high', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'paid_traffic_improvable', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'acquisition_integrity_strong', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  if (questionKey === 'is_mobile_experience_costing_revenue') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'mobile_revenue_critically_exposed', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'mobile_revenue_gap_significant', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'mobile_revenue_gap_moderate', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'mobile_experience_healthy', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  if (questionKey === 'how_much_does_ux_friction_cost') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'friction_tax_critical', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'friction_tax_elevated', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'friction_tax_moderate', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'friction_tax_low', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  if (questionKey === 'is_trust_deficit_blocking_revenue') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'trust_gap_blocking_revenue', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'trust_gap_significant', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'trust_gap_moderate', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'trust_confidence_strong', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  if (questionKey === 'are_visitors_on_shortest_conversion_path') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'path_critically_inefficient', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'path_inefficiency_high', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'path_improvable', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'path_efficiency_good', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // Default fallback
  return {
    decision_key: `${questionKey}_result`,
    category: risk.raw_risk_score >= 40 ? DecisionClass.Risk : DecisionClass.State,
    primary_outcome: risk.decision_impact === DecisionImpact.Incident ? 'incident' : 'observation',
  };
}

function buildWhy(
  signals: Signal[],
  inferences: Inference[],
  risk: RiskEvaluation,
): { signals: string[]; inferences: string[]; evidence_refs: string[]; gates: string[] } {
  return {
    signals: risk.rationale.signals,
    inferences: risk.rationale.inferences,
    evidence_refs: risk.rationale.evidence_refs,
    gates: risk.gate_result.reasons,
  };
}

function buildActions(
  questionKey: string,
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  if (questionKey === 'is_it_safe_to_scale_traffic') {
    return buildScaleReadinessActions(risk, inferences, translations);
  }
  if (questionKey === 'is_there_revenue_leakage_in_high_intent_paths') {
    return buildRevenueIntegrityActions(risk, inferences, translations);
  }
  if (questionKey === 'is_chargeback_pressure_elevated') {
    return buildChargebackActions(risk, inferences, translations);
  }

  const ta = translations?.actions;
  return {
    primary: ta?.default_primary ?? 'Review findings and address highest severity issues first.',
    secondary: [],
    verification: [ta?.default_verification ?? 'Re-run analysis after changes to confirm resolution.'],
  };
}

function buildScaleReadinessActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const secondary: string[] = [];
  const verification: string[] = [];
  const ts = translations?.actions?.scale_readiness;

  const trustBoundary = inferences.find((i) => i.inference_key === 'trust_boundary_crossed');
  const policyGap = inferences.find((i) => i.inference_key === 'policy_gap');
  const checkoutIntegrity = inferences.find((i) => i.inference_key === 'checkout_integrity');
  const measurementCoverage = inferences.find((i) => i.inference_key === 'measurement_coverage');
  const revenueFragility = inferences.find((i) => i.inference_key === 'revenue_path_fragile');

  if (risk.decision_impact === DecisionImpact.BlockLaunch || risk.decision_impact === DecisionImpact.Incident) {
    let primary = ts?.block_primary ?? 'Do not scale traffic until critical issues are resolved.';

    if (checkoutIntegrity?.conclusion_value === 'weak') {
      secondary.push(ts?.block_fix_checkout ?? 'Fix checkout integrity: ensure checkout flow stays on-domain or uses a verified provider.');
    }
    if (trustBoundary?.conclusion_value === 'true') {
      secondary.push(ts?.block_resolve_trust ?? 'Resolve trust boundary issues: reduce off-domain handoffs or verify external providers.');
    }
    if (policyGap?.conclusion_value === 'high') {
      secondary.push(ts?.block_add_policies ?? 'Add missing policies: privacy, terms, and refund policies are required for commercial sites.');
    }

    verification.push(ts?.block_verify_full ?? 'Re-run full analysis after fixes to confirm readiness.');
    verification.push(ts?.block_verify_checkout ?? 'Verify checkout flow manually before scaling.');

    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    let primary = ts?.fix_primary ?? 'Address high-priority issues before increasing traffic significantly.';

    if (policyGap && policyGap.conclusion_value !== 'none') {
      secondary.push(ts?.fix_improve_policy ?? 'Improve policy coverage to reduce compliance risk.');
    }
    if (measurementCoverage?.conclusion_value === 'false') {
      secondary.push(ts?.fix_install_analytics ?? 'Install analytics tools to enable proper attribution and optimization.');
    }
    if (revenueFragility?.conclusion_value === 'high' || revenueFragility?.conclusion_value === 'medium') {
      secondary.push(ts?.fix_strengthen_revenue ?? 'Strengthen revenue path: reduce redirects and friction in the conversion flow.');
    }

    verification.push(ts?.fix_verify ?? 'Re-run analysis after implementing changes.');

    return { primary, secondary, verification };
  }

  // Optimize or Observe
  return {
    primary: ts?.optimize_primary ?? 'Traffic can be scaled. Monitor for regressions.',
    secondary: measurementCoverage?.conclusion_value === 'false'
      ? [ts?.optimize_measurement ?? 'Consider improving measurement coverage for better optimization.']
      : [],
    verification: [ts?.optimize_verify ?? 'Schedule periodic re-analysis to detect regressions.'],
  };
}

function buildRevenueIntegrityActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const secondary: string[] = [];
  const verification: string[] = [];
  const ts = translations?.actions?.revenue_integrity;

  const flowFragmented = inferences.find(i => i.inference_key === 'conversion_flow_fragmented');
  const friction = inferences.find(i => i.inference_key === 'friction_on_critical_path');
  const leakage = inferences.find(i => i.inference_key === 'revenue_leakage');
  const trustBreak = inferences.find(i => i.inference_key === 'trust_break_in_checkout');
  const blindspot = inferences.find(i => i.inference_key === 'measurement_blindspot');
  const unclearIntent = inferences.find(i => i.inference_key === 'unclear_conversion_intent');

  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = ts?.block_primary ?? 'Revenue is actively leaking. Fix the conversion path immediately.';

    if (leakage && leakage.conclusion_value !== 'low') {
      secondary.push(ts?.block_close_leak ?? 'Close revenue leak points: fix broken forms, consolidate checkout to one domain, and ensure clear conversion entry.');
    }
    if (flowFragmented && flowFragmented.conclusion_value !== 'low') {
      secondary.push(ts?.block_consolidate ?? 'Consolidate conversion path: reduce external host fragmentation and eliminate unnecessary redirects before checkout.');
    }
    if (trustBreak && trustBreak.conclusion_value !== 'low') {
      secondary.push(ts?.block_restore_trust ?? 'Restore trust at checkout: add policies, verify providers, ensure brand continuity through the purchase flow.');
    }
    if (friction && friction.conclusion_value !== 'low') {
      secondary.push(ts?.block_reduce_friction ?? 'Reduce critical path friction: fix broken form actions, speed up slow pages, eliminate unnecessary redirects.');
    }

    verification.push(ts?.block_verify_revenue ?? 'Re-run revenue analysis after fixes to confirm leakage is resolved.');
    verification.push(ts?.block_verify_conversion ?? 'Monitor conversion rate after changes to measure improvement.');

    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = ts?.fix_primary ?? 'Revenue path has structural issues. Address before scaling ad spend.';

    if (blindspot && blindspot.conclusion_value !== 'low') {
      secondary.push(ts?.fix_measurement ?? 'Improve measurement: install analytics on commercial pages to make revenue leakage visible.');
    }
    if (unclearIntent && unclearIntent.conclusion_value !== 'low') {
      secondary.push(ts?.fix_clarify_intent ?? 'Clarify conversion intent: establish a clear primary CTA and reduce competing actions.');
    }
    if (flowFragmented && flowFragmented.conclusion_value !== 'low') {
      secondary.push(ts?.fix_streamline ?? 'Streamline checkout flow: minimize handoffs and keep the conversion path on-domain where possible.');
    }

    verification.push(ts?.fix_verify ?? 'Re-run analysis after implementing changes.');

    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.Optimize) {
    return {
      primary: ts?.optimize_primary ?? 'Revenue path is functional but has optimization opportunities.',
      secondary: [
        ...(blindspot ? [ts?.optimize_measurement ?? 'Improve measurement coverage to better quantify revenue impact.'] : []),
        ...(unclearIntent ? [ts?.optimize_clarify ?? 'Clarify primary conversion path for better conversion rates.'] : []),
      ],
      verification: [ts?.optimize_verify ?? 'Schedule periodic revenue analysis to track improvements.'],
    };
  }

  return {
    primary: ts?.stable_primary ?? 'Revenue integrity is stable. No significant leakage detected.',
    secondary: [],
    verification: [ts?.stable_verify ?? 'Schedule periodic revenue analysis to detect regressions.'],
  };
}

function buildChargebackActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const secondary: string[] = [];
  const verification: string[] = [];
  const ts = translations?.actions?.chargeback;

  const refundGap = inferences.find(i => i.inference_key === 'refund_policy_gap');
  const supportGap = inferences.find(i => i.inference_key === 'support_unreachable');
  const expectation = inferences.find(i => i.inference_key === 'expectation_misalignment');
  const disputeRisk = inferences.find(i => i.inference_key === 'dispute_risk_elevated');

  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = ts?.block_primary ?? 'High chargeback exposure. Add refund policy, support channels, and trust signals immediately.';

    if (refundGap && refundGap.conclusion_value !== 'low') {
      secondary.push(ts?.block_refund_policy ?? 'Add a clear, accessible refund/return policy. This is the single most effective chargeback prevention measure.');
    }
    if (supportGap && supportGap.conclusion_value !== 'low') {
      secondary.push(ts?.block_add_support ?? 'Add visible support channels (email, phone, or chat). Customers who can reach support resolve issues without disputes.');
    }
    if (expectation && expectation.conclusion_value !== 'low') {
      secondary.push(ts?.block_clarify_pricing ?? 'Clarify pricing and add order confirmation. Expectation misalignment drives "unauthorized charge" disputes.');
    }

    verification.push(ts?.block_verify_policies ?? 'Re-run analysis after adding policies and support channels.');
    verification.push(ts?.block_verify_checkout ?? 'Review checkout flow for brand continuity and charge clarity.');
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = ts?.fix_primary ?? 'Moderate chargeback risk. Strengthen policies and support before scaling.';

    if (refundGap && refundGap.conclusion_value !== 'low') {
      secondary.push(ts?.fix_refund ?? 'Improve refund policy clarity and accessibility.');
    }
    if (supportGap && supportGap.conclusion_value !== 'low') {
      secondary.push(ts?.fix_support ?? 'Add additional support channels for better customer accessibility.');
    }
    if (expectation && expectation.conclusion_value !== 'low') {
      secondary.push(ts?.fix_confirmation ?? 'Add order confirmation and pricing transparency.');
    }

    verification.push(ts?.fix_verify ?? 'Re-run analysis after improvements.');
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.Optimize) {
    return {
      primary: ts?.optimize_primary ?? 'Low chargeback risk. Minor improvements available.',
      secondary: [
        ...(supportGap ? [ts?.optimize_support ?? 'Consider adding more support channels for redundancy.'] : []),
        ...(expectation ? [ts?.optimize_communication ?? 'Improve post-purchase communication for better customer experience.'] : []),
      ],
      verification: [ts?.optimize_verify ?? 'Monitor chargeback rates periodically.'],
    };
  }

  return {
    primary: ts?.strong_primary ?? 'Chargeback resilience is strong. Continue monitoring.',
    secondary: [],
    verification: [ts?.strong_verify ?? 'Schedule periodic chargeback risk assessment.'],
  };
}

function buildSummary(decisionKey: string, risk: RiskEvaluation, translations?: EngineTranslations): string {
  const ts = translations?.summaries;

  // Helper to interpolate placeholders in translated summary strings
  function interpolate(template: string): string {
    return template
      .replace(/\{risk_score\}/g, String(risk.raw_risk_score))
      .replace(/\{confidence_score\}/g, String(risk.confidence_score))
      .replace(/\{decision_key\}/g, decisionKey);
  }

  // Try translated summary first, fall back to English
  const translated = ts?.[decisionKey] ?? ts?.default_summary;
  if (ts?.[decisionKey]) {
    return interpolate(ts[decisionKey]);
  }

  switch (decisionKey) {
    case 'unsafe_to_scale_traffic':
      return `Scaling traffic is unsafe. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Critical issues must be resolved first.`;
    case 'fix_before_scale':
      return `Issues should be fixed before scaling traffic. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100.`;
    case 'ready_with_risks':
      return `Traffic can be scaled with caution. Some risks remain (score: ${risk.raw_risk_score}/100) but are not blocking.`;
    case 'safe_to_scale':
      return `Safe to scale traffic. No significant risks detected (score: ${risk.raw_risk_score}/100).`;
    case 'revenue_leakage_detected':
      return `Active revenue leakage detected. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Conversion path has critical structural issues losing money.`;
    case 'revenue_at_risk':
      return `Revenue path has significant issues. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Fix before increasing ad spend.`;
    case 'revenue_path_fragile':
      return `Revenue path is functional but fragile. Risk score: ${risk.raw_risk_score}/100. Optimization opportunities exist to reduce leakage.`;
    case 'revenue_integrity_stable':
      return `Revenue integrity is stable. No significant leakage detected (score: ${risk.raw_risk_score}/100).`;
    case 'high_chargeback_risk':
      return `High chargeback risk. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Missing policies, support gaps, and expectation issues create significant dispute exposure.`;
    case 'moderate_chargeback_risk':
      return `Moderate chargeback risk. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Some protective measures are missing.`;
    case 'low_chargeback_risk':
      return `Low chargeback risk. Risk score: ${risk.raw_risk_score}/100. Minor improvements available but not blocking.`;
    case 'chargeback_resilience_strong':
      return `Chargeback resilience is strong. No significant dispute risk detected (score: ${risk.raw_risk_score}/100).`;
    default:
      return `Decision: ${decisionKey}. Risk: ${risk.raw_risk_score}/100, Confidence: ${risk.confidence_score}/100.`;
  }
}
