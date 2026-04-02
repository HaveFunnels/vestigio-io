import { BasisType, ImpactType } from './enums';
import { Range, Timestamped } from './common';

// ──────────────────────────────────────────────
// Value Case — economic impact estimate
// ──────────────────────────────────────────────

export interface ValueCase extends Timestamped {
  id: string;
  decision_ref: string;
  impact_type: ImpactType;
  basis_type: BasisType;
  range: Range;
  confidence_band: ConfidenceBand;
  assumptions: string[];
}

export type ConfidenceBand = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
