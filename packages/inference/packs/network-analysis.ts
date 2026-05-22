// ──────────────────────────────────────────────
// Pack: network_analysis (Phase 2D — runtime / network)
//
// Inferences fired by network and runtime signals: checkout API
// latency, third-party dependency weight, failing requests on
// purchase surfaces, late-loading trust assets, mobile runtime
// chains. The thread: revenue surfaces operating below the
// network/runtime threshold they need to convert.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:974-1151.
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

function inferCheckoutApiLatency(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_api_latency_degrading');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'checkout_api_latency_degraded',
    category: InferenceCategory.CheckoutApiLatencyDegraded,
    conclusion: 'checkout_api_latency_degraded', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Payment-critical API responses on checkout surfaces exceed acceptable latency thresholds. Every second of checkout latency costs conversion: buyers who wait for payment processing to respond are progressively more likely to abandon. This is not generic page slowness — it is latency at the exact moment of purchase commitment.`,
    reasoning_slots: { severity },
  })];
}

function inferCommercialPagesSlow(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_disproportionately_slow');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'commercial_pages_slow',
    category: InferenceCategory.CommercialPagesSlow,
    conclusion: 'commercial_pages_slow', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The pages that generate revenue are disproportionately slower than the rest of the site. Visitors browse at normal speed but hit friction when they reach the commercial path. This asymmetry means the site performs well enough to attract buyers but degrades at the moment they try to convert.`,
    reasoning_slots: { severity },
  })];
}

function inferPaidLandingOverloaded(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('paid_landing_overloaded');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'paid_landing_overloaded',
    category: InferenceCategory.PaidLandingOverloaded,
    conclusion: 'paid_landing_overloaded', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The landing page is overloaded with third-party requests before buyers reach any meaningful action. Paid traffic — which has a real per-click cost — is hitting a heavy runtime wall. CAC increases because media spend arrives into a page that cannot present the offer quickly enough to capture intent.`,
    reasoning_slots: { severity },
  })];
}

function inferThirdPartyWeightDelaysTrust(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('third_party_weight_delays_trust');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'third_party_weight_delays_trust',
    category: InferenceCategory.ThirdPartyWeightDelaysTrust,
    conclusion: 'third_party_weight_delays_trust', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Heavy third-party dependency chains on commercial surfaces delay the moment when buyers feel trust and form intent. Non-essential external scripts, widgets, and trackers are consuming bandwidth and execution time before the buyer reaches the point of confidence. Each delayed second widens the gap between intent arrival and trust formation.`,
    reasoning_slots: { severity },
  })];
}

function inferCheckoutBrittleThirdParty(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_brittle_third_party');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'checkout_brittle_third_party',
    category: InferenceCategory.CheckoutBrittleThirdParty,
    conclusion: 'checkout_brittle_third_party', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Checkout completion depends on third-party services that are failing or unstable during browser verification. When payment providers, cart APIs, or checkout widgets fail to respond reliably, every affected session is a potential lost transaction. This is operational fragility at the revenue-critical surface.`,
    reasoning_slots: { severity },
  })];
}

function inferPurchaseBlockedFailingRequests(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('purchase_flow_blocked_by_failures');
  if (!sig) return [];
  return [createInference({
    inference_key: 'purchase_blocked_failing_requests',
    category: InferenceCategory.PurchaseBlockedFailingRequests,
    conclusion: 'purchase_blocked_failing_requests', conclusion_value: 'high', severity_hint: 'high',
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Payment or commerce API requests are failing on purchase surfaces. This is not slow loading — it is active failure. Buyers who reach checkout and attempt to purchase are being blocked by requests that return errors or never complete. Every instance is a buyer who wanted to pay but could not.`,
    reasoning_slots: { severity: sig.value || 'high' },
  })];
}

function inferMeasurementBreaksRevenuePath(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('measurement_breaks_on_revenue_path');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'measurement_breaks_revenue_path',
    category: InferenceCategory.MeasurementBreaksRevenuePath,
    conclusion: 'measurement_breaks_revenue_path', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Analytics and measurement requests are failing at runtime on the pages that generate revenue. The instrumentation appears to be present but is not actually executing — conversion data, attribution, and funnel metrics are silently dropping on the surfaces that matter most for optimization and ROI measurement.`,
    reasoning_slots: { severity },
  })];
}

function inferPurchaseBeforeDepsReady(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('purchase_before_deps_ready');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'purchase_before_deps_ready',
    category: InferenceCategory.PurchaseBeforeDepsReady,
    conclusion: 'purchase_before_deps_ready', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Critical payment and trust dependencies take too long to become available on checkout surfaces. Buyers can see and interact with the purchase UI before payment processing, trust badges, or support widgets are ready. This sequencing gap means the purchase moment arrives before the infrastructure that supports it — leading to failed transactions, missing trust signals, and incomplete checkout experiences.`,
    reasoning_slots: { severity },
  })];
}

