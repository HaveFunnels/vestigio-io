import { InferenceCategory } from './enums';
import { Freshness, Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Inference — composite interpretation of signals
// ──────────────────────────────────────────────

export interface Inference extends Timestamped {
  id: string;
  inference_key: string;
  category: InferenceCategory;
  scoping: Scoping;
  cycle_ref: string;
  freshness: Freshness;

  // Interpretation
  conclusion: string;      // e.g. "trust_boundary_crossed"
  conclusion_value: string; // e.g. "true", "high"
  severity_hint: string | null;

  // Quality
  confidence: number;      // 0..100
  signal_refs: Ref[];
  evidence_refs: Ref[];

  // Explanation
  reasoning: string;
  description: string | null;

  /**
   * Phase 3.2 i18n: Structured slot values for reasoning template
   * interpolation. When present, the projection engine can look up a
   * translated reasoning template and interpolate these values.
   * The `reasoning` field remains as the English fallback.
   */
  reasoning_slots?: Record<string, string | number>;
}
