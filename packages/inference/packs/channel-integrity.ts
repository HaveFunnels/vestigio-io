// ──────────────────────────────────────────────
// Pack: channel_integrity (Phase 3A)
//
// Payment-channel + commerce-continuity threat inferences. 8 funcs.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:1044-1164.
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

// Phase 3A: Channel Integrity Inferences
// ──────────────────────────────────────────────

function inferPaymentSurfaceExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('payment_surface_script_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'payment_surface_compromised',
    category: InferenceCategory.PaymentSurfaceScriptExposure,
    conclusion: 'payment_surface_compromised', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Purchase surfaces are exposed to unauthorized script execution. Injection patterns or missing script controls on checkout and payment pages enable formjacking, session hijack, and payment data interception. This is not a theoretical vulnerability — it is the exact pattern used in real-world payment compromises (Magecart, web skimming). Every transaction through these surfaces carries active fraud exposure.`,
    reasoning_slots: { severity },
  })];
}

function inferChannelHijackExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('channel_hijack_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'channel_traffic_divertible',
    category: InferenceCategory.ChannelHijackExposure,
    conclusion: 'channel_traffic_divertible', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Customer traffic can be diverted through weakly governed channel surfaces. Open redirects, permissive cross-origin policies, or exposed infrastructure enable attackers to create legitimate-looking links that route buyers to phishing destinations, fake checkout pages, or competitor sites — using the brand's own domain as the trust anchor.`,
    reasoning_slots: { severity },
  })];
}

function inferCommerceContinuityThreat(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commerce_continuity_threat');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'commerce_operations_exposed',
    category: InferenceCategory.CommerceContinuityThreat,
    conclusion: 'commerce_operations_exposed', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Public-facing operational surfaces — admin panels, debug endpoints, or configuration files — are accessible near the commercial footprint. An attacker who reaches these surfaces can modify pricing, disable checkout, extract customer data, or trigger downtime. The business impact is not "a security bug" — it is emergency refunds, commerce interruption, and forced incident response.`,
    reasoning_slots: { severity },
  })];
}

function inferLowTrustPosture(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('low_trust_technical_posture');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'traffic_landing_low_trust_posture',
    category: InferenceCategory.LowTrustTechnicalPosture,
    conclusion: 'traffic_landing_low_trust_posture', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Paid and organic traffic is landing on a domain whose technical posture signals weakness to browsers and cautious buyers. Missing security headers, mixed content, or certificate issues create visible trust friction — browser warnings, missing padlock icons, or "not secure" indicators that suppress conversion before the buyer even reads the offer.`,
    reasoning_slots: { severity },
  })];
}

function inferChannelCompromisePattern(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('channel_compromise_pattern');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'channel_compromise_visible',
    category: InferenceCategory.ChannelCompromisePattern,
    conclusion: 'channel_compromise_visible', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Multiple exposure types detected across the commercial channel — the pattern of simultaneous weaknesses (payment surfaces, channel governance, operational posture) signals a domain that has not been hardened for commercial operation. Even before a confirmed exploit, this exposure pattern is enough to trigger distrust from cautious buyers, security-conscious partners, and compliance reviewers.`,
    reasoning_slots: { severity },
  })];
}

function inferAbuseExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('abuse_exposure_conditions');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'commercial_path_abuse_friendly',
    category: InferenceCategory.AbuseExposureConditions,
    conclusion: 'commercial_path_abuse_friendly', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The commercial path includes conditions that enable automated abuse — unauthenticated API endpoints, exposed schema introspection, or unprotected business-logic surfaces. Attackers can automate pricing manipulation, coupon abuse, inventory depletion, or account enumeration without needing to breach authentication. The result is margin leakage, operational noise, and increased support/fraud burden.`,
    reasoning_slots: { severity },
  })];
}

function inferCheckoutInfraBrittle(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_infrastructure_brittle');
  if (!sig) return [];
  return [createInference({
    inference_key: 'checkout_trust_brittle_infrastructure',
    category: InferenceCategory.CheckoutInfrastructureBrittle,
    conclusion: 'checkout_trust_brittle_infrastructure', conclusion_value: 'high', severity_hint: 'high',
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Checkout and payment trust is anchored to infrastructure that is both technically weak and actively exploitable. Payment integrity exposures exist alongside trust posture weaknesses on the same commercial domain — the combination means that not only is the checkout surface vulnerable to compromise, but the surrounding infrastructure provides no defense-in-depth. This is a launch/scale blocker: scaling traffic into this environment amplifies both fraud exposure and trust failure.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferEconomicExploitation(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('economic_exploitation_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'economic_exploitation_active',
    category: InferenceCategory.EconomicExploitationExposure,
    conclusion: 'economic_exploitation_active', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Business-logic exploitation conditions are present on the commercial path. Cart or pricing endpoints respond to unauthorized manipulation, coupon endpoints are enumerable, or refund processes are accessible without authentication. This is not theoretical — these are the exact patterns used in automated margin theft: bots that modify prices before checkout, scripts that brute-force coupon codes, and tools that initiate fraudulent refunds at scale. The financial impact is direct: every exploited transaction reduces margin, every abused coupon erodes promotion ROI, every fraudulent refund becomes a net loss.`,
    reasoning_slots: { severity },
  })];
}

export function computeChannelIntegrityPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferPaymentSurfaceExposure(byKey, scoping, cycle_ref, ids));
  out.push(...inferChannelHijackExposure(byKey, scoping, cycle_ref, ids));
  out.push(...inferCommerceContinuityThreat(byKey, scoping, cycle_ref, ids));
  out.push(...inferLowTrustPosture(byKey, scoping, cycle_ref, ids));
  out.push(...inferChannelCompromisePattern(byKey, scoping, cycle_ref, ids));
  out.push(...inferAbuseExposure(byKey, scoping, cycle_ref, ids));
  out.push(...inferCheckoutInfraBrittle(byKey, scoping, cycle_ref, ids));
  out.push(...inferEconomicExploitation(byKey, scoping, cycle_ref, ids));
  return out;
}
