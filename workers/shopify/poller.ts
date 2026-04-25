import {
  ShopifyCredentials,
  ShopifyStoreMetrics,
  ShopifyPollingConfig,
  ShopifyConnectionState,
  ShopifyErrorType,
  PollingBackoffState,
  ShopifyCheckoutMetrics,
  ShopifyCustomerMetrics,
  ShopifyProductMetrics,
  ShopifyInventoryMetrics,
  DEFAULT_POLLING_CONFIG,
  DEFAULT_BACKOFF,
} from '../../packages/shopify-adapter';
import {
  fetchOrders,
  fetchAbandonedCheckouts,
  fetchCustomers,
  fetchProducts,
  fetchInventoryLevels,
  verifyConnection,
  classifyHttpError,
  classifyNetworkError,
} from '../../packages/shopify-adapter/client';
import {
  aggregateOrdersIntoMetrics,
  aggregateCheckouts,
  aggregateCustomers,
  aggregateProducts,
  aggregateInventory,
} from '../../packages/shopify-adapter/aggregator';
import {
  mapToBusinessInputs,
  determineBasisType,
  computeOperationalContext,
  buildValueFeedback,
  OperationalContext,
} from '../../packages/shopify-adapter/mapper';
import { BusinessInputs } from '../../packages/impact/types';

// ──────────────────────────────────────────────
// Shopify Poller — Phase 4A.1 Hardened
//
// Production-grade polling with:
// - Adaptive backoff on failure
// - Error classification for UI clarity
// - Initial sync tracking
// - Value feedback for integration card
// - Operational context for impact amplification
// - Graceful degradation (never blocks pipeline)
//
// Read-only. No writes. No mutations.
// ──────────────────────────────────────────────

export interface ShopifyPollResult {
  metrics: ShopifyStoreMetrics[];
  business_inputs: BusinessInputs;
  basis_type: 'data_driven' | 'mixed' | 'heuristic';
  operational_context: OperationalContext;
  orders_fetched: number;
  cursor: string | null;
  duration_ms: number;
  errors: string[];
  error_type: ShopifyErrorType | null;
  // Phase 4A.1: Sync state
  connection_state: ShopifyConnectionState;
  value_feedback: string | null;
  initial_sync_complete: boolean;
  // Phase 4A.2: Extended metrics
  checkout_metrics: ShopifyCheckoutMetrics | null;
  customer_metrics: ShopifyCustomerMetrics | null;
  product_metrics: ShopifyProductMetrics | null;
  inventory_metrics: ShopifyInventoryMetrics | null;
}

/**
 * Run a single poll cycle.
 * Fetches recent orders, aggregates into metrics,
 * produces BusinessInputs + OperationalContext.
 */
