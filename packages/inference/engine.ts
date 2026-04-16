import {
  Signal,
  Inference,
  InferenceCategory,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
} from '../domain';

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

  // Existing inference rules (scale_readiness)
  inferences.push(...inferCommerceContext(first, byKey, signals, scoping, cycle_ref, ids));
  inferences.push(...inferTrustBoundary(first, scoping, cycle_ref, ids));
  inferences.push(...inferPolicyGap(first, byKey, signals, scoping, cycle_ref, ids));
  inferences.push(...inferRevenuePathFragility(first, scoping, cycle_ref, ids));
  inferences.push(...inferMeasurementCoverage(first, scoping, cycle_ref, ids));
  inferences.push(...inferCheckoutIntegrity(first, scoping, cycle_ref, ids));

  // Revenue inference rules (revenue_integrity)
  inferences.push(...inferConversionFlowFragmentation(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFrictionOnCriticalPath(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferRevenueLeakage(first, byKey, signals, scoping, cycle_ref, ids));
  inferences.push(...inferTrustRevenueImpact(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMeasurementBlindspot(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferConversionClarity(first, byKey, scoping, cycle_ref, ids));

  // Chargeback inference rules (chargeback_resilience)
  inferences.push(...inferRefundPolicyRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSupportAccessibility(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferExpectationAlignment(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDisputeRisk(first, byKey, signals, scoping, cycle_ref, ids));

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
  inferences.push(...inferPaymentSurfaceExposure(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferChannelHijackExposure(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCommerceContinuityThreat(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferLowTrustPosture(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferChannelCompromisePattern(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferAbuseExposure(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCheckoutInfraBrittle(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferEconomicExploitation(byKey, scoping, cycle_ref, ids));

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

  // Phase 3E: Discoverability inferences
  inferences.push(...inferWeakSearchRepresentation(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSocialPreviewsFailValue(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferBrandInconsistentSurfaces(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCommercialPagesUnlikelyIndexed(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferWeakSemanticIntentSignals(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPreviewsDisconnectedConversion(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCommercialPagesNotExposed(byKey, scoping, cycle_ref, ids));

  // Phase 3E: Brand integrity inferences
  inferences.push(...inferLookalikeDomains(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferExternalMimicry(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferBrandTrafficDeceptive(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSuspiciousDomainsPurchaseIntent(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPhishingExposure(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferBrandDilution(byKey, scoping, cycle_ref, ids));

  // Phase 4B: Behavioral intelligence inferences
  inferences.push(...inferPolicyViewAbandonment(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHighIntentDetour(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSupportTooLateToConvert(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCtaBehaviorallyDead(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPurchaseHesitationBacktrack(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCriticalStepRetries(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileFirstActionFails(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFunnelStepStalled(byKey, scoping, cycle_ref, ids));
  // Phase 4B Hardening: 12 new behavioral inferences
  inferences.push(...inferHesitationBeforeConversionMissingTrust(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPricingHesitationUnclearValue(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPolicyDetourBeforeConversion(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCtaViewedNotEngaged(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSensitiveInputAbandonment(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFormExcessiveFieldsBeforeConversion(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFormSubmissionRetryFriction(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSurfaceOscillationBeforeDropoff(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferConversionFinalStepRetry(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCtaLateAvailabilityDelaysAction(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCheckoutAbandonNoFeedback(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSensitiveInputPerceivedRiskDropoff(byKey, scoping, cycle_ref, ids));
  // Behavioral cohort inferences (pixel-dependent workspaces)
  inferences.push(...inferFirstSessionMilestoneStall(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFirstSessionTrustBarrier(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFirstSessionCtaTimingGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferLowValueActionDominates(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferHighValueActionUnderexposed(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDeadWeightSurfaceTraffic(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPaidTrafficFrictionElevated(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPaidTrafficTrustGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPaidMobileCompoundingWaste(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileConversionGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileFormFrictionElevated(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMobileCtaTimingDegraded(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFunnelStepFrictionCost(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferOscillationDecisionCost(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCheckoutEntryFriction(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferTrustDeficitConversionDrag(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferReassuranceSeekingElevated(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferSensitiveInputTrustGap(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPathLengthExceedsEfficient(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferIntentAbsorberDetected(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferIntentDecayTimeExcessive(byKey, scoping, cycle_ref, ids));

  // Wave 3.3: Security posture inferences
  inferences.push(...inferSecurityHeaderWeakness(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferMixedContentExposure(first, byKey, scoping, cycle_ref, ids));
  // open_redirect_indicator merged into inferRedirectTrustErosion (revenue_integrity pack)
  inferences.push(...inferSensitiveEndpointExposed(first, byKey, scoping, cycle_ref, ids));
  // Wave 3.3 expansion: new cybersecurity findings
  inferences.push(...inferCheckoutScriptHijackRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferBuyerSessionTheftRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCheckoutClickjackRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPaymentDataUnencrypted(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferErrorPageInformationLeak(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferEmailDeliverabilityRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCorsMisconfigurationRisk(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferRateLimitingAbsent(first, byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPredictableOrderUrls(first, byKey, scoping, cycle_ref, ids));

  // Wave 3.1 Tier 2: LLM enrichment inferences (dormant until enrichment evidence exists)
  inferences.push(...inferSocialProofGeneric(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferFormErrorMessagesUnhelpful(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferOnboardingNoQuickWin(byKey, scoping, cycle_ref, ids));

  // Tier 1 Copy Analysis inferences
  inferences.push(...inferCheckoutTrustLanguageAbsent(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferCtaClarityWeak(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferProductPageCopyGeneric(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferPricingPageFramingUnclear(byKey, scoping, cycle_ref, ids));

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
  inferences.push(...inferLowRepeatPurchaseRate(byKey, scoping, cycle_ref, ids));
  inferences.push(...inferDeadWeightProducts(byKey, scoping, cycle_ref, ids));

  return inferences;
}

// ──────────────────────────────────────────────
// Wave 3.3: Security Posture Inferences
// ──────────────────────────────────────────────

function inferSecurityHeaderWeakness(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const score = byKey.get('security_headers_score');
  const hstsMissing = byKey.get('hsts_missing');
  const cspWeak = byKey.get('csp_missing_or_weak');
  // clickjack_protection_missing removed — now handled by checkout_clickjack_risk

  if (!score && !hstsMissing && !cspWeak) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (score) {
    relevant.push(score);
    factors.push(`headers score ${score.numeric_value}/100`);
  }
  if (hstsMissing) { relevant.push(hstsMissing); factors.push('HSTS missing'); }
  if (cspWeak) { relevant.push(cspWeak); factors.push(cspWeak.value === 'weak' ? 'CSP weak (unsafe-inline/eval)' : 'CSP missing'); }

  const numericScore = score?.numeric_value ?? 100;
  const severity = numericScore < 30 ? 'high' : numericScore < 60 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'security_header_weakness',
    category: InferenceCategory.SecurityHeaderWeakness,
    conclusion: 'security_header_weakness',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Browser trust signals ${severity}. ${factors.join('; ')}. Browsers show "Not Secure" warnings and remove the padlock when these headers are missing — buyers see these signals and abandon.`,
  })];
}

function inferMixedContentExposure(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const mixedScript = byKey.get('mixed_content_script');
  const mixedForm = byKey.get('mixed_content_form_action');
  const mixedCheckout = byKey.get('mixed_content_on_checkout');

  if (!mixedScript && !mixedForm && !mixedCheckout) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (mixedScript) { relevant.push(mixedScript); factors.push(`${mixedScript.numeric_value} mixed script(s)`); }
  if (mixedForm) { relevant.push(mixedForm); factors.push(`${mixedForm.numeric_value} insecure form action(s)`); }
  if (mixedCheckout) { relevant.push(mixedCheckout); factors.push(`mixed content on ${mixedCheckout.numeric_value} commercial page(s)`); }

  const severity = mixedCheckout ? 'high' : (mixedForm || mixedScript) ? 'medium' : 'low';

  return [createInference({
    inference_key: 'mixed_content_exposure',
    category: InferenceCategory.MixedContentExposure,
    conclusion: 'mixed_content_exposure',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 95,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Checkout breakage risk ${severity}. ${factors.join('; ')}. Payment scripts, forms, and trust badges loaded over HTTP are silently blocked on HTTPS pages — the buyer clicks Pay and nothing happens.`,
  })];
}

function inferOpenRedirectIndicator(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const urlParam = byKey.get('redirect_with_url_parameter');
  const crossDomain = byKey.get('redirect_chain_to_unknown_domain');

  if (!urlParam && !crossDomain) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (urlParam) { relevant.push(urlParam); factors.push(`${urlParam.numeric_value} URL-parameter redirect(s)`); }
  if (crossDomain) { relevant.push(crossDomain); factors.push(`${crossDomain.numeric_value} cross-domain redirect(s) to unknown destinations`); }

  const severity = (urlParam && crossDomain) ? 'high' : 'medium';

  return [createInference({
    inference_key: 'open_redirect_indicator',
    category: InferenceCategory.OpenRedirectIndicator,
    conclusion: 'open_redirect_indicator',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 70,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Domain phishing risk ${severity}. ${factors.join('; ')}. Attackers create legitimate-looking links on your domain that redirect buyers to fake checkout pages — real customers lose money thinking they are on your site.`,
  })];
}

function inferSensitiveEndpointExposed(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const adminExposed = byKey.get('admin_panel_exposed');
  const sensitiveFile = byKey.get('sensitive_file_accessible');
  const apiDocs = byKey.get('api_docs_public');

  if (!adminExposed && !sensitiveFile && !apiDocs) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (sensitiveFile) { relevant.push(sensitiveFile); factors.push(`${sensitiveFile.numeric_value} sensitive file(s) publicly accessible`); }
  if (adminExposed) { relevant.push(adminExposed); factors.push(`${adminExposed.numeric_value} admin path(s) exposed`); }
  if (apiDocs) { relevant.push(apiDocs); factors.push(`${apiDocs.numeric_value} API doc endpoint(s) public`); }

  const severity = sensitiveFile ? 'high' : (adminExposed || apiDocs) ? 'medium' : 'low';

  return [createInference({
    inference_key: 'sensitive_endpoint_exposed',
    category: InferenceCategory.SensitiveEndpointExposed,
    conclusion: 'sensitive_endpoint_exposed',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 90,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Infrastructure exposure ${severity}. ${factors.join('; ')}. Publicly accessible credentials and admin panels mean one breach away from total commerce shutdown — revenue goes to zero.`,
  })];
}

function inferCheckoutScriptHijackRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const hijackRisk = byKey.get('checkout_script_hijack_risk');
  if (!hijackRisk) return [];

  const count = hijackRisk.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_script_hijack_risk',
    category: InferenceCategory.CheckoutScriptHijackRisk,
    conclusion: 'checkout_script_hijack_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: hijackRisk.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', hijackRisk.id)],
    evidence_refs: hijackRisk.evidence_refs,
    reasoning: `Checkout hijack risk ${severity}. ${count} unvetted external script(s) load on payment pages without CSP protection. A single compromised script can silently replace the payment form, redirect card data to an attacker, or inject fake checkout flows — buyers see your domain and trust it.`,
  })];
}

function inferBuyerSessionTheftRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const cookieWeak = byKey.get('cookie_security_weak');
  if (!cookieWeak) return [];

  const count = cookieWeak.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'buyer_session_theft_risk',
    category: InferenceCategory.BuyerSessionTheftRisk,
    conclusion: 'buyer_session_theft_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: cookieWeak.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', cookieWeak.id)],
    evidence_refs: cookieWeak.evidence_refs,
    reasoning: `Session theft risk ${severity}. ${count} cookie(s) on commercial pages lack Secure, HttpOnly, or SameSite flags. Attackers can steal buyer sessions via XSS or network sniffing, make purchases with saved payment methods, or access account data — all without the buyer knowing.`,
  })];
}

function inferCheckoutClickjackRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const clickjackMissing = byKey.get('clickjack_protection_missing');
  const checkoutDetected = first('checkout.detected');

  if (!clickjackMissing || !checkoutDetected) return [];

  const count = clickjackMissing.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_clickjack_risk',
    category: InferenceCategory.CheckoutClickjackRisk,
    conclusion: 'checkout_clickjack_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: clickjackMissing.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', clickjackMissing.id)],
    evidence_refs: clickjackMissing.evidence_refs,
    reasoning: `Clickjack risk ${severity}. Clickjacking protection missing on ${count} page(s) and commercial checkout exists. Attackers can embed your checkout page inside a fake site using an invisible iframe — buyers think they are clicking on the attacker's page but are actually authorizing payments on yours.`,
  })];
}

function inferPaymentDataUnencrypted(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const insecureTarget = byKey.get('payment_form_insecure_target');
  if (!insecureTarget) return [];

  const count = insecureTarget.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'payment_data_unencrypted',
    category: InferenceCategory.PaymentDataUnencrypted,
    conclusion: 'payment_data_unencrypted',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: insecureTarget.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', insecureTarget.id)],
    evidence_refs: insecureTarget.evidence_refs,
    reasoning: `Payment data exposure ${severity}. ${count} payment form(s) submit to insecure or untrusted destinations. Card numbers, CVVs, and personal data cross an unencrypted boundary where any network observer — coffee shop WiFi, ISP, compromised router — can capture them in plaintext.`,
  })];
}

function inferErrorPageInformationLeak(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const leaks = byKey.get('error_page_leaks_internals');
  if (!leaks) return [];

  const count = leaks.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'error_page_information_leak',
    category: InferenceCategory.ErrorPageInformationLeak,
    conclusion: 'error_page_information_leak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: leaks.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', leaks.id)],
    evidence_refs: leaks.evidence_refs,
    reasoning: `Error page information leak ${severity}. ${count} error page(s) return verbose responses (> 2 KB) on 4xx/5xx status codes. These likely expose stack traces, framework versions, database connection details, or internal file paths — giving attackers a detailed map of the system architecture to craft targeted exploits.`,
  })];
}

function inferEmailDeliverabilityRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const emailAbsent = byKey.get('email_infrastructure_absent');
  if (!emailAbsent) return [];

  const checkoutExists = first('checkout.detected') || first('checkout.mode');
  const severity = checkoutExists ? 'high' : 'medium';

  return [createInference({
    inference_key: 'email_deliverability_risk',
    category: InferenceCategory.EmailDeliverabilityRisk,
    conclusion: 'email_deliverability_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: emailAbsent.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', emailAbsent.id)],
    evidence_refs: emailAbsent.evidence_refs,
    reasoning: `Email deliverability risk ${severity}. Commerce site with checkout but no detectable email infrastructure (ESP, transactional email provider). Without SPF/DKIM/DMARC configured through a reputable email provider, order confirmation emails land in spam — buyers assume the purchase failed or was fraudulent and file chargebacks.`,
  })];
}

function inferCorsMisconfigurationRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const corsWildcard = byKey.get('cors_wildcard_on_commercial');
  if (!corsWildcard) return [];

  const count = corsWildcard.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'cors_misconfiguration_risk',
    category: InferenceCategory.CorsMisconfigurationRisk,
    conclusion: 'cors_misconfiguration_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: corsWildcard.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', corsWildcard.id)],
    evidence_refs: corsWildcard.evidence_refs,
    reasoning: `CORS misconfiguration risk ${severity}. ${count} commercial page(s) return Access-Control-Allow-Origin: *. Wildcard CORS on payment endpoints lets any website make authenticated cross-origin requests — malicious sites can read session data, initiate purchases, and extract customer information using the buyer's authenticated session.`,
  })];
}

function inferRateLimitingAbsent(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const noRateLimit = byKey.get('no_rate_limit_headers_commercial');
  if (!noRateLimit) return [];

  const count = noRateLimit.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'rate_limiting_absent_on_commerce',
    category: InferenceCategory.RateLimitingAbsent,
    conclusion: 'rate_limiting_absent_on_commerce',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: noRateLimit.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', noRateLimit.id)],
    evidence_refs: noRateLimit.evidence_refs,
    reasoning: `Rate limiting risk ${severity}. No rate-limit headers detected on ${count} commercial endpoint(s). Without rate limiting, fraud bots can test thousands of stolen cards per minute, hoard inventory through automated cart requests, and scrape pricing — generating chargebacks, stock manipulation, and operational chaos.`,
  })];
}

function inferPredictableOrderUrls(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const predictable = byKey.get('predictable_data_url_pattern');
  if (!predictable) return [];

  const count = predictable.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'predictable_order_urls',
    category: InferenceCategory.PredictableOrderUrls,
    conclusion: 'predictable_order_urls',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: predictable.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', predictable.id)],
    evidence_refs: predictable.evidence_refs,
    reasoning: `Predictable URL exposure ${severity}. ${count} URL(s) matching sequential patterns (e.g. /order/123, /invoice/456) return HTTP 200. Sequential URLs let anyone enumerate orders, invoices, and customer profiles — exposing personal and financial data at scale without authentication barriers.`,
  })];
}

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
    }),
  ];
}

// ──────────────────────────────────────────────
// Revenue Inference Rules
// ──────────────────────────────────────────────

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
    leakPoints.push('checkout leaves domain — attribution and trust break');
    relevantSignals.push(offDomain);
    score += 25;
  }
  if (noFunnel?.value === 'false') {
    leakPoints.push('no clear conversion path entry — users cannot find how to convert');
    relevantSignals.push(noFunnel);
    score += 20;
  }
  if (fragmented?.value === 'true') {
    leakPoints.push('conversion path fragments across multiple hosts');
    relevantSignals.push(fragmented);
    score += 20;
  }
  if (brokenForm?.value === 'true') {
    leakPoints.push(`${brokenForm.numeric_value} broken form(s) — direct revenue loss`);
    relevantSignals.push(brokenForm);
    score += 30;
  }
  if (missingTracking) {
    leakPoints.push('no measurement on commercial pages — leakage is invisible');
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
    factors.push('no policies near checkout — legal and trust risk at conversion point');
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
    factors.push('only basic analytics — attribution gaps likely');
    relevantSignals.push(measurement);
    score += 15;
  }

  if (missingCommercial) {
    factors.push('no tracking on commercial pages — conversion measurement impossible');
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
  })];
}

// ──────────────────────────────────────────────
// Chargeback Inference Rules
// ──────────────────────────────────────────────

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
  })];
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
  })];
}

// ──────────────────────────────────────────────
// Phase 3A: Channel Integrity Inferences
// ──────────────────────────────────────────────

function inferPaymentSurfaceExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('payment_surface_script_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'payment_surface_compromised',
    category: InferenceCategory.PaymentSurfaceScriptExposure,
    conclusion: 'payment_surface_compromised', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Purchase surfaces are exposed to unauthorized script execution. Injection patterns or missing script controls on checkout and payment pages enable formjacking, session hijack, and payment data interception. This is not a theoretical vulnerability — it is the exact pattern used in real-world payment compromises (Magecart, web skimming). Every transaction through these surfaces carries active fraud exposure.`,
  })];
}

function inferChannelHijackExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('channel_hijack_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'channel_traffic_divertible',
    category: InferenceCategory.ChannelHijackExposure,
    conclusion: 'channel_traffic_divertible', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Customer traffic can be diverted through weakly governed channel surfaces. Open redirects, permissive cross-origin policies, or exposed infrastructure enable attackers to create legitimate-looking links that route buyers to phishing destinations, fake checkout pages, or competitor sites — using the brand's own domain as the trust anchor.`,
  })];
}

function inferCommerceContinuityThreat(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commerce_continuity_threat');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'commerce_operations_exposed',
    category: InferenceCategory.CommerceContinuityThreat,
    conclusion: 'commerce_operations_exposed', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Public-facing operational surfaces — admin panels, debug endpoints, or configuration files — are accessible near the commercial footprint. An attacker who reaches these surfaces can modify pricing, disable checkout, extract customer data, or trigger downtime. The business impact is not "a security bug" — it is emergency refunds, commerce interruption, and forced incident response.`,
  })];
}

function inferLowTrustPosture(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('low_trust_technical_posture');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({
    inference_key: 'traffic_landing_low_trust_posture',
    category: InferenceCategory.LowTrustTechnicalPosture,
    conclusion: 'traffic_landing_low_trust_posture', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Paid and organic traffic is landing on a domain whose technical posture signals weakness to browsers and cautious buyers. Missing security headers, mixed content, or certificate issues create visible trust friction — browser warnings, missing padlock icons, or "not secure" indicators that suppress conversion before the buyer even reads the offer.`,
  })];
}

function inferChannelCompromisePattern(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('channel_compromise_pattern');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'channel_compromise_visible',
    category: InferenceCategory.ChannelCompromisePattern,
    conclusion: 'channel_compromise_visible', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Multiple exposure types detected across the commercial channel — the pattern of simultaneous weaknesses (payment surfaces, channel governance, operational posture) signals a domain that has not been hardened for commercial operation. Even before a confirmed exploit, this exposure pattern is enough to trigger distrust from cautious buyers, security-conscious partners, and compliance reviewers.`,
  })];
}

function inferAbuseExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('abuse_exposure_conditions');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'commercial_path_abuse_friendly',
    category: InferenceCategory.AbuseExposureConditions,
    conclusion: 'commercial_path_abuse_friendly', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `The commercial path includes conditions that enable automated abuse — unauthenticated API endpoints, exposed schema introspection, or unprotected business-logic surfaces. Attackers can automate pricing manipulation, coupon abuse, inventory depletion, or account enumeration without needing to breach authentication. The result is margin leakage, operational noise, and increased support/fraud burden.`,
  })];
}

function inferCheckoutInfraBrittle(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_infrastructure_brittle');
  if (!sig) return [];
  return [createInference({
    inference_key: 'checkout_trust_brittle_infrastructure',
    category: InferenceCategory.CheckoutInfrastructureBrittle,
    conclusion: 'checkout_trust_brittle_infrastructure', conclusion_value: 'high', severity_hint: 'high',
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Checkout and payment trust is anchored to infrastructure that is both technically weak and actively exploitable. Payment integrity exposures exist alongside trust posture weaknesses on the same commercial domain — the combination means that not only is the checkout surface vulnerable to compromise, but the surrounding infrastructure provides no defense-in-depth. This is a launch/scale blocker: scaling traffic into this environment amplifies both fraud exposure and trust failure.`,
  })];
}

