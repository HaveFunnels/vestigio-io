// ──────────────────────────────────────────────
// Nuvemshop Adapter — Types
//
// Read-only data enrichment layer for Vestigio.
// Nuvemshop is an evidence source, not a product surface.
//
// This integration:
// - enriches existing findings with real commercial data
// - upgrades impact estimates from heuristic → data-driven
// - uses OAuth tokens (non-expiring) via partner app
//
// It does NOT:
// - write or mutate store data
// - replace Nuvemshop analytics
// - create Nuvemshop-specific findings
// ──────────────────────────────────────────────

/**
 * Nuvemshop store credentials for API access.
 * OAuth flow returns access_token + user_id (store_id).
 */
export interface NuvemshopCredentials {
  /** Numeric store ID returned by OAuth (user_id field) */
  store_id: string;
  /** OAuth access token (non-expiring) */
  access_token: string;
}

/**
 * Connection state for the Nuvemshop integration.
 */
export type NuvemshopConnectionStatus = 'not_connected' | 'connected' | 'error' | 'invalid_credentials';

export interface NuvemshopConnectionState {
  status: NuvemshopConnectionStatus;
  store_id: string | null;
  store_name: string | null;
  store_domain: string | null;
  last_sync_at: Date | null;
  last_successful_sync_at: Date | null;
  last_error: string | null;
  error_type: NuvemshopErrorType | null;
  initial_sync_complete: boolean;
  summary_30d: {
    revenue: number;
    order_count: number;
    currency: string;
  } | null;
}

/**
 * Error classification for debugging and UI clarity.
 */
export type NuvemshopErrorType =
  | 'auth_error'           // 401/403 — invalid token
  | 'rate_limit'           // 429 — too many requests
  | 'network_error'        // connection timeout, DNS failure
  | 'data_parsing_error'   // malformed response
  | 'unknown';

/**
 * Time-window summary of store metrics.
 */
export interface NuvemshopStoreMetrics {
  window: MetricsWindow;
  revenue: {
    total: number;
    currency: string;
    order_count: number;
    average_order_value: number;
  };
  refunds: {
    total_amount: number;
    refund_count: number;
    refund_rate: number;
  };
  transactions: {
    total: number;
    successful: number;
    failed: number;
    failure_rate: number;
  };
  order_status: {
    paid: number;
    pending: number;
    refunded: number;
    voided: number;
    cancelled: number;
    fulfilled: number;
    unfulfilled: number;
    cancellation_rate: number;
  };
  discounts: {
    orders_with_discount: number;
    discount_usage_rate: number;
    total_discount_amount: number;
    average_discount_per_order: number;
  };
  payment_methods: {
    methods: { gateway: string; count: number; failure_count: number }[];
    concentration_ratio: number;
  };
  computed_at: Date;
}

export type MetricsWindow = '7d' | '30d' | '90d';

/**
 * Polling configuration for Nuvemshop data refresh.
 */
export interface NuvemshopPollingConfig {
  interval_ms: number;
  cursor: string | null;
  windows: MetricsWindow[];
  batch_size: number;
}

export const DEFAULT_POLLING_CONFIG: NuvemshopPollingConfig = {
  interval_ms: 5 * 60 * 1000,
  cursor: null,
  windows: ['7d', '30d', '90d'],
  batch_size: 200, // Nuvemshop max per_page is 200
};

/**
 * Required Nuvemshop API scopes (read-only).
 */
export const REQUIRED_SCOPES = [
  'read_orders',
  'read_customers',
  'read_products',
  'read_content',           // copy analysis (future)
  'read_coupons',           // discount fraud/hijack
  'read_discounts',         // discount fraud/hijack
  'read_domains',           // domain verification vs env
  'read_manual_orders',     // orders that aren't automated
  'view_email_templates',   // copy + chargeback risk (future)
  'read_orders_risk',       // fraud risk signals
  'read_fulfillment_orders', // fulfillment friction
  'read_locations',         // inventory locations
  'read_shipping',          // shipping cost enrichment
  'view_subscriptions',     // recurring revenue detection
] as const;

/**
 * Raw order data from Nuvemshop API.
 */
