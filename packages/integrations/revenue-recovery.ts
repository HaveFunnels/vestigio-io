// ──────────────────────────────────────────────
// Revenue Recovery Estimation — Wave 7.2
//
// Tracks whether resolved findings correlate with
// real revenue changes from integration data.
//
// Two modes:
// 1. Simple (existing): compare 2 cycles of revenue
// 2. Multi-cycle (new): load N snapshots, track
//    revenue trajectory before/after resolution
//
// Without real revenue data from integrations,
// recovery cannot be tracked — returns empty.
// ──────────────────────────────────────────────

import type { VersionedSnapshot } from '../change-detection/snapshot-store';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface RevenueRecoveryEstimate {
  finding_key: string;
  resolved_at_cycle: string;
  estimated_impact_at_resolution: { min: number; max: number };
  revenue_delta_next_cycle: number | null;
  /** Multi-cycle: revenue deltas for each cycle after resolution */
  revenue_trajectory: number[];
  confidence: 'strong_correlation' | 'correlation' | 'inconclusive';
  /** Human-readable explanation */
  narrative: string;
}

export interface RevenueRecoveryResult {
  estimates: RevenueRecoveryEstimate[];
  total_estimated_recovery_monthly: number;
  /** Breakdown by confidence tier */
  by_confidence: {
    strong: { count: number; total_cents: number };
    correlated: { count: number; total_cents: number };
    inconclusive: { count: number; total_cents: number };
  };
  data_source: string;
}

export interface ResolvedFindingInput {
  key: string;
  cycle_ref: string;
  impact_range: { min: number; max: number };
}

// ──────────────────────────────────────────────
// Simple (2-cycle) computation — preserved for backward compat
// ──────────────────────────────────────────────

export function computeRevenueRecovery(
  resolved_findings: ResolvedFindingInput[],
  revenue_current_cycle: number | null,
  revenue_previous_cycle: number | null,
  data_source: string,
): RevenueRecoveryResult {
  const emptyResult = emptyRecoveryResult(data_source);

  if (revenue_current_cycle === null || revenue_previous_cycle === null) {
    return emptyResult;
  }

  if (resolved_findings.length === 0) {
    return emptyResult;
  }

  const revenueDelta = revenue_current_cycle - revenue_previous_cycle;

  const totalEstimatedImpact = resolved_findings.reduce((sum, f) => {
    return sum + (f.impact_range.min + f.impact_range.max) / 2;
  }, 0);

  const confidence = determineConfidence(revenueDelta, totalEstimatedImpact);

  const estimates: RevenueRecoveryEstimate[] = resolved_findings.map(f => {
    const midImpact = (f.impact_range.min + f.impact_range.max) / 2;
    const proportion = totalEstimatedImpact > 0 ? midImpact / totalEstimatedImpact : 0;
    const attributedDelta = revenueDelta > 0 ? Math.round(revenueDelta * proportion) : null;

    return {
      finding_key: f.key,
      resolved_at_cycle: f.cycle_ref,
      estimated_impact_at_resolution: f.impact_range,
      revenue_delta_next_cycle: attributedDelta,
      revenue_trajectory: revenueDelta > 0 ? [revenueDelta] : [],
      confidence,
      narrative: buildEstimateNarrative(f.key, confidence, attributedDelta, f.impact_range),
    };
  });

  return buildResult(estimates, data_source);
}

// ──────────────────────────────────────────────
// Multi-cycle recovery analysis — Wave 7.2 core
// ──────────────────────────────────────────────

/**
 * Analyze revenue recovery across N cycle snapshots.
 *
 * For each resolved finding, finds the cycle where it was resolved,
 * then tracks revenue trajectory in the cycles after resolution.
 *
 * @param snapshots — Newest→oldest (as from asyncList). Reversed internally.
 * @param resolvedFindings — Findings resolved in any of the covered cycles.
 */
