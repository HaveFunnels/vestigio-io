// ──────────────────────────────────────────────
// Integration Reconciliation
//
// Merges multiple IntegrationSnapshot[] into:
// - BusinessInputs (existing, unchanged)
// - CommerceContext (extended data)
// - OperationalAmplifiers (existing, unchanged)
// - DataProvenance (tracks which source provided which field)
//
// Revenue source priority:
//   SaaS/subscription → Stripe wins
//   Ecommerce         → Shopify wins
//
// Chargeback rate: Stripe dispute_rate always wins
// over Shopify refund proxy.
// Churn rate: only Stripe provides this.
// ──────────────────────────────────────────────

import { BusinessInputs } from '../impact/types';
import { OperationalAmplifiers } from '../impact/engine';
import { CommerceContext } from './commerce-context';
import {
  IntegrationSnapshot,
  IntegrationProvider,
  ShopifySnapshotData,
  NuvemshopSnapshotData,
} from './types';

export interface DataProvenance {
  monthly_revenue_source: string | null;
  chargeback_rate_source: string | null;
  churn_rate_source: string | null;
  overall_sources: string[];
}

export interface ReconciliationResult {
  business_inputs: BusinessInputs;
  commerce_context: CommerceContext;
  amplifiers: OperationalAmplifiers;
  provenance: DataProvenance;
}

// ──────────────────────────────────────────────
// Main reconciliation entry point
// ──────────────────────────────────────────────

export function reconcileIntegrations(
  snapshots: IntegrationSnapshot[],
  business_model: string, // 'ecommerce' | 'saas' | 'lead_gen' | 'hybrid'
): ReconciliationResult {
  // Find snapshots by provider, preferring 30d window
  const shopify = findSnapshot<'shopify'>(snapshots, 'shopify');
  const nuvemshop = findSnapshot<'nuvemshop'>(snapshots, 'nuvemshop');
  const stripe = findSnapshot<'stripe'>(snapshots, 'stripe');
  const metaAds = findSnapshot<'meta_ads'>(snapshots, 'meta_ads');
  const googleAds = findSnapshot<'google_ads'>(snapshots, 'google_ads');

  // Resolve primary ecommerce source: Shopify wins over Nuvemshop if both present.
  // Both have identical data shapes, so we unify into a single "ecommerce" snapshot.
  const ecommerceSnapshot = shopify || nuvemshop;
  const ecommerceProvider = shopify ? 'shopify' : nuvemshop ? 'nuvemshop' : null;

  const overallSources: string[] = [];
  if (shopify) overallSources.push('shopify');
  if (nuvemshop) overallSources.push('nuvemshop');
  if (stripe) overallSources.push('stripe');
  if (metaAds) overallSources.push('meta_ads');
  if (googleAds) overallSources.push('google_ads');

  const provenance: DataProvenance = {
    monthly_revenue_source: null,
    chargeback_rate_source: null,
    churn_rate_source: null,
    overall_sources: overallSources,
  };

  // ── Build BusinessInputs ──
  const business_inputs = reconcileBusinessInputs(ecommerceSnapshot, ecommerceProvider, stripe, business_model, provenance);

  // ── Build CommerceContext ──
  const commerce_context = reconcileCommerceContext(ecommerceSnapshot, ecommerceProvider, stripe, metaAds, googleAds, overallSources);

  // ── Build OperationalAmplifiers ──
  const amplifiers = reconcileAmplifiers(ecommerceSnapshot, ecommerceProvider, stripe);

  return { business_inputs, commerce_context, amplifiers, provenance };
}

// ──────────────────────────────────────────────
// Internal: find best snapshot for a provider
// ──────────────────────────────────────────────

function findSnapshot<T extends IntegrationProvider>(
  snapshots: IntegrationSnapshot[],
  provider: T,
): IntegrationSnapshot<T> | null {
  const matching = snapshots.filter(s => s.provider === provider) as IntegrationSnapshot<T>[];
  if (matching.length === 0) return null;

  // Prefer 30d, then 7d, then 90d
  return matching.find(s => s.window === '30d')
    || matching.find(s => s.window === '7d')
    || matching.find(s => s.window === '90d')
    || matching[0];
}

// ──────────────────────────────────────────────
// Internal: reconcile BusinessInputs
// ──────────────────────────────────────────────

// EcommerceSnapshot is a unified type covering Shopify and Nuvemshop
// (identical data shapes).
type EcommerceSnapshot = IntegrationSnapshot<'shopify'> | IntegrationSnapshot<'nuvemshop'>;

