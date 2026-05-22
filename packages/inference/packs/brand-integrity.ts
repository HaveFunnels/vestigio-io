// ──────────────────────────────────────────────
// Pack: brand_integrity
//
// External brand mimicry + lookalike domain exposure inferences.
// 6 functions, all single-signal lookups via byKey.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:1567-1610.
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

// Phase 3E: Brand Integrity Inferences
// ──────────────────────────────────────────────

function inferLookalikeDomains(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('lookalike_domains_competing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'lookalike_domain_competing_for_traffic', category: InferenceCategory.LookalikeDomainCompetingForTraffic, conclusion: 'lookalike_domain_competing_for_traffic', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Active lookalike domains are competing for brand traffic. When customers search for the brand or type the domain from memory, some portion of traffic lands on impostor domains instead. This inflates effective customer acquisition cost — the brand pays for awareness that is captured by competitors or fraudsters through domain similarity.`, reasoning_slots: { severity } })];
}

function inferExternalMimicry(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('external_sites_mimicking_brand');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'external_sites_mimicking_brand', category: InferenceCategory.ExternalSitesMimickingBrand, conclusion: 'external_sites_mimicking_brand', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `External domains are actively mimicking the brand's identity — matching titles, descriptions, and content patterns. This is not passive domain squatting; these sites are designed to look like the real brand. Customers who land on these surfaces may share payment information with fraudsters, damaging both the customer and the brand's reputation.`, reasoning_slots: { severity } })];
}

function inferBrandTrafficDeceptive(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('brand_traffic_deceptive_surfaces');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'brand_traffic_exposed_to_deceptive_surfaces', category: InferenceCategory.BrandTrafficExposedToDeceptiveSurfaces, conclusion: 'brand_traffic_exposed_to_deceptive_surfaces', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Typosquat domains — near-identical misspellings of the brand — are active and reachable. Users who make common typing errors land on these surfaces instead of the real site. This diverts direct-type traffic, damages trust when users realize the mistake, and creates chargeback and fraud exposure when the impostor site processes transactions.`, reasoning_slots: { severity } })];
}

function inferSuspiciousDomainsPurchaseIntent(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('suspicious_domains_purchase_intent');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'suspicious_domains_capturing_purchase_intent', category: InferenceCategory.SuspiciousDomainsCapturingPurchaseIntent, conclusion: 'suspicious_domains_capturing_purchase_intent', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Lookalike domains show active commerce intent — checkout pages, cart functionality, or pricing structures. These are not passive parked domains; they are positioned to capture purchase-intent traffic and process transactions under a brand-similar identity. Revenue leakage is direct: customers who intended to buy from the brand are buying from impostors.`, reasoning_slots: { severity } })];
}

function inferPhishingExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('customers_exposed_to_phishing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'customers_exposed_to_phishing_surfaces', category: InferenceCategory.CustomersExposedToPhishingSurfaces, conclusion: 'customers_exposed_to_phishing_surfaces', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `High-confidence phishing surfaces combine brand domain similarity with active commerce patterns and content mimicry. Customers cannot distinguish these from the real site and may submit payment credentials to fraudsters. The downstream impact includes chargebacks on the brand's payment processor, legal liability from data breach exposure, and lasting trust damage when customers learn they were deceived through a brand-similar surface.`, reasoning_slots: { severity } })];
}

function inferBrandDilution(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('brand_diluted_across_variants');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'brand_presence_diluted_across_variants', category: InferenceCategory.BrandPresenceDilutedAcrossVariants, conclusion: 'brand_presence_diluted_across_variants', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `The brand's online presence is fragmented across many domain variants — each one diluting the authority of the legitimate site. Search engines may split ranking signals across multiple similar domains, reducing organic visibility. Buyers encountering multiple brand-similar sites lose confidence in which one is real, suppressing click-through and trust across all surfaces.`, reasoning_slots: { severity } })];
}

export function computeBrandIntegrityPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferLookalikeDomains(byKey, scoping, cycle_ref, ids));
  out.push(...inferExternalMimicry(byKey, scoping, cycle_ref, ids));
  out.push(...inferBrandTrafficDeceptive(byKey, scoping, cycle_ref, ids));
  out.push(...inferSuspiciousDomainsPurchaseIntent(byKey, scoping, cycle_ref, ids));
  out.push(...inferPhishingExposure(byKey, scoping, cycle_ref, ids));
  out.push(...inferBrandDilution(byKey, scoping, cycle_ref, ids));
  return out;
}
