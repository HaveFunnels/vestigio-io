import {
  Signal,
  Inference,
  RiskEvaluation,
  EffectiveSeverity,
  DecisionImpact,
  FreshnessState,
  GateResult,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Risk Evaluator — canonical downside assessment
// Deterministic: scoped ID generator
// Fixes double-counting between correlated inferences
// ──────────────────────────────────────────────

export interface RiskInput {
  question_key: string;
  subject_ref: string;
  cycle_ref: string;
  signals: Signal[];
  inferences: Inference[];
  conversion_proximity: number; // 1 (checkout) - 5 (homepage)
  is_production: boolean;
}

function rawScoreToSeverity(score: number): EffectiveSeverity {
  if (score >= 80) return EffectiveSeverity.Critical;
  if (score >= 60) return EffectiveSeverity.High;
  if (score >= 40) return EffectiveSeverity.Medium;
  if (score >= 20) return EffectiveSeverity.Low;
  return EffectiveSeverity.None;
}

function severityToImpact(
  severity: EffectiveSeverity,
  confidence: number,
  conversionProximity: number,
  isProduction: boolean,
): DecisionImpact {
  if (confidence < 30) return DecisionImpact.Observe;

  const isHighProximity = conversionProximity <= 2;

  switch (severity) {
    case EffectiveSeverity.Critical:
      return isProduction ? DecisionImpact.Incident : DecisionImpact.BlockLaunch;
    case EffectiveSeverity.High:
      if (isHighProximity && isProduction) return DecisionImpact.BlockLaunch;
      return DecisionImpact.FixBeforeScale;
    case EffectiveSeverity.Medium:
      if (isHighProximity && isProduction) return DecisionImpact.FixBeforeScale;
      return DecisionImpact.Optimize;
    case EffectiveSeverity.Low:
      return DecisionImpact.Observe;
    case EffectiveSeverity.None:
      return DecisionImpact.Observe;
  }
}

export function evaluateRisk(input: RiskInput): RiskEvaluation {
  const now = new Date();
  const ids = new IdGenerator('risk');

  // 1. Compute raw risk from inferences (primary source)
  //    Use max-of-correlated strategy to avoid double-counting
  let rawRisk = 0;
  const contributingInferences: string[] = [];
  const contributingSignals: string[] = [];

  // Group correlated inferences to take max, not sum
  const trustGroup: number[] = [];      // trust_boundary + checkout_integrity share evidence
  const revenueFlowGroup: number[] = []; // conversion_flow + revenue_leakage share evidence
  const frictionGroup: number[] = [];    // friction + revenue_path_fragile share evidence
  const chargebackGroup: number[] = [];  // refund_policy_gap + dispute_risk share evidence
  const otherContributions: number[] = [];

  for (const inf of input.inferences) {
    const contribution = inferenceToRisk(inf);
    if (contribution > 0) {
      contributingInferences.push(makeRef('inference', inf.id));

      if (inf.inference_key === 'trust_boundary_crossed' || inf.inference_key === 'checkout_integrity'
          || inf.inference_key === 'trust_break_in_checkout') {
        trustGroup.push(contribution);
      } else if (inf.inference_key === 'conversion_flow_fragmented' || inf.inference_key === 'revenue_leakage') {
        revenueFlowGroup.push(contribution);
      } else if (inf.inference_key === 'friction_on_critical_path' || inf.inference_key === 'revenue_path_fragile') {
        frictionGroup.push(contribution);
      } else if (inf.inference_key === 'refund_policy_gap' || inf.inference_key === 'dispute_risk_elevated') {
        // Chargeback correlated group: policy gap + dispute risk share evidence
        chargebackGroup.push(contribution);
      } else {
        otherContributions.push(contribution);
      }
    }
  }

  // For correlated groups, take the max to avoid inflation
  if (trustGroup.length > 0) rawRisk += Math.max(...trustGroup);
  if (revenueFlowGroup.length > 0) rawRisk += Math.max(...revenueFlowGroup);
  if (frictionGroup.length > 0) rawRisk += Math.max(...frictionGroup);
  if (chargebackGroup.length > 0) rawRisk += Math.max(...chargebackGroup);
  for (const c of otherContributions) rawRisk += c;

  // 2. Add signal-level risk (only for signals not already covered by inferences)
  for (const sig of input.signals) {
    const contribution = signalToRisk(sig);
    if (contribution > 0) {
      rawRisk += contribution;
      contributingSignals.push(makeRef('signal', sig.id));
    }
  }

  rawRisk = Math.min(100, rawRisk);

  // 3. Confidence
  const confidence = computeConfidence(input.signals, input.inferences);

  // 4. Convergence
  const convergence = contributingInferences.length + Math.floor(contributingSignals.length / 2);

  // 5. Gate
  const gate = computeGate(rawRisk, confidence);

  // 6. Effective severity
  let severity = rawScoreToSeverity(rawRisk);

  // Confidence penalty
  if (confidence < 50 && severity !== EffectiveSeverity.None) {
    const severityOrder = [
      EffectiveSeverity.None,
      EffectiveSeverity.Low,
      EffectiveSeverity.Medium,
      EffectiveSeverity.High,
      EffectiveSeverity.Critical,
    ];
    const idx = severityOrder.indexOf(severity);
    if (idx > 0) severity = severityOrder[idx - 1];
  }

  // 7. Decision impact
  const impact = severityToImpact(
    severity, confidence, input.conversion_proximity, input.is_production,
  );

  // 8. Evidence refs
  const evidenceRefs = new Set<string>();
  for (const sig of input.signals) {
    for (const ref of sig.evidence_refs) evidenceRefs.add(ref);
  }
  for (const inf of input.inferences) {
    for (const ref of inf.evidence_refs) evidenceRefs.add(ref);
  }

  return {
    id: ids.next(),
    subject_ref: input.subject_ref,
    question_key: input.question_key,
    cycle_ref: input.cycle_ref,
    freshness: {
      observed_at: now,
      fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    raw_risk_score: rawRisk,
    confidence_score: confidence,
    convergence_score: convergence,
    gate_result: gate,
    effective_severity: severity,
    decision_impact: impact,
    rationale: {
      evidence_refs: Array.from(evidenceRefs),
      signals: contributingSignals,
      inferences: contributingInferences,
      penalties: [],
    },
    created_at: now,
    updated_at: now,
  };
}

function inferenceToRisk(inf: Inference): number {
  switch (inf.inference_key) {
    // Scale readiness inferences
    case 'trust_boundary_crossed':
      if (inf.conclusion_value === 'true') {
        return inf.severity_hint === 'high' ? 30 : inf.severity_hint === 'medium' ? 20 : 10;
      }
      return 0;
    case 'policy_gap':
      if (inf.conclusion_value === 'high') return 25;
      if (inf.conclusion_value === 'medium') return 15;
      return 0;
    case 'revenue_path_fragile':
      if (inf.conclusion_value === 'high') return 20;
      if (inf.conclusion_value === 'medium') return 10;
      return 0;
    case 'checkout_integrity':
      if (inf.conclusion_value === 'weak') return 30;
      if (inf.conclusion_value === 'fragile') return 15;
      return 0;
    case 'measurement_coverage':
      if (inf.conclusion_value === 'false') return 10;
      return 0;

    // Revenue integrity inferences
    case 'conversion_flow_fragmented':
      if (inf.conclusion_value === 'high') return 30;
      if (inf.conclusion_value === 'medium') return 18;
      return 5;
    case 'friction_on_critical_path':
      if (inf.conclusion_value === 'high') return 25;
      if (inf.conclusion_value === 'medium') return 15;
      return 5;
    case 'revenue_leakage':
      if (inf.conclusion_value === 'high') return 30;
      if (inf.conclusion_value === 'medium') return 18;
      return 5;
    case 'trust_break_in_checkout':
      if (inf.conclusion_value === 'high') return 25;
      if (inf.conclusion_value === 'medium') return 15;
      return 5;
    case 'measurement_blindspot':
      if (inf.conclusion_value === 'high') return 15;
      if (inf.conclusion_value === 'medium') return 8;
      return 0;
    case 'unclear_conversion_intent':
      if (inf.conclusion_value === 'high') return 20;
      if (inf.conclusion_value === 'medium') return 10;
      return 0;

    // Chargeback resilience inferences
    // Lower base risk to avoid inflating scale/revenue packs;
    // chargeback pack evaluates these with its own question-specific weighting
    case 'refund_policy_gap':
      if (inf.conclusion_value === 'high') return 18;
      if (inf.conclusion_value === 'medium') return 8;
      return 0;
    case 'support_unreachable':
      if (inf.conclusion_value === 'high') return 12;
      if (inf.conclusion_value === 'medium') return 5;
      return 0;
    case 'expectation_misalignment':
      if (inf.conclusion_value === 'high') return 10;
      if (inf.conclusion_value === 'medium') return 5;
      return 0;
    case 'dispute_risk_elevated':
      if (inf.conclusion_value === 'high') return 18;
      if (inf.conclusion_value === 'medium') return 8;
      return 0;

    default:
      return 0;
  }
}

function signalToRisk(sig: Signal): number {
  if (sig.signal_key === 'http_errors') return 10;
  if (sig.signal_key === 'slow_response') return 5;
  return 0;
}

function computeConfidence(signals: Signal[], inferences: Inference[]): number {
  if (signals.length === 0 && inferences.length === 0) return 0;

  let totalConfidence = 0;
  let count = 0;

  for (const s of signals) { totalConfidence += s.confidence; count++; }
  for (const i of inferences) { totalConfidence += i.confidence; count++; }

  return Math.round(totalConfidence / count);
}

function computeGate(rawRisk: number, confidence: number): GateResult {
  const reasons: string[] = [];
  let blocked = false;
  let downgraded = false;

  if (rawRisk >= 80 && confidence >= 50) {
    blocked = true;
    reasons.push('Critical risk with sufficient confidence');
  }

  if (confidence < 30) {
    downgraded = true;
    reasons.push('Confidence too low to promote material decision');
  }

  return { passed: !blocked, downgraded, blocked, reasons };
}
