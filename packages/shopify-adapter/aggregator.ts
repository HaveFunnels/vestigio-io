import {
  ShopifyRawOrder,
  ShopifyStoreMetrics,
  MetricsWindow,
  ShopifyCheckout,
  ShopifyCheckoutMetrics,
  ShopifyCustomer,
  ShopifyCustomerMetrics,
  ShopifyProduct,
  ShopifyProductMetrics,
  ShopifyInventoryLevel,
  ShopifyInventoryMetrics,
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

// ──────────────────────────────────────────────
// Phase 4A.2: Additional aggregation functions
// Checkouts, Customers, Products, Inventory
// ──────────────────────────────────────────────

/**
 * Aggregate abandoned checkouts into metrics.
 * Filters to checkouts within the specified window.
 */
export function aggregateCheckouts(
  checkouts: ShopifyCheckout[],
  windowDays: number,
): ShopifyCheckoutMetrics {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const filtered = checkouts.filter(c => new Date(c.created_at) >= cutoff);

  const total = filtered.length;
  const completed = filtered.filter(c => c.completed_at !== null).length;
  const abandoned = filtered.filter(c => c.completed_at === null);

  let totalAbandonedValue = 0;
  for (const c of abandoned) {
    totalAbandonedValue += parseFloat(c.total_price) || 0;
  }

  return {
    abandonment_count: abandoned.length,
    recovery_rate: round4(total > 0 ? completed / total : 0),
    total_abandoned_value: round2(totalAbandonedValue),
  };
}

/**
 * Aggregate customers into metrics.
 */
export function aggregateCustomers(
  customers: ShopifyCustomer[],
): ShopifyCustomerMetrics {
  const total = customers.length;
  if (total === 0) {
    return {
      total_customers: 0,
      repeat_rate: 0,
      new_vs_returning_ratio: 0,
      avg_lifetime_value: 0,
    };
  }

  const returning = customers.filter(c => c.orders_count > 1).length;
  const newCustomers = total - returning;

  let totalSpent = 0;
  for (const c of customers) {
    totalSpent += parseFloat(c.total_spent) || 0;
  }

  return {
    total_customers: total,
    repeat_rate: round4(returning / total),
    new_vs_returning_ratio: round4(returning > 0 ? newCustomers / returning : newCustomers),
    avg_lifetime_value: round2(totalSpent / total),
  };
}

/**
 * Aggregate products cross-referenced with order line items.
 * Identifies products never sold in 30d and top revenue products.
 */
export function aggregateProducts(
  products: ShopifyProduct[],
  orderLineItems: { product_id: number; quantity: number; total: number }[],
): ShopifyProductMetrics {
  const totalProducts = products.length;

  // Build set of products that had sales
  const soldProductIds = new Set(orderLineItems.map(li => li.product_id));

  // Products with no sales in the provided line items (assumed 30d)
  const neverSold = products.filter(p => !soldProductIds.has(p.id)).length;

  // Revenue per product from line items
  const revenueByProduct = new Map<number, number>();
  for (const li of orderLineItems) {
    revenueByProduct.set(li.product_id, (revenueByProduct.get(li.product_id) || 0) + li.total);
  }

  // Top products by revenue
  const topByRevenue = Array.from(revenueByProduct.entries())
    .map(([productId, revenue]) => {
      const product = products.find(p => p.id === productId);
      return { title: product?.title || `Product #${productId}`, revenue: round2(revenue) };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    total_products: totalProducts,
    never_sold_30d: neverSold,
    top_by_revenue: topByRevenue,
  };
}

/**
 * Aggregate inventory levels to detect out-of-stock promoted products.
 * Promoted product IDs come from crawled pages (externally provided).
 */
export function aggregateInventory(
  products: ShopifyProduct[],
  levels: ShopifyInventoryLevel[],
  promotedProductIds: number[],
): ShopifyInventoryMetrics {
  // Build a map of inventory_item_id -> available quantity
  const availableMap = new Map<number, number>();
  for (const level of levels) {
    // Sum available across locations for same item
    const current = availableMap.get(level.inventory_item_id) || 0;
    availableMap.set(level.inventory_item_id, current + level.available);
  }

  // For each promoted product, check if any variant is out of stock
  const promotedSet = new Set(promotedProductIds);
  let outOfStockPromoted = 0;

  for (const product of products) {
    if (!promotedSet.has(product.id)) continue;

    // A product is considered out of stock if ALL variants have 0 or less available
    const allOutOfStock = product.variants.every(v => {
      const available = availableMap.get(v.id) ?? v.inventory_quantity;
      return available <= 0;
    });

    if (allOutOfStock) outOfStockPromoted++;
  }

  return {
    out_of_stock_promoted: outOfStockPromoted,
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
