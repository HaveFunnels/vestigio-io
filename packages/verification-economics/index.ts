import { Decision, DecisionImpact, EffectiveSeverity, VerificationType } from '../domain';
import { QuantifiedValueCase } from '../impact';

// ──────────────────────────────────────────────
// Verification Economics — cost vs value awareness
//
// Determines when verification is worth the cost,
// when reuse is sufficient, and ensures the system
// is structurally ready for cost-aware decisions.
//
// Does NOT implement billing — provides decision framework.
// ──────────────────────────────────────────────

/**
 * Estimated cost profile for each verification type.
 * Units are abstract "cost units" — can be mapped to credits, dollars, or time.
 */
export interface VerificationCostProfile {
  verification_type: VerificationType;
  base_cost: number;           // abstract cost units
  time_estimate_seconds: number;
  resource_intensity: 'minimal' | 'low' | 'medium' | 'high';
  reusability: number;         // 0..1 — how useful is this for future decisions
}

export const VERIFICATION_COSTS: Record<string, VerificationCostProfile> = {
  [VerificationType.ReuseOnly]: {
    verification_type: VerificationType.ReuseOnly,
    base_cost: 0,
    time_estimate_seconds: 1,
    resource_intensity: 'minimal',
    reusability: 0.3,
  },
  [VerificationType.LightProbe]: {
    verification_type: VerificationType.LightProbe,
    base_cost: 1,
    time_estimate_seconds: 5,
    resource_intensity: 'low',
    reusability: 0.5,
  },
  [VerificationType.BrowserVerification]: {
    verification_type: VerificationType.BrowserVerification,
    base_cost: 5,
    time_estimate_seconds: 30,
    resource_intensity: 'high',
    reusability: 0.7,
  },
  [VerificationType.IntegrationPull]: {
    verification_type: VerificationType.IntegrationPull,
    base_cost: 3,
    time_estimate_seconds: 10,
    resource_intensity: 'medium',
    reusability: 0.8,
  },
  [VerificationType.AuthenticatedJourneyVerification]: {
    verification_type: VerificationType.AuthenticatedJourneyVerification,
    base_cost: 10,
    time_estimate_seconds: 60,
    resource_intensity: 'high',
    reusability: 0.6,
  },
};

/**
 * Decision on whether to verify, and at what level.
 */
export interface VerificationEconomicDecision {
  should_verify: boolean;
  recommended_type: VerificationType;
  estimated_cost: number;
  expected_value: number;         // estimated value of verification
  value_to_cost_ratio: number;    // > 1 means worth it
  reasoning: string;
  alternatives: VerificationAlternative[];
}

export interface VerificationAlternative {
  type: VerificationType;
  cost: number;
  value: number;
  trade_off: string;
}

/**
 * Evaluate whether verification is economically justified.
 */
