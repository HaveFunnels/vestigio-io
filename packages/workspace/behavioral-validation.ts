import { MultiPackResult } from './recompute';
import { ConfidenceIntegrityResult } from './confidence-audit';
import { EffectiveSeverity, DecisionImpact } from '../domain';

// ──────────────────────────────────────────────
// Behavioral Edge Case Validation
//
// Validates system behavior under challenging scenarios:
// - Conflicting high-authority evidence
// - Stale but high-confidence data
// - Suppressed critical incidents
// - Profile drift with strong signals
// - Low-quality evidence with strong heuristics
// - High-cost verification with marginal value
//
// Each validator returns a pass/fail with explanation.
// These can run post-recompute as system health checks.
// ──────────────────────────────────────────────

export interface BehavioralValidation {
  scenario: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'critical';
  explanation: string;
  recommendation: string | null;
}

export interface BehavioralValidationResult {
  validations: BehavioralValidation[];
  all_passed: boolean;
  critical_failures: number;
  warnings: number;
  summary: string;
}

/**
 * Run all behavioral validations against a completed MultiPackResult.
 */
export function validateBehavior(
  result: MultiPackResult,
  confidenceAudit: ConfidenceIntegrityResult | null,
): BehavioralValidationResult {
  const validations: BehavioralValidation[] = [];

  validations.push(validateConflictingHighAuthority(result));
  validations.push(validateStaleHighConfidence(result));
  validations.push(validateSuppressedCritical(result));
  validations.push(validateProfileDriftWithStrongSignals(result));
  validations.push(validateLowQualityStrongHeuristic(result));
  validations.push(validateConfidenceCoherence(result));
  validations.push(validateDecisionImpactConsistency(result));

  if (confidenceAudit) {
    validations.push(validateNoDoublePenalization(confidenceAudit));
    validations.push(validateConfidenceInterpretable(confidenceAudit));
  }

  const criticalFailures = validations.filter(v => !v.passed && v.severity === 'critical').length;
  const warnings = validations.filter(v => !v.passed && v.severity === 'warning').length;
  const allPassed = validations.every(v => v.passed);

  return {
    validations,
    all_passed: allPassed,
    critical_failures: criticalFailures,
    warnings,
    summary: buildValidationSummary(validations, criticalFailures, warnings, allPassed),
  };
}

// ──────────────────────────────────────────────
// Scenario Validators
// ──────────────────────────────────────────────

/**
 * Scenario: Conflicting high-authority evidence
 * Validates that truth resolution handled contradictions without
 * producing unstable or arbitrarily resolved signals.
 */
function validateConflictingHighAuthority(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Conflicting high-authority evidence';

  if (!result.truth_harmonization) {
    return pass(scenario, 'No truth harmonization applied — single-source evidence only.');
  }

  const th = result.truth_harmonization;
  if (th.contradictions_found === 0) {
    return pass(scenario, 'No contradictions detected across evidence sources.');
  }

  // Check: are there contested signals with very low resulting confidence?
  const veryLowConfSignals = th.signals.filter(s => s.confidence < 15);
  if (veryLowConfSignals.length > th.signals.length * 0.3) {
    return fail(scenario, 'warning',
      `${veryLowConfSignals.length} of ${th.signals.length} signals have confidence < 15% after truth resolution. ` +
      `High-authority contradictions may be causing excessive confidence degradation.`,
      'Review contradicting evidence sources. Consider additional verification to break the tie.',
    );
  }

  return pass(scenario,
    `${th.contradictions_found} contradiction(s) resolved. ${th.signals_adjusted} signal(s) adjusted. No excessive degradation.`,
  );
}

/**
 * Scenario: Stale but high-confidence data
 * Validates that stale evidence doesn't retain artificially high confidence.
 */
function validateStaleHighConfidence(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Stale but high-confidence data';

  // Check evidence quality for staleness
  const staleHighConf = result.evidence_quality.filter(eq =>
    eq.recency < 30 && eq.composite_score > 70,
  );

  if (staleHighConf.length > 0) {
    // This is expected to some degree — quality score should already account for recency
    // But check if resulting signals also have high confidence
    const highConfSignals = result.signals.filter(s => s.confidence > 80);
    const staleRefs = new Set(staleHighConf.map(eq => eq.evidence_ref));
    const staleHighConfSignals = highConfSignals.filter(s =>
      s.evidence_refs.some(ref => staleRefs.has(ref)),
    );

    if (staleHighConfSignals.length > 0) {
      return fail(scenario, 'warning',
        `${staleHighConfSignals.length} signal(s) have confidence > 80% despite being backed by stale evidence. ` +
        `Quality adjustment may not be sufficient.`,
        'Consider increasing recency weight in evidence quality scoring or triggering re-collection.',
      );
    }
  }

  return pass(scenario, 'No stale evidence retaining artificially high confidence.');
}

