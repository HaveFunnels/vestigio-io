import { EffectiveSeverity } from './enums';
import { Ref, Scoping, Timestamped } from './common';
import type { VerificationStrategy } from './actions';

// ──────────────────────────────────────────────
// Finding — projected detail (NEVER source of truth)
// Findings support decisions; they are projections.
// ──────────────────────────────────────────────

export interface Finding extends Timestamped {
  id: string;
  finding_key: string;
  scoping: Scoping;
  cycle_ref: string;
  decision_ref: Ref;
  title: string;
  description: string;
  technical_detail: string | null;
  severity: EffectiveSeverity;
  confidence: number;
  evidence_refs: Ref[];
  /**
   * Short one-line remediation summary. Kept for back-compat with
   * surfaces that render a single line (cards, list rows). The
   * structured version lives in `remediation_steps`.
   */
  remediation: string | null;
  /**
   * Ordered remediation steps. See Action.remediation_steps. Null
   * for findings that don't have a backfilled remediation template
   * yet — Phase 2 backfills per action_key.
   */
  remediation_steps: string[] | null;
  /** Quantitative effort estimate in dev-hours. See Action.estimated_effort_hours. */
  estimated_effort_hours: number | null;
  /** How this finding is re-verified. See Action.verification_strategy. */
  verification_strategy: VerificationStrategy | null;
  /** Copy the UI / MCP show when user asks how verification works. */
  verification_notes: string | null;
  /** ETA in seconds for the verification dispatch. Null when not time-bounded. */
  verification_eta_seconds: number | null;
  page_url: string | null;
  journey_stage: string | null;
}
