// ──────────────────────────────────────────────
// Pack: copy_alignment
//
// All copy + persuasion inferences:
//   - Wave 3.1 Tier 2 LLM enrichment (3 funcs): generic social proof,
//     form error helpfulness, onboarding quick-win
//   - Tier 1 Copy Analysis (4 funcs): checkout trust language, CTA
//     clarity, product page copy, pricing framing
//   - Wave 3.10 Copy Pack (8 funcs): value prop buried, social proof
//     ineffective, objections unaddressed, urgency dark pattern,
//     onboarding copy, navigation, above-fold cluttered, cross-page
//     inconsistency
//   - Wave 3.10 Polish (4 funcs): localization persuasion lost,
//     micro-copy friction, SEO-conversion conflict, stale references
//
// 19 functions total. Order preserved from inline sequence.
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

// Tier 1 Copy Analysis Inferences
// ──────────────────────────────────────────────

function inferCheckoutTrustLanguageAbsent(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Look for signals with the checkout_trust_language_absent prefix
  const matches = Array.from(byKey.entries()).filter(([k]) => k.startsWith('checkout_trust_language_absent_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 20 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_trust_language_absent',
    category: InferenceCategory.CheckoutTrustLanguageAbsent,
    conclusion: 'checkout_trust_language_absent',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Checkout pages lack trust language (trust score ${score}/100). Buyers at the payment moment see no security language, guarantees, or social proof — the absence of reassurance at the most anxious point in the journey directly suppresses conversion.`,
    reasoning_slots: { severity, score },
  })];
}

function inferCtaClarityWeak(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = Array.from(byKey.entries()).filter(([k]) => k.startsWith('cta_clarity_weak_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 30 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'cta_clarity_weak_on_commercial',
    category: InferenceCategory.CtaClarityWeak,
    conclusion: 'cta_clarity_weak_on_commercial',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Commercial pages have weak CTA clarity (score ${score}/100). Competing, generic, or unclear calls-to-action leave visitors unsure what to do next — when every button competes equally, none wins the click.`,
    reasoning_slots: { severity, score },
  })];
}

function inferProductPageCopyGeneric(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = Array.from(byKey.entries()).filter(([k]) => k.startsWith('product_description_generic_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 20 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'product_page_copy_generic',
    category: InferenceCategory.ProductPageCopyGeneric,
    conclusion: 'product_page_copy_generic',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Product pages use generic supplier text (quality score ${score}/100). Manufacturer-standard descriptions fail to differentiate, address objections, or communicate benefits — buyers comparison-shop and leave because every store says the same thing.`,
    reasoning_slots: { severity, score },
  })];
}

function inferPricingPageFramingUnclear(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = Array.from(byKey.entries()).filter(([k]) => k.startsWith('pricing_page_framing_weak_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 25 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'pricing_page_framing_unclear',
    category: InferenceCategory.PricingPageFramingUnclear,
    conclusion: 'pricing_page_framing_unclear',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Pricing page framing is weak (framing score ${score}/100). When the recommended plan isn't obvious, features aren't framed as benefits, and objections aren't handled — visitors stall at the plan selection step because they can't decide.`,
    reasoning_slots: { severity, score },
  })];
}

// Wave 20.6 — local createInference removed. Imported from ./shared/builders.

// ──────────────────────────────────────────────
// Wave 3.1 Tier 2: LLM Enrichment Inferences
// Dormant until enrichment signals are produced.
// ──────────────────────────────────────────────

function inferSocialProofGeneric(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('social_proof_quality_low_'));
  if (matches.length === 0) return [];
  const sig = matches.reduce((best, [, s]) => (!best || (s.numeric_value ?? 0) > (best.numeric_value ?? 0) ? s : best), undefined as Signal | undefined)!;
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'social_proof_generic', category: InferenceCategory.SocialProofGeneric, conclusion: 'social_proof_generic', conclusion_value: severity, severity_hint: severity, confidence: Math.min(80, sig.confidence + 5), scoping, cycle_ref, ids, signal_refs: matches.map(([, s]) => makeRef('signal', s.id)), evidence_refs: matches.flatMap(([, s]) => s.evidence_refs), reasoning: `Testimonials are generic and unattributed. Reviews like "Great product!" without a name, company, or measurable outcome reduce trust instead of building it — buyers question if the reviews are real. ${matches.length} page(s) show social proof that lacks specificity.`, reasoning_slots: { severity } })];
}

