import {
  Signal,
  Inference,
  InferenceCategory,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
} from '../domain';
// Wave 20.6 — shared inference builders extracted from this file.
import { createInference, inferCohort } from './shared/builders';
import type { PackInput } from './shared/types';
// Wave 20.6 — pack files migrated from inline definitions in this file.
import { computeFirstImpressionRevenuePack } from './packs/first-impression-revenue';
import { computeActionValueMapPack } from './packs/action-value-map';
import { computeAcquisitionIntegrityPack } from './packs/acquisition-integrity';
import { computeMobileRevenuePack } from './packs/mobile-revenue';
import { computeFrictionTaxPack } from './packs/friction-tax';
import { computeTrustRevenueGapPack } from './packs/trust-revenue-gap';
import { computePathEfficiencyPack } from './packs/path-efficiency';
import { computeSecurityPosturePack } from './packs/security-posture';
import { computeScaleReadinessPack } from './packs/scale-readiness';
import { computeRevenueIntegrityPack } from './packs/revenue-integrity';
import { computeChargebackResiliencePack } from './packs/chargeback-resilience';
import { computeBehavioralPack } from './packs/behavioral';
import { computeBrandIntegrityPack } from './packs/brand-integrity';
import { computeDiscoverabilityPack } from './packs/discoverability';
import { computeChannelIntegrityPack } from './packs/channel-integrity';
import { computeContentFreshnessPack } from './packs/content-freshness';
import { computeCopyAlignmentPack } from './packs/copy-alignment';
import { computeCommerceContextPack } from './packs/commerce-context';
import { computeWave4ExtensionsPack } from './packs/wave-4-extensions';

// ──────────────────────────────────────────────
// Inference Engine — composite interpretations from signals
// Deterministic: scoped ID generator, no global state
// ──────────────────────────────────────────────

