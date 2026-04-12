// ──────────────────────────────────────────────
// Opportunity Compression
//
// Groups findings by root cause when 3+ findings share the
// same root cause / remediation path. Compressed clusters
// receive a priority boost so operators focus on the highest-
// leverage fixes first.
// ──────────────────────────────────────────────

import type { FindingProjection } from '../projections/types';
import { INFERENCE_TO_ROOT_CAUSE } from '../intelligence/root-causes';

export interface OpportunityCluster {
  root_cause_key: string;
  root_cause_title: string;
  finding_keys: string[];
  finding_count: number;
  combined_impact_range: { min: number; max: number };
  priority_boost: number; // multiplier 1.0-2.0
}

export interface OpportunityCompressionResult {
  clusters: OpportunityCluster[];
  total_clustered_findings: number;
  total_standalone_findings: number;
}

/**
 * Lightweight input for opportunity compression that avoids requiring
 * the full FindingProjection type. This lets the function be called from
 * recomputeAll() (which has inferences + value cases) without creating
 * a circular dependency with the projection layer.
 */
export interface CompressibleFinding {
  inference_key: string;
  impact_range: { min: number; max: number };
}

/** Human-readable titles for root cause keys. */
const ROOT_CAUSE_TITLES: Record<string, string> = {
  trust_failure_at_checkout: 'Trust Failure at Checkout',
  fragmented_conversion_path: 'Fragmented Conversion Path',
  friction_barrier_on_path: 'Friction Barrier on Path',
  measurement_blindspot: 'Measurement Blind Spot',
  policy_deficiency: 'Policy Deficiency',
  active_revenue_leakage: 'Active Revenue Leakage',
  weak_conversion_signal: 'Weak Conversion Signal',
  support_gap: 'Support Gap',
  expectation_failure: 'Expectation Failure',
  dispute_defenses_absent: 'Dispute Defenses Absent',
  saas_activation_barrier: 'SaaS Activation Barrier',
  saas_product_experience_gap: 'SaaS Product Experience Gap',
  saas_expansion_blocked: 'SaaS Expansion Blocked',
  channel_integrity_compromise: 'Channel Integrity Compromise',
  commerce_operations_exposed: 'Commerce Operations Exposed',
  weak_channel_posture: 'Weak Channel Posture',
  commerce_abuse_exposure: 'Commerce Abuse Exposure',
};

function boostForCount(count: number): number {
  if (count >= 7) return 2.0;
  if (count >= 5) return 1.75;
  if (count >= 3) return 1.5;
  return 1.0;
}

/**
 * Compress findings into clusters that share a root cause.
 * Only clusters with 3+ findings are surfaced.
 *
 * Accepts either full FindingProjection[] or the lightweight
 * CompressibleFinding[] so it can be called from both the
 * recompute pipeline and the projection layer.
 */
export function compressOpportunities(
  findings: FindingProjection[] | CompressibleFinding[],
): OpportunityCompressionResult {
  // Group findings by root cause key
  const groups = new Map<string, CompressibleFinding[]>();

  for (const finding of findings) {
    const mapping = INFERENCE_TO_ROOT_CAUSE[finding.inference_key];
    if (!mapping || mapping.root_cause_key === '_skip_') continue;

    const key = mapping.root_cause_key;
    // Normalize to CompressibleFinding shape
    const item: CompressibleFinding = 'impact_range' in finding
      ? finding as CompressibleFinding
      : { inference_key: finding.inference_key, impact_range: (finding as FindingProjection).impact.monthly_range };

    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const clusters: OpportunityCluster[] = [];
  let totalClustered = 0;

  for (const [rootCauseKey, grouped] of groups) {
    if (grouped.length < 3) continue;

    const findingKeys = grouped.map(f => f.inference_key);
    const minSum = grouped.reduce((acc, f) => acc + f.impact_range.min, 0);
    const maxSum = grouped.reduce((acc, f) => acc + f.impact_range.max, 0);

    clusters.push({
      root_cause_key: rootCauseKey,
      root_cause_title: ROOT_CAUSE_TITLES[rootCauseKey] || rootCauseKey,
      finding_keys: findingKeys,
      finding_count: grouped.length,
      combined_impact_range: { min: minSum, max: maxSum },
      priority_boost: boostForCount(grouped.length),
    });

    totalClustered += grouped.length;
  }

  // Sort clusters by combined impact midpoint descending
  clusters.sort((a, b) => {
    const midA = (a.combined_impact_range.min + a.combined_impact_range.max) / 2;
    const midB = (b.combined_impact_range.min + b.combined_impact_range.max) / 2;
    return midB - midA;
  });

  return {
    clusters,
    total_clustered_findings: totalClustered,
    total_standalone_findings: findings.length - totalClustered,
  };
}
