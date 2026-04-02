import { EffectiveSeverity, IncidentStatus } from './enums';
import { Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Incident — operational state for material downside
// ──────────────────────────────────────────────

export interface Incident extends Timestamped {
  id: string;
  incident_key: string;
  scoping: Scoping;
  cycle_ref: string;
  status: IncidentStatus;
  effective_severity: EffectiveSeverity;
  title: string;
  description: string;
  root_cause: string;
  decision_refs: Ref[];
  evidence_refs: Ref[];
  finding_refs: Ref[];
  recommended_action: string;
  blast_radius: string | null;
  recurrence_count: number;
}