function inferEconomicExploitation(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('economic_exploitation_exposure');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({
    inference_key: 'economic_exploitation_active',
    category: InferenceCategory.EconomicExploitationExposure,
    conclusion: 'economic_exploitation_active', conclusion_value: severity, severity_hint: severity,
    confidence: sig.confidence, scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs,
    reasoning: `Business-logic exploitation conditions are present on the commercial path. Cart or pricing endpoints respond to unauthorized manipulation, coupon endpoints are enumerable, or refund processes are accessible without authentication. This is not theoretical — these are the exact patterns used in automated margin theft: bots that modify prices before checkout, scripts that brute-force coupon codes, and tools that initiate fraudulent refunds at scale. The financial impact is direct: every exploited transaction reduces margin, every abused coupon erodes promotion ROI, every fraudulent refund becomes a net loss.`,
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
  })];
}

// ──────────────────────────────────────────────
// Phase 3E: Discoverability Inferences
// ──────────────────────────────────────────────

function inferWeakSearchRepresentation(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_weak_search_representation');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'commercial_pages_weak_search_representation', category: InferenceCategory.CommercialPagesWeakSearchRepresentation, conclusion: 'commercial_pages_weak_search_representation', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `High-intent commercial pages have missing or thin titles and descriptions. When search engines display these pages in results, the snippets are generic or auto-generated — reducing click-through rate. Every missed click on a high-intent query is discoverable demand that never reaches the site.` })];
}

