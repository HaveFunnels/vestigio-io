// ──────────────────────────────────────────────
// Pack: monetization_extensions
//
// Combined home for late-wave monetization + measurement inferences:
//   - Wave 7.11 SaaS/Stripe Metric (2 funcs):
//     subscriber_churn_elevated, failed_payment_rate_high
//   - Wave 8.1 Payment Health & Involuntary Churn (4 funcs):
//     failed_payment_revenue_drain, subscriber_churn_unsustainable,
//     payment_diversity_insufficient, mrr_contraction
//   - Wave 6.1 Revenue Attribution Integrity (1 func):
//     revenue_attribution_mismatch
//   - Wave 7.11M Pixel coverage gap (1 func):
//     pixel_coverage_gap
//
// 8 functions. Each routes via inference-to-pack.ts to the right
// final pack (saas_growth_readiness, payment_health,
// revenue_integrity, scale_readiness) at projection time.
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

// Wave 7.11: SaaS/Stripe Metric Inferences
// ──────────────────────────────────────────────

function inferSubscriberChurnElevated(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('subscriber_churn_elevated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'subscriber_churn_elevated',
    category: InferenceCategory.SubscriberChurnElevated,
    conclusion: 'subscriber_churn_elevated',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Monthly subscriber churn rate of ${sig.numeric_value}% is above the 5% SaaS benchmark. At this rate, you lose your entire subscriber base in ${Math.round(100 / (sig.numeric_value ?? 5))} months without new signups. Churn compounds — every lost subscriber is lost LTV, and replacing them costs acquisition spend that would have otherwise expanded revenue.`,
    reasoning_slots: { severity },
  })];
}

function inferFailedPaymentRateHigh(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('failed_payment_rate_high');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'failed_payment_rate_high',
    category: InferenceCategory.FailedPaymentRateHigh,
    conclusion: 'failed_payment_rate_high',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of payment attempts are failing — this is involuntary churn from expired cards, insufficient funds, and gateway errors. Each failed payment is a subscriber who intends to pay but cannot. Without dunning automation and card updater integration, these subscribers silently churn without ever making a conscious decision to leave.`,
    reasoning_slots: { severity },
  })];
}

// ──────────────────────────────────────────────
// Wave 8.1: Payment Health & Involuntary Churn Inferences
// ──────────────────────────────────────────────

function inferFailedPaymentRevenueDrain(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('failed_payment_rate_elevated');
  if (!sig) return [];
  const rate = sig.numeric_value ?? 0;
  const severity = rate > 10 ? 'high' : 'medium';
  return [createInference({
    inference_key: 'failed_payment_revenue_drain',
    category: InferenceCategory.FailedPaymentRevenueDrain,
    conclusion: 'failed_payment_revenue_drain',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Failed payments are draining revenue through involuntary churn at a rate of ${rate}%. Every failed charge is a subscriber who wants to pay but can't — expired cards, insufficient funds, and gateway errors are silently converting paying customers into churned ones. Without dunning automation, card updater integration, and grace periods, this revenue loss compounds monthly.`,
    reasoning_slots: { severity, rate },
  })];
}

function inferSubscriberChurnUnsustainable(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('subscriber_churn_rate_elevated');
  if (!sig) return [];
  const rate = sig.numeric_value ?? 0;
  const severity = rate > 12 ? 'high' : 'medium';
  return [createInference({
    inference_key: 'subscriber_churn_unsustainable',
    category: InferenceCategory.SubscriberChurnUnsustainable,
    conclusion: 'subscriber_churn_unsustainable',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Subscriber churn rate of ${rate}% exceeds the sustainable threshold of 7%. At this rate, the subscriber base turns over completely in ${Math.round(100 / rate)} months. Growth cannot outpace attrition — every new subscriber acquired is offset by churn. This requires immediate intervention through retention offers, cancellation surveys, and involuntary churn recovery via dunning automation.`,
    reasoning_slots: { severity, rate },
  })];
}

function inferPaymentDiversityInsufficient(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Reuse the existing single_payment_gateway_risk signal
  const sig = byKey.get('payment_gateway_concentrated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'payment_diversity_insufficient',
    category: InferenceCategory.PaymentDiversityInsufficient,
    conclusion: 'payment_diversity_insufficient',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of payment volume flows through a single gateway. A single provider outage, rate limit change, or policy update halts all recurring revenue collection. Payment infrastructure diversity is a prerequisite for subscription business resilience — without a fallback gateway, any disruption converts a technical issue into a mass involuntary churn event.`,
    reasoning_slots: { severity },
  })];
}

function inferMrrContraction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mrr_contraction_detected');
  if (!sig) return [];
  const deltaPct = sig.numeric_value ?? 0; // negative integer percent, e.g. -8
  const severity = sig.value;
  return [createInference({
    inference_key: 'mrr_contraction_detected',
    category: InferenceCategory.MrrContractionDetected,
    conclusion: 'mrr_contraction_detected',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `MRR is contracting at ${deltaPct}% cycle-over-cycle. This is the leading indicator that failed_payment_rate or subscriber_churn_rate is no longer being offset by new subscriber growth. Dunning recovery, retention offers, and churn diagnosis all need to ramp before the decline compounds across the next renewal cycle.`,
    reasoning_slots: { severity, delta_pct: deltaPct },
  })];
}

