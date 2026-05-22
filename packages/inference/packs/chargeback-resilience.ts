// ──────────────────────────────────────────────
// Pack: chargeback_resilience
//
// Inferences about chargeback risk surfaces: refund policy clarity,
// support accessibility, expectation alignment, dispute risk
// composite. Four functions.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:298-538.
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

function inferRefundPolicyRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const refundPresent = first('policy.refund.present');
  const refundAccessible = first('chargeback.refund_policy_accessible');
  const policyCoverage = first('policy.coverage');

  const hasCheckout = first('checkout.mode') != null;
  if (!hasCheckout) return []; // no commerce, no chargeback risk from policy

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (refundPresent?.value === 'false') {
    factors.push('refund policy not detected');
    relevantSignals.push(refundPresent);
    score += 35;
  }
  if (refundAccessible?.value === 'false') {
    factors.push('no dedicated refund/return policy page');
    relevantSignals.push(refundAccessible);
    score += 20;
  }
  if (policyCoverage?.value === 'weak') {
    factors.push('overall policy coverage is weak');
    relevantSignals.push(policyCoverage);
    score += 15;
  }

  // Wave 3.1: LLM enrichment signals — degradation-safe (works without enrichment)
  const qualityScore = first('policy.enrichment.quality_score');
  if (qualityScore) {
    relevantSignals.push(qualityScore);
    if (qualityScore.value === 'poor') {
      factors.push('LLM-assessed policy quality is poor');
      score += 15;
    } else if (qualityScore.value === 'fair') {
      factors.push('LLM-assessed policy quality is only fair');
      score += 8;
    }
  }

  const ambiguityDetected = byKey.get(
    [...byKey.keys()].find(k => k.startsWith('policy_ambiguity_detected_')) || '',
  );
  if (ambiguityDetected) {
    relevantSignals.push(ambiguityDetected);
    const flagCount = ambiguityDetected.numeric_value || 0;
    if (flagCount >= 3) {
      factors.push(`${flagCount} ambiguous clauses detected by LLM`);
      score += 12;
    } else if (flagCount > 0) {
      factors.push(`${flagCount} ambiguous clause(s) detected by LLM`);
      score += 6;
    }
  }

  const missingSectionSignals = [...byKey.entries()]
    .filter(([k]) => k.startsWith('policy_missing_section_'))
    .map(([, v]) => v);
  if (missingSectionSignals.length > 0) {
    for (const ms of missingSectionSignals) {
      relevantSignals.push(ms);
    }
    factors.push(`${missingSectionSignals.length} critical section(s) missing per LLM analysis`);
    score += Math.min(20, missingSectionSignals.length * 5);
  }

  if (score === 0) return [];

  const severity = score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'refund_policy_gap',
    category: InferenceCategory.RefundPolicyRisk,
    conclusion: 'refund_policy_gap',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, 50 + relevantSignals.length * 8),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Refund policy risk: ${severity}. ${factors.join('. ')}. Without clear refund processes, customers resolve dissatisfaction through chargebacks.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferSupportAccessibility(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const noContact = byKey.get('no_contact_method');
  const contactPresent = first('support.contact_method_present');
  const lowVisibility = byKey.get('support_visibility_low');

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (noContact) {
    factors.push('no contact method detected');
    relevantSignals.push(noContact);
    score += 40;
  } else if (contactPresent && (contactPresent.numeric_value || 0) < 2) {
    factors.push('only one contact channel available');
    relevantSignals.push(contactPresent);
    score += 15;
  }

  if (lowVisibility) {
    factors.push('support not prominently visible');
    relevantSignals.push(lowVisibility);
    score += 15;
  }

  if (score === 0) return [];

  const severity = score >= 35 ? 'high' : score >= 15 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'support_unreachable',
    category: InferenceCategory.SupportAccessibility,
    conclusion: 'support_unreachable',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(70, 45 + relevantSignals.length * 10),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Support accessibility: ${severity}. ${factors.join('. ')}. When customers can't reach support, they file chargebacks instead.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferExpectationAlignment(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const pricingNotVisible = byKey.get('pricing_not_visible');
  const noPostPurchase = byKey.get('no_post_purchase_guidance');
  const checkoutOffDomain = first('checkout.off_domain');

  const hasCheckout = first('checkout.mode') != null;
  if (!hasCheckout) return [];

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (pricingNotVisible) {
    factors.push('no pricing page — customers may not understand charges');
    relevantSignals.push(pricingNotVisible);
    score += 25;
  }
  if (noPostPurchase) {
    factors.push('no order confirmation page — customers unsure if purchase completed');
    relevantSignals.push(noPostPurchase);
    score += 20;
  }
  if (checkoutOffDomain?.value === 'true') {
    factors.push('checkout leaves domain — brand disconnect creates charge confusion');
    relevantSignals.push(checkoutOffDomain);
    score += 15;
  }

  if (score === 0) return [];

  const severity = score >= 35 ? 'high' : score >= 15 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'expectation_misalignment',
    category: InferenceCategory.ExpectationAlignment,
    conclusion: 'expectation_misalignment',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(65, 40 + relevantSignals.length * 8),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Expectation alignment: ${severity}. ${factors.join('. ')}. Misaligned expectations are the #1 driver of "unauthorized charge" disputes.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferDisputeRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const hasCheckout = first('checkout.mode') != null;
  if (!hasCheckout) return [];

  // Aggregate chargeback risk from all contributing factors
  const refundGap = first('policy.refund.present');
  const noContact = byKey.get('no_contact_method');
  const trustBoundary = first('trust.boundary_crossed');
  const policyCoverage = first('policy.coverage');
  const pricingNotVisible = byKey.get('pricing_not_visible');

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (refundGap?.value === 'false') { factors.push('no refund policy'); relevantSignals.push(refundGap); score += 20; }
  if (noContact) { factors.push('no contact method'); relevantSignals.push(noContact); score += 20; }
  if (trustBoundary?.value === 'true') { factors.push('trust boundary crossed at checkout'); relevantSignals.push(trustBoundary); score += 15; }
  if (policyCoverage?.value === 'weak') { factors.push('weak policy coverage'); relevantSignals.push(policyCoverage); score += 10; }
  if (pricingNotVisible) { factors.push('pricing not visible'); relevantSignals.push(pricingNotVisible); score += 10; }

  if (score === 0) return [];

  const severity = score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'dispute_risk_elevated',
    category: InferenceCategory.DisputeRisk,
    conclusion: 'dispute_risk_elevated',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, 40 + relevantSignals.length * 7),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Dispute risk: ${severity}. ${factors.length} risk factor(s): ${factors.join('; ')}. Each factor independently increases the probability of chargebacks.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

// ──────────────────────────────────────────────
// Pack entry point. Order preserved.
// ──────────────────────────────────────────────

export function computeChargebackResiliencePack(input: PackInput): Inference[] {
  const { first, byKey, signals, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferRefundPolicyRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferSupportAccessibility(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferExpectationAlignment(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferDisputeRisk(first, byKey, signals, scoping, cycle_ref, ids));
  return out;
}
