// ──────────────────────────────────────────────
// Pack: behavioral
//
// Behavioral Intelligence inferences — Phase 4B + Phase 4B Hardening.
// 20 inferences total. All single-signal lookups with severity from
// sig.value, single createInference emission.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:1632-1849.
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

// Phase 4B: Behavioral Intelligence Inferences
// ──────────────────────────────────────────────

function inferPolicyViewAbandonment(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('policy_view_then_abandonment');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'policy_view_then_abandonment', category: InferenceCategory.PolicyViewThenAbandonment, conclusion: 'policy_view_then_abandonment', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Sessions that open refund or return policy pages are abandoning without returning to the commercial flow. The policy content is triggering doubt rather than building confidence — buyers read the return terms and decide not to buy. This is behavioral evidence that the policy presentation is creating hesitation rather than resolving it.`, reasoning_slots: { severity } })];
}

function inferHighIntentDetour(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('high_intent_detour_before_abandonment');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'high_intent_detour_before_abandonment', category: InferenceCategory.HighIntentDetourBeforeAbandonment, conclusion: 'high_intent_detour_before_abandonment', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Buyers who reached the checkout step are detouring into reassurance content (FAQ, support, policy) before abandoning. These are high-intent sessions that failed to convert despite reaching the purchase moment — they needed reassurance that was not already embedded in the checkout experience and went looking for it elsewhere.`, reasoning_slots: { severity } })];
}

function inferSupportTooLateToConvert(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('support_discovered_too_late');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'support_discovered_too_late_to_convert', category: InferenceCategory.SupportDiscoveredTooLateToConvert, conclusion: 'support_discovered_too_late_to_convert', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Support channels are being discovered only after users have already reached the purchase step. By the time buyers find help, their pre-purchase questions have already driven abandonment decisions. If support were accessible earlier in the journey — on product, pricing, or cart pages — it could resolve hesitation before it becomes abandonment.`, reasoning_slots: { severity } })];
}

function inferCtaBehaviorallyDead(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cta_visible_but_dead');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'cta_visible_but_behaviorally_dead', category: InferenceCategory.CtaVisibleButBehaviorallyDead, conclusion: 'cta_visible_but_behaviorally_dead', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Commercial CTAs on key surfaces are visible to users but generate near-zero behavioral engagement. Users see the call-to-action but do not click — indicating either the CTA copy fails to motivate action, the placement is wrong, or the surrounding context (pricing, trust, value proposition) is insufficient to drive progression.`, reasoning_slots: { severity } })];
}

function inferPurchaseHesitationBacktrack(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('purchase_hesitation_backtrack');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'purchase_hesitation_with_backtrack', category: InferenceCategory.PurchaseHesitationWithBacktrack, conclusion: 'purchase_hesitation_with_backtrack', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `A significant portion of sessions are backtracking during the purchase journey — reaching a commercial step and then retreating to previous pages. This behavioral pattern indicates hesitation at the moment of commitment: buyers want to proceed but lack the confidence to do so. The missing element is typically trust reinforcement, price justification, or reassurance content at the decision point.`, reasoning_slots: { severity } })];
}

function inferCriticalStepRetries(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('critical_step_retries_before_abandonment');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'critical_step_retries_before_abandonment', category: InferenceCategory.CriticalStepRetriesBeforeAbandonment, conclusion: 'critical_step_retries_before_abandonment', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users are repeatedly attempting the same critical step before giving up. This is not casual browsing — these are users who want to complete the action but encounter errors, confusion, or friction that blocks them. Each retry represents a user fighting the interface before ultimately losing patience and abandoning.`, reasoning_slots: { severity } })];
}

function inferMobileFirstActionFails(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mobile_fails_first_commercial_action');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'mobile_fails_first_commercial_action', category: InferenceCategory.MobileFailsFirstCommercialAction, conclusion: 'mobile_fails_first_commercial_action', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Mobile users are failing to progress past the first commercial action at a rate that significantly exceeds acceptable thresholds. The mobile entry point to the commercial flow is broken or unusable — meaning the majority of traffic (mobile users) hits a dead end before the commercial journey even begins.`, reasoning_slots: { severity } })];
}

