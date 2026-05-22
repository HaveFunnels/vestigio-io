// ──────────────────────────────────────────────
// Pack: wave_4_extensions
//
// Composite home for three small late-wave additions:
//   - Wave 4.1 Cybersecurity Phase 2 (3 funcs):
//     information_disclosure, script_supply_chain_risk,
//     auth_surface_insecure
//   - Wave 4.2 LLM Enrichment (3 funcs):
//     pricing_offer_unclear, page_purpose_mismatch,
//     structured_data_mismatch
//   - Wave 4.6 Neglected Findings (6 funcs):
//     payment_handoff_dropoff, saas_activation_gap,
//     oscillation_clustering, network_error_weighted,
//     mobile_trust_gap, behavioral_micro_pattern_cascade
//
// 12 functions. Each pack-decision-routing happens via
// projections/inference-to-pack.ts at projection time.
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

// Wave 4.1: Cybersecurity Phase 2 Inferences
// ──────────────────────────────────────────────

function inferInformationDisclosure(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const leaks = byKey.get('error_page_leaks_internals');
  const serverVersion = byKey.get('server_version_disclosed');

  if (!leaks && !serverVersion) return [];

  const signals: Signal[] = [];
  if (leaks) signals.push(leaks);
  if (serverVersion) signals.push(serverVersion);

  const totalCount = (leaks?.numeric_value ?? 0) + (serverVersion?.numeric_value ?? 0);
  const severity = totalCount >= 5 ? 'high' : totalCount >= 2 ? 'medium' : 'low';
  const best = leaks || serverVersion!;

  return [createInference({
    inference_key: 'information_disclosure',
    category: InferenceCategory.InformationDisclosure,
    conclusion: 'information_disclosure',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: best.confidence,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Information disclosure ${severity}. ${totalCount} instance(s) of sensitive information exposed: ${leaks ? `${leaks.numeric_value} verbose error page(s)` : ''}${leaks && serverVersion ? ' + ' : ''}${serverVersion ? `${serverVersion.numeric_value} server version header(s)` : ''}. Attackers use exposed stack traces, framework versions, and internal paths to find known vulnerabilities and craft targeted exploits — turning opportunistic attacks into surgical ones.`,
    reasoning_slots: { severity, count: totalCount },
  })];
}

function inferScriptSupplyChainRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const noSri = byKey.get('external_script_no_sri');
  if (!noSri) return [];

  const count = noSri.numeric_value || 0;
  const severity = count >= 5 ? 'high' : count >= 2 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'script_supply_chain_risk',
    category: InferenceCategory.ScriptSupplyChainRisk,
    conclusion: 'script_supply_chain_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: noSri.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', noSri.id)],
    evidence_refs: noSri.evidence_refs,
    reasoning: `Script supply chain risk ${severity}. ${count} external script(s) load on commercial pages without Subresource Integrity (SRI) protection. If any CDN or third-party host is compromised, attackers inject malicious code that executes with full page access — silently skimming payment data, redirecting buyers, or injecting fake forms. SRI ensures that only the exact expected file version loads.`,
    reasoning_slots: { severity, count },
  })];
}

function inferAuthSurfaceInsecure(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const authInsecure = byKey.get('auth_surface_insecure');
  if (!authInsecure) return [];

  const count = authInsecure.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'auth_surface_insecure',
    category: InferenceCategory.AuthSurfaceInsecure,
    conclusion: 'auth_surface_insecure',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: authInsecure.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', authInsecure.id)],
    evidence_refs: authInsecure.evidence_refs,
    reasoning: `Authentication surface insecure ${severity}. ${count} login/password form(s) expose credentials: passwords displayed as visible text (type="text" instead of type="password") or submitted over unencrypted HTTP. Attackers on the same network capture credentials in plaintext, and shoulder-surfing reveals passwords on screen.`,
    reasoning_slots: { severity, count },
  })];
}

// ──────────────────────────────────────────────
// Wave 4.2: LLM Enrichment Inferences
// ──────────────────────────────────────────────

function inferPricingOfferUnclear(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  // Collect all pricing_offer_unclear signals (one per pricing page URL)
  const matches: Signal[] = [];
  for (const [key, sig] of byKey.entries()) {
    if (key.startsWith('pricing_offer_unclear_')) matches.push(sig);
  }
  if (matches.length === 0) return [];

  const worst = matches.reduce((a, b) =>
    (a.value === 'high' || (a.value === 'medium' && b.value === 'low')) ? a : b,
  );

  return [createInference({
    inference_key: 'pricing_offer_unclear',
    category: InferenceCategory.PricingOfferUnclear,
    conclusion: 'pricing_offer_unclear',
    conclusion_value: worst.value,
    severity_hint: worst.value,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: matches.map(s => makeRef('signal', s.id)),
    evidence_refs: matches.flatMap(s => s.evidence_refs),
    reasoning: `Pricing offer unclear on ${matches.length} page(s). ${worst.value === 'high' ? 'Pricing structure could not be determined — visitors cannot understand what each tier includes.' : 'Multiple tiers presented without a highlighted recommendation — decision paralysis slows conversion.'} When buyers can't quickly answer "what do I get for this price?", they leave to compare competitors who make the answer obvious.`,
    reasoning_slots: { severity: worst.value },
  })];
}

