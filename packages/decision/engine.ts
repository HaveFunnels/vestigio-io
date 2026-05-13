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

  // ── Copy alignment (Wave 3.10) ──

  if (questionKey === 'is_copy_aligned_with_commercial_intent') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'copy_misaligned', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'copy_significant_gaps', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'copy_minor_gaps', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'copy_aligned', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // ── Channel Integrity ──

  if (questionKey === 'is_channel_integrity_compromised') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'channel_integrity_critical', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'channel_integrity_elevated', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'channel_integrity_weak', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'channel_integrity_strong', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // ── Discoverability ──

  if (questionKey === 'is_discoverability_limiting_growth') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'discoverability_critically_weak', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'discoverability_gaps_significant', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'discoverability_improvable', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'discoverability_adequate', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // ── Brand Integrity ──

  if (questionKey === 'is_brand_integrity_at_risk') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'brand_integrity_critical', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'brand_integrity_elevated', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'brand_integrity_weak', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'brand_integrity_strong', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // ── Payment Health (Wave 8.1) ──

  if (questionKey === 'is_payment_health_creating_revenue_risk') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'payment_health_critical', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'payment_health_at_risk', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'payment_health_at_risk', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'payment_health_stable', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // ── Wave 8.3: Content Freshness & Decay ──

  if (questionKey === 'is_stale_content_eroding_trust_and_visibility') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'content_freshness_critical', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'content_freshness_at_risk', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'content_freshness_at_risk', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'content_freshness_healthy', category: DecisionClass.State, primary_outcome: 'observation' };
  }

  // ── Security posture (Wave 3.3) ──

  if (questionKey === 'is_visible_security_posture_creating_financial_risk') {
    if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
      return { decision_key: 'security_posture_critical', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
      return { decision_key: 'security_posture_elevated', category: DecisionClass.Risk, primary_outcome: 'incident' };
    }
    if (risk.decision_impact === DecisionImpact.Optimize) {
      return { decision_key: 'security_posture_weak', category: DecisionClass.State, primary_outcome: 'observation' };
    }
    return { decision_key: 'security_posture_adequate', category: DecisionClass.State, primary_outcome: 'observation' };
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
  if (questionKey === 'is_visible_security_posture_creating_financial_risk') {
    return buildSecurityPostureActions(risk, inferences, translations);
  }
  if (questionKey === 'is_copy_aligned_with_commercial_intent') {
    return buildCopyAlignmentActions(risk, inferences, translations);
  }
  if (questionKey === 'is_payment_health_creating_revenue_risk') {
    return buildPaymentHealthActions(risk, inferences, translations);
  }
  if (questionKey === 'is_discoverability_limiting_growth') {
    return buildDiscoverabilityActions(risk, inferences, translations);
  }
  if (questionKey === 'is_brand_integrity_at_risk') {
    return buildBrandIntegrityActions(risk, inferences, translations);
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

function buildSecurityPostureActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  // Localize-or-fallback helper: route every action string through the
  // translations map keyed by `security_posture.<key>`. Missing keys
  // fall back to the English source so adding a translation is purely
  // additive — never breaks the engine.
  const ts = translations?.actions?.security_posture;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;

  const secondary: string[] = [];
  const verification: string[] = [];

  const headerWeak = inferences.find(i => i.inference_key === 'security_header_weakness');
  const mixedContent = inferences.find(i => i.inference_key === 'mixed_content_exposure');
  const openRedirect = inferences.find(i => i.inference_key === 'open_redirect_indicator');
  const sensitiveEndpoint = inferences.find(i => i.inference_key === 'sensitive_endpoint_exposed');

  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('incident_primary', 'You have critical security holes that buyers can see. Fix these before taking another payment.');

    if (sensitiveEndpoint && sensitiveEndpoint.conclusion_value !== 'low') {
      secondary.push(tr('incident_sensitive_endpoint', 'Lock down or remove the admin pages, config files, and backups that are currently public.'));
    }
    if (mixedContent && mixedContent.conclusion_value !== 'low') {
      secondary.push(tr('incident_mixed_content', 'Stop loading insecure content on your sale pages — every resource needs to come over HTTPS or buyers see broken padlocks.'));
    }
    if (openRedirect && openRedirect.conclusion_value !== 'low') {
      secondary.push(tr('incident_open_redirect', 'Close the open redirects on your site — attackers can use them to send your customers to fake checkout pages.'));
    }
    if (headerWeak && headerWeak.conclusion_value !== 'low') {
      secondary.push(tr('incident_security_headers', 'Add the basic security headers (CSP, HSTS, X-Frame-Options) so the browser stops flagging your site as risky.'));
    }

    verification.push(tr('incident_verify_rerun', 'Run a new audit after the fixes so we can confirm the holes are closed.'));
    verification.push(tr('incident_verify_endpoints', 'Double-check that the previously exposed pages are no longer reachable from the open internet.'));
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Your security has gaps that will hurt you at scale. Close them before pushing more traffic.');

    if (headerWeak && headerWeak.conclusion_value !== 'low') {
      secondary.push(tr('fix_security_headers', 'Tighten your security headers so the site is less exposed to injection and clickjacking attacks.'));
    }
    if (openRedirect && openRedirect.conclusion_value !== 'low') {
      secondary.push(tr('fix_open_redirect', 'Fix the open redirect endpoints — they are easy to abuse.'));
    }

    verification.push(tr('fix_verify_rerun', 'Run a new audit after the changes to confirm they took effect.'));
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.Optimize) {
    return {
      primary: tr('optimize_primary', 'Your security holds up. There are still some hardening wins available.'),
      secondary: [
        ...(headerWeak ? [tr('optimize_csp', 'Consider stricter Content-Security-Policy and Permissions-Policy headers for extra defense.')] : []),
      ],
      verification: [tr('optimize_verify', 'Re-check security posture every few months to catch regressions.')],
    };
  }

  return {
    primary: tr('observe_primary', 'Your security is in good shape. No significant exposures right now.'),
    secondary: [],
    verification: [tr('observe_verify', 'Schedule a periodic security check to keep this clean.')],
  };
}

function buildCopyAlignmentActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.copy_alignment;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;

  const secondary: string[] = [];
  const verification: string[] = [];

  const vpBuried = inferences.find(i => i.inference_key === 'value_proposition_buried');
  const socialProof = inferences.find(i => i.inference_key === 'social_proof_ineffective');
  const objection = inferences.find(i => i.inference_key === 'objection_unaddressed');
  const ctaUnclear = inferences.find(i => i.inference_key === 'cta_competing_or_unclear');
  const trustCopy = inferences.find(i => i.inference_key === 'trust_copy_absent_at_decision');
  const funnelMismatch = inferences.find(i => i.inference_key === 'copy_funnel_misalignment');
  const crossPage = inferences.find(i => i.inference_key === 'copy_cross_page_inconsistent');

  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('incident_primary', 'Your copy is actively losing revenue. The messaging fails to convert high-intent visitors.');

    if (vpBuried && vpBuried.conclusion_value !== 'low') {
      secondary.push(tr('incident_vp_buried', 'Rewrite your hero section: the value proposition is buried below the fold or hidden behind generic language.'));
    }
    if (ctaUnclear && ctaUnclear.conclusion_value !== 'low') {
      secondary.push(tr('incident_cta_unclear', 'Consolidate competing CTAs: visitors see too many actions and choose none. Pick one primary CTA per page.'));
    }
    if (trustCopy && trustCopy.conclusion_value !== 'low') {
      secondary.push(tr('incident_trust_copy', 'Add trust copy at the decision point: testimonials, guarantees, and security language near your checkout or signup.'));
    }
    if (objection && objection.conclusion_value !== 'low') {
      secondary.push(tr('incident_objection', 'Address buyer objections on the page: missing FAQ, no risk-reversal language, unaddressed pricing concerns.'));
    }

    verification.push(tr('incident_verify_rerun', 'Re-run copy analysis after rewriting to confirm alignment improves.'));
    verification.push(tr('incident_verify_conversion', 'Monitor conversion rate lift after copy changes to measure revenue impact.'));
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Your copy has structural gaps that will bleed revenue at scale. Fix before increasing ad spend.');

    if (funnelMismatch && funnelMismatch.conclusion_value !== 'low') {
      secondary.push(tr('fix_funnel_mismatch', 'Align copy to funnel stage: awareness pages should educate, decision pages should reassure and convert.'));
    }
    if (socialProof && socialProof.conclusion_value !== 'low') {
      secondary.push(tr('fix_social_proof', 'Strengthen social proof: add specific numbers, named testimonials, and logos instead of generic claims.'));
    }
    if (crossPage && crossPage.conclusion_value !== 'low') {
      secondary.push(tr('fix_cross_page', 'Harmonize messaging across pages: your landing page promises one thing, but pricing and checkout say another.'));
    }

    verification.push(tr('fix_verify', 'Re-run copy analysis after changes to confirm gaps are closed.'));
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.Optimize) {
    return {
      primary: tr('optimize_primary', 'Copy is functional but has optimization opportunities. Refining messaging could lift conversion.'),
      secondary: [
        ...(socialProof ? [tr('optimize_social_proof', 'Consider upgrading social proof from generic to specific and quantified.')] : []),
        ...(vpBuried ? [tr('optimize_vp', 'Test alternative headline framings to make the value proposition more immediate.')] : []),
      ],
      verification: [tr('optimize_verify', 'Re-check copy alignment periodically as you update pages.')],
    };
  }

  return {
    primary: tr('aligned_primary', 'Copy is well-aligned with commercial intent. No significant gaps detected.'),
    secondary: [],
    verification: [tr('aligned_verify', 'Schedule periodic copy reviews to catch drift as products evolve.')],
  };
}

function buildPaymentHealthActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.payment_health;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;

  const secondary: string[] = [];
  const verification: string[] = [];

  const failedPayment = inferences.find(i => i.inference_key === 'failed_payment_revenue_drain');
  const churnUnsustainable = inferences.find(i => i.inference_key === 'subscriber_churn_unsustainable');
  const diversityInsufficient = inferences.find(i => i.inference_key === 'payment_diversity_insufficient');

  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('incident_primary', 'Your payment infrastructure is actively losing revenue. Failed payments and churn require immediate intervention.');

    if (failedPayment && failedPayment.conclusion_value !== 'low') {
      secondary.push(tr('incident_failed_payments', 'Activate card updater and smart retry in Stripe. Send dunning emails on first failure with a direct link to update payment method.'));
    }
    if (churnUnsustainable && churnUnsustainable.conclusion_value !== 'low') {
      secondary.push(tr('incident_churn', 'Implement cancellation survey and retention offers (pause, downgrade, extension) before final cancellation.'));
    }
    if (diversityInsufficient && diversityInsufficient.conclusion_value !== 'low') {
      secondary.push(tr('incident_diversity', 'Add a secondary payment gateway with automatic failover to prevent single-point-of-failure outages.'));
    }

    verification.push(tr('incident_verify', 'Re-pull Stripe data after 30 days to confirm failed payment rate dropped below 5%.'));
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Payment health has issues that will compound as you grow. Fix before scaling subscriber acquisition.');

    if (failedPayment) {
      secondary.push(tr('fix_failed_payments', 'Configure dunning automation with progressive retry and customer notification.'));
    }
    if (churnUnsustainable) {
      secondary.push(tr('fix_churn', 'Analyze churn cohorts by tenure to identify the month where most subscribers cancel.'));
    }

    verification.push(tr('fix_verify', 'Re-pull Stripe data after implementing changes to track improvement.'));
    return { primary, secondary, verification };
  }

  if (risk.decision_impact === DecisionImpact.Optimize) {
    return {
      primary: tr('optimize_primary', 'Payment health is acceptable but has room for improvement.'),
      secondary: [
        ...(failedPayment ? [tr('optimize_dunning', 'Consider adding grace periods before access suspension on failed payments.')] : []),
        ...(diversityInsufficient ? [tr('optimize_diversity', 'Consider adding a backup payment gateway for resilience.')] : []),
      ],
      verification: [tr('optimize_verify', 'Monitor payment health metrics monthly via Stripe integration.')],
    };
  }

  return {
    primary: tr('stable_primary', 'Payment health is stable. Failed payment and churn rates are within acceptable ranges.'),
    secondary: [],
    verification: [tr('stable_verify', 'Continue monitoring payment health through Stripe integration.')],
  };
}

// ──────────────────────────────────────────────
// Discoverability actions — covers ~30 findings:
//   - Phase 3E discoverability (commercial pages, social previews,
//     brand consistency)
//   - Wave 12 Brand Echo discoverability subset (industry listings,
//     branded/category SERP, HN, Reddit)
//   - Wave 13 AI Visibility (bot access, llms.txt, schema, Wikipedia
//     depth, comparison ownership) + positives + Wave B opportunities
//     + trajectory
//
// Secondary actions are emitted per finding present, ordered by
// expected revenue impact. Capped at ~8 to avoid overwhelming.
// ──────────────────────────────────────────────

function buildDiscoverabilityActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.discoverability;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  const has = (key: string): Inference | undefined => inferences.find((i) => i.inference_key === key);

  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 13 AI Visibility — quickest wins first (high ROI / low effort)
  if (has('no_llms_txt')) {
    secondary.push(tr('publish_llms_txt', 'Publish /llms.txt at the site root with a one-page summary of what the product does, who it is for, and links to /pricing + /docs. 15-minute action with measurable AI Overview citation lift in 30-60 days.'));
  }
  if (has('no_machine_readable_pricing')) {
    secondary.push(tr('publish_pricing_md', 'Publish /pricing.md (or /pricing.txt) at the site root with plan names, monthly prices, key limits, and what is included per tier. AI agents comparing tools programmatically depend on parseable pricing.'));
  }
  if (has('ai_bots_blocked')) {
    secondary.push(tr('unblock_ai_bots', 'Edit robots.txt to allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and Bingbot. Each blocked crawler is a platform that physically cannot cite the brand.'));
  }
  if (has('schema_markup_missing_for_product') || has('schema_priority_list')) {
    secondary.push(tr('add_product_schema', 'Add Product (or SoftwareApplication) + Offer JSON-LD to /pricing first, then Organization on homepage, then FAQPage on any page with Q&A content. AI assistants prefer schema-rich content for citation.'));
  }
  if (has('wikipedia_article_thin_or_outdated') || has('wikipedia_gap_to_fill')) {
    secondary.push(tr('improve_wikipedia', 'Strengthen Wikipedia presence: collect 3-5 independent press references about the brand, then either expand the existing article or submit a new article via WP:AfC. Do not author your own edits — recruit independent editors with the sourced material.'));
  }

  // Wave 12 Brand Echo — industry listings + SERP visibility
  if (has('g2_listing_void')) {
    secondary.push(tr('claim_g2', 'Claim your G2 profile (free). Add product description, screenshots, integrations, and seed 10-15 honest reviews from happy customers in the first 30 days. G2 review count >50 unlocks AI assistant preference for category queries.'));
  }
  if (has('capterra_listing_void')) {
    secondary.push(tr('claim_capterra', 'Claim Capterra/GetApp/SoftwareAdvice profiles (all owned by Gartner, single onboarding). B2B buyers research here before vendor calls.'));
  }
  if (has('producthunt_listing_void')) {
    secondary.push(tr('claim_producthunt', 'Submit the product to Product Hunt with a coordinated launch (community pre-warming + day-of hunter outreach). Even without #1 placement, the page becomes a persistent third-party citation asset.'));
  }
  if (has('branded_serp_invisible')) {
    secondary.push(tr('fix_branded_serp', 'Branded SERP fix: ensure homepage <title> includes the brand name, canonical points to root, and the H1 uses the brand verbatim. Submit a Google Search Console "site:" query with the brand to detect indexation gaps.'));
  }
  if (has('competitor_brand_hijack_serp')) {
    secondary.push(tr('reclaim_branded_serp', 'Competitors are outranking you on your own brand name. Publish a brand "vs alternatives" page on your own domain that owns the comparison narrative; file trademark complaints on competitor pages using your trademark in ad copy.'));
  }
  if (has('affiliate_outranks_own')) {
    secondary.push(tr('reclaim_affiliate_traffic', 'Affiliate/review sites earn commission on your branded traffic. Build stronger branded landing pages, partner directly with the highest-volume affiliates instead of paying via networks, and pursue trademark enforcement on misleading review pages.'));
  }
  if (has('category_intent_invisible') || has('high_leverage_query_unowned')) {
    secondary.push(tr('own_category_query', 'Buyers shopping the category never see you. Publish a "best [category] [year]" listicle on your own domain, target the alternatives keyword cluster with 1,500-word landing pages, and outreach to 3-5 independent "best of" listicle authors for inclusion.'));
  }
  if (has('competitor_owns_comparison') || has('unfindable_in_comparison_searches')) {
    secondary.push(tr('own_vs_query', 'Competitors author the "<brand> vs them" pages — they shape how AI describes you. Publish fair side-by-side comparison pages on your own domain for the top 3 competitors, with criteria buyers actually use.'));
  }
  if (has('hn_tech_audience_invisible')) {
    secondary.push(tr('hn_engagement', 'Tech early-adopters have never discussed you on Hacker News. Plan a "Show HN" launch with a real engineering story OR publish one deep-dive technical post that earns front-page traction. Either creates a persistent HN citation surface.'));
  }
  if (has('reddit_forum_absence') || has('reddit_category_demand_unmet')) {
    secondary.push(tr('reddit_authentic_presence', 'Reddit recommendation threads never mention you while buyers ask for tools in your category. Identify 2-3 active subreddits, seed authentic founder presence over 30+ days, and respond helpfully to existing recommendation threads. Avoid promotional posts — Reddit moderation penalizes them.'));
  }
  if (has('third_party_citation_target')) {
    secondary.push(tr('expand_third_party', 'Claim missing third-party listings and seed reviews. AI assistants are 6.5× more likely to cite via third-party sources than via your own domain — this is structural moat.'));
  }

  // Phase 3E discoverability findings (pre-existing)
  if (has('commercial_pages_weak_search_representation')) {
    secondary.push(tr('improve_search_representation', 'Commercial pages have weak search representation. Add proper <title>, meta description, and OpenGraph tags that match buying-intent queries.'));
  }
  if (has('social_previews_fail_commercial_value')) {
    secondary.push(tr('improve_social_previews', 'Social previews fail to communicate commercial value. Add OG image, og:title with value prop, and og:description with the offer for every commercial page.'));
  }
  if (has('brand_inconsistent_across_surfaces')) {
    secondary.push(tr('unify_brand_surfaces', 'Brand name appears inconsistently across pages (e.g., capitalization, abbreviations). Standardize across <title>, H1, OG tags, and copy.'));
  }
  if (has('commercial_pages_not_exposed_for_discovery') || has('commercial_pages_unlikely_indexed')) {
    secondary.push(tr('expose_commercial_pages', 'Commercial pages (pricing, product, checkout entry) may not be indexed by search engines. Verify robots.txt allows crawling, add them to the sitemap, and link from the homepage.'));
  }

  // Build primary by impact level
  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('incident_primary', 'AI assistants and search engines cannot find or recommend the brand. Buyers researching your category find competitors instead. Address visibility gaps before any paid acquisition push.');
    verification.push(tr('incident_verify', 'Re-run the external recon audit in 30 days to confirm AI Visibility Score moved above 60.'));
    return { primary, secondary: secondary.slice(0, 8), verification };
  }
  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Discoverability gaps are limiting growth. Each blocked AI crawler, missing listing, or unowned comparison query is buying-intent traffic going to competitors. Fix high-leverage items first (llms.txt + schema + Wikipedia).');
    verification.push(tr('fix_verify', 'Re-run external recon in 30-60 days and confirm AI Visibility Score improved by ≥10 points.'));
    return { primary, secondary: secondary.slice(0, 6), verification };
  }
  if (risk.decision_impact === DecisionImpact.Optimize) {
    const primary = tr('optimize_primary', 'Core discoverability is in place — refine for AI search to compound your visibility.');
    verification.push(tr('optimize_verify', 'Monitor AI Visibility Score quarterly; investigate any drops promptly.'));
    return { primary, secondary: secondary.slice(0, 4), verification };
  }
  // Observe — strengths visible, protect them
  return {
    primary: tr('strong_primary', 'Discoverability is healthy. Continue feeding fresh content + structured data; monitor AI Visibility Score for regressions.'),
    secondary: secondary.slice(0, 3),
    verification: [tr('strong_verify', 'Schedule quarterly external recon to catch citation losses early.')],
  };
}

