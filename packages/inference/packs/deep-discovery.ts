// ──────────────────────────────────────────────
// Pack: deep_discovery (Phase 3B — Katana deep crawl)
//
// Inferences fired by signals from deep JS-rendered discovery:
// promotion abuse exposure, cart variant control gaps, hidden
// discount/refund routes, guessable business endpoints, dynamic
// route governance gaps. The thread: the deeper you crawl, the
// weaker the controls become.
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

function inferPromotionLogicExposed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('promotion_logic_abuse_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'promotion_logic_exposed',
    category: InferenceCategory.PromotionLogicExposed,
    conclusion: 'promotion_logic_exposed', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Deep discovery found promotion, discount, or coupon routes that are structurally exposed to abuse. These endpoints follow predictable patterns or lack rate limiting and authentication gates. The exact conditions that enable automated coupon enumeration, discount stacking, and promotional code brute-forcing. Each exploited promotion directly reduces margin and erodes the ROI of marketing campaigns.`,
    reasoning_slots: { severity },
  })];
}

function inferCartVariantWeakControl(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cart_variant_weak_pricing_control');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'cart_variant_weak_control',
    category: InferenceCategory.CartVariantWeakControl,
    conclusion: 'cart_variant_weak_control', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Multiple cart or checkout route variants were discovered through deep crawling. Alternate cart paths often carry weaker price validation, missing inventory checks, or inconsistent tax calculations compared to the primary flow. When pricing controls are not uniform across all cart variants, the weakest path becomes the attack surface. Bots route through whichever variant applies the fewest safeguards.`,
    reasoning_slots: { severity },
  })];
}

function inferHiddenDiscountRefundRoute(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('hidden_discount_refund_weakness');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'hidden_discount_refund_route',
    category: InferenceCategory.HiddenDiscountRefundRoute,
    conclusion: 'hidden_discount_refund_route', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Discount and refund routes discovered outside the expected safeguard envelope. These paths exist in the application but are not governed by the same controls that protect the primary commercial flow. Discoverable refund endpoints without authentication enable fraudulent refund initiation, while exposed discount routes enable code enumeration and stacking. The business impact is margin erosion from the discount side and net financial loss from the refund side.`,
    reasoning_slots: { severity },
  })];
}

function inferGuessableBusinessEndpoint(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('guessable_business_endpoint_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'guessable_business_endpoint',
    category: InferenceCategory.GuessableBusinessEndpoint,
    conclusion: 'guessable_business_endpoint', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Business-critical commerce endpoints follow predictable URL patterns and lack visible safeguards proportional to their business importance. Order management, billing, account, and refund actions are reachable through guessable paths. Enabling automated probing, IDOR-style access, and business-logic manipulation. The risk is not theoretical: these patterns are the first targets in automated commerce fraud because they are trivially discoverable.`,
    reasoning_slots: { severity },
  })];
}

function inferAlternatePricingSafeguardBypass(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('alternate_pricing_safeguard_bypass');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'alternate_pricing_safeguard_bypass',
    category: InferenceCategory.AlternatePricingSafeguardBypass,
    conclusion: 'alternate_pricing_safeguard_bypass', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Deep discovery found alternate commercial actions (legacy endpoints, beta paths, test routes, or parameter-based variants) that may bypass intended pricing safeguards. These are not generic alternate pages. They are structurally different commercial actions that process transactions or pricing through weaker validation than the primary checkout flow. The margin and offer integrity risk is that the weakest pricing path determines the actual price floor.`,
    reasoning_slots: { severity },
  })];
}

function inferJsDiscoveredPurchaseVariant(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('js_discovered_purchase_variant');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'js_discovered_purchase_variant',
    category: InferenceCategory.JsDiscoveredPurchaseVariant,
    conclusion: 'js_discovered_purchase_variant', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Client-side JavaScript reveals commerce routes not visible through static navigation. Alternate checkout paths, dynamic cart endpoints, or SPA-rendered purchase flows. These variants typically escape the main safeguard model: they may lack analytics instrumentation (invisible to optimization), skip trust-building elements (policies, provider badges), or bypass server-side validation that the primary flow enforces. Revenue flowing through these paths is both unprotected and unmeasured.`,
    reasoning_slots: { severity },
  })];
}

