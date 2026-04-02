import { MultiPackResult } from './recompute';

// ──────────────────────────────────────────────
// Confidence Audit Trail
//
// Tracks every confidence adjustment through the pipeline
// to ensure:
// 1. No double-penalization (same source applying twice)
// 2. Consistent scaling (no layer dominates disproportionately)
// 3. Confidence remains interpretable (not arbitrary)
//
// Phase 29: Instrumented mode — real before/after tracking
// at each layer, replacing post-hoc reconstruction for
// decision-level adjustments.
// ──────────────────────────────────────────────

/**
 * A single confidence adjustment in the pipeline.
 */
export interface ConfidenceAdjustment {
  /** Which layer made this adjustment */
  layer: ConfidenceLayer;
  /** What was adjusted */
  subject_type: 'signal' | 'decision' | 'risk_evaluation' | 'value_case';
  /** Reference to the adjusted item */
  subject_ref: string;
  /** Adjustment type */
  adjustment_type: 'multiplier' | 'additive' | 'penalty' | 'boost' | 'budget_cap';
  /** The actual adjustment value (delta) */
  value: number;
  /** Confidence before this adjustment */
  before: number;
  /** Confidence after this adjustment */
  after: number;
  /** Explanation */
  reason: string;
  /** Whether this adjustment was capped by a floor or budget */
  capped?: boolean;
  /** Type of cap applied, if any */
  cap_type?: 'floor' | 'budget' | null;
}

export type ConfidenceLayer =
  | 'truth_harmonization'     // Signal-level: contested/unanimous adjustments
  | 'evidence_quality'        // Signal-level: quality multiplier
  | 'suppression'             // Decision-level: suppression penalty
  | 'profile_freshness'       // Decision-level: profile staleness multiplier
  | 'coherence'               // Decision-level: coherence-driven adjustment
  | 'penalty_budget'          // Decision-level: cross-layer penalty budget cap
  | 'fallback_inputs';        // Value-case-level: no business inputs → 0.6 multiplier

/**
 * Confidence integrity check result.
 */
export interface ConfidenceIntegrityResult {
  /** All adjustments observed in the pipeline */
  adjustments: ConfidenceAdjustment[];
  /** Detected issues */
  issues: ConfidenceIssue[];
  /** Whether the confidence pipeline is healthy */
  is_healthy: boolean;
  /** Per-layer impact summary */
  layer_impact: LayerImpactSummary[];
  /** Overall summary */
  summary: string;
  /** Whether adjustments come from real instrumentation vs reconstruction */
  instrumented: boolean;
}

export interface ConfidenceIssue {
  type: 'double_penalization' | 'excessive_reduction' | 'confidence_floor' | 'layer_dominance';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  affected_refs: string[];
}

export interface LayerImpactSummary {
  layer: ConfidenceLayer;
  adjustments_count: number;
  total_impact: number;
  average_impact: number;
  /** Percentage of total confidence impact attributable to this layer */
  impact_share: number;
}

// ──────────────────────────────────────────────
// Confidence Audit Builder
// ──────────────────────────────────────────────

/**
 * Build a confidence audit from a completed MultiPackResult.
 *
 * Phase 29: When instrumentedAdjustments are provided, uses real before/after
 * values from the pipeline. Falls back to reconstruction for signal-level
 * layers (truth, evidence quality) and when no instrumented data is available.
 */