function inferFunnelStepStalled(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('funnel_step_alive_not_advancing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'funnel_step_alive_but_not_advancing', category: InferenceCategory.FunnelStepAliveButNotAdvancing, conclusion: 'funnel_step_alive_but_not_advancing', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Funnel steps that are actively receiving sessions are failing to advance users to the next step. These surfaces are alive from a vitality perspective but are behavioral dead ends — users arrive but do not progress. The step exists in the flow but does not function as a transition point, creating a bottleneck that blocks the entire downstream funnel.`, reasoning_slots: { severity } })];
}

// ──────────────────────────────────────────────
// Phase 4B Hardening: 12 New Behavioral Inferences
// ──────────���──────────────────────────────���────

function inferHesitationBeforeConversionMissingTrust(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('hesitation_before_conversion_missing_trust');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'hesitation_before_conversion_missing_trust', category: InferenceCategory.HesitationBeforeConversionMissingTrust, conclusion: 'hesitation_before_conversion_missing_trust', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users hesitate before the primary conversion action on commercial surfaces. The pause pattern before CTA engagement indicates insufficient trust or reassurance at the decision point — buyers see the action, want to proceed, but lack the confidence signals they need to commit. The root cause is missing trust reinforcement (guarantees, social proof, policy visibility, support access) near the CTA zone.`, reasoning_slots: { severity } })];
}

function inferPricingHesitationUnclearValue(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('pricing_hesitation_unclear_value');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'pricing_hesitation_unclear_value', category: InferenceCategory.PricingHesitationUnclearValue, conclusion: 'pricing_hesitation_unclear_value', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users view pricing then backtrack to product or explanation pages without advancing to conversion. The pricing surface creates a decision moment that the value proposition fails to carry — buyers see the price, cannot justify it from the surrounding context, and retreat to seek additional justification rather than proceeding.`, reasoning_slots: { severity } })];
}

function inferPolicyDetourBeforeConversion(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('policy_detour_before_conversion');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'policy_detour_before_conversion', category: InferenceCategory.PolicyDetourBeforeConversion, conclusion: 'policy_detour_before_conversion', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users open policy pages after expressing purchase intent but before completing conversion. This pre-conversion policy detour indicates trust uncertainty at the commitment moment — buyers need to verify refund terms, privacy conditions, or terms of service before they feel safe proceeding. The root cause is insufficient confidence at the point of commitment, not general information seeking.`, reasoning_slots: { severity } })];
}

function inferCtaViewedNotEngaged(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cta_viewed_not_engaged');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'cta_viewed_not_engaged', category: InferenceCategory.CtaViewedNotEngaged, conclusion: 'cta_viewed_not_engaged', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `The primary CTA is behaviorally visible to users — scrolled into view on pages with meaningful traffic — but generates disproportionately low engagement. Users see the call-to-action but do not interact with it. The CTA is present but not compelling: weak positioning, unclear copy, or insufficient surrounding context (value proposition, trust signals, urgency) fails to motivate action.`, reasoning_slots: { severity } })];
}

function inferSensitiveInputAbandonment(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('sensitive_input_abandonment');
  if (!sig) return [];
  // Parse severity:field_kind from encoded signal value
  const parts = sig.value.split(':');
  const severity = parts[0] === 'high' ? 'high' : parts[0] === 'medium' ? 'medium' : 'low';
  const fieldKind = parts[1] || null;
  // Suppress if no concrete field kind — requirement from governance rules
  if (!fieldKind) return [];

  const FIELD_LABELS: Record<string, string> = {
    email: 'email', phone: 'phone number', card_like: 'payment card',
    cpf_cnpj_like: 'identity document (CPF/CNPJ)', password: 'password',
    address: 'address',
  };
  const fieldLabel = FIELD_LABELS[fieldKind] || fieldKind;

  // Sub-cause classification for richer reasoning
  const isIdentityField = fieldKind === 'cpf_cnpj_like' || fieldKind === 'password';
  const isPaymentField = fieldKind === 'card_like';
  const isContactField = fieldKind === 'email' || fieldKind === 'phone';

  let rootCauseContext: string;
  if (isPaymentField) {
    rootCauseContext = 'The root cause is lack of payment security reassurance — users encounter card fields without sufficient trust indicators (security badges, provider logos, encryption signals) to justify entering payment data.';
  } else if (isIdentityField) {
    rootCauseContext = 'The root cause is an unjustified sensitive data request — users are asked for identity documents or credentials at a point where the form has not established why this data is necessary or how it will be protected.';
  } else if (isContactField) {
    rootCauseContext = 'The root cause is premature personal data collection — users encounter contact fields before sufficient value exchange or trust context has been established, triggering privacy concern.';
  } else {
    rootCauseContext = 'The root cause is a trust deficit at the data capture point — the form asks for information without adequate context about why it is needed or what the user gets in return.';
  }

  return [createInference({ inference_key: 'sensitive_input_abandonment', category: InferenceCategory.SensitiveInputAbandonment, conclusion: 'sensitive_input_abandonment', conclusion_value: `${severity}:${fieldKind}`, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users abandon the form after interacting with ${fieldLabel} input fields. ${rootCauseContext}`, reasoning_slots: { severity } })];
}

