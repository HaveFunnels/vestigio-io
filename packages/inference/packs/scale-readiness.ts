// ──────────────────────────────────────────────
// Pack: scale_readiness
//
// Inferences answering the workspace-level question "is it safe to
// scale traffic?". Six core inferences:
//   - inferCommerceContext: is this even a commerce site?
//   - inferTrustBoundary: does checkout/payment cross a trust line?
//   - inferPolicyGap: are refund/privacy/terms policies present?
//   - inferRevenuePathFragility: brittle redirects/CDN on critical path?
//   - inferMeasurementCoverage: tracking pixel coverage adequate?
//   - inferCheckoutIntegrity: checkout robustness composite score.
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

function inferCommerceContext(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const checkoutDetected = first('checkout.detected');
  const checkoutMode = first('checkout.mode');
  const providerSignals = signals.filter((s) => s.attribute === 'provider.guess');

  // Commerce is detected if:
  // 1. checkout.detected exists with value != 'false', OR
  // 2. checkout.mode signal exists (implies checkout was found), OR
  // 3. payment provider signals exist
  const hasCommerce =
    (checkoutDetected && checkoutDetected.value !== 'false') ||
    checkoutMode != null ||
    providerSignals.length > 0;

  const allSignals = [checkoutDetected, checkoutMode, ...providerSignals].filter(
    (s): s is Signal => s != null,
  );

  return [
    createInference({
      inference_key: 'commerce_context',
      category: InferenceCategory.CommerceContext,
      conclusion: 'commerce_context',
      conclusion_value: hasCommerce ? 'true' : 'false',
      confidence: hasCommerce ? 70 : 50,
      scoping, cycle_ref, ids,
      signal_refs: allSignals.map((s) => makeRef('signal', s.id)),
      evidence_refs: allSignals.flatMap((s) => s.evidence_refs),
      reasoning: hasCommerce
        ? 'Commerce indicators found: checkout flow, payment forms, or known payment providers detected.'
        : 'No commerce indicators detected. Site may be informational or use non-standard checkout.',
      reasoning_slots: { commerce_detected: hasCommerce ? 'true' : 'false' },
    }),
  ];
}

function inferTrustBoundary(
  first: (attr: string) => Signal | undefined,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const boundaryCrossed = first('trust.boundary_crossed');
  const checkoutOffDomain = first('checkout.off_domain');
  const weakSurface = first('trust.surface_weakness');
  const redirectChain = first('trust.redirect_chain_length');

  if (!boundaryCrossed && !checkoutOffDomain) return [];

  const isCrossed = boundaryCrossed?.value === 'true' || checkoutOffDomain?.value === 'true';
  const hasWeakSurface = weakSurface?.value === 'high';
  const hasLongRedirect = redirectChain != null && (redirectChain.numeric_value || 0) > 2;

  let severity = 'low';
  let confidence = 55;

  if (isCrossed && hasWeakSurface) {
    severity = 'high';
    confidence = 75;
  } else if (isCrossed && hasLongRedirect) {
    severity = 'high';
    confidence = 70;
  } else if (isCrossed) {
    severity = 'medium';
    confidence = 65;
  }

  const relevantSignals = [boundaryCrossed, checkoutOffDomain, weakSurface, redirectChain].filter(
    (s): s is Signal => s != null,
  );

  return [
    createInference({
      inference_key: 'trust_boundary_crossed',
      category: InferenceCategory.TrustBoundary,
      conclusion: 'trust_boundary_crossed',
      conclusion_value: isCrossed ? 'true' : 'false',
      severity_hint: severity,
      confidence,
      scoping, cycle_ref, ids,
      signal_refs: relevantSignals.map((s) => makeRef('signal', s.id)),
      evidence_refs: relevantSignals.flatMap((s) => s.evidence_refs),
      reasoning: buildTrustBoundaryReasoning(isCrossed, hasWeakSurface, hasLongRedirect),
      reasoning_slots: { severity },
    }),
  ];
}