function inferSocialPreviewsFailValue(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('social_previews_fail_commercial_value');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'social_previews_fail_commercial_value', category: InferenceCategory.SocialPreviewsFailCommercialValue, conclusion: 'social_previews_fail_commercial_value', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `When commercial pages are shared via messaging, social media, or email, they appear as raw URLs without product images, compelling titles, or value propositions. In a world where link previews drive click-through, a bare URL is a wasted distribution opportunity. Every share that fails to communicate value is a conversion the brand already earned but cannot capture.` })];
}

function inferBrandInconsistentSurfaces(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('brand_inconsistent_across_surfaces');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'brand_inconsistent_across_surfaces', category: InferenceCategory.BrandInconsistentAcrossSurfaces, conclusion: 'brand_inconsistent_across_surfaces', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `The brand appears inconsistently across search results, social previews, and sharing surfaces. When titles and descriptions vary widely between commercial pages, search engines cannot build a coherent brand signal. Buyers see an unreliable brand presence — some pages look professional while others look unfinished — reducing both click-through and trust.` })];
}

function inferCommercialPagesUnlikelyIndexed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_unlikely_indexed');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'commercial_pages_unlikely_indexed', category: InferenceCategory.CommercialPagesUnlikelyIndexed, conclusion: 'commercial_pages_unlikely_indexed', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Revenue-generating pages have indexing problems — missing canonical URLs or explicit noindex directives. Search engines may not reliably include these pages in results. Demand that exists for these products or services cannot find the site through search, even when the content is commercially relevant.` })];
}