export function computeInferences(
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
): Inference[] {
  const inferences: Inference[] = [];
  const ids = new IdGenerator('inf');

  // Index signals by attribute — supports multiple signals per attribute
  const byAttribute = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = byAttribute.get(s.attribute) || [];
    list.push(s);
    byAttribute.set(s.attribute, list);
  }

  // Helper: get first signal for an attribute (most common case)
  const first = (attr: string): Signal | undefined => {
    const list = byAttribute.get(attr);
    return list ? list[0] : undefined;
  };

  // Also index by signal_key for direct lookups
  const byKey = new Map<string, Signal>();
  for (const s of signals) {
    byKey.set(s.signal_key, s);
  }

  // Wave 20.6 — PackInput is the uniform per-pack input shape.
  // Constructed once, passed to every pack/<name>.ts module's
  // entry function. Old inline inference functions still take the
  // legacy (first, byKey, signals, scoping, cycle_ref, ids) tuple
  // until they're migrated into pack files.
  const packInput: PackInput = {
    signals, byAttribute, byKey, first, scoping, cycle_ref, ids,
  };

  // Scale readiness (Wave 20.6 — migrated to packs/scale-readiness.ts)
  inferences.push(...computeScaleReadinessPack(packInput));

  // Revenue inference rules (revenue_integrity)
  // Revenue integrity (Wave 20.6 — migrated to packs/revenue-integrity.ts)
  inferences.push(...computeRevenueIntegrityPack(packInput));

  // Chargeback inference rules (chargeback_resilience)
  // Chargeback resilience (Wave 20.6 — migrated to packs/chargeback-resilience.ts)
  inferences.push(...computeChargebackResiliencePack(packInput));

  // Phase 30: New inference rules from existing evidence
  inferences.push(...inferCriticalPathBroken(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFormDataLeavesDomain(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferProviderFragmentation(first, byKey, signals, scoping, cycle_ref, ids));

  // Phase 30B: Extended inference rules
  inferences.push(...inferRedirectTrustErosion(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferLanguageDiscontinuity(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferOrphanCommercialPage(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferUntrustedEmbed(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPlatformCheckoutRisk(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPostPurchaseGap(byKey, first, scoping, cycle_ref, ids));
  inferences.push(...inferCommercialMeasurementBlind(first, byKey, scoping, cycle_ref, ids));

  // Phase 2: Inference rules from deepened collection
  inferences.push(...inferThinPolicyContent(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHiddenSupportWidget(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferTrustSignalsThin(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferTrackingStackIncomplete(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferConsentMeasurementConflict(byKey, scoping, cycle_ref, ids));

  // Phase 2B: Mobile & runtime inference rules
  inferences.push(...inferMobilePathBlocked(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileTrustDegraded(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferRuntimePurchaseInterruption(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferRuntimeMeasurementBreak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSecondaryFlowBypassing(byKey, scoping, cycle_ref, ids));

  // Phase 2C: Composite inference rules
  inferences.push(...inferRefundProcessUnclear(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPostPurchaseProofWeak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSupportLateInJourney(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHiddenReassuranceRoutes(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAlternateFlowMeasurementGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferRuntimeReassuranceBreak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferProviderPathWeak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferTrustMeasurementCompoundBreak(byKey, scoping, cycle_ref, ids));

  // Phase 3A: Channel integrity inferences
  // Channel integrity (Wave 20.6 — migrated to packs/channel-integrity.ts)
  inferences.push(...computeChannelIntegrityPack(packInput));

  // Phase 3B: Deep discovery inferences from Katana evidence
  inferences.push(...inferPromotionLogicExposed(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCartVariantWeakControl(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHiddenDiscountRefundRoute(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferGuessableBusinessEndpoint(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAlternatePricingSafeguardBypass(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferJsDiscoveredPurchaseVariant(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDynamicRouteWeakControl(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHiddenSupportBurden(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAlternateVariantControlBreakdown(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDeepCommerceExploitationRisk(byKey, scoping, cycle_ref, ids));

  // Phase 2D: Network analysis inferences
  inferences.push(...inferCheckoutApiLatency(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCommercialPagesSlow(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPaidLandingOverloaded(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferThirdPartyWeightDelaysTrust(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCheckoutBrittleThirdParty(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPurchaseBlockedFailingRequests(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMeasurementBreaksRevenuePath(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPurchaseBeforeDepsReady(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferTrustAssetsLateLoad(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileHeavyRuntimeChain(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileTrustPaymentDepsFailing(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferTrustSurfacesUnstableDeps(byKey, scoping, cycle_ref, ids));

  // Discoverability + Brand Integrity (Wave 20.6 — migrated to packs/)
  inferences.push(...computeDiscoverabilityPack(packInput));
  inferences.push(...computeBrandIntegrityPack(packInput));

  // Behavioral (Wave 20.6 — migrated to packs/behavioral.ts)
  inferences.push(...computeBehavioralPack(packInput));
  // Behavioral cohort inferences (pixel-dependent workspaces)
  // Wave 20.6 — first-impression-revenue migrated to packs/first-impression-revenue.ts
  inferences.push(...computeFirstImpressionRevenuePack(packInput));
  // Wave 20.6 — action-value-map migrated to packs/action-value-map.ts
  inferences.push(...computeActionValueMapPack(packInput));
  // Wave 20.6 — acquisition-integrity migrated to packs/acquisition-integrity.ts
  inferences.push(...computeAcquisitionIntegrityPack(packInput));
  // Wave 20.6 — mobile-revenue migrated to packs/mobile-revenue.ts
  inferences.push(...computeMobileRevenuePack(packInput));
  // Wave 20.6 — friction-tax migrated to packs/friction-tax.ts
  inferences.push(...computeFrictionTaxPack(packInput));
  // Wave 20.6 — trust-revenue-gap migrated to packs/trust-revenue-gap.ts
  inferences.push(...computeTrustRevenueGapPack(packInput));
  // Wave 20.6 — path-efficiency migrated to packs/path-efficiency.ts
  inferences.push(...computePathEfficiencyPack(packInput));

  // Wave 3.3: Security posture inferences (Wave 20.6 — migrated to packs/security-posture.ts)
  // open_redirect_indicator: inherited dead code inside the pack file (not called)
  inferences.push(...computeSecurityPosturePack(packInput));

  // Copy alignment (Wave 20.6 — migrated to packs/copy-alignment.ts)
  inferences.push(...computeCopyAlignmentPack(packInput));
  // Content freshness (Wave 20.6 — migrated to packs/content-freshness.ts)
  inferences.push(...computeContentFreshnessPack(packInput));

  // Commerce context (Wave 20.6 — migrated to packs/commerce-context.ts)
  inferences.push(...computeCommerceContextPack(packInput));
  // Wave 7.11: SaaS/Stripe metric inferences
  inferences.push(...inferSubscriberChurnElevated(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFailedPaymentRateHigh(byKey, scoping, cycle_ref, ids));
  // Wave 8.1: Payment Health & Involuntary Churn inferences
  inferences.push(...inferFailedPaymentRevenueDrain(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSubscriberChurnUnsustainable(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPaymentDiversityInsufficient(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMrrContraction(byKey, scoping, cycle_ref, ids));
  // Wave 6.1: Revenue Attribution Integrity (ad-platform overattribution)
  inferences.push(...inferRevenueAttributionMismatch(byKey, scoping, cycle_ref, ids));

  // Wave 7.11M: Pixel coverage gap (measurement integrity)
  inferences.push(...inferPixelCoverageGap(byKey, scoping, cycle_ref, ids));

  // Wave 4.x extensions (4.1 cyb + 4.2 LLM + 4.6 neglected — migrated to packs/wave-4-extensions.ts)
  inferences.push(...computeWave4ExtensionsPack(packInput));

  return inferences;
}
// ──────────────────────────────────────────────
// Phase 30: New Inference Rules from Existing Evidence
// ──────────────────────────────────────────────

function inferCriticalPathBroken(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const criticalError = byKey.get('critical_page_error');
  if (!criticalError) return [];

  const count = criticalError.numeric_value || 0;
  const severity = count >= 3 ? 'high' : count >= 1 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'critical_path_broken',
    category: InferenceCategory.CriticalPathBroken,
    conclusion: 'critical_path_broken',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', criticalError.id)],
    evidence_refs: criticalError.evidence_refs,
    reasoning: `${count} revenue-critical page(s) (checkout, cart, pricing, login) are returning HTTP errors. These pages are directly on the conversion path — every visitor hitting an error page is a lost transaction. This is not a generic SEO concern; it is an active break in the revenue path.`,
    reasoning_slots: { severity, count },
  })];
}

function inferFormDataLeavesDomain(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const exposure = byKey.get('external_form_data_exposure');
  if (!exposure) return [];

  const isPayment = exposure.value === 'high';
  const severity = isPayment ? 'high' : 'medium';

  return [createInference({
    inference_key: 'form_data_leaves_domain',
    category: InferenceCategory.DataBoundaryRisk,
    conclusion: 'form_data_leaves_domain',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: exposure.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', exposure.id)],
    evidence_refs: exposure.evidence_refs,
    reasoning: `${exposure.numeric_value} form(s) submit user data to unrecognized external domains. ${isPayment ? 'Payment fields are included — this is a direct trust and compliance risk at the conversion point.' : 'User data leaves the domain boundary without a recognized payment provider, creating trust and privacy concerns.'} This is distinct from a known provider redirect (Stripe, PayPal) — these are unrecognized external endpoints.`,
    reasoning_slots: { severity, count: exposure.numeric_value || 0 },
  })];
}

function inferProviderFragmentation(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const fragmentation = byKey.get('multiple_payment_providers');
  if (!fragmentation) return [];

  const count = fragmentation.numeric_value || 0;
  const severity = count >= 4 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_provider_fragmented',
    category: InferenceCategory.ProviderFragmentation,
    conclusion: 'checkout_provider_fragmented',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 65,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', fragmentation.id)],
    evidence_refs: fragmentation.evidence_refs,
    reasoning: `${count} distinct payment providers detected on the site. While offering payment choice can be positive, ${count}+ competing provider scripts create inconsistent checkout experiences, increase page weight, and fragment the user's path to purchase. Different providers may show conflicting UI patterns, currencies, or trust signals.`,
    reasoning_slots: { severity, count },
  })];
}

// ──────────────────────────────────────────────
// Phase 30B: Extended Inference Rules
// ──────────────────────────────────────────────

function inferRedirectTrustErosion(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('checkout_redirect_trust_erosion');
  const urlParam = byKey.get('redirect_with_url_parameter');
  const crossDomain = byKey.get('redirect_chain_to_unknown_domain');

  if (!sig && !urlParam && !crossDomain) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];
  let hops = 0;

  if (sig) {
    relevant.push(sig);
    hops = sig.numeric_value || 0;
    factors.push(`${hops} redirect hop(s) crossing domains on checkout path`);
  }
  if (urlParam) {
    relevant.push(urlParam);
    factors.push(`${urlParam.numeric_value} URL-parameter redirect(s) exposing open redirect risk`);
  }
  if (crossDomain) {
    relevant.push(crossDomain);
    factors.push(`${crossDomain.numeric_value} cross-domain redirect(s) to unknown destinations`);
  }

  const severity = (hops >= 3 || (urlParam && crossDomain)) ? 'high'
    : (sig || urlParam || crossDomain) ? 'medium' : 'low';

  const confidence = sig ? sig.confidence : 70;

  return [createInference({
    inference_key: 'redirect_chain_erodes_checkout_trust',
    category: InferenceCategory.RedirectTrustErosion,
    conclusion: 'redirect_chain_erodes_checkout_trust',
    conclusion_value: severity,
    severity_hint: severity,
    confidence,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Redirect trust erosion ${severity}. ${factors.join('; ')}. Industry data shows each redirect loses 5-15% of users. On the path to payment, this compounds into direct revenue loss as buyers interpret domain changes as untrustworthy.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

function inferLanguageDiscontinuity(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('language_discontinuity_commercial');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'commercial_journey_language_break',
    category: InferenceCategory.LanguageDiscontinuity,
    conclusion: 'commercial_journey_language_break',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${count} commercial page(s) switch language compared to the homepage. When a buyer moves from browsing in one language to a checkout or pricing page in another, it creates confusion, reduces trust, and increases abandonment — especially in markets where the primary audience does not speak the checkout language.`,
    reasoning_slots: { severity, count },
  })];
}

function inferOrphanCommercialPage(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('orphan_commercial_page');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'commercial_pages_disconnected',
    category: InferenceCategory.OrphanCommercialPage,
    conclusion: 'commercial_pages_disconnected',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${count} commercial page(s) (checkout, pricing, login, billing) have no inbound navigation links from the main site. These pages exist but visitors cannot reach them through normal browsing. Revenue-critical surfaces that are unreachable from the main journey represent direct conversion leakage.`,
    reasoning_slots: { severity, count },
  })];
}

function inferUntrustedEmbed(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('untrusted_embed_on_commercial');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'untrusted_embeds_near_purchase',
    category: InferenceCategory.UntrustedEmbed,
    conclusion: 'untrusted_embeds_near_purchase',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${count} unrecognized external iframe(s) embedded on commercial pages. Unlike known payment providers (Stripe, PayPal), these embeds are not recognized trust signals. External content from unknown sources near the purchase moment undermines buyer confidence and may introduce security perception risk.`,
    reasoning_slots: { severity, count },
  })];
}

function inferPlatformCheckoutRisk(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('platform_checkout_risk');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'platform_checkout_risk_unaddressed',
    category: InferenceCategory.PlatformCheckoutRisk,
    conclusion: 'platform_checkout_risk_unaddressed',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: sig.description || 'Platform-specific checkout patterns creating unresolved risk.',
    reasoning_slots: { severity },
  })];
}

function inferPostPurchaseGap(
  byKey: Map<string, Signal>,
  first: (attr: string) => Signal | undefined,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('post_purchase_gap_compound');
  if (!sig) return [];

  return [createInference({
    inference_key: 'post_purchase_confirmation_absent',
    category: InferenceCategory.PostPurchaseGap,
    conclusion: 'post_purchase_confirmation_absent',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `No order confirmation page and no refund policy detected. This compound gap means customers who just paid have no immediate proof their order was received and no way to understand return terms. The result is "did my order go through?" support contacts and "I don't recognize this charge" disputes — the two highest-volume chargeback drivers.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferCommercialMeasurementBlind(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  // Fires when: checkout/payment pages exist AND no analytics on those pages
  // This is distinct from measurement_blindspot (sitewide) — this is specifically about
  // high-intent surfaces operating without conversion visibility
  const missingCommercial = byKey.get('missing_tracking_on_commercial');
  const hasCheckout = first('checkout.mode') != null;

  if (!missingCommercial || !hasCheckout) return [];

  const measurement = first('measurement.coverage');
  // Only fire if sitewide measurement exists but commercial pages are blind
  // (If no measurement anywhere, the existing measurement_blindspot finding covers it)
  if (measurement?.value === 'none') return [];

  return [createInference({
    inference_key: 'high_intent_surfaces_blind',
    category: InferenceCategory.CommercialMeasurementBlind,
    conclusion: 'high_intent_surfaces_blind',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: 65,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', missingCommercial.id), ...(measurement ? [makeRef('signal', measurement.id)] : [])],
    evidence_refs: missingCommercial.evidence_refs,
    reasoning: `Analytics tools are present on the site but absent from checkout and payment pages. The highest-intent surfaces — where conversion actually happens — are operating without measurement. Ad spend optimization, attribution, and conversion rate improvement are impossible on the pages that generate revenue.`,
    reasoning_slots: { severity: 'high' },
  })];
}

// ──────────────────────────────────────────────
// Phase 2: Inference Rules from Deepened Collection
// ──────────────────────────────────────────────

function inferThinPolicyContent(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('thin_refund_policy');
  if (!sig) return [];

  const wordCount = sig.numeric_value || 0;
  const severity = wordCount < 100 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'refund_terms_too_thin',
    category: InferenceCategory.ThinPolicyContent,
    conclusion: 'refund_terms_too_thin',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The refund/return policy is ${wordCount} words — too thin to defuse buyer disputes. A policy this brief cannot meaningfully explain return windows, refund processes, or exception handling. When dissatisfied customers cannot find clear terms, they bypass the merchant and file chargebacks.`,
    reasoning_slots: { severity, count: wordCount },
  })];
}

function inferHiddenSupportWidget(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('support_widget_hidden_from_checkout');
  if (!sig) return [];

  return [createInference({
    inference_key: 'support_hidden_at_purchase',
    category: InferenceCategory.HiddenSupportWidget,
    conclusion: 'support_hidden_at_purchase',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `A live support widget exists on the site but is absent from checkout and payment pages. Buyers who hesitate at the purchase moment — with questions about shipping, returns, or product fit — have no way to get immediate answers. This pushes uncertain buyers toward abandonment instead of resolution.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferTrustSignalsThin(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('trust_signals_thin_on_commercial');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count === 0 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'trust_surface_too_thin',
    category: InferenceCategory.TrustSignalsThin,
    conclusion: 'trust_surface_too_thin',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Only ${count} trust-building signal(s) found across the commercial surface (business schema, policy pages, recognized providers). Buyers evaluate trust through visible signals — business identity, review presence, policy accessibility, recognized checkout partners. A thin trust surface directly reduces checkout confidence and increases abandonment.`,
    reasoning_slots: { severity, count },
  })];
}

function inferTrackingStackIncomplete(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('tracking_stack_incomplete');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'tracking_stack_gaps',
    category: InferenceCategory.TrackingStackIncomplete,
    conclusion: 'tracking_stack_gaps',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: sig.description || 'Commerce tracking infrastructure has gaps preventing full conversion visibility and optimization.',
    reasoning_slots: { severity },
  })];
}

function inferConsentMeasurementConflict(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('consent_measurement_conflict');
  if (!sig) return [];

  return [createInference({
    inference_key: 'consent_undermining_measurement',
    category: InferenceCategory.ConsentMeasurementConflict,
    conclusion: 'consent_undermining_measurement',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `A consent management platform is present but no tag manager was detected. Without a consent-aware tag firing mechanism, analytics scripts may be blocked entirely for users who consent — creating a silent gap in conversion data. The site appears to have measurement, but the consent layer may be preventing it from actually working for a portion of visitors.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

// ──────────────────────────────────────────────
// Phase 2B: Mobile & Runtime Inference Rules
// ──────────────────────────────────────────────

function inferMobilePathBlocked(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('mobile_commercial_path_blocked');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'mobile_commercial_path_blocked',
    category: InferenceCategory.MobilePathBlocked,
    conclusion: 'mobile_commercial_path_blocked',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The commercial path is blocked or degraded on mobile. Mobile visitors — who represent the majority of traffic for most sites — cannot reach checkout, pricing, or key conversion pages. This is not a layout issue; it is a revenue path that does not exist for mobile buyers.`,
    reasoning_slots: { severity },
  })];
}

function inferMobileTrustDegraded(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('mobile_trust_weaker_than_desktop');
  if (!sig) return [];

  return [createInference({
    inference_key: 'mobile_trust_weaker_than_desktop',
    category: InferenceCategory.MobileTrustDegraded,
    conclusion: 'mobile_trust_weaker_than_desktop',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Mobile buyers experience a weaker trust surface than desktop visitors. Trust indicators, policy visibility, or provider signals present on desktop are absent or degraded on mobile. When mobile users see fewer reasons to trust, they abandon at higher rates.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferRuntimePurchaseInterruption(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('runtime_purchase_interrupted');
  if (!sig) return [];

  return [createInference({
    inference_key: 'runtime_errors_interrupt_purchase',
    category: InferenceCategory.RuntimePurchaseInterruption,
    conclusion: 'runtime_errors_interrupt_purchase',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `JavaScript runtime errors are directly interrupting the purchase journey. Payment provider scripts, checkout flow logic, or transaction-critical code is failing at execution time. Every instance is a buyer who wanted to pay but could not complete the transaction.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferRuntimeMeasurementBreak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('runtime_tracking_broken');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'runtime_measurement_broken',
    category: InferenceCategory.RuntimeMeasurementBreak,
    conclusion: 'runtime_measurement_broken',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Analytics, pixel, or tag manager scripts are failing at runtime on commercial pages. The tracking infrastructure appears to be present in the source code, but JavaScript errors prevent it from actually executing. Conversion data is silently dropping — the site thinks it has measurement, but the runtime tells a different story.`,
    reasoning_slots: { severity },
  })];
}

function inferSecondaryFlowBypassing(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('secondary_commercial_flows_detected');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'secondary_flows_bypass_trust_path',
    category: InferenceCategory.SecondaryFlowBypassing,
    conclusion: 'secondary_flows_bypass_trust_path',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Multiple distinct entry points lead to commercial conversion pages, suggesting secondary or alternate checkout flows that bypass the main trust, support, and measurement path. Revenue flowing through these secondary paths may escape policy coverage, support visibility, and analytics tracking.`,
    reasoning_slots: { severity },
  })];
}

// ──────────────────────────────────────────────
// Phase 2C: Composite Inference Rules
// ──────────────────────────────────────────────

function inferRefundProcessUnclear(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('refund_process_vague');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'refund_process_unclear',
    category: InferenceCategory.RefundProcessUnclear,
    conclusion: 'refund_process_unclear',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `A refund/return policy page exists but is missing ${sig.numeric_value} critical detail(s) that buyers need when something goes wrong. Without a clear return window, a described refund process, and contact information for returns, the policy exists in name only — it cannot actually guide a dissatisfied customer through resolution. The gap between "policy present" and "policy useful" is where chargebacks happen.`,
    reasoning_slots: { severity },
  })];
}

function inferPostPurchaseProofWeak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('post_purchase_proof_weak');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'post_purchase_proof_too_weak',
    category: InferenceCategory.PostPurchaseProofWeak,
    conclusion: 'post_purchase_proof_too_weak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `An order confirmation page exists but contains only ${sig.numeric_value} words — too little to serve as meaningful purchase proof. A confirmation page that does not clearly show order details, expected delivery timeline, and next steps leaves the buyer uncertain whether the purchase was actually processed. This uncertainty drives "I didn't order this" and "I never received it" disputes. The page exists, but it does not reassure.`,
    reasoning_slots: { severity },
  })];
}

function inferSupportLateInJourney(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('support_late_in_journey');
  if (!sig) return [];

  return [createInference({
    inference_key: 'support_reassurance_too_late',
    category: InferenceCategory.SupportLateInJourney,
    conclusion: 'support_reassurance_too_late',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Support and help pages exist on the site but are not accessible from the commercial journey (checkout, pricing, cart). Buyers who hesitate — with questions about sizing, shipping, returns, or product fit — have no reassurance pathway available at the moment of decision. They must leave the purchase flow to find help, and most will not return.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferHiddenReassuranceRoutes(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('hidden_reassurance_routes');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'reassurance_routes_disconnected',
    category: InferenceCategory.HiddenReassuranceRoutes,
    conclusion: 'reassurance_routes_disconnected',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Help, FAQ, confirmation, or warranty pages were discovered but have no navigation links from the main commercial journey. These pages were built to reduce buyer anxiety — but buyers cannot find them. The investment in reassurance content is wasted because the content is disconnected from the path where anxiety occurs.`,
    reasoning_slots: { severity },
  })];
}

function inferAlternateFlowMeasurementGap(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('alternate_flow_measurement_gap');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'alternate_flows_unmeasured',
    category: InferenceCategory.AlternateFlowMeasurementGap,
    conclusion: 'alternate_flows_unmeasured',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Some commercial pages lack analytics coverage while others have it. Revenue flowing through the untracked paths cannot be attributed, measured, or optimized. The ad spend driving traffic to these paths is unaccountable — the business cannot tell whether these routes convert, leak, or waste budget.`,
    reasoning_slots: { severity },
  })];
}

function inferRuntimeReassuranceBreak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('runtime_reassurance_broken');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'runtime_breaking_reassurance',
    category: InferenceCategory.RuntimeReassuranceBreak,
    conclusion: 'runtime_breaking_reassurance',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Support widgets, chat tools, or consent managers are failing at runtime on commercial pages. These are the reassurance mechanisms that convert hesitant buyers — live chat answers last-minute questions, consent tools enable tracking. When they fail, buyers lose their reassurance channel at the exact moment they need it most.`,
    reasoning_slots: { severity },
  })];
}

function inferProviderPathWeak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('provider_path_weaker_than_expected');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_provider_path_weak',
    category: InferenceCategory.ProviderPathWeak,
    conclusion: 'checkout_provider_path_weak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The checkout redirects buyers to an external domain, but no recognized payment provider (Stripe, PayPal, etc.) was detected on the destination. Combined with thin policy coverage, this creates a payment handoff that looks weaker than what buyers expect. Legitimate payment flows typically display recognized provider branding — this one does not.`,
    reasoning_slots: { severity },
  })];
}

function inferTrustMeasurementCompoundBreak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('alternate_flow_trust_measurement_compound');
  if (!sig) return [];

  return [createInference({
    inference_key: 'trust_and_measurement_both_absent',
    category: InferenceCategory.TrustMeasurementCompoundBreak,
    conclusion: 'trust_and_measurement_both_absent',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Multiple commercial paths operate without both trust infrastructure (policies, business identity) and measurement coverage (analytics, tracking). This is the worst compound scenario: revenue cannot convert well because trust is thin, and the business cannot see the problem because measurement is absent. Optimization is impossible on paths where both the experience and the visibility are broken.`,
    reasoning_slots: { severity: 'high' },
  })];
}

// ──────────────────────────────────────────────
// Phase 3B: Deep Discovery Inferences from Katana
// ──────────────────────────────────────────────

function inferPromotionLogicExposed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('promotion_logic_abuse_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'promotion_logic_exposed',
    category: InferenceCategory.PromotionLogicExposed,
    conclusion: 'promotion_logic_exposed', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Deep discovery found promotion, discount, or coupon routes that are structurally exposed to abuse. These endpoints follow predictable patterns or lack rate limiting and authentication gates — the exact conditions that enable automated coupon enumeration, discount stacking, and promotional code brute-forcing. Each exploited promotion directly reduces margin and erodes the ROI of marketing campaigns.`,
    reasoning_slots: { severity },
  })];
}

function inferCartVariantWeakControl(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cart_variant_weak_pricing_control');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'cart_variant_weak_control',
    category: InferenceCategory.CartVariantWeakControl,
    conclusion: 'cart_variant_weak_control', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Multiple cart or checkout route variants were discovered through deep crawling. Alternate cart paths often carry weaker price validation, missing inventory checks, or inconsistent tax calculations compared to the primary flow. When pricing controls are not uniform across all cart variants, the weakest path becomes the attack surface — bots route through whichever variant applies the fewest safeguards.`,
    reasoning_slots: { severity },
  })];
}

function inferHiddenDiscountRefundRoute(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('hidden_discount_refund_weakness');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'hidden_discount_refund_route',
    category: InferenceCategory.HiddenDiscountRefundRoute,
    conclusion: 'hidden_discount_refund_route', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Discount and refund routes discovered outside the expected safeguard envelope. These paths exist in the application but are not governed by the same controls that protect the primary commercial flow. Discoverable refund endpoints without authentication enable fraudulent refund initiation, while exposed discount routes enable code enumeration and stacking. The business impact is margin erosion from the discount side and net financial loss from the refund side.`,
    reasoning_slots: { severity },
  })];
}

function inferGuessableBusinessEndpoint(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('guessable_business_endpoint_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'guessable_business_endpoint',
    category: InferenceCategory.GuessableBusinessEndpoint,
    conclusion: 'guessable_business_endpoint', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Business-critical commerce endpoints follow predictable URL patterns and lack visible safeguards proportional to their business importance. Order management, billing, account, and refund actions are reachable through guessable paths — enabling automated probing, IDOR-style access, and business-logic manipulation. The risk is not theoretical: these patterns are the first targets in automated commerce fraud because they are trivially discoverable.`,
    reasoning_slots: { severity },
  })];
}

function inferAlternatePricingSafeguardBypass(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('alternate_pricing_safeguard_bypass');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'alternate_pricing_safeguard_bypass',
    category: InferenceCategory.AlternatePricingSafeguardBypass,
    conclusion: 'alternate_pricing_safeguard_bypass', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Deep discovery found alternate commercial actions (legacy endpoints, beta paths, test routes, or parameter-based variants) that may bypass intended pricing safeguards. These are not generic alternate pages — they are structurally different commercial actions that process transactions or pricing through weaker validation than the primary checkout flow. The margin and offer integrity risk is that the weakest pricing path determines the actual price floor.`,
    reasoning_slots: { severity },
  })];
}

function inferJsDiscoveredPurchaseVariant(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('js_discovered_purchase_variant');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'js_discovered_purchase_variant',
    category: InferenceCategory.JsDiscoveredPurchaseVariant,
    conclusion: 'js_discovered_purchase_variant', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Client-side JavaScript reveals commerce routes not visible through static navigation — alternate checkout paths, dynamic cart endpoints, or SPA-rendered purchase flows. These variants typically escape the main safeguard model: they may lack analytics instrumentation (invisible to optimization), skip trust-building elements (policies, provider badges), or bypass server-side validation that the primary flow enforces. Revenue flowing through these paths is both unprotected and unmeasured.`,
    reasoning_slots: { severity },
  })];
}

function inferDynamicRouteWeakControl(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('dynamic_route_weak_governance');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'dynamic_route_weak_control',
    category: InferenceCategory.DynamicRouteWeakControl,
    conclusion: 'dynamic_route_weak_control', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Dynamically discovered commerce routes show weaker governance than the visible purchase flow. Routes found through JavaScript rendering lack the safeguards (authentication gates, rate limiting, CSRF protection) that protect the primary path. The structural gap means that the deeper you crawl, the weaker the controls become — creating a gradient of decreasing protection that automated tools exploit preferentially.`,
    reasoning_slots: { severity },
  })];
}

function inferHiddenSupportBurden(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('hidden_support_burden_exposure');
  if (!sig) return [];
  const severity = sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'hidden_support_burden',
    category: InferenceCategory.HiddenSupportBurden,
    conclusion: 'hidden_support_burden', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Support, help, and FAQ routes exist but are structurally disconnected from the commercial journey — they were found through deep crawling, not through the normal buying path. This means buyers who need reassurance during purchase cannot find it, while the same support infrastructure generates downstream ticket volume from post-purchase confusion. The result is the worst of both worlds: support cost without conversion benefit.`,
    reasoning_slots: { severity },
  })];
}

function inferAlternateVariantControlBreakdown(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('alternate_variant_control_breakdown');
  if (!sig) return [];
  return [createInference({
    inference_key: 'alternate_variant_control_breakdown',
    category: InferenceCategory.AlternateVariantControlBreakdown,
    conclusion: 'alternate_variant_control_breakdown', conclusion_value: 'high', severity_hint: 'high',
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Both pricing control exposure and commerce variant proliferation are present. Alternate commerce variants lack the trust signals, measurement infrastructure, and pricing safeguards that protect the primary flow. This compound failure means: pricing can be manipulated on the weaker variant, the manipulation is invisible to analytics, and the buyer experience offers fewer trust signals to offset the weaker controls. Revenue integrity, measurement, and trust all degrade simultaneously on the alternate paths.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferDeepCommerceExploitationRisk(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('deep_commerce_exploitation_risk');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'deep_commerce_exploitation_risk',
    category: InferenceCategory.DeepCommerceExploitationRisk,
    conclusion: 'deep_commerce_exploitation_risk', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Deeply reachable commerce surfaces combine business-logic abuse exposure with safeguard bypass conditions. Guessable endpoints without authentication, exposed refund/billing actions, and alternate pricing paths compound to make deep commerce surfaces materially easier to exploit than the primary purchase flow. This is the exploitation gradient: the primary checkout has security, the deeper endpoints have business logic but not the matching protection. Automated fraud tools target exactly this gap.`,
    reasoning_slots: { severity },
  })];
}

// ──────────────────────────────────────────────
// Phase 2D: Network Analysis Inferences
// ──────────────────────────────────────────────

function inferCheckoutApiLatency(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_api_latency_degrading');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'checkout_api_latency_degraded',
    category: InferenceCategory.CheckoutApiLatencyDegraded,
    conclusion: 'checkout_api_latency_degraded', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Payment-critical API responses on checkout surfaces exceed acceptable latency thresholds. Every second of checkout latency costs conversion: buyers who wait for payment processing to respond are progressively more likely to abandon. This is not generic page slowness — it is latency at the exact moment of purchase commitment.`,
    reasoning_slots: { severity },
  })];
}

function inferCommercialPagesSlow(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_disproportionately_slow');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'commercial_pages_slow',
    category: InferenceCategory.CommercialPagesSlow,
    conclusion: 'commercial_pages_slow', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The pages that generate revenue are disproportionately slower than the rest of the site. Visitors browse at normal speed but hit friction when they reach the commercial path. This asymmetry means the site performs well enough to attract buyers but degrades at the moment they try to convert.`,
    reasoning_slots: { severity },
  })];
}

function inferPaidLandingOverloaded(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('paid_landing_overloaded');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'paid_landing_overloaded',
    category: InferenceCategory.PaidLandingOverloaded,
    conclusion: 'paid_landing_overloaded', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The landing page is overloaded with third-party requests before buyers reach any meaningful action. Paid traffic — which has a real per-click cost — is hitting a heavy runtime wall. CAC increases because media spend arrives into a page that cannot present the offer quickly enough to capture intent.`,
    reasoning_slots: { severity },
  })];
}

function inferThirdPartyWeightDelaysTrust(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('third_party_weight_delays_trust');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'third_party_weight_delays_trust',
    category: InferenceCategory.ThirdPartyWeightDelaysTrust,
    conclusion: 'third_party_weight_delays_trust', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Heavy third-party dependency chains on commercial surfaces delay the moment when buyers feel trust and form intent. Non-essential external scripts, widgets, and trackers are consuming bandwidth and execution time before the buyer reaches the point of confidence. Each delayed second widens the gap between intent arrival and trust formation.`,
    reasoning_slots: { severity },
  })];
}

function inferCheckoutBrittleThirdParty(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_brittle_third_party');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'checkout_brittle_third_party',
    category: InferenceCategory.CheckoutBrittleThirdParty,
    conclusion: 'checkout_brittle_third_party', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Checkout completion depends on third-party services that are failing or unstable during browser verification. When payment providers, cart APIs, or checkout widgets fail to respond reliably, every affected session is a potential lost transaction. This is operational fragility at the revenue-critical surface.`,
    reasoning_slots: { severity },
  })];
}

function inferPurchaseBlockedFailingRequests(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('purchase_flow_blocked_by_failures');
  if (!sig) return [];
  return [createInference({
    inference_key: 'purchase_blocked_failing_requests',
    category: InferenceCategory.PurchaseBlockedFailingRequests,
    conclusion: 'purchase_blocked_failing_requests', conclusion_value: 'high', severity_hint: 'high',
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Payment or commerce API requests are failing on purchase surfaces. This is not slow loading — it is active failure. Buyers who reach checkout and attempt to purchase are being blocked by requests that return errors or never complete. Every instance is a buyer who wanted to pay but could not.`,
    reasoning_slots: { severity: sig.value || 'high' },
  })];
}

function inferMeasurementBreaksRevenuePath(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('measurement_breaks_on_revenue_path');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'measurement_breaks_revenue_path',
    category: InferenceCategory.MeasurementBreaksRevenuePath,
    conclusion: 'measurement_breaks_revenue_path', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Analytics and measurement requests are failing at runtime on the pages that generate revenue. The instrumentation appears to be present but is not actually executing — conversion data, attribution, and funnel metrics are silently dropping on the surfaces that matter most for optimization and ROI measurement.`,
    reasoning_slots: { severity },
  })];
}

function inferPurchaseBeforeDepsReady(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('purchase_before_deps_ready');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'purchase_before_deps_ready',
    category: InferenceCategory.PurchaseBeforeDepsReady,
    conclusion: 'purchase_before_deps_ready', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Critical payment and trust dependencies take too long to become available on checkout surfaces. Buyers can see and interact with the purchase UI before payment processing, trust badges, or support widgets are ready. This sequencing gap means the purchase moment arrives before the infrastructure that supports it — leading to failed transactions, missing trust signals, and incomplete checkout experiences.`,
    reasoning_slots: { severity },
  })];
}

