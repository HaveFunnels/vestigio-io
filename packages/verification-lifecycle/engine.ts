import { Decision, DecisionImpact, EffectiveSeverity, VerificationType } from '../domain';
import {
  VerificationState,
  VerificationMaturity,
  RetriggerEvaluation,
  VerificationSufficiency,
  VerificationFreshnessConfig,
  DEFAULT_FRESHNESS_CONFIGS,
} from './types';

// ──────────────────────────────────────────────
// Verification Lifecycle Engine
//
// Manages the progression: unverified → verified → degraded → stale
// Determines when re-verification is needed and whether
// current verification is sufficient for the decision at hand.
// ──────────────────────────────────────────────

/**
 * Compute the current verification maturity for a state,
 * applying time-based degradation.
 */
export function evaluateVerificationState(
  state: VerificationState,
  now?: Date,
): VerificationState {
  const currentTime = now || new Date();

  if (!state.verified_at) {
    return {
      ...state,
      maturity: state.maturity === VerificationMaturity.PendingVerification
        ? VerificationMaturity.PendingVerification
        : VerificationMaturity.Unverified,
      current_confidence: 0,
    };
  }

  if (!state.expires_at) {
    // No expiry set — stays verified but with slow degradation
    const hoursSinceVerification = hoursElapsed(state.verified_at, currentTime);
    const decay = Math.min(
      state.degradation_rate * (hoursSinceVerification / 24),
      50, // cap at 50 points loss without explicit expiry
    );
    return {
      ...state,
      maturity: decay > 30 ? VerificationMaturity.DegradedVerification : VerificationMaturity.Verified,
      current_confidence: Math.max(0, Math.round(state.confidence_at_verification - decay)),
    };
  }

  const nowMs = currentTime.getTime();
  const verifiedMs = state.verified_at.getTime();
  const expiresMs = state.expires_at.getTime();
  const totalWindow = expiresMs - verifiedMs;

  if (nowMs <= expiresMs) {
    // Still within freshness window — compute degradation position
    const elapsed = nowMs - verifiedMs;
    const progress = totalWindow > 0 ? elapsed / totalWindow : 0;

    if (progress < 0.5) {
      // First half: fully verified, minimal degradation
      const decay = state.degradation_rate * progress * 0.5;
      return {
        ...state,
        maturity: VerificationMaturity.Verified,
        current_confidence: Math.max(0, Math.round(state.confidence_at_verification - decay)),
      };
    }

    // Second half: degrading
    const decay = state.degradation_rate * progress;
    return {
      ...state,
      maturity: VerificationMaturity.DegradedVerification,
      current_confidence: Math.max(0, Math.round(state.confidence_at_verification - decay)),
    };
  }

  // Past expiry — stale
  const overdueHours = hoursElapsed(state.expires_at, currentTime);
  const extraDecay = Math.min(overdueHours * 2, 50);
  return {
    ...state,
    maturity: VerificationMaturity.StaleVerification,
    current_confidence: Math.max(0, Math.round(
      state.confidence_at_verification - state.degradation_rate - extraDecay,
    )),
    re_trigger_reason: `Verification expired ${Math.round(overdueHours)}h ago`,
  };
}

/**
 * Determine whether re-verification should be triggered.
 */
export function evaluateRetrigger(
  state: VerificationState,
  decision: Decision | null,
  now?: Date,
): RetriggerEvaluation {
  const evaluated = evaluateVerificationState(state, now);
  const confidenceGap = state.confidence_at_verification - evaluated.current_confidence;

  // Already stale — must re-trigger
  if (evaluated.maturity === VerificationMaturity.StaleVerification) {
    return {
      should_retrigger: true,
      reason: evaluated.re_trigger_reason || 'Verification has expired',
      urgency: decision && isCriticalDecision(decision) ? 'critical' : 'high',
      recommended_verification_type: recommendVerificationType(state, decision),
      current_maturity: evaluated.maturity,
      confidence_gap: confidenceGap,
    };
  }

  // Degraded + decision depends on high confidence
  if (evaluated.maturity === VerificationMaturity.DegradedVerification) {
    if (decision && isCriticalDecision(decision) && confidenceGap > 15) {
      return {
        should_retrigger: true,
        reason: `Decision confidence degraded by ${confidenceGap} points; critical decision requires fresh verification`,
        urgency: 'high',
        recommended_verification_type: recommendVerificationType(state, decision),
        current_maturity: evaluated.maturity,
        confidence_gap: confidenceGap,
      };
    }

    if (confidenceGap > 25) {
      return {
        should_retrigger: true,
        reason: `Significant confidence degradation (${confidenceGap} points)`,
        urgency: 'medium',
        recommended_verification_type: recommendVerificationType(state, decision),
        current_maturity: evaluated.maturity,
        confidence_gap: confidenceGap,
      };
    }

    return {
      should_retrigger: false,
      reason: null,
      urgency: 'low',
      recommended_verification_type: null,
      current_maturity: evaluated.maturity,
      confidence_gap: confidenceGap,
    };
  }

  // Unverified + critical decision
  if (evaluated.maturity === VerificationMaturity.Unverified && decision && isCriticalDecision(decision)) {
    return {
      should_retrigger: true,
      reason: 'Critical decision with no verification evidence',
      urgency: 'critical',
      recommended_verification_type: recommendVerificationType(state, decision),
      current_maturity: evaluated.maturity,
      confidence_gap: confidenceGap,
    };
  }

  return {
    should_retrigger: false,
    reason: null,
    urgency: 'low',
    recommended_verification_type: null,
    current_maturity: evaluated.maturity,
    confidence_gap: confidenceGap,
  };
}