function inferFormExcessiveFieldsBeforeConversion(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('form_excessive_fields_before_conversion');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  // Differentiate sub-cause: excessive length vs sensitive mix
  // The signal carries numeric_value = form_excessive_field_count
  const formCount = sig.numeric_value ?? 1;
  let subCauseReasoning: string;
  if (formCount >= 3) {
    subCauseReasoning = `Multiple conversion-proximate forms (${formCount}) require excessive input. The root cause is form proliferation — the conversion path demands data collection across too many forms, each adding cognitive load and abandonment risk. Users who are ready to convert encounter a data collection wall that compounds across steps.`;
  } else {
    subCauseReasoning = `Conversion-proximate forms demand disproportionate data collection through excessive field counts or sensitive field combinations. The root cause is a form that asks for more than the conversion step justifies — unnecessary fields reduce completion rate, and sensitive fields (payment, identity, contact) without trust context accelerate abandonment. The friction is not about form length alone but about the mismatch between what is asked and what the user perceives as necessary at this stage.`;
  }
  return [createInference({ inference_key: 'form_excessive_fields_before_conversion', category: InferenceCategory.FormExcessiveFieldsBeforeConversion, conclusion: 'form_excessive_fields_before_conversion', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: subCauseReasoning, reasoning_slots: { severity, count: formCount } })];
}

function inferFormSubmissionRetryFriction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('form_submission_retry_friction');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'form_submission_retry_friction', category: InferenceCategory.FormSubmissionRetryFriction, conclusion: 'form_submission_retry_friction', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users retry form submission multiple times without achieving progression. Repeated submissions indicate the form provides poor validation feedback, fails silently, or presents unclear error states — users believe the action should succeed but receive no confirmation of progress or clear explanation of failure. The root cause is inadequate submission feedback or broken validation.`, reasoning_slots: { severity } })];
}

function inferSurfaceOscillationBeforeDropoff(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('surface_oscillation_before_dropoff');
  if (!sig) return [];
  // Parse severity:surfaceA:surfaceB from encoded signal value
  const parts = sig.value.split(':');
  const severity = parts[0] === 'high' ? 'high' : parts[0] === 'medium' ? 'medium' : 'low';
  const surfaceA = parts.slice(1, -1).join(':') || null; // handle surface IDs that may contain colons
  const surfaceB = parts[parts.length - 1] || null;
  // Suppress if concrete surfaces are not known
  if (!surfaceA || !surfaceB) return [];

  // Extract readable labels from surface IDs (surface:host:/path → /path)
  const labelA = surfaceA.replace(/^surface:[^:]+:/, '') || surfaceA;
  const labelB = surfaceB.replace(/^surface:[^:]+:/, '') || surfaceB;

  return [createInference({ inference_key: 'surface_oscillation_before_dropoff', category: InferenceCategory.SurfaceOscillationBeforeDropoff, conclusion: 'surface_oscillation_before_dropoff', conclusion_value: `${severity}:${labelA}:${labelB}`, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users oscillate back and forth between ${labelA} and ${labelB} before dropping off — neither surface resolves the user's decisive question. This pattern indicates unresolved decision friction: the user has a question that one surface raises but the other fails to answer, creating a navigational loop that ends in abandonment.`, reasoning_slots: { severity } })];
}

function inferConversionFinalStepRetry(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('conversion_final_step_retry');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'conversion_final_step_retry', category: InferenceCategory.ConversionFinalStepRetry, conclusion: 'conversion_final_step_retry', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Conversion attempts in the final steps require multiple retries before completion or abandonment. Users who reach the final commitment moment are blocked by friction — failed submissions, unclear error states, or unresponsive interfaces at the purchase moment. Each retry erodes buyer confidence, and the accumulation of failed attempts directly causes abandonment at the highest-value step in the funnel.`, reasoning_slots: { severity } })];
}

function inferCtaLateAvailabilityDelaysAction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cta_late_availability_delays_action');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'cta_late_availability_delays_action', category: InferenceCategory.CtaLateAvailabilityDelaysAction, conclusion: 'cta_late_availability_delays_action', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Primary CTAs render late on high-intent surfaces — users arrive with purchase intent but the action is not yet available. Late CTA availability creates a gap between user readiness and UI readiness. Users must wait for the page to fully render before they can act, widening the window for distraction, hesitation, or abandonment. The root cause is render-order or dependency-loading that deprioritizes the primary commercial action.`, reasoning_slots: { severity } })];
}

function inferCheckoutAbandonNoFeedback(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_abandon_no_feedback');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'checkout_abandon_no_feedback', category: InferenceCategory.CheckoutAbandonNoFeedback, conclusion: 'checkout_abandon_no_feedback', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users initiate checkout then abandon without any visible progress or confirmation. The checkout UI provides no immediate feedback — no loading state, no progress indicator, no next-step preview — after the commitment action. This feedback vacuum creates uncertainty: users do not know if their action was received, if the system is working, or what comes next. The root cause is absent immediate feedback and progress indication at the checkout entry point.`, reasoning_slots: { severity } })];
}

