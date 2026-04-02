import { DecisionImpact, EffectiveSeverity } from './enums';
import { Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Action — derived from decisions
// ──────────────────────────────────────────────

export interface Action extends Timestamped {
  id: string;
  action_key: string;
  scoping: Scoping;
  cycle_ref: string;
  decision_ref: Ref;
  action_type: ActionType;
  title: string;
  description: string;
  priority: number;
  severity: EffectiveSeverity;
  decision_impact: DecisionImpact;
  effort_hint: string | null;
  evidence_refs: Ref[];
  status: ActionStatus;
}

export type ActionType = 'risk_mitigation' | 'opportunity_capture' | 'verification' | 'observation';

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';