function reconcileBusinessInputs(
  ecommerce: EcommerceSnapshot | null,
  ecommerceProvider: string | null,
  stripe: IntegrationSnapshot<'stripe'> | null,
  business_model: string,
  provenance: DataProvenance,
): BusinessInputs {
  const result: BusinessInputs = {
    monthly_revenue: null,
    average_order_value: null,
    monthly_transactions: null,
    conversion_rate: null,
    chargeback_rate: null,
    churn_rate: null,
  };

  const isSaas = business_model === 'saas';

  // Monthly revenue: Stripe wins for SaaS, ecommerce source wins for ecommerce
  if (isSaas && stripe) {
    result.monthly_revenue = normalizeToMonthly(stripe.data.revenue.total, stripe.window);
    provenance.monthly_revenue_source = 'stripe';
  } else if (ecommerce) {
    result.monthly_revenue = normalizeToMonthly(ecommerce.data.revenue.total, ecommerce.window);
    provenance.monthly_revenue_source = ecommerceProvider;
  } else if (stripe) {
    result.monthly_revenue = normalizeToMonthly(stripe.data.revenue.total, stripe.window);
    provenance.monthly_revenue_source = 'stripe';
  }

  // AOV and transactions from ecommerce source (order-level granularity)
  if (ecommerce) {
    result.average_order_value = ecommerce.data.revenue.average_order_value;
    result.monthly_transactions = normalizeToMonthly(ecommerce.data.revenue.order_count, ecommerce.window);
  } else if (stripe) {
    result.monthly_transactions = normalizeToMonthly(stripe.data.revenue.charge_count, stripe.window);
  }

  // Chargeback rate: Stripe's real dispute rate always wins over ecommerce refund proxy
  if (stripe) {
    result.chargeback_rate = stripe.data.dispute_rate;
    provenance.chargeback_rate_source = 'stripe';
  } else if (ecommerce) {
    result.chargeback_rate = ecommerce.data.refunds.refund_rate > 0
      ? Math.min(ecommerce.data.refunds.refund_rate, 0.10)
      : null;
    provenance.chargeback_rate_source = ecommerceProvider;
  }

  // Churn rate: only Stripe provides this
  if (stripe && stripe.data.churn_rate !== null) {
    result.churn_rate = stripe.data.churn_rate;
    provenance.churn_rate_source = 'stripe';
  }

  return result;
}

// ──────────────────────────────────────────────
// Internal: reconcile CommerceContext
// ──────────────────────────────────────────────

function reconcileCommerceContext(
  ecommerce: EcommerceSnapshot | null,
  ecommerceProvider: string | null,
  stripe: IntegrationSnapshot<'stripe'> | null,
  metaAds: IntegrationSnapshot<'meta_ads'> | null,
  googleAds: IntegrationSnapshot<'google_ads'> | null,
  sources: string[],
): CommerceContext {
  const context: CommerceContext = {
    // Ecommerce-sourced defaults (Shopify or Nuvemshop)
    abandonment_rate: null,
    abandonment_value_monthly: null,
    repeat_purchase_rate: null,
    new_vs_returning_ratio: null,
    avg_customer_lifetime_value: null,
    total_products: null,
    products_never_sold_30d: null,
    out_of_stock_promoted_count: null,
    top_products_by_revenue: [],
    refund_rate: null,
    discount_usage_rate: null,
    payment_gateway_concentration: null,

    // Stripe-sourced defaults
    mrr: null,
    subscriber_churn_rate: null,
    failed_payment_rate: null,

    // Ad platform defaults
    total_ad_spend_monthly: null,
    ad_spend_by_platform: {},

    // Nuvemshop-exclusive extended data (Wave 7.11)
    coupon_stacking_enabled: null,
    expired_coupons_active: null,
    avg_shipping_days: null,
    fraud_cancelled_rate: null,

    // Meta
    sources,
    basis_type: sources.length === 0 ? 'heuristic' : sources.length >= 2 ? 'data_driven' : 'mixed',
  };

  // Populate from ecommerce source (Shopify or Nuvemshop — identical data shapes)
  if (ecommerce) {
    const sd = ecommerce.data;

    if (sd.abandoned_checkouts) {
      const totalOrders = sd.revenue.order_count + sd.abandoned_checkouts.count;
      context.abandonment_rate = totalOrders > 0
        ? sd.abandoned_checkouts.count / totalOrders
        : null;
      context.abandonment_value_monthly = normalizeToMonthly(sd.abandoned_checkouts.total_value, ecommerce.window);
    }

    if (sd.customers) {
      context.repeat_purchase_rate = sd.customers.repeat_rate;
      context.new_vs_returning_ratio = sd.customers.new_vs_returning_ratio;
      context.avg_customer_lifetime_value = sd.customers.avg_lifetime_value;
    }

    if (sd.products) {
      context.total_products = sd.products.total;
      context.products_never_sold_30d = sd.products.never_sold_30d;
      context.top_products_by_revenue = sd.products.top_by_revenue;
    }

    if (sd.inventory) {
      context.out_of_stock_promoted_count = sd.inventory.out_of_stock_promoted;
    }

    context.refund_rate = sd.refunds.refund_rate;
    context.discount_usage_rate = sd.discounts.discount_usage_rate;
    context.payment_gateway_concentration = sd.payment_methods.concentration_ratio;
  }

  // Populate Nuvemshop-exclusive extended data (Wave 7.11 Bug I)
  if (ecommerce && ecommerceProvider === 'nuvemshop') {
    const nd = ecommerce.data as NuvemshopSnapshotData;

    if (nd.coupons) {
      context.coupon_stacking_enabled = nd.coupons.stacking_enabled_count > 0;
      context.expired_coupons_active = nd.coupons.expired_but_active;
    }

    if (nd.shipping) {
      context.avg_shipping_days = nd.shipping.avg_shipping_days;
    }

    if (nd.channels && nd.revenue.order_count > 0) {
      context.fraud_cancelled_rate = nd.channels.fraud_cancelled_count / nd.revenue.order_count;
    }
  }

  // Populate from Stripe
  if (stripe) {
    context.mrr = stripe.data.mrr;
    context.subscriber_churn_rate = stripe.data.churn_rate;
    context.failed_payment_rate = stripe.data.failed_payment_rate;
  }

  // Populate from ad platforms
  let totalAdSpend = 0;
  if (metaAds) {
    const spend = metaAds.data.ad_spend_30d;
    context.ad_spend_by_platform['meta_ads'] = spend;
    totalAdSpend += spend;
  }
  if (googleAds) {
    const spend = googleAds.data.ad_spend_30d;
    context.ad_spend_by_platform['google_ads'] = spend;
    totalAdSpend += spend;
  }
  if (totalAdSpend > 0) {
    context.total_ad_spend_monthly = totalAdSpend;
  }

  return context;
}

