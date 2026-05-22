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

  // Wave 3.1 Tier 2: LLM enrichment inferences (dormant until enrichment evidence exists)
  inferences.push(...inferSocialProofGeneric(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFormErrorMessagesUnhelpful(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferOnboardingNoQuickWin(byKey, scoping, cycle_ref, ids));

  // Tier 1 Copy Analysis inferences
  inferences.push(...inferCheckoutTrustLanguageAbsent(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCtaClarityWeak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferProductPageCopyGeneric(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPricingPageFramingUnclear(byKey, scoping, cycle_ref, ids));

  // Wave 3.10 Copy Analysis Pack inferences
  inferences.push(...inferValuePropositionBuried(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSocialProofIneffective(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferObjectionUnaddressed(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferUrgencyDarkPattern(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferOnboardingCopyWeak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferNavigationConfusing(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAboveFoldCluttered(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCopyCrossPageInconsistent(byKey, scoping, cycle_ref, ids));

  // Wave 3.10 Fase 4 — Polish enrichment inferences
  inferences.push(...inferLocalizationPersuasionLost(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMicroCopyFrictionHigh(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSeoConversionConflict(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCopyStaleReferences(byKey, scoping, cycle_ref, ids));
  // Wave 8.3: Content Freshness & Decay
  inferences.push(...inferCommercialPageStale(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPricingPageOutdated(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSocialProofExpired(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferContentDecayProgression(byKey, scoping, cycle_ref, ids));

  // Phase 4A: Commerce context inferences (Shopify-powered)
  inferences.push(...inferCheckoutAbandonmentRevenueLeak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPromotedProductOutOfStock(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHighRefundRateErodingRevenue(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSinglePaymentGatewayRisk(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDiscountAbusePattern(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdSpendPlatformConcentrationRisk(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdsWithoutConversionVisibility(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdCreativeDeadDestination(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdCreativeLandingTrustGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdCreativeFormFrictionWaste(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdCreativeMobileCheckoutDegraded(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAdCreativeMessageMismatch(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferLowRepeatPurchaseRate(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDeadWeightProducts(byKey, scoping, cycle_ref, ids));
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

  // Wave 4.1: Cybersecurity Phase 2
  inferences.push(...inferInformationDisclosure(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferScriptSupplyChainRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAuthSurfaceInsecure(first, byKey, scoping, cycle_ref, ids));

  // Wave 4.2: LLM Enrichment
  inferences.push(...inferPricingOfferUnclear(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPagePurposeMismatch(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferStructuredDataMismatch(byKey, scoping, cycle_ref, ids));

  // Wave 4.6: Neglected Findings
  inferences.push(...inferPaymentHandoffDropoff(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSaasActivationGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferOscillationClustering(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferNetworkErrorWeighted(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileTrustGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferBehavioralMicroPatternCascade(byKey, scoping, cycle_ref, ids));

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

// ──────────────────────────────────────────────
// Phase 4A: Commerce Context Inferences
//
// Inferences powered by real Shopify data via
// CommerceContext. These fire only when the
// corresponding commerce signal is present.
// ──────────────────────────────────────────────

function inferCheckoutAbandonmentRevenueLeak(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_abandonment_rate_high');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'checkout_abandonment_revenue_leak',
    category: InferenceCategory.CheckoutAbandonmentRevenueLeak,
    conclusion: 'checkout_abandonment_revenue_leak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Checkout abandonment rate is ${sig.numeric_value}%. Every abandoned cart is revenue that reached the final step and walked away. At this rate, your checkout is the single largest revenue leak in the business — more than any marketing problem or product issue.`,
    reasoning_slots: { severity },
  })];
}

function inferPromotedProductOutOfStock(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('promoted_products_out_of_stock');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'promoted_product_out_of_stock',
    category: InferenceCategory.PromotedProductOutOfStock,
    conclusion: 'promoted_product_out_of_stock',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value} promoted product(s) are out of stock. Buyers arrive ready to purchase and find they cannot — ad spend drives traffic to dead ends, organic rankings reward pages that frustrate instead of convert.`,
    reasoning_slots: { severity, count: sig.numeric_value ?? 0 },
  })];
}

function inferHighRefundRateErodingRevenue(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('refund_rate_elevated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'high_refund_rate_eroding_revenue',
    category: InferenceCategory.HighRefundRateErodingRevenue,
    conclusion: 'high_refund_rate_eroding_revenue',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Refund rate of ${sig.numeric_value}% is eating into revenue. Each refund costs the sale plus processing fees, shipping, and operational time. A refund rate this high signals a systemic gap between what the buyer expected and what they received.`,
    reasoning_slots: { severity },
  })];
}

function inferSinglePaymentGatewayRisk(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('payment_gateway_concentrated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'single_payment_gateway_risk',
    category: InferenceCategory.SinglePaymentGatewayRisk,
    conclusion: 'single_payment_gateway_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of transactions flow through a single payment gateway. A single point of failure for all revenue — one gateway outage, rate limit, or policy change stops every transaction until resolved. No fallback means zero revenue during downtime.`,
    reasoning_slots: { severity },
  })];
}

function inferDiscountAbusePattern(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('discount_usage_elevated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'discount_abuse_pattern',
    category: InferenceCategory.DiscountAbusePattern,
    conclusion: 'discount_abuse_pattern',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of orders use discount codes. When most orders are discounted, full-price purchases become the exception — buyers learn to wait for codes, share them freely, and never pay the listed price. Margin erosion compounds every month.`,
    reasoning_slots: { severity },
  })];
}

function inferAdSpendPlatformConcentrationRisk(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_spend_platform_concentrated');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'ad_spend_platform_concentration_risk',
    category: InferenceCategory.AdSpendPlatformConcentrationRisk,
    conclusion: 'ad_spend_platform_concentration_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value}% of monthly ad spend is concentrated on a single platform. An account disable, policy change, or platform outage would halt acquisition — standing up an alternative channel typically takes weeks, and revenue drops during the gap. Single-platform dependency is the acquisition-side analogue of single-payment-gateway risk.`,
    reasoning_slots: { severity },
  })];
}

function inferAdsWithoutConversionVisibility(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ads_active_without_conversion_tracking');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'ads_without_conversion_visibility',
    category: InferenceCategory.AdsWithoutConversionVisibility,
    conclusion: 'ads_without_conversion_visibility',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Ad spend of $${sig.numeric_value}/month is running without a commerce platform connected to measure its return. Every dollar of ad spend without conversion tracking is a dollar that cannot be attributed, compared against the next dollar, or defended as worth the spend. ROAS is not low — it's literally unknown.`,
    reasoning_slots: { severity },
  })];
}

function inferAdCreativeDeadDestination(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_dead_destination');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_dead_destination',
    category: InferenceCategory.AdCreativeDeadDestination,
    conclusion: 'ad_creative_dead_destination',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend is directed at a URL that returns an error or redirects through too many hops. Every dollar of this spend reaches a dead end — buyers who click the ad cannot complete the intended action. This is 100% waste, recoverable immediately by updating the creative's destination URL.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeLandingTrustGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_landing_trust_gap');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_landing_trust_gap',
    category: InferenceCategory.AdCreativeLandingTrustGap,
    conclusion: 'ad_creative_landing_trust_gap',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend sends buyers to a page that collects sensitive data (payment, password, identity) but shows fewer than 2 trust signals (badges, reviews, certificates). The gap between what the ad promises and what the landing page reassures drives abandonment — buyers who were ready to convert decide the risk is not worth it at the moment they are asked for sensitive information.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeFormFrictionWaste(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_form_friction_waste');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_form_friction_waste',
    category: InferenceCategory.AdCreativeFormFrictionWaste,
    conclusion: 'ad_creative_form_friction_waste',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend sends buyers to a page with a form that demands excessive input. Every field past six measurably increases abandonment — the ad brought a buyer to the conversion step, and the form pushed them away. A portion of this spend converts to friction instead of revenue.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeMobileCheckoutDegraded(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('ad_creative_mobile_checkout_degraded');
  if (!sig) return [];
  return [createInference({
    inference_key: 'ad_creative_mobile_checkout_degraded',
    category: InferenceCategory.AdCreativeMobileCheckoutDegraded,
    conclusion: 'ad_creative_mobile_checkout_degraded',
    conclusion_value: sig.value,
    severity_hint: sig.value,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `$${sig.numeric_value}/month of ad spend sends mobile buyers to a page where the commercial path shows step failures or extended load times. Mobile users who arrive from the ad encounter a degraded experience — CTAs load late, forms fail, or the checkout path stalls. The ad did its job getting the click; the landing page fails to convert it.`,
    reasoning_slots: { severity: sig.value || 'medium' },
  })];
}

function inferAdCreativeMessageMismatch(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  // Collect all per-URL mismatch signals
  const matches: Signal[] = [];
  for (const [key, sig] of byKey.entries()) {
    if (key.startsWith('ad_message_mismatch_detected_')) matches.push(sig);
  }
  if (matches.length === 0) return [];

  const worst = matches.reduce((a, b) =>
    (a.numeric_value ?? 0) > (b.numeric_value ?? 0) ? a : b,
  );
  const totalSpend = matches.reduce((sum, s) => sum + (s.numeric_value ?? 0), 0);
  const severity = worst.value || 'medium';

  return [createInference({
    inference_key: 'ad_creative_message_mismatch',
    category: InferenceCategory.AdCreativeMessageMismatch,
    conclusion: 'ad_creative_message_mismatch',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: worst.confidence,
    scoping, cycle_ref, ids,
    signal_refs: matches.map(s => makeRef('signal', s.id)),
    evidence_refs: matches.flatMap(s => s.evidence_refs),
    reasoning: `$${totalSpend}/month of ad spend sends traffic to ${matches.length} page(s) where the ad's promise doesn't match the landing page's content. The ad headline, value proposition, or CTA sets an expectation that the landing page fails to deliver — buyers arrive expecting one thing and find another, driving bounce rates up and conversion rates down.`,
    reasoning_slots: { severity, totalSpend },
  })];
}

function inferLowRepeatPurchaseRate(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('repeat_purchase_rate_low');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'low_repeat_purchase_rate',
    category: InferenceCategory.LowRepeatPurchaseRate,
    conclusion: 'low_repeat_purchase_rate',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Only ${sig.numeric_value}% of customers return to buy again. Customer acquisition cost is not being amortized across multiple purchases — each customer is effectively a one-time transaction, making every new sale as expensive as the first.`,
    reasoning_slots: { severity },
  })];
}

function inferDeadWeightProducts(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('dead_weight_products_detected');
  if (!sig) return [];
  const severity = sig.value;
  return [createInference({
    inference_key: 'dead_weight_products',
    category: InferenceCategory.DeadWeightProducts,
    conclusion: 'dead_weight_products',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${sig.numeric_value} product(s) haven't generated a single sale in 30 days. Dead inventory dilutes site search results, clutters category pages, and wastes operational bandwidth on listings that contribute nothing to revenue.`,
    reasoning_slots: { severity, count: sig.numeric_value ?? 0 },
  })];
}

// ──────────────────────────────────────────────
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