function inferTrustAssetsLateLoad(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('trust_assets_late_load');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'trust_assets_late_load',
    category: InferenceCategory.TrustAssetsLateLoad,
    conclusion: 'trust_assets_late_load', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Trust and reassurance assets — support chat, review widgets, trust badges — start loading well after the page is interactive. Buyers form their trust impression in the first few seconds. When reassurance layers arrive late, the hesitation window is already open and abandonment decisions have already been made. The reassurance investment is wasted because it arrives after the moment it was needed.`,
    reasoning_slots: { severity },
  })];
}

function inferMobileHeavyRuntimeChain(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mobile_heavy_runtime_chain');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'mobile_heavy_runtime_chain',
    category: InferenceCategory.MobileHeavyRuntimeChain,
    conclusion: 'mobile_heavy_runtime_chain', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The mobile commerce path carries a heavy third-party runtime dependency chain. Mobile connections are slower and more constrained than desktop — the same dependency weight that is tolerable on desktop becomes conversion-killing on mobile. Media spend directed at mobile audiences is landing into an experience that physically cannot convert as efficiently as desktop due to runtime overload.`,
    reasoning_slots: { severity },
  })];
}

function inferMobileTrustPaymentDepsFailing(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mobile_critical_deps_failing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'mobile_trust_payment_deps_failing',
    category: InferenceCategory.MobileTrustPaymentDepsFailing,
    conclusion: 'mobile_trust_payment_deps_failing', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Payment, trust, and measurement dependencies are failing on mobile commercial surfaces. Mobile buyers — who typically represent the majority of traffic — are entering a weaker operational environment than desktop. Payment SDKs fail to load, support widgets do not appear, and measurement breaks on the very surfaces where mobile conversion needs the most support.`,
    reasoning_slots: { severity },
  })];
}

function inferTrustSurfacesUnstableDeps(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('trust_surfaces_unstable_deps');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'trust_surfaces_unstable_deps',
    category: InferenceCategory.TrustSurfacesUnstableDeps,
    conclusion: 'trust_surfaces_unstable_deps', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The layers that make buyers feel safe — support widgets, review badges, trust signals, chat tools — depend on external services that are failing or unreliable. Trust-critical surfaces are supposed to reduce hesitation and prevent abandonment, but when these dependencies fail, the trust infrastructure becomes invisible exactly when it matters most. The result is a checkout that looks bare and untrustworthy during outage or degradation of external providers.`,
    reasoning_slots: { severity },
  })];
}