function inferWeakSemanticIntentSignals(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('weak_semantic_intent_signals');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'weak_semantic_intent_signals', category: InferenceCategory.WeakSemanticIntentSignals, conclusion: 'weak_semantic_intent_signals', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Search engines and AI systems receive weak signals about what these commercial pages offer. Without structured data (Product, Organization, Offer schemas), ranking algorithms and AI assistants must guess page purpose from raw HTML. The result is lower ranking for commercial queries and inaccurate AI-generated summaries that fail to capture the business offering.` })];
}

function inferPreviewsDisconnectedConversion(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('previews_disconnected_from_conversion');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'previews_disconnected_from_conversion', category: InferenceCategory.PreviewsDisconnectedFromConversion, conclusion: 'previews_disconnected_from_conversion', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Social and search previews show content that doesn't match the actual page. Visitors clicking through arrive with expectations set by the preview but encounter different content — creating a mismatch that drives immediate drop-off. The gap between what was promised and what was delivered converts the traffic acquisition cost into waste.` })];
}

function inferCommercialPagesNotExposed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('commercial_pages_not_exposed_for_discovery');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'commercial_pages_not_exposed_for_discovery', category: InferenceCategory.CommercialPagesNotExposedForDiscovery, conclusion: 'commercial_pages_not_exposed_for_discovery', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Key commercial pages have no internal links pointing to them — they exist in the site structure but are invisible to crawlers and users navigating the site. Without structural exposure, search engines cannot discover these pages reliably, and organic demand for the products or services offered on them cannot reach the site.` })];
}

// ──────────────────────────────────────────────
// Phase 3E: Brand Integrity Inferences
// ──────────────────────────────────────────────

function inferLookalikeDomains(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('lookalike_domains_competing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'lookalike_domain_competing_for_traffic', category: InferenceCategory.LookalikeDomainCompetingForTraffic, conclusion: 'lookalike_domain_competing_for_traffic', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Active lookalike domains are competing for brand traffic. When customers search for the brand or type the domain from memory, some portion of traffic lands on impostor domains instead. This inflates effective customer acquisition cost — the brand pays for awareness that is captured by competitors or fraudsters through domain similarity.` })];
}

