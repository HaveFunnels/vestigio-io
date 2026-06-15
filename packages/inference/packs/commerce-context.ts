// ──────────────────────────────────────────────
// Pack: commerce_context (Phase 4A)
//
// Inferences powered by real Shopify data via CommerceContext.
// Includes: checkout abandonment, promoted product OOS, refund
// erosion, payment gateway concentration, discount abuse, ad-spend
// concentration, ad conversion visibility, ad-creative dead
// destinations, ad-LP trust gap, ad form friction, mobile-checkout
// degraded, message mismatch, low repeat purchase, dead weight
// products. 14 functions.
//
// These fire only when the corresponding commerce signal is present.
//
// Wave 20.6 — migrated from the pre-split inference monolith (see git log for engine.ts before commit f987895).
// ──────────────────────────────────────────────

import {
  Inference,
  InferenceCategory,
  Signal,
  Scoping,
  IdGenerator,
  makeRef,
} from "../../domain";
import { createInference } from "../shared/builders";
import type { PackInput } from "../shared/types";

// Phase 4A: Commerce Context Inferences
//
// Inferences powered by real Shopify data via
// CommerceContext. These fire only when the
// corresponding commerce signal is present.
// ──────────────────────────────────────────────

function inferCheckoutAbandonmentRevenueLeak(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_abandonment_rate_high');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'checkout_abandonment_revenue_leak',
    category: InferenceCategory.CheckoutAbandonmentRevenueLeak,
    conclusion: 'checkout_abandonment_revenue_leak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Checkout abandonment rate is ${sig.numeric_value}%. Every abandoned cart is revenue that reached the final step and walked away. At this rate, your checkout is the single largest revenue leak in the business. More than any marketing problem or product issue.`,
    reasoning_slots: { severity },
  })];
}

function inferPromotedProductOutOfStock(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('promoted_products_out_of_stock');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'promoted_product_out_of_stock',
    category: InferenceCategory.PromotedProductOutOfStock,
    conclusion: 'promoted_product_out_of_stock',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value} promoted product(s) are out of stock. Buyers arrive ready to purchase and find they cannot. Ad spend drives traffic to dead ends, organic rankings reward pages that frustrate instead of convert.`,
    reasoning_slots: { severity, count: sig.numeric_value ?? 0 },
  })];
}

function inferHighRefundRateErodingRevenue(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('refund_rate_elevated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'high_refund_rate_eroding_revenue',
    category: InferenceCategory.HighRefundRateErodingRevenue,
    conclusion: 'high_refund_rate_eroding_revenue',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Refund rate of ${sig.numeric_value}% is eating into revenue. Each refund costs the sale plus processing fees, shipping, and operational time. A refund rate this high signals a systemic gap between what the buyer expected and what they received.`,
    reasoning_slots: { severity },
  })];
}

function inferSinglePaymentGatewayRisk(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('payment_gateway_concentrated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'single_payment_gateway_risk',
    category: InferenceCategory.SinglePaymentGatewayRisk,
    conclusion: 'single_payment_gateway_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of transactions flow through a single payment gateway. A single point of failure for all revenue. One gateway outage, rate limit, or policy change stops every transaction until resolved. No fallback means zero revenue during downtime.`,
    reasoning_slots: { severity },
  })];
}

function inferDiscountAbusePattern(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('discount_usage_elevated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'discount_abuse_pattern',
    category: InferenceCategory.DiscountAbusePattern,
    conclusion: 'discount_abuse_pattern',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of orders use discount codes. When most orders are discounted, full-price purchases become the exception. Buyers learn to wait for codes, share them freely, and never pay the listed price. Margin erosion compounds every month.`,
    reasoning_slots: { severity },
  })];
}

function inferAdSpendPlatformConcentrationRisk(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_spend_platform_concentrated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'ad_spend_platform_concentration_risk',
    category: InferenceCategory.AdSpendPlatformConcentrationRisk,
    conclusion: 'ad_spend_platform_concentration_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of monthly ad spend is concentrated on a single platform. An account disable, policy change, or platform outage would halt acquisition. Standing up an alternative channel typically takes weeks, and revenue drops during the gap. Single-platform dependency is the acquisition-side analogue of single-payment-gateway risk.`,
    reasoning_slots: { severity },
  })];
}

function inferAdsWithoutConversionVisibility(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ads_active_without_conversion_tracking');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'ads_without_conversion_visibility',
    category: InferenceCategory.AdsWithoutConversionVisibility,
    conclusion: 'ads_without_conversion_visibility',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Ad spend of $${sig.numeric_value}/month is running without a commerce platform connected to measure its return. Every dollar of ad spend without conversion tracking is a dollar that cannot be attributed, compared against the next dollar, or defended as worth the spend. ROAS is not low. It's literally unknown.`,
    reasoning_slots: { severity },
  })];
}