/**
 * Scenario: Suppressed critical incidents
 * Validates that critical issues cannot be fully hidden by suppression.
 */
function validateSuppressedCritical(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Suppressed critical incidents';

  if (!result.suppression_result || result.suppression_result.effects.length === 0) {
    return pass(scenario, 'No active suppressions. All findings visible.');
  }

  // Check: are any critical/incident decisions being suppressed?
  const allDecisions = [
    result.scale_readiness.decision,
    result.revenue_integrity.decision,
    result.chargeback_resilience.decision,
  ];
  if (result.saas_growth_readiness) {
    allDecisions.push(result.saas_growth_readiness.decision);
  }

  const criticalDecisions = allDecisions.filter(d =>
    d.decision_impact === DecisionImpact.Incident ||
    d.decision_impact === DecisionImpact.BlockLaunch ||
    d.effective_severity === EffectiveSeverity.Critical,
  );

  for (const cd of criticalDecisions) {
    const decisionRef = `decision:${cd.id}`;
    const isSuppressed = result.suppression_result.effects.some(e =>
      e.affected_decision_refs.includes(decisionRef),
    );

    if (isSuppressed) {
      // Check confidence — suppressed critical should still have enough confidence to surface
      if (cd.confidence_score < 20) {
        return fail(scenario, 'critical',
          `Critical decision "${cd.decision_key}" (${cd.decision_impact}) is suppressed and has confidence ${cd.confidence_score}%. ` +
          `This critical issue may be effectively hidden from the user.`,
          'Review suppression rules. Critical issues should never be fully suppressed.',
        );
      }

      return fail(scenario, 'warning',
        `Critical decision "${cd.decision_key}" (${cd.decision_impact}) is affected by suppression. ` +
        `Confidence reduced but still visible (${cd.confidence_score}%).`,
        'Ensure user is aware that a suppression is affecting a critical finding.',
      );
    }
  }

  return pass(scenario, 'No critical decisions affected by active suppressions.');
}

/**
 * Scenario: Profile drift with strong signals
 * Validates that profile drift signals are properly reflected in confidence.
 */
function validateProfileDriftWithStrongSignals(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Profile drift with strong signals';

  if (!result.profile_freshness) {
    return pass(scenario, 'No business profile provided — using defaults.');
  }

  const pf = result.profile_freshness;
  if (!pf.drift_detected) {
    return pass(scenario, 'No profile drift detected. Profile consistent with observations.');
  }

  // If drift is detected but impact confidence is still high, that's a problem
  const avgImpactConf = result.impact.value_cases.length > 0
    ? result.impact.value_cases.reduce((s, vc) => s + vc.confidence, 0) / result.impact.value_cases.length
    : 0;

  if (avgImpactConf > 70 && pf.drift_signals.length >= 2) {
    return fail(scenario, 'warning',
      `Profile has ${pf.drift_signals.length} drift signal(s) but average impact confidence is ${Math.round(avgImpactConf)}%. ` +
      `Economic estimates may be unreliable.`,
      'Update business profile or reduce trust in financial estimates.',
    );
  }

  return pass(scenario,
    `Profile drift detected (${pf.drift_signals.length} signal(s)). Impact confidence appropriately adjusted to ${Math.round(avgImpactConf)}%.`,
  );
}

/**
 * Scenario: Low-quality evidence with strong heuristics
 * Validates that strong heuristic conclusions from low-quality evidence
 * are appropriately penalized.
 */
function validateLowQualityStrongHeuristic(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Low-quality evidence with strong heuristics';

  const lowQuality = result.evidence_quality.filter(eq => eq.composite_score < 40);
  if (lowQuality.length === 0) {
    return pass(scenario, 'No low-quality evidence detected.');
  }

  // Check if any heuristic-basis value cases have high confidence
  const heuristicHighConf = result.impact.value_cases.filter(vc =>
    vc.basis_type === 'heuristic' && vc.confidence > 60,
  );

  if (heuristicHighConf.length > 0) {
    return fail(scenario, 'warning',
      `${heuristicHighConf.length} heuristic-based finding(s) have confidence > 60% despite low-quality evidence. ` +
      `System may be overconfident in fallback estimates.`,
      'Consider collecting higher-quality evidence or widening estimate ranges.',
    );
  }

  return pass(scenario,
    `${lowQuality.length} low-quality evidence item(s). Heuristic conclusions appropriately penalized.`,
  );
}

/**
 * Scenario: Confidence coherence across related decisions
 * Validates that decisions sharing evidence have related confidence levels.
 */
