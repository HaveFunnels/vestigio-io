// ──────────────────────────────────────────────
// Quantified Impact Types
// Every impact MUST have a numeric estimate.
// If low certainty → wider range + lower confidence. NEVER null.
// ──────────────────────────────────────────────

export interface QuantifiedValueCase {
  cause: string;
  effect: string;
  impact_type: ImpactCategory;

  estimated_impact: EstimatedImpact;

  reasoning: string;
  basis_type: 'heuristic' | 'mixed' | 'data_driven';
  confidence: number; // 0..100
  inference_key: string;
}

export type ImpactCategory =
  | 'revenue_loss'
  | 'conversion_loss'
  | 'chargeback_risk'
  | 'traffic_waste'
  | 'lifetime_value_loss';

export interface EstimatedImpact {
  monthly_revenue_delta: number | null;  // absolute $
  percentage_delta: number | null;       // 0.0 - 1.0 (e.g. 0.08 = 8%)
  range: { min: number; max: number };   // always present, never null
  currency: string;
}

export interface BusinessInputs {
  monthly_revenue: number | null;
  average_order_value: number | null;
  monthly_transactions: number | null;
  conversion_rate: number | null;
  chargeback_rate: number | null;
  churn_rate: number | null;
}

export interface ImpactSummary {
  total_monthly_loss_range: { min: number; max: number };
  total_monthly_loss_mid: number;
  highest_impact_issue: string | null;
  highest_impact_value: number;
  issue_count: number;
  average_confidence: number;
  currency: string;
}
