// ──────────────────────────────────────────────
// Pack: discoverability
//
// Search/social discoverability inferences — weak representation,
// social preview failures, brand inconsistency across surfaces,
// pages unlikely to be indexed. 7 functions.
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

// Phase 3E: Discoverability Inferences
// ──────────────────────────────────────────────

function inferWeakSearchRepresentation(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_weak_search_representation');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'commercial_pages_weak_search_representation', category: InferenceCategory.CommercialPagesWeakSearchRepresentation, conclusion: 'commercial_pages_weak_search_representation', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `High-intent commercial pages have missing or thin titles and descriptions. When search engines display these pages in results, the snippets are generic or auto-generated — reducing click-through rate. Every missed click on a high-intent query is discoverable demand that never reaches the site.`, reasoning_slots: { severity } })];
}

function inferSocialPreviewsFailValue(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('social_previews_fail_commercial_value');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'social_previews_fail_commercial_value', category: InferenceCategory.SocialPreviewsFailCommercialValue, conclusion: 'social_previews_fail_commercial_value', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `When commercial pages are shared via messaging, social media, or email, they appear as raw URLs without product images, compelling titles, or value propositions. In a world where link previews drive click-through, a bare URL is a wasted distribution opportunity. Every share that fails to communicate value is a conversion the brand already earned but cannot capture.`, reasoning_slots: { severity } })];
}

function inferBrandInconsistentSurfaces(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('brand_inconsistent_across_surfaces');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'brand_inconsistent_across_surfaces', category: InferenceCategory.BrandInconsistentAcrossSurfaces, conclusion: 'brand_inconsistent_across_surfaces', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `The brand appears inconsistently across search results, social previews, and sharing surfaces. When titles and descriptions vary widely between commercial pages, search engines cannot build a coherent brand signal. Buyers see an unreliable brand presence — some pages look professional while others look unfinished — reducing both click-through and trust.`, reasoning_slots: { severity } })];
}

function inferCommercialPagesUnlikelyIndexed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_unlikely_indexed');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'commercial_pages_unlikely_indexed', category: InferenceCategory.CommercialPagesUnlikelyIndexed, conclusion: 'commercial_pages_unlikely_indexed', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Revenue-generating pages have indexing problems — missing canonical URLs or explicit noindex directives. Search engines may not reliably include these pages in results. Demand that exists for these products or services cannot find the site through search, even when the content is commercially relevant.`, reasoning_slots: { severity } })];
}

function inferWeakSemanticIntentSignals(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('weak_semantic_intent_signals');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'weak_semantic_intent_signals', category: InferenceCategory.WeakSemanticIntentSignals, conclusion: 'weak_semantic_intent_signals', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Search engines and AI systems receive weak signals about what these commercial pages offer. Without structured data (Product, Organization, Offer schemas), ranking algorithms and AI assistants must guess page purpose from raw HTML. The result is lower ranking for commercial queries and inaccurate AI-generated summaries that fail to capture the business offering.`, reasoning_slots: { severity } })];
}

function inferPreviewsDisconnectedConversion(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('previews_disconnected_from_conversion');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'previews_disconnected_from_conversion', category: InferenceCategory.PreviewsDisconnectedFromConversion, conclusion: 'previews_disconnected_from_conversion', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Social and search previews show content that doesn't match the actual page. Visitors clicking through arrive with expectations set by the preview but encounter different content — creating a mismatch that drives immediate drop-off. The gap between what was promised and what was delivered converts the traffic acquisition cost into waste.`, reasoning_slots: { severity } })];
}

function inferCommercialPagesNotExposed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_not_exposed_for_discovery');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'commercial_pages_not_exposed_for_discovery', category: InferenceCategory.CommercialPagesNotExposedForDiscovery, conclusion: 'commercial_pages_not_exposed_for_discovery', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Key commercial pages have no internal links pointing to them — they exist in the site structure but are invisible to crawlers and users navigating the site. Without structural exposure, search engines cannot discover these pages reliably, and organic demand for the products or services offered on them cannot reach the site.`, reasoning_slots: { severity } })];
}


export function computeDiscoverabilityPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferWeakSearchRepresentation(byKey, scoping, cycle_ref, ids));
  out.push(...inferSocialPreviewsFailValue(byKey, scoping, cycle_ref, ids));
  out.push(...inferBrandInconsistentSurfaces(byKey, scoping, cycle_ref, ids));
  out.push(...inferCommercialPagesUnlikelyIndexed(byKey, scoping, cycle_ref, ids));
  out.push(...inferWeakSemanticIntentSignals(byKey, scoping, cycle_ref, ids));
  out.push(...inferPreviewsDisconnectedConversion(byKey, scoping, cycle_ref, ids));
  out.push(...inferCommercialPagesNotExposed(byKey, scoping, cycle_ref, ids));
  return out;
}
