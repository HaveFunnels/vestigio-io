import {
  ShopifyRawOrder,
  ShopifyStoreMetrics,
  MetricsWindow,
} from './types';

// ──────────────────────────────────────────────
// Shopify Data Aggregator (Phase 4A.1 Extended)
//
// Transforms raw Shopify orders into compact
// time-window summaries for evidence pipeline.
//
// Aggregates: revenue, refunds, transactions,
// traffic, order status, discounts, payment methods.
//
// Does NOT mirror Shopify. Produces only what
// Vestigio needs for impact estimation and
// finding enrichment.
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
  orders: ShopifyRawOrder[],
  windows: MetricsWindow[],
): ShopifyStoreMetrics[] {
  const now = new Date();
  return windows.map(window => aggregateWindow(orders, window, now));
}

function aggregateWindow(
  allOrders: ShopifyRawOrder[],
  window: MetricsWindow,
  now: Date,
): ShopifyStoreMetrics {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000);
  const orders = allOrders.filter(o => new Date(o.created_at) >= cutoff);
  const orderCount = orders.length;

  // ── Revenue ──
  let totalRevenue = 0;
  let currency = 'USD';
  for (const o of orders) {
    totalRevenue += parseFloat(o.total_price) || 0;
    if (o.currency) currency = o.currency;
  }
  const aov = orderCount > 0 ? totalRevenue / orderCount : 0;

  // ── Refunds ──
  let totalRefundAmount = 0;
  let refundCount = 0;
  for (const o of orders) {
    if (o.refunds && o.refunds.length > 0) {
      refundCount += o.refunds.length;
      for (const r of o.refunds) {
        for (const t of r.transactions || []) {
          totalRefundAmount += parseFloat(t.amount) || 0;
        }
      }
    }
  }

  // ── Transactions ──
  let totalTx = 0;
  let successTx = 0;
  let failedTx = 0;
  for (const o of orders) {
    for (const tx of o.transactions || []) {
      if (tx.kind === 'sale' || tx.kind === 'capture') {
        totalTx++;
        if (tx.status === 'success') successTx++;
        else if (tx.status === 'failure' || tx.status === 'error') failedTx++;
      }
    }
  }

  // ── Traffic ──
  const landingPages = new Map<string, number>();
  const referrers = new Map<string, number>();
  for (const o of orders) {
    if (o.landing_site) {
      const normalized = normalizeLandingPage(o.landing_site);
      landingPages.set(normalized, (landingPages.get(normalized) || 0) + 1);
    }
    if (o.referring_site) {
      const source = normalizeReferrer(o.referring_site);
      referrers.set(source, (referrers.get(source) || 0) + 1);
    }
  }

  // ── Order Status Breakdown (Phase 4A.1) ──
  let paid = 0, pending = 0, refunded = 0, voided = 0, cancelled = 0;
  let fulfilled = 0, unfulfilled = 0;
  for (const o of orders) {
    switch (o.financial_status) {
      case 'paid': paid++; break;
      case 'pending': case 'authorized': pending++; break;
      case 'refunded': case 'partially_refunded': refunded++; break;
      case 'voided': voided++; break;
      default: paid++; // treat unknown as paid
    }
    if (o.cancelled_at) cancelled++;
    if (o.fulfillment_status === 'fulfilled') fulfilled++;
    else unfulfilled++;
  }

  // ── Discount Usage (Phase 4A.1) ──
  let ordersWithDiscount = 0;
  let totalDiscountAmount = 0;
  for (const o of orders) {
    const discountAmt = parseFloat(o.total_discounts) || 0;
    if (discountAmt > 0 || (o.discount_codes && o.discount_codes.length > 0)) {
      ordersWithDiscount++;
      totalDiscountAmount += discountAmt;
    }
  }

  // ── Payment Method Breakdown (Phase 4A.1) ──
  const gatewayMap = new Map<string, { count: number; failures: number }>();
  for (const o of orders) {
    const gw = o.gateway || 'unknown';
    const entry = gatewayMap.get(gw) || { count: 0, failures: 0 };
    entry.count++;
    // Check if any transaction for this order failed
    const hasFailed = (o.transactions || []).some(
      tx => (tx.kind === 'sale' || tx.kind === 'capture') && (tx.status === 'failure' || tx.status === 'error'),
    );
    if (hasFailed) entry.failures++;
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
    traffic: {
      top_landing_pages: topLandingPages(landingPages, 10),
      top_referrers: topReferrers(referrers, 10),
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
      methods: methods.slice(0, 10), // top 10
      concentration_ratio: round4(concentrationRatio),
    },
    computed_at: new Date(),
  };
}

// ── Helpers ──

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

function normalizeLandingPage(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://placeholder${url}`);
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return url.slice(0, 100);
  }
}

function normalizeReferrer(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url.slice(0, 100);
  }
}

function topLandingPages(map: Map<string, number>, limit: number): { url: string; order_count: number }[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url, count]) => ({ url, order_count: count }));
}

function topReferrers(map: Map<string, number>, limit: number): { source: string; order_count: number }[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([source, count]) => ({ source, order_count: count }));
}