export async function pollShopifyData(
  credentials: ShopifyCredentials,
  config: Partial<ShopifyPollingConfig> = {},
  /** Crawled page paths (e.g. ['/products/blue-hoodie', '/collections/all']) for promoted product cross-reference */
  crawledPaths: string[] = [],
): Promise<ShopifyPollResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...config };

  // Step 1: Verify connection
  const connectionState = await verifyConnection(credentials);
  if (connectionState.status !== 'connected') {
    return buildFailResult(
      connectionState,
      pollingConfig.cursor,
      startTime,
      [`Connection failed: ${connectionState.last_error || connectionState.status}`],
      connectionState.error_type,
    );
  }

  // Step 2: Fetch orders (90d covers all windows)
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const until = new Date();

  const { orders, errors: fetchErrors } = await fetchOrders(
    credentials,
    since,
    until,
    pollingConfig.batch_size,
  );
  errors.push(...fetchErrors);

  if (orders.length === 0 && fetchErrors.length > 0) {
    return buildFailResult(
      connectionState,
      pollingConfig.cursor,
      startTime,
      errors,
      'data_parsing_error',
    );
  }

  // Step 3: Fetch checkouts, customers, products sequentially (non-fatal)
  // NOTE: Shopify REST API rate limit is 2 req/s. Running these in parallel
  // would fire 3 initial requests simultaneously, risking 429s. Sequential
  // execution with the 500ms delay inside each fetch function stays safe.
  const checkoutResult = await fetchAbandonedCheckouts(credentials, since).catch(err => ({
    checkouts: [] as any[],
    errors: [err instanceof Error ? err.message : String(err)],
  }));
  const customerResult = await fetchCustomers(credentials, since).catch(err => ({
    customers: [] as any[],
    errors: [err instanceof Error ? err.message : String(err)],
  }));
  const productResult = await fetchProducts(credentials).catch(err => ({
    products: [] as any[],
    errors: [err instanceof Error ? err.message : String(err)],
  }));

  errors.push(...checkoutResult.errors);
  errors.push(...customerResult.errors);
  errors.push(...productResult.errors);

  // Step 4: Fetch inventory levels (depends on product variant IDs)
  let inventoryResult: { levels: any[]; errors: string[] } = { levels: [], errors: [] };
  if (productResult.products.length > 0) {
    const variantIds = productResult.products
      .flatMap((p: any) => p.variants.map((v: any) => String(v.id)));
    if (variantIds.length > 0) {
      inventoryResult = await fetchInventoryLevels(credentials, variantIds).catch(err => ({
        levels: [] as any[],
        errors: [err instanceof Error ? err.message : String(err)],
      }));
      errors.push(...inventoryResult.errors);
    }
  }

  // Step 5: Aggregate orders
  const metrics = aggregateOrdersIntoMetrics(orders, pollingConfig.windows);

  // Step 6: Aggregate extended metrics (non-fatal — null on failure)
  const checkoutMetrics = checkoutResult.checkouts.length > 0
    ? aggregateCheckouts(checkoutResult.checkouts, 90)
    : null;

  const customerMetrics = customerResult.customers.length > 0
    ? aggregateCustomers(customerResult.customers)
    : null;

  // Extract line items from fetched orders for product-level analytics.
  // Each order now includes line_items (added to the fields query).
  const orderLineItems = orders.flatMap((o: any) =>
    (o.line_items || []).map((li: any) => ({
      product_id: Number(li.product_id),
      quantity: Number(li.quantity) || 1,
      total: parseFloat(li.price || '0') * (Number(li.quantity) || 1),
    })),
  );

  const productMetrics = productResult.products.length > 0
    ? aggregateProducts(productResult.products, orderLineItems)
    : null;

  // Cross-reference crawled product pages with Shopify product handles
  // to identify "promoted" products (products visible on the site).
  // Shopify product pages follow /products/{handle} pattern.
  const crawledHandles = new Set(
    crawledPaths
      .map(p => {
        const m = p.match(/\/products\/([^/?#]+)/);
        return m ? m[1].toLowerCase() : null;
      })
      .filter(Boolean) as string[],
  );
  const promotedProductIds = productResult.products
    .filter(p => p.handle && crawledHandles.has(p.handle.toLowerCase()))
    .map(p => p.id);

  const inventoryMetrics = (productResult.products.length > 0 && inventoryResult.levels.length > 0)
    ? aggregateInventory(productResult.products, inventoryResult.levels, promotedProductIds)
    : null;

  // Step 7: Map to BusinessInputs
  const businessInputs = mapToBusinessInputs(metrics);
  const basisType = determineBasisType(businessInputs);

  // Step 8: Compute operational context (Phase 4A.1)
  const operationalContext = computeOperationalContext(metrics);

  // Step 9: Build value feedback for UI
  const valueFeedback = buildValueFeedback(metrics);

  // Step 10: Update connection state with summary
  const m30d = metrics.find(m => m.window === '30d');
  connectionState.initial_sync_complete = true;
  connectionState.last_successful_sync_at = new Date();
  connectionState.summary_30d = m30d ? {
    revenue: m30d.revenue.total,
    order_count: m30d.revenue.order_count,
    currency: m30d.revenue.currency,
  } : null;

  // Step 11: Update cursor
  const lastOrderId = orders.length > 0 ? String(orders[orders.length - 1].id) : pollingConfig.cursor;

  return {
    metrics,
    business_inputs: businessInputs,
    basis_type: basisType,
    operational_context: operationalContext,
    orders_fetched: orders.length,
    cursor: lastOrderId,
    duration_ms: Date.now() - startTime,
    errors,
    error_type: null,
    connection_state: connectionState,
    value_feedback: valueFeedback,
    initial_sync_complete: true,
    checkout_metrics: checkoutMetrics,
    customer_metrics: customerMetrics,
    product_metrics: productMetrics,
    inventory_metrics: inventoryMetrics,
  };
}

/**
 * Compute adaptive backoff interval after a failure.
 * Gradually increases polling interval on consecutive failures.
 * Recovers to base interval on success.
 */
export function computeBackoff(
  currentState: PollingBackoffState,
  success: boolean,
): PollingBackoffState {
  if (success) {
    // Recovery: reset to base interval
    return {
      ...currentState,
      consecutive_failures: 0,
      current_interval_ms: currentState.base_interval_ms,
      last_error_type: null,
    };
  }

  // Failure: exponential backoff (2x per failure, capped at max)
  const newFailures = currentState.consecutive_failures + 1;
  const backoffMultiplier = Math.pow(2, Math.min(newFailures, 6)); // cap at 2^6 = 64x
  const newInterval = Math.min(
    currentState.base_interval_ms * backoffMultiplier,
    currentState.max_interval_ms,
  );

  return {
    ...currentState,
    consecutive_failures: newFailures,
    current_interval_ms: newInterval,
  };
}

/**
 * Determine if the poller should skip this cycle.
 * Used for rate limit errors — back off harder.
 */
export function shouldSkipCycle(
  backoffState: PollingBackoffState,
): boolean {
  if (backoffState.last_error_type === 'rate_limit') {
    // Always skip at least one cycle after rate limit
    return backoffState.consecutive_failures > 0;
  }
  // For auth errors, don't retry until credentials change
  if (backoffState.last_error_type === 'auth_error') {
    return true;
  }
  return false;
}

function buildFailResult(
  connectionState: ShopifyConnectionState,
  cursor: string | null,
  startTime: number,
  errors: string[],
  errorType: ShopifyErrorType | null,
): ShopifyPollResult {
  return {
    metrics: [],
    business_inputs: {
      monthly_revenue: null,
      average_order_value: null,
      monthly_transactions: null,
      conversion_rate: null,
      chargeback_rate: null,
      churn_rate: null,
    },
    basis_type: 'heuristic',
    operational_context: {
      cancellation_amplifier: 1.0,
      discount_abuse_amplifier: 1.0,
      economic_leakage_amplifier: 1.0,
      payment_concentration_amplifier: 1.0,
      transaction_failure_amplifier: 1.0,
    },
    orders_fetched: 0,
    cursor,
    duration_ms: Date.now() - startTime,
    errors,
    error_type: errorType,
    connection_state: connectionState,
    value_feedback: null,
    initial_sync_complete: false,
    checkout_metrics: null,
    customer_metrics: null,
    product_metrics: null,
    inventory_metrics: null,
  };
}