function inferFormErrorMessagesUnhelpful(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('form_error_messages_poor_'));
  if (matches.length === 0) return [];
  const sig = matches.reduce((best, [, s]) => (!best || (s.numeric_value ?? 0) > (best.numeric_value ?? 0) ? s : best), undefined as Signal | undefined)!;
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'form_error_messages_unhelpful', category: InferenceCategory.FormErrorMessagesUnhelpful, conclusion: 'form_error_messages_unhelpful', conclusion_value: severity, severity_hint: severity, confidence: Math.min(80, sig.confidence + 5), scoping, cycle_ref, ids, signal_refs: matches.map(([, s]) => makeRef('signal', s.id)), evidence_refs: matches.flatMap(([, s]) => s.evidence_refs), reasoning: `Form error messages are technical instead of helpful. When a buyer enters an invalid email and sees "Invalid input" instead of "Please enter a valid email (e.g. name@example.com)", they don't know what to fix and abandon the form. ${matches.length} form(s) use generic or technical error messages.`, reasoning_slots: { severity } })];
}

function inferOnboardingNoQuickWin(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('onboarding_quick_win_absent_'));
  if (matches.length === 0) return [];
  const sig = matches.reduce((best, [, s]) => (!best || (s.numeric_value ?? 0) > (best.numeric_value ?? 0) ? s : best), undefined as Signal | undefined)!;
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'onboarding_no_quick_win', category: InferenceCategory.OnboardingNoQuickWin, conclusion: 'onboarding_no_quick_win', conclusion_value: severity, severity_hint: severity, confidence: Math.min(80, sig.confidence + 5), scoping, cycle_ref, ids, signal_refs: matches.map(([, s]) => makeRef('signal', s.id)), evidence_refs: matches.flatMap(([, s]) => s.evidence_refs), reasoning: `New users don't experience product value in the first session. Without a quick win in the first minutes — a visible result, a completed setup, a personalized recommendation — trial users conclude the product isn't for them and never return. ${matches.length} onboarding surface(s) lack immediate value delivery.`, reasoning_slots: { severity } })];
}

// ──────────────────────────────────────────────
// Wave 3.10 Copy Analysis Pack Inferences
// ──────────────────────────────────────────────

function inferValuePropositionBuried(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const absentMatches = [...byKey.entries()].filter(([k]) => k.startsWith('value_proposition_absent_'));
  const belowFoldMatches = [...byKey.entries()].filter(([k]) => k.startsWith('value_proposition_below_fold_'));
  const allMatches = [...absentMatches, ...belowFoldMatches];
  if (allMatches.length === 0) return [];

  const signals = allMatches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 30 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'value_proposition_buried',
    category: InferenceCategory.ValuePropositionBuried,
    conclusion: 'value_proposition_buried',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(85, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `The value proposition is ${score < 30 ? 'absent' : 'buried below the fold'} (score ${score}/100). Visitors cannot tell what you do or why it matters within 5 seconds of landing. The hero section — the single highest-leverage piece of copy on the site — fails to communicate the core promise. ${allMatches.length} page(s) affected.`,
    reasoning_slots: { severity, score },
  })];
}

function inferSocialProofIneffective(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const genericMatches = [...byKey.entries()].filter(([k]) => k.startsWith('social_proof_generic_'));
  const misplacedMatches = [...byKey.entries()].filter(([k]) => k.startsWith('social_proof_misplaced_'));
  const allMatches = [...genericMatches, ...misplacedMatches];
  if (allMatches.length === 0) return [];

  const signals = allMatches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 30 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'social_proof_ineffective',
    category: InferenceCategory.SocialProofIneffective,
    conclusion: 'social_proof_ineffective',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Social proof is present but ineffective — ${genericMatches.length > 0 ? 'testimonials lack names, companies, or measurable outcomes' : ''}${genericMatches.length > 0 && misplacedMatches.length > 0 ? ' and ' : ''}${misplacedMatches.length > 0 ? 'proof is placed away from decision points' : ''}. Generic or misplaced social proof doesn't just fail to convince — it signals inauthenticity. ${allMatches.length} page(s) affected.`,
    reasoning_slots: { severity, score },
  })];
}

