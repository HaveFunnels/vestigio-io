import { PreflightOverallStatus, PreflightVersionStatus } from './enums';
import { Freshness, Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Preflight Profile — landing/route readiness lens
// ──────────────────────────────────────────────

export interface PreflightProfile extends Timestamped {
  id: string;
  scoping: Scoping;
  landing_url: string;
  path_scope: string;
  goal_type: string | null;
  planned_spend_range: { low: number; high: number } | null;
  expected_conversion_type: string | null;
}

// ──────────────────────────────────────────────
// Preflight Evaluation — assessment per cycle
// ──────────────────────────────────────────────

export interface PreflightEvaluation extends Timestamped {
  id: string;
  profile_ref: Ref;
  cycle_ref: Ref;
  freshness: Freshness;
  version_status: PreflightVersionStatus;
  summary: PreflightSummary;
  blockers: PreflightItem[];
  risks: PreflightItem[];
  opportunities: PreflightItem[];
  supporting_decisions: Ref[];
  evidence_refs: Ref[];
}

export interface PreflightSummary {
  overall_status: PreflightOverallStatus;
  confidence_score: number;   // 0..100
  readiness_score: number;    // 0..100
}

export interface PreflightItem {
  title: string;
  description: string;
  severity: string;
  decision_ref: Ref | null;
  evidence_refs: Ref[];
}