// ──────────────────────────────────────────────
// Behavioral Cohort Inferences (Pixel-Dependent Workspaces)
// ──────────────────────────────────────────────

// Wave 20.6 — local inferCohort removed. Imported from ./shared/builders.

// Wave 20.6 — First Impression Revenue inferences migrated to
// packs/first-impression-revenue.ts

// Wave 20.6 — Action Value Map inferences migrated to packs/action-value-map.ts

// Wave 20.6 — Acquisition Integrity inferences migrated to packs/acquisition-integrity.ts

// Wave 20.6 — mobile-revenue, friction-tax, trust-revenue-gap,
// path-efficiency inferences migrated to packs/<name>.ts

// ──────────────────────────────────────────────
// Wave 7.11: SaaS/Stripe Metric Inferences
// ──────────────────────────────────────────────

function inferSubscriberChurnElevated(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('subscriber_churn_elevated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'subscriber_churn_elevated',
    category: InferenceCategory.SubscriberChurnElevated,
    conclusion: 'subscriber_churn_elevated',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Monthly subscriber churn rate of ${sig.numeric_value}% is above the 5% SaaS benchmark. At this rate, you lose your entire subscriber base in ${Math.round(100 / (sig.numeric_value ?? 5))} months without new signups. Churn compounds — every lost subscriber is lost LTV, and replacing them costs acquisition spend that would have otherwise expanded revenue.`,
    reasoning_slots: { severity },
  })];
}

function inferFailedPaymentRateHigh(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('failed_payment_rate_high');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'failed_payment_rate_high',
    category: InferenceCategory.FailedPaymentRateHigh,
    conclusion: 'failed_payment_rate_high',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of payment attempts are failing — this is involuntary churn from expired cards, insufficient funds, and gateway errors. Each failed payment is a subscriber who intends to pay but cannot. Without dunning automation and card updater integration, these subscribers silently churn without ever making a conscious decision to leave.`,
    reasoning_slots: { severity },
  })];
}