function inferExternalMimicry(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('external_sites_mimicking_brand');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'external_sites_mimicking_brand', category: InferenceCategory.ExternalSitesMimickingBrand, conclusion: 'external_sites_mimicking_brand', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `External domains are actively mimicking the brand's identity — matching titles, descriptions, and content patterns. This is not passive domain squatting; these sites are designed to look like the real brand. Customers who land on these surfaces may share payment information with fraudsters, damaging both the customer and the brand's reputation.` })];
}

function inferBrandTrafficDeceptive(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('brand_traffic_deceptive_surfaces');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'brand_traffic_exposed_to_deceptive_surfaces', category: InferenceCategory.BrandTrafficExposedToDeceptiveSurfaces, conclusion: 'brand_traffic_exposed_to_deceptive_surfaces', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Typosquat domains — near-identical misspellings of the brand — are active and reachable. Users who make common typing errors land on these surfaces instead of the real site. This diverts direct-type traffic, damages trust when users realize the mistake, and creates chargeback and fraud exposure when the impostor site processes transactions.` })];
}

function inferSuspiciousDomainsPurchaseIntent(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('suspicious_domains_purchase_intent');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'suspicious_domains_capturing_purchase_intent', category: InferenceCategory.SuspiciousDomainsCapturingPurchaseIntent, conclusion: 'suspicious_domains_capturing_purchase_intent', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Lookalike domains show active commerce intent — checkout pages, cart functionality, or pricing structures. These are not passive parked domains; they are positioned to capture purchase-intent traffic and process transactions under a brand-similar identity. Revenue leakage is direct: customers who intended to buy from the brand are buying from impostors.` })];
}

function inferPhishingExposure(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('customers_exposed_to_phishing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'customers_exposed_to_phishing_surfaces', category: InferenceCategory.CustomersExposedToPhishingSurfaces, conclusion: 'customers_exposed_to_phishing_surfaces', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `High-confidence phishing surfaces combine brand domain similarity with active commerce patterns and content mimicry. Customers cannot distinguish these from the real site and may submit payment credentials to fraudsters. The downstream impact includes chargebacks on the brand's payment processor, legal liability from data breach exposure, and lasting trust damage when customers learn they were deceived through a brand-similar surface.` })];
}

function inferBrandDilution(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('brand_diluted_across_variants');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'brand_presence_diluted_across_variants', category: InferenceCategory.BrandPresenceDilutedAcrossVariants, conclusion: 'brand_presence_diluted_across_variants', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `The brand's online presence is fragmented across many domain variants — each one diluting the authority of the legitimate site. Search engines may split ranking signals across multiple similar domains, reducing organic visibility. Buyers encountering multiple brand-similar sites lose confidence in which one is real, suppressing click-through and trust across all surfaces.` })];
}

// ──────────────────────────────────────────────
// Phase 4B: Behavioral Intelligence Inferences
// ──────────────────────────────────────────────

function inferPolicyViewAbandonment(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('policy_view_then_abandonment');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'policy_view_then_abandonment', category: InferenceCategory.PolicyViewThenAbandonment, conclusion: 'policy_view_then_abandonment', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Sessions that open refund or return policy pages are abandoning without returning to the commercial flow. The policy content is triggering doubt rather than building confidence — buyers read the return terms and decide not to buy. This is behavioral evidence that the policy presentation is creating hesitation rather than resolving it.` })];
}

function inferHighIntentDetour(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('high_intent_detour_before_abandonment');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'high_intent_detour_before_abandonment', category: InferenceCategory.HighIntentDetourBeforeAbandonment, conclusion: 'high_intent_detour_before_abandonment', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Buyers who reached the checkout step are detouring into reassurance content (FAQ, support, policy) before abandoning. These are high-intent sessions that failed to convert despite reaching the purchase moment — they needed reassurance that was not already embedded in the checkout experience and went looking for it elsewhere.` })];
}

function inferSupportTooLateToConvert(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('support_discovered_too_late');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'support_discovered_too_late_to_convert', category: InferenceCategory.SupportDiscoveredTooLateToConvert, conclusion: 'support_discovered_too_late_to_convert', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Support channels are being discovered only after users have already reached the purchase step. By the time buyers find help, their pre-purchase questions have already driven abandonment decisions. If support were accessible earlier in the journey — on product, pricing, or cart pages — it could resolve hesitation before it becomes abandonment.` })];
}

function inferCtaBehaviorallyDead(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cta_visible_but_dead');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'cta_visible_but_behaviorally_dead', category: InferenceCategory.CtaVisibleButBehaviorallyDead, conclusion: 'cta_visible_but_behaviorally_dead', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Commercial CTAs on key surfaces are visible to users but generate near-zero behavioral engagement. Users see the call-to-action but do not click — indicating either the CTA copy fails to motivate action, the placement is wrong, or the surrounding context (pricing, trust, value proposition) is insufficient to drive progression.` })];
}

function inferPurchaseHesitationBacktrack(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('purchase_hesitation_backtrack');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'purchase_hesitation_with_backtrack', category: InferenceCategory.PurchaseHesitationWithBacktrack, conclusion: 'purchase_hesitation_with_backtrack', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `A significant portion of sessions are backtracking during the purchase journey — reaching a commercial step and then retreating to previous pages. This behavioral pattern indicates hesitation at the moment of commitment: buyers want to proceed but lack the confidence to do so. The missing element is typically trust reinforcement, price justification, or reassurance content at the decision point.` })];
}

function inferCriticalStepRetries(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('critical_step_retries_before_abandonment');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'critical_step_retries_before_abandonment', category: InferenceCategory.CriticalStepRetriesBeforeAbandonment, conclusion: 'critical_step_retries_before_abandonment', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users are repeatedly attempting the same critical step before giving up. This is not casual browsing — these are users who want to complete the action but encounter errors, confusion, or friction that blocks them. Each retry represents a user fighting the interface before ultimately losing patience and abandoning.` })];
}

function inferMobileFirstActionFails(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('mobile_fails_first_commercial_action');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : 'medium';
  return [createInference({ inference_key: 'mobile_fails_first_commercial_action', category: InferenceCategory.MobileFailsFirstCommercialAction, conclusion: 'mobile_fails_first_commercial_action', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Mobile users are failing to progress past the first commercial action at a rate that significantly exceeds acceptable thresholds. The mobile entry point to the commercial flow is broken or unusable — meaning the majority of traffic (mobile users) hits a dead end before the commercial journey even begins.` })];
}

function inferFunnelStepStalled(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('funnel_step_alive_not_advancing');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'funnel_step_alive_but_not_advancing', category: InferenceCategory.FunnelStepAliveButNotAdvancing, conclusion: 'funnel_step_alive_but_not_advancing', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Funnel steps that are actively receiving sessions are failing to advance users to the next step. These surfaces are alive from a vitality perspective but are behavioral dead ends — users arrive but do not progress. The step exists in the flow but does not function as a transition point, creating a bottleneck that blocks the entire downstream funnel.` })];
}

// ──────────────────────────────────────────────
// Phase 4B Hardening: 12 New Behavioral Inferences
// ──────────���──────────────────────────────���────

function inferHesitationBeforeConversionMissingTrust(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('hesitation_before_conversion_missing_trust');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'hesitation_before_conversion_missing_trust', category: InferenceCategory.HesitationBeforeConversionMissingTrust, conclusion: 'hesitation_before_conversion_missing_trust', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users hesitate before the primary conversion action on commercial surfaces. The pause pattern before CTA engagement indicates insufficient trust or reassurance at the decision point — buyers see the action, want to proceed, but lack the confidence signals they need to commit. The root cause is missing trust reinforcement (guarantees, social proof, policy visibility, support access) near the CTA zone.` })];
}

