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

  /**
   * Whether the monetary impact is a LOSS (negative finding — revenue
   * slipping through a broken or weak surface) or RETAINED value
   * (positive finding — a working control, structural check, or
   * operational practice keeping money on the table).
   *
   * Phase 1.2 introduces this distinction so the impact engine can
   * quantify positive findings as upside ("you're retaining R$ X/mo
   * via trust-surface completeness") instead of silently filtering
   * them out. UIs that want to show a loss-only total should sum
   * only `impact_role === 'loss'` entries; dashboards that want to
   * show "retained value" should sum `impact_role === 'retention'`.
   */
  impact_role: ImpactRole;
}

/**
 * Distinguishes loss-modeled impact (existing default — revenue
 * leaving the business) from retention-modeled impact (value the
 * business is actively keeping because a control is in place). The
 * monetary range is always positive regardless of role; the role
 * tells the UI how to frame it ("custo" vs "retido").
 */
export type ImpactRole = 'loss' | 'retention';

export type ImpactCategory =
  | 'revenue_loss'
  | 'conversion_loss'
  | 'chargeback_risk'
  | 'traffic_waste'
  | 'lifetime_value_loss'
  | 'trust_erosion';

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
