import { Decision, VerificationType, DecisionImpact, EffectiveSeverity } from '../domain';
import { QuantifiedValueCase } from '../impact';
import {
  evaluateVerificationEconomics,
  VerificationEconomicDecision,
  VerificationAlternative,
  VERIFICATION_COSTS,
} from './index';

// ──────────────────────────────────────────────
// Global Verification Policy
//
// Single source of truth for ALL verification decisions.
// Every verification path (MCP, continuous audit, manual
// trigger, future APIs) must route through this policy.
//
// Ensures:
// - Consistent rules across all entry points
// - Explainable, reproducible decisions
// - Auditable verification history
// ──────────────────────────────────────────────

/**
 * Policy configuration — controls verification behavior system-wide.
 */
export interface VerificationPolicyConfig {
  /** Maximum budget per cycle (null = unlimited) */
  cycle_budget: number | null;
  /** Budget already consumed in this cycle */
  budget_consumed: number;
  /** Maximum concurrent verifications */
  max_concurrent: number;
  /** Currently active verifications */
  active_count: number;
  /** Whether the system is in continuous audit mode */
  continuous_audit_enabled: boolean;
  /** Cooldown between verifications on the same subject (hours) */
  subject_cooldown_hours: number;
  /** Subjects recently verified (subject_ref → last verification timestamp) */
  recent_verifications: Map<string, Date>;
  /** Whether to allow escalation from cheaper to more expensive types */
  allow_escalation: boolean;
}

/**
 * A verification policy decision — the authoritative answer to
 * "should this verification happen?"
 */
export interface VerificationPolicyDecision {
  /** Whether the verification is approved */
  approved: boolean;
  /** The effective verification type (may differ from requested) */
  effective_type: VerificationType;
  /** Estimated cost in abstract units */
  estimated_cost: number;
  /** Why this decision was made */
  reasoning: string;
  /** All policy checks that were evaluated */
  policy_checks: PolicyCheck[];
  /** Alternatives considered */
  alternatives: VerificationAlternative[];
  /** Whether the request was downgraded to a cheaper type */
  was_downgraded: boolean;
  /** Whether the request was denied entirely */
  was_denied: boolean;
  /** Denial reason (if denied) */
  denial_reason: string | null;
}

export interface PolicyCheck {
  check_name: string;
  passed: boolean;
  detail: string;
}

/**
 * Input to the verification policy evaluator.
 * Works for any entry point — MCP, continuous audit, manual trigger.
 */
export interface VerificationPolicyRequest {
  /** Requested verification type */
  requested_type: VerificationType;
  /** Subject being verified */
  subject_ref: string;
  /** Decision this verification supports (if any) */
  decision: Decision | null;
  /** Value cases for economic evaluation */
  value_cases: QuantifiedValueCase[];
  /** Reason for the verification request */
  reason: string;
  /** Who/what requested this verification */
  requested_by: 'mcp' | 'continuous_audit' | 'manual' | 'system';
}

/**
 * Evaluate a verification request against the global policy.
 * This is the ONLY function that should determine whether a verification happens.
 */
