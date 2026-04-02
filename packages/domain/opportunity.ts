import { OpportunityStatus } from './enums';
import { Ref, Scoping, Timestamped } from './common';
import { ValueCase } from './value-case';

// ──────────────────────────────────────────────
// Opportunity — operational state for plausible upside
// ──────────────────────────────────────────────

export interface Opportunity extends Timestamped {
  id: string;
  opportunity_key: string;
  scoping: Scoping;
  cycle_ref: string;
  status: OpportunityStatus;
  title: string;
  uplift_hypothesis: string;
  raw_upside_score: number;        // 0..100
  upside_confidence_score: number; // 0..100
  value_case: ValueCase | null;
  effort_hint: EffortHint;
  priority: number;
  decision_refs: Ref[];
  evidence_refs: Ref[];
}

export type EffortHint = 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
