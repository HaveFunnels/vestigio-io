// ──────────────────────────────────────────────
// Shopify Adapter — Types (Phase 4A.1 Hardened)
//
// Read-only data enrichment layer for Vestigio.
// Shopify is an evidence source, not a product surface.
//
// This integration:
// - enriches existing findings with real commercial data
// - upgrades impact estimates from heuristic → data-driven
// - requires minimal setup (custom app, read-only scopes)
//
// It does NOT:
// - write or mutate store data
// - replace Shopify analytics
// - create Shopify-specific findings
// ──────────────────────────────────────────────

/**
 * Shopify store credentials for Admin API access.
 * User provides these via integration settings.
 */
export interface ShopifyCredentials {
  /** Store domain (e.g. example.myshopify.com) */
  shop_domain: string;
  /** Admin API access token from custom app */
  access_token: string;
  /** API key from custom app */
  api_key: string;
  /** API secret from custom app */
  api_secret: string;
}

/**
 * Connection state for the Shopify integration.
 */
export type ShopifyConnectionStatus = 'not_connected' | 'connected' | 'error' | 'invalid_credentials';

export interface ShopifyConnectionState {
  status: ShopifyConnectionStatus;
  shop_domain: string | null;
  shop_name: string | null;
  last_sync_at: Date | null;
  last_successful_sync_at: Date | null;
  last_error: string | null;
  error_type: ShopifyErrorType | null;
  scopes_verified: boolean;
  initial_sync_complete: boolean;
  // Phase 4A.1: Value feedback for UI
  summary_30d: {
    revenue: number;
    order_count: number;
    currency: string;
  } | null;
}

/**
 * Error classification for debugging and UI clarity.
 */
export type ShopifyErrorType =
  | 'auth_error'           // 401/403 — invalid token or scopes
  | 'rate_limit'           // 429 — too many requests
  | 'network_error'        // connection timeout, DNS failure
  | 'data_parsing_error'   // malformed response
  | 'unknown';

/**
 * Time-window summary of store metrics.
 * Compact aggregate — NOT a mirror of Shopify data.
 */
export interface ShopifyStoreMetrics {
  /** Time window for these metrics */
  window: MetricsWindow;
  /** Revenue metrics */
  revenue: {
    total: number;
    currency: string;
    order_count: number;
    average_order_value: number;
  };
  /** Refund metrics */
  refunds: {
    total_amount: number;
    refund_count: number;
    refund_rate: number; // refund_count / order_count
  };
  /** Transaction health */
  transactions: {
    total: number;
    successful: number;
    failed: number;
    failure_rate: number; // failed / total
  };
  /** Traffic context (if available from orders) */
  traffic: {
    top_landing_pages: { url: string; order_count: number }[];
    top_referrers: { source: string; order_count: number }[];
  };
  // Phase 4A.1: Enhanced aggregates
  /** Order status breakdown */
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
  /** Discount/coupon usage */
  discounts: {
    orders_with_discount: number;
    discount_usage_rate: number;
    total_discount_amount: number;
    average_discount_per_order: number;
  };
  /** Payment method breakdown */
  payment_methods: {
    methods: { gateway: string; count: number; failure_count: number }[];
    concentration_ratio: number; // % of orders on top method
  };
  /** Timestamp of when this was computed */
  computed_at: Date;
}

export type MetricsWindow = '7d' | '30d' | '90d';

/**
 * Polling configuration for Shopify data refresh.
 */
export interface ShopifyPollingConfig {
  /** Polling interval in milliseconds (default: 5 minutes) */
  interval_ms: number;
  /** Cursor for incremental fetch (last processed order ID or timestamp) */
  cursor: string | null;
  /** Which windows to compute */
  windows: MetricsWindow[];
  /** Maximum orders per fetch batch */
  batch_size: number;
}

export const DEFAULT_POLLING_CONFIG: ShopifyPollingConfig = {
  interval_ms: 5 * 60 * 1000, // 5 minutes
  cursor: null,
  windows: ['7d', '30d', '90d'],
  batch_size: 250,
};

/**
 * Required Shopify API scopes (read-only).
 */
export const REQUIRED_SCOPES = [
  'read_orders',
  'read_customers',
] as const;

/**
 * Raw order data from Shopify Admin API (minimal fields).
 * Phase 4A.1: extended with discount and gateway fields.
 */
export interface ShopifyRawOrder {
  id: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;    // paid, pending, refunded, voided, partially_refunded
  fulfillment_status: string | null; // fulfilled, partial, null (unfulfilled)
  cancelled_at: string | null;
  landing_site: string | null;
  referring_site: string | null;
  // Phase 4A.1: Discount fields
  total_discounts: string;
  discount_codes: { code: string; amount: string; type: string }[];
  // Phase 4A.1: Gateway field
  gateway: string;
  // Existing
  refunds: ShopifyRawRefund[];
  transactions: ShopifyRawTransaction[];
}

export interface ShopifyRawRefund {
  id: number;
  created_at: string;
  transactions: { amount: string; currency: string }[];
}

export interface ShopifyRawTransaction {
  id: number;
  kind: string;   // 'sale', 'authorization', 'capture', 'refund'
  status: string;  // 'success', 'failure', 'error', 'pending'
  amount: string;
  currency: string;
  created_at: string;
  gateway: string;
}

// ──────────────────────────────────────────────
// Phase 4A.2: Additional Shopify API response types
// Checkouts, Customers, Products, Inventory
// ──────────────────────────────────────────────

/**
 * Raw abandoned checkout from Shopify Admin API.
 */
export interface ShopifyCheckout {
  id: number;
  created_at: string;
  total_price: string;
  currency: string;
  completed_at: string | null;
  abandoned_checkout_url: string | null;
}

/**
 * Raw customer from Shopify Admin API.
 */
export interface ShopifyCustomer {
  id: number;
  orders_count: number;
  total_spent: string;
  created_at: string;
  currency: string;
}

/**
 * Raw product from Shopify Admin API.
 */
export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  variants: { id: number; inventory_quantity: number; price: string }[];
}

/**
 * Raw inventory level from Shopify Admin API.
 */
export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  available: number;
}

// ──────────────────────────────────────────────
// Phase 4A.2: Aggregated metrics types
// ──────────────────────────────────────────────

export interface ShopifyCheckoutMetrics {
  abandonment_count: number;
  recovery_rate: number;  // completed / total
  total_abandoned_value: number;
}

export interface ShopifyCustomerMetrics {
  total_customers: number;
  repeat_rate: number;  // orders_count > 1 / total
  new_vs_returning_ratio: number;  // new / returning
  avg_lifetime_value: number;
}

export interface ShopifyProductMetrics {
  total_products: number;
  never_sold_30d: number;  // cross-referenced with order line items
  top_by_revenue: { title: string; revenue: number }[];
}

export interface ShopifyInventoryMetrics {
  out_of_stock_promoted: number;  // variants with available=0 that appear on crawled pages
}

/**
 * Adaptive backoff state for polling reliability.
 */
export interface PollingBackoffState {
  consecutive_failures: number;
  current_interval_ms: number;
  base_interval_ms: number;
  max_interval_ms: number;
  last_error_type: ShopifyErrorType | null;
}

export const DEFAULT_BACKOFF: PollingBackoffState = {
  consecutive_failures: 0,
  current_interval_ms: 5 * 60 * 1000, // 5 min
  base_interval_ms: 5 * 60 * 1000,
  max_interval_ms: 60 * 60 * 1000,    // 1 hour max
  last_error_type: null,
};