export interface NuvemshopRawOrder {
  id: number;
  number: number;
  created_at: string;
  updated_at: string;
  status: string;           // open, closed, cancelled
  payment_status: string;   // pending, authorized, paid, abandoned, refunded, voided, partially_paid, partially_refunded
  shipping_status: string;  // unpacked, shipped, unshipped, delivered
  total: string;            // decimal string
  subtotal: string;
  discount: string;         // discount amount
  currency: string;
  gateway: string;          // payment provider
  cancelled_at: string | null;
  paid_at: string | null;
  // Shipping data (read_shipping + read_fulfillment_orders)
  shipping_cost_customer: string | null;
  shipping_cost_owner: string | null;
  shipping_min_days: number | null;
  shipping_max_days: number | null;
  shipping_pickup_type: string | null; // ship | pickup
  // Storefront / channel
  storefront: string | null;  // store, meli, api, form, pos
  // Cancel reason
  cancel_reason: string | null; // customer, inventory, fraud, other
  products: NuvemshopOrderProduct[];
  customer: { id: number; name: string; email: string } | null;
}

export interface NuvemshopOrderProduct {
  id: number;
  product_id: number;
  variant_id: number;
  name: string;
  price: string;
  quantity: number;
}

/**
 * Raw customer from Nuvemshop API.
 */
export interface NuvemshopCustomer {
  id: number;
  name: string;
  email: string;
  total_spent: string;
  total_spent_currency: string;
  last_order_id: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Raw product from Nuvemshop API.
 */
export interface NuvemshopProduct {
  id: number;
  name: Record<string, string>; // multilingual { pt: "...", en: "..." }
  published: boolean;
  variants: NuvemshopVariant[];
  created_at: string;
  updated_at: string;
}

export interface NuvemshopVariant {
  id: number;
  price: string;
  stock: number | null;
  stock_management: boolean;
}

/**
 * Raw coupon from Nuvemshop API.
 */
export interface NuvemshopCoupon {
  id: number;
  code: string;
  type: string;        // percentage, absolute, shipping
  value: string;       // discount amount/percentage
  valid: boolean;
  used: number;
  max_uses: number | null;
  start_date: string | null;
  end_date: string | null;
  min_price: string | null;
  first_consumer_purchase: boolean;
  combines_with_other_discounts: boolean;
  deleted_at: string | null;
}

/**
 * Raw domain from Nuvemshop API.
 */
export interface NuvemshopDomain {
  id: string;
  url: string;
  ssl: boolean;
  created_at: string;
}

// ── Aggregated metrics types ──

export interface NuvemshopCustomerMetrics {
  total_customers: number;
  repeat_rate: number;
  new_vs_returning_ratio: number;
  avg_lifetime_value: number;
}

export interface NuvemshopProductMetrics {
  total_products: number;
  never_sold_30d: number;
  out_of_stock_count: number;  // variants with stock=0 and stock_management=true
  top_by_revenue: { title: string; revenue: number }[];
}

export interface NuvemshopCouponMetrics {
  active_coupons: number;
  total_used: number;
  stacking_enabled_count: number;   // coupons that combine with other discounts
  unlimited_coupons: number;        // coupons with no max_uses (abuse risk)
  expired_but_active: number;       // valid=true but end_date passed (leak)
  first_purchase_only: number;
}

export interface NuvemshopShippingMetrics {
  orders_with_free_shipping: number;
  avg_shipping_cost_customer: number;
  avg_shipping_days: number;
  pickup_rate: number;              // % of orders using pickup vs ship
  shipping_cost_ratio: number;      // avg shipping cost / avg order value
}

export interface NuvemshopChannelMetrics {
  channels: { channel: string; count: number }[];
  fraud_cancelled_count: number;    // orders cancelled with reason=fraud
  inventory_cancelled_count: number; // orders cancelled with reason=inventory
}

/**
 * Adaptive backoff state for polling reliability.
 */
export interface PollingBackoffState {
  consecutive_failures: number;
  current_interval_ms: number;
  base_interval_ms: number;
  max_interval_ms: number;
  last_error_type: NuvemshopErrorType | null;
}

export const DEFAULT_BACKOFF: PollingBackoffState = {
  consecutive_failures: 0,
  current_interval_ms: 5 * 60 * 1000,
  base_interval_ms: 5 * 60 * 1000,
  max_interval_ms: 60 * 60 * 1000,
  last_error_type: null,
};
