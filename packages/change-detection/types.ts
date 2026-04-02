import { Ref } from '../domain';

// ──────────────────────────────────────────────
// Change Detection — cycle-to-cycle intelligence
//
// Detects what actually changed between analysis cycles:
// regressions, improvements, noise. Operates at decision,
// evidence, and critical path levels.
// ──────────────────────────────────────────────

export type ChangeClass =
  | 'regression'       // got worse
  | 'improvement'      // got better
  | 'stable_risk'      // unchanged but still risky
  | 'stable_healthy'   // unchanged and healthy
  | 'new_issue'        // first time seen
  | 'resolved'         // was an issue, no longer
  | 'noise';           // fluctuation within normal bounds

export type ChangeSeverity = 'none' | 'minor' | 'notable' | 'significant' | 'critical';

/**
 * A detected change in a specific decision between two cycles.
 */
export interface DecisionChange {
  decision_key: string;
  question_key: string;
  change_class: ChangeClass;
  severity: ChangeSeverity;
  previous_cycle_ref: string;
  current_cycle_ref: string;

  // Score deltas
  risk_score_delta: number;        // positive = worse, negative = better
  confidence_score_delta: number;
  severity_change: { from: string; to: string } | null;
  impact_change: { from: string; to: string } | null;

  // Context
  contributing_factors: string[];   // what caused the change
  summary: string;                  // human-readable explanation
}

/**
 * A detected change in evidence or signals.
 */
export interface EvidenceChange {
  subject_ref: Ref;
  change_class: ChangeClass;
  evidence_type: string;
  previous_value: string | null;
  current_value: string | null;
  confidence_delta: number;
  summary: string;
}

/**
 * Aggregate change report for a full cycle comparison.
 */
export interface CycleChangeReport {
  previous_cycle_ref: string;
  current_cycle_ref: string;
  generated_at: Date;

  // Decision-level changes
  decision_changes: DecisionChange[];
  regressions: DecisionChange[];
  improvements: DecisionChange[];
  stable_risks: DecisionChange[];
  new_issues: DecisionChange[];
  resolved_issues: DecisionChange[];

  // Evidence-level changes (only material ones)
  evidence_changes: EvidenceChange[];

  // Summary stats
  summary: CycleChangeSummary;
}

export interface CycleChangeSummary {
  total_decisions_compared: number;
  regression_count: number;
  improvement_count: number;
  stable_risk_count: number;
  new_issue_count: number;
  resolved_count: number;
  noise_count: number;
  overall_trend: 'improving' | 'degrading' | 'stable' | 'mixed';
  headline: string; // e.g. "2 regressions detected, 1 issue resolved"
}
