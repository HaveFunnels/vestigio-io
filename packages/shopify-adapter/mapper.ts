import { ShopifyStoreMetrics } from './types';
import { BusinessInputs } from '../../packages/impact/types';

// ──────────────────────────────────────────────
// Shopify → BusinessInputs Mapper (Phase 4A.1 Extended)
//
// Translates Shopify store metrics into the
// BusinessInputs format used by the impact engine.
//
// Also computes operational context signals that
// amplify or dampen specific finding categories
// without creating new findings.
// ──────────────────────────────────────────────

/**
 * Map Shopify metrics to BusinessInputs for impact estimation.
 * Uses the 30d window as primary (most stable baseline).
 */
export function mapToBusinessInputs(
  metrics: ShopifyStoreMetrics[],
): BusinessInputs {
  const primary = metrics.find(m => m.window === '30d')
    || metrics.find(m => m.window === '7d')
    || metrics.find(m => m.window === '90d');

  if (!primary) {
    return {
      monthly_revenue: null,
      average_order_value: null,
      monthly_transactions: null,
      conversion_rate: null,
      chargeback_rate: null,
      churn_rate: null,
    };
  }

  const daysInWindow = primary.window === '7d' ? 7 : primary.window === '30d' ? 30 : 90;
  const monthlyMultiplier = 30 / daysInWindow;

  const monthlyRevenue = Math.round(primary.revenue.total * monthlyMultiplier);
  const monthlyTransactions = Math.round(primary.revenue.order_count * monthlyMultiplier);

  // Derive chargeback rate from refund data (proxy)
  const chargebackRate = primary.refunds.refund_rate > 0
    ? Math.min(primary.refunds.refund_rate, 0.10)
    : null;

  return {
    monthly_revenue: monthlyRevenue,
    average_order_value: primary.revenue.average_order_value,
    monthly_transactions: monthlyTransactions,
    conversion_rate: null, // not available from Admin API
    chargeback_rate: chargebackRate,
    churn_rate: null, // not derivable from order data
  };
}

/**
 * Determine the basis_type for impact estimation based on data quality.
 */
export function determineBasisType(
  inputs: BusinessInputs,
): 'data_driven' | 'mixed' | 'heuristic' {
  const realFields = [
    inputs.monthly_revenue,
    inputs.average_order_value,
    inputs.monthly_transactions,
  ].filter(v => v !== null).length;

  if (realFields >= 3) return 'data_driven';
  if (realFields >= 1) return 'mixed';
  return 'heuristic';
}

/**
 * Compute a confidence boost when real data is available.
 */
export function computeDataConfidenceBoost(
  inputs: BusinessInputs,
): number {
  const basisType = determineBasisType(inputs);
  switch (basisType) {
    case 'data_driven': return 1.3;
    case 'mixed': return 1.15;
    case 'heuristic': return 1.0;
  }
}

// ──────────────────────────────────────────────
// Phase 4A.1: Operational Context Amplifiers
//
// These signals do NOT create new findings.
// They amplify or dampen the severity of
// existing impact estimates based on real
// operational data from Shopify.
// ──────────────────────────────────────────────

/**
 * Operational context derived from Shopify metrics.
 * Used to amplify/dampen impact estimation for specific finding categories.
 */
export interface OperationalContext {
  /** High cancellation rate amplifies checkout-related findings */
  cancellation_amplifier: number;       // 1.0 = neutral, > 1.0 = amplify
  /** High discount usage amplifies pricing integrity / abuse findings */
  discount_abuse_amplifier: number;     // 1.0 = neutral, > 1.0 = amplify
  /** High refund + high discount amplifies economic leakage findings */
  economic_leakage_amplifier: number;   // 1.0 = neutral, > 1.0 = amplify
  /** High payment method concentration amplifies dependency risk findings */
  payment_concentration_amplifier: number; // 1.0 = neutral, > 1.0 = amplify
  /** High transaction failure rate amplifies checkout reliability findings */
  transaction_failure_amplifier: number; // 1.0 = neutral, > 1.0 = amplify
}

/**
 * Compute operational amplifiers from Shopify metrics.
 * Returns neutral (1.0) for all amplifiers if no concerning patterns.
 */
export function computeOperationalContext(
  metrics: ShopifyStoreMetrics[],
): OperationalContext {
  const primary = metrics.find(m => m.window === '30d') || metrics[0];

  if (!primary) {
    return {
      cancellation_amplifier: 1.0,
      discount_abuse_amplifier: 1.0,
      economic_leakage_amplifier: 1.0,
      payment_concentration_amplifier: 1.0,
      transaction_failure_amplifier: 1.0,
    };
  }

  // Cancellation: > 5% = moderate concern, > 10% = high
  const cancelRate = primary.order_status.cancellation_rate;
  const cancellationAmp = cancelRate > 0.10 ? 1.3 : cancelRate > 0.05 ? 1.15 : 1.0;

  // Discount usage: > 40% = moderate concern, > 60% = high
  const discountRate = primary.discounts.discount_usage_rate;
  const discountAmp = discountRate > 0.60 ? 1.25 : discountRate > 0.40 ? 1.1 : 1.0;

  // Economic leakage: refund rate + discount rate compound
  const refundRate = primary.refunds.refund_rate;
  const combinedLeakage = refundRate + discountRate * 0.3; // discount contributes at reduced weight
  const leakageAmp = combinedLeakage > 0.15 ? 1.3 : combinedLeakage > 0.08 ? 1.15 : 1.0;

  // Payment concentration: > 90% on one method = concerning
  const concentration = primary.payment_methods.concentration_ratio;
  const concentrationAmp = concentration > 0.95 ? 1.2 : concentration > 0.90 ? 1.1 : 1.0;

  // Transaction failures: > 3% = moderate, > 5% = high
  const txFailRate = primary.transactions.failure_rate;
  const txFailAmp = txFailRate > 0.05 ? 1.3 : txFailRate > 0.03 ? 1.15 : 1.0;

  return {
    cancellation_amplifier: cancellationAmp,
    discount_abuse_amplifier: discountAmp,
    economic_leakage_amplifier: leakageAmp,
    payment_concentration_amplifier: concentrationAmp,
    transaction_failure_amplifier: txFailAmp,
  };
}

/**
 * Build a human-readable value feedback string for UI integration card.
 * Example: "Analyzing $124,532 across 1,284 orders (last 30 days)"
 */
export function buildValueFeedback(metrics: ShopifyStoreMetrics[]): string | null {
  const m30d = metrics.find(m => m.window === '30d');
  if (!m30d || m30d.revenue.order_count === 0) return null;

  const revenue = m30d.revenue.total.toLocaleString('en-US', {
    style: 'currency',
    currency: m30d.revenue.currency,
    maximumFractionDigits: 0,
  });

  return `Analyzing ${revenue} across ${m30d.revenue.order_count.toLocaleString()} orders (last 30 days)`;
}
