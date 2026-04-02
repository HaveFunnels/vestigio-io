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

export type CycleStatus =
  | 'pending'
  | 'collecting'
  | 'processing'
  | 'computing'
  | 'completed'
  | 'failed';

export interface CoverageSummary {
  pages_discovered: number;
  pages_fetched: number;
  pages_analyzed: number;
  evidence_count: number;
  signals_count: number;
  inferences_count: number;
  decisions_count: number;
}