// ──────────────────────────────────────────────
// Wave 8.1: Payment Health & Involuntary Churn Inferences
// ──────────────────────────────────────────────

function inferFailedPaymentRevenueDrain(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('failed_payment_rate_elevated');
  if (!sig) return [];
  const rate = sig.numeric_value ?? 0;
  const severity = rate > 10 ? 'high' : 'medium';
  return [createInference({
    inference_key: 'failed_payment_revenue_drain',
    category: InferenceCategory.FailedPaymentRevenueDrain,
    conclusion: 'failed_payment_revenue_drain',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Failed payments are draining revenue through involuntary churn at a rate of ${rate}%. Every failed charge is a subscriber who wants to pay but can't — expired cards, insufficient funds, and gateway errors are silently converting paying customers into churned ones. Without dunning automation, card updater integration, and grace periods, this revenue loss compounds monthly.`,
    reasoning_slots: { severity, rate },
  })];
}

function inferSubscriberChurnUnsustainable(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('subscriber_churn_rate_elevated');
  if (!sig) return [];
  const rate = sig.numeric_value ?? 0;
  const severity = rate > 12 ? 'high' : 'medium';
  return [createInference({
    inference_key: 'subscriber_churn_unsustainable',
    category: InferenceCategory.SubscriberChurnUnsustainable,
    conclusion: 'subscriber_churn_unsustainable',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Subscriber churn rate of ${rate}% exceeds the sustainable threshold of 7%. At this rate, the subscriber base turns over completely in ${Math.round(100 / rate)} months. Growth cannot outpace attrition — every new subscriber acquired is offset by churn. This requires immediate intervention through retention offers, cancellation surveys, and involuntary churn recovery via dunning automation.`,
    reasoning_slots: { severity, rate },
  })];
}

function inferPaymentDiversityInsufficient(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Reuse the existing single_payment_gateway_risk signal
  const sig = byKey.get('payment_gateway_concentrated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'payment_diversity_insufficient',
    category: InferenceCategory.PaymentDiversityInsufficient,
    conclusion: 'payment_diversity_insufficient',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of payment volume flows through a single gateway. A single provider outage, rate limit change, or policy update halts all recurring revenue collection. Payment infrastructure diversity is a prerequisite for subscription business resilience — without a fallback gateway, any disruption converts a technical issue into a mass involuntary churn event.`,
    reasoning_slots: { severity },
  })];
}

