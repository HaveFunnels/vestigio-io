import {
  NuvemshopRawOrder,
  NuvemshopStoreMetrics,
  MetricsWindow,
  NuvemshopCustomer,
  NuvemshopCustomerMetrics,
  NuvemshopProduct,
  NuvemshopProductMetrics,
} from './types';

// ──────────────────────────────────────────────
// Nuvemshop Data Aggregator
//
// Transforms raw Nuvemshop orders into compact
// time-window summaries for evidence pipeline.
//
// Aggregates: revenue, refunds, transactions,
// order status, discounts, payment methods.
// ──────────────────────────────────────────────

const WINDOW_DAYS: Record<MetricsWindow, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * Aggregate raw orders into time-window metrics.
 */
export function aggregateOrdersIntoMetrics(
  orders: NuvemshopRawOrder[],
  windows: MetricsWindow[],
): NuvemshopStoreMetrics[] {
  const now = new Date();
  return windows.map(window => aggregateWindow(orders, window, now));
}

function aggregateWindow(
  allOrders: NuvemshopRawOrder[],
  window: MetricsWindow,
  now: Date,
): NuvemshopStoreMetrics {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);
  const orders = allOrders.filter(o => new Date(o.created_at) >= cutoff);
  const orderCount = orders.length;

  // ── Revenue ──
  let totalRevenue = 0;
  let currency = 'BRL';
  for (const o of orders) {
    // Only count paid orders for revenue
    if (o.payment_status === 'paid' || o.payment_status === 'partially_refunded') {
      totalRevenue += parseFloat(o.total) || 0;
    }
    if (o.currency) currency = o.currency;
  }
  const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

  // ── Refunds ──
  let refundCount = 0;
  let totalRefundAmount = 0;
  for (const o of orders) {
    if (o.payment_status === 'refunded' || o.payment_status === 'partially_refunded') {
      refundCount++;
      // For fully refunded orders, the refund amount is the full order total
      if (o.payment_status === 'refunded') {
        totalRefundAmount += parseFloat(o.total) || 0;
      }
    }
  }

  // ── Transactions (inferred from payment_status) ──
  // Nuvemshop doesn't expose individual transactions in the orders list,
  // so we infer success/failure from payment_status.
  let totalTx = orderCount;
  let successTx = 0;
  let failedTx = 0;
  for (const o of orders) {
    if (o.payment_status === 'paid' || o.payment_status === 'partially_paid' || o.payment_status === 'partially_refunded') {
      successTx++;
    } else if (o.payment_status === 'voided' || o.payment_status === 'abandoned') {
      failedTx++;
    }
  }

  // ── Order Status Breakdown ──
  let paid = 0, pending = 0, refunded = 0, voided = 0, cancelled = 0;
  let fulfilled = 0, unfulfilled = 0;
  for (const o of orders) {
    switch (o.payment_status) {
      case 'paid': case 'partially_paid': paid++; break;
      case 'pending': case 'authorized': pending++; break;
      case 'refunded': case 'partially_refunded': refunded++; break;
      case 'voided': voided++; break;
      default: pending++;
    }
    if (o.status === 'cancelled' || o.cancelled_at) cancelled++;
    if (o.shipping_status === 'shipped' || o.shipping_status === 'delivered') fulfilled++;
    else unfulfilled++;
  }

  // ── Discount Usage ──
  let ordersWithDiscount = 0;
  let totalDiscountAmount = 0;
  for (const o of orders) {
    const discountAmt = parseFloat(o.discount) || 0;
    if (discountAmt > 0) {
      ordersWithDiscount++;
      totalDiscountAmount += discountAmt;
    }
  }

  // ── Payment Method Breakdown ──
  const gatewayMap = new Map<string, { count: number; failures: number }>();
  for (const o of orders) {
    const gw = o.gateway || 'unknown';
    const entry = gatewayMap.get(gw) || { count: 0, failures: 0 };
    entry.count++;
    if (o.payment_status === 'voided' || o.payment_status === 'abandoned') {
      entry.failures++;
    }
    gatewayMap.set(gw, entry);
  }
  const methods = Array.from(gatewayMap.entries())
    .map(([gateway, data]) => ({ gateway, count: data.count, failure_count: data.failures }))
    .sort((a, b) => b.count - a.count);
  const topMethodCount = methods.length > 0 ? methods[0].count : 0;
  const concentrationRatio = orderCount > 0 ? topMethodCount / orderCount : 0;

  return {
    window,
    revenue: {
      total: round2(totalRevenue),
      currency,
      order_count: orderCount,
      average_order_value: round2(aov),
    },
    refunds: {
      total_amount: round2(totalRefundAmount),
      refund_count: refundCount,
      refund_rate: round4(orderCount > 0 ? refundCount / orderCount : 0),
    },
    transactions: {
      total: totalTx,
      successful: successTx,
      failed: failedTx,
      failure_rate: round4(totalTx > 0 ? failedTx / totalTx : 0),
    },
    order_status: {
      paid,
      pending,
      refunded,
      voided,
      cancelled,
      fulfilled,
      unfulfilled,
      cancellation_rate: round4(orderCount > 0 ? cancelled / orderCount : 0),
    },
    discounts: {
      orders_with_discount: ordersWithDiscount,
      discount_usage_rate: round4(orderCount > 0 ? ordersWithDiscount / orderCount : 0),
      total_discount_amount: round2(totalDiscountAmount),
      average_discount_per_order: round2(ordersWithDiscount > 0 ? totalDiscountAmount / ordersWithDiscount : 0),
    },
    payment_methods: {
      methods: methods.slice(0, 10),
      concentration_ratio: round4(concentrationRatio),
    },
    computed_at: new Date(),
  };
}