function buildTrustBoundaryReasoning(
  crossed: boolean,
  weakSurface: boolean,
  longRedirect: boolean,
): string {
  if (!crossed) return 'No trust boundary crossing detected.';
  const parts = ['Trust boundary crossed: user leaves the primary domain during the conversion flow.'];
  if (weakSurface) parts.push('Unknown providers or unverified handoffs increase risk.');
  if (longRedirect) parts.push('Long redirect chain adds friction and reduces trust continuity.');
  return parts.join(' ');
}

function inferPolicyGap(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const coverage = first('policy.coverage');
  if (!coverage) return [];

  // Check for commerce: look for checkout.mode signal (emitted when checkout IS detected)
  // or any provider signal. The checkout_detected signal with value='false' means NO checkout.
  const checkoutMode = first('checkout.mode');
  const hasProviders = signals.some((s) => s.attribute === 'provider.guess');
  const isCommerce = checkoutMode != null || hasProviders;

  const coverageLevel = coverage.value;

  let gap = 'none';
  if (isCommerce && coverageLevel === 'weak') {
    gap = 'high';
  } else if (isCommerce && coverageLevel === 'partial') {
    gap = 'medium';
  } else if (!isCommerce && coverageLevel === 'weak') {
    gap = 'low';
  }

  if (gap === 'none') return [];

  const relevantSignals: Signal[] = [coverage];
  if (checkoutMode) relevantSignals.push(checkoutMode);

  return [
    createInference({
      inference_key: 'policy_gap',
      category: InferenceCategory.PolicyGap,
      conclusion: 'policy_gap',
      conclusion_value: gap,
      severity_hint: gap,
      confidence: gap === 'high' ? 70 : 55,
      scoping, cycle_ref, ids,
      signal_refs: relevantSignals.map((s) => makeRef('signal', s.id)),
      evidence_refs: relevantSignals.flatMap((s) => s.evidence_refs),
      reasoning: `Commerce context ${isCommerce ? 'detected' : 'not detected'} with ${coverageLevel} policy coverage. ` +
        (gap === 'high'
          ? 'Critical: commercial site missing essential consumer protection policies.'
          : 'Some required policies are missing or not detected.'),
      reasoning_slots: { severity: gap, coverage: coverageLevel },
    }),
  ];
}

function inferRevenuePathFragility(
  first: (attr: string) => Signal | undefined,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const checkoutOffDomain = first('checkout.off_domain');
  const redirectChain = first('trust.redirect_chain_length');
  const slowResponse = first('operational.slow_responses');
  const httpErrors = first('operational.http_errors');

  // Fixed: removed trust.boundary_crossed to avoid double-counting with checkout.off_domain
  // trust_boundary_crossed is already accounted for in its own inference
  const fragileSignals: Signal[] = [];
  let score = 0;

  if (checkoutOffDomain?.value === 'true') { fragileSignals.push(checkoutOffDomain); score += 30; }
  if (redirectChain) { fragileSignals.push(redirectChain); score += 15; }
  if (slowResponse) { fragileSignals.push(slowResponse); score += 10; }
  if (httpErrors) { fragileSignals.push(httpErrors); score += 20; }

  if (score === 0) return [];

  const fragility = score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';

  return [
    createInference({
      inference_key: 'revenue_path_fragile',
      category: InferenceCategory.RevenuePath,
      conclusion: 'revenue_path_fragile',
      conclusion_value: fragility,
      severity_hint: fragility,
      confidence: Math.min(80, 50 + fragileSignals.length * 5),
      scoping, cycle_ref, ids,
      signal_refs: fragileSignals.map((s) => makeRef('signal', s.id)),
      evidence_refs: fragileSignals.flatMap((s) => s.evidence_refs),
      reasoning: `Revenue path fragility: ${fragility}. Contributing factors: ` +
        fragileSignals.map((s) => s.description).join('; '),
      reasoning_slots: { severity: fragility, factors: fragileSignals.map((s) => s.description).join('; ') },
    }),
  ];
}

