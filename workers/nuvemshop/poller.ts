import {
  NuvemshopCredentials,
  NuvemshopStoreMetrics,
  NuvemshopPollingConfig,
  NuvemshopConnectionState,
  NuvemshopErrorType,
  NuvemshopCustomerMetrics,
  NuvemshopProductMetrics,
  NuvemshopCouponMetrics,
  NuvemshopShippingMetrics,
  NuvemshopChannelMetrics,
  DEFAULT_POLLING_CONFIG,
} from '../../packages/nuvemshop-adapter';
import {
  fetchOrders,
  fetchCustomers,
  fetchProducts,
  fetchCoupons,
  verifyConnection,
} from '../../packages/nuvemshop-adapter/client';
import {
  aggregateOrdersIntoMetrics,
  aggregateCustomers,
  aggregateProducts,
  aggregateCoupons,
  aggregateShipping,
  aggregateChannels,
} from '../../packages/nuvemshop-adapter/aggregator';
import {
  mapToBusinessInputs,
  determineBasisType,
  computeOperationalContext,
  buildValueFeedback,
  OperationalContext,
} from '../../packages/nuvemshop-adapter/mapper';
import { BusinessInputs } from '../../packages/impact/types';

// ──────────────────────────────────────────────
// Nuvemshop Poller
//
// Production-grade polling with:
// - Adaptive backoff on failure
// - Error classification for UI clarity
// - Value feedback for integration card
// - Operational context for impact amplification
// - Graceful degradation (never blocks pipeline)
//
// Read-only. No writes. No mutations.
// ──────────────────────────────────────────────

export interface NuvemshopPollResult {
  metrics: NuvemshopStoreMetrics[];
  business_inputs: BusinessInputs;
  basis_type: 'data_driven' | 'mixed' | 'heuristic';
  operational_context: OperationalContext;
  orders_fetched: number;
  cursor: string | null;
  duration_ms: number;
  errors: string[];
  error_type: NuvemshopErrorType | null;
  connection_state: NuvemshopConnectionState;
  value_feedback: string | null;
  initial_sync_complete: boolean;
  customer_metrics: NuvemshopCustomerMetrics | null;
  product_metrics: NuvemshopProductMetrics | null;
  coupon_metrics: NuvemshopCouponMetrics | null;
  shipping_metrics: NuvemshopShippingMetrics | null;
  channel_metrics: NuvemshopChannelMetrics | null;
}

/**
 * Run a single poll cycle.
 */
export async function pollNuvemshopData(
  credentials: NuvemshopCredentials,
  config: Partial<NuvemshopPollingConfig> = {},
): Promise<NuvemshopPollResult> {
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

  // Step 3: Fetch customers, products, and coupons sequentially (respect 2 req/s rate limit)
  const customerResult = await fetchCustomers(credentials, since).catch(err => ({
    customers: [] as any[],
    errors: [err instanceof Error ? err.message : String(err)],
  }));
  const productResult = await fetchProducts(credentials).catch(err => ({
    products: [] as any[],
    errors: [err instanceof Error ? err.message : String(err)],
  }));
  const couponResult = await fetchCoupons(credentials).catch(err => ({
    coupons: [] as any[],
    errors: [err instanceof Error ? err.message : String(err)],
  }));

  errors.push(...customerResult.errors);
  errors.push(...productResult.errors);
  errors.push(...couponResult.errors);

  // Step 4: Aggregate orders
  const metrics = aggregateOrdersIntoMetrics(orders, pollingConfig.windows);

  // Step 5: Aggregate extended metrics
  const customerMetrics = customerResult.customers.length > 0
    ? aggregateCustomers(customerResult.customers)
    : null;

  // Extract order line items for product aggregation
  const orderLineItems = orders.flatMap(o =>
    o.products.map(p => ({
      product_id: p.product_id,
      quantity: p.quantity,
      total: parseFloat(p.price) * p.quantity,
    }))
  );

  const productMetrics = productResult.products.length > 0
    ? aggregateProducts(productResult.products, orderLineItems)
    : null;

  // Step 5b: Aggregate extended metrics (coupons, shipping, channels)
  const couponMetrics = couponResult.coupons.length > 0
    ? aggregateCoupons(couponResult.coupons)
    : null;

  const shippingMetrics = orders.length > 0
    ? aggregateShipping(orders)
    : null;

  const channelMetrics = orders.length > 0
    ? aggregateChannels(orders)
    : null;

  // Step 6: Map to BusinessInputs
  const businessInputs = mapToBusinessInputs(metrics);
  const basisType = determineBasisType(businessInputs);

  // Step 7: Compute operational context (with Nuvemshop-exclusive enrichment)
  const operationalContext = computeOperationalContext(metrics, couponMetrics, channelMetrics);

  // Step 8: Build value feedback for UI
  const valueFeedback = buildValueFeedback(metrics);

  // Step 9: Update connection state with summary
  const m30d = metrics.find(m => m.window === '30d');
  connectionState.initial_sync_complete = true;
  connectionState.last_successful_sync_at = new Date();
  connectionState.summary_30d = m30d ? {
    revenue: m30d.revenue.total,
    order_count: m30d.revenue.order_count,
    currency: m30d.revenue.currency,
  } : null;

  // Step 10: Update cursor
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
    customer_metrics: customerMetrics,
    product_metrics: productMetrics,
    coupon_metrics: couponMetrics,
    shipping_metrics: shippingMetrics,
    channel_metrics: channelMetrics,
  };
}

function buildFailResult(
  connectionState: NuvemshopConnectionState,
  cursor: string | null,
  startTime: number,
  errors: string[],
  errorType: NuvemshopErrorType | null,
): NuvemshopPollResult {
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
      // Nuvemshop-specific amplifiers — also default to neutral when we
      // can't compute them yet (empty poll result / connection error).
      fraud_signal_amplifier: 1.0,
      coupon_abuse_amplifier: 1.0,
    },
    orders_fetched: 0,
    cursor,
    duration_ms: Date.now() - startTime,
    errors,
    error_type: errorType,
    connection_state: connectionState,
    value_feedback: null,
    initial_sync_complete: false,
    customer_metrics: null,
    product_metrics: null,
    coupon_metrics: null,
    shipping_metrics: null,
    channel_metrics: null,
  };
}