function inferObjectionUnaddressed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('objection_unaddressed_at_decision_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 20 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'objection_unaddressed',
    category: InferenceCategory.ObjectionUnaddressed,
    conclusion: 'objection_unaddressed',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Key buyer objections go unanswered on decision pages (objection coverage score ${score}/100). Pricing pages without FAQ or guarantee, product pages without comparison or risk reversal — buyers who can't find answers to their concerns leave and buy from someone who addresses them. ${matches.length} decision page(s) affected.`,
    reasoning_slots: { severity, score },
  })];
}

function inferUrgencyDarkPattern(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('urgency_dark_pattern_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);

  return [createInference({
    inference_key: 'urgency_dark_pattern',
    category: InferenceCategory.UrgencyDarkPattern,
    conclusion: 'urgency_dark_pattern',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: Math.min(85, signals[0].confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Manipulative urgency/scarcity tactics detected on ${matches.length} page(s). Fake countdown timers, fabricated stock levels, and manufactured urgency erode trust and may violate consumer protection regulations. Short-term conversion gains from dark patterns are offset by increased returns, chargebacks, and brand damage.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferOnboardingCopyWeak(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('onboarding_no_quick_win_copy_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);

  return [createInference({
    inference_key: 'onboarding_copy_weak',
    category: InferenceCategory.OnboardingCopyWeak,
    conclusion: 'onboarding_copy_weak',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: Math.min(75, signals[0].confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Onboarding copy does not promise or deliver a quick win on ${matches.length} surface(s). The copy fails to guide new users to an immediate value moment — without a clear "here's what you'll get in 2 minutes" promise, users disengage before experiencing the product's core benefit.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferNavigationConfusing(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('navigation_jargon_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 30 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'navigation_confusing',
    category: InferenceCategory.NavigationConfusing,
    conclusion: 'navigation_confusing',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Navigation uses internal jargon instead of buyer language (clarity score ${score}/100). When navigation labels don't match the words buyers think in, they can't find what they need and leave — navigation is the silent CTA hierarchy that either guides or loses visitors. ${matches.length} surface(s) affected.`,
    reasoning_slots: { severity, score },
  })];
}

function inferAboveFoldCluttered(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('above_fold_cluttered_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 25 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'above_fold_cluttered',
    category: InferenceCategory.AboveFoldCluttered,
    conclusion: 'above_fold_cluttered',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Above-the-fold area is cluttered (density score ${score}/100). Too many elements, competing CTAs, and visual noise above the fold bury the value proposition and overwhelm visitors — when everything screams for attention, nothing gets it. ${matches.length} page(s) affected.`,
    reasoning_slots: { severity, score },
  })];
}

function inferCopyCrossPageInconsistent(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('copy_tone_inconsistent_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 30 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'copy_cross_page_inconsistent',
    category: InferenceCategory.CopyCrossPageInconsistent,
    conclusion: 'copy_cross_page_inconsistent',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Pages contradict each other or shift tone (consistency score ${score}/100). Homepage promises "simple" but pricing page is complex. Landing page is casual but checkout is formal. These contradictions erode buyer confidence because the brand feels like it's run by different people. ${matches.length} page(s) flagged.`,
    reasoning_slots: { severity, score },
  })];
}

// ──────────────────────────────────────────────
// Wave 3.10 Fase 4: Polish Enrichment Inferences
// ──────────────────────────────────────────────

function inferLocalizationPersuasionLost(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('localization_persuasion_lost_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 30 ? 'high' : score < 45 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'localization_persuasion_lost',
    category: InferenceCategory.LocalizationPersuasionLost,
    conclusion: 'localization_persuasion_lost',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Translated page(s) lost persuasive power during localization (quality score ${score}/100). Urgency language, social proof specificity, CTA power, or value proposition framing was flattened into generic literal translation. ${matches.length} locale comparison(s) flagged. Buyers in non-primary locales see a weaker sales message.`,
    reasoning_slots: { severity, score },
  })];
}

function inferMicroCopyFrictionHigh(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('micro_copy_friction_high_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 100) < (b.numeric_value ?? 100) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score < 20 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'micro_copy_friction_high',
    category: InferenceCategory.MicroCopyFrictionHigh,
    conclusion: 'micro_copy_friction_high',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Micro-copy creates unnecessary friction on form/app pages (score ${score}/100). Generic button labels like "Submit", unclear form labels, missing helper text, or technical error messages make users work harder than they should. ${matches.length} page(s) flagged. Every confusing label is a moment where the user stops and considers leaving.`,
    reasoning_slots: { severity, score },
  })];
}

function inferSeoConversionConflict(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('seo_conversion_conflict_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 0) > (b.numeric_value ?? 0) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score > 80 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'seo_conversion_conflict',
    category: InferenceCategory.SeoConversionConflict,
    conclusion: 'seo_conversion_conflict',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, worst.confidence + 5),
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `SEO optimization conflicts with conversion persuasion (tension score ${score}/100). Headlines read like search queries instead of compelling statements, keyword stuffing dilutes the sales message, or the H1 targets a keyword but fails to communicate value. ${matches.length} page(s) flagged. Search traffic arrives but the page reads like it was written for Google, not for buyers.`,
    reasoning_slots: { severity, score },
  })];
}

function inferCopyStaleReferences(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('copy_stale_references_'));
  if (matches.length === 0) return [];

  const signals = matches.map(([, s]) => s);
  const worst = signals.reduce((a, b) => (a.numeric_value ?? 0) > (b.numeric_value ?? 0) ? a : b);
  const score = worst.numeric_value ?? 0;
  const severity = score > 60 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'copy_stale_references',
    category: InferenceCategory.CopyStaleReferences,
    conclusion: 'copy_stale_references',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85, // Parser-based, fixed confidence
    scoping, cycle_ref, ids,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning: `Stale content detected across ${matches.length} page(s) (worst staleness score ${score}/100). Outdated copyright years, past dates, expired promotion references, or old social proof numbers signal neglect. Buyers notice when a site looks abandoned — an old copyright year or a "Black Friday sale" in March tells them nobody is maintaining this store.`,
    reasoning_slots: { severity, score },
  })];
}
// ──────────────────────────────────────────────