function inferPagePurposeMismatch(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const matches: Signal[] = [];
  for (const [key, sig] of byKey.entries()) {
    if (key.startsWith('page_purpose_mismatch_')) matches.push(sig);
  }
  if (matches.length === 0) return [];

  const severity = matches.length >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'page_purpose_mismatch',
    category: InferenceCategory.PagePurposeMismatch,
    conclusion: 'page_purpose_mismatch',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: matches[0].confidence,
    scoping, cycle_ref, ids,
    signal_refs: matches.map(s => makeRef('signal', s.id)),
    evidence_refs: matches.flatMap(s => s.evidence_refs),
    reasoning: `Page purpose mismatch on ${matches.length} page(s). Page classification doesn't match actual content (e.g. a "pricing" page without pricing content, or a "homepage" with checkout-style copy). This confuses visitors, degrades SEO relevance signals, and makes analytics unreliable — pages count toward the wrong funnel stage.`,
    reasoning_slots: { severity, count: matches.length },
  })];
}

function inferStructuredDataMismatch(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const matches: Signal[] = [];
  for (const [key, sig] of byKey.entries()) {
    if (key.startsWith('structured_data_mismatch_')) matches.push(sig);
  }
  if (matches.length === 0) return [];

  const worst = matches.reduce((a, b) =>
    (a.numeric_value ?? 0) > (b.numeric_value ?? 0) ? a : b,
  );
  const totalMismatches = matches.reduce((sum, s) => sum + (s.numeric_value ?? 0), 0);
  const severity = totalMismatches >= 5 ? 'high' : totalMismatches >= 2 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'structured_data_mismatch',
    category: InferenceCategory.StructuredDataMismatch,
    conclusion: 'structured_data_mismatch',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: matches.map(s => makeRef('signal', s.id)),
    evidence_refs: matches.flatMap(s => s.evidence_refs),
    reasoning: `Structured data (JSON-LD) contradicts visible page content on ${matches.length} page(s) with ${totalMismatches} total mismatch(es). When Google finds that your schema claims don't match what users see (different prices, names, or ratings), rich results get stripped and trust scores drop — costing organic traffic and click-through rate.`,
    reasoning_slots: { severity, count: totalMismatches },
  })];
}

// ──────────────────────────────────────────────
// Wave 4.6: Neglected Findings — 6 New Inferences
// ──────────────────────────────────────────────

function inferPaymentHandoffDropoff(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('payment_handoff_incomplete');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'payment_handoff_dropoff', category: InferenceCategory.PaymentHandoffDropoff, conclusion: 'payment_handoff_dropoff', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users are entering payment but not completing — the handoff to the payment provider is losing customers. ${sig.numeric_value}% of checkout sessions don't return from the payment step. The transition between your site and the payment provider creates a trust break or technical failure that prevents completion.`, reasoning_slots: { severity, rate: sig.numeric_value ?? 0 } })];
}

function inferSaasActivationGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('saas_activation_gap_heuristic');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'saas_activation_gap_heuristic', category: InferenceCategory.SaasActivationGapHeuristic, conclusion: 'saas_activation_gap_heuristic', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users are signing up but struggling to complete their first meaningful action — your activation flow has friction. High first-action failure rate (${sig.numeric_value}%) indicates the onboarding or initial product experience is blocking users before they reach value. This is a heuristic proxy based on behavioral indicators until direct auth-based tracking is available.`, reasoning_slots: { severity, rate: sig.numeric_value ?? 0 } })];
}

function inferOscillationClustering(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('navigation_oscillation_cluster');
  if (!sig) return [];
  const parts = sig.value.split(':');
  const severity = parts[0] === 'high' ? 'high' : parts[0] === 'medium' ? 'medium' : 'low';
  const surfaceA = parts[1] || 'unknown';
  const surfaceB = parts[2] || 'unknown';
  const pairLabel = `${surfaceA} \u2194 ${surfaceB}`;
  return [createInference({ inference_key: 'oscillation_clustering', category: InferenceCategory.OscillationClustering, conclusion: 'oscillation_clustering', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users are caught in repetitive navigation loops between specific pages — they're confused about what to do next. The dominant oscillation pair (${pairLabel}) fired ${sig.numeric_value} times, indicating neither page resolves the user's decision. This is not random browsing — it's systematic indecision between two surfaces that should guide the user forward.`, reasoning_slots: { severity, pair: pairLabel, count: sig.numeric_value ?? 0 } })];
}