/**
 * Check if current verification is sufficient for a decision.
 */
export function evaluateSufficiency(
  state: VerificationState,
  decision: Decision,
  now?: Date,
): VerificationSufficiency {
  const evaluated = evaluateVerificationState(state, now);
  const requiredMaturity = getRequiredMaturity(decision);
  const confidenceFloor = getConfidenceFloor(decision);

  const maturityRank = maturityToRank(evaluated.maturity);
  const requiredRank = maturityToRank(requiredMaturity);
  const isSufficient = maturityRank >= requiredRank && evaluated.current_confidence >= confidenceFloor;

  let gapAnalysis: string;
  if (isSufficient) {
    gapAnalysis = 'Verification level is sufficient for this decision.';
  } else if (maturityRank < requiredRank) {
    gapAnalysis = `Decision requires ${requiredMaturity} but current state is ${evaluated.maturity}. ` +
      `Re-verification needed.`;
  } else {
    gapAnalysis = `Confidence ${evaluated.current_confidence} is below floor ${confidenceFloor}. ` +
      `Verification has degraded too much.`;
  }

  return {
    is_sufficient: isSufficient,
    decision_ref: `decision:${decision.id}`,
    required_maturity: requiredMaturity,
    actual_maturity: evaluated.maturity,
    confidence_floor: confidenceFloor,
    current_confidence: evaluated.current_confidence,
    gap_analysis: gapAnalysis,
  };
}

/**
 * Get the appropriate freshness config for an evidence type.
 */
export function getFreshnessConfig(evidenceType: string): VerificationFreshnessConfig {
  return DEFAULT_FRESHNESS_CONFIGS.find(c => c.evidence_type === evidenceType)
    || { evidence_type: evidenceType, fresh_duration_hours: 24, degradation_start_hours: 12, stale_threshold_hours: 72, max_confidence_decay: 30 };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function isCriticalDecision(decision: Decision): boolean {
  return decision.decision_impact === DecisionImpact.Incident
    || decision.decision_impact === DecisionImpact.BlockLaunch
    || decision.effective_severity === EffectiveSeverity.Critical
    || decision.effective_severity === EffectiveSeverity.High;
}

function recommendVerificationType(
  state: VerificationState,
  decision: Decision | null,
): string {
  // Escalate verification type based on decision criticality and verification history
  if (state.verification_count === 0) {
    return VerificationType.LightProbe;
  }
  if (decision && isCriticalDecision(decision)) {
    return VerificationType.BrowserVerification;
  }
  return VerificationType.LightProbe;
}

function getRequiredMaturity(decision: Decision): VerificationMaturity {
  switch (decision.decision_impact) {
    case DecisionImpact.Incident:
    case DecisionImpact.BlockLaunch:
      return VerificationMaturity.Verified;
    case DecisionImpact.FixBeforeScale:
      return VerificationMaturity.PartiallyVerified;
    case DecisionImpact.Optimize:
      return VerificationMaturity.Unverified; // okay without verification
    case DecisionImpact.Observe:
      return VerificationMaturity.Unverified;
  }
}

function getConfidenceFloor(decision: Decision): number {
  switch (decision.decision_impact) {
    case DecisionImpact.Incident: return 50;
    case DecisionImpact.BlockLaunch: return 45;
    case DecisionImpact.FixBeforeScale: return 35;
    case DecisionImpact.Optimize: return 20;
    case DecisionImpact.Observe: return 0;
  }
}

function maturityToRank(maturity: VerificationMaturity): number {
  switch (maturity) {
    case VerificationMaturity.Unverified: return 0;
    case VerificationMaturity.PendingVerification: return 1;
    case VerificationMaturity.StaleVerification: return 2;
    case VerificationMaturity.DegradedVerification: return 3;
    case VerificationMaturity.PartiallyVerified: return 4;
    case VerificationMaturity.Verified: return 5;
  }
}

function hoursElapsed(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * 60 * 1000);
}