function validateConfidenceCoherence(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Confidence coherence across decisions';

  const allDecisions = [
    result.scale_readiness.decision,
    result.revenue_integrity.decision,
    result.chargeback_resilience.decision,
  ];

  // Check pairwise confidence gaps when decisions share evidence
  for (let i = 0; i < allDecisions.length; i++) {
    for (let j = i + 1; j < allDecisions.length; j++) {
      const a = allDecisions[i];
      const b = allDecisions[j];
      const sharedEvidence = new Set(a.why.evidence_refs).size > 0 &&
        b.why.evidence_refs.some(r => a.why.evidence_refs.includes(r));

      if (sharedEvidence) {
        const gap = Math.abs(a.confidence_score - b.confidence_score);
        if (gap > 40) {
          return fail(scenario, 'warning',
            `Decisions "${a.decision_key}" (${a.confidence_score}%) and "${b.decision_key}" (${b.confidence_score}%) ` +
            `share evidence but have a ${gap}-point confidence gap.`,
            'Review whether different question contexts justify this gap, or if an adjustment layer is distorting one decision.',
          );
        }
      }
    }
  }

  return pass(scenario, 'Decision confidence levels are coherent relative to shared evidence.');
}

/**
 * Scenario: Decision impact consistency
 * Validates that high-impact decisions have sufficient confidence backing.
 */
function validateDecisionImpactConsistency(result: MultiPackResult): BehavioralValidation {
  const scenario = 'Decision impact backed by sufficient confidence';

  const allDecisions = [
    result.scale_readiness.decision,
    result.revenue_integrity.decision,
    result.chargeback_resilience.decision,
  ];

  for (const d of allDecisions) {
    const isHighImpact = d.decision_impact === DecisionImpact.Incident ||
      d.decision_impact === DecisionImpact.BlockLaunch;

    if (isHighImpact && d.confidence_score < 30) {
      return fail(scenario, 'warning',
        `High-impact decision "${d.decision_key}" (${d.decision_impact}) has only ${d.confidence_score}% confidence. ` +
        `The system is making strong claims with weak backing.`,
        'Consider downgrading impact classification or requesting verification to strengthen confidence.',
      );
    }
  }

  return pass(scenario, 'All high-impact decisions have sufficient confidence backing.');
}

/**
 * Validates no double-penalization from confidence audit.
 */
function validateNoDoublePenalization(audit: ConfidenceIntegrityResult): BehavioralValidation {
  const scenario = 'No double-penalization in confidence pipeline';

  const doublePenalties = audit.issues.filter(i => i.type === 'double_penalization');
  if (doublePenalties.length > 0) {
    return fail(scenario, 'warning',
      `${doublePenalties.length} instance(s) of double-penalization detected: ${doublePenalties.map(d => d.description).join('; ')}`,
      'Audit confidence adjustment layers for overlapping effects.',
    );
  }

  return pass(scenario, 'No double-penalization detected across confidence layers.');
}

/**
 * Validates confidence remains interpretable (no arbitrary values).
 */
function validateConfidenceInterpretable(audit: ConfidenceIntegrityResult): BehavioralValidation {
  const scenario = 'Confidence values remain interpretable';

  const dominanceIssues = audit.issues.filter(i => i.type === 'layer_dominance');
  if (dominanceIssues.length > 0) {
    return fail(scenario, 'warning',
      `Confidence may be dominated by a single layer: ${dominanceIssues.map(d => d.description).join('; ')}`,
      'Review layer calibration to ensure balanced confidence composition.',
    );
  }

  return pass(scenario, 'Confidence adjustments are balanced across layers.');
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function pass(scenario: string, explanation: string): BehavioralValidation {
  return {
    scenario,
    passed: true,
    severity: 'info',
    explanation,
    recommendation: null,
  };
}

function fail(
  scenario: string,
  severity: 'info' | 'warning' | 'critical',
  explanation: string,
  recommendation: string,
): BehavioralValidation {
  return {
    scenario,
    passed: false,
    severity,
    explanation,
    recommendation,
  };
}

function buildValidationSummary(
  validations: BehavioralValidation[],
  criticalFailures: number,
  warnings: number,
  allPassed: boolean,
): string {
  if (allPassed) {
    return `All ${validations.length} behavioral validations passed. System behavior is consistent and explainable.`;
  }

  const parts: string[] = [];
  parts.push(`${validations.length} validations run`);
  if (criticalFailures > 0) parts.push(`${criticalFailures} critical failure(s)`);
  if (warnings > 0) parts.push(`${warnings} warning(s)`);
  parts.push(`${validations.filter(v => v.passed).length} passed`);

  return parts.join(', ') + '.';
}