// ──────────────────────────────────────────────
// Wave 6.1 — Revenue Attribution Integrity (reframed)
//
// Consumes the `ad_revenue_attribution_gap` signal. We CAN'T claim
// over-attribution as a conclusion because Stripe doesn't see the
// customer's full revenue picture — boleto, PIX, MercadoPago, bank
// transfer, in-person payments, PayPal, alternative gateways all live
// outside Stripe. The factual delta IS interesting, but the cause is
// ambiguous: (a) ads correctly attributing revenue collected through
// channels Stripe doesn't see, (b) genuine over-attribution from
// last-click ROAS inflation, or (c) attribution windows too generous.
// So this inference surfaces a neutral "data sources disagree —
// investigate" finding rather than asserting overattribution. The fix
// always starts with reconciling total transaction revenue across
// every collection channel.
//
// Signal threshold (ratio > 2x) is intentionally conservative because
// gaps under 2x can plausibly be explained by off-Stripe channels
// alone in many Brazilian + LATAM markets.
// ──────────────────────────────────────────────
function inferRevenueAttributionMismatch(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_revenue_attribution_gap');
  if (!sig) return [];
  const ratioPct = sig.numeric_value ?? 0; // e.g. 250 = 2.5x ad/stripe
  const ratioX = (ratioPct / 100).toFixed(1);
  const severity = sig.value;
  return [createInference({
    inference_key: 'revenue_attribution_mismatch',
    category: InferenceCategory.RevenueAttributionMismatch,
    conclusion: 'revenue_attribution_mismatch',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Two of your revenue data sources disagree by a factor of ${ratioX}x — Meta/Google report substantially more attributed revenue than Stripe shows transacted. Three plausible causes, each with a different fix: (a) you collect significant revenue OUTSIDE Stripe (boleto, PIX, MercadoPago, bank transfer, PayPal, in-person) — the ad platforms may be attributing correctly to revenue Stripe simply doesn't see; (b) last-click attribution is over-claiming touches as conversions, inflating ROAS; (c) attribution windows are too generous. Start with reconciliation: pull your full month's revenue across EVERY collection channel and compare against the ad-platform totals. Only adjust ad budget after the gap is explained by (a) or confirmed as (b/c).`,
    reasoning_slots: { severity, ratio_pct: ratioPct },
  })];
}

// ──────────────────────────────────────────────
// Wave 7.11M — Pixel coverage gap (measurement integrity)
//
// Surfaces partial-pixel-installation as a high-confidence finding so the
// user understands WHY checkout-dependent findings are absent or muted.
// Signal-layer gating (in extractBehavioralSignals) already prevents
// emitting false positives like `high_intent_detour`/`checkout_abandon`
// when checkout coverage is missing — this inference closes the loop by
// telling the user the gap exists. Maps to revenue_integrity pack because
// missing pixel coverage on checkout/thank_you directly distorts revenue
// path visibility.
// ──────────────────────────────────────────────
function inferPixelCoverageGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('pixel_coverage_gap');
  if (!sig) return [];
  // signal.value is a comma-separated list of missing page types (e.g. "checkout" or "checkout,thank_you")
  const missingTypes = String(sig.value || '').split(',').filter(Boolean);
  const checkoutMissing = missingTypes.includes('checkout');
  // Severity: missing checkout is high (no revenue funnel visibility),
  // missing only thank_you is medium (conversion attribution lost, but
  // pre-conversion behavior still visible).
  const severity: 'high' | 'medium' = checkoutMissing ? 'high' : 'medium';
  return [createInference({
    inference_key: 'pixel_coverage_gap',
    category: InferenceCategory.PixelCoverageGap,
    conclusion: 'pixel_coverage_gap',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The behavioral pixel is not installed on ${missingTypes.join(' and ')}. Behavioral findings about ${missingTypes.join('/')} are being suppressed to avoid false positives (otherwise "zero conversions" gets misread as "no conversions happen" when the real cause is "no pixel sees them"). Install the pixel on the missing page types to surface checkout abandonment, retry friction, and conversion-rate findings that are currently invisible.`,
    reasoning_slots: { severity, missing_types: missingTypes.join(',') },
  })];
}

export function computeMonetizationExtensionsPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  // Wave 7.11: SaaS/Stripe Metric
  out.push(...inferSubscriberChurnElevated(byKey, scoping, cycle_ref, ids));
  out.push(...inferFailedPaymentRateHigh(byKey, scoping, cycle_ref, ids));
  // Wave 8.1: Payment Health & Involuntary Churn
  out.push(...inferFailedPaymentRevenueDrain(byKey, scoping, cycle_ref, ids));
  out.push(...inferSubscriberChurnUnsustainable(byKey, scoping, cycle_ref, ids));
  out.push(...inferPaymentDiversityInsufficient(byKey, scoping, cycle_ref, ids));
  out.push(...inferMrrContraction(byKey, scoping, cycle_ref, ids));
  // Wave 6.1: Revenue Attribution Integrity
  out.push(...inferRevenueAttributionMismatch(byKey, scoping, cycle_ref, ids));
  // Wave 7.11M: Pixel coverage gap
  out.push(...inferPixelCoverageGap(byKey, scoping, cycle_ref, ids));
  return out;
}