function inferDynamicRouteWeakControl(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('dynamic_route_weak_governance');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'dynamic_route_weak_control',
    category: InferenceCategory.DynamicRouteWeakControl,
    conclusion: 'dynamic_route_weak_control', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Dynamically discovered commerce routes show weaker governance than the visible purchase flow. Routes found through JavaScript rendering lack the safeguards (authentication gates, rate limiting, CSRF protection) that protect the primary path. The structural gap means that the deeper you crawl, the weaker the controls become. Creating a gradient of decreasing protection that automated tools exploit preferentially.`,
    reasoning_slots: { severity },
  })];
}

function inferHiddenSupportBurden(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('hidden_support_burden_exposure');
  if (!sig) return [];
  const severity = sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'hidden_support_burden',
    category: InferenceCategory.HiddenSupportBurden,
    conclusion: 'hidden_support_burden', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Support, help, and FAQ routes exist but are structurally disconnected from the commercial journey. They were found through deep crawling, not through the normal buying path. This means buyers who need reassurance during purchase cannot find it, while the same support infrastructure generates downstream ticket volume from post-purchase confusion. The result is the worst of both worlds: support cost without conversion benefit.`,
    reasoning_slots: { severity },
  })];
}

function inferAlternateVariantControlBreakdown(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('alternate_variant_control_breakdown');
  if (!sig) return [];
  return [createInference({
    inference_key: 'alternate_variant_control_breakdown',
    category: InferenceCategory.AlternateVariantControlBreakdown,
    conclusion: 'alternate_variant_control_breakdown', conclusion_value: 'high', severity_hint: 'high',
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Both pricing control exposure and commerce variant proliferation are present. Alternate commerce variants lack the trust signals, measurement infrastructure, and pricing safeguards that protect the primary flow. This compound failure means: pricing can be manipulated on the weaker variant, the manipulation is invisible to analytics, and the buyer experience offers fewer trust signals to offset the weaker controls. Revenue integrity, measurement, and trust all degrade simultaneously on the alternate paths.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferDeepCommerceExploitationRisk(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('deep_commerce_exploitation_risk');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'deep_commerce_exploitation_risk',
    category: InferenceCategory.DeepCommerceExploitationRisk,
    conclusion: 'deep_commerce_exploitation_risk', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Deeply reachable commerce surfaces combine business-logic abuse exposure with safeguard bypass conditions. Guessable endpoints without authentication, exposed refund/billing actions, and alternate pricing paths compound to make deep commerce surfaces materially easier to exploit than the primary purchase flow. This is the exploitation gradient: the primary checkout has security, the deeper endpoints have business logic but not the matching protection. Automated fraud tools target exactly this gap.`,
    reasoning_slots: { severity },
  })];
}

export function computeDeepDiscoveryPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferPromotionLogicExposed(byKey, scoping, cycle_ref, ids));
  out.push(...inferCartVariantWeakControl(byKey, scoping, cycle_ref, ids));
  out.push(...inferHiddenDiscountRefundRoute(byKey, scoping, cycle_ref, ids));
  out.push(...inferGuessableBusinessEndpoint(byKey, scoping, cycle_ref, ids));
  out.push(...inferAlternatePricingSafeguardBypass(byKey, scoping, cycle_ref, ids));
  out.push(...inferJsDiscoveredPurchaseVariant(byKey, scoping, cycle_ref, ids));
  out.push(...inferDynamicRouteWeakControl(byKey, scoping, cycle_ref, ids));
  out.push(...inferHiddenSupportBurden(byKey, scoping, cycle_ref, ids));
  out.push(...inferAlternateVariantControlBreakdown(byKey, scoping, cycle_ref, ids));
  out.push(...inferDeepCommerceExploitationRisk(byKey, scoping, cycle_ref, ids));
  return out;
}