function inferTrustAssetsLateLoad(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('trust_assets_late_load');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'trust_assets_late_load',
    category: InferenceCategory.TrustAssetsLateLoad,
    conclusion: 'trust_assets_late_load', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Trust and reassurance assets — support chat, review widgets, trust badges — start loading well after the page is interactive. Buyers form their trust impression in the first few seconds. When reassurance layers arrive late, the hesitation window is already open and abandonment decisions have already been made. The reassurance investment is wasted because it arrives after the moment it was needed.`,
    reasoning_slots: { severity },
  })];
}

function inferMobileHeavyRuntimeChain(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mobile_heavy_runtime_chain');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'mobile_heavy_runtime_chain',
    category: InferenceCategory.MobileHeavyRuntimeChain,
    conclusion: 'mobile_heavy_runtime_chain', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The mobile commerce path carries a heavy third-party runtime dependency chain. Mobile connections are slower and more constrained than desktop — the same dependency weight that is tolerable on desktop becomes conversion-killing on mobile. Media spend directed at mobile audiences is landing into an experience that physically cannot convert as efficiently as desktop due to runtime overload.`,
    reasoning_slots: { severity },
  })];
}

function inferMobileTrustPaymentDepsFailing(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mobile_critical_deps_failing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'mobile_trust_payment_deps_failing',
    category: InferenceCategory.MobileTrustPaymentDepsFailing,
    conclusion: 'mobile_trust_payment_deps_failing', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Payment, trust, and measurement dependencies are failing on mobile commercial surfaces. Mobile buyers — who typically represent the majority of traffic — are entering a weaker operational environment than desktop. Payment SDKs fail to load, support widgets do not appear, and measurement breaks on the very surfaces where mobile conversion needs the most support.`,
    reasoning_slots: { severity },
  })];
}

function inferTrustSurfacesUnstableDeps(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('trust_surfaces_unstable_deps');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'trust_surfaces_unstable_deps',
    category: InferenceCategory.TrustSurfacesUnstableDeps,
    conclusion: 'trust_surfaces_unstable_deps', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The layers that make buyers feel safe — support widgets, review badges, trust signals, chat tools — depend on external services that are failing or unreliable. Trust-critical surfaces are supposed to reduce hesitation and prevent abandonment, but when these dependencies fail, the trust infrastructure becomes invisible exactly when it matters most. The result is a checkout that looks bare and untrustworthy during outage or degradation of external providers.`,
    reasoning_slots: { severity },
  })];
}

export function computeNetworkAnalysisPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferCheckoutApiLatency(byKey, scoping, cycle_ref, ids));
  out.push(...inferCommercialPagesSlow(byKey, scoping, cycle_ref, ids));
  out.push(...inferPaidLandingOverloaded(byKey, scoping, cycle_ref, ids));
  out.push(...inferThirdPartyWeightDelaysTrust(byKey, scoping, cycle_ref, ids));
  out.push(...inferCheckoutBrittleThirdParty(byKey, scoping, cycle_ref, ids));
  out.push(...inferPurchaseBlockedFailingRequests(byKey, scoping, cycle_ref, ids));
  out.push(...inferMeasurementBreaksRevenuePath(byKey, scoping, cycle_ref, ids));
  out.push(...inferPurchaseBeforeDepsReady(byKey, scoping, cycle_ref, ids));
  out.push(...inferTrustAssetsLateLoad(byKey, scoping, cycle_ref, ids));
  out.push(...inferMobileHeavyRuntimeChain(byKey, scoping, cycle_ref, ids));
  out.push(...inferMobileTrustPaymentDepsFailing(byKey, scoping, cycle_ref, ids));
  out.push(...inferTrustSurfacesUnstableDeps(byKey, scoping, cycle_ref, ids));
  return out;
}
