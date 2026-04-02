import { Decision, RiskEvaluation, SuppressionRule, makeRef } from '../domain';
import {
  evaluateSuppression,
  computeSuppressionEffects,
  SuppressionConfidenceEffect,
  SuppressionInventory,
  evaluateSuppressionInventory,
} from './lifecycle';

// ──────────────────────────────────────────────
// Suppression Confidence Applicator
//
// Applies suppression effects to decisions so that:
// - Suppressed signals reduce confidence, not erase truth
// - Long-lived suppressions accumulate trust penalty
// - Expired suppressions re-expose reality cleanly
// - Penalties are recorded in risk rationale
// ──────────────────────────────────────────────

export interface SuppressionApplicationResult {
  decisions: Decision[];
  risk_evaluations: RiskEvaluation[];
  inventory: SuppressionInventory;
  effects: SuppressionConfidenceEffect[];
  total_confidence_reduction: number;
}

/**
 * Apply active suppression effects to decisions and their risk evaluations.
 * Modifies confidence scores and records penalties in rationale.
 */
export function applySuppressionEffects(
  decisions: Decision[],
  riskEvaluations: RiskEvaluation[],
  suppressionRules: SuppressionRule[],
  now?: Date,
): SuppressionApplicationResult {
  if (suppressionRules.length === 0) {
    return {
      decisions,
      risk_evaluations: riskEvaluations,
      inventory: evaluateSuppressionInventory([], now),
      effects: [],
      total_confidence_reduction: 0,
    };
  }

  const inventory = evaluateSuppressionInventory(suppressionRules, now);

  // Build match key → decision refs map for suppression effect computation
  const decisionsByMatchKey = buildDecisionMatchMap(decisions);
  const effects = computeSuppressionEffects(suppressionRules, decisionsByMatchKey, now);

  if (effects.length === 0) {
    return {
      decisions,
      risk_evaluations: riskEvaluations,
      inventory,
      effects: [],
      total_confidence_reduction: 0,
    };
  }

  // Build effect index: decision_ref → total confidence reduction
  const reductionByDecisionRef = new Map<string, number>();
  const reasonsByDecisionRef = new Map<string, string[]>();

  for (const effect of effects) {
    for (const ref of effect.affected_decision_refs) {
      const existing = reductionByDecisionRef.get(ref) || 0;
      reductionByDecisionRef.set(ref, existing + effect.confidence_reduction);

      const reasons = reasonsByDecisionRef.get(ref) || [];
      reasons.push(effect.reasoning);
      reasonsByDecisionRef.set(ref, reasons);
    }
  }

  // Apply to decisions
  const adjustedDecisions = decisions.map(d => {
    const ref = makeRef('decision', d.id);
    const reduction = reductionByDecisionRef.get(ref);
    if (!reduction) return d;

    const newConfidence = Math.max(5, d.confidence_score - reduction);
    return {
      ...d,
      confidence_score: newConfidence,
    };
  });

  // Apply to risk evaluations
  const adjustedRisks = riskEvaluations.map(r => {
    // Find matching decision by question_key
    const matchingDecision = decisions.find(d => d.question_key === r.question_key);
    if (!matchingDecision) return r;

    const ref = makeRef('decision', matchingDecision.id);
    const reduction = reductionByDecisionRef.get(ref);
    if (!reduction) return r;

    const reasons = reasonsByDecisionRef.get(ref) || [];
    const newConfidence = Math.max(5, r.confidence_score - reduction);

    return {
      ...r,
      confidence_score: newConfidence,
      rationale: {
        ...r.rationale,
        penalties: [
          ...r.rationale.penalties,
          {
            type: 'suppression' as const,
            description: `Active suppressions reduce confidence by ${reduction} points. ${reasons.length} suppression(s) affecting this decision.`,
            adjustment: -reduction,
          },
        ],
      },
    };
  });

  const totalReduction = Array.from(reductionByDecisionRef.values()).reduce((sum, r) => sum + r, 0);

  return {
    decisions: adjustedDecisions,
    risk_evaluations: adjustedRisks,
    inventory,
    effects,
    total_confidence_reduction: totalReduction,
  };
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

/**
 * Build a map from suppression match_key to decision refs.
 * Suppression match_keys correspond to inference keys or signal keys.
 * A decision is affected if its why.inferences reference the match_key.
 */
function buildDecisionMatchMap(decisions: Decision[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const d of decisions) {
    const decisionRef = makeRef('decision', d.id);

    // Extract inference keys from decision's why chain
    for (const infRef of d.why.inferences) {
      // Inference refs look like "inference:inf_xxx"
      // Match keys in suppression are typically inference_key or signal_key patterns
      const existing = result.get(infRef) || [];
      existing.push(decisionRef);
      result.set(infRef, existing);
    }

    // Also map by decision_key itself
    const byKey = result.get(d.decision_key) || [];
    byKey.push(decisionRef);
    result.set(d.decision_key, byKey);
  }

  return result;
}