export function evaluateVerificationPolicy(
  request: VerificationPolicyRequest,
  config: VerificationPolicyConfig,
): VerificationPolicyDecision {
  const checks: PolicyCheck[] = [];
  let approved = true;
  let effectiveType = request.requested_type;
  let denialReason: string | null = null;
  let wasDowngraded = false;

  // ─── Check 1: Concurrency limit ───
  const concurrencyOk = config.active_count < config.max_concurrent;
  checks.push({
    check_name: 'concurrency_limit',
    passed: concurrencyOk,
    detail: concurrencyOk
      ? `${config.active_count}/${config.max_concurrent} active verifications`
      : `Concurrency limit reached (${config.active_count}/${config.max_concurrent})`,
  });
  if (!concurrencyOk) {
    approved = false;
    denialReason = 'Concurrency limit reached. Try again when current verifications complete.';
  }

  // ─── Check 2: Subject cooldown ───
  const lastVerification = config.recent_verifications.get(request.subject_ref);
  let cooldownOk = true;
  if (lastVerification) {
    const hoursSince = (Date.now() - lastVerification.getTime()) / (60 * 60 * 1000);
    cooldownOk = hoursSince >= config.subject_cooldown_hours;
  }
  checks.push({
    check_name: 'subject_cooldown',
    passed: cooldownOk,
    detail: cooldownOk
      ? 'Subject not in cooldown period'
      : `Subject was verified within the last ${config.subject_cooldown_hours} hours`,
  });
  if (!cooldownOk && approved) {
    // Cooldown can be overridden for critical decisions
    const isCritical = request.decision &&
      (request.decision.decision_impact === DecisionImpact.Incident ||
       request.decision.effective_severity === EffectiveSeverity.Critical);

    if (!isCritical) {
      approved = false;
      denialReason = `Subject "${request.subject_ref}" was recently verified. Cooldown period not elapsed.`;
    } else {
      checks.push({
        check_name: 'critical_cooldown_override',
        passed: true,
        detail: 'Cooldown overridden for critical decision',
      });
    }
  }

  // ─── Check 3: Budget availability ───
  const costProfile = VERIFICATION_COSTS[effectiveType];
  const estimatedCost = costProfile?.base_cost ?? 1;
  const remainingBudget = config.cycle_budget !== null
    ? config.cycle_budget - config.budget_consumed
    : null;

  let budgetOk = true;
  if (remainingBudget !== null && estimatedCost > remainingBudget) {
    budgetOk = false;
  }
  checks.push({
    check_name: 'budget_availability',
    passed: budgetOk,
    detail: budgetOk
      ? remainingBudget !== null
        ? `Budget available: ${remainingBudget} remaining (cost: ${estimatedCost})`
        : 'Unlimited budget'
      : `Insufficient budget: ${remainingBudget} remaining, need ${estimatedCost}`,
  });

  // ─── Check 4: Economic justification ───
  let economicDecision: VerificationEconomicDecision | null = null;
  if (request.decision && approved) {
    economicDecision = evaluateVerificationEconomics(
      request.decision,
      request.value_cases,
      effectiveType,
      remainingBudget,
    );

    checks.push({
      check_name: 'economic_justification',
      passed: economicDecision.should_verify,
      detail: economicDecision.reasoning,
    });

    if (!economicDecision.should_verify) {
      // Economics says no — can we downgrade?
      if (economicDecision.recommended_type !== effectiveType) {
        effectiveType = economicDecision.recommended_type;
        wasDowngraded = true;
        checks.push({
          check_name: 'type_downgrade',
          passed: true,
          detail: `Downgraded from ${request.requested_type} to ${effectiveType}`,
        });
      } else {
        approved = false;
        denialReason = economicDecision.reasoning;
      }
    } else if (economicDecision.recommended_type !== effectiveType) {
      // Economics recommends a different type
      effectiveType = economicDecision.recommended_type;
      wasDowngraded = effectiveType !== request.requested_type;
    }
  }

  // ─── Check 5: Budget recheck after potential downgrade ───
  if (approved && !budgetOk) {
    const downgradedCost = VERIFICATION_COSTS[effectiveType]?.base_cost ?? 0;
    if (remainingBudget !== null && downgradedCost <= remainingBudget) {
      // Downgraded type fits in budget
      checks.push({
        check_name: 'budget_recheck_after_downgrade',
        passed: true,
        detail: `Downgraded type ${effectiveType} fits in remaining budget (${downgradedCost} ≤ ${remainingBudget})`,
      });
    } else if (remainingBudget !== null && downgradedCost > remainingBudget) {
      approved = false;
      denialReason = `Budget exhausted. Cannot afford even ${effectiveType} (cost: ${downgradedCost}, remaining: ${remainingBudget}).`;
    }
  }

  // ─── Check 6: Continuous audit mode adjustments ───
  if (config.continuous_audit_enabled && approved) {
    // In continuous audit mode, be more conservative with expensive verifications
    if (request.requested_by !== 'manual' && !isCriticalRequest(request)) {
      const maxAutoType = VerificationType.LightProbe;
      const typeRank = getTypeRank(effectiveType);
      const maxRank = getTypeRank(maxAutoType);

      if (typeRank > maxRank && !config.allow_escalation) {
        effectiveType = maxAutoType;
        wasDowngraded = true;
        checks.push({
          check_name: 'continuous_audit_cap',
          passed: true,
          detail: `Continuous audit mode caps automatic verification at ${maxAutoType}`,
        });
      }
    }
  }

  const finalCost = VERIFICATION_COSTS[effectiveType]?.base_cost ?? 0;
  const alternatives = economicDecision?.alternatives ?? [];

  return {
    approved,
    effective_type: effectiveType,
    estimated_cost: finalCost,
    reasoning: buildPolicyReasoning(checks, approved, effectiveType, request.requested_type),
    policy_checks: checks,
    alternatives,
    was_downgraded: wasDowngraded,
    was_denied: !approved,
    denial_reason: denialReason,
  };
}

/**
 * Record a verification completion for cooldown tracking.
 */
export function recordVerificationCompletion(
  config: VerificationPolicyConfig,
  subject_ref: string,
  cost: number,
): void {
  config.recent_verifications.set(subject_ref, new Date());
  config.budget_consumed += cost;
}

/**
 * Create a default policy config.
 */
export function createDefaultPolicyConfig(
  overrides: Partial<VerificationPolicyConfig> = {},
): VerificationPolicyConfig {
  return {
    cycle_budget: null,
    budget_consumed: 0,
    max_concurrent: 5,
    active_count: 0,
    continuous_audit_enabled: false,
    subject_cooldown_hours: 1,
    recent_verifications: new Map(),
    allow_escalation: true,
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

function isCriticalRequest(request: VerificationPolicyRequest): boolean {
  if (!request.decision) return false;
  return request.decision.decision_impact === DecisionImpact.Incident ||
    request.decision.decision_impact === DecisionImpact.BlockLaunch ||
    request.decision.effective_severity === EffectiveSeverity.Critical;
}

function getTypeRank(type: VerificationType): number {
  const ranks: Record<string, number> = {
    [VerificationType.ReuseOnly]: 0,
    [VerificationType.LightProbe]: 1,
    [VerificationType.IntegrationPull]: 2,
    [VerificationType.BrowserVerification]: 3,
    [VerificationType.AuthenticatedJourneyVerification]: 4,
  };
  return ranks[type] ?? 0;
}

function buildPolicyReasoning(
  checks: PolicyCheck[],
  approved: boolean,
  effectiveType: VerificationType,
  requestedType: VerificationType,
): string {
  const failedChecks = checks.filter(c => !c.passed);

  if (approved && effectiveType === requestedType) {
    return `Verification approved. All ${checks.length} policy checks passed.`;
  }

  if (approved && effectiveType !== requestedType) {
    return `Verification approved with type adjustment: ${requestedType} → ${effectiveType}. ` +
      `Reason: ${failedChecks.map(c => c.detail).join('; ') || 'economic optimization'}.`;
  }

  return `Verification denied. Failed check(s): ${failedChecks.map(c => `${c.check_name}: ${c.detail}`).join('; ')}.`;
}