/**
 * Aggregate customers into metrics.
 * Nuvemshop customers have total_spent and last_order_id fields.
 */
export function aggregateCustomers(
  customers: NuvemshopCustomer[],
): NuvemshopCustomerMetrics {
  const total = customers.length;
  if (total === 0) {
    return {
      total_customers: 0,
      repeat_rate: 0,
      new_vs_returning_ratio: 0,
      avg_lifetime_value: 0,
    };
  }

  // Nuvemshop doesn't give orders_count directly on the customer list,
  // but we can infer returning customers from total_spent > 0 + last_order_id
  // A more accurate approach: customers with total_spent significantly above
  // average AOV are likely repeat purchasers.
  const customersWithOrders = customers.filter(c => c.last_order_id !== null);
  const returning = customersWithOrders.length;
  const newCustomers = total - returning;

  let totalSpent = 0;
  for (const c of customers) {
    totalSpent += parseFloat(c.total_spent) || 0;
  }

  return {
    total_customers: total,
    repeat_rate: round4(returning / total),
    new_vs_returning_ratio: round4(returning > 0 ? newCustomers / returning : newCustomers),
    avg_lifetime_value: round2(total > 0 ? totalSpent / total : 0),
  };
}

/**
 * Aggregate products cross-referenced with order line items.
 */
export function aggregateProducts(
  products: NuvemshopProduct[],
  orderLineItems: { product_id: number; quantity: number; total: number }[],
): NuvemshopProductMetrics {
  const totalProducts = products.length;

  const soldProductIds = new Set(orderLineItems.map(li => li.product_id));
  const neverSold = products.filter(p => !soldProductIds.has(p.id)).length;

  const revenueByProduct = new Map<number, number>();
  for (const li of orderLineItems) {
    revenueByProduct.set(li.product_id, (revenueByProduct.get(li.product_id) || 0) + li.total);
  }

  const topByRevenue = Array.from(revenueByProduct.entries())
    .map(([productId, revenue]) => {
      const product = products.find(p => p.id === productId);
      const title = product?.name?.pt || product?.name?.en || Object.values(product?.name || {})[0] || `Product #${productId}`;
      return { title: String(title), revenue: round2(revenue) };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    total_products: totalProducts,
    never_sold_30d: neverSold,
    top_by_revenue: topByRevenue,
  };
}

// ── Helpers ──

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
