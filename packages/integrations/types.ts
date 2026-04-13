// ──────────────────────────────────────────────
// Integration Data Layer — Provider Types
//
// Generic typed snapshots for each data source.
// Allows multiple providers (Shopify, Stripe,
// Meta Ads, Google Ads) to feed into the engine
// without breaking when any source is absent.
// ──────────────────────────────────────────────

// Integration provider types
export type IntegrationProvider = 'shopify' | 'nuvemshop' | 'stripe' | 'meta_ads' | 'google_ads';

// Generic typed snapshot per source
export interface IntegrationSnapshot<T extends IntegrationProvider = IntegrationProvider> {
  provider: T;
  fetched_at: string; // ISO timestamp
  window: '7d' | '30d' | '90d';
  data: IntegrationDataMap[T];
}

// Map provider -> data shape
interface IntegrationDataMap {
  shopify: ShopifySnapshotData;
  nuvemshop: NuvemshopSnapshotData;
  stripe: StripeSnapshotData;
  meta_ads: MetaAdsSnapshotData;
  google_ads: GoogleAdsSnapshotData;
}

// Shopify data (expanded from existing ShopifyStoreMetrics)
export interface ShopifySnapshotData {
  revenue: { total: number; order_count: number; average_order_value: number; currency: string };
  refunds: { total_amount: number; refund_count: number; refund_rate: number };
  transactions: { total: number; successful: number; failed: number; failure_rate: number };
  order_status: { cancellation_rate: number; fulfilled_rate: number };
  discounts: { discount_usage_rate: number; total_discount_amount: number };
  payment_methods: { concentration_ratio: number; methods: { gateway: string; count: number; failure_count: number }[] };
  // Expanded data — null when not available
  abandoned_checkouts: { count: number; recovery_rate: number; total_value: number } | null;
  customers: { total: number; repeat_rate: number; new_vs_returning_ratio: number; avg_lifetime_value: number } | null;
  products: { total: number; never_sold_30d: number; top_by_revenue: { title: string; revenue: number }[] } | null;
  inventory: { out_of_stock_promoted: number } | null;
}

// Nuvemshop data — mirrors ShopifySnapshotData shape for engine compatibility.
// Nuvemshop lacks abandoned checkout API and separate inventory levels API,
// so those fields are always null. Stock data comes from product variants.
// Extended fields (coupons, shipping, channels) are Nuvemshop-exclusive.
export interface NuvemshopSnapshotData {
  revenue: { total: number; order_count: number; average_order_value: number; currency: string };
  refunds: { total_amount: number; refund_count: number; refund_rate: number };
  transactions: { total: number; successful: number; failed: number; failure_rate: number };
  order_status: { cancellation_rate: number; fulfilled_rate: number };
  discounts: { discount_usage_rate: number; total_discount_amount: number };
  payment_methods: { concentration_ratio: number; methods: { gateway: string; count: number; failure_count: number }[] };
  abandoned_checkouts: { count: number; recovery_rate: number; total_value: number } | null;
  customers: { total: number; repeat_rate: number; new_vs_returning_ratio: number; avg_lifetime_value: number } | null;
  products: { total: number; never_sold_30d: number; top_by_revenue: { title: string; revenue: number }[] } | null;
  inventory: { out_of_stock_promoted: number } | null;
  // Nuvemshop-exclusive extended data
  coupons: {
    active_coupons: number;
    total_used: number;
    stacking_enabled_count: number;
    unlimited_coupons: number;
    expired_but_active: number;
  } | null;
  shipping: {
    orders_with_free_shipping: number;
    avg_shipping_cost_customer: number;
    avg_shipping_days: number;
    pickup_rate: number;
    shipping_cost_ratio: number;
  } | null;
  channels: {
    entries: { channel: string; count: number }[];
    fraud_cancelled_count: number;
    inventory_cancelled_count: number;
  } | null;
}

// Stub types for future integrations — just enough to compile
export interface StripeSnapshotData {
  revenue: { total: number; currency: string; charge_count: number };
  mrr: number | null;
  churn_rate: number | null;
  refund_rate: number;
  dispute_rate: number;
  failed_payment_rate: number;
  subscriptions: { active: number; canceled_30d: number } | null;
}

export interface MetaAdsSnapshotData {
  ad_spend_30d: number;
  currency: string;
  creatives: { id: string; headline: string; body: string; cta: string; destination_url: string; status: string; spend_30d: number }[];
}

export interface GoogleAdsSnapshotData {
  ad_spend_30d: number;
  currency: string;
  campaigns: { id: string; name: string; headlines: string[]; descriptions: string[]; final_url: string; spend_30d: number }[];
}