export function evaluateVerificationEconomics(
  decision: Decision,
  valueCases: QuantifiedValueCase[],
  requestedType: VerificationType,
  remainingBudget: number | null,
): VerificationEconomicDecision {
  const costProfile = VERIFICATION_COSTS[requestedType] || VERIFICATION_COSTS[VerificationType.LightProbe];
  const estimatedCost = costProfile.base_cost;

  // Compute expected value of verification
  const expectedValue = computeExpectedValue(decision, valueCases, costProfile);
  const ratio = estimatedCost > 0 ? expectedValue / estimatedCost : expectedValue > 0 ? 100 : 0;

  // Budget check
  if (remainingBudget !== null && estimatedCost > remainingBudget) {
    // Check if a cheaper alternative fits
    const cheaperAlternative = findCheaperAlternative(decision, valueCases, remainingBudget);
    if (cheaperAlternative) {
      return {
        should_verify: true,
        recommended_type: cheaperAlternative.type,
        estimated_cost: cheaperAlternative.cost,
        expected_value: cheaperAlternative.value,
        value_to_cost_ratio: cheaperAlternative.cost > 0 ? cheaperAlternative.value / cheaperAlternative.cost : 100,
        reasoning: `Requested ${requestedType} exceeds budget. Downgraded to ${cheaperAlternative.type}.`,
        alternatives: buildAlternatives(decision, valueCases),
      };
    }

    return {
      should_verify: false,
      recommended_type: VerificationType.ReuseOnly,
      estimated_cost: 0,
      expected_value: expectedValue * 0.3, // reuse captures some value
      value_to_cost_ratio: 100,
      reasoning: `Verification budget exhausted. Using reuse-only strategy.`,
      alternatives: buildAlternatives(decision, valueCases),
    };
  }

  // Value check
  if (ratio < 0.5 && !isCriticalDecision(decision)) {
    return {
      should_verify: false,
      recommended_type: VerificationType.ReuseOnly,
      estimated_cost: 0,
      expected_value: expectedValue * 0.3,
      value_to_cost_ratio: 100,
      reasoning: `Value-to-cost ratio (${ratio.toFixed(1)}) too low for non-critical decision. Reuse existing evidence.`,
      alternatives: buildAlternatives(decision, valueCases),
    };
  }

  // Critical decisions always justify verification
  if (isCriticalDecision(decision) && ratio < 1) {
    return {
      should_verify: true,
      recommended_type: requestedType,
      estimated_cost: estimatedCost,
      expected_value: expectedValue,
      value_to_cost_ratio: ratio,
      reasoning: `Critical decision justifies verification despite low economic ratio (${ratio.toFixed(1)}).`,
      alternatives: buildAlternatives(decision, valueCases),
    };
  }

  return {
    should_verify: ratio >= 1,
    recommended_type: requestedType,
    estimated_cost: estimatedCost,
    expected_value: expectedValue,
    value_to_cost_ratio: ratio,
    reasoning: ratio >= 1
      ? `Verification justified: expected value (${expectedValue.toFixed(0)}) exceeds cost (${estimatedCost}).`
      : `Verification not economically justified: ratio ${ratio.toFixed(1)} < 1.0.`,
    alternatives: buildAlternatives(decision, valueCases),
  };
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

function computeExpectedValue(
  decision: Decision,
  valueCases: QuantifiedValueCase[],
  costProfile: VerificationCostProfile,
): number {
  // Base value from decision impact level
  const impactBaseValue: Record<string, number> = {
    [DecisionImpact.Incident]: 50,
    [DecisionImpact.BlockLaunch]: 30,
    [DecisionImpact.FixBeforeScale]: 15,
    [DecisionImpact.Optimize]: 5,
    [DecisionImpact.Observe]: 1,
  };

  let value = impactBaseValue[decision.decision_impact] || 5;

  // Add value from quantified impact (normalized)
  const relatedValue = valueCases.find(vc =>
    decision.why.inferences.some(ref => ref.includes(vc.inference_key)),
  );
  const revenueDelta = relatedValue?.estimated_impact.monthly_revenue_delta ?? 0;
  if (revenueDelta > 0) {
    // Normalize: $1000/month impact = ~10 value units
    value += Math.min(50, revenueDelta / 100);
  }

  // Reusability bonus: verification that helps future decisions is worth more
  value *= (1 + costProfile.reusability * 0.3);

  // Confidence gap: lower current confidence = more value from verification
  const confidenceGap = 100 - decision.confidence_score;
  value *= (1 + confidenceGap / 200); // up to 50% bonus for low confidence

  return Math.round(value);
}

function isCriticalDecision(decision: Decision): boolean {
  return decision.decision_impact === DecisionImpact.Incident
    || decision.decision_impact === DecisionImpact.BlockLaunch
    || decision.effective_severity === EffectiveSeverity.Critical;
}

function findCheaperAlternative(
  decision: Decision,
  valueCases: QuantifiedValueCase[],
  budget: number,
): VerificationAlternative | null {
  const ordered = [
    VerificationType.ReuseOnly,
    VerificationType.LightProbe,
    VerificationType.IntegrationPull,
    VerificationType.BrowserVerification,
    VerificationType.AuthenticatedJourneyVerification,
  ];

  for (const type of ordered) {
    const profile = VERIFICATION_COSTS[type];
    if (profile.base_cost <= budget && profile.base_cost > 0) {
      const value = computeExpectedValue(decision, valueCases, profile);
      return {
        type,
        cost: profile.base_cost,
        value,
        trade_off: `${type} is within budget but may provide less certainty`,
      };
    }
  }

  return null;
}

function buildAlternatives(
  decision: Decision,
  valueCases: QuantifiedValueCase[],
): VerificationAlternative[] {
  return Object.values(VERIFICATION_COSTS).map(profile => ({
    type: profile.verification_type,
    cost: profile.base_cost,
    value: computeExpectedValue(decision, valueCases, profile),
    trade_off: `${profile.resource_intensity} resources, ${profile.time_estimate_seconds}s estimated`,
  }));
}
