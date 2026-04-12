// ──────────────────────────────────────────────
// Revenue Recovery Estimation
//
// Tracks whether resolved findings correlate with
// real revenue changes from integration data.
//
// Without real revenue data from integrations,
// recovery cannot be tracked — returns empty.
// ──────────────────────────────────────────────

export interface RevenueRecoveryEstimate {
  finding_key: string;
  resolved_at_cycle: string;
  estimated_impact_at_resolution: { min: number; max: number };
  revenue_delta_next_cycle: number | null;
  confidence: 'correlation' | 'strong_correlation' | 'inconclusive';
}

export interface RevenueRecoveryResult {
  estimates: RevenueRecoveryEstimate[];
  total_estimated_recovery_monthly: number;
  data_source: string; // which integration provided the revenue delta
}

export function computeRevenueRecovery(
  resolved_findings: { key: string; cycle_ref: string; impact_range: { min: number; max: number } }[],
  revenue_current_cycle: number | null,
  revenue_previous_cycle: number | null,
  data_source: string,
): RevenueRecoveryResult {
  const emptyResult: RevenueRecoveryResult = {
    estimates: [],
    total_estimated_recovery_monthly: 0,
    data_source,
  };

  // Can't track recovery without real revenue data from integrations
  if (revenue_current_cycle === null || revenue_previous_cycle === null) {
    return emptyResult;
  }

  // No resolved findings to attribute recovery to
  if (resolved_findings.length === 0) {
    return emptyResult;
  }

  const revenueDelta = revenue_current_cycle - revenue_previous_cycle;

  // Compute total estimated impact across all resolved findings
  const totalEstimatedImpact = resolved_findings.reduce((sum, f) => {
    const mid = (f.impact_range.min + f.impact_range.max) / 2;
    return sum + mid;
  }, 0);

  // Determine confidence level
  const confidence: RevenueRecoveryEstimate['confidence'] =
    revenueDelta <= 0
      ? 'inconclusive'
      : totalEstimatedImpact > 0 && revenueDelta >= totalEstimatedImpact * 0.5
        ? 'strong_correlation'
        : 'correlation';

  // Distribute delta proportionally across resolved findings based on estimated impact
  const estimates: RevenueRecoveryEstimate[] = resolved_findings.map(f => {
    const midImpact = (f.impact_range.min + f.impact_range.max) / 2;
    const proportion = totalEstimatedImpact > 0 ? midImpact / totalEstimatedImpact : 0;

    // Only attribute positive delta
    const attributedDelta = revenueDelta > 0 ? Math.round(revenueDelta * proportion) : null;

    return {
      finding_key: f.key,
      resolved_at_cycle: f.cycle_ref,
      estimated_impact_at_resolution: f.impact_range,
      revenue_delta_next_cycle: attributedDelta,
      confidence,
    };
  });

  const totalRecovery = revenueDelta > 0
    ? estimates.reduce((sum, e) => sum + (e.revenue_delta_next_cycle ?? 0), 0)
    : 0;

  return {
    estimates,
    total_estimated_recovery_monthly: totalRecovery,
    data_source,
  };
}