function inferPricingHesitationUnclearValue(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('pricing_hesitation_unclear_value');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'pricing_hesitation_unclear_value', category: InferenceCategory.PricingHesitationUnclearValue, conclusion: 'pricing_hesitation_unclear_value', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users view pricing then backtrack to product or explanation pages without advancing to conversion. The pricing surface creates a decision moment that the value proposition fails to carry — buyers see the price, cannot justify it from the surrounding context, and retreat to seek additional justification rather than proceeding.` })];
}

function inferPolicyDetourBeforeConversion(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('policy_detour_before_conversion');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'policy_detour_before_conversion', category: InferenceCategory.PolicyDetourBeforeConversion, conclusion: 'policy_detour_before_conversion', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users open policy pages after expressing purchase intent but before completing conversion. This pre-conversion policy detour indicates trust uncertainty at the commitment moment — buyers need to verify refund terms, privacy conditions, or terms of service before they feel safe proceeding. The root cause is insufficient confidence at the point of commitment, not general information seeking.` })];
}

function inferCtaViewedNotEngaged(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cta_viewed_not_engaged');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'cta_viewed_not_engaged', category: InferenceCategory.CtaViewedNotEngaged, conclusion: 'cta_viewed_not_engaged', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `The primary CTA is behaviorally visible to users — scrolled into view on pages with meaningful traffic — but generates disproportionately low engagement. Users see the call-to-action but do not interact with it. The CTA is present but not compelling: weak positioning, unclear copy, or insufficient surrounding context (value proposition, trust signals, urgency) fails to motivate action.` })];
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

  return [createInference({ inference_key: 'sensitive_input_abandonment', category: InferenceCategory.SensitiveInputAbandonment, conclusion: 'sensitive_input_abandonment', conclusion_value: `${severity}:${fieldKind}`, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users abandon the form after interacting with ${fieldLabel} input fields. ${rootCauseContext}` })];
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
  return [createInference({ inference_key: 'form_excessive_fields_before_conversion', category: InferenceCategory.FormExcessiveFieldsBeforeConversion, conclusion: 'form_excessive_fields_before_conversion', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: subCauseReasoning })];
}

function inferFormSubmissionRetryFriction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('form_submission_retry_friction');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'form_submission_retry_friction', category: InferenceCategory.FormSubmissionRetryFriction, conclusion: 'form_submission_retry_friction', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users retry form submission multiple times without achieving progression. Repeated submissions indicate the form provides poor validation feedback, fails silently, or presents unclear error states — users believe the action should succeed but receive no confirmation of progress or clear explanation of failure. The root cause is inadequate submission feedback or broken validation.` })];
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

  return [createInference({ inference_key: 'surface_oscillation_before_dropoff', category: InferenceCategory.SurfaceOscillationBeforeDropoff, conclusion: 'surface_oscillation_before_dropoff', conclusion_value: `${severity}:${labelA}:${labelB}`, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users oscillate back and forth between ${labelA} and ${labelB} before dropping off — neither surface resolves the user's decisive question. This pattern indicates unresolved decision friction: the user has a question that one surface raises but the other fails to answer, creating a navigational loop that ends in abandonment.` })];
}

function inferConversionFinalStepRetry(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('conversion_final_step_retry');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'conversion_final_step_retry', category: InferenceCategory.ConversionFinalStepRetry, conclusion: 'conversion_final_step_retry', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Conversion attempts in the final steps require multiple retries before completion or abandonment. Users who reach the final commitment moment are blocked by friction — failed submissions, unclear error states, or unresponsive interfaces at the purchase moment. Each retry erodes buyer confidence, and the accumulation of failed attempts directly causes abandonment at the highest-value step in the funnel.` })];
}

function inferCtaLateAvailabilityDelaysAction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('cta_late_availability_delays_action');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'cta_late_availability_delays_action', category: InferenceCategory.CtaLateAvailabilityDelaysAction, conclusion: 'cta_late_availability_delays_action', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Primary CTAs render late on high-intent surfaces — users arrive with purchase intent but the action is not yet available. Late CTA availability creates a gap between user readiness and UI readiness. Users must wait for the page to fully render before they can act, widening the window for distraction, hesitation, or abandonment. The root cause is render-order or dependency-loading that deprioritizes the primary commercial action.` })];
}

