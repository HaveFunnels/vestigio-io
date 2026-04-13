import type { NuvemshopPollResult } from '../../workers/nuvemshop/poller';
import type { NuvemshopSnapshotData } from '../../packages/integrations/types';

// ──────────────────────────────────────────────
// Nuvemshop Poll Result → IntegrationSnapshot Data
//
// Converts the poller's NuvemshopPollResult into the
// NuvemshopSnapshotData shape expected by the engine's
// IntegrationSnapshot<'nuvemshop'> type.
// ──────────────────────────────────────────────

/**
 * Map a NuvemshopPollResult into the NuvemshopSnapshotData shape
 * consumed by `IntegrationSnapshot<'nuvemshop'>`.
 */
export function mapPollResultToSnapshotData(
  pollResult: NuvemshopPollResult,
): NuvemshopSnapshotData {
  const primary =
    pollResult.metrics.find(m => m.window === '30d') ||
    pollResult.metrics.find(m => m.window === '7d') ||
    pollResult.metrics.find(m => m.window === '90d');

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
    // Nuvemshop doesn't have an abandoned checkout API — always null
    abandoned_checkouts: null,
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
    // No inventory levels API in Nuvemshop (stock is on variant)
    inventory: null,
  };
}

function buildEmptySnapshotData(): NuvemshopSnapshotData {
  return {
    revenue: { total: 0, order_count: 0, average_order_value: 0, currency: 'BRL' },
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