export function buildConfidenceAudit(
  result: MultiPackResult,
  instrumentedAdjustments?: ConfidenceAdjustment[],
): ConfidenceIntegrityResult {
  const adjustments: ConfidenceAdjustment[] = [];
  const isInstrumented = instrumentedAdjustments !== undefined && instrumentedAdjustments.length > 0;

  // ─── Layer 1: Truth harmonization adjustments (reconstructed — signal-level) ───
  if (result.truth_harmonization) {
    const th = result.truth_harmonization;
    if (th.signals_adjusted > 0) {
      for (const ts of th.truth_states) {
        for (const res of ts.resolutions) {
          if (res.is_contested) {
            adjustments.push({
              layer: 'truth_harmonization',
              subject_type: 'signal',
              subject_ref: `${res.claim_key}:${ts.subject_ref}`,
              adjustment_type: 'penalty',
              value: res.is_contested ? -5 : 0,
              before: res.resolved_confidence + 5,
              after: res.resolved_confidence,
              reason: `Truth resolution: ${res.resolution_method}. ${res.contradictions.length} contradiction(s).`,
            });
          } else if (res.resolution_method === 'unanimous') {
            adjustments.push({
              layer: 'truth_harmonization',
              subject_type: 'signal',
              subject_ref: `${res.claim_key}:${ts.subject_ref}`,
              adjustment_type: 'boost',
              value: Math.min(10, res.contributing_claims.length * 3),
              before: res.resolved_confidence - Math.min(10, res.contributing_claims.length * 3),
              after: res.resolved_confidence,
              reason: `Unanimous agreement from ${res.contributing_claims.length} sources.`,
            });
          }
        }
      }
    }
  }

  // ─── Layer 2: Evidence quality adjustments (reconstructed — signal-level) ───
  if (result.quality_adjustments && result.quality_adjustments.adjustments_made > 0) {
    adjustments.push({
      layer: 'evidence_quality',
      subject_type: 'signal',
      subject_ref: 'aggregate',
      adjustment_type: 'multiplier',
      value: result.quality_adjustments.average_quality_score / 100,
      before: 0,
      after: 0,
      reason: `${result.quality_adjustments.adjustments_made} signals adjusted. Average evidence quality: ${result.quality_adjustments.average_quality_score}%.`,
    });
  }

  // ─── Layers 3-6: Decision-level adjustments ───
  if (isInstrumented) {
    // Use real instrumented data for suppression, profile, coherence, penalty_budget
    adjustments.push(...instrumentedAdjustments);
  } else {
    // Fallback: reconstruct from result metadata (legacy path)
    if (result.suppression_result && result.suppression_result.total_confidence_reduction > 0) {
      for (const effect of result.suppression_result.effects) {
        for (const ref of effect.affected_decision_refs) {
          adjustments.push({
            layer: 'suppression',
            subject_type: 'decision',
            subject_ref: ref,
            adjustment_type: 'penalty',
            value: -effect.confidence_reduction,
            before: 0,
            after: 0,
            reason: effect.reasoning,
          });
        }
      }
    }

    if (result.profile_freshness) {
      const pf = result.profile_freshness;
      if (!pf.is_fresh || pf.drift_detected) {
        const penaltyDescription = pf.is_fresh && pf.drift_detected
          ? 'Fresh profile with drift detected'
          : pf.staleness_days <= 60 ? 'Mildly stale profile'
          : pf.staleness_days <= 90 ? 'Stale profile'
          : pf.staleness_days <= 180 ? 'Strongly stale profile'
          : 'Critically stale profile';

        adjustments.push({
          layer: 'profile_freshness',
          subject_type: 'value_case',
          subject_ref: 'all_value_cases',
          adjustment_type: 'multiplier',
          value: 0,
          before: 0,
          after: 0,
          reason: penaltyDescription + `. Profile is ${pf.staleness_days} days old.`,
        });
      }
    }
  }

  // ─── Validate integrity ───
  const issues = validateIntegrity(adjustments, result);
  const layerImpact = computeLayerImpact(adjustments);
  const isHealthy = issues.every(i => i.severity !== 'critical');
  const summary = buildAuditSummary(adjustments, issues, layerImpact, isHealthy);

  return {
    adjustments,
    issues,
    is_healthy: isHealthy,
    layer_impact: layerImpact,
    summary,
    instrumented: isInstrumented,
  };
}

// ──────────────────────────────────────────────
// Integrity Validation
// ──────────────────────────────────────────────

