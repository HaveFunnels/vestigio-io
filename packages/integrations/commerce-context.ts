// ──────────────────────────────────────────────
// Commerce Context
//
// Extended business context populated from
// integration snapshots. Supplements the core
// BusinessInputs with richer operational data.
// ──────────────────────────────────────────────

export interface CommerceContext {
  // Shopify-sourced
  abandonment_rate: number | null;
  abandonment_value_monthly: number | null;
  repeat_purchase_rate: number | null;
  new_vs_returning_ratio: number | null;
  avg_customer_lifetime_value: number | null;
  total_products: number | null;
  products_never_sold_30d: number | null;
  out_of_stock_promoted_count: number | null;
  top_products_by_revenue: { title: string; revenue: number }[];
  refund_rate: number | null;
  discount_usage_rate: number | null;
  payment_gateway_concentration: number | null;

  // Stripe-sourced (future)
  mrr: number | null;
  subscriber_churn_rate: number | null;
  failed_payment_rate: number | null;

  // Ad platforms (future)
  total_ad_spend_monthly: number | null;
  ad_spend_by_platform: Record<string, number>;

  // Meta
  sources: string[];
  basis_type: 'data_driven' | 'mixed' | 'heuristic';
}
