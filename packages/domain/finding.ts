import { EffectiveSeverity } from './enums';
import { Ref, Scoping, Timestamped } from './common';

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
  remediation: string | null;
  page_url: string | null;
  journey_stage: string | null;
}
