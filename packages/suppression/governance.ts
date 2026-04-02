import { Decision, SuppressionRule, EffectiveSeverity, DecisionImpact, makeRef } from '../domain';
import {
  SuppressionApplicationResult,
} from './confidence-applicator';
import {
  SuppressionInventory,
  SuppressionEvaluation,
  VisibilityImpact,
} from './lifecycle';

// ──────────────────────────────────────────────
// Suppression Governance
//
// Suppression is a controlled trade-off, not a hidden override.
// This module ensures:
// 1. Suppression affects prioritization (ordering of actions/findings)
// 2. Long-lived suppressions create visible blind spots
// 3. Expired suppressions fully restore visibility
// 4. Suppression cannot silently override critical truth
// 5. User-facing explanations are always available
// ──────────────────────────────────────────────

/**
 * A detected blind spot — a critical issue hidden by long-lived suppression.
 */
export interface SuppressionBlindSpot {
  rule_id: string;
  match_key: string;
  days_active: number;
  affected_decision_refs: string[];
  affected_severity: EffectiveSeverity;
  affected_impact: DecisionImpact;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

/**
 * Priority adjustment computed from suppression state.
 */
export interface SuppressionPriorityAdjustment {
  item_ref: string;
  original_priority: number;
  adjusted_priority: number;
  reason: string;
}

/**
 * Escalation signal generated when suppression state warrants attention.
 */
export interface SuppressionEscalation {
  type: 'blind_spot' | 'expiring_soon' | 'review_overdue' | 'critical_override';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  rule_id: string;
  action_required: string;
}

/**
 * Complete governance result for a suppression state.
 */
export interface SuppressionGovernanceResult {
  blind_spots: SuppressionBlindSpot[];
  escalations: SuppressionEscalation[];
  priority_adjustments: SuppressionPriorityAdjustment[];
  explanations: SuppressionExplanation[];
  /** Whether any critical truth is being overridden by suppression */
  has_critical_override: boolean;
  /** Summary for system-wide status */
  governance_summary: string;
}

/**
 * User-facing explanation of a suppression's effect.
 */
export interface SuppressionExplanation {
  rule_id: string;
  match_key: string;
  visibility: VisibilityImpact;
  confidence_reduction: number;
  explanation: string;
  /** Whether this suppression is hiding something the user should know about */
  warrants_attention: boolean;
}

// Thresholds
const BLIND_SPOT_AGE_DAYS = 60;        // Suppressions older than this are potential blind spots
const CRITICAL_BLIND_SPOT_AGE_DAYS = 30; // Critical issues suppressed for this long are always flagged
const EXPIRING_SOON_DAYS = 7;           // Warn when expiring within this window

/**
 * Compute governance assessment for active suppressions.
 * Called after suppression effects are applied to decisions.
 */
export function computeSuppressionGovernance(
  suppressionResult: SuppressionApplicationResult,
  decisions: Decision[],
  rules: SuppressionRule[],
): SuppressionGovernanceResult {
  const blindSpots = detectBlindSpots(suppressionResult.inventory, decisions, rules);
  const escalations = generateEscalations(suppressionResult.inventory, blindSpots, rules);
  const priorityAdjustments = computePriorityAdjustments(suppressionResult, decisions);
  const explanations = buildExplanations(suppressionResult, rules);

  const hasCriticalOverride = blindSpots.some(bs => bs.risk_level === 'critical');

  const summary = buildGovernanceSummary(
    blindSpots, escalations, priorityAdjustments, hasCriticalOverride,
    suppressionResult.inventory,
  );

  return {
    blind_spots: blindSpots,
    escalations,
    priority_adjustments: priorityAdjustments,
    explanations,
    has_critical_override: hasCriticalOverride,
    governance_summary: summary,
  };
}

// ──────────────────────────────────────────────
// Blind Spot Detection
// ──────────────────────────────────────────────

function detectBlindSpots(
  inventory: SuppressionInventory,
  decisions: Decision[],
  rules: SuppressionRule[],
): SuppressionBlindSpot[] {
  const blindSpots: SuppressionBlindSpot[] = [];

  for (const evaluation of inventory.evaluations) {
    if (!evaluation.is_active) continue;

    const rule = rules.find(r => r.id === evaluation.rule_id);
    if (!rule) continue;

    // Find decisions affected by this suppression
    const affected = decisions.filter(d =>
      d.why.inferences.some(ref => ref.includes(rule.match_key)) ||
      d.decision_key === rule.match_key,
    );

    if (affected.length === 0) continue;

    // Determine highest severity/impact among affected decisions
    const highestSeverity = getHighestSeverity(affected);
    const highestImpact = getHighestImpact(affected);

    // Flag as blind spot if:
    // 1. Suppression is old AND affects high-severity issues, OR
    // 2. Suppression affects critical/incident issues regardless of age
    const isCriticalIssue = highestImpact === DecisionImpact.Incident ||
      highestImpact === DecisionImpact.BlockLaunch ||
      highestSeverity === EffectiveSeverity.Critical;

    const isOldEnough = evaluation.days_since_creation >= BLIND_SPOT_AGE_DAYS;
    const isCriticalAndOld = isCriticalIssue && evaluation.days_since_creation >= CRITICAL_BLIND_SPOT_AGE_DAYS;

    if (!isOldEnough && !isCriticalAndOld) continue;

    const riskLevel = computeBlindSpotRisk(evaluation, highestSeverity, highestImpact);

    blindSpots.push({
      rule_id: evaluation.rule_id,
      match_key: rule.match_key,
      days_active: evaluation.days_since_creation,
      affected_decision_refs: affected.map(d => makeRef('decision', d.id)),
      affected_severity: highestSeverity,
      affected_impact: highestImpact,
      risk_level: riskLevel,
      recommendation: buildBlindSpotRecommendation(evaluation, riskLevel, rule),
    });
  }

  return blindSpots;
}

// ──────────────────────────────────────────────
// Escalation Generation
// ──────────────────────────────────────────────

function generateEscalations(
  inventory: SuppressionInventory,
  blindSpots: SuppressionBlindSpot[],
  rules: SuppressionRule[],
): SuppressionEscalation[] {
  const escalations: SuppressionEscalation[] = [];

  // Blind spot escalations
  for (const bs of blindSpots) {
    if (bs.risk_level === 'critical') {
      escalations.push({
        type: 'critical_override',
        severity: 'critical',
        message: `Suppression "${bs.match_key}" is hiding a ${bs.affected_severity} severity issue for ${bs.days_active} days.`,
        rule_id: bs.rule_id,
        action_required: 'Review suppression immediately. Critical truth may be hidden.',
      });
    } else if (bs.risk_level === 'high') {
      escalations.push({
        type: 'blind_spot',
        severity: 'warning',
        message: `Long-lived suppression on "${bs.match_key}" may be creating a blind spot (${bs.days_active} days).`,
        rule_id: bs.rule_id,
        action_required: 'Review whether this suppression is still justified.',
      });
    }
  }

  // Expiring soon escalations
  for (const evaluation of inventory.evaluations) {
    if (!evaluation.is_active || evaluation.days_until_expiry === null) continue;

    if (evaluation.days_until_expiry <= EXPIRING_SOON_DAYS) {
      const rule = rules.find(r => r.id === evaluation.rule_id);
      escalations.push({
        type: 'expiring_soon',
        severity: 'info',
        message: `Suppression "${rule?.match_key || evaluation.rule_id}" expires in ${evaluation.days_until_expiry} day(s).`,
        rule_id: evaluation.rule_id,
        action_required: 'Decide whether to extend or let expire.',
      });
    }
  }

  // Review overdue escalations
  for (const evaluation of inventory.evaluations) {
    if (!evaluation.requires_review) continue;

    const rule = rules.find(r => r.id === evaluation.rule_id);
    escalations.push({
      type: 'review_overdue',
      severity: 'warning',
      message: `Suppression "${rule?.match_key || evaluation.rule_id}" is overdue for review (${evaluation.days_since_creation} days old).`,
      rule_id: evaluation.rule_id,
      action_required: 'Review suppression validity and renew or remove.',
    });
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  escalations.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  return escalations;
}

// ──────────────────────────────────────────────
// Priority Adjustment
// ──────────────────────────────────────────────

/**
 * Suppressed items should be de-prioritized (higher priority number = lower priority).
 * But items with blind spots should be escalated.
 */
function computePriorityAdjustments(
  suppressionResult: SuppressionApplicationResult,
  decisions: Decision[],
): SuppressionPriorityAdjustment[] {
  const adjustments: SuppressionPriorityAdjustment[] = [];

  for (const effect of suppressionResult.effects) {
    for (const decisionRef of effect.affected_decision_refs) {
      // Active suppression = lower priority for the affected issue
      // This makes room for non-suppressed issues to surface
      adjustments.push({
        item_ref: decisionRef,
        original_priority: 0, // placeholder — actual priority is in projection layer
        adjusted_priority: effect.confidence_reduction, // positive = lower priority
        reason: `Active suppression reduces priority by ${effect.confidence_reduction} points. ${effect.reasoning}`,
      });
    }
  }

  return adjustments;
}

// ──────────────────────────────────────────────
// Explanations
// ──────────────────────────────────────────────

function buildExplanations(
  suppressionResult: SuppressionApplicationResult,
  rules: SuppressionRule[],
): SuppressionExplanation[] {
  const explanations: SuppressionExplanation[] = [];

  for (const evaluation of suppressionResult.inventory.evaluations) {
    const rule = rules.find(r => r.id === evaluation.rule_id);
    if (!rule) continue;

    const effect = suppressionResult.effects.find(e => e.rule_id === evaluation.rule_id);
    const confidenceReduction = effect?.confidence_reduction ?? 0;

    const warrantsAttention = evaluation.requires_review ||
      evaluation.confidence_impact >= 15 ||
      (evaluation.is_active && evaluation.days_since_creation >= BLIND_SPOT_AGE_DAYS);

    explanations.push({
      rule_id: evaluation.rule_id,
      match_key: rule.match_key,
      visibility: evaluation.visibility_impact,
      confidence_reduction: confidenceReduction,
      explanation: buildEffectExplanation(evaluation, rule, confidenceReduction),
      warrants_attention: warrantsAttention,
    });
  }

  return explanations;
}

function buildEffectExplanation(
  evaluation: SuppressionEvaluation,
  rule: SuppressionRule,
  confidenceReduction: number,
): string {
  if (!evaluation.is_active) {
    if (evaluation.is_expired) {
      return `Suppression "${rule.reason}" expired. All related findings are now fully visible and confidence is restored.`;
    }
    return `Suppression "${rule.reason}" is inactive. No effect on decisions.`;
  }

  const parts: string[] = [];
  parts.push(`Suppression "${rule.reason}" active for ${evaluation.days_since_creation} days`);

  if (confidenceReduction > 0) {
    parts.push(`reducing confidence by ${confidenceReduction} points`);
  }

  switch (evaluation.visibility_impact) {
    case 'hidden':
      parts.push('findings are hidden from primary view');
      break;
    case 'dimmed':
      parts.push('findings are de-emphasized');
      break;
    case 'annotated':
      parts.push('findings shown with suppression note');
      break;
  }

  if (rule.review_policy === 'permanent') {
    parts.push('permanent suppression (requires periodic review)');
  } else if (evaluation.days_until_expiry !== null) {
    parts.push(`expires in ${evaluation.days_until_expiry} day(s)`);
  }

  return parts.join('. ') + '.';
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function getHighestSeverity(decisions: Decision[]): EffectiveSeverity {
  const ranks: Record<string, number> = {
    [EffectiveSeverity.None]: 0,
    [EffectiveSeverity.Low]: 1,
    [EffectiveSeverity.Medium]: 2,
    [EffectiveSeverity.High]: 3,
    [EffectiveSeverity.Critical]: 4,
  };
  let highest = EffectiveSeverity.None;
  for (const d of decisions) {
    if ((ranks[d.effective_severity] ?? 0) > (ranks[highest] ?? 0)) {
      highest = d.effective_severity;
    }
  }
  return highest;
}

function getHighestImpact(decisions: Decision[]): DecisionImpact {
  const ranks: Record<string, number> = {
    [DecisionImpact.Observe]: 0,
    [DecisionImpact.Optimize]: 1,
    [DecisionImpact.FixBeforeScale]: 2,
    [DecisionImpact.BlockLaunch]: 3,
    [DecisionImpact.Incident]: 4,
  };
  let highest = DecisionImpact.Observe;
  for (const d of decisions) {
    if ((ranks[d.decision_impact] ?? 0) > (ranks[highest] ?? 0)) {
      highest = d.decision_impact;
    }
  }
  return highest;
}

function computeBlindSpotRisk(
  evaluation: SuppressionEvaluation,
  severity: EffectiveSeverity,
  impact: DecisionImpact,
): 'low' | 'medium' | 'high' | 'critical' {
  const isCritical = severity === EffectiveSeverity.Critical ||
    impact === DecisionImpact.Incident;
  const isHigh = severity === EffectiveSeverity.High ||
    impact === DecisionImpact.BlockLaunch;

  if (isCritical && evaluation.days_since_creation >= CRITICAL_BLIND_SPOT_AGE_DAYS) return 'critical';
  if (isHigh && evaluation.days_since_creation >= BLIND_SPOT_AGE_DAYS) return 'high';
  if (evaluation.days_since_creation >= BLIND_SPOT_AGE_DAYS * 2) return 'high';
  if (evaluation.days_since_creation >= BLIND_SPOT_AGE_DAYS) return 'medium';
  return 'low';
}

function buildBlindSpotRecommendation(
  evaluation: SuppressionEvaluation,
  riskLevel: string,
  rule: SuppressionRule,
): string {
  if (riskLevel === 'critical') {
    return `Critical: Suppression "${rule.reason}" has been hiding a critical issue for ${evaluation.days_since_creation} days. ` +
      `Remove suppression immediately and re-evaluate the underlying finding.`;
  }
  if (riskLevel === 'high') {
    return `High priority: Suppression "${rule.reason}" may be creating a blind spot. ` +
      `Review whether the underlying issue has been resolved or if suppression is masking ongoing risk.`;
  }
  return `Suppression "${rule.reason}" (${evaluation.days_since_creation} days) should be reviewed. ` +
    `Long-lived suppressions can mask emerging issues.`;
}

function buildGovernanceSummary(
  blindSpots: SuppressionBlindSpot[],
  escalations: SuppressionEscalation[],
  adjustments: SuppressionPriorityAdjustment[],
  hasCriticalOverride: boolean,
  inventory: SuppressionInventory,
): string {
  if (inventory.total_rules === 0) {
    return 'No active suppressions. All findings are fully visible.';
  }

  const parts: string[] = [];
  parts.push(`${inventory.active_rules} active suppression(s)`);

  if (blindSpots.length > 0) {
    parts.push(`${blindSpots.length} potential blind spot(s) detected`);
  }

  if (hasCriticalOverride) {
    parts.push('CRITICAL: suppression may be hiding critical issues');
  }

  if (escalations.length > 0) {
    const criticalEsc = escalations.filter(e => e.severity === 'critical').length;
    if (criticalEsc > 0) {
      parts.push(`${criticalEsc} critical escalation(s)`);
    }
  }

  if (inventory.pending_review > 0) {
    parts.push(`${inventory.pending_review} pending review(s)`);
  }

  return parts.join('; ') + '.';
}