// ──────────────────────────────────────────────
// Brand Integrity actions — covers Phase 3E brand impersonation +
// Wave 12 Brand Echo brand-integrity subset (Trustpilot, Reclame Aqui,
// competitor hijack, affiliate dominance).
// ──────────────────────────────────────────────

function buildBrandIntegrityActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.brand_integrity;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  const has = (key: string): Inference | undefined => inferences.find((i) => i.inference_key === key);

  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 12 Brand Echo — reputation review platforms
  if (has('trustpilot_complaint_cluster')) {
    secondary.push(tr('respond_trustpilot_complaints', 'Negative Trustpilot reviews are sitting unanswered for prospects to read. Assign someone to respond within 48 hours of each new review with an empathetic acknowledgment + concrete next step. Reply to existing unanswered negatives now — even a 5-month-old reply restores credibility.'));
  }
  if (has('trustpilot_response_silence')) {
    secondary.push(tr('trustpilot_response_cadence', 'Set up a Trustpilot alert that pages someone for any new review. Target sub-48h response rate above 70% — silence is the #1 reason high-intent prospects pick a competitor with similar features but visible care.'));
  }
  if (has('reclame_aqui_reputation_critical')) {
    secondary.push(tr('reclame_aqui_recovery', 'Reclame Aqui flags the brand as critical — BR buyers verify before paying. Resolve pending complaints publicly (status = Resolvido), respond to every new complaint within 5 business days, and target index acima de 7/10 within 90 days.'));
  }

  // Wave 12 Brand Echo — SERP integrity (these overlap with discoverability
  // but the response is more about ownership/IP enforcement)
  if (has('competitor_brand_hijack_serp')) {
    secondary.push(tr('competitor_hijack_enforcement', 'Competitors outrank your own domain on your brand name. Publish a press kit + about page that aggressively owns brand signal. For repeat offenders running paid ads on your trademark, file Google Ads Trademark Complaints + Meta brand reports.'));
  }
  if (has('affiliate_outranks_own')) {
    secondary.push(tr('affiliate_traffic_recovery', 'Affiliate/review sites earn commission on traffic that should be direct. Negotiate direct deals with the top 3 affiliate sites (better margin than network commissions), file trademark enforcement on misleading review pages, and invest in your own branded landing pages.'));
  }

  // Phase 3E — Brand impersonation / typosquats
  if (has('lookalike_domain_competing_for_traffic')) {
    secondary.push(tr('lookalike_domain_response', 'A lookalike domain is competing for branded traffic. File a UDRP complaint with the relevant registrar, or buy the domain directly if it is for sale and redirects to a competitor.'));
  }
  if (has('external_sites_mimicking_brand') || has('customers_exposed_to_phishing_surfaces')) {
    secondary.push(tr('phishing_response', 'External sites are mimicking the brand — phishing exposure for customers. Submit takedown requests via Google Safe Browsing + Microsoft Defender, notify affected customers via email, and monitor for new lookalikes weekly.'));
  }
  if (has('brand_traffic_exposed_to_deceptive_surfaces') || has('suspicious_domains_capturing_purchase_intent')) {
    secondary.push(tr('deceptive_surface_audit', 'Suspicious domains are capturing brand-intent traffic. Run brand monitoring queries weekly, file trademark complaints on confirmed bad actors, and create a "report a fake site" link on the footer.'));
  }
  if (has('brand_presence_diluted_across_variants')) {
    secondary.push(tr('unify_brand_presence', 'Brand presence is diluted across name variants (.com, .io, country TLDs). Consolidate to one canonical domain with 301 redirects from variants, and unify brand spelling across all surfaces.'));
  }

  // Wave 13 AI Visibility (brand-integrity adjacent) — handled mostly in
  // discoverability actions, but a few high-severity ones bleed here too
  if (has('branded_query_ai_overview_competitor')) {
    secondary.push(tr('branded_ai_overview_recover', 'When AI summarizes searches for your brand, it cites competitors first. Publish a definitive brand page (homepage + /about + press kit) with consistent entity signals + Wikipedia + Organization schema. AI Overview rebalances within 60-90 days.'));
  }

  // Build primary by impact level
  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('incident_primary', 'Brand integrity is critically compromised. Negative reputation, hijacked search, or phishing exposure are actively costing buyers and revenue. Address this before any acquisition spend.');
    verification.push(tr('incident_verify', 'Re-run external recon in 30 days; confirm reputation labels improved and unanswered complaints addressed.'));
    return { primary, secondary: secondary.slice(0, 8), verification };
  }
  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Brand integrity has real gaps. Unanswered reviews, weakened SERP control, and inconsistent brand surfaces compound — fix before scaling brand awareness spend.');
    verification.push(tr('fix_verify', 'Re-run external recon in 60 days and confirm reputation + SERP signals improved.'));
    return { primary, secondary: secondary.slice(0, 6), verification };
  }
  if (risk.decision_impact === DecisionImpact.Optimize) {
    const primary = tr('optimize_primary', 'Brand integrity is largely intact — maintain response cadence on review platforms and watch for new lookalike threats.');
    verification.push(tr('optimize_verify', 'Monthly brand-monitoring sweep + quarterly external recon.'));
    return { primary, secondary: secondary.slice(0, 4), verification };
  }
  return {
    primary: tr('strong_primary', 'Brand integrity is strong. Continue monitoring third-party review platforms + lookalike domains.'),
    secondary: secondary.slice(0, 3),
    verification: [tr('strong_verify', 'Schedule quarterly external recon and brand monitoring.')],
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
    case 'security_posture_critical':
      return `Critical security exposures detected. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Sensitive files or mixed content on commercial pages create immediate financial risk.`;
    case 'security_posture_elevated':
      return `Elevated security posture risk. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Weak headers or open redirects increase exposure.`;
    case 'security_posture_weak':
      return `Security posture has minor gaps. Risk score: ${risk.raw_risk_score}/100. Hardening opportunities exist but are not blocking.`;
    case 'security_posture_adequate':
      return `Security posture is adequate. No significant exposures detected (score: ${risk.raw_risk_score}/100).`;
    case 'copy_misaligned':
      return `Copy is misaligned with commercial intent. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Messaging is failing to convert high-intent visitors across multiple dimensions.`;
    case 'copy_significant_gaps':
      return `Copy has significant alignment gaps. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Multiple CRO dimensions need attention before scaling.`;
    case 'copy_minor_gaps':
      return `Copy has minor alignment gaps. Risk score: ${risk.raw_risk_score}/100. Messaging is mostly effective but refinements could lift conversion.`;
    case 'copy_aligned':
      return `Copy is aligned with commercial intent. No significant gaps detected (score: ${risk.raw_risk_score}/100).`;
    // Channel Integrity
    case 'channel_integrity_critical':
      return `Critical channel integrity compromise detected. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Payment surfaces, scripts, or infrastructure are exposed to tampering or hijack.`;
    case 'channel_integrity_elevated':
      return `Elevated channel integrity risk. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Abuse vectors or brittle infrastructure need attention before scaling.`;
    case 'channel_integrity_weak':
      return `Channel integrity has minor gaps. Risk score: ${risk.raw_risk_score}/100. Hardening opportunities exist but are not blocking.`;
    case 'channel_integrity_strong':
      return `Channel integrity is strong. No significant compromise vectors detected (score: ${risk.raw_risk_score}/100).`;
    // Discoverability
    case 'discoverability_critically_weak':
      return `Discoverability is critically weak. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Commercial pages are invisible to search engines and social platforms.`;
    case 'discoverability_gaps_significant':
      return `Significant discoverability gaps. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Search representation and social previews need improvement before scaling traffic.`;
    case 'discoverability_improvable':
      return `Discoverability has optimization opportunities. Risk score: ${risk.raw_risk_score}/100. Pages are indexable but not well-represented.`;
    case 'discoverability_adequate':
      return `Discoverability is adequate. No significant gaps detected (score: ${risk.raw_risk_score}/100).`;
    // Brand Integrity
    case 'brand_integrity_critical':
      return `Critical brand integrity threat. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Active impersonation or phishing surfaces are diverting customer trust and revenue.`;
    case 'brand_integrity_elevated':
      return `Elevated brand integrity risk. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Lookalike domains or deceptive surfaces are competing for brand traffic.`;
    case 'brand_integrity_weak':
      return `Brand integrity has minor exposure. Risk score: ${risk.raw_risk_score}/100. Brand presence is diluted but not under active threat.`;
    case 'brand_integrity_strong':
      return `Brand integrity is strong. No significant impersonation or dilution detected (score: ${risk.raw_risk_score}/100).`;
    // Payment Health (Wave 8.1)
    case 'payment_health_critical':
      return `Payment health is critical. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Failed payment rate or subscriber churn has crossed dangerous thresholds — revenue is being lost to involuntary churn.`;
    case 'payment_health_at_risk':
      return `Payment health is at risk. Risk score: ${risk.raw_risk_score}/100, confidence: ${risk.confidence_score}/100. Elevated failed payments or subscriber churn are creating preventable revenue loss.`;
    case 'payment_health_stable':
      return `Payment health is stable. Failed payment and churn rates are within acceptable ranges (score: ${risk.raw_risk_score}/100).`;
    default:
      return `Decision: ${decisionKey}. Risk: ${risk.raw_risk_score}/100, Confidence: ${risk.confidence_score}/100.`;
  }
}