function inferCheckoutAbandonNoFeedback(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const sig = byKey.get('checkout_abandon_no_feedback');
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'checkout_abandon_no_feedback', category: InferenceCategory.CheckoutAbandonNoFeedback, conclusion: 'checkout_abandon_no_feedback', conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users initiate checkout then abandon without any visible progress or confirmation. The checkout UI provides no immediate feedback — no loading state, no progress indicator, no next-step preview — after the commitment action. This feedback vacuum creates uncertainty: users do not know if their action was received, if the system is working, or what comes next. The root cause is absent immediate feedback and progress indication at the checkout entry point.` })];
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

  return [createInference({ inference_key: 'sensitive_input_perceived_risk_dropoff', category: InferenceCategory.SensitiveInputPerceivedRiskDropoff, conclusion: 'sensitive_input_perceived_risk_dropoff', conclusion_value: `${severity}:${fieldKind}`, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning: `Users drop off immediately after interacting with ${fieldLabel} fields. ${riskContext}` })];
}

// ──────────────────────────────────────────────
// Behavioral Cohort Inferences (Pixel-Dependent Workspaces)
// ──────────────────────────────────────────────

function inferCohort(sig: Signal | undefined, key: string, cat: InferenceCategory, reasoning: string, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  if (!sig) return [];
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: key, category: cat, conclusion: key, conclusion_value: severity, severity_hint: severity, confidence: sig.confidence, scoping, cycle_ref, ids, signal_refs: [makeRef('signal', sig.id)], evidence_refs: sig.evidence_refs, reasoning })];
}

// First Impression Revenue
function inferFirstSessionMilestoneStall(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('first_session_milestone_stall'), 'first_session_milestone_stall', InferenceCategory.FirstSessionMilestoneStall, 'First-time visitors stall at early funnel stages at a significantly higher rate than returning visitors. New users are not finding enough reason to express purchase intent during their first visit. The root cause is typically insufficient value proposition, unclear navigation to commercial surfaces, or landing pages that fail to orient newcomers toward the conversion path.', scoping, cycle_ref, ids);
}

function inferFirstSessionTrustBarrier(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('first_session_trust_barrier'), 'first_session_trust_barrier', InferenceCategory.FirstSessionTrustBarrier, 'First-time visitors exhibit significantly more hesitation behavior than returning visitors. New users lack the brand familiarity that returning visitors have already built through prior sessions. Trust signals (reviews, guarantees, security badges, brand recognition) are not compensating for the trust deficit that new visitors inherently carry.', scoping, cycle_ref, ids);
}

function inferFirstSessionCtaTimingGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('first_session_cta_timing_gap'), 'first_session_cta_timing_gap', InferenceCategory.FirstSessionCtaTimingGap, 'First-time visitors take significantly longer to reach their first commercial action compared to returning visitors. The commercial entry point is optimized for users who already know the site, not for newcomers. CTAs, pricing links, or product browsing paths are not immediately discoverable for first-time visitors.', scoping, cycle_ref, ids);
}

// Action Value Map
function inferLowValueActionDominates(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('low_value_action_dominates'), 'low_value_action_dominates', InferenceCategory.LowValueActionDominates, 'The most visible user actions (CTAs, interactive elements) have very low engagement rates and poor correlation with conversion. Users see these actions but do not interact — the actions are occupying attention without driving revenue. The root cause is typically misplaced CTAs, weak copy, or actions that do not match user intent at that stage of the journey.', scoping, cycle_ref, ids);
}

function inferHighValueActionUnderexposed(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('high_value_action_underexposed'), 'high_value_action_underexposed', InferenceCategory.HighValueActionUnderexposed, 'Conversions are happening but CTA engagement across all cohorts is very low, suggesting the conversion path exists but is not easy to find. Revenue-positive actions are underexposed — users who do convert find their way despite the UX, not because of it. Increasing visibility of the proven conversion path would amplify revenue.', scoping, cycle_ref, ids);
}

function inferDeadWeightSurfaceTraffic(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('dead_weight_surface_traffic'), 'dead_weight_surface_traffic', InferenceCategory.DeadWeightSurfaceTraffic, 'The vast majority of sessions that reach the site never progress beyond awareness toward conversion. Surfaces are receiving traffic but not converting it into commercial progression. This represents dead-weight traffic — pageviews that consume server resources and ad spend without contributing to revenue.', scoping, cycle_ref, ids);
}

// Acquisition Integrity
function inferPaidTrafficFrictionElevated(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('paid_traffic_friction_elevated'), 'paid_traffic_friction_elevated', InferenceCategory.PaidTrafficFrictionElevated, 'Paid traffic encounters significantly more behavioral friction than organic traffic. Visitors arriving from ads face more backtracks, hesitation, and obstacles. The landing experience for paid visitors is not aligned with the ad promise — the gap between expectation and experience creates friction that burns ad spend.', scoping, cycle_ref, ids);
}

function inferPaidTrafficTrustGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('paid_traffic_trust_gap'), 'paid_traffic_trust_gap', InferenceCategory.PaidTrafficTrustGap, 'Paid visitors show significantly more trust-seeking behavior (policy views, hesitation pauses) than organic visitors. Users arriving from ads lack the brand familiarity that organic visitors build through repeated exposure. The site does not compensate for this trust deficit with upfront reassurance on landing pages.', scoping, cycle_ref, ids);
}

function inferPaidMobileCompoundingWaste(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('paid_mobile_compounding_waste'), 'paid_mobile_compounding_waste', InferenceCategory.PaidMobileCompoundingWaste, 'Both paid traffic and mobile traffic independently convert at significantly lower rates than the overall average. When a visitor is both paid AND mobile, the friction compounds — the visitor faces both the trust gap of being a new paid visitor and the UX friction of the mobile experience. This is the highest-waste segment of your traffic.', scoping, cycle_ref, ids);
}

// Mobile Revenue Exposure
function inferMobileConversionGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('mobile_conversion_gap'), 'mobile_conversion_gap', InferenceCategory.MobileConversionGap, 'Mobile sessions convert at a significantly lower rate than desktop sessions. Given that mobile typically represents the majority of traffic, this gap translates directly into trapped revenue — visitors who would convert on desktop but cannot on mobile. The root causes are typically form friction, CTA timing, layout issues, or payment flow degradation on smaller screens.', scoping, cycle_ref, ids);
}

function inferMobileFormFrictionElevated(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('mobile_form_friction_elevated'), 'mobile_form_friction_elevated', InferenceCategory.MobileFormFrictionElevated, 'Mobile users retry form submissions at a significantly higher rate than desktop users. Forms that work on desktop are creating friction on mobile — fields may be too small, autocomplete may not work, validation errors may be unclear, or the keyboard may obscure the input. Each retry is a moment where mobile users consider abandoning.', scoping, cycle_ref, ids);
}

function inferMobileCtaTimingDegraded(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('mobile_cta_timing_degraded'), 'mobile_cta_timing_degraded', InferenceCategory.MobileCtaTimingDegraded, 'Primary CTAs render significantly later on mobile than on desktop. On mobile, where attention spans are shorter and scroll depth is shallower, a late-rendering CTA may never be seen or may appear after the user has already decided to leave. The render-order prioritization needs to favor mobile CTA availability.', scoping, cycle_ref, ids);
}

// Friction Tax
function inferFunnelStepFrictionCost(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('funnel_step_friction_cost'), 'funnel_step_friction_cost', InferenceCategory.FunnelStepFrictionCost, 'The conversion funnel carries a measurable friction tax — the combined cost of hesitation pauses, form retries, and surface oscillation across funnel steps. Each type of friction represents a moment where users want to proceed but encounter obstacles. This is not abandonment from lack of interest — it is abandonment from UX friction at the decision moments.', scoping, cycle_ref, ids);
}

function inferOscillationDecisionCost(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('oscillation_decision_cost'), 'oscillation_decision_cost', InferenceCategory.OscillationDecisionCost, 'A significant portion of sessions exhibit back-and-forth navigation between surfaces — typically between pricing and product pages, or between cart and product details. This oscillation pattern indicates unresolved decision uncertainty: one surface raises a question that the other cannot fully answer. Each oscillation loop increases the probability of abandonment.', scoping, cycle_ref, ids);
}

function inferCheckoutEntryFriction(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('checkout_entry_friction'), 'checkout_entry_friction', InferenceCategory.CheckoutEntryFriction, 'A large share of sessions that express purchase intent never reach the checkout step. The gap between intent-expressed and checkout-reached represents the conversion gate friction — users want to buy but something between intent and checkout blocks them. The barrier is often unclear next steps, hidden checkout buttons, forced account creation, or unexpected cart requirements.', scoping, cycle_ref, ids);
}

// Trust Revenue Gap
function inferTrustDeficitConversionDrag(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('trust_deficit_conversion_drag'), 'trust_deficit_conversion_drag', InferenceCategory.TrustDeficitConversionDrag, 'Sessions with trust-deficit behaviors (policy views, hesitation pauses, sensitive input abandonment) have drastically lower conversion rates. The revenue gap between trust-confident sessions and trust-deficit sessions represents recoverable revenue — if trust barriers were addressed, a portion of these sessions would convert. The root cause is insufficient trust reinforcement throughout the commercial journey.', scoping, cycle_ref, ids);
}

function inferReassuranceSeekingElevated(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('reassurance_seeking_elevated'), 'reassurance_seeking_elevated', InferenceCategory.ReassuranceSeekingElevated, 'A high percentage of sessions actively seek reassurance — opening policy pages, contacting support, or searching for trust signals — before making purchase decisions. This behavior indicates that trust is not embedded in the commercial flow; users must leave the conversion path to find reassurance, and many do not return. Proactively placing trust signals (guarantees, badges, testimonials) on commercial surfaces would reduce the need for this detour.', scoping, cycle_ref, ids);
}

function inferSensitiveInputTrustGap(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('sensitive_input_trust_gap'), 'sensitive_input_trust_gap', InferenceCategory.SensitiveInputTrustGap, 'Sessions are abandoning at sensitive form fields at an elevated rate. Users reach the point of entering personal or payment data and decide the risk is not worth the value. The surrounding context (security indicators, trust badges, privacy reassurance) is not sufficient for the sensitivity of the data being requested.', scoping, cycle_ref, ids);
}

// Path to Purchase Efficiency
function inferPathLengthExceedsEfficient(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('path_length_exceeds_efficient'), 'path_length_exceeds_efficient', InferenceCategory.PathLengthExceedsEfficient, 'The average session visits too many surfaces relative to the conversion rate. Visitors are wandering rather than progressing toward purchase. Every additional page between awareness and conversion is an opportunity for the user to lose interest, get distracted, or decide to leave. The site structure does not guide users toward conversion efficiently.', scoping, cycle_ref, ids);
}

function inferIntentAbsorberDetected(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('intent_absorber_detected'), 'intent_absorber_detected', InferenceCategory.IntentAbsorberDetected, 'High backtrack rates combined with surface oscillation indicate that specific surfaces in the path are absorbing purchase intent rather than advancing it. Users visit these surfaces and lose momentum — their intent to buy gets diluted by information overload, confusing options, or missing calls-to-action. These are "intent absorbers" that break the natural flow from consideration to purchase.', scoping, cycle_ref, ids);
}

function inferIntentDecayTimeExcessive(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  return inferCohort(byKey.get('intent_decay_time_excessive'), 'intent_decay_time_excessive', InferenceCategory.IntentDecayTimeExcessive, 'The average time from expressed intent to conversion start is excessively long. Purchase intent decays over time — the longer a user takes between deciding to buy and completing the purchase, the less likely they are to follow through. The path from pricing/cart to checkout needs to be shortened and streamlined to preserve intent momentum.', scoping, cycle_ref, ids);
}

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
  })];
}

function createInference(params: {
  inference_key: string;
  category: InferenceCategory;
  conclusion: string;
  conclusion_value: string;
  severity_hint?: string;
  confidence: number;
  scoping: Scoping;
  cycle_ref: string;
  ids: IdGenerator;
  signal_refs: string[];
  evidence_refs: string[];
  reasoning: string;
}): Inference {
  const now = new Date();
  return {
    id: params.ids.next(),
    inference_key: params.inference_key,
    category: params.category,
    scoping: params.scoping,
    cycle_ref: params.cycle_ref,
    freshness: {
      observed_at: now,
      fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    conclusion: params.conclusion,
    conclusion_value: params.conclusion_value,
    severity_hint: params.severity_hint || null,
    confidence: params.confidence,
    signal_refs: params.signal_refs,
    evidence_refs: params.evidence_refs,
    reasoning: params.reasoning,
    description: null,
    created_at: now,
    updated_at: now,
  };
}

// ──────────────────────────────────────────────
// Wave 3.1 Tier 2: LLM Enrichment Inferences
// Dormant until enrichment signals are produced.
// ──────────────────────────────────────────────

function inferSocialProofGeneric(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('social_proof_quality_low_'));
  if (matches.length === 0) return [];
  const sig = matches.reduce((best, [, s]) => (!best || (s.numeric_value ?? 0) > (best.numeric_value ?? 0) ? s : best), undefined as Signal | undefined)!;
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'social_proof_generic', category: InferenceCategory.SocialProofGeneric, conclusion: 'social_proof_generic', conclusion_value: severity, severity_hint: severity, confidence: Math.min(80, sig.confidence + 5), scoping, cycle_ref, ids, signal_refs: matches.map(([, s]) => makeRef('signal', s.id)), evidence_refs: matches.flatMap(([, s]) => s.evidence_refs), reasoning: `Testimonials are generic and unattributed. Reviews like "Great product!" without a name, company, or measurable outcome reduce trust instead of building it — buyers question if the reviews are real. ${matches.length} page(s) show social proof that lacks specificity.` })];
}

function inferFormErrorMessagesUnhelpful(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('form_error_messages_poor_'));
  if (matches.length === 0) return [];
  const sig = matches.reduce((best, [, s]) => (!best || (s.numeric_value ?? 0) > (best.numeric_value ?? 0) ? s : best), undefined as Signal | undefined)!;
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'form_error_messages_unhelpful', category: InferenceCategory.FormErrorMessagesUnhelpful, conclusion: 'form_error_messages_unhelpful', conclusion_value: severity, severity_hint: severity, confidence: Math.min(80, sig.confidence + 5), scoping, cycle_ref, ids, signal_refs: matches.map(([, s]) => makeRef('signal', s.id)), evidence_refs: matches.flatMap(([, s]) => s.evidence_refs), reasoning: `Form error messages are technical instead of helpful. When a buyer enters an invalid email and sees "Invalid input" instead of "Please enter a valid email (e.g. name@example.com)", they don't know what to fix and abandon the form. ${matches.length} form(s) use generic or technical error messages.` })];
}