function inferAdCreativeDeadDestination(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_dead_destination');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_dead_destination',
    category: InferenceCategory.AdCreativeDeadDestination,
    conclusion: 'ad_creative_dead_destination',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend is directed at a URL that returns an error or redirects through too many hops. Every dollar of this spend reaches a dead end. Buyers who click the ad cannot complete the intended action. This is 100% waste, recoverable immediately by updating the creative's destination URL.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeLandingTrustGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_landing_trust_gap');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_landing_trust_gap',
    category: InferenceCategory.AdCreativeLandingTrustGap,
    conclusion: 'ad_creative_landing_trust_gap',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend sends buyers to a page that collects sensitive data (payment, password, identity) but shows fewer than 2 trust signals (badges, reviews, certificates). The gap between what the ad promises and what the landing page reassures drives abandonment. Buyers who were ready to convert decide the risk is not worth it at the moment they are asked for sensitive information.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeFormFrictionWaste(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_form_friction_waste');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_form_friction_waste',
    category: InferenceCategory.AdCreativeFormFrictionWaste,
    conclusion: 'ad_creative_form_friction_waste',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend sends buyers to a page with a form that demands excessive input. Every field past six measurably increases abandonment. The ad brought a buyer to the conversion step, and the form pushed them away. A portion of this spend converts to friction instead of revenue.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeMobileCheckoutDegraded(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_mobile_checkout_degraded');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_mobile_checkout_degraded',
    category: InferenceCategory.AdCreativeMobileCheckoutDegraded,
    conclusion: 'ad_creative_mobile_checkout_degraded',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend sends mobile buyers to a page where the commercial path shows step failures or extended load times. Mobile users who arrive from the ad encounter a degraded experience. CTAs load late, forms fail, or the checkout path stalls. The ad did its job getting the click; the landing page fails to convert it.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeMessageMismatch(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Collect all per-URL mismatch signals
  const matches: Signal[] = [];
  for (const [key, sig] of byKey.entries()) {
    if (key.startsWith('ad_message_mismatch_detected_')) matches.push(sig);
  }
  if (matches.length === 0) return [];

  const worst = matches.reduce((a, b) =>
    (a.numeric_value ?? 0) > (b.numeric_value ?? 0) ? a : b,
  );
  const totalSpend = matches.reduce((sum, s) => sum + (s.numeric_value ?? 0), 0);
  const severity = worst.value || 'medium';

  return [createInference({
    inference_key: 'ad_creative_message_mismatch',
    category: InferenceCategory.AdCreativeMessageMismatch,
    conclusion: 'ad_creative_message_mismatch',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: matches.map(s => makeRef('signal', s.id)),
    evidence_refs: matches.flatMap(s => s.evidence_refs),
    reasoning: `$${totalSpend}/month of ad spend sends traffic to ${matches.length} page(s) where the ad's promise doesn't match the landing page's content. The ad headline, value proposition, or CTA sets an expectation that the landing page fails to deliver. Buyers arrive expecting one thing and find another, driving bounce rates up and conversion rates down.`,
    reasoning_slots: { severity, totalSpend },
  })];
}

function inferLowRepeatPurchaseRate(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('repeat_purchase_rate_low');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'low_repeat_purchase_rate',
    category: InferenceCategory.LowRepeatPurchaseRate,
    conclusion: 'low_repeat_purchase_rate',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Only ${sig.numeric_value}% of customers return to buy again. Customer acquisition cost is not being amortized across multiple purchases. Each customer is effectively a one-time transaction, making every new sale as expensive as the first.`,
    reasoning_slots: { severity },
  })];
}

function inferDeadWeightProducts(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('dead_weight_products_detected');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'dead_weight_products',
    category: InferenceCategory.DeadWeightProducts,
    conclusion: 'dead_weight_products',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value} product(s) haven't generated a single sale in 30 days. Dead inventory dilutes site search results, clutters category pages, and wastes operational bandwidth on listings that contribute nothing to revenue.`,
    reasoning_slots: { severity, count: sig.numeric_value ?? 0 },
  })];
}

// ──────────────────────────────────────────────

export function computeCommerceContextPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferCheckoutAbandonmentRevenueLeak(byKey, scoping, cycle_ref, ids));
  out.push(...inferPromotedProductOutOfStock(byKey, scoping, cycle_ref, ids));
  out.push(...inferHighRefundRateErodingRevenue(byKey, scoping, cycle_ref, ids));
  out.push(...inferSinglePaymentGatewayRisk(byKey, scoping, cycle_ref, ids));
  out.push(...inferDiscountAbusePattern(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdSpendPlatformConcentrationRisk(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdsWithoutConversionVisibility(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdCreativeDeadDestination(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdCreativeLandingTrustGap(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdCreativeFormFrictionWaste(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdCreativeMobileCheckoutDegraded(byKey, scoping, cycle_ref, ids));
  out.push(...inferAdCreativeMessageMismatch(byKey, scoping, cycle_ref, ids));
  out.push(...inferLowRepeatPurchaseRate(byKey, scoping, cycle_ref, ids));
  out.push(...inferDeadWeightProducts(byKey, scoping, cycle_ref, ids));
  return out;
}
