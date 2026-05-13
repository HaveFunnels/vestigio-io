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
// Wave 15.5 — gating threshold for action secondaries.
//
// Builders' local `has(key)` helpers route through isFiringInference()
// so secondaries don't trigger on weak or low-confidence inferences.
//
//   severity_hint must be 'critical' | 'high' | 'medium'
//     (excludes 'low' and 'none' — positive findings + advisory signals
//      shouldn't surface as aggressive remediation prescriptions)
//
//   confidence must be ≥ 50
//     (mirrors FindingProjection.confidence_tier='low' filter at the
//      same threshold — keeps actions and findings aligned)
//
// Compound inferences hard-code severity='high' + confidence=85, so
// they always pass. Positive findings hard-code severity='none', so
// they never pass — they have their own primary action rendering.
// ──────────────────────────────────────────────
const MIN_ACTION_FIRING_CONFIDENCE = 50;
const STRONG_SEVERITY_HINTS = new Set(['critical', 'high', 'medium']);

function isFiringInference(inf: Inference | undefined): boolean {
  if (!inf) return false;
  if (!STRONG_SEVERITY_HINTS.has(inf.severity_hint ?? '')) return false;
  if (inf.confidence < MIN_ACTION_FIRING_CONFIDENCE) return false;
  return true;
}

/**
 * Pull a concrete numeric count from an inference for data interpolation
 * in action secondary text. Looks at reasoning_slots first (structured),
 * falls back to first integer in inference.reasoning. Returns null when
 * no usable count is available.
 */