export function computeMultiCycleRecovery(
  snapshots: VersionedSnapshot[],
  resolvedFindings: ResolvedFindingInput[],
): RevenueRecoveryResult {
  if (snapshots.length < 2 || resolvedFindings.length === 0) {
    return emptyRecoveryResult(inferDataSource(snapshots));
  }

  // Chronological order (oldest → newest)
  const chronological = [...snapshots].reverse();
  const dataSource = inferDataSource(snapshots);

  // Build revenue timeline: cycle_ref → revenue_cents
  const revenueTimeline = new Map<string, number | null>();
  for (const snap of chronological) {
    revenueTimeline.set(snap.cycle_ref, snap.revenue_snapshot_cents ?? null);
  }

  // For each resolved finding, compute recovery trajectory
  const estimates: RevenueRecoveryEstimate[] = [];

  for (const finding of resolvedFindings) {
    const resolvedIdx = chronological.findIndex(s => s.cycle_ref === finding.cycle_ref);
    if (resolvedIdx === -1) continue;

    // Get revenue before resolution (the cycle where the finding was last active)
    const revenueBefore = resolvedIdx > 0
      ? chronological[resolvedIdx - 1].revenue_snapshot_cents
      : null;

    // Collect revenue trajectory after resolution
    const trajectory: number[] = [];
    let cumulativeDelta = 0;
    let prevRevenue = revenueBefore;

    for (let i = resolvedIdx; i < chronological.length; i++) {
      const currentRevenue = chronological[i].revenue_snapshot_cents;
      if (currentRevenue !== null && currentRevenue !== undefined && prevRevenue !== null && prevRevenue !== undefined) {
        const delta = currentRevenue - prevRevenue;
        trajectory.push(delta);
        cumulativeDelta += delta;
      }
      if (currentRevenue !== null && currentRevenue !== undefined) {
        prevRevenue = currentRevenue;
      }
    }

    // If no revenue data available, skip
    if (trajectory.length === 0) continue;

    // Overall delta from pre-resolution to latest
    const revenueAfter = findLastRevenue(chronological, resolvedIdx);
    const totalDelta = (revenueBefore !== null && revenueBefore !== undefined && revenueAfter !== null)
      ? revenueAfter - revenueBefore
      : null;

    // Compute attribution (proportional to estimated impact)
    const midImpact = (finding.impact_range.min + finding.impact_range.max) / 2;

    // Multi-cycle confidence: more cycles of positive trajectory = stronger
    const positiveCount = trajectory.filter(d => d > 0).length;
    const confidence = determineMultiCycleConfidence(
      totalDelta,
      midImpact,
      positiveCount,
      trajectory.length,
    );

    estimates.push({
      finding_key: finding.key,
      resolved_at_cycle: finding.cycle_ref,
      estimated_impact_at_resolution: finding.impact_range,
      revenue_delta_next_cycle: trajectory[0] ?? null,
      revenue_trajectory: trajectory,
      confidence,
      narrative: buildMultiCycleNarrative(
        finding.key,
        confidence,
        totalDelta,
        trajectory.length,
        finding.impact_range,
      ),
    });
  }

  return buildResult(estimates, dataSource);
}

// ──────────────────────────────────────────────
// Confidence Scoring
// ──────────────────────────────────────────────

function determineConfidence(
  revenueDelta: number,
  totalEstimatedImpact: number,
): RevenueRecoveryEstimate['confidence'] {
  if (revenueDelta <= 0) return 'inconclusive';
  if (totalEstimatedImpact > 0 && revenueDelta >= totalEstimatedImpact * 0.5) {
    return 'strong_correlation';
  }
  return 'correlation';
}

function determineMultiCycleConfidence(
  totalDelta: number | null,
  estimatedImpact: number,
  positiveCycleCount: number,
  totalCycleCount: number,
): RevenueRecoveryEstimate['confidence'] {
  if (totalDelta === null || totalDelta <= 0) return 'inconclusive';

  // Strong correlation: revenue improved in majority of post-resolution cycles
  // AND total delta is within reasonable range of estimated impact
  const positiveRatio = totalCycleCount > 0 ? positiveCycleCount / totalCycleCount : 0;

  if (positiveRatio >= 0.6 && estimatedImpact > 0 && totalDelta >= estimatedImpact * 0.3) {
    return 'strong_correlation';
  }

  if (positiveRatio >= 0.4 || totalDelta > 0) {
    return 'correlation';
  }

  return 'inconclusive';
}

