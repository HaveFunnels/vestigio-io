import type { ShopifyPollResult } from '../../workers/shopify/poller';
import type { ShopifySnapshotData } from '../../packages/integrations/types';

// ──────────────────────────────────────────────
// Shopify Poll Result → IntegrationSnapshot Data
//
// Converts the poller's ShopifyPollResult into the
// ShopifySnapshotData shape expected by the engine's
// IntegrationSnapshot<'shopify'> type.
// ──────────────────────────────────────────────

/**
 * Map a ShopifyPollResult into the ShopifySnapshotData shape
 * consumed by `IntegrationSnapshot<'shopify'>`.
 *
 * Uses the 30d metric window as the primary source (most stable
 * baseline). Falls back to 7d, then 90d if 30d is unavailable.
 */
export function mapPollResultToSnapshotData(
  pollResult: ShopifyPollResult,
): ShopifySnapshotData {
  const primary =
    pollResult.metrics.find(m => m.window === '30d') ||
    pollResult.metrics.find(m => m.window === '7d') ||
    pollResult.metrics.find(m => m.window === '90d');

  // Defensive: if no metrics windows are available, return zeroed data
  if (!primary) {
    return buildEmptySnapshotData();
  }

  return {
    revenue: {
      total: primary.revenue.total,
      order_count: primary.revenue.order_count,
      average_order_value: primary.revenue.average_order_value,
      currency: primary.revenue.currency,
    },
    refunds: {
      total_amount: primary.refunds.total_amount,
      refund_count: primary.refunds.refund_count,
      refund_rate: primary.refunds.refund_rate,
    },
    transactions: {
      total: primary.transactions.total,
      successful: primary.transactions.successful,
      failed: primary.transactions.failed,
      failure_rate: primary.transactions.failure_rate,
    },
    order_status: {
      cancellation_rate: primary.order_status.cancellation_rate,
      fulfilled_rate: (primary.order_status.fulfilled + primary.order_status.unfulfilled) > 0
        ? primary.order_status.fulfilled / (primary.order_status.fulfilled + primary.order_status.unfulfilled)
        : 0,
    },
    discounts: {
      discount_usage_rate: primary.discounts.discount_usage_rate,
      total_discount_amount: primary.discounts.total_discount_amount,
    },
    payment_methods: {
      concentration_ratio: primary.payment_methods.concentration_ratio,
      methods: primary.payment_methods.methods.map(m => ({
        gateway: m.gateway,
        count: m.count,
        failure_count: m.failure_count,
      })),
    },
    // Extended metrics — null when poller didn't return them
    abandoned_checkouts: pollResult.checkout_metrics
      ? {
          count: pollResult.checkout_metrics.abandonment_count,
          recovery_rate: pollResult.checkout_metrics.recovery_rate,
          total_value: pollResult.checkout_metrics.total_abandoned_value,
        }
      : null,
    customers: pollResult.customer_metrics
      ? {
          total: pollResult.customer_metrics.total_customers,
          repeat_rate: pollResult.customer_metrics.repeat_rate,
          new_vs_returning_ratio: pollResult.customer_metrics.new_vs_returning_ratio,
          avg_lifetime_value: pollResult.customer_metrics.avg_lifetime_value,
        }
      : null,
    products: pollResult.product_metrics
      ? {
          total: pollResult.product_metrics.total_products,
          never_sold_30d: pollResult.product_metrics.never_sold_30d,
          top_by_revenue: pollResult.product_metrics.top_by_revenue.map(p => ({
            title: p.title,
            revenue: p.revenue,
          })),
        }
      : null,
    inventory: pollResult.inventory_metrics
      ? {
          out_of_stock_promoted: pollResult.inventory_metrics.out_of_stock_promoted,
        }
      : null,
  };
}

function buildEmptySnapshotData(): ShopifySnapshotData {
  return {
    revenue: { total: 0, order_count: 0, average_order_value: 0, currency: 'USD' },
    refunds: { total_amount: 0, refund_count: 0, refund_rate: 0 },
    transactions: { total: 0, successful: 0, failed: 0, failure_rate: 0 },
    order_status: { cancellation_rate: 0, fulfilled_rate: 0 },
    discounts: { discount_usage_rate: 0, total_discount_amount: 0 },
    payment_methods: { concentration_ratio: 0, methods: [] },
    abandoned_checkouts: null,
    customers: null,
    products: null,
    inventory: null,
  };
}