export function computeCopyAlignmentPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  // Wave 3.1 Tier 2: LLM enrichment
  out.push(...inferSocialProofGeneric(byKey, scoping, cycle_ref, ids));
  out.push(...inferFormErrorMessagesUnhelpful(byKey, scoping, cycle_ref, ids));
  out.push(...inferOnboardingNoQuickWin(byKey, scoping, cycle_ref, ids));
  // Tier 1 Copy Analysis
  out.push(...inferCheckoutTrustLanguageAbsent(byKey, scoping, cycle_ref, ids));
  out.push(...inferCtaClarityWeak(byKey, scoping, cycle_ref, ids));
  out.push(...inferProductPageCopyGeneric(byKey, scoping, cycle_ref, ids));
  out.push(...inferPricingPageFramingUnclear(byKey, scoping, cycle_ref, ids));
  // Wave 3.10 Copy Pack
  out.push(...inferValuePropositionBuried(byKey, scoping, cycle_ref, ids));
  out.push(...inferSocialProofIneffective(byKey, scoping, cycle_ref, ids));
  out.push(...inferObjectionUnaddressed(byKey, scoping, cycle_ref, ids));
  out.push(...inferUrgencyDarkPattern(byKey, scoping, cycle_ref, ids));
  out.push(...inferOnboardingCopyWeak(byKey, scoping, cycle_ref, ids));
  out.push(...inferNavigationConfusing(byKey, scoping, cycle_ref, ids));
  out.push(...inferAboveFoldCluttered(byKey, scoping, cycle_ref, ids));
  out.push(...inferCopyCrossPageInconsistent(byKey, scoping, cycle_ref, ids));
  // Wave 3.10 Polish
  out.push(...inferLocalizationPersuasionLost(byKey, scoping, cycle_ref, ids));
  out.push(...inferMicroCopyFrictionHigh(byKey, scoping, cycle_ref, ids));
  out.push(...inferSeoConversionConflict(byKey, scoping, cycle_ref, ids));
  out.push(...inferCopyStaleReferences(byKey, scoping, cycle_ref, ids));
  return out;
}