// ──────────────────────────────────────────────
// Internal: reconcile OperationalAmplifiers
//
// Reuses the same thresholds from
// packages/shopify-adapter/mapper.ts computeOperationalContext().
// If both Shopify and Stripe present, use the source
// with higher data quality (Stripe for payment data,
// Shopify for order-level data).
// ──────────────────────────────────────────────

function reconcileAmplifiers(
  ecommerce: EcommerceSnapshot | null,
  ecommerceProvider: string | null,
  stripe: IntegrationSnapshot<'stripe'> | null,
): OperationalAmplifiers {
  const amplifiers: OperationalAmplifiers = {};

  if (!ecommerce && !stripe) return amplifiers;

  if (ecommerce) {
    const sd = ecommerce.data;

    // Cancellation: > 5% = moderate concern, > 10% = high
    const cancelRate = sd.order_status.cancellation_rate;
    amplifiers.cancellation_amplifier = cancelRate > 0.10 ? 1.3 : cancelRate > 0.05 ? 1.15 : 1.0;

    // Discount usage: > 40% = moderate concern, > 60% = high
    const discountRate = sd.discounts.discount_usage_rate;
    amplifiers.discount_abuse_amplifier = discountRate > 0.60 ? 1.25 : discountRate > 0.40 ? 1.1 : 1.0;

    // Economic leakage: refund rate + discount rate compound
    const refundRate = sd.refunds.refund_rate;
    const combinedLeakage = refundRate + discountRate * 0.3;
    amplifiers.economic_leakage_amplifier = combinedLeakage > 0.15 ? 1.3 : combinedLeakage > 0.08 ? 1.15 : 1.0;

    // Payment concentration: > 90% on one method = concerning
    const concentration = sd.payment_methods.concentration_ratio;
    amplifiers.payment_concentration_amplifier = concentration > 0.95 ? 1.2 : concentration > 0.90 ? 1.1 : 1.0;

    // Transaction failures: > 3% = moderate, > 5% = high
    const txFailRate = sd.transactions.failure_rate;
    amplifiers.transaction_failure_amplifier = txFailRate > 0.05 ? 1.3 : txFailRate > 0.03 ? 1.15 : 1.0;
  }

  // Stripe overrides for payment-specific amplifiers (higher data quality)
  if (stripe) {
    // Stripe's failed_payment_rate is more accurate than Shopify's transaction failure rate
    const failRate = stripe.data.failed_payment_rate;
    amplifiers.transaction_failure_amplifier = failRate > 0.05 ? 1.3 : failRate > 0.03 ? 1.15 : 1.0;

    // Stripe's dispute_rate upgrades the economic leakage signal
    const disputeRate = stripe.data.dispute_rate;
    if (disputeRate > 0.01) {
      // High dispute rate compounds with existing leakage amplifier
      const existing = amplifiers.economic_leakage_amplifier ?? 1.0;
      amplifiers.economic_leakage_amplifier = Math.min(1.5, existing * (1 + disputeRate * 5));
    }
  }

  return amplifiers;
}

// ──────────────────────────────────────────────
// Internal: normalize a value from a window to monthly
// ──────────────────────────────────────────────

function normalizeToMonthly(value: number, window: '7d' | '30d' | '90d'): number {
  const daysInWindow = window === '7d' ? 7 : window === '30d' ? 30 : 90;
  const monthlyMultiplier = 30 / daysInWindow;
  return Math.round(value * monthlyMultiplier);
}
