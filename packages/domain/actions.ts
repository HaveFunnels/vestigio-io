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

  /**
   * Ordered, actionable remediation steps. Phase 1 ships the field
   * null-default; Phase 2 backfills content per action_key (see
   * docs/REMEDIATION_FORMAT.md). Each step is a short verb-led
   * sentence ("Add a 200-word refund policy covering window, process,
   * and contact info"). Avoid sequencing words like "first" / "then"
   * — the array order is the sequence.
   */
  remediation_steps: string[] | null;

  /**
   * Rough effort estimate in dev-hours (median scenario). Null when
   * we don't have enough signal to calibrate. Surfaced on cards so
   * users can triage quick-wins vs. bigger projects. Separate from
   * `effort_hint` (a qualitative "small"/"medium"/"large" string) —
   * this one is quantitative.
   */
  estimated_effort_hours: number | null;
}

export type ActionType = 'risk_mitigation' | 'opportunity_capture' | 'verification' | 'observation';

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';