function inferSensitiveInputPerceivedRiskDropoff(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('sensitive_input_perceived_risk_dropoff');
  if (!sig) return [];
  const parts = sig.value.split(':');
  const severity = parts[0] === 'high' ? 'high' : parts[0] === 'medium' ? 'medium' : 'low';
  const fieldKind = parts[1] || null;
  // Suppress if no concrete field kind
  if (!fieldKind) return [];

  const FIELD_LABELS: Record<string, string> = {
    email: 'email', phone: 'phone number', card_like: 'payment card',
    cpf_cnpj_like: 'identity document (CPF/CNPJ)', password: 'password', address: 'address',
  };
  const fieldLabel = FIELD_LABELS[fieldKind] || fieldKind;

  // Sub-cause differentiation: perceived risk varies by field type
  let riskContext: string;
  if (fieldKind === 'card_like') {
    riskContext = 'The root cause is payment security perception failure — users reach the payment data entry point but the surrounding context (missing security badges, unrecognized payment provider, absent encryption indicators) fails to justify the risk of entering card details. The trust-to-sensitivity gap is at its widest for payment data.';
  } else if (fieldKind === 'cpf_cnpj_like' || fieldKind === 'password') {
    riskContext = 'The root cause is unjustified identity exposure — users are asked for high-sensitivity identity data (documents, credentials) without sufficient explanation of why this data is required or how it will be protected. The perceived risk of identity theft or misuse exceeds the trust signals present.';
  } else if (fieldKind === 'email' || fieldKind === 'phone') {
    riskContext = 'The root cause is premature contact data capture — users encounter contact fields at a moment when insufficient value has been demonstrated or privacy context provided. The concern is unsolicited future contact (spam, calls) without a clear value exchange.';
  } else {
    riskContext = 'The root cause is a trust-to-sensitivity mismatch — the form asks for data on a surface that provides inadequate security reassurance, privacy context, or provider trust signals for the sensitivity level required.';
  }

  return [createInference({ inference_key: 'sensitive_input_perceived_risk_dropoff', category: InferenceCategory.SensitiveInputPerceivedRiskDropoff, conclusion: 'sensitive_input_perceived_risk_dropoff', conclusion_value: `${severity}:${fieldKind}`, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users drop off immediately after interacting with ${fieldLabel} fields. ${riskContext}`, reasoning_slots: { severity } })];
}

// ──────────────────────────────────────────────
// Pack entry point. Order preserved.
// ──────────────────────────────────────────────

export function computeBehavioralPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  // Phase 4B: Behavioral intelligence inferences
  out.push(...inferPolicyViewAbandonment(byKey, scoping, cycle_ref, ids));
  out.push(...inferHighIntentDetour(byKey, scoping, cycle_ref, ids));
  out.push(...inferSupportTooLateToConvert(byKey, scoping, cycle_ref, ids));
  out.push(...inferCtaBehaviorallyDead(byKey, scoping, cycle_ref, ids));
  out.push(...inferPurchaseHesitationBacktrack(byKey, scoping, cycle_ref, ids));
  out.push(...inferCriticalStepRetries(byKey, scoping, cycle_ref, ids));
  out.push(...inferMobileFirstActionFails(byKey, scoping, cycle_ref, ids));
  out.push(...inferFunnelStepStalled(byKey, scoping, cycle_ref, ids));
  // Phase 4B Hardening: 12 new behavioral inferences
  out.push(...inferHesitationBeforeConversionMissingTrust(byKey, scoping, cycle_ref, ids));
  out.push(...inferPricingHesitationUnclearValue(byKey, scoping, cycle_ref, ids));
  out.push(...inferPolicyDetourBeforeConversion(byKey, scoping, cycle_ref, ids));
  out.push(...inferCtaViewedNotEngaged(byKey, scoping, cycle_ref, ids));
  out.push(...inferSensitiveInputAbandonment(byKey, scoping, cycle_ref, ids));
  out.push(...inferFormExcessiveFieldsBeforeConversion(byKey, scoping, cycle_ref, ids));
  out.push(...inferFormSubmissionRetryFriction(byKey, scoping, cycle_ref, ids));
  out.push(...inferSurfaceOscillationBeforeDropoff(byKey, scoping, cycle_ref, ids));
  out.push(...inferConversionFinalStepRetry(byKey, scoping, cycle_ref, ids));
  out.push(...inferCtaLateAvailabilityDelaysAction(byKey, scoping, cycle_ref, ids));
  out.push(...inferCheckoutAbandonNoFeedback(byKey, scoping, cycle_ref, ids));
  out.push(...inferSensitiveInputPerceivedRiskDropoff(byKey, scoping, cycle_ref, ids));
  return out;
}