function inferOnboardingNoQuickWin(byKey: Map<string, Signal>, scoping: Scoping, cycle_ref: string, ids: IdGenerator): Inference[] {
  const matches = [...byKey.entries()].filter(([k]) => k.startsWith('onboarding_quick_win_absent_'));
  if (matches.length === 0) return [];
  const sig = matches.reduce((best, [, s]) => (!best || (s.numeric_value ?? 0) > (best.numeric_value ?? 0) ? s : best), undefined as Signal | undefined)!;
  const severity = sig.value === 'high' ? 'high' : sig.value === 'medium' ? 'medium' : 'low';
  return [createInference({ inference_key: 'onboarding_no_quick_win', category: InferenceCategory.OnboardingNoQuickWin, conclusion: 'onboarding_no_quick_win', conclusion_value: severity, severity_hint: severity, confidence: Math.min(80, sig.confidence + 5), scoping, cycle_ref, ids, signal_refs: matches.map(([, s]) => makeRef('signal', s.id)), evidence_refs: matches.flatMap(([, s]) => s.evidence_refs), reasoning: `New users don't experience product value in the first session. Without a quick win in the first minutes — a visible result, a completed setup, a personalized recommendation — trial users conclude the product isn't for them and never return. ${matches.length} onboarding surface(s) lack immediate value delivery.` })];
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
  })];
}
