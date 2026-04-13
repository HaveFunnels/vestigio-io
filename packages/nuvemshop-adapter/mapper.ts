import {
  NuvemshopStoreMetrics,
  NuvemshopCouponMetrics,
  NuvemshopShippingMetrics,
  NuvemshopChannelMetrics,
} from './types';
import { BusinessInputs } from '../../packages/impact/types';

// ──────────────────────────────────────────────
// Nuvemshop → BusinessInputs Mapper
//
// Translates Nuvemshop store metrics into the
// BusinessInputs format used by the impact engine.
//
// Also computes operational context signals that
// amplify or dampen specific finding categories.
// ──────────────────────────────────────────────

/**
 * Map Nuvemshop metrics to BusinessInputs for impact estimation.
 * Uses the 30d window as primary (most stable baseline).
 */
export function mapToBusinessInputs(
  metrics: NuvemshopStoreMetrics[],
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
    conversion_rate: null, // not available from Nuvemshop API
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

/**
 * Operational context derived from Nuvemshop metrics.
 * Used to amplify/dampen impact estimation.
 */
export interface OperationalContext {
  cancellation_amplifier: number;
  discount_abuse_amplifier: number;
  economic_leakage_amplifier: number;
  payment_concentration_amplifier: number;
  transaction_failure_amplifier: number;
  /** Nuvemshop-exclusive: fraud signal from cancel_reason=fraud orders */
  fraud_signal_amplifier: number;
  /** Nuvemshop-exclusive: coupon abuse risk from stacking/unlimited coupons */
  coupon_abuse_amplifier: number;
}

/**
 * Compute operational amplifiers from Nuvemshop metrics.
 * Extended with coupon and channel data when available.
 */
export function computeOperationalContext(
  metrics: NuvemshopStoreMetrics[],
  couponMetrics?: NuvemshopCouponMetrics | null,
  channelMetrics?: NuvemshopChannelMetrics | null,
): OperationalContext {
  const primary = metrics.find(m => m.window === '30d') || metrics[0];

  if (!primary) {
    return {
      cancellation_amplifier: 1.0,
      discount_abuse_amplifier: 1.0,
      economic_leakage_amplifier: 1.0,
      payment_concentration_amplifier: 1.0,
      transaction_failure_amplifier: 1.0,
      fraud_signal_amplifier: 1.0,
      coupon_abuse_amplifier: 1.0,
    };
  }

  const cancelRate = primary.order_status.cancellation_rate;
  const cancellationAmp = cancelRate > 0.10 ? 1.3 : cancelRate > 0.05 ? 1.15 : 1.0;

  const discountRate = primary.discounts.discount_usage_rate;
  const discountAmp = discountRate > 0.60 ? 1.25 : discountRate > 0.40 ? 1.1 : 1.0;

  const refundRate = primary.refunds.refund_rate;
  const combinedLeakage = refundRate + discountRate * 0.3;
  const leakageAmp = combinedLeakage > 0.15 ? 1.3 : combinedLeakage > 0.08 ? 1.15 : 1.0;

  const concentration = primary.payment_methods.concentration_ratio;
  const concentrationAmp = concentration > 0.95 ? 1.2 : concentration > 0.90 ? 1.1 : 1.0;

  const txFailRate = primary.transactions.failure_rate;
  const txFailAmp = txFailRate > 0.05 ? 1.3 : txFailRate > 0.03 ? 1.15 : 1.0;

  // Nuvemshop-exclusive: fraud signal from cancel_reason=fraud
  let fraudAmp = 1.0;
  if (channelMetrics) {
    const totalOrders = primary.revenue.order_count;
    const fraudRate = totalOrders > 0 ? channelMetrics.fraud_cancelled_count / totalOrders : 0;
    fraudAmp = fraudRate > 0.03 ? 1.4 : fraudRate > 0.01 ? 1.2 : 1.0;
  }

  // Nuvemshop-exclusive: coupon abuse risk
  let couponAbuseAmp = 1.0;
  if (couponMetrics && couponMetrics.active_coupons > 0) {
    const riskSignals =
      (couponMetrics.stacking_enabled_count > 3 ? 1 : 0) +
      (couponMetrics.unlimited_coupons > 5 ? 1 : 0) +
      (couponMetrics.expired_but_active > 0 ? 1 : 0);
    couponAbuseAmp = riskSignals >= 2 ? 1.3 : riskSignals >= 1 ? 1.15 : 1.0;
  }

  return {
    cancellation_amplifier: cancellationAmp,
    discount_abuse_amplifier: discountAmp,
    economic_leakage_amplifier: leakageAmp,
    payment_concentration_amplifier: concentrationAmp,
    transaction_failure_amplifier: txFailAmp,
    fraud_signal_amplifier: fraudAmp,
    coupon_abuse_amplifier: couponAbuseAmp,
  };
}

/**
 * Build a human-readable value feedback string for UI integration card.
 */
export function buildValueFeedback(metrics: NuvemshopStoreMetrics[]): string | null {
  const m30d = metrics.find(m => m.window === '30d');
  if (!m30d || m30d.revenue.order_count === 0) return null;

  const revenue = m30d.revenue.total.toLocaleString('pt-BR', {
    style: 'currency',
    currency: m30d.revenue.currency,
    maximumFractionDigits: 0,
  });

  return `Analisando ${revenue} em ${m30d.revenue.order_count.toLocaleString()} pedidos (últimos 30 dias)`;
}
