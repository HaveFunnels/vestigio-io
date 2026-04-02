import { SuppressionRule, ReviewPolicy } from '../domain';
import { Ref } from '../domain';

// ──────────────────────────────────────────────
// Suppression Lifecycle
//
// Suppressions must not be permanent hidden truths.
// They expire, require review, impact confidence
// (not just visibility), and are fully traceable.
// ──────────────────────────────────────────────

/**
 * Evaluated state of a suppression rule at a point in time.
 */
export interface SuppressionEvaluation {
  rule_id: string;
  is_active: boolean;
  is_expired: boolean;
  requires_review: boolean;
  days_until_expiry: number | null;
  days_since_creation: number;
  confidence_impact: number;      // 0..100 — how much confidence is affected
  visibility_impact: VisibilityImpact;
  recommendation: SuppressionRecommendation;
}

export type VisibilityImpact =
  | 'hidden'          // fully suppressed from user view
  | 'dimmed'          // shown but de-emphasized
  | 'annotated'       // shown with suppression note
  | 'visible';        // suppression expired, fully visible

export type SuppressionRecommendation =
  | 'keep_active'
  | 'review_soon'
  | 'expire_and_review'
  | 'remove';

/**
 * How a suppression affects the confidence of related decisions.
 */
export interface SuppressionConfidenceEffect {
  rule_id: string;
  affected_decision_refs: Ref[];
  confidence_reduction: number;   // points subtracted from decision confidence
  reasoning: string;
}

/**
 * Aggregate suppression state for a workspace.
 */
export interface SuppressionInventory {
  total_rules: number;
  active_rules: number;
  expired_rules: number;
  pending_review: number;
  total_confidence_impact: number;
  evaluations: SuppressionEvaluation[];
}

// ──────────────────────────────────────────────
// Evaluation engine
// ──────────────────────────────────────────────

/**
 * Evaluate a single suppression rule's current state.
 */
export function evaluateSuppression(
  rule: SuppressionRule,
  now?: Date,
): SuppressionEvaluation {
  const currentTime = now || new Date();
  const daysSinceCreation = Math.floor(
    (currentTime.getTime() - rule.created_at.getTime()) / (24 * 60 * 60 * 1000),
  );

  let isExpired = false;
  let daysUntilExpiry: number | null = null;

  if (rule.expires_at) {
    isExpired = currentTime >= rule.expires_at;
    if (!isExpired) {
      daysUntilExpiry = Math.floor(
        (rule.expires_at.getTime() - currentTime.getTime()) / (24 * 60 * 60 * 1000),
      );
    }
  }

  // Auto-expire enforcement
  if (rule.review_policy === 'auto_expire' && isExpired) {
    return {
      rule_id: rule.id,
      is_active: false,
      is_expired: true,
      requires_review: false,
      days_until_expiry: null,
      days_since_creation: daysSinceCreation,
      confidence_impact: 0, // no longer affects confidence
      visibility_impact: 'visible',
      recommendation: 'remove',
    };
  }

  // Permanent suppressions still require periodic review
  if (rule.review_policy === 'permanent') {
    const requiresReview = daysSinceCreation > 90; // review every 90 days
    return {
      rule_id: rule.id,
      is_active: rule.is_active,
      is_expired: false,
      requires_review: requiresReview,
      days_until_expiry: null,
      days_since_creation: daysSinceCreation,
      confidence_impact: computeConfidenceImpact(rule, daysSinceCreation),
      visibility_impact: rule.is_active ? 'hidden' : 'visible',
      recommendation: requiresReview ? 'review_soon' : 'keep_active',
    };
  }

  // Manual review policy
  if (rule.review_policy === 'manual') {
    const shouldReview = isExpired || daysSinceCreation > 60;
    return {
      rule_id: rule.id,
      is_active: rule.is_active && !isExpired,
      is_expired: isExpired,
      requires_review: shouldReview,
      days_until_expiry: daysUntilExpiry,
      days_since_creation: daysSinceCreation,
      confidence_impact: computeConfidenceImpact(rule, daysSinceCreation),
      visibility_impact: isExpired ? 'annotated' : (rule.is_active ? 'dimmed' : 'visible'),
      recommendation: isExpired ? 'expire_and_review' : (shouldReview ? 'review_soon' : 'keep_active'),
    };
  }

  // Fallback
  return {
    rule_id: rule.id,
    is_active: rule.is_active && !isExpired,
    is_expired: isExpired,
    requires_review: isExpired,
    days_until_expiry: daysUntilExpiry,
    days_since_creation: daysSinceCreation,
    confidence_impact: computeConfidenceImpact(rule, daysSinceCreation),
    visibility_impact: isExpired ? 'visible' : 'dimmed',
    recommendation: isExpired ? 'expire_and_review' : 'keep_active',
  };
}

/**
 * Evaluate all suppressions and produce an inventory.
 */
export function evaluateSuppressionInventory(
  rules: SuppressionRule[],
  now?: Date,
): SuppressionInventory {
  const evaluations = rules.map(r => evaluateSuppression(r, now));

  return {
    total_rules: rules.length,
    active_rules: evaluations.filter(e => e.is_active).length,
    expired_rules: evaluations.filter(e => e.is_expired).length,
    pending_review: evaluations.filter(e => e.requires_review).length,
    total_confidence_impact: evaluations.reduce((sum, e) => sum + e.confidence_impact, 0),
    evaluations,
  };
}

/**
 * Compute how a set of active suppressions affect decision confidence.
 */
export function computeSuppressionEffects(
  rules: SuppressionRule[],
  decisionsByMatchKey: Map<string, Ref[]>,
  now?: Date,
): SuppressionConfidenceEffect[] {
  const effects: SuppressionConfidenceEffect[] = [];

  for (const rule of rules) {
    const evaluation = evaluateSuppression(rule, now);
    if (!evaluation.is_active || evaluation.confidence_impact === 0) continue;

    const affectedDecisions = decisionsByMatchKey.get(rule.match_key) || [];
    if (affectedDecisions.length === 0) continue;

    effects.push({
      rule_id: rule.id,
      affected_decision_refs: affectedDecisions,
      confidence_reduction: evaluation.confidence_impact,
      reasoning: `Suppression "${rule.reason}" (${rule.review_policy}) active for ${evaluation.days_since_creation} days. ` +
        `Reduces confidence by ${evaluation.confidence_impact} points because suppressed evidence is excluded from evaluation.`,
    });
  }

  return effects;
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

/**
 * Suppressions reduce confidence over time — the longer a suppression
 * hides truth, the more it should penalize confidence.
 */
function computeConfidenceImpact(rule: SuppressionRule, daysSinceCreation: number): number {
  if (!rule.is_active) return 0;

  // Base impact: 5 points (any active suppression hides something)
  let impact = 5;

  // Time-based escalation: +1 point per 15 days
  impact += Math.floor(daysSinceCreation / 15);

  // Permanent suppressions have higher ongoing impact
  if (rule.review_policy === 'permanent') {
    impact += 5;
  }

  return Math.min(impact, 25); // cap at 25 points
}
