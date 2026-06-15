// ──────────────────────────────────────────────
// Pack: revenue_integrity
//
// Inferences about revenue leakage — flow fragmentation, friction
// on critical paths, leakage detection, trust-revenue impact,
// measurement blindspots, conversion clarity. Six functions.
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

function inferConversionFlowFragmentation(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const fragmented = first('revenue.fragmented_path');
  const offDomain = first('revenue.off_domain_checkout');
  const redirectBefore = first('revenue.redirect_before_checkout');

  if (!fragmented && !offDomain && !redirectBefore) return [];

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (fragmented?.value === 'true') {
    factors.push(`conversion path fragments across ${fragmented.numeric_value} external hosts`);
    relevantSignals.push(fragmented);
    score += 35;
  }
  if (offDomain?.value === 'true') {
    factors.push('checkout leaves the domain');
    relevantSignals.push(offDomain);
    score += 25;
  }
  if (redirectBefore) {
    factors.push(`${redirectBefore.numeric_value} redirect hops before checkout`);
    relevantSignals.push(redirectBefore);
    score += redirectBefore.value === 'high' ? 20 : 10;
  }

  const severity = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'conversion_flow_fragmented',
    category: InferenceCategory.ConversionFlow,
    conclusion: 'conversion_flow_fragmented',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, 50 + relevantSignals.length * 10),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Conversion flow is ${severity === 'high' ? 'severely' : 'moderately'} fragmented. ${factors.join('. ')}. Each fragment is a potential drop-off point that leaks revenue.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferFrictionOnCriticalPath(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const excessive = first('friction.excessive_redirects');
  const slowPath = first('friction.slow_critical_path');
  const brokenForm = first('friction.broken_form_action');
  const domainSwitch = first('friction.domain_switch_no_context');

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (brokenForm?.value === 'true') {
    factors.push(`${brokenForm.numeric_value} broken form action(s)`);
    relevantSignals.push(brokenForm);
    score += 35;
  }
  if (slowPath) {
    factors.push(`slow responses on critical path (avg ${slowPath.numeric_value}ms)`);
    relevantSignals.push(slowPath);
    score += slowPath.value === 'high' ? 25 : 15;
  }
  if (excessive) {
    factors.push(`${excessive.numeric_value} redirect hops total`);
    relevantSignals.push(excessive);
    score += excessive.value === 'high' ? 20 : 10;
  }
  if (domainSwitch?.value === 'true') {
    factors.push(`${domainSwitch.numeric_value} unexplained domain switch(es)`);
    relevantSignals.push(domainSwitch);
    score += 15;
  }

  if (score === 0) return [];

  const severity = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'friction_on_critical_path',
    category: InferenceCategory.FrictionPath,
    conclusion: 'friction_on_critical_path',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, 50 + relevantSignals.length * 8),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Critical path friction is ${severity}. ${factors.join('. ')}. Every friction point on the revenue path reduces conversion rate.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferRevenueLeakage(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const offDomain = first('revenue.off_domain_checkout');
  const noFunnel = first('revenue.funnel_entry');
  const fragmented = first('revenue.fragmented_path');
  const brokenForm = first('friction.broken_form_action');
  const missingTracking = byKey.get('missing_tracking_on_commercial');

  const leakPoints: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (offDomain?.value === 'true') {
    leakPoints.push('checkout leaves domain. Attribution and trust break');
    relevantSignals.push(offDomain);
    score += 25;
  }
  if (noFunnel?.value === 'false') {
    leakPoints.push('no clear conversion path entry. Users cannot find how to convert');
    relevantSignals.push(noFunnel);
    score += 20;
  }
  if (fragmented?.value === 'true') {
    leakPoints.push('conversion path fragments across multiple hosts');
    relevantSignals.push(fragmented);
    score += 20;
  }
  if (brokenForm?.value === 'true') {
    leakPoints.push(`${brokenForm.numeric_value} broken form(s). Direct revenue loss`);
    relevantSignals.push(brokenForm);
    score += 30;
  }
  if (missingTracking) {
    leakPoints.push('no measurement on commercial pages. Leakage is invisible');
    relevantSignals.push(missingTracking);
    score += 15;
  }

  if (score === 0) return [];

  const severity = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'revenue_leakage',
    category: InferenceCategory.RevenueLeakage,
    conclusion: 'revenue_leakage',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(80, 45 + relevantSignals.length * 8),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Revenue leakage severity: ${severity}. ${leakPoints.length} leak point(s): ${leakPoints.join('; ')}.`,
    reasoning_slots: { severity, factors: leakPoints.join('; ') },
  })];
}

function inferTrustRevenueImpact(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const missingPolicy = first('trust.missing_policy_near_checkout');
  const weakTrust = first('trust.surface_weakness');
  const domainSwitch = first('friction.domain_switch_no_context');
  const policyCoverage = first('policy.coverage');

  const hasCheckout = first('checkout.mode') != null;
  if (!hasCheckout) return [];

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (missingPolicy?.value === 'true') {
    factors.push('no policies near checkout. Legal and trust risk at conversion point');
    relevantSignals.push(missingPolicy);
    score += 30;
  }
  if (weakTrust?.value === 'high') {
    factors.push('weak trust surface with unknown handoffs');
    relevantSignals.push(weakTrust);
    score += 20;
  }
  if (domainSwitch?.value === 'true') {
    factors.push('domain switches without provider context');
    relevantSignals.push(domainSwitch);
    score += 15;
  }
  if (policyCoverage?.value === 'weak') {
    factors.push('weak overall policy coverage');
    relevantSignals.push(policyCoverage);
    score += 15;
  }

  if (score === 0) return [];

  const severity = score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'trust_break_in_checkout',
    category: InferenceCategory.TrustRevenue,
    conclusion: 'trust_break_in_checkout',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(75, 50 + relevantSignals.length * 7),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Trust break at checkout: ${severity}. ${factors.join('. ')}. Trust deficiencies at the conversion point directly reduce revenue.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferMeasurementBlindspot(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const measurement = first('measurement.coverage');
  const missingCommercial = byKey.get('missing_tracking_on_commercial');

  if (!measurement && !missingCommercial) return [];

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (measurement?.value === 'none') {
    factors.push('no analytics detected anywhere');
    relevantSignals.push(measurement);
    score += 30;
  } else if (measurement?.value === 'shallow') {
    factors.push('only basic analytics. Attribution gaps likely');
    relevantSignals.push(measurement);
    score += 15;
  }

  if (missingCommercial) {
    factors.push('no tracking on commercial pages. Conversion measurement impossible');
    relevantSignals.push(missingCommercial);
    score += 25;
  }

  if (score === 0) return [];

  const severity = score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'measurement_blindspot',
    category: InferenceCategory.MeasurementBlindspot,
    conclusion: 'measurement_blindspot',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(70, 45 + relevantSignals.length * 10),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Measurement blindspot: ${severity}. ${factors.join('. ')}. Without measurement, revenue leakage is invisible and unquantifiable.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

function inferConversionClarity(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const noConversion = first('clarity.no_primary_conversion_path');
  const competingCtas = first('clarity.competing_ctas');

  if (!noConversion && !competingCtas) return [];

  const factors: string[] = [];
  const relevantSignals: Signal[] = [];
  let score = 0;

  if (noConversion?.value === 'true') {
    factors.push('no clear primary conversion path detected');
    relevantSignals.push(noConversion);
    score += 35;
  }
  if (competingCtas?.value === 'true') {
    factors.push(`pages with competing CTAs reduce conversion focus`);
    relevantSignals.push(competingCtas);
    score += 20;
  }

  const severity = score >= 35 ? 'high' : score >= 15 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'unclear_conversion_intent',
    category: InferenceCategory.ConversionClarity,
    conclusion: 'unclear_conversion_intent',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: Math.min(65, 40 + relevantSignals.length * 10),
    scoping, cycle_ref, ids,
    signal_refs: relevantSignals.map(s => makeRef('signal', s.id)),
    evidence_refs: relevantSignals.flatMap(s => s.evidence_refs),
    reasoning: `Conversion clarity: ${severity}. ${factors.join('. ')}. Unclear conversion intent means users cannot find or trust the path to purchase.`,
    reasoning_slots: { severity, factors: factors.join('. ') },
  })];
}

// ──────────────────────────────────────────────
// Pack entry point. Order preserved.
// ──────────────────────────────────────────────

export function computeRevenueIntegrityPack(input: PackInput): Inference[] {
  const { first, byKey, signals, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferConversionFlowFragmentation(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferFrictionOnCriticalPath(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferRevenueLeakage(first, byKey, signals, scoping, cycle_ref, ids));
  out.push(...inferTrustRevenueImpact(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferMeasurementBlindspot(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferConversionClarity(first, byKey, scoping, cycle_ref, ids));
  return out;
}