function inferenceConcreteCount(inf: Inference | undefined): number | null {
  if (!inf) return null;
  const slots = inf.reasoning_slots ?? {};
  const candidates = ['count', 'numeric_value', 'unanswered_count', 'hijack_count', 'thread_count', 'category_demand', 'prior_score', 'current_score'];
  for (const k of candidates) {
    const v = slots[k];
    if (typeof v === 'number' && v > 0) return v;
    if (typeof v === 'string') {
      const parsed = parseInt(v, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  const m = inf.reasoning?.match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

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
  if (questionKey === 'is_saas_growth_ready') {
    return buildSaasGrowthReadinessActions(risk, inferences, translations);
  }
  if (questionKey === 'is_channel_integrity_compromised') {
    return buildChannelIntegrityActions(risk, inferences, translations);
  }
  if (questionKey === 'how_much_does_ux_friction_cost') {
    return buildFrictionTaxActions(risk, inferences, translations);
  }
  if (questionKey === 'is_stale_content_eroding_trust_and_visibility') {
    return buildContentFreshnessActions(risk, inferences, translations);
  }
  if (questionKey === 'is_mobile_experience_costing_revenue') {
    return buildMobileRevenueExposureActions(risk, inferences, translations);
  }
  if (questionKey === 'is_trust_deficit_blocking_revenue') {
    return buildTrustRevenueGapActions(risk, inferences, translations);
  }
  if (questionKey === 'is_first_session_conversion_leaking') {
    return buildFirstImpressionRevenueActions(risk, inferences, translations);
  }
  if (questionKey === 'are_user_actions_driving_revenue') {
    return buildActionValueMapActions(risk, inferences, translations);
  }
  if (questionKey === 'is_paid_traffic_reaching_conversion') {
    return buildAcquisitionIntegrityActions(risk, inferences, translations);
  }
  if (questionKey === 'are_visitors_on_shortest_conversion_path') {
    return buildPathEfficiencyActions(risk, inferences, translations);
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
  const ts = translations?.actions?.revenue_integrity;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const hasActive = (key: string): boolean => {
    const inf = has(key);
    return !!inf && inf.conclusion_value !== 'low' && inf.conclusion_value !== 'none' && inf.conclusion_value !== 'false';
  };

  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound insights (surface FIRST; encode order-of-operations)
  if (has('compound_funnel_triple_leak')) {
    secondary.push(tr('compound_funnel_triple', 'CROSS-PACK: Revenue leaks at top (cart) + middle (failed payments) + bottom (churn). Fixing only cart while feeding the middle/bottom leaks wastes acquisition. Order: (1) failed payments first (Stripe Smart Retries + dunning = 30-50% recovery, 1 wk); (2) cancel-flow + retention (2 wks); (3) THEN attack cart with retention engine in place.'));
  }
  if (has('compound_pricing_unclear_and_unparseable')) {
    secondary.push(tr('compound_pricing', 'CROSS-PACK: Pricing fails on both humans AND AI agents. Single rewrite covers both: (a) /pricing with exact monthly + annual prices visible without interaction, "what\'s included" table, recommended-plan badge; (b) /pricing.md mirroring same structure. 2-3 hours, double-layer impact.'));
  }

  // ── Core structural revenue findings ──
  if (hasActive('revenue_leakage') || hasActive('critical_path_broken')) {
    secondary.push(tr('close_leak', 'Close revenue leak points: fix broken forms, consolidate checkout to one domain, and ensure clear conversion entry.'));
  }
  if (hasActive('conversion_flow_fragmented') || hasActive('checkout_provider_fragmented')) {
    secondary.push(tr('consolidate', 'Consolidate conversion path: reduce external host fragmentation and eliminate unnecessary redirects before checkout.'));
  }
  if (hasActive('trust_break_in_checkout') || hasActive('redirect_chain_erodes_checkout_trust')) {
    secondary.push(tr('restore_trust', 'Restore trust at checkout: add policies, verify providers, ensure brand continuity through the purchase flow.'));
  }
  if (hasActive('friction_on_critical_path')) {
    secondary.push(tr('reduce_friction', 'Reduce critical path friction: fix broken form actions, speed up slow pages, eliminate unnecessary redirects.'));
  }
  if (hasActive('measurement_blindspot') || hasActive('high_intent_surfaces_blind') || hasActive('consent_undermining_measurement')) {
    secondary.push(tr('measurement_coverage', 'Install analytics on every commercial page (homepage, pricing, checkout, thank-you). Verify consent banner does not block primary measurement.'));
  }
  if (hasActive('unclear_conversion_intent')) {
    secondary.push(tr('clarify_intent', 'Clarify conversion intent: one primary CTA above the fold, supporting CTAs only after the primary is visible.'));
  }
  if (hasActive('commercial_journey_language_break') || hasActive('multilingual_conversion_leak')) {
    secondary.push(tr('language_continuity', 'Buyer sees language switch mid-purchase. Force the buying flow to stay in the entry language (homepage → checkout) with explicit locale handling on every redirect.'));
  }
  if (hasActive('commercial_pages_disconnected')) {
    secondary.push(tr('commercial_connectivity', 'Commercial pages (pricing, product, checkout) are not interlinked. Add direct CTA links from every commercial page to the next funnel step.'));
  }

  // ── Mobile-specific revenue ──
  if (hasActive('mobile_trust_weaker_than_desktop') || hasActive('mobile_trust_payment_deps_failing')) {
    secondary.push(tr('mobile_trust', 'Mobile buyers see less reassurance than desktop. Audit trust badges, testimonials, and policy links on mobile viewport — many are hidden below the fold or load late.'));
  }

  // ── Runtime / network findings ──
  if (hasActive('runtime_errors_interrupt_purchase') || hasActive('runtime_measurement_broken')) {
    secondary.push(tr('runtime_errors', 'Runtime JS errors are breaking purchase OR analytics on commercial pages. Open browser DevTools on /checkout (mobile + desktop) and triage every red console error.'));
  }
  if (hasActive('checkout_api_latency_degraded') || hasActive('purchase_blocked_failing_requests')) {
    secondary.push(tr('checkout_latency', 'Checkout API calls are slow or failing. Audit the slowest 3 endpoints in /checkout — most common culprits: under-scaled payment provider, third-party widgets blocking submission.'));
  }
  if (hasActive('purchase_before_deps_ready') || hasActive('measurement_breaks_revenue_path')) {
    secondary.push(tr('deps_sequencing', 'Buyer can click Buy before payment libs or analytics finish loading. Defer the CTA enable until critical deps are ready.'));
  }
  if (hasActive('secondary_flows_bypass_trust_path') || hasActive('alternate_flows_unmeasured')) {
    secondary.push(tr('secondary_flows', 'Alternate buying flows (WhatsApp checkout, /quick-buy, embedded forms) bypass your trust + measurement stack. Bring them under the same governance as the main flow.'));
  }

  // ── Behavioral / hesitation findings (Phase 4B) ──
  if (hasActive('cta_visible_but_behaviorally_dead') || hasActive('cta_clarity_weak_on_commercial')) {
    secondary.push(tr('dead_cta', 'Primary CTA is visible but nobody clicks. Re-test copy ("Get Started" vs "Start free trial"), increase button contrast, and remove competing actions in the same fold.'));
  }
  if (hasActive('purchase_hesitation_with_backtrack') || hasActive('hesitation_before_conversion_missing_trust')) {
    secondary.push(tr('hesitation_trust', 'Buyers hesitate at checkout because trust signals are missing AT the decision moment. Add testimonials, guarantees, and security badges directly adjacent to the Buy button.'));
  }
  if (hasActive('pricing_hesitation_unclear_value') || hasActive('pricing_page_framing_unclear') || hasActive('pricing_page_complexity_paralysis')) {
    secondary.push(tr('pricing_clarity', 'Pricing page is causing hesitation — too many options, unclear value, or hidden numbers. Cap visible plans at 3, lead with the recommended one, and put exact price above the fold.'));
  }
  if (hasActive('sensitive_input_abandonment') || hasActive('sensitive_input_perceived_risk_dropoff')) {
    secondary.push(tr('sensitive_input', 'Buyers abandon at sensitive fields (CPF, card, address). Add a brief why-we-need-this note next to the field + visible security indicator (lock icon, HTTPS badge).'));
  }
  if (hasActive('form_excessive_fields_before_conversion') || hasActive('form_submission_retry_friction')) {
    secondary.push(tr('form_friction', 'Forms have too many fields or trigger retries. Cut to email-only first, postpone non-essential fields to onboarding, and make error messages specific (field-level inline, not toast).'));
  }
  if (hasActive('conversion_final_step_retry') || hasActive('critical_step_retries_before_abandonment')) {
    secondary.push(tr('retry_friction', 'Buyers retry the final step before giving up. Audit submit-button state (disabled timing, double-click protection, error toast clarity).'));
  }
  if (hasActive('cta_late_availability_delays_action')) {
    secondary.push(tr('cta_timing', 'Primary CTA renders late on commercial pages. Inline-load the button HTML so it is visible at first paint; defer heavy JS that powers it.'));
  }
  if (hasActive('checkout_abandon_no_feedback')) {
    secondary.push(tr('abandon_feedback', 'Buyers start checkout, see no progress indicator, and leave. Add a 3-step progress bar (cart → details → payment) at the top of /checkout.'));
  }
  if (hasActive('surface_oscillation_before_dropoff') || hasActive('high_intent_detour_before_abandonment')) {
    secondary.push(tr('oscillation', 'Buyers bounce between pages before giving up (e.g. checkout ↔ FAQ). Embed the top 3 buying objections directly on /checkout — they should not have to leave to find answers.'));
  }
  if (hasActive('funnel_step_alive_but_not_advancing')) {
    secondary.push(tr('stalled_step', 'A funnel step gets traffic but does not advance buyers. Treat as a UX/copy bug — run a 5-user usability test focused on that step.'));
  }
  if (hasActive('cta_viewed_not_engaged')) {
    secondary.push(tr('cta_engagement', 'CTAs are seen but not clicked. Test outcome-focused copy ("Get my conversion audit") vs. action-focused ("Submit"). Outcome copy converts ~30% better.'));
  }

  // ── Copy / messaging findings ──
  if (hasActive('social_proof_generic') || hasActive('trust_badges_invisible_at_checkout')) {
    secondary.push(tr('social_proof', 'Social proof is generic or invisible where buyers decide. Replace stock testimonials with named customers + specific outcome numbers; place trust badges directly adjacent to the buy button.'));
  }
  if (hasActive('form_error_messages_unhelpful')) {
    secondary.push(tr('form_errors', 'Form error messages are unhelpful. Replace "Invalid input" with field-specific guidance ("Phone must be 10 digits, no dashes").'));
  }
  if (hasActive('checkout_trust_language_absent')) {
    secondary.push(tr('checkout_trust_copy', 'Checkout copy lacks reassurance language. Add: payment encryption mention, money-back guarantee, cancellation policy link — all visible without scrolling.'));
  }
  if (hasActive('product_page_copy_generic')) {
    secondary.push(tr('product_copy', 'Product page copy is generic. Replace marketing slogans with: who this is for, what specific problem it solves, the one outcome a buyer will get.'));
  }

  // ── Ad creative / paid acquisition leaks ──
  if (hasActive('ad_creative_dead_destination')) {
    secondary.push(tr('ad_dead_link', 'A paid ad creative is sending traffic to a dead page (404 or wrong URL). Audit live ads + their destinations weekly — this is pure burnt spend.'));
  }
  if (hasActive('ad_creative_landing_trust_gap') || hasActive('ad_landing_experience_disconnect')) {
    secondary.push(tr('ad_landing_trust', 'Ad clicks land on pages that look untrustworthy or disconnected from the ad promise. Add the ad headline verbatim to the landing H1, match imagery, and verify the page loads in <2s on mobile.'));
  }
  if (hasActive('ad_creative_form_friction_waste')) {
    secondary.push(tr('ad_form_friction', 'Ads send buyers to forms that are too long. Cut paid landing forms to email-only or phone-only; collect the rest in the follow-up.'));
  }
  if (hasActive('ad_creative_mobile_checkout_degraded')) {
    secondary.push(tr('ad_mobile_degraded', 'Paid mobile traffic hits a degraded checkout. Audit /checkout on a real mobile device (not Chrome DevTools) and verify CTA tap target, keyboard type per field, autofill.'));
  }
  if (hasActive('ad_creative_message_mismatch') || hasActive('app_subdomain_disconnected_from_site')) {
    secondary.push(tr('ad_message_match', 'Ad promises X but landing page delivers Y. Each ad needs a 1-to-1 matched landing page (or component variation) with the same headline, image, and offer.'));
  }
  if (hasActive('ads_without_conversion_visibility')) {
    secondary.push(tr('ad_attribution', 'Ads run without conversion tracking. Wire conversion pixel events (purchase, signup, lead) and verify in the platform debug tool before scaling spend.'));
  }

  // ── Commerce-context findings (Shopify) ──
  if (hasActive('checkout_abandonment_revenue_leak')) {
    secondary.push(tr('shopify_abandonment', 'Shopify shows high cart abandonment. Audit checkout for: required-account barrier, surprise shipping cost, missing payment options. Enable Shopify Shop Pay if not on already.'));
  }
  if (hasActive('low_repeat_purchase_rate')) {
    secondary.push(tr('repeat_purchase', 'Buyers do not come back. Set up a post-purchase email at day 30 + day 60 with restock reminder or related product; offer a 10% returning-customer code.'));
  }
  if (hasActive('dead_weight_products')) {
    secondary.push(tr('dead_weight', 'Products listed but not selling in 30 days are eating attention and SKU complexity. Delist or bundle them with bestsellers.'));
  }
  if (hasActive('brand_trust_cliff_at_payment') || hasActive('trust_journey_inconsistency')) {
    secondary.push(tr('trust_cliff', 'Brand presentation collapses at the payment step. Audit the visual continuity from homepage → /pricing → /checkout — typography, color, header should match.'));
  }
  if (hasActive('multiple_payment_subdomains_fragmenting_trust')) {
    secondary.push(tr('payment_subdomains', 'Payment flow hops between subdomains (pay.brand.com, secure.brand.com). Consolidate to one origin or display a clear "you are still on Brand.com" indicator.'));
  }
  if (hasActive('navigation_traps_commercial_flow')) {
    secondary.push(tr('nav_traps', 'Navigation steals attention from the buying flow. On /checkout, hide or minimize the global nav — just show logo + maybe a single Help link.'));
  }
  if (hasActive('consent_banner_obscures_first_action')) {
    secondary.push(tr('consent_position', 'Consent banner is obscuring the primary CTA. Move it to bottom or top strip, never center modal blocking the buy button.'));
  }
  if (hasActive('price_hidden_behind_interaction')) {
    secondary.push(tr('price_visibility', 'Buyers see no price until they click. Surface the exact monthly/annual price on /pricing without requiring sign-up or contact form.'));
  }

  // Build primary by risk tier
  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('block_primary', 'Revenue is actively leaking on multiple fronts. Fix the highest-impact items before any traffic scale-up.');
    verification.push(tr('block_verify', 'Re-run revenue analysis after fixes to confirm leakage is resolved + monitor conversion rate week-over-week.'));
    return { primary, secondary: secondary.slice(0, 8), verification };
  }
  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Revenue path has structural issues. Address before scaling ad spend.');
    verification.push(tr('fix_verify', 'Re-run analysis after implementing changes + track conversion delta in week 1-4.'));
    return { primary, secondary: secondary.slice(0, 6), verification };
  }
  if (risk.decision_impact === DecisionImpact.Optimize) {
    const primary = tr('optimize_primary', 'Revenue path is functional but has optimization opportunities.');
    verification.push(tr('optimize_verify', 'Schedule periodic revenue analysis to track improvements.'));
    return { primary, secondary: secondary.slice(0, 4), verification };
  }
  return {
    primary: tr('stable_primary', 'Revenue integrity is stable. No significant leakage detected.'),
    secondary: secondary.slice(0, 3),
    verification: [tr('stable_verify', 'Schedule periodic revenue analysis to detect regressions.')],
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
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };

  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound insights (surface FIRST; they encode order-of-operations)
  if (has('compound_invisible_and_unclear')) {
    secondary.push(tr('compound_invisible_unclear', 'CROSS-PACK: Double leak — buyers shopping your category can\'t find you, and when the rare visitor lands, the value prop is buried. Sequence: clarify value prop above the fold FIRST (1 week), then drive category-intent SEO/SEM. Skipping step 1 wastes every paid click.'));
  }
  if (has('compound_ai_agent_invisibility')) {
    secondary.push(tr('compound_ai_invisibility', 'CROSS-PACK: AI agents comparing products can\'t parse you on llms.txt + Product schema + machine-readable pricing. Single 30-minute action covers all three. Highest 2026 lift in AI-mediated buying.'));
  }
  if (has('compound_category_invisible_and_authority_thin')) {
    secondary.push(tr('compound_category_authority', 'CROSS-PACK: Bottom-of-stack visibility — invisible in category SERP AND no Wikipedia authority. AI assistants preferentially cite brands with both. Two parallel moves: (1) "best <category>" listicle on own domain; (2) Wikipedia article via WP:AfC with independent press refs.'));
  }

  // Wave 13 AI Visibility — quickest wins first (high ROI / low effort)
  if (has('no_llms_txt')) {
    secondary.push(tr('publish_llms_txt', 'Publish /llms.txt at the site root with a one-page summary of what the product does, who it is for, and links to /pricing + /docs. 15-minute action with measurable AI Overview citation lift in 30-60 days.'));
  }
  if (has('no_machine_readable_pricing')) {
    secondary.push(tr('publish_pricing_md', 'Publish /pricing.md (or /pricing.txt) at the site root with plan names, monthly prices, key limits, and what is included per tier. AI agents comparing tools programmatically depend on parseable pricing.'));
  }
  {
    const inf = has('ai_bots_blocked');
    if (inf) {
      const count = inferenceConcreteCount(inf);
      // Extract bot names from reasoning
      const botsMatch = inf.reasoning?.match(/\b((?:GPTBot|ClaudeBot|PerplexityBot|Google-Extended|Bingbot|ChatGPT-User|anthropic-ai|Applebot-Extended|OAI-SearchBot)(?:,\s*[A-Za-z-]+)*)/);
      const botNames = botsMatch?.[1] ?? null;
      secondary.push(count != null && botNames
        ? `${count} AI crawler(s) bloqueado(s) no robots.txt: ${botNames}. Cada bot bloqueado é uma plataforma que fisicamente não te cita. Remova Disallow ou adicione stanzas explícitas permissivas pra cada um.`
        : tr('unblock_ai_bots', 'Edit robots.txt to allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and Bingbot. Each blocked crawler is a platform that physically cannot cite the brand.'));
    }
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

  // Wave 15.5 — interpolate current AI Visibility Score into primary text.
  // The score inference is always present (when external recon ran) and
  // carries the actual 0-100 score in conclusion_value. We use raw lookup
  // (bypass `has`) because the score might have severity='low' for healthy
  // brands and still be useful context.
  const scoreInf = inferences.find(i => i.inference_key === 'ai_visibility_score');
  const aiVizScore = scoreInf ? parseInt(scoreInf.conclusion_value, 10) : null;
  const scoreSuffix = aiVizScore != null ? ` AI Visibility Score atual: ${aiVizScore}/100.` : '';

  // Build primary by impact level
  if (risk.decision_impact === DecisionImpact.Incident || risk.decision_impact === DecisionImpact.BlockLaunch) {
    const primary = tr('incident_primary', 'AI assistants and search engines cannot find or recommend the brand. Buyers researching your category find competitors instead. Address visibility gaps before any paid acquisition push.') + scoreSuffix;
    verification.push(tr('incident_verify', 'Re-run the external recon audit in 30 days to confirm AI Visibility Score moved above 60.'));
    return { primary, secondary: secondary.slice(0, 8), verification };
  }
  if (risk.decision_impact === DecisionImpact.FixBeforeScale) {
    const primary = tr('fix_primary', 'Discoverability gaps are limiting growth. Each blocked AI crawler, missing listing, or unowned comparison query is buying-intent traffic going to competitors. Fix high-leverage items first (llms.txt + schema + Wikipedia).') + scoreSuffix;
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
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };

  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound insights (surface first, they encode order-of-operations)
  if (has('compound_reputation_blocks_ai_citation')) {
    secondary.push(tr('compound_reputation_ai', 'CROSS-PACK: Your reputation problem is actively blocking AI search citation. Schema markup + llms.txt won\'t fix this — AI assistants route around brands with public unresolved complaints. ORDER MATTERS: respond to outstanding reviews FIRST (1-2 weeks), then invest in AI visibility infrastructure.'));
  }
  if (has('compound_brand_authority_crisis')) {
    secondary.push(tr('compound_brand_crisis', 'CROSS-PACK: Brand authority crisis on multiple fronts (branded SERP + competitor hijack + affiliate dominance). Three-prong response in parallel: (a) SEO/technical — fix title/canonical/schema; (b) IP enforcement — file Google Ads Trademark Complaints; (c) affiliate partnership — convert top affiliate domains from commission-takers to direct partners.'));
  }

  // Wave 12 Brand Echo — reputation review platforms.
  // Wave 15.5: secondaries interpolate concrete counts/labels from the
  // underlying inference's reasoning_slots/reasoning so users see
  // "respond to 7 reviews" instead of "respond to reviews".
  {
    const inf = has('trustpilot_complaint_cluster');
    if (inf) {
      const count = inferenceConcreteCount(inf);
      secondary.push(count != null
        ? `Você tem ${count} reviews 1-2★ sem resposta no Trustpilot — comprador EU/US confere antes de pagar. Responda dentro de 48h, mesmo as antigas (resposta a review de 5 meses ainda recupera credibilidade).`
        : tr('respond_trustpilot_complaints', 'Negative Trustpilot reviews are sitting unanswered for prospects to read. Assign someone to respond within 48 hours of each new review with an empathetic acknowledgment + concrete next step. Reply to existing unanswered negatives now — even a 5-month-old reply restores credibility.'));
    }
  }
  {
    const inf = has('trustpilot_response_silence');
    if (inf) {
      const rate = inferenceConcreteCount(inf); // numeric_value carries % response rate
      secondary.push(rate != null && rate < 70
        ? `Owner response rate no Trustpilot está em ${rate}% (industry benchmark >70%). Configure alerta pra cada review nova e mire sub-48h — silêncio é razão #1 de comprador escolher concorrente com features parecidas mas cuidado visível.`
        : tr('trustpilot_response_cadence', 'Set up a Trustpilot alert that pages someone for any new review. Target sub-48h response rate above 70% — silence is the #1 reason high-intent prospects pick a competitor with similar features but visible care.'));
    }
  }
  {
    const inf = has('reclame_aqui_reputation_critical');
    if (inf) {
      // Look for "Ruim"/"Não recomendada"/"Regular" label in reasoning
      const labelMatch = inf.reasoning?.match(/"(Ruim|Não recomendada|Regular|Ótimo|Bom|RA1000)"/);
      const indexMatch = inf.reasoning?.match(/index\s+(\d+(?:\.\d+)?)/);
      const label = labelMatch?.[1] ?? null;
      const idx = indexMatch?.[1] ?? null;
      secondary.push(label || idx
        ? `Reclame Aqui marca a marca como "${label ?? 'crítica'}"${idx ? ` (índice ${idx}/10)` : ''}. Comprador BR confere RA antes de pagar — resolva reclamações pendentes publicamente (status = Resolvido), responda novas em ≤5 dias úteis, mire índice >7/10 em 90 dias.`
        : tr('reclame_aqui_recovery', 'Reclame Aqui flags the brand as critical — BR buyers verify before paying. Resolve pending complaints publicly (status = Resolvido), respond to every new complaint within 5 business days, and target index acima de 7/10 within 90 days.'));
    }
  }

  // Wave 12 Brand Echo — SERP integrity (these overlap with discoverability
  // but the response is more about ownership/IP enforcement)
  {
    const inf = has('competitor_brand_hijack_serp');
    if (inf) {
      const count = inferenceConcreteCount(inf);
      // Extract domain list from reasoning
      const domainsMatch = inf.reasoning?.match(/(?:domains?|hijackers?):\s*([^.]+)/i);
      const domains = domainsMatch?.[1]?.trim().slice(0, 80) ?? null;
      secondary.push(count != null
        ? `${count} domínios não-brand rankeiam acima do seu domínio no nome da sua marca${domains ? ` (top: ${domains})` : ''}. Pra concorrentes rodando Google Ads no seu trademark, abra Google Ads Trademark Complaints + Meta brand reports. Reforce sinais de marca (press kit + Wikipedia + Organization schema).`
        : tr('competitor_hijack_enforcement', 'Competitors outrank your own domain on your brand name. Publish a press kit + about page that aggressively owns brand signal. For repeat offenders running paid ads on your trademark, file Google Ads Trademark Complaints + Meta brand reports.'));
    }
  }
  {
    const inf = has('affiliate_outranks_own');
    if (inf) {
      const count = inferenceConcreteCount(inf);
      const domainsMatch = inf.reasoning?.match(/(?:Domains?|domains?):\s*([^.]+)/);
      const domains = domainsMatch?.[1]?.trim().slice(0, 80) ?? null;
      secondary.push(count != null
        ? `${count} sites afiliados ganhando comissão no seu tráfego branded${domains ? ` (${domains})` : ''}. Negocie deals diretos com os 3 maiores (melhor margem que comissão de rede), faça enforcement de trademark em páginas enganosas, invista nas suas próprias branded landing pages.`
        : tr('affiliate_traffic_recovery', 'Affiliate/review sites earn commission on traffic that should be direct. Negotiate direct deals with the top 3 affiliate sites (better margin than network commissions), file trademark enforcement on misleading review pages, and invest in your own branded landing pages.'));
    }
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

// ──────────────────────────────────────────────
// Generic helper for building risk-tier outputs. All small-pack
// builders use this — they emit per-finding secondaries then cap by
// risk tier.
// ──────────────────────────────────────────────

function tierCaps(impact: DecisionImpact): number {
  switch (impact) {
    case DecisionImpact.Incident:
    case DecisionImpact.BlockLaunch:
      return 8;
    case DecisionImpact.FixBeforeScale:
      return 6;
    case DecisionImpact.Optimize:
      return 4;
    default:
      return 3;
  }
}

function packPrimary(
  impact: DecisionImpact,
  tr: (key: string, fallback: string) => string,
  fallbacks: { incident: string; fix: string; optimize: string; strong: string },
): string {
  if (impact === DecisionImpact.Incident || impact === DecisionImpact.BlockLaunch) return tr('incident_primary', fallbacks.incident);
  if (impact === DecisionImpact.FixBeforeScale) return tr('fix_primary', fallbacks.fix);
  if (impact === DecisionImpact.Optimize) return tr('optimize_primary', fallbacks.optimize);
  return tr('strong_primary', fallbacks.strong);
}

// ──────────────────────────────────────────────
// SaaS Growth Readiness — 11 findings
// ──────────────────────────────────────────────

function buildSaasGrowthReadinessActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.saas_growth_readiness;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound
  if (has('compound_saas_activation_to_expansion_blocked')) {
    secondary.push(tr('compound_saas_loop', 'CROSS-PACK: SaaS loop broken — users don\'t activate, those who do don\'t see upgrade, those on paid have no expansion path. Paid acquisition is a leaky bucket. Fix in order: (1) cut activation to 3 steps + 60-second quick win; (2) add usage-triggered upgrade prompts (not in billing); (3) build seat expansion or premium add-ons.'));
  }

  if (has('activation_blocked')) {
    secondary.push(tr('activation_blocked', 'New users cannot complete activation — empty screens, missing data, or blocked next step. Identify the FIRST point where the user hits a wall and ship a workaround within 7 days.'));
  }
  if (has('activation_friction_high')) {
    secondary.push(tr('activation_friction', 'Activation has too many steps before first value. Cut to 3 essential steps; defer everything else to in-app prompts.'));
  }
  if (has('unclear_next_step')) {
    secondary.push(tr('next_step', 'Users land on the app and do not know what to do. Add a persistent "next step" prompt in the dashboard until first activation milestone is hit.'));
  }
  if (has('empty_state_without_guidance')) {
    secondary.push(tr('empty_state', 'Empty screens leave users stuck. Every empty state needs: explanation of what would appear here + sample data button + CTA to create real data.'));
  }
  if (has('navigation_overcomplex')) {
    secondary.push(tr('nav_complex', 'Navigation has too many top-level items. Flatten to 5-7 max, group secondary items under settings/profile.'));
  }
  if (has('feature_discovery_poor')) {
    secondary.push(tr('feature_discovery', 'Users cannot find features they pay for. Add a feature-tour modal on first login OR a search bar in the app shell that surfaces features.'));
  }
  if (has('upgrade_invisible')) {
    secondary.push(tr('upgrade_visible', 'Upgrade path is hidden. Show plan limits + upgrade CTA at the moment the user hits the limit (in-context, not just in billing).'));
  }
  if (has('upgrade_timing_wrong')) {
    secondary.push(tr('upgrade_timing', 'Upgrade prompts fire before users see value. Delay the first upsell until the user has completed 3 core actions, then prompt with usage-justified copy.'));
  }
  if (has('no_expansion_path')) {
    secondary.push(tr('expansion_path', 'Existing customers have no upgrade path beyond their plan. Add: seat expansion, premium feature add-ons, or annual prepay discount.'));
  }
  if (has('landing_app_mismatch')) {
    secondary.push(tr('landing_mismatch', 'Marketing landing promises X, in-app delivers Y. Align: every feature mentioned on the landing must appear in the trial onboarding within 10 minutes.'));
  }
  if (has('onboarding_no_quick_win')) {
    secondary.push(tr('quick_win', 'Onboarding has no quick win. Engineer a 60-second activation: user signs up → sees one tangible result within a minute.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Trial-to-paid conversion is leaking before users see value. Activation gaps must be fixed before any acquisition push.',
    fix: 'SaaS activation has structural gaps. Address before scaling trial signups.',
    optimize: 'Activation works but has optimization opportunities for first-value time + expansion.',
    strong: 'SaaS growth readiness is healthy. Continue monitoring activation + expansion metrics.',
  });
  verification.push(tr('verify', 'Re-run audit in 30 days; track trial-to-paid conversion + 7-day activation rate.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Channel Integrity — 10 findings (Phase 3A + 3B + 4A)
// ──────────────────────────────────────────────

function buildChannelIntegrityActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.channel_integrity;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  if (has('payment_surface_compromised')) {
    secondary.push(tr('payment_surface', 'Payment surface has tampering exposure — third-party scripts on checkout, missing CSP. Lock down scripts on /checkout to a known allowlist with SRI hashes.'));
  }
  if (has('channel_traffic_divertible')) {
    secondary.push(tr('traffic_diversion', 'Traffic on commercial pages can be diverted (open redirects, weak referrer policy). Audit redirect handlers + set Referrer-Policy: strict-origin-when-cross-origin.'));
  }
  if (has('commerce_operations_exposed') || has('promotion_logic_exposed')) {
    secondary.push(tr('commerce_exposed', 'Promotion / discount logic is exposed in client-side code. Move price + discount calculation server-side; never trust client-submitted prices.'));
  }
  if (has('traffic_landing_low_trust_posture')) {
    secondary.push(tr('landing_trust', 'Paid traffic lands on pages with weak technical trust posture (missing HTTPS strict, weak headers). Run securityheaders.com on every paid landing and fix every red.'));
  }
  if (has('checkout_trust_brittle_infrastructure') || has('checkout_brittle_third_party')) {
    secondary.push(tr('checkout_infra', 'Checkout depends on third parties that fail under load. Identify the slowest 2 third-party scripts and async-defer or self-host them.'));
  }
  if (has('cart_variant_weak_control') || has('alternate_pricing_safeguard_bypass') || has('alternate_variant_control_breakdown')) {
    secondary.push(tr('cart_variant', 'Cart accepts variants with weak price safeguards (negative quantity, alternative price). Add server-side validation: minimum price per SKU, max quantity per cart.'));
  }
  if (has('hidden_discount_refund_route')) {
    secondary.push(tr('hidden_routes', 'Hidden discount/refund routes are accessible to anyone who guesses the URL. Move behind auth or behind a one-time signed token.'));
  }
  if (has('guessable_business_endpoint') || has('dynamic_route_weak_control')) {
    secondary.push(tr('endpoint_guessable', 'Business endpoints (orders, billing, admin) follow guessable patterns. Switch to UUIDs and audit access logs for enumeration attempts.'));
  }
  if (has('deep_commerce_exploitation_risk')) {
    secondary.push(tr('deep_exploitation', 'Deep crawl found buying-flow variants with weak guards. Treat every URL returned by Katana as a candidate for the same auth + rate-limit + validation as the main flow.'));
  }
  if (has('trust_surfaces_unstable_deps')) {
    secondary.push(tr('trust_deps', 'Trust signals (badges, testimonials) depend on third-party widgets that fail. Self-host or remove fragile widgets; trust must not flicker.'));
  }
  if (has('discount_abuse_pattern')) {
    secondary.push(tr('discount_abuse', 'Discount codes are being abused (mass redemption from same IP/email pattern). Add per-customer use limits + IP rate-limiting on coupon endpoint.'));
  }
  if (has('ad_spend_platform_concentration_risk')) {
    secondary.push(tr('ad_concentration', 'Ad spend is concentrated on one platform — a policy change kills your revenue. Diversify: split spend between Meta + Google + a third channel.'));
  }
  if (has('whatsapp_channel_disconnected')) {
    secondary.push(tr('whatsapp_channel', 'WhatsApp channel exists but is disconnected from main funnel. Add WhatsApp CTA to /pricing + /checkout for buyers who hesitate.'));
  }
  if (has('economic_exploitation_active')) {
    secondary.push(tr('economic_exploit', 'Active economic exploitation detected (coupon abuse, price manipulation, refund fraud). Escalate to security team + freeze affected accounts within 24h.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Channel integrity has critical exposures — attackers can manipulate prices, divert traffic, or compromise payment surfaces. Treat as security incident.',
    fix: 'Channel integrity has elevated risk. Fix exposed business endpoints + script supply chain before scaling traffic.',
    optimize: 'Channel integrity is functional. Hardening opportunities exist around third-party dependencies + endpoint guessability.',
    strong: 'Channel integrity is solid. Continue monitoring third-party scripts and access patterns.',
  });
  verification.push(tr('verify', 'Re-run external scan + security scan in 30 days; verify exposed endpoints are now protected.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Friction Tax — 3 findings
// ──────────────────────────────────────────────

function buildFrictionTaxActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.friction_tax;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  if (has('funnel_step_friction_cost')) {
    secondary.push(tr('step_friction', 'One specific funnel step is costing the most friction. Identify the step (via funnel analytics) and run usability test focused exclusively on it.'));
  }
  if (has('oscillation_decision_cost')) {
    secondary.push(tr('oscillation', 'Buyers bounce between 2 pages before deciding (e.g. pricing ↔ FAQ). Embed the answers on the decision page so they do not need to leave.'));
  }
  if (has('checkout_entry_friction')) {
    secondary.push(tr('checkout_entry', 'Checkout entry has visible friction (gate, login wall, account required). Allow guest checkout + remove pre-payment account creation.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'UX friction is measurably costing revenue across multiple funnel steps.',
    fix: 'UX friction is elevated. Fix the highest-cost step before scaling acquisition.',
    optimize: 'Friction is moderate. Iterating on entry points will compound CR improvements.',
    strong: 'Friction tax is low. Continue monitoring funnel step velocity.',
  });
  verification.push(tr('verify', 'Re-run behavioral analysis in 14-30 days; measure step-level conversion delta.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Content Freshness — 4 findings
// ──────────────────────────────────────────────

function buildContentFreshnessActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.content_freshness;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  if (has('commercial_page_stale')) {
    secondary.push(tr('commercial_stale', 'Commercial pages have stale content (old year, outdated copy). Add a quarterly review calendar — every /product and /pricing page touched at least once per quarter.'));
  }
  if (has('pricing_page_outdated')) {
    secondary.push(tr('pricing_outdated', 'Pricing page is outdated — old prices, old plan names, dated comparison points. Update immediately; outdated pricing is the #1 reason buyers email sales asking "is this still accurate?"'));
  }
  if (has('social_proof_expired')) {
    secondary.push(tr('social_proof_stale', 'All testimonials and case studies are dated >18 months. Refresh: collect 3 new customer quotes this quarter + add a date to every testimonial.'));
  }
  if (has('content_decay_progression')) {
    secondary.push(tr('content_decay', 'Content staleness is increasing audit-over-audit. Hire a part-time content owner OR add a "last reviewed" auto-prompt that nags after 90 days.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Stale content is actively eroding trust + AI search visibility. Refresh commercial pages immediately.',
    fix: 'Multiple commercial pages have stale content. Update before scaling acquisition.',
    optimize: 'Content freshness is mostly good but has decay risk. Schedule quarterly refresh cadence.',
    strong: 'Content is fresh. Maintain quarterly review cadence.',
  });
  verification.push(tr('verify', 'Re-audit in 90 days; verify all commercial pages have been touched.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Mobile Revenue Exposure — 3 findings
// ──────────────────────────────────────────────

function buildMobileRevenueExposureActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.mobile_revenue_exposure;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound
  if (has('compound_mobile_commerce_broken')) {
    secondary.push(tr('compound_mobile_broken', 'CROSS-PACK: Mobile commerce broken on multiple dimensions (conversion + form + CTA timing). This is structural mobile UX failure leaking the majority of paid traffic. Walk through signup-to-checkout on a real Android + iOS device — not DevTools mobile mode (it lies about font, keyboard, tap zones). Consider shipping a separate mobile-first /checkout.'));
  }

  if (has('mobile_conversion_gap')) {
    secondary.push(tr('conversion_gap', 'Mobile conversion is materially lower than desktop. Audit /checkout on a real mobile device (not DevTools): viewport, font size, input keyboard types, submit button reach zone.'));
  }
  if (has('mobile_form_friction_elevated')) {
    secondary.push(tr('form_friction', 'Mobile forms cause more friction than desktop. Each input needs the right inputmode (tel, email, decimal); add autocomplete=cc-number on payment fields.'));
  }
  if (has('mobile_cta_timing_degraded')) {
    secondary.push(tr('cta_timing', 'Mobile CTA renders late, delaying clicks. Inline-load button HTML so it is paint-ready in <1s on slow 3G; defer JS that powers it.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Mobile experience is compounding revenue loss. Most paid traffic is mobile — this is a top fix.',
    fix: 'Mobile has structural conversion gaps. Address before scaling mobile-heavy paid channels.',
    optimize: 'Mobile works but has friction. Iterate on form inputs + CTA timing.',
    strong: 'Mobile experience is solid. Continue monitoring mobile conversion delta.',
  });
  verification.push(tr('verify', 'Re-audit on real mobile device in 30 days; track mobile-vs-desktop conversion ratio.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Trust Revenue Gap — 3 findings
// ──────────────────────────────────────────────

function buildTrustRevenueGapActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.trust_revenue_gap;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound
  if (has('compound_trust_journey_collapse')) {
    secondary.push(tr('compound_trust_collapse', 'CROSS-PACK: Trust collapses progressively — weak first impression → weaker mobile → broken at checkout. Place the single most powerful trust signal (named customer testimonial with photo OR specific outcome number) adjacent to primary CTA on homepage AND adjacent to Buy button on checkout. Then audit mobile-specific trust placement.'));
  }

  if (has('trust_deficit_conversion_drag')) {
    secondary.push(tr('trust_deficit', 'Buyers hesitate at conversion because trust signals are missing AT the decision moment. Add testimonials + guarantee + security badge directly adjacent to the Buy button.'));
  }
  if (has('reassurance_seeking_elevated')) {
    secondary.push(tr('reassurance', 'Buyers seek reassurance (FAQ, policies) before converting. Surface the top 3 buying objections on the conversion page as inline FAQ — they should not have to leave.'));
  }
  if (has('sensitive_input_trust_gap')) {
    secondary.push(tr('sensitive_trust', 'Sensitive fields (CPF, card, address) lack trust framing. Add a brief "why we need this" note + visible HTTPS/security indicator next to each sensitive input.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Trust deficit is blocking conversion. Buyers want to pay but cannot get reassurance.',
    fix: 'Trust gaps are dragging conversion. Add reassurance at decision moment before scaling.',
    optimize: 'Trust signals are present but timing could improve. Place them adjacent to CTA, not in the footer.',
    strong: 'Trust signals support conversion well. Continue monitoring sensitive-input completion.',
  });
  verification.push(tr('verify', 'Re-run behavioral analysis in 30 days; track sensitive-field completion + abandonment delta.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// First Impression Revenue — 3 findings
// ──────────────────────────────────────────────

function buildFirstImpressionRevenueActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.first_impression_revenue;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  if (has('first_session_milestone_stall')) {
    secondary.push(tr('milestone_stall', 'First-session visitors stall before hitting the first conversion milestone. Audit homepage above-fold: is the value prop clear in 5 seconds? Is there one obvious next step?'));
  }
  if (has('first_session_trust_barrier')) {
    secondary.push(tr('trust_barrier', 'First-time visitors hit a trust barrier early. Move social proof (customer logos, testimonial snippet) above the fold; remove anything that signals "early stage" or "experimental".'));
  }
  if (has('first_session_cta_timing_gap')) {
    secondary.push(tr('cta_timing', 'First-session visitors do not see the CTA in time. Primary CTA should be visible in the first paint, not behind a scroll or after JS hydration.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'First impression is losing buyers before they engage. Address before any acquisition spend.',
    fix: 'First-session experience has gaps. Refresh hero + above-fold trust + CTA timing.',
    optimize: 'First impression is functional. Continue iterating on hero conversion.',
    strong: 'First-session metrics are healthy. Continue monitoring.',
  });
  verification.push(tr('verify', 'Re-audit in 30 days; track first-session conversion + bounce rate.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Action Value Map — 3 findings
// ──────────────────────────────────────────────

function buildActionValueMapActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.action_value_map;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  if (has('low_value_action_dominates')) {
    secondary.push(tr('low_value_dominates', 'Most user actions are low-value (newsletter signup, blog reads) while high-value paths get fewer clicks. Re-prioritize CTA placement: high-value actions in primary positions, low-value in footer.'));
  }
  if (has('high_value_action_underexposed')) {
    secondary.push(tr('high_value_hidden', 'High-value actions (pricing, demo, signup) are underexposed. Audit homepage + key pages: each should have ≥1 visible high-value CTA above the fold.'));
  }
  if (has('dead_weight_surface_traffic')) {
    secondary.push(tr('dead_weight', 'Some pages get traffic but produce zero conversions. Either redirect them to higher-value pages, add conversion paths, or remove from primary navigation.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'User action mix is dominated by low-value moves while high-value actions are invisible.',
    fix: 'Action value distribution is suboptimal. Re-prioritize CTAs before scaling traffic.',
    optimize: 'Some pages absorb traffic without producing value. Audit + redirect.',
    strong: 'User action value distribution is healthy.',
  });
  verification.push(tr('verify', 'Re-audit in 30 days; track high-value action conversion rate.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Acquisition Integrity — 3 findings
// ──────────────────────────────────────────────

function buildAcquisitionIntegrityActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.acquisition_integrity;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  // Wave 14 — Cross-pack compound (acquisition_integrity hosts two compounds)
  if (has('compound_dead_ad_spend')) {
    secondary.push(tr('compound_dead_spend', 'CROSS-PACK: DARK WASTE — ads sending traffic to dead pages AND no conversion tracking to see it. STOP all paid spend NOW until (1) every active ad destination returns 200 + loads as expected AND (2) conversion events fire correctly in Meta/Google. 4-hour fix blocking accurate ROI on last 90 days of spend.'));
  }
  if (has('compound_paid_acquisition_burn')) {
    secondary.push(tr('compound_paid_burn', 'CROSS-PACK: Paid acquisition compounding waste across friction + trust + mobile. CR is multiplicative across layers — small losses compound to 50%+ effective waste. Pause OR ship a separate paid-only landing page (sub-2s mobile load, single CTA, no nav, message-match headline, trust strip above fold).'));
  }

  if (has('paid_traffic_friction_elevated')) {
    secondary.push(tr('paid_friction', 'Paid traffic hits more friction than organic. Match landing page promise to ad copy verbatim + cut form fields to email-only.'));
  }
  if (has('paid_traffic_trust_gap')) {
    secondary.push(tr('paid_trust', 'Paid traffic lands on pages without the trust signals organic visitors get. Audit: testimonials, customer logos, security badges, money-back guarantee — all should be on paid landings.'));
  }
  if (has('paid_mobile_compounding_waste')) {
    secondary.push(tr('paid_mobile', 'Paid mobile traffic compounds friction + trust issues = burnt spend. Build mobile-first paid landings (separate from desktop) — sub-2s load, single primary CTA, no nav.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Paid acquisition is wasting spend at scale. Pause campaigns until landing quality matches ad promise.',
    fix: 'Paid acquisition has measurable waste. Fix landing pages before increasing ad budget.',
    optimize: 'Paid landings work but have room for CR uplift. Iterate on message match + mobile.',
    strong: 'Paid acquisition is efficient. Continue monitoring per-channel CAC.',
  });
  verification.push(tr('verify', 'Re-run paid landing audit in 30 days; track per-campaign CAC delta.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
}

// ──────────────────────────────────────────────
// Path Efficiency — 3 findings
// ──────────────────────────────────────────────

function buildPathEfficiencyActions(
  risk: RiskEvaluation,
  inferences: Inference[],
  translations?: EngineTranslations,
): { primary: string; secondary: string[]; verification: string[] } {
  const ts = translations?.actions?.path_efficiency;
  const tr = (key: string, fallback: string): string => ts?.[key] ?? fallback;
  // Wave 15.5: `has` is gated — only returns inferences strong enough
  // to justify firing a secondary action (severity ≥ medium + confidence ≥ 50).
  // Weak/positive inferences don't surface as remediation prescriptions.
  const has = (key: string): Inference | undefined => {
    const inf = inferences.find((i) => i.inference_key === key);
    return isFiringInference(inf) ? inf : undefined;
  };
  const secondary: string[] = [];
  const verification: string[] = [];

  if (has('path_length_exceeds_efficient')) {
    secondary.push(tr('path_length', 'Path to purchase has too many steps. Audit each step: is it essential or is it asking for info that could come post-purchase?'));
  }
  if (has('intent_absorber_detected')) {
    secondary.push(tr('intent_absorber', 'One specific page is absorbing buying intent without converting it (e.g. FAQ, support). Add a clear "ready to buy?" CTA at the end of that page.'));
  }
  if (has('intent_decay_time_excessive')) {
    secondary.push(tr('intent_decay', 'Time from intent-expressed to conversion is too long. Trigger a follow-up: exit-intent modal + email reminder within 24h for cart abandoners.'));
  }

  const primary = packPrimary(risk.decision_impact, tr, {
    incident: 'Path to purchase is too long — buyers lose intent before converting.',
    fix: 'Conversion path is inefficient. Shorten before scaling acquisition.',
    optimize: 'Path is acceptable but specific steps can be tightened.',
    strong: 'Path efficiency is healthy.',
  });
  verification.push(tr('verify', 'Re-audit funnel in 30 days; track time-to-conversion + step drop-off.'));
  return { primary, secondary: secondary.slice(0, tierCaps(risk.decision_impact)), verification };
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