function inferMrrContraction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mrr_contraction_detected');
  if (!sig) return [];
  const deltaPct = sig.numeric_value ?? 0; // negative integer percent, e.g. -8
  const severity = sig.value;
  return [createInference({
    inference_key: 'mrr_contraction_detected',
    category: InferenceCategory.MrrContractionDetected,
    conclusion: 'mrr_contraction_detected',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `MRR is contracting at ${deltaPct}% cycle-over-cycle. This is the leading indicator that failed_payment_rate or subscriber_churn_rate is no longer being offset by new subscriber growth. Dunning recovery, retention offers, and churn diagnosis all need to ramp before the decline compounds across the next renewal cycle.`,
    reasoning_slots: { severity, delta_pct: deltaPct },
  })];
}

// ──────────────────────────────────────────────
// Wave 6.1 — Revenue Attribution Integrity (reframed)
//
// Consumes the `ad_revenue_attribution_gap` signal. We CAN'T claim
// over-attribution as a conclusion because Stripe doesn't see the
// customer's full revenue picture — boleto, PIX, MercadoPago, bank
// transfer, in-person payments, PayPal, alternative gateways all live
// outside Stripe. The factual delta IS interesting, but the cause is
// ambiguous: (a) ads correctly attributing revenue collected through
// channels Stripe doesn't see, (b) genuine over-attribution from
// last-click ROAS inflation, or (c) attribution windows too generous.
// So this inference surfaces a neutral "data sources disagree —
// investigate" finding rather than asserting overattribution. The fix
// always starts with reconciling total transaction revenue across
// every collection channel.
//
// Signal threshold (ratio > 2x) is intentionally conservative because
// gaps under 2x can plausibly be explained by off-Stripe channels
// alone in many Brazilian + LATAM markets.
// ──────────────────────────────────────────────
function inferRevenueAttributionMismatch(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_revenue_attribution_gap');
  if (!sig) return [];
  const ratioPct = sig.numeric_value ?? 0; // e.g. 250 = 2.5x ad/stripe
  const ratioX = (ratioPct / 100).toFixed(1);
  const severity = sig.value;
  return [createInference({
    inference_key: 'revenue_attribution_mismatch',
    category: InferenceCategory.RevenueAttributionMismatch,
    conclusion: 'revenue_attribution_mismatch',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Two of your revenue data sources disagree by a factor of ${ratioX}x — Meta/Google report substantially more attributed revenue than Stripe shows transacted. Three plausible causes, each with a different fix: (a) you collect significant revenue OUTSIDE Stripe (boleto, PIX, MercadoPago, bank transfer, PayPal, in-person) — the ad platforms may be attributing correctly to revenue Stripe simply doesn't see; (b) last-click attribution is over-claiming touches as conversions, inflating ROAS; (c) attribution windows are too generous. Start with reconciliation: pull your full month's revenue across EVERY collection channel and compare against the ad-platform totals. Only adjust ad budget after the gap is explained by (a) or confirmed as (b/c).`,
    reasoning_slots: { severity, ratio_pct: ratioPct },
  })];
}

// ──────────────────────────────────────────────
// Wave 7.11M — Pixel coverage gap (measurement integrity)
//
// Surfaces partial-pixel-installation as a high-confidence finding so the
// user understands WHY checkout-dependent findings are absent or muted.
// Signal-layer gating (in extractBehavioralSignals) already prevents
// emitting false positives like `high_intent_detour`/`checkout_abandon`
// when checkout coverage is missing — this inference closes the loop by
// telling the user the gap exists. Maps to revenue_integrity pack because
// missing pixel coverage on checkout/thank_you directly distorts revenue
// path visibility.
// ──────────────────────────────────────────────
function inferPixelCoverageGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('pixel_coverage_gap');
  if (!sig) return [];
  // signal.value is a comma-separated list of missing page types (e.g. "checkout" or "checkout,thank_you")
  const missingTypes = String(sig.value || '').split(',').filter(Boolean);
  const checkoutMissing = missingTypes.includes('checkout');
  // Severity: missing checkout is high (no revenue funnel visibility),
  // missing only thank_you is medium (conversion attribution lost, but
  // pre-conversion behavior still visible).
  const severity: 'high' | 'medium' = checkoutMissing ? 'high' : 'medium';
  return [createInference({
    inference_key: 'pixel_coverage_gap',
    category: InferenceCategory.PixelCoverageGap,
    conclusion: 'pixel_coverage_gap',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The behavioral pixel is not installed on ${missingTypes.join(' and ')}. Behavioral findings about ${missingTypes.join('/')} are being suppressed to avoid false positives (otherwise "zero conversions" gets misread as "no conversions happen" when the real cause is "no pixel sees them"). Install the pixel on the missing page types to surface checkout abandonment, retry friction, and conversion-rate findings that are currently invisible.`,
    reasoning_slots: { severity, missing_types: missingTypes.join(',') },
  })];
}
