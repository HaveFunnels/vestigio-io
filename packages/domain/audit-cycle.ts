import { CycleType, FreshnessState } from './enums';
import { Timestamped } from './common';

// ──────────────────────────────────────────────
// Audit Cycle — canonical collection/evaluation unit
// ──────────────────────────────────────────────

export interface AuditCycle extends Timestamped {
  id: string;
  workspace_ref: string;
  environment_ref: string;
  website_ref: string;
  cycle_type: CycleType;
  trigger_source: TriggerSource;
  status: CycleStatus;
  started_at: Date;
  completed_at: Date | null;
  freshness_state: FreshnessState;
  coverage_summary: CoverageSummary | null;
}

export type TriggerSource = 'scheduled' | 'manual' | 'webhook' | 'incremental';

/**
 * CycleStatus — canonical state machine for audit cycles.
 *
 * Only 4 states are used in production (DB + runtime):
 *   'pending'   — cycle created, awaiting worker pickup
 *   'running'   — worker is actively processing this cycle
 *   'completed' — cycle finished successfully
 *   'failed'    — cycle encountered a fatal error
 *
 * DEPRECATED states (kept for backward compatibility with older DB rows):
 *   'collecting'  — was intended as sub-state of 'running' (never used in prod)
 *   'processing'  — was intended as sub-state of 'running' (never used in prod)
 *   'computing'   — was intended as sub-state of 'running' (never used in prod)
 *
 * New code should only use the 4 production states. The deprecated states
 * exist solely to prevent runtime errors on legacy rows that might still
 * carry these values in the DB.
 */
export type CycleStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  // Deprecated: sub-states that were never used in production.
  // Kept for DB backward-compat — do NOT use in new code.
  | 'collecting'
  | 'processing'
  | 'computing';

export interface CoverageSummary {
  pages_discovered: number;
  pages_fetched: number;
  pages_analyzed: number;
  evidence_count: number;
  signals_count: number;
  inferences_count: number;
  decisions_count: number;
}