function validateIntegrity(
  adjustments: ConfidenceAdjustment[],
  result: MultiPackResult,
): ConfidenceIssue[] {
  const issues: ConfidenceIssue[] = [];

  // Check 1: Double penalization — same subject penalized by same layer multiple times
  const penaltyMap = new Map<string, ConfidenceAdjustment[]>();
  for (const adj of adjustments) {
    if (adj.adjustment_type === 'penalty') {
      const key = `${adj.layer}:${adj.subject_ref}`;
      const existing = penaltyMap.get(key) || [];
      existing.push(adj);
      penaltyMap.set(key, existing);
    }
  }
  for (const [key, penalties] of penaltyMap) {
    if (penalties.length > 1) {
      issues.push({
        type: 'double_penalization',
        severity: 'warning',
        description: `Subject ${key} penalized ${penalties.length} times by the same layer. Total penalty: ${penalties.reduce((s, p) => s + Math.abs(p.value), 0)} points.`,
        affected_refs: penalties.map(p => p.subject_ref),
      });
    }
  }

  // Check 2: Excessive cumulative reduction — confidence reduced below meaningful threshold
  const allDecisions = [
    result.scale_readiness.decision,
    result.revenue_integrity.decision,
    result.chargeback_resilience.decision,
  ];
  if (result.saas_growth_readiness) {
    allDecisions.push(result.saas_growth_readiness.decision);
  }

  for (const d of allDecisions) {
    if (d.confidence_score <= 10) {
      issues.push({
        type: 'excessive_reduction',
        severity: 'warning',
        description: `Decision "${d.decision_key}" has confidence ${d.confidence_score}%. Multiple adjustments may have compounded excessively.`,
        affected_refs: [`decision:${d.id}`],
      });
    }

    if (d.confidence_score <= 5) {
      issues.push({
        type: 'confidence_floor',
        severity: 'info',
        description: `Decision "${d.decision_key}" hit confidence floor (${d.confidence_score}%). This is a safety minimum.`,
        affected_refs: [`decision:${d.id}`],
      });
    }
  }

  // Check 3: Layer dominance — any single layer responsible for >60% of total impact
  const layerImpact = computeLayerImpact(adjustments);
  for (const li of layerImpact) {
    if (li.impact_share > 0.6 && li.adjustments_count > 1) {
      issues.push({
        type: 'layer_dominance',
        severity: 'warning',
        description: `Layer "${li.layer}" accounts for ${Math.round(li.impact_share * 100)}% of total confidence impact (${li.adjustments_count} adjustments, total: ${li.total_impact.toFixed(1)} points).`,
        affected_refs: [],
      });
    }
  }

  return issues;
}

// ──────────────────────────────────────────────
// Layer Impact Analysis
// ──────────────────────────────────────────────

function computeLayerImpact(adjustments: ConfidenceAdjustment[]): LayerImpactSummary[] {
  const byLayer = new Map<ConfidenceLayer, ConfidenceAdjustment[]>();
  for (const adj of adjustments) {
    const existing = byLayer.get(adj.layer) || [];
    existing.push(adj);
    byLayer.set(adj.layer, existing);
  }

  const totalAbsImpact = adjustments.reduce((sum, adj) => sum + Math.abs(adj.value), 0);

  const summaries: LayerImpactSummary[] = [];
  for (const [layer, layerAdj] of byLayer) {
    const totalImpact = layerAdj.reduce((sum, adj) => sum + adj.value, 0);
    const absImpact = layerAdj.reduce((sum, adj) => sum + Math.abs(adj.value), 0);

    summaries.push({
      layer,
      adjustments_count: layerAdj.length,
      total_impact: totalImpact,
      average_impact: layerAdj.length > 0 ? totalImpact / layerAdj.length : 0,
      impact_share: totalAbsImpact > 0 ? absImpact / totalAbsImpact : 0,
    });
  }

  // Sort by absolute impact descending
  summaries.sort((a, b) => Math.abs(b.total_impact) - Math.abs(a.total_impact));

  return summaries;
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

function buildAuditSummary(
  adjustments: ConfidenceAdjustment[],
  issues: ConfidenceIssue[],
  layerImpact: LayerImpactSummary[],
  isHealthy: boolean,
): string {
  if (adjustments.length === 0) {
    return 'No confidence adjustments applied. Confidence is purely evidence-derived.';
  }

  const parts: string[] = [];
  parts.push(`${adjustments.length} confidence adjustment(s) across ${layerImpact.length} layer(s)`);

  const activeLayers = layerImpact.filter(l => l.adjustments_count > 0);
  if (activeLayers.length > 0) {
    parts.push(`Active layers: ${activeLayers.map(l => l.layer).join(', ')}`);
  }

  if (issues.length > 0) {
    const critical = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    if (critical > 0) parts.push(`${critical} critical issue(s)`);
    if (warnings > 0) parts.push(`${warnings} warning(s)`);
  }

  if (isHealthy) {
    parts.push('confidence pipeline is healthy');
  } else {
    parts.push('confidence pipeline has integrity issues');
  }

  return parts.join('. ') + '.';
}