function inferMeasurementCoverage(
  first: (attr: string) => Signal | undefined,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const measurement = first('measurement.coverage');
  if (!measurement) return [];

  const level = measurement.value;

  return [
    createInference({
      inference_key: 'measurement_coverage',
      category: InferenceCategory.MeasurementCoverage,
      conclusion: 'measurement_sufficient',
      conclusion_value: level === 'adequate' ? 'true' : 'false',
      confidence: measurement.confidence,
      scoping, cycle_ref, ids,
      signal_refs: [makeRef('signal', measurement.id)],
      evidence_refs: measurement.evidence_refs,
      reasoning: level === 'adequate'
        ? 'Measurement coverage is adequate for optimization decisions.'
        : level === 'shallow'
          ? 'Only basic analytics detected. Attribution and optimization capabilities are limited.'
          : 'No analytics tools detected. Measurement is insufficient for any optimization.',
      reasoning_slots: { severity: level },
    }),
  ];
}

function inferCheckoutIntegrity(
  first: (attr: string) => Signal | undefined,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const checkoutMode = first('checkout.mode');
  const checkoutOffDomain = first('checkout.off_domain');
  const policyCoverage = first('policy.coverage');

  if (!checkoutMode) return [];

  let integrityScore = 100;
  const issues: string[] = [];
  const relevantSignals: Signal[] = [checkoutMode];

  if (checkoutOffDomain?.value === 'true') {
    integrityScore -= 35;
    issues.push('checkout is off-domain');
    relevantSignals.push(checkoutOffDomain);
  }
  // Removed trust.boundary_crossed here — it is redundant with checkout.off_domain
  // and was causing double-counting of the same underlying issue
  if (policyCoverage?.value === 'weak') {
    integrityScore -= 25;
    issues.push('weak policy coverage');
    relevantSignals.push(policyCoverage);
  } else if (policyCoverage?.value === 'partial') {
    integrityScore -= 10;
    issues.push('partial policy coverage');
    relevantSignals.push(policyCoverage);
  }

  const integrity = integrityScore >= 70 ? 'adequate' :
    integrityScore >= 40 ? 'fragile' : 'weak';

  return [
    createInference({
      inference_key: 'checkout_integrity',
      category: InferenceCategory.CheckoutIntegrity,
      conclusion: 'checkout_integrity',
      conclusion_value: integrity,
      severity_hint: integrity === 'weak' ? 'high' : integrity === 'fragile' ? 'medium' : 'low',
      confidence: 65,
      scoping, cycle_ref, ids,
      signal_refs: relevantSignals.map((s) => makeRef('signal', s.id)),
      evidence_refs: relevantSignals.flatMap((s) => s.evidence_refs),
      reasoning: issues.length > 0
        ? `Checkout integrity is ${integrity} (score: ${integrityScore}/100). Issues: ${issues.join(', ')}.`
        : `Checkout integrity is ${integrity} (score: ${integrityScore}/100). No significant issues detected.`,
      reasoning_slots: { severity: integrity, score: integrityScore },
    }),
  ];
}

// ──────────────────────────────────────────────
// Pack entry point — orchestrator calls this once per cycle.
// Order preserved from pre-Wave-20.6 inline sequence to keep
// IdGenerator counter-order identical to the monolith.
// ──────────────────────────────────────────────

export function computeScaleReadinessPack(input: PackInput): Inference[] {
  const { first, byKey, signals, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferCommerceContext(first, byKey, signals, scoping, cycle_ref, ids));
  out.push(...inferTrustBoundary(first, scoping, cycle_ref, ids));
  out.push(...inferPolicyGap(first, byKey, signals, scoping, cycle_ref, ids));
  out.push(...inferRevenuePathFragility(first, scoping, cycle_ref, ids));
  out.push(...inferMeasurementCoverage(first, scoping, cycle_ref, ids));
  out.push(...inferCheckoutIntegrity(first, scoping, cycle_ref, ids));
  return out;
}
