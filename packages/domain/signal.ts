import { FreshnessState, SignalCategory } from './enums';
import { Freshness, Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Signal — derived local fact from evidence
// ──────────────────────────────────────────────

export interface Signal extends Timestamped {
  id: string;
  signal_key: string;
  category: SignalCategory;
  scoping: Scoping;
  cycle_ref: string;
  freshness: Freshness;

  // What was observed
  attribute: string;    // e.g. "checkout.mode", "policy.refund.present"
  value: string;        // e.g. "hosted", "false"
  numeric_value: number | null;

  // Quality
  confidence: number;   // 0..100
  evidence_refs: Ref[];

  // Context
  subject_label: string | null;
  description: string | null;
}
