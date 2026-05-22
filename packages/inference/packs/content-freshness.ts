// ──────────────────────────────────────────────
// Pack: content_freshness (Wave 8.3)
//
// Content decay inferences: stale commercial pages, outdated pricing,
// expired social proof, decay progression. 4 functions.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:1817-1925.
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

// Wave 8.3: Content Freshness & Decay Inferences
// ──────────────────────────────────────────────

function inferCommercialPageStale(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Fires when copy staleness is detected on commercial pages (checkout, pricing, product, homepage)
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('copy_stale_references_'));
  if (matches.length === 0) return [];

  // Weight by page type — higher-conversion pages get higher severity
  const signals = matches.map(([, s]) => s);
  const highStakePages = signals.filter(s => {
    const url = (s.description || '').toLowerCase();
    return url.includes('/checkout') || url.includes('/pricing') || url.includes('/cart') || url.includes('/product');
  });

  if (highStakePages.length === 0) return [];

  const worstScore = Math.max(...highStakePages.map(s => s.numeric_value ?? 0));
  const severity = worstScore > 60 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'commercial_page_stale',
    category: InferenceCategory.CommercialPageStale,
    conclusion: 'commercial_page_stale',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85,
    scoping, cycle_ref, ids,
    signal_refs: highStakePages.map(s => makeRef('signal', s.id)),
    evidence_refs: highStakePages.flatMap(s => s.evidence_refs),
    reasoning: `${highStakePages.length} high-conversion page(s) have stale content (worst score ${worstScore}/100). Commercial pages — checkout, pricing, product — are where buying decisions happen. Outdated content on these surfaces directly reduces conversion confidence.`,
    reasoning_slots: { severity, worstScore },
  })];
}

function inferPricingPageOutdated(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('pricing_page_stale_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worstScore = Math.max(...signals.map(s => s.numeric_value ?? 0));
  const severity = worstScore > 60 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'pricing_page_outdated',
    category: InferenceCategory.PricingPageOutdated,
    conclusion: 'pricing_page_outdated',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Pricing page has stale content (staleness score ${worstScore}/100). The pricing page is the highest-leverage conversion surface — outdated competitor comparisons, old feature lists, or stale promotional claims directly reduce willingness to pay. Buyers cross-reference pricing with competitors; stale claims are instantly detectable.`,
    reasoning_slots: { severity, worstScore },
  })];
}

function inferSocialProofExpired(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('social_proof_expired_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const totalStaleElements = signals.reduce((sum, s) => sum + (s.numeric_value ?? 0), 0);
  const severity = totalStaleElements >= 6 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'social_proof_expired',
    category: InferenceCategory.SocialProofExpired,
    conclusion: 'social_proof_expired',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 80,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `${totalStaleElements} expired social proof element(s) across ${matches.length} page(s). Testimonials with old dates, outdated customer counts, or stale revenue metrics signal that nobody is actively using or maintaining the product. Fresh social proof converts 42% better than dated references.`,
    reasoning_slots: { severity, totalStaleElements },
  })];
}

function inferContentDecayProgression(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // This inference fires when the EXISTING copy_stale_references signal is present
  // AND its numeric_value (staleness score) is high enough to indicate active decay.
  // The full N-cycle trend detection happens in the trend engine (Wave 7.1);
  // this inference captures the single-cycle severity for the pack decision.
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('copy_stale_references_'));
  if (matches.length < 2) return []; // Need staleness across multiple pages to infer decay

  const signals = matches.map(([, s]) => s);
  const avgScore = signals.reduce((sum, s) => sum + (s.numeric_value ?? 0), 0) / signals.length;

  if (avgScore < 40) return []; // Not enough aggregate staleness

  const severity = avgScore > 60 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'content_decay_progression',
    category: InferenceCategory.ContentDecayProgression,
    conclusion: 'content_decay_progression',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 75, // Slightly lower — aggregate heuristic
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Content decay detected across ${matches.length} pages (average staleness ${Math.round(avgScore)}/100). When multiple commercial pages show signs of neglect simultaneously, the site signals systemic content abandonment. AI search engines deprioritize stale content — sites last updated >30 days ago on competitive topics are 25.7% less likely to be cited.`,
    reasoning_slots: { severity, avgScore: Math.round(avgScore) },
  })];
}

export function computeContentFreshnessPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferCommercialPageStale(byKey, scoping, cycle_ref, ids));
  out.push(...inferPricingPageOutdated(byKey, scoping, cycle_ref, ids));
  out.push(...inferSocialProofExpired(byKey, scoping, cycle_ref, ids));
  out.push(...inferContentDecayProgression(byKey, scoping, cycle_ref, ids));
  return out;
}