function inferNetworkErrorWeighted(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('critical_network_errors_on_commerce');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'network_error_weighted', category: InferenceCategory.NetworkErrorWeighted, conclusion: 'network_error_weighted', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Critical network failures are blocking revenue-generating page functionality — payment scripts and measurement tools are failing. Weighted severity score of ${sig.numeric_value} indicates that the most commercially damaging error types (payment x3, measurement x2) are accumulating on commerce surfaces. Each failure type directly suppresses conversion or blinds your ability to measure it.`, reasoning_slots: { severity, score: sig.numeric_value ?? 0 } })];
}

function inferMobileTrustGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Fire from either source: mobile verification result OR network analysis mobile trust issues
  const sigVerified = byKey.get('mobile_trust_gap_from_verification');
  const sigNetwork = byKey.get('mobile_trust_gap_detected');
  const sig = sigVerified || sigNetwork;
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  const allRefs = [makeRef('signal', sig.id)];
  const allEvidence = [...sig.evidence_refs];
  // Include both signals if available
  if (sigVerified && sigNetwork) {
    allRefs.push(makeRef('signal', sigNetwork.id));
    allEvidence.push(...sigNetwork.evidence_refs);
  }
  return [createInference({ inference_key: 'mobile_trust_gap', category: InferenceCategory.MobileTrustGap, conclusion: 'mobile_trust_gap', conclusion_value: severity, severity_hint: severity, confidence: Math.max(sig.confidence, sigNetwork?.confidence ?? 0, sigVerified?.confidence ?? 0), scoping, cycle_ref, ids, signal_refs: allRefs, evidence_refs: allEvidence, reasoning: `Mobile visitors see fewer trust signals than desktop visitors — security badges, testimonials, and guarantees are hidden or broken on mobile. Trust degradation on mobile is confirmed by ${sigVerified ? 'browser verification' : 'network analysis'} showing ${sig.numeric_value} trust-related failures. Since mobile represents the majority of traffic for most sites, this trust gap directly suppresses mobile conversion.`, reasoning_slots: { severity } })];
}

function inferBehavioralMicroPatternCascade(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('behavioral_micro_pattern_cascade');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'behavioral_micro_pattern_cascade', category: InferenceCategory.BehavioralMicroPatternCascade, conclusion: 'behavioral_micro_pattern_cascade', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Multiple behavioral friction signals are firing simultaneously — users are hesitating, clicking dead elements, and navigating back repeatedly. ${sig.numeric_value} compound indicators triggered at once. This pattern indicates systematic UX confusion, not isolated issues. When hesitation, dead clicks, pricing doubt, form retries, and backtrack navigation combine, the root cause is architectural rather than cosmetic — the entire decision flow needs restructuring.`, reasoning_slots: { severity, factors: sig.numeric_value ?? 0 } })];
}

export function computeWave4ExtensionsPack(input: PackInput): Inference[] {
  const { first, byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  // Wave 4.1: Cybersecurity Phase 2
  out.push(...inferInformationDisclosure(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferScriptSupplyChainRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferAuthSurfaceInsecure(first, byKey, scoping, cycle_ref, ids));
  // Wave 4.2: LLM Enrichment
  out.push(...inferPricingOfferUnclear(byKey, scoping, cycle_ref, ids));
  out.push(...inferPagePurposeMismatch(byKey, scoping, cycle_ref, ids));
  out.push(...inferStructuredDataMismatch(byKey, scoping, cycle_ref, ids));
  // Wave 4.6: Neglected Findings
  out.push(...inferPaymentHandoffDropoff(byKey, scoping, cycle_ref, ids));
  out.push(...inferSaasActivationGap(byKey, scoping, cycle_ref, ids));
  out.push(...inferOscillationClustering(byKey, scoping, cycle_ref, ids));
  out.push(...inferNetworkErrorWeighted(byKey, scoping, cycle_ref, ids));
  out.push(...inferMobileTrustGap(byKey, scoping, cycle_ref, ids));
  out.push(...inferBehavioralMicroPatternCascade(byKey, scoping, cycle_ref, ids));
  return out;
}
