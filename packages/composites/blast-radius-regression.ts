// ──────────────────────────────────────────────
// High-Blast-Radius Regression
//
// Detects when 3+ decisions regress in the same cycle with
// overlapping root causes. Auto-flags as incident-level so
// the operator treats it as a coordinated degradation, not
// isolated issues.
// ──────────────────────────────────────────────

import type { CycleChangeReport } from '../change-detection/types';
import { INFERENCE_TO_ROOT_CAUSE } from '../intelligence/root-causes';
import { INFERENCE_TO_PACK } from '../projections/engine';

export type BlastRadiusSeverity = 'critical' | 'high' | 'none';

export interface BlastRadiusAlert {
  detected: boolean;
  regression_count: number;
  affected_packs: string[];
  shared_root_causes: string[];
  severity: BlastRadiusSeverity;
  summary: string;
}

const EMPTY_ALERT: BlastRadiusAlert = {
  detected: false,
  regression_count: 0,
  affected_packs: [],
  shared_root_causes: [],
  severity: 'none',
  summary: 'No blast-radius regression detected.',
};

/**
 * Evaluate whether the current cycle's regressions constitute a
 * high-blast-radius event.
 *
 * A blast-radius regression is detected when 3+ decisions regressed in
 * the same cycle. If any root cause appears in 2+ regressions the
 * severity is "critical" (shared systemic cause). Otherwise it is "high"
 * (concurrent degradation without a single root cause).
 */
export function detectBlastRadiusRegression(
  changeReport: CycleChangeReport | null,
): BlastRadiusAlert {
  if (!changeReport) return EMPTY_ALERT;

  const regressions = changeReport.regressions;
  if (regressions.length < 3) return EMPTY_ALERT;

  // Collect affected packs from contributing factors → inference keys
  const packSet = new Set<string>();
  // Count how many regressions each root cause appears in
  const rootCauseCounts = new Map<string, number>();

  for (const reg of regressions) {
    // contributing_factors are inference keys or free-text; try to map each
    for (const factor of reg.contributing_factors) {
      const mapping = INFERENCE_TO_ROOT_CAUSE[factor];
      if (mapping && mapping.root_cause_key !== '_skip_') {
        rootCauseCounts.set(
          mapping.root_cause_key,
          (rootCauseCounts.get(mapping.root_cause_key) || 0) + 1,
        );
      }
      const pack = INFERENCE_TO_PACK[factor];
      if (pack) packSet.add(pack);
    }

    // Also derive pack from the decision_key when it matches a pack name
    if (reg.decision_key) packSet.add(reg.decision_key);
  }

  const sharedRootCauses = [...rootCauseCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([key]) => key);

  const severity: BlastRadiusSeverity = sharedRootCauses.length > 0 ? 'critical' : 'high';

  const summary = sharedRootCauses.length > 0
    ? `${regressions.length} regressions share ${sharedRootCauses.length} root cause(s): ${sharedRootCauses.join(', ')}. Treat as a coordinated incident.`
    : `${regressions.length} concurrent regressions detected across ${packSet.size} pack(s). No single shared root cause identified.`;

  return {
    detected: true,
    regression_count: regressions.length,
    affected_packs: [...packSet],
    shared_root_causes: sharedRootCauses,
    severity,
    summary,
  };
}