// ──────────────────────────────────────────────
// Narrative Builders
// ──────────────────────────────────────────────

function buildEstimateNarrative(
  findingKey: string,
  confidence: RevenueRecoveryEstimate['confidence'],
  attributedDelta: number | null,
  impactRange: { min: number; max: number },
): string {
  const key = findingKey.replace(/_/g, ' ');
  const estimated = `$${Math.round((impactRange.min + impactRange.max) / 200)}/mo`;

  if (confidence === 'inconclusive') {
    return `Fixing "${key}" (estimated ${estimated} impact) — revenue change inconclusive`;
  }

  const recovered = attributedDelta !== null ? `$${Math.round(attributedDelta / 100)}/mo` : 'unknown';
  const qualifier = confidence === 'strong_correlation' ? 'strongly correlated' : 'correlated';

  return `Fixing "${key}" (estimated ${estimated} impact) — ${qualifier} with ${recovered} revenue improvement`;
}

function buildMultiCycleNarrative(
  findingKey: string,
  confidence: RevenueRecoveryEstimate['confidence'],
  totalDelta: number | null,
  cycleCount: number,
  impactRange: { min: number; max: number },
): string {
  const key = findingKey.replace(/_/g, ' ');
  const estimated = `$${Math.round((impactRange.min + impactRange.max) / 200)}/mo`;

  if (confidence === 'inconclusive') {
    return `"${key}" resolved (estimated ${estimated}) — revenue trend inconclusive over ${cycleCount} cycles`;
  }

  const delta = totalDelta !== null ? `$${Math.round(totalDelta / 100)}/mo` : 'unknown';
  const qualifier = confidence === 'strong_correlation' ? 'Strong correlation' : 'Correlation';

  return `${qualifier}: "${key}" resolved (estimated ${estimated}) — revenue improved by ${delta} over ${cycleCount} post-resolution cycles`;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildResult(
  estimates: RevenueRecoveryEstimate[],
  dataSource: string,
): RevenueRecoveryResult {
  const strong = estimates.filter(e => e.confidence === 'strong_correlation');
  const correlated = estimates.filter(e => e.confidence === 'correlation');
  const inconclusive = estimates.filter(e => e.confidence === 'inconclusive');

  const totalRecovery = estimates
    .filter(e => e.confidence !== 'inconclusive')
    .reduce((sum, e) => sum + (e.revenue_delta_next_cycle ?? 0), 0);

  return {
    estimates,
    total_estimated_recovery_monthly: totalRecovery,
    by_confidence: {
      strong: {
        count: strong.length,
        total_cents: strong.reduce((s, e) => s + (e.revenue_delta_next_cycle ?? 0), 0),
      },
      correlated: {
        count: correlated.length,
        total_cents: correlated.reduce((s, e) => s + (e.revenue_delta_next_cycle ?? 0), 0),
      },
      inconclusive: {
        count: inconclusive.length,
        total_cents: 0,
      },
    },
    data_source: dataSource,
  };
}

function emptyRecoveryResult(dataSource: string): RevenueRecoveryResult {
  return {
    estimates: [],
    total_estimated_recovery_monthly: 0,
    by_confidence: {
      strong: { count: 0, total_cents: 0 },
      correlated: { count: 0, total_cents: 0 },
      inconclusive: { count: 0, total_cents: 0 },
    },
    data_source: dataSource,
  };
}

function inferDataSource(snapshots: VersionedSnapshot[]): string {
  for (const snap of snapshots) {
    if (snap.revenue_source) return snap.revenue_source;
  }
  return 'none';
}

function findLastRevenue(
  chronological: VersionedSnapshot[],
  fromIndex: number,
): number | null {
  for (let i = chronological.length - 1; i >= fromIndex; i--) {
    const rev = chronological[i].revenue_snapshot_cents;
    if (rev !== null && rev !== undefined) return rev;
  }
  return null;
}
