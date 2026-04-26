import {
  Evidence,
  EvidenceType,
  Signal,
  SignalCategory,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
  Freshness,
  PageContentPayload,
  RedirectPayload,
  CheckoutIndicatorPayload,
  ProviderIndicatorPayload,
  PlatformIndicatorPayload,
  PolicyPagePayload,
  FormPayload,
  HttpResponsePayload,
  ScriptPayload,
  IframePayload,
  TechnologyDetectedPayload,
  StructuredDataItemPayload,
  MobileVerificationResultPayload,
  ClassifiedRuntimeErrorsPayload,
  NucleiMatchPayload,
  KatanaDiscoveryPayload,
  NetworkAnalysisPayload,
  MetaPayload,
  LinkPayload,
  BrandImpersonationMatchPayload,
  BehavioralSessionPayload,
  SurfaceVitalityPayload,
  ContentEnrichmentPayload,
} from '../domain';
import type { BehavioralCohortPayload } from '../behavioral';
import type { CommerceContext } from '../integrations/commerce-context';
import { BuiltGraph, GraphQuery } from '../graph';
import {
  extractCommerceHeuristicSignals,
  type CommerceHeuristicSignals,
} from './commerce-heuristic';

// ──────────────────────────────────────────────
// Signal Engine — extracts signals from evidence + graph
// Deterministic: scoped ID generator
// ──────────────────────────────────────────────

export function extractSignals(
  evidence: Evidence[],
  graph: BuiltGraph,
  scoping: Scoping,
  cycle_ref: string,
  commerce_context?: CommerceContext | null,
): Signal[] {
  const signals: Signal[] = [];
  const query = new GraphQuery(graph);
  const ids = new IdGenerator('sig');

  // Group evidence by type for efficient processing
  const byType = new Map<EvidenceType, Evidence[]>();
  for (const e of evidence) {
    const list = byType.get(e.evidence_type) || [];
    list.push(e);
    byType.set(e.evidence_type, list);
  }

  // Checkout signals
  extractCheckoutSignals(byType, scoping, cycle_ref, signals, ids);

  // Policy signals
  extractPolicySignals(byType, scoping, cycle_ref, signals, ids);

  // Trust signals
  extractTrustSignals(query, scoping, cycle_ref, signals, evidence, ids);

  // Measurement signals
  extractMeasurementSignals(byType, scoping, cycle_ref, signals, ids);

  // Platform signals
  extractPlatformSignals(byType, scoping, cycle_ref, signals, ids);

  // Operational signals
  extractOperationalSignals(byType, scoping, cycle_ref, signals, ids);

  // Revenue signals — commercial flow analysis
  extractRevenueFlowSignals(byType, query, scoping, cycle_ref, signals, evidence, ids);

  // Friction signals — conversion path obstacles
  extractFrictionSignals(byType, query, scoping, cycle_ref, signals, evidence, ids);

  // Clarity signals — CTA and conversion intent
  extractClaritySignals(byType, scoping, cycle_ref, signals, ids);

  // Support signals — contact and support channel detection
  extractSupportSignals(byType, scoping, cycle_ref, signals, ids);

  // Expectation signals — pricing clarity and post-purchase guidance
  extractExpectationSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30: Data boundary signals — forms sending data to unrecognized external domains
  extractDataBoundarySignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30: Provider fragmentation signals — multiple competing payment providers
  extractProviderFragmentationSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30B: Redirect trust erosion on checkout path
  extractRedirectTrustSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30B: Language discontinuity across commercial journey
  extractLanguageDiscontinuitySignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30B: Orphan commercial pages (no inbound links from graph)
  extractOrphanCommercialSignals(query, byType, scoping, cycle_ref, signals, ids);

  // Phase 30B: Untrusted external embeds on commercial pages
  extractUntrustedEmbedSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30B: Platform-specific checkout risk patterns
  extractPlatformCheckoutRiskSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 30B: Post-purchase confirmation gap
  extractPostPurchaseGapSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 2: Signals from deepened collection
  extractPolicyDepthSignals(byType, scoping, cycle_ref, signals, ids);
  extractSupportWidgetSignals(byType, scoping, cycle_ref, signals, ids);
  extractTrustSignalDepthSignals(byType, scoping, cycle_ref, signals, ids);
  extractTrackingStackSignals(byType, scoping, cycle_ref, signals, ids);
  extractConsentMeasurementSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 2B: Mobile & runtime signals
  extractMobileVerificationSignals(byType, scoping, cycle_ref, signals, ids);
  extractRuntimeErrorSignals(byType, scoping, cycle_ref, signals, ids);
  extractSecondaryFlowSignals(query, byType, scoping, cycle_ref, signals, ids);

  // Phase 2C: Composite signals from current evidence
  extractSupportJourneyPositionSignals(byType, scoping, cycle_ref, signals, ids);
  extractHiddenReassuranceRouteSignals(query, byType, scoping, cycle_ref, signals, ids);
  extractAlternateFlowMeasurementSignals(query, byType, scoping, cycle_ref, signals, ids);
  extractRuntimeReassuranceBreakSignals(byType, scoping, cycle_ref, signals, ids);
  extractProviderPathWeaknessSignals(byType, scoping, cycle_ref, signals, ids);
  extractAlternateFlowTrustMeasurementSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 3A: Channel integrity signals from Nuclei evidence
  extractChannelIntegritySignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 3B: Deep discovery signals from Katana evidence
  extractDeepDiscoverySignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 2D: Network analysis signals from browser verification
  extractNetworkAnalysisSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 3E: Discoverability signals from existing evidence
  extractDiscoverabilitySignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 3E: Brand integrity signals from impersonation evidence
  extractBrandIntegritySignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 4B: Behavioral intelligence signals from snippet evidence
  extractBehavioralSignals(byType, scoping, cycle_ref, signals, ids);

  // Behavioral cohort signals (pixel-dependent workspaces)
  extractBehavioralCohortSignals(byType, scoping, cycle_ref, signals, ids);

  // Wave 3.1: LLM enrichment signals from policy quality assessment
  extractPolicyEnrichmentSignals(byType, scoping, cycle_ref, signals, ids);

  // Wave 3.3: Security posture signals from existing evidence
  extractSecurityPostureSignals(byType, scoping, cycle_ref, signals, ids);

  // Wave 3.1 Tier 2: LLM enrichment signals from copy/form/onboarding quality
  extractCopyEnrichmentSignals(byType, scoping, cycle_ref, signals, ids);

  // Phase 4A: Commerce context signals from Shopify integration data
  if (commerce_context) {
    extractCommerceContextSignals(commerce_context, scoping, cycle_ref, signals, ids);
    // Phase 4A+: Ad platform context signals (data-driven when ad platform
    // snapshots are reconciled into commerce_context; no heuristic fallback
    // available — ad spend is unobservable from crawl evidence).
    extractAdsContextSignals(commerce_context, scoping, cycle_ref, signals, ids);
  }

  // Phase 4A++: Ads creative × crawl evidence compound signals.
  // Traverses ad_targets edges in the graph to correlate each creative's
  // destination URL with on-page evidence. Only fires when the graph has
  // ad nodes (i.e. ads integration is connected).
  extractAdsCreativeContextSignals(graph, evidence, scoping, cycle_ref, signals, ids);

  // Phase 2.4: Commerce heuristics — fallback path when integration absent.
  // Emits the same signal_keys as the data-driven path with lower confidence,
  // so inference consumers light up for non-integrated stores. Suppressed
  // when commerce_context is present to avoid duplicate signals.
  const heuristics = extractCommerceHeuristicSignals(evidence, {
    has_commerce_integration: commerce_context != null,
  });
  if (!heuristics.suppressed_by_integration) {
    emitCommerceHeuristicSignals(heuristics, scoping, cycle_ref, signals, ids);
  }

  return signals;
}

function extractCheckoutSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  const providerIndicators = byType.get(EvidenceType.ProviderIndicator) || [];

  if (checkoutIndicators.length === 0) {
    // No checkout detected
    signals.push(createSignal({ ids,
      signal_key: 'checkout_detected',
      category: SignalCategory.Checkout,
      attribute: 'checkout.detected',
      value: 'false',
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: [],
      description: 'No checkout indicators detected on the site',
    }));
    return;
  }

  // Checkout mode detection
  const externalCheckouts = checkoutIndicators.filter(
    (e) => (e.payload as CheckoutIndicatorPayload).is_external,
  );
  const embeddedCheckouts = checkoutIndicators.filter(
    (e) => (e.payload as CheckoutIndicatorPayload).checkout_mode === 'embedded',
  );

  if (externalCheckouts.length > 0) {
    const hosts = new Set(
      externalCheckouts.map((e) => (e.payload as CheckoutIndicatorPayload).target_host).filter(Boolean),
    );
    signals.push(createSignal({ ids,
      signal_key: 'checkout_mode',
      category: SignalCategory.Checkout,
      attribute: 'checkout.mode',
      value: 'redirect',
      confidence: 70,
      scoping, cycle_ref,
      evidence_refs: externalCheckouts.map((e) => makeRef('evidence', e.id)),
      description: `Checkout redirects to external host(s): ${Array.from(hosts).join(', ')}`,
    }));

    signals.push(createSignal({ ids,
      signal_key: 'checkout_off_domain',
      category: SignalCategory.Checkout,
      attribute: 'checkout.off_domain',
      value: 'true',
      confidence: 75,
      scoping, cycle_ref,
      evidence_refs: externalCheckouts.map((e) => makeRef('evidence', e.id)),
      description: 'Checkout flow leaves the primary domain',
    }));
  } else if (embeddedCheckouts.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'checkout_mode',
      category: SignalCategory.Checkout,
      attribute: 'checkout.mode',
      value: 'embedded',
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: embeddedCheckouts.map((e) => makeRef('evidence', e.id)),
      description: 'Checkout appears to be embedded on the page',
    }));
  }

  // Provider detection
  if (providerIndicators.length > 0) {
    const providers = new Map<string, { confidence: number; refs: string[] }>();
    for (const e of providerIndicators) {
      const p = e.payload as ProviderIndicatorPayload;
      const existing = providers.get(p.provider_name);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, p.confidence);
        existing.refs.push(makeRef('evidence', e.id));
      } else {
        providers.set(p.provider_name, {
          confidence: p.confidence,
          refs: [makeRef('evidence', e.id)],
        });
      }
    }

    for (const [name, data] of providers) {
      signals.push(createSignal({ ids,
        signal_key: `provider_${name}`,
        category: SignalCategory.Checkout,
        attribute: 'provider.guess',
        value: name,
        confidence: data.confidence,
        scoping, cycle_ref,
        evidence_refs: data.refs,
        description: `Payment provider detected: ${name}`,
      }));
    }
  }
}

function extractPolicySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  const policyTypes = new Set(
    policyPages.map((e) => (e.payload as PolicyPagePayload).policy_type),
  );

  const requiredPolicies = ['privacy', 'terms', 'refund'];
  for (const policy of requiredPolicies) {
    const present = policyTypes.has(policy as any);
    const refs = policyPages
      .filter((e) => (e.payload as PolicyPagePayload).policy_type === policy)
      .map((e) => makeRef('evidence', e.id));

    signals.push(createSignal({ ids,
      signal_key: `policy_${policy}_present`,
      category: SignalCategory.Policy,
      attribute: `policy.${policy}.present`,
      value: present ? 'true' : 'false',
      confidence: present ? 65 : 50,
      scoping, cycle_ref,
      evidence_refs: refs,
      description: present
        ? `${policy} policy page detected`
        : `No ${policy} policy page found`,
    }));
  }

  // Overall policy coverage
  const coverageCount = requiredPolicies.filter((p) => policyTypes.has(p as any)).length;
  const coverageRatio = coverageCount / requiredPolicies.length;
  const coverageLevel = coverageRatio >= 1 ? 'full' : coverageRatio >= 0.5 ? 'partial' : 'weak';

  signals.push(createSignal({ ids,
    signal_key: 'policy_coverage',
    category: SignalCategory.Policy,
    attribute: 'policy.coverage',
    value: coverageLevel,
    numeric_value: Math.round(coverageRatio * 100),
    confidence: 60,
    scoping, cycle_ref,
    evidence_refs: policyPages.map((e) => makeRef('evidence', e.id)),
    description: `Policy coverage: ${coverageCount}/${requiredPolicies.length} required policies found`,
  }));
}

function extractTrustSignals(
  query: GraphQuery,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  evidence: Evidence[],
  ids: IdGenerator,
): void {
  const boundaries = query.findTrustBoundaries();

  if (boundaries.trust_gaps.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'trust_boundary_crossed',
      category: SignalCategory.Trust,
      attribute: 'trust.boundary_crossed',
      value: 'true',
      numeric_value: boundaries.trust_gaps.length,
      confidence: 70,
      scoping, cycle_ref,
      evidence_refs: boundaries.boundary_edges
        .filter((e) => e.evidence_ref)
        .map((e) => e.evidence_ref!),
      description: `${boundaries.trust_gaps.length} trust boundary crossing(s) detected to: ${boundaries.external_hosts.join(', ')}`,
    }));

    const highSeverityGaps = boundaries.trust_gaps.filter((g) => g.severity === 'high');
    if (highSeverityGaps.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: 'weak_trust_surface',
        category: SignalCategory.Trust,
        attribute: 'trust.surface_weakness',
        value: 'high',
        numeric_value: highSeverityGaps.length,
        confidence: 65,
        scoping, cycle_ref,
        evidence_refs: [],
        description: `${highSeverityGaps.length} high-severity trust gap(s) — unknown providers or unverified handoffs`,
      }));
    }
  }

  // Redirect chains
  const redirectEdges = query.findRedirectChains();
  if (redirectEdges.length > 0) {
    const redirectEvidence = evidence.filter(
      (e) => e.evidence_type === EvidenceType.Redirect,
    );
    const maxHops = Math.max(
      ...redirectEvidence.map((e) => (e.payload as any).hop_count || 0),
    );

    if (maxHops > 2) {
      signals.push(createSignal({ ids,
        signal_key: 'external_redirect_chain',
        category: SignalCategory.Trust,
        attribute: 'trust.redirect_chain_length',
        value: maxHops > 3 ? 'high' : 'medium',
        numeric_value: maxHops,
        confidence: 80,
        scoping, cycle_ref,
        evidence_refs: redirectEvidence.map((e) => makeRef('evidence', e.id)),
        description: `Redirect chain with ${maxHops} hop(s) detected`,
      }));
    }
  }
}

function extractMeasurementSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const scripts = byType.get(EvidenceType.Script) || [];
  const analyticsPatterns = [
    { name: 'google_analytics', regex: /google-analytics|googletagmanager|gtag/i },
    { name: 'facebook_pixel', regex: /connect\.facebook|fbevents/i },
    { name: 'hotjar', regex: /hotjar/i },
    { name: 'segment', regex: /segment\.com|cdn\.segment/i },
  ];

  const detectedAnalytics: string[] = [];
  for (const pattern of analyticsPatterns) {
    const found = scripts.some((e) =>
      pattern.regex.test((e.payload as any).src || ''),
    );
    if (found) detectedAnalytics.push(pattern.name);
  }

  const coverage = detectedAnalytics.length >= 2 ? 'adequate' :
    detectedAnalytics.length === 1 ? 'shallow' : 'none';

  signals.push(createSignal({ ids,
    signal_key: 'measurement_coverage',
    category: SignalCategory.Measurement,
    attribute: 'measurement.coverage',
    value: coverage,
    numeric_value: detectedAnalytics.length,
    confidence: 55,
    scoping, cycle_ref,
    evidence_refs: scripts.map((e) => makeRef('evidence', e.id)),
    description: `Measurement coverage: ${coverage} (${detectedAnalytics.length} analytics tool(s): ${detectedAnalytics.join(', ') || 'none'})`,
  }));
}

function extractPlatformSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const platforms = byType.get(EvidenceType.PlatformIndicator) || [];

  for (const e of platforms) {
    const p = e.payload as PlatformIndicatorPayload;
    signals.push(createSignal({ ids,
      signal_key: `platform_${p.platform_name}`,
      category: SignalCategory.Platform,
      attribute: 'platform.detected',
      value: p.platform_name,
      confidence: p.confidence,
      scoping, cycle_ref,
      evidence_refs: [makeRef('evidence', e.id)],
      description: `Platform detected: ${p.platform_name} (via ${p.detection_source})`,
    }));
  }
}

function extractOperationalSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const httpResponses = byType.get(EvidenceType.HttpResponse) || [];

  // Check for slow responses
  const slowPages = httpResponses.filter(
    (e) => (e.payload as HttpResponsePayload).response_time_ms > 3000,
  );
  if (slowPages.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'slow_response',
      category: SignalCategory.Operational,
      attribute: 'operational.slow_responses',
      value: 'true',
      numeric_value: slowPages.length,
      confidence: 80,
      scoping, cycle_ref,
      evidence_refs: slowPages.map((e) => makeRef('evidence', e.id)),
      description: `${slowPages.length} page(s) with response time > 3s`,
    }));
  }

  // Check for error responses
  const errorPages = httpResponses.filter(
    (e) => (e.payload as HttpResponsePayload).status_code >= 400,
  );
  if (errorPages.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'http_errors',
      category: SignalCategory.Operational,
      attribute: 'operational.http_errors',
      value: 'true',
      numeric_value: errorPages.length,
      confidence: 90,
      scoping, cycle_ref,
      evidence_refs: errorPages.map((e) => makeRef('evidence', e.id)),
      description: `${errorPages.length} page(s) returning HTTP errors`,
    }));
  }

  // Phase 30: Critical page errors — HTTP errors specifically on revenue-critical pages
  const criticalPagePattern = /checkout|cart|pay|payment|pricing|login|order|billing|purchase/i;
  const criticalErrors = httpResponses.filter((e) => {
    const p = e.payload as HttpResponsePayload;
    return p.status_code >= 400 && criticalPagePattern.test(p.url);
  });
  if (criticalErrors.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'critical_page_error',
      category: SignalCategory.Operational,
      attribute: 'operational.critical_page_error',
      value: 'true',
      numeric_value: criticalErrors.length,
      confidence: 90,
      scoping, cycle_ref,
      evidence_refs: criticalErrors.map((e) => makeRef('evidence', e.id)),
      description: `${criticalErrors.length} revenue-critical page(s) (checkout, cart, pricing, login) returning HTTP errors. Direct conversion path break.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Revenue Flow Signals
// ──────────────────────────────────────────────

function extractRevenueFlowSignals(
  byType: Map<EvidenceType, Evidence[]>,
  query: GraphQuery,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  evidence: Evidence[],
  ids: IdGenerator,
): void {
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  const forms = byType.get(EvidenceType.Form) || [];
  const redirects = byType.get(EvidenceType.Redirect) || [];
  const pages = byType.get(EvidenceType.PageContent) || [];

  // Funnel entry detection — do we see a clear conversion path start?
  const hasCheckout = checkoutIndicators.length > 0;
  const hasForms = forms.length > 0;
  const hasConversionPath = hasCheckout || hasForms;

  signals.push(createSignal({ ids,
    signal_key: 'funnel_entry_detected',
    category: SignalCategory.Revenue,
    attribute: 'revenue.funnel_entry',
    value: hasConversionPath ? 'true' : 'false',
    confidence: hasConversionPath ? 70 : 55,
    scoping, cycle_ref,
    evidence_refs: [
      ...checkoutIndicators.slice(0, 3).map(e => makeRef('evidence', e.id)),
      ...forms.slice(0, 3).map(e => makeRef('evidence', e.id)),
    ],
    description: hasConversionPath
      ? 'Conversion path entry detected via checkout indicators or forms.'
      : 'No clear conversion path entry found.',
  }));

  // Redirect before checkout — friction in commercial path
  const checkoutRedirects = redirects.filter(e => {
    const p = e.payload as RedirectPayload;
    const target = (p.target_url || '').toLowerCase();
    return /checkout|cart|pay|order|billing/.test(target);
  });

  if (checkoutRedirects.length > 0) {
    const maxHops = Math.max(...checkoutRedirects.map(e => (e.payload as RedirectPayload).hop_count));
    signals.push(createSignal({ ids,
      signal_key: 'redirect_before_checkout',
      category: SignalCategory.Revenue,
      attribute: 'revenue.redirect_before_checkout',
      value: maxHops > 2 ? 'high' : 'medium',
      numeric_value: maxHops,
      confidence: 75,
      scoping, cycle_ref,
      evidence_refs: checkoutRedirects.map(e => makeRef('evidence', e.id)),
      description: `${checkoutRedirects.length} redirect(s) before checkout (max ${maxHops} hops). Adds friction to the revenue path.`,
    }));
  }

  // Off-domain checkout — revenue leaves the domain
  const externalCheckouts = checkoutIndicators.filter(
    e => (e.payload as CheckoutIndicatorPayload).is_external,
  );
  if (externalCheckouts.length > 0) {
    const hosts = new Set(
      externalCheckouts.map(e => (e.payload as CheckoutIndicatorPayload).target_host).filter(Boolean),
    );
    signals.push(createSignal({ ids,
      signal_key: 'off_domain_checkout_revenue',
      category: SignalCategory.Revenue,
      attribute: 'revenue.off_domain_checkout',
      value: 'true',
      numeric_value: hosts.size,
      confidence: 75,
      scoping, cycle_ref,
      evidence_refs: externalCheckouts.map(e => makeRef('evidence', e.id)),
      description: `Checkout leaves domain to ${Array.from(hosts).join(', ')}. Revenue attribution and trust continuity at risk.`,
    }));
  }

  // Fragmented conversion path — checkout scattered across multiple external hosts
  const externalFormHosts = new Set(
    forms.filter(e => (e.payload as FormPayload).is_external)
      .map(e => (e.payload as FormPayload).target_host).filter(Boolean),
  );
  const allExternalHosts = new Set([
    ...Array.from(externalFormHosts),
    ...externalCheckouts.map(e => (e.payload as CheckoutIndicatorPayload).target_host).filter(Boolean),
  ]);

  if (allExternalHosts.size > 1) {
    signals.push(createSignal({ ids,
      signal_key: 'fragmented_conversion_path',
      category: SignalCategory.Revenue,
      attribute: 'revenue.fragmented_path',
      value: 'true',
      numeric_value: allExternalHosts.size,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: [
        ...externalCheckouts.slice(0, 3).map(e => makeRef('evidence', e.id)),
        ...forms.filter(e => (e.payload as FormPayload).is_external).slice(0, 3).map(e => makeRef('evidence', e.id)),
      ],
      description: `Conversion path fragments across ${allExternalHosts.size} external hosts: ${Array.from(allExternalHosts).join(', ')}.`,
    }));
  }

  // Missing tracking on key commercial steps
  const scripts = byType.get(EvidenceType.Script) || [];
  const analyticsPatterns = [
    /google-analytics|googletagmanager|gtag/i,
    /connect\.facebook|fbevents/i,
    /segment\.com|cdn\.segment/i,
  ];

  // Check if checkout/cart pages have analytics
  const commercialPageUrls = new Set<string>();
  for (const ci of checkoutIndicators) {
    commercialPageUrls.add((ci.payload as CheckoutIndicatorPayload).page_url);
  }
  for (const f of forms) {
    if ((f.payload as FormPayload).has_payment_fields) {
      commercialPageUrls.add((f.payload as FormPayload).page_url);
    }
  }

  if (commercialPageUrls.size > 0) {
    const scriptsOnCommercialPages = scripts.filter(e =>
      commercialPageUrls.has((e.payload as ScriptPayload).page_url),
    );
    const hasAnalyticsOnCommercial = scriptsOnCommercialPages.some(e =>
      analyticsPatterns.some(p => p.test((e.payload as ScriptPayload).src)),
    );

    if (!hasAnalyticsOnCommercial) {
      signals.push(createSignal({ ids,
        signal_key: 'missing_tracking_on_commercial',
        category: SignalCategory.Measurement,
        attribute: 'revenue.missing_tracking_commercial',
        value: 'true',
        confidence: 60,
        scoping, cycle_ref,
        evidence_refs: Array.from(commercialPageUrls).slice(0, 3).map(url =>
          makeRef('evidence', checkoutIndicators.find(e => (e.payload as CheckoutIndicatorPayload).page_url === url)?.id || ''),
        ).filter(r => !r.endsWith(':')),
        description: `No analytics tracking detected on ${commercialPageUrls.size} commercial page(s). Conversion measurement blind spot.`,
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Friction Signals
// ──────────────────────────────────────────────

function extractFrictionSignals(
  byType: Map<EvidenceType, Evidence[]>,
  query: GraphQuery,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  evidence: Evidence[],
  ids: IdGenerator,
): void {
  const httpResponses = byType.get(EvidenceType.HttpResponse) || [];
  const redirects = byType.get(EvidenceType.Redirect) || [];
  const forms = byType.get(EvidenceType.Form) || [];

  // Excessive redirects — more than 3 total redirect chains
  const totalRedirectHops = redirects.reduce(
    (sum, e) => sum + ((e.payload as RedirectPayload).hop_count || 0), 0,
  );
  if (totalRedirectHops > 3) {
    signals.push(createSignal({ ids,
      signal_key: 'excessive_redirects',
      category: SignalCategory.Friction,
      attribute: 'friction.excessive_redirects',
      value: totalRedirectHops > 6 ? 'high' : 'medium',
      numeric_value: totalRedirectHops,
      confidence: 80,
      scoping, cycle_ref,
      evidence_refs: redirects.map(e => makeRef('evidence', e.id)),
      description: `${totalRedirectHops} total redirect hops across the site. Each redirect adds latency and drop-off risk.`,
    }));
  }

  // Slow response on critical path — pages with response > 2s
  const slowCritical = httpResponses.filter(e => {
    const p = e.payload as HttpResponsePayload;
    return p.response_time_ms > 2000;
  });
  if (slowCritical.length > 0) {
    const avgTime = Math.round(
      slowCritical.reduce((s, e) => s + (e.payload as HttpResponsePayload).response_time_ms, 0) / slowCritical.length,
    );
    signals.push(createSignal({ ids,
      signal_key: 'slow_critical_path',
      category: SignalCategory.Friction,
      attribute: 'friction.slow_critical_path',
      value: avgTime > 4000 ? 'high' : 'medium',
      numeric_value: avgTime,
      confidence: 80,
      scoping, cycle_ref,
      evidence_refs: slowCritical.map(e => makeRef('evidence', e.id)),
      description: `${slowCritical.length} page(s) with response time > 2s (avg ${avgTime}ms). Slow pages on the critical path cause conversion drop-off.`,
    }));
  }

  // Broken form actions — forms posting to URLs that returned errors
  const errorUrls = new Set(
    httpResponses
      .filter(e => (e.payload as HttpResponsePayload).status_code >= 400)
      .map(e => (e.payload as HttpResponsePayload).url),
  );

  const brokenForms = forms.filter(e => {
    const action = (e.payload as FormPayload).action;
    return errorUrls.has(action);
  });
  if (brokenForms.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'broken_form_action',
      category: SignalCategory.Friction,
      attribute: 'friction.broken_form_action',
      value: 'true',
      numeric_value: brokenForms.length,
      confidence: 85,
      scoping, cycle_ref,
      evidence_refs: brokenForms.map(e => makeRef('evidence', e.id)),
      description: `${brokenForms.length} form(s) submit to URLs returning errors. Direct revenue impact if these are conversion forms.`,
    }));
  }

  // Domain switch without context — links to external domains without clear provider association
  const boundaries = query.findTrustBoundaries();
  const unknownExternalHandoffs = boundaries.trust_gaps.filter(g => g.gap_type === 'unknown_provider');
  if (unknownExternalHandoffs.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'domain_switch_without_context',
      category: SignalCategory.Friction,
      attribute: 'friction.domain_switch_no_context',
      value: 'true',
      numeric_value: unknownExternalHandoffs.length,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: unknownExternalHandoffs
        .filter(g => g.edge.evidence_ref)
        .map(g => g.edge.evidence_ref!),
      description: `${unknownExternalHandoffs.length} handoff(s) to unknown external domain(s). Users may lose trust and abandon.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Clarity Signals
// ──────────────────────────────────────────────

function extractClaritySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  const forms = byType.get(EvidenceType.Form) || [];

  // No primary conversion path — no checkout indicators found on any page
  if (checkoutIndicators.length === 0 && forms.filter(e => (e.payload as FormPayload).has_payment_fields).length === 0) {
    if (pages.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: 'no_primary_conversion_path',
        category: SignalCategory.Clarity,
        attribute: 'clarity.no_primary_conversion_path',
        value: 'true',
        confidence: 55,
        scoping, cycle_ref,
        evidence_refs: pages.slice(0, 3).map(e => makeRef('evidence', e.id)),
        description: 'No clear primary conversion path detected. Users may not find how to convert.',
      }));
    }
  }

  // Multiple competing CTAs — multiple forms on the same page
  const pageFormCounts = new Map<string, number>();
  for (const f of forms) {
    const url = (f.payload as FormPayload).page_url;
    pageFormCounts.set(url, (pageFormCounts.get(url) || 0) + 1);
  }
  const pagesWithMultipleForms = Array.from(pageFormCounts.entries())
    .filter(([_, count]) => count > 2);

  if (pagesWithMultipleForms.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'multiple_competing_ctas',
      category: SignalCategory.Clarity,
      attribute: 'clarity.competing_ctas',
      value: 'true',
      numeric_value: pagesWithMultipleForms.length,
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: forms.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${pagesWithMultipleForms.length} page(s) with 3+ forms. Multiple competing CTAs reduce conversion clarity.`,
    }));
  }

  // Missing policy near checkout — checkout pages without linked policy documents
  if (checkoutIndicators.length > 0) {
    const checkoutPageUrls = new Set(
      checkoutIndicators.map(e => (e.payload as CheckoutIndicatorPayload).page_url),
    );
    const policyPages = byType.get(EvidenceType.PolicyPage) || [];
    const policyLinkedFromCheckout = policyPages.some(e => {
      const policyPageUrl = (e.payload as PolicyPagePayload).url;
      // Check if any checkout page links to a policy page (simplified: same domain)
      return true; // Policy detection is at site level, not per-page
    });
    const hasPolicies = policyPages.length > 0;

    if (!hasPolicies) {
      signals.push(createSignal({ ids,
        signal_key: 'missing_policy_near_checkout',
        category: SignalCategory.Trust,
        attribute: 'trust.missing_policy_near_checkout',
        value: 'true',
        confidence: 65,
        scoping, cycle_ref,
        evidence_refs: checkoutIndicators.slice(0, 3).map(e => makeRef('evidence', e.id)),
        description: 'No policy pages found near checkout flow. Trust and legal compliance risk at the conversion point.',
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Support Signals — contact methods, support channels
// ──────────────────────────────────────────────

function extractSupportSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const links = byType.get(EvidenceType.Link) || [];
  const forms = byType.get(EvidenceType.Form) || [];

  // Look for contact/support indicators in page content and links
  const contactPatterns = /contact|contato|suporte|support|help|fale.?conosco|atendimento/i;
  const emailPattern = /mailto:|email|e-mail/i;
  const whatsappPattern = /whatsapp|wa\.me|api\.whatsapp/i;
  const phonePattern = /tel:|phone|telefone|0800/i;

  let hasContactPage = false;
  let hasEmail = false;
  let hasWhatsapp = false;
  let hasPhone = false;
  let hasContactForm = false;

  // Check page URLs and titles for contact/support pages
  for (const e of pages) {
    const p = e.payload as PageContentPayload;
    const url = p.url.toLowerCase();
    const title = (p.title || '').toLowerCase();
    if (contactPatterns.test(url) || contactPatterns.test(title)) {
      hasContactPage = true;
    }
  }

  // Check evidence subject refs for contact indicators
  const allEvidence = [...pages, ...forms];
  for (const e of allEvidence) {
    const payload = e.payload as any;
    const urlStr = (payload.url || payload.page_url || payload.action || '').toLowerCase();
    if (emailPattern.test(urlStr)) hasEmail = true;
    if (whatsappPattern.test(urlStr)) hasWhatsapp = true;
    if (phonePattern.test(urlStr)) hasPhone = true;
  }

  // Check forms for contact forms
  for (const e of forms) {
    const p = e.payload as FormPayload;
    const action = (p.action || '').toLowerCase();
    const fields = p.field_names.map(f => f.toLowerCase());
    if (contactPatterns.test(action) || fields.some(f => /message|mensagem|assunto|subject/.test(f))) {
      hasContactForm = true;
    }
  }

  const contactMethods: string[] = [];
  if (hasEmail) contactMethods.push('email');
  if (hasWhatsapp) contactMethods.push('whatsapp');
  if (hasPhone) contactMethods.push('phone');
  if (hasContactForm) contactMethods.push('form');

  const hasAnyContact = hasContactPage || contactMethods.length > 0;

  signals.push(createSignal({ ids,
    signal_key: 'contact_method_present',
    category: SignalCategory.Support,
    attribute: 'support.contact_method_present',
    value: hasAnyContact ? 'true' : 'false',
    numeric_value: contactMethods.length,
    confidence: hasAnyContact ? 65 : 55,
    scoping, cycle_ref,
    evidence_refs: pages.slice(0, 3).map(e => makeRef('evidence', e.id)),
    description: hasAnyContact
      ? `Contact methods found: ${contactMethods.join(', ') || 'contact page'}. ${contactMethods.length} channel(s).`
      : 'No contact method detected. Users have no way to reach support.',
  }));

  if (!hasAnyContact) {
    signals.push(createSignal({ ids,
      signal_key: 'no_contact_method',
      category: SignalCategory.Support,
      attribute: 'support.no_contact',
      value: 'true',
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: [],
      description: 'No email, phone, form, or chat contact method found. Customers cannot reach support, increasing dispute risk.',
    }));
  }

  // Support visibility — is contact info easy to find?
  if (hasAnyContact && !hasContactPage) {
    signals.push(createSignal({ ids,
      signal_key: 'support_visibility_low',
      category: SignalCategory.Support,
      attribute: 'support.visibility',
      value: 'low',
      confidence: 50,
      scoping, cycle_ref,
      evidence_refs: [],
      description: 'Contact methods exist but no dedicated contact/support page found. Users may not find support easily.',
    }));
  }
}

// ──────────────────────────────────────────────
// Expectation Signals — pricing clarity, post-purchase
// ──────────────────────────────────────────────

function extractExpectationSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];

  // Refund policy accessibility — is it specifically a refund/return policy, not just general terms?
  const refundPolicies = policyPages.filter(e => {
    const p = e.payload as PolicyPagePayload;
    return p.policy_type === 'refund' || p.policy_type === 'shipping';
  });

  const hasRefundPolicy = refundPolicies.some(e => (e.payload as PolicyPagePayload).policy_type === 'refund');
  const hasShippingPolicy = refundPolicies.some(e => (e.payload as PolicyPagePayload).policy_type === 'shipping');

  signals.push(createSignal({ ids,
    signal_key: 'refund_policy_accessible',
    category: SignalCategory.Policy,
    attribute: 'chargeback.refund_policy_accessible',
    value: hasRefundPolicy ? 'true' : 'false',
    confidence: hasRefundPolicy ? 65 : 55,
    scoping, cycle_ref,
    evidence_refs: refundPolicies.map(e => makeRef('evidence', e.id)),
    description: hasRefundPolicy
      ? 'Refund/return policy page detected and accessible.'
      : 'No dedicated refund/return policy found. Customers may dispute charges instead of requesting refunds.',
  }));

  if (hasShippingPolicy) {
    signals.push(createSignal({ ids,
      signal_key: 'shipping_policy_present',
      category: SignalCategory.Policy,
      attribute: 'chargeback.shipping_policy_present',
      value: 'true',
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: refundPolicies.filter(e => (e.payload as PolicyPagePayload).policy_type === 'shipping').map(e => makeRef('evidence', e.id)),
      description: 'Shipping policy detected. Helps set delivery expectations.',
    }));
  }

  // Pricing visibility — do pages with checkout have clear pricing context?
  const hasPricingPage = pages.some(e => {
    const p = e.payload as PageContentPayload;
    return /pricing|preco|plano|plans/i.test(p.url) || /pricing|preco/i.test(p.title || '');
  });

  if (checkoutIndicators.length > 0 && !hasPricingPage) {
    signals.push(createSignal({ ids,
      signal_key: 'pricing_not_visible',
      category: SignalCategory.Expectation,
      attribute: 'chargeback.pricing_not_visible',
      value: 'true',
      confidence: 50,
      scoping, cycle_ref,
      evidence_refs: checkoutIndicators.slice(0, 3).map(e => makeRef('evidence', e.id)),
      description: 'Checkout exists but no pricing page detected. Users may not understand charges, increasing dispute risk.',
    }));
  }

  // Post-purchase guidance — is there a thank-you or confirmation page?
  const hasThankYou = pages.some(e => {
    const p = e.payload as PageContentPayload;
    return /thank|obrigado|confirma|success|pedido.?realizado/i.test(p.url) ||
      /thank|obrigado|confirma|success/i.test(p.title || '');
  });

  if (checkoutIndicators.length > 0 && !hasThankYou) {
    signals.push(createSignal({ ids,
      signal_key: 'no_post_purchase_guidance',
      category: SignalCategory.Expectation,
      attribute: 'chargeback.no_post_purchase',
      value: 'true',
      confidence: 45,
      scoping, cycle_ref,
      evidence_refs: [],
      description: 'No post-purchase confirmation or thank-you page detected. Customers may be uncertain their order was placed, increasing support contacts and disputes.',
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30: Data Boundary Signals — forms sending data to unrecognized external domains
// ──────────────────────────────────────────────

function extractDataBoundarySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const forms = byType.get(EvidenceType.Form) || [];
  const providerIndicators = byType.get(EvidenceType.ProviderIndicator) || [];

  // Build set of known/trusted external hosts from provider indicators
  const knownProviderHosts = new Set<string>();
  for (const e of providerIndicators) {
    const p = e.payload as ProviderIndicatorPayload;
    if (p.provider_name) {
      // Extract domain from provider patterns (simplified — providers are already identified)
      knownProviderHosts.add(p.provider_name.toLowerCase());
    }
  }

  // Find forms that post to external domains NOT recognized as known providers
  const externalForms = forms.filter(e => {
    const p = e.payload as FormPayload;
    if (!p.is_external || !p.target_host) return false;
    // Check if the target host matches any known provider
    const host = p.target_host.toLowerCase();
    for (const known of knownProviderHosts) {
      if (host.includes(known)) return false;
    }
    return true;
  });

  if (externalForms.length > 0) {
    const targetHosts = new Set(
      externalForms.map(e => (e.payload as FormPayload).target_host).filter(Boolean),
    );
    const hasPaymentFields = externalForms.some(e => (e.payload as FormPayload).has_payment_fields);

    signals.push(createSignal({ ids,
      signal_key: 'external_form_data_exposure',
      category: SignalCategory.Trust,
      attribute: 'trust.external_form_data_exposure',
      value: hasPaymentFields ? 'high' : 'medium',
      numeric_value: externalForms.length,
      confidence: hasPaymentFields ? 80 : 65,
      scoping, cycle_ref,
      evidence_refs: externalForms.map(e => makeRef('evidence', e.id)),
      description: `${externalForms.length} form(s) send user data to unrecognized external domain(s): ${Array.from(targetHosts).join(', ')}.${hasPaymentFields ? ' Includes payment fields.' : ''}`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30: Provider Fragmentation Signals — multiple competing payment providers
// ──────────────────────────────────────────────

function extractProviderFragmentationSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const providerIndicators = byType.get(EvidenceType.ProviderIndicator) || [];
  if (providerIndicators.length === 0) return;

  const uniqueProviders = new Set<string>();
  for (const e of providerIndicators) {
    const p = e.payload as ProviderIndicatorPayload;
    uniqueProviders.add(p.provider_name.toLowerCase());
  }

  if (uniqueProviders.size >= 3) {
    signals.push(createSignal({ ids,
      signal_key: 'multiple_payment_providers',
      category: SignalCategory.Checkout,
      attribute: 'checkout.provider_count',
      value: uniqueProviders.size >= 4 ? 'high' : 'medium',
      numeric_value: uniqueProviders.size,
      confidence: 70,
      scoping, cycle_ref,
      evidence_refs: providerIndicators.map(e => makeRef('evidence', e.id)),
      description: `${uniqueProviders.size} distinct payment providers detected: ${Array.from(uniqueProviders).join(', ')}. Multiple competing providers create inconsistent checkout experience.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30B: Redirect Trust Erosion — redirect chains eroding trust on checkout path
// ──────────────────────────────────────────────

function extractRedirectTrustSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const redirects = byType.get(EvidenceType.Redirect) || [];
  if (redirects.length === 0) return;

  // Find redirects that cross domain boundaries on the path to checkout
  const commercialPattern = /checkout|cart|pay|payment|order|billing|purchase|comprar|pedido/i;
  const crossDomainCheckoutRedirects = redirects.filter(e => {
    const p = e.payload as RedirectPayload;
    if (!p.chain || p.chain.length < 2) return false;
    const targetIsCommercial = commercialPattern.test(p.target_url || '');
    const sourceIsCommercial = commercialPattern.test(p.source_url || '');
    if (!targetIsCommercial && !sourceIsCommercial) return false;
    // Check if chain crosses domains
    const hosts = new Set(p.chain.map(h => h.host).filter(Boolean));
    return hosts.size > 1;
  });

  if (crossDomainCheckoutRedirects.length > 0) {
    const maxHops = Math.max(...crossDomainCheckoutRedirects.map(e => (e.payload as RedirectPayload).hop_count || 0));
    const uniqueHosts = new Set<string>();
    for (const e of crossDomainCheckoutRedirects) {
      const p = e.payload as RedirectPayload;
      for (const hop of (p.chain || [])) {
        if (hop.host) uniqueHosts.add(hop.host);
      }
    }

    signals.push(createSignal({ ids,
      signal_key: 'checkout_redirect_trust_erosion',
      category: SignalCategory.Trust,
      attribute: 'trust.checkout_redirect_erosion',
      value: maxHops >= 3 ? 'high' : 'medium',
      numeric_value: maxHops,
      confidence: 75,
      scoping, cycle_ref,
      evidence_refs: crossDomainCheckoutRedirects.map(e => makeRef('evidence', e.id)),
      description: `${crossDomainCheckoutRedirects.length} redirect chain(s) crossing ${uniqueHosts.size} domain(s) on the path to checkout (max ${maxHops} hops). Each hop erodes buyer trust and loses users.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30B: Language Discontinuity — language switches along commercial journey
// ──────────────────────────────────────────────

function extractLanguageDiscontinuitySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  if (pages.length < 2) return;

  // Get homepage language
  const homepages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return p.url?.match(/^https?:\/\/[^/]+\/?$/);
  });
  const homepageLang = homepages.length > 0
    ? ((homepages[0].payload as PageContentPayload).lang || '').toLowerCase().slice(0, 2)
    : null;

  if (!homepageLang || homepageLang.length < 2) return;

  // Check commercial pages for language mismatches
  const commercialPattern = /checkout|cart|pay|payment|pricing|order|billing|purchase|login|comprar|pedido|plano/i;
  const commercialPages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return commercialPattern.test(p.url || '');
  });

  const mismatchedPages: Evidence[] = [];
  for (const e of commercialPages) {
    const p = e.payload as PageContentPayload;
    const pageLang = (p.lang || '').toLowerCase().slice(0, 2);
    if (pageLang && pageLang.length >= 2 && pageLang !== homepageLang) {
      mismatchedPages.push(e);
    }
  }

  if (mismatchedPages.length > 0) {
    const mismatchLangs = new Set(mismatchedPages.map(e => ((e.payload as PageContentPayload).lang || '').toLowerCase().slice(0, 2)));
    signals.push(createSignal({ ids,
      signal_key: 'language_discontinuity_commercial',
      category: SignalCategory.Friction,
      attribute: 'friction.language_discontinuity',
      value: 'true',
      numeric_value: mismatchedPages.length,
      confidence: 70,
      scoping, cycle_ref,
      evidence_refs: [...homepages.slice(0, 1), ...mismatchedPages].map(e => makeRef('evidence', e.id)),
      description: `${mismatchedPages.length} commercial page(s) switch language from '${homepageLang}' to '${Array.from(mismatchLangs).join(', ')}'. Language break on checkout/pricing path creates confusion and drops conversion.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30B: Orphan Commercial Pages — critical pages not connected from main journey
// ──────────────────────────────────────────────

function extractOrphanCommercialSignals(
  query: GraphQuery,
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  if (pages.length < 2) return;

  // SPA guardrail: if the site looks SPA-heavy, orphan detection is unreliable
  // because JS-driven navigation won't appear as anchor edges in the graph.
  // Detect SPA indicators: high script count with low link count suggests JS navigation.
  const scripts = byType.get(EvidenceType.Script) || [];
  const totalScripts = scripts.length;
  const totalInternalLinks = pages.reduce((sum, e) => {
    const p = e.payload as PageContentPayload;
    return sum + (p.internal_link_count || 0);
  }, 0);

  // If script-heavy and link-light, this is likely SPA — skip orphan detection
  // to avoid false positives from JS-routed navigation we can't see
  if (totalScripts > 15 && totalInternalLinks < 5) return;

  const commercialPattern = /checkout|cart|pricing|login|billing|order|purchase|pay(?:ment)?|plano|comprar/i;
  const commercialPages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return commercialPattern.test(p.url || '') || commercialPattern.test(p.title || '');
  });

  // For each commercial page, check if it has incoming edges from other internal pages
  const orphanPages: Evidence[] = [];
  for (const e of commercialPages) {
    const p = e.payload as PageContentPayload;
    const node = query.getNodeByUrl(p.url);
    if (!node) continue;

    const incomingEdges = query.getEdgesTo(node.id);
    // Include all structural navigation edges + redirects (redirect = path exists even if indirect)
    const internalIncoming = incomingEdges.filter(edge =>
      edge.edge_type === 'anchor' || edge.edge_type === 'form_action' ||
      edge.edge_type === 'intent_target' || edge.edge_type === 'redirect',
    );

    if (internalIncoming.length === 0) {
      orphanPages.push(e);
    }
  }

  if (orphanPages.length > 0) {
    const orphanUrls = orphanPages.map(e => (e.payload as PageContentPayload).url).filter(Boolean);
    // SPA-aware confidence: lower confidence when site has moderate script activity
    // (suggests some JS navigation may exist that we can't observe)
    const spaAdjustedConfidence = totalScripts > 8 ? 50 : 65;

    signals.push(createSignal({ ids,
      signal_key: 'orphan_commercial_page',
      category: SignalCategory.Revenue,
      attribute: 'revenue.orphan_commercial_page',
      value: orphanPages.length >= 2 ? 'high' : 'medium',
      numeric_value: orphanPages.length,
      confidence: spaAdjustedConfidence,
      scoping, cycle_ref,
      evidence_refs: orphanPages.map(e => makeRef('evidence', e.id)),
      description: `${orphanPages.length} commercial page(s) not linked from the main site navigation: ${orphanUrls.slice(0, 3).join(', ')}. Visitors cannot discover these pages through normal browsing.${totalScripts > 8 ? ' Note: site uses significant JavaScript — some navigation paths may not be visible to static analysis.' : ''}`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30B: Untrusted External Embeds on Commercial Pages
// ──────────────────────────────────────────────

function extractUntrustedEmbedSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const iframes = byType.get(EvidenceType.Iframe) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (iframes.length === 0) return;

  // Get commercial page URLs
  const commercialPattern = /checkout|cart|pricing|pay|payment|billing|order|purchase/i;
  const commercialUrls = new Set<string>();
  for (const ci of checkoutIndicators) {
    commercialUrls.add((ci.payload as CheckoutIndicatorPayload).page_url);
  }

  // Find external iframes on commercial pages that aren't known providers
  const untrustedEmbeds = iframes.filter(e => {
    const p = e.payload as IframePayload;
    if (!p.is_external) return false;
    if (p.known_provider) return false; // Stripe, PayPal, etc. are expected
    // Check if iframe is on a commercial page or the page itself is commercial
    const isOnCommercialPage = commercialUrls.has(p.page_url) || commercialPattern.test(p.page_url || '');
    return isOnCommercialPage;
  });

  if (untrustedEmbeds.length > 0) {
    const unknownHosts = new Set(untrustedEmbeds.map(e => (e.payload as IframePayload).host).filter(Boolean));
    signals.push(createSignal({ ids,
      signal_key: 'untrusted_embed_on_commercial',
      category: SignalCategory.Trust,
      attribute: 'trust.untrusted_embed_commercial',
      value: untrustedEmbeds.length >= 3 ? 'high' : 'medium',
      numeric_value: untrustedEmbeds.length,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: untrustedEmbeds.map(e => makeRef('evidence', e.id)),
      description: `${untrustedEmbeds.length} unrecognized external embed(s) on commercial page(s) from: ${Array.from(unknownHosts).join(', ')}. Unknown embeds near purchase surfaces erode buyer trust.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30B: Platform-Specific Checkout Risk Patterns
// ──────────────────────────────────────────────

function extractPlatformCheckoutRiskSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const platforms = byType.get(EvidenceType.PlatformIndicator) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (platforms.length === 0 || checkoutIndicators.length === 0) return;

  // Gate: require strong platform confidence (at least one indicator with confidence >= 60)
  const strongPlatformEvidence = platforms.some(e => (e.payload as PlatformIndicatorPayload).confidence >= 60);
  if (!strongPlatformEvidence) return;

  // Gate: require strong checkout posture (at least 2 checkout indicators OR 1 with high confidence)
  const strongCheckoutPosture = checkoutIndicators.length >= 2 ||
    checkoutIndicators.some(e => (e.payload as CheckoutIndicatorPayload).confidence >= 70);
  if (!strongCheckoutPosture) return;

  const detectedPlatforms = new Set(
    platforms.map(e => (e.payload as PlatformIndicatorPayload).platform_name.toLowerCase()),
  );
  const hasExternalCheckout = checkoutIndicators.some(
    e => (e.payload as CheckoutIndicatorPayload).is_external,
  );

  // Platform-specific risk rules (only fire when platform + checkout posture are both strong)
  // WooCommerce: checkout should be on-domain; external = misconfigured
  // Magento: checkout should be on-domain; external = abandoned migration
  // Shopify: external checkout is expected but compound risk if refund policy also missing
  const riskPatterns: { platform: string; reason: string }[] = [];

  if (detectedPlatforms.has('woocommerce') && hasExternalCheckout) {
    riskPatterns.push({
      platform: 'WooCommerce',
      reason: 'WooCommerce checkout is off-domain — this platform should handle checkout natively. External redirect indicates misconfiguration or abandoned migration.',
    });
  }
  if (detectedPlatforms.has('magento') && hasExternalCheckout) {
    riskPatterns.push({
      platform: 'Magento',
      reason: 'Magento checkout is off-domain — this platform includes native checkout. External handoff creates unnecessary trust break.',
    });
  }
  if (detectedPlatforms.has('shopify')) {
    const policyPages = byType.get(EvidenceType.PolicyPage) || [];
    const hasRefundPolicy = policyPages.some(e => (e.payload as PolicyPagePayload).policy_type === 'refund');
    // Only fire Shopify risk when compound gap: hosted checkout + no refund policy
    if (!hasRefundPolicy && hasExternalCheckout) {
      riskPatterns.push({
        platform: 'Shopify',
        reason: 'Shopify store with hosted checkout but no visible refund policy — the domain switch to checkout.shopify.com combined with missing return policy increases chargeback exposure.',
      });
    }
  }

  if (riskPatterns.length > 0) {
    // Confidence reflects combined strength of platform + checkout evidence
    const avgPlatformConf = platforms.reduce((s, e) => s + (e.payload as PlatformIndicatorPayload).confidence, 0) / platforms.length;
    const signalConfidence = Math.min(75, Math.round(avgPlatformConf * 0.9));

    signals.push(createSignal({ ids,
      signal_key: 'platform_checkout_risk',
      category: SignalCategory.Checkout,
      attribute: 'checkout.platform_risk',
      value: riskPatterns.length >= 2 ? 'high' : 'medium',
      numeric_value: riskPatterns.length,
      confidence: signalConfidence,
      scoping, cycle_ref,
      evidence_refs: [
        ...platforms.map(e => makeRef('evidence', e.id)),
        ...checkoutIndicators.slice(0, 3).map(e => makeRef('evidence', e.id)),
      ],
      description: riskPatterns.map(r => r.reason).join(' '),
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 30B: Post-Purchase Confirmation Gap
// ──────────────────────────────────────────────

function extractPostPurchaseGapSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (checkoutIndicators.length === 0) return;

  const hasThankYou = pages.some(e => {
    const p = e.payload as PageContentPayload;
    return /thank|obrigado|confirma|success|pedido.?realizado|order.?complete/i.test(p.url) ||
      /thank|obrigado|confirma|success|order.?complete/i.test(p.title || '');
  });

  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  const hasRefundPolicy = policyPages.some(e => (e.payload as PolicyPagePayload).policy_type === 'refund');

  // Only fire if: no confirmation page AND (no refund policy — compound gap)
  if (!hasThankYou && !hasRefundPolicy) {
    signals.push(createSignal({ ids,
      signal_key: 'post_purchase_gap_compound',
      category: SignalCategory.Expectation,
      attribute: 'chargeback.post_purchase_gap_compound',
      value: 'high',
      numeric_value: 2, // missing confirmation + missing refund = 2 gaps
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: checkoutIndicators.slice(0, 3).map(e => makeRef('evidence', e.id)),
      description: 'No order confirmation page and no refund policy detected. Customers who are unsure their order was placed and cannot find return terms will file chargebacks.',
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2: Policy Content Depth Signals
// ──────────────────────────────────────────────

function extractPolicyDepthSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  if (policyPages.length === 0) return;

  const refundPolicies = policyPages.filter(e =>
    (e.payload as PolicyPagePayload).policy_type === 'refund',
  );

  for (const e of refundPolicies) {
    const p = e.payload as PolicyPagePayload;

    // Signal 1: Thin refund policy (word count < 200)
    if (p.word_count !== null && p.word_count < 200) {
      signals.push(createSignal({ ids,
        signal_key: 'thin_refund_policy',
        category: SignalCategory.Policy,
        attribute: 'policy.refund_thin',
        value: 'true',
        numeric_value: p.word_count,
        confidence: 70,
        scoping, cycle_ref,
        evidence_refs: [makeRef('evidence', e.id)],
        description: `Refund/return policy is only ${p.word_count} words. Policies under 200 words lack sufficient detail to set buyer expectations and defuse disputes.`,
      }));
    }

    // Signal 2 (Phase 2C): Refund process vague — policy exists but lacks actionable details
    // Only fires when the page has been analyzed (rich fields available)
    if (p.has_refund_process !== null) {
      const missingDetails: string[] = [];
      if (!p.has_return_window) missingDetails.push('no return window specified');
      if (!p.has_refund_process) missingDetails.push('no refund process described');
      if (!p.has_contact_info) missingDetails.push('no contact info for returns');

      // Vague = 2+ critical details missing, even if policy is long enough
      if (missingDetails.length >= 2) {
        signals.push(createSignal({ ids,
          signal_key: 'refund_process_vague',
          category: SignalCategory.Policy,
          attribute: 'policy.refund_process_vague',
          value: missingDetails.length >= 3 ? 'high' : 'medium',
          numeric_value: missingDetails.length,
          confidence: 65,
          scoping, cycle_ref,
          evidence_refs: [makeRef('evidence', e.id)],
          description: `Refund policy exists but is missing critical actionable details: ${missingDetails.join(', ')}. Buyers who need to return or dispute cannot understand what to do.`,
        }));
      }
    }

    break; // only process first refund policy
  }

  // Signal 3 (Phase 2C): Post-purchase confirmation page quality
  // Check if confirmation/thank-you page exists and whether it's useful as proof
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (checkoutIndicators.length === 0) return;

  const pages = byType.get(EvidenceType.PageContent) || [];
  const confirmPages = pages.filter(e => {
    const pg = e.payload as PageContentPayload;
    return /thank|obrigado|confirma|success|pedido.?realizado|order.?complete/i.test(pg.url || '') ||
      /thank|obrigado|confirma|success|order.?complete/i.test(pg.title || '');
  });

  if (confirmPages.length > 0) {
    // Confirmation page exists — check if it's too thin to serve as proof
    const firstConfirm = confirmPages[0];
    const pg = firstConfirm.payload as PageContentPayload;
    const confirmWordCount = pg.body_word_count || 0;

    if (confirmWordCount < 100) {
      signals.push(createSignal({ ids,
        signal_key: 'post_purchase_proof_weak',
        category: SignalCategory.Expectation,
        attribute: 'chargeback.post_purchase_proof_weak',
        value: confirmWordCount < 50 ? 'high' : 'medium',
        numeric_value: confirmWordCount,
        confidence: 55,
        scoping, cycle_ref,
        evidence_refs: [makeRef('evidence', firstConfirm.id)],
        description: `Order confirmation page exists but is only ${confirmWordCount} words — too thin to serve as purchase proof. A confirmation page that does not clearly show order details, expected delivery, and next steps leaves customers uncertain about what they bought and when they will get it.`,
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Phase 2: Support Widget Detection Signals
// ──────────────────────────────────────────────

function extractSupportWidgetSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const techEvidence = byType.get(EvidenceType.TechnologyDetected) || [];
  const supportWidgets = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'support_widget',
  );

  if (supportWidgets.length > 0) {
    const widgetNames = supportWidgets.map(e => (e.payload as TechnologyDetectedPayload).display_name);

    // Check if support widget is on commercial pages
    const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
    const commercialUrls = new Set(
      checkoutIndicators.map(e => (e.payload as CheckoutIndicatorPayload).page_url),
    );
    const widgetOnCommercial = supportWidgets.some(e => {
      const detectedOn = (e.payload as TechnologyDetectedPayload).detected_on || [];
      return detectedOn.some(url => commercialUrls.has(url));
    });

    signals.push(createSignal({ ids,
      signal_key: 'support_widget_detected',
      category: SignalCategory.Support,
      attribute: 'support.widget_detected',
      value: 'true',
      numeric_value: supportWidgets.length,
      confidence: 75,
      scoping, cycle_ref,
      evidence_refs: supportWidgets.map(e => makeRef('evidence', e.id)),
      description: `Live support widget detected: ${widgetNames.join(', ')}.${widgetOnCommercial ? ' Present on commercial pages.' : ' Not found on checkout/payment pages.'}`,
    }));

    // If widget exists but NOT on commercial pages, that's a hidden-support signal
    if (!widgetOnCommercial && commercialUrls.size > 0) {
      signals.push(createSignal({ ids,
        signal_key: 'support_widget_hidden_from_checkout',
        category: SignalCategory.Support,
        attribute: 'support.widget_hidden_checkout',
        value: 'true',
        confidence: 60,
        scoping, cycle_ref,
        evidence_refs: supportWidgets.map(e => makeRef('evidence', e.id)),
        description: `Live support widget (${widgetNames.join(', ')}) exists but is not present on checkout/payment pages where buyers most need reassurance.`,
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Phase 2: Trust Signal Depth — Structured Data as Trust Surface
// ──────────────────────────────────────────────

function extractTrustSignalDepthSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const structuredData = byType.get(EvidenceType.StructuredDataItem) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (checkoutIndicators.length === 0) return; // only relevant for commerce sites

  const trustTypes = structuredData.filter(e =>
    (e.payload as StructuredDataItemPayload).is_trust_signal,
  );
  const commerceTypes = structuredData.filter(e =>
    (e.payload as StructuredDataItemPayload).is_commerce_signal,
  );

  // Count total trust-building signals: structured data + policies + providers
  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  const providers = byType.get(EvidenceType.ProviderIndicator) || [];

  const trustSignalCount = trustTypes.length + policyPages.length + (providers.length > 0 ? 1 : 0);

  if (trustSignalCount < 2) {
    signals.push(createSignal({ ids,
      signal_key: 'trust_signals_thin_on_commercial',
      category: SignalCategory.Trust,
      attribute: 'trust.signals_thin',
      value: trustSignalCount === 0 ? 'high' : 'medium',
      numeric_value: trustSignalCount,
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: [
        ...trustTypes.map(e => makeRef('evidence', e.id)),
        ...policyPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
      ],
      description: `Only ${trustSignalCount} trust-building signal(s) found (structured business data, policies, recognized providers). Commerce sites with thin trust surfaces see higher checkout abandonment.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2: Tracking Stack Completeness
// ──────────────────────────────────────────────

function extractTrackingStackSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const techEvidence = byType.get(EvidenceType.TechnologyDetected) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (checkoutIndicators.length === 0) return; // only relevant for commerce

  const analytics = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'analytics',
  );
  const tagManagers = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'tag_manager',
  );
  const errorTracking = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'error_tracking',
  );

  // Commerce site needs: analytics (conversion measurement) + tag manager (deployment flexibility)
  // Error tracking is bonus but strengthens readiness
  const hasAnalytics = analytics.length > 0;
  const hasTagManager = tagManagers.length > 0;
  const hasErrorTracking = errorTracking.length > 0;

  const trackingGaps: string[] = [];
  if (!hasAnalytics) trackingGaps.push('no analytics tool');
  if (!hasTagManager) trackingGaps.push('no tag manager');

  if (trackingGaps.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'tracking_stack_incomplete',
      category: SignalCategory.Measurement,
      attribute: 'measurement.tracking_stack_incomplete',
      value: trackingGaps.length >= 2 ? 'high' : 'medium',
      numeric_value: trackingGaps.length,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: techEvidence.map(e => makeRef('evidence', e.id)),
      description: `Commerce tracking stack gaps: ${trackingGaps.join(', ')}. ${!hasAnalytics ? 'Without analytics, conversion optimization is impossible.' : ''} ${!hasTagManager ? 'Without a tag manager, tracking changes require code deploys.' : ''}`.trim(),
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2: Consent × Measurement Conflict
// ──────────────────────────────────────────────

function extractConsentMeasurementSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const techEvidence = byType.get(EvidenceType.TechnologyDetected) || [];

  const consentManagers = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'consent_manager',
  );
  const analytics = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'analytics',
  );
  const tagManagers = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'tag_manager',
  );

  // Consent manager present but no tag manager = consent may be blocking analytics
  // without a proper consent-aware tag firing mechanism
  if (consentManagers.length > 0 && tagManagers.length === 0 && analytics.length > 0) {
    const consentName = (consentManagers[0].payload as TechnologyDetectedPayload).display_name;
    signals.push(createSignal({ ids,
      signal_key: 'consent_measurement_conflict',
      category: SignalCategory.Measurement,
      attribute: 'measurement.consent_conflict',
      value: 'medium',
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: [
        ...consentManagers.map(e => makeRef('evidence', e.id)),
        ...analytics.map(e => makeRef('evidence', e.id)),
      ],
      description: `Consent manager (${consentName}) detected without a tag manager. Analytics may be blocked for consenting users because there is no consent-aware tag firing mechanism. This can silently break measurement continuity.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2B: Mobile Verification Signals
// ──────────────────────────────────────────────

function extractMobileVerificationSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const mobileResults = byType.get(EvidenceType.MobileVerificationResult) || [];
  if (mobileResults.length === 0) return;

  for (const ev of mobileResults) {
    const p = ev.payload as MobileVerificationResultPayload;

    // Mobile commercial path blocked
    if (!p.commercial_path_reachable || !p.checkout_reachable) {
      signals.push(createSignal({ ids,
        signal_key: 'mobile_commercial_path_blocked',
        category: SignalCategory.Friction,
        attribute: 'mobile.commercial_path_blocked',
        value: !p.commercial_path_reachable ? 'high' : 'medium',
        confidence: 75,
        scoping, cycle_ref,
        evidence_refs: [makeRef('evidence', ev.id)],
        description: `Mobile commercial path ${!p.commercial_path_reachable ? 'unreachable' : 'partially degraded'}. ${p.steps_failed} step(s) failed on mobile. Checkout ${p.checkout_reachable ? 'reachable' : 'blocked'}.`,
      }));
    }

    // Mobile trust degraded vs desktop
    if (p.trust_degraded_vs_desktop) {
      signals.push(createSignal({ ids,
        signal_key: 'mobile_trust_weaker_than_desktop',
        category: SignalCategory.Trust,
        attribute: 'mobile.trust_degraded',
        value: 'true',
        confidence: 65,
        scoping, cycle_ref,
        evidence_refs: [makeRef('evidence', ev.id)],
        description: 'Mobile trust experience is weaker than desktop. Trust indicators, policies, or provider signals differ between viewports.',
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Phase 2B: Classified Runtime Error Signals
// ──────────────────────────────────────────────

function extractRuntimeErrorSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const runtimeErrors = byType.get(EvidenceType.ClassifiedRuntimeErrors) || [];
  if (runtimeErrors.length === 0) return;

  let totalCommercialErrors = 0;
  let totalTrackingErrors = 0;
  let hasPurchaseInterruption = false;
  const allRefs: string[] = [];

  for (const ev of runtimeErrors) {
    const p = ev.payload as ClassifiedRuntimeErrorsPayload;
    allRefs.push(makeRef('evidence', ev.id));
    totalCommercialErrors += p.total_commercial_errors;

    for (const err of p.errors) {
      if (err.bucket === 'purchase_interruption' || err.bucket === 'payment_provider_error') {
        hasPurchaseInterruption = true;
      }
      if (err.bucket === 'tracking_failure') {
        totalTrackingErrors += err.count;
      }
    }
  }

  // Purchase journey interrupted by runtime failure
  if (hasPurchaseInterruption) {
    signals.push(createSignal({ ids,
      signal_key: 'runtime_purchase_interrupted',
      category: SignalCategory.Friction,
      attribute: 'runtime.purchase_interrupted',
      value: 'high',
      confidence: 75,
      scoping, cycle_ref,
      evidence_refs: allRefs,
      description: `Runtime errors detected that directly affect the purchase flow — payment SDK failures, checkout errors, or transaction-blocking JavaScript exceptions. These actively prevent buyers from completing purchases.`,
    }));
  }

  // Runtime tracking/measurement failures
  if (totalTrackingErrors > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'runtime_tracking_broken',
      category: SignalCategory.Measurement,
      attribute: 'runtime.tracking_broken',
      value: totalTrackingErrors >= 3 ? 'high' : 'medium',
      numeric_value: totalTrackingErrors,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: allRefs,
      description: `${totalTrackingErrors} runtime error(s) affecting analytics, pixel, or tag manager execution. Tracking scripts are failing at runtime, silently breaking measurement continuity on commercial pages.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2B: Secondary Commercial Flow Detection
// ──────────────────────────────────────────────

function extractSecondaryFlowSignals(
  query: GraphQuery,
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  if (pages.length < 5) return; // need meaningful crawl depth

  // Look for commercial pages that were discovered via recursive crawl
  // but are not connected to the main commercial path from the homepage
  const commercialPattern = /checkout|cart|pay|payment|billing|order|purchase|pricing|comprar|pedido/i;
  const homepageUrl = pages[0] ? (pages[0].payload as PageContentPayload).url : null;
  if (!homepageUrl) return;

  const commercialPages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return commercialPattern.test(p.url || '') && p.url !== homepageUrl;
  });

  if (commercialPages.length < 2) return; // need at least 2 commercial pages for secondary flow detection

  // Use graph to check if these commercial pages share the same entry path
  const commercialEntryPaths = new Set<string>();
  for (const e of commercialPages) {
    const p = e.payload as PageContentPayload;
    const node = query.getNodeByUrl(p.url);
    if (!node) continue;
    const inbound = query.getEdgesTo(node.id);
    for (const edge of inbound) {
      if (edge.edge_type === 'anchor' || edge.edge_type === 'intent_target') {
        commercialEntryPaths.add(edge.source_id);
      }
    }
  }

  // If commercial pages have multiple distinct entry points, there are secondary flows
  if (commercialEntryPaths.size >= 3 && commercialPages.length >= 2) {
    signals.push(createSignal({ ids,
      signal_key: 'secondary_commercial_flows_detected',
      category: SignalCategory.Revenue,
      attribute: 'revenue.secondary_flows',
      value: commercialEntryPaths.size >= 5 ? 'high' : 'medium',
      numeric_value: commercialEntryPaths.size,
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: commercialPages.slice(0, 3).map(e => makeRef('evidence', e.id)),
      description: `${commercialEntryPaths.size} distinct entry points lead to commercial pages, suggesting secondary conversion flows that may bypass the main trust and measurement path.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2C: Composite Signals from Current Evidence
// ──────────────────────────────────────────────

// Target 4: Support reassurance appears too late in buying journey
function extractSupportJourneyPositionSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  if (checkoutIndicators.length === 0 || pages.length < 3) return;

  // Support/help/contact pages exist?
  const supportPattern = /contact|contato|suporte|support|help|fale.?conosco|atendimento|faq/i;
  const supportPages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return supportPattern.test(p.url || '') || supportPattern.test(p.title || '');
  });

  if (supportPages.length === 0) return; // no support found at all — covered by support_unreachable

  // Check if support pages are linked from checkout/pricing pages (early in journey)
  // vs only reachable from secondary paths (late in journey)
  const commercialPattern = /checkout|cart|pricing|pay|billing|order|purchase/i;
  const commercialPageUrls = new Set(
    pages.filter(e => commercialPattern.test((e.payload as PageContentPayload).url || ''))
      .map(e => (e.payload as PageContentPayload).url),
  );

  // If support exists but no commercial page links to it, support is late
  const homepageUrl = pages[0] ? (pages[0].payload as PageContentPayload).url : null;
  const supportUrls = supportPages.map(e => (e.payload as PageContentPayload).url);

  // Check if any support URL appears in links from commercial pages
  const links = byType.get(EvidenceType.Link) || [];
  const linksFromCommercial = links.filter(e => {
    const p = e.payload as any;
    return commercialPageUrls.has(p.page_url);
  });
  const supportLinkedFromCommercial = linksFromCommercial.some(e => {
    const p = e.payload as any;
    return supportUrls.some(su => (p.href || '').includes(su) || supportPattern.test(p.href || ''));
  });

  if (!supportLinkedFromCommercial) {
    signals.push(createSignal({ ids,
      signal_key: 'support_late_in_journey',
      category: SignalCategory.Support,
      attribute: 'support.late_in_journey',
      value: 'true',
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: [
        ...supportPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
        ...checkoutIndicators.slice(0, 2).map(e => makeRef('evidence', e.id)),
      ],
      description: 'Support and help pages exist but are not linked from commercial surfaces (checkout, pricing, cart). Buyers encounter reassurance too late — after the hesitation moment, not during it.',
    }));
  }
}

// Target 5: Hidden reassurance routes (confirmation, help, FAQ) disconnected from main journey
function extractHiddenReassuranceRouteSignals(
  query: GraphQuery,
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  if (pages.length < 5) return; // need meaningful crawl depth

  const reassurancePattern = /help|faq|confirm|success|thank|obrigado|garantia|warranty|exchange|troca|devolucao|suporte|support|return/i;
  const reassurancePages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return reassurancePattern.test(p.url || '') || reassurancePattern.test(p.title || '');
  });

  if (reassurancePages.length === 0) return;

  // Check which reassurance pages have no inbound links from the main site
  const orphanReassurance: Evidence[] = [];
  for (const e of reassurancePages) {
    const p = e.payload as PageContentPayload;
    const node = query.getNodeByUrl(p.url);
    if (!node) continue;

    const inbound = query.getEdgesTo(node.id);
    const hasStructuralInbound = inbound.some(edge =>
      edge.edge_type === 'anchor' || edge.edge_type === 'form_action' || edge.edge_type === 'intent_target',
    );

    if (!hasStructuralInbound) {
      orphanReassurance.push(e);
    }
  }

  if (orphanReassurance.length > 0) {
    const orphanUrls = orphanReassurance.map(e => (e.payload as PageContentPayload).url).filter(Boolean);
    signals.push(createSignal({ ids,
      signal_key: 'hidden_reassurance_routes',
      category: SignalCategory.Support,
      attribute: 'support.hidden_reassurance',
      value: orphanReassurance.length >= 2 ? 'high' : 'medium',
      numeric_value: orphanReassurance.length,
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: orphanReassurance.map(e => makeRef('evidence', e.id)),
      description: `${orphanReassurance.length} reassurance page(s) (help, FAQ, confirmation, warranty) exist but have no navigation links from the main site: ${orphanUrls.slice(0, 3).join(', ')}. These pages could reduce buyer anxiety but are invisible to users navigating the commercial journey.`,
    }));
  }
}

// Target 8: Alternate flows bypass measurement continuity
function extractAlternateFlowMeasurementSignals(
  query: GraphQuery,
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // This fires when secondary commercial flows exist AND measurement is incomplete
  // Combines: secondary_commercial_flows_detected signal + tracking_stack_incomplete or missing_tracking_on_commercial
  const techEvidence = byType.get(EvidenceType.TechnologyDetected) || [];
  const pages = byType.get(EvidenceType.PageContent) || [];
  if (pages.length < 5) return;

  // Check if secondary flows were detected
  const commercialPattern = /checkout|cart|pay|payment|billing|order|purchase|pricing/i;
  const commercialPages = pages.filter(e => commercialPattern.test((e.payload as PageContentPayload).url || ''));
  if (commercialPages.length < 2) return;

  // Check measurement completeness
  const analytics = techEvidence.filter(e =>
    (e.payload as TechnologyDetectedPayload).category === 'analytics',
  );
  const hasAnalytics = analytics.length > 0;

  // If multiple commercial pages but analytics coverage is thin, alternate flows are untracked
  const scripts = byType.get(EvidenceType.Script) || [];
  const analyticsPatterns = [/google-analytics|googletagmanager|gtag/i, /connect\.facebook|fbevents/i, /segment\.com|cdn\.segment/i];

  // Check analytics presence on each commercial page
  const commercialPagesWithoutAnalytics = commercialPages.filter(e => {
    const pageUrl = (e.payload as PageContentPayload).url;
    const pageScripts = scripts.filter(s => (s.payload as ScriptPayload).page_url === pageUrl);
    return !pageScripts.some(s => analyticsPatterns.some(p => p.test((s.payload as ScriptPayload).src)));
  });

  if (commercialPagesWithoutAnalytics.length > 0 && commercialPages.length >= 2) {
    signals.push(createSignal({ ids,
      signal_key: 'alternate_flow_measurement_gap',
      category: SignalCategory.Measurement,
      attribute: 'measurement.alternate_flow_gap',
      value: commercialPagesWithoutAnalytics.length >= 2 ? 'high' : 'medium',
      numeric_value: commercialPagesWithoutAnalytics.length,
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: commercialPagesWithoutAnalytics.map(e => makeRef('evidence', e.id)),
      description: `${commercialPagesWithoutAnalytics.length} of ${commercialPages.length} commercial page(s) lack analytics tracking. Revenue flowing through these paths is unmeasured — ad spend attribution and conversion optimization are blind on these routes.`,
    }));
  }
}

// Target 10: Runtime failures breaking support/reassurance at hesitation moments
function extractRuntimeReassuranceBreakSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const runtimeErrors = byType.get(EvidenceType.ClassifiedRuntimeErrors) || [];
  if (runtimeErrors.length === 0) return;

  let widgetFailureCount = 0;
  const allRefs: string[] = [];

  for (const ev of runtimeErrors) {
    const p = ev.payload as ClassifiedRuntimeErrorsPayload;
    allRefs.push(makeRef('evidence', ev.id));
    for (const err of p.errors) {
      if (err.bucket === 'widget_failure') {
        widgetFailureCount += err.count;
      }
    }
  }

  if (widgetFailureCount > 0) {
    signals.push(createSignal({ ids,
      signal_key: 'runtime_reassurance_broken',
      category: SignalCategory.Support,
      attribute: 'runtime.reassurance_broken',
      value: widgetFailureCount >= 3 ? 'high' : 'medium',
      numeric_value: widgetFailureCount,
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: allRefs,
      description: `${widgetFailureCount} runtime error(s) affecting support/chat widgets or consent tools. The reassurance layer that helps hesitant buyers is failing exactly where uncertainty is highest.`,
    }));
  }
}

// Target 13: Checkout mode sending buyers through weaker-than-expected provider path
function extractProviderPathWeaknessSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const checkoutIndicators = byType.get(EvidenceType.CheckoutIndicator) || [];
  const providers = byType.get(EvidenceType.ProviderIndicator) || [];
  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  const techEvidence = byType.get(EvidenceType.TechnologyDetected) || [];

  if (checkoutIndicators.length === 0) return;

  const hasExternalCheckout = checkoutIndicators.some(e =>
    (e.payload as CheckoutIndicatorPayload).is_external,
  );

  // Provider path is "weak" when:
  // 1. Checkout is external (redirect mode) AND
  // 2. No recognized payment provider detected (buyer goes to unknown endpoint) AND
  // 3. No trust reinforcement (no policies, no structured data)
  const hasRecognizedProvider = providers.length > 0;
  const hasPolicies = policyPages.length >= 2;
  const hasTrustSchema = techEvidence.some(e =>
    (e.payload as TechnologyDetectedPayload).category === 'platform' &&
    (e.payload as TechnologyDetectedPayload).confidence >= 60,
  );

  if (hasExternalCheckout && !hasRecognizedProvider) {
    signals.push(createSignal({ ids,
      signal_key: 'provider_path_weaker_than_expected',
      category: SignalCategory.Checkout,
      attribute: 'checkout.provider_path_weak',
      value: !hasPolicies ? 'high' : 'medium',
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: [
        ...checkoutIndicators.slice(0, 3).map(e => makeRef('evidence', e.id)),
        ...providers.slice(0, 2).map(e => makeRef('evidence', e.id)),
      ],
      description: `Checkout redirects buyers to an external domain without a recognized payment provider. ${!hasPolicies ? 'No policies reinforce trust.' : ''} ${!hasTrustSchema ? 'No verified business identity detected.' : ''} The provider path is weaker than buyers expect for a payment handoff.`,
    }));
  }
}

// Target 15: Trust and measurement break apart on alternate commerce paths (compound)
function extractAlternateFlowTrustMeasurementSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // Compound signal: fires only when BOTH trust AND measurement are weak on alternate paths
  // This is a composite of secondary flows + trust thinness + measurement gaps
  const pages = byType.get(EvidenceType.PageContent) || [];
  const policyPages = byType.get(EvidenceType.PolicyPage) || [];
  const techEvidence = byType.get(EvidenceType.TechnologyDetected) || [];

  if (pages.length < 5) return;

  const commercialPattern = /checkout|cart|pay|payment|billing|order|purchase|pricing/i;
  const commercialPages = pages.filter(e => commercialPattern.test((e.payload as PageContentPayload).url || ''));
  if (commercialPages.length < 2) return;

  // Trust assessment: few policies + few providers
  const hasPolicies = policyPages.length >= 2;
  const hasAnalytics = techEvidence.some(e => (e.payload as TechnologyDetectedPayload).category === 'analytics');

  // Compound: multiple commercial pages with weak trust AND weak measurement
  if (!hasPolicies && !hasAnalytics && commercialPages.length >= 2) {
    signals.push(createSignal({ ids,
      signal_key: 'alternate_flow_trust_measurement_compound',
      category: SignalCategory.Revenue,
      attribute: 'revenue.trust_measurement_compound_break',
      value: 'high',
      confidence: 55,
      scoping, cycle_ref,
      evidence_refs: commercialPages.slice(0, 3).map(e => makeRef('evidence', e.id)),
      description: `Multiple commercial paths operate without both trust safeguards (policies < 2) and measurement coverage (no analytics detected). Revenue flowing through these paths has neither the trust infrastructure to convert nor the measurement infrastructure to optimize.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 3A: Channel Integrity Signals from Nuclei Evidence
// ──────────────────────────────────────────────

function extractChannelIntegritySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const nucleiMatches = byType.get(EvidenceType.NucleiMatch) || [];
  if (nucleiMatches.length === 0) return;

  // ── Helpers for governance gates ──
  const CONFIDENCE_FLOOR = 50; // signals below this average confidence do not fire
  const groupBy = (family: string) => nucleiMatches.filter(e => (e.payload as NucleiMatchPayload).downside_family === family);
  const avgConfidence = (matches: Evidence[]) => matches.length === 0 ? 0 : Math.round(matches.reduce((s, e) => s + (e.payload as NucleiMatchPayload).confidence, 0) / matches.length);
  const highSevCount = (matches: Evidence[]) => matches.filter(e => (e.payload as NucleiMatchPayload).severity_weight === 'high').length;
  const commercialCount = (matches: Evidence[]) => matches.filter(e => (e.payload as NucleiMatchPayload).is_commercial_surface).length;

  // ── Payment integrity: script injection / formjacking ──
  // Gate: requires at least 1 high-severity match OR 1 match on commercial surface
  const paymentMatches = groupBy('payment_integrity');
  const paymentHigh = highSevCount(paymentMatches);
  const paymentCommercial = commercialCount(paymentMatches);
  const paymentConf = avgConfidence(paymentMatches);

  if (paymentMatches.length > 0 && paymentConf >= CONFIDENCE_FLOOR && (paymentHigh > 0 || paymentCommercial > 0)) {
    signals.push(createSignal({ ids,
      signal_key: 'payment_surface_script_exposure',
      category: SignalCategory.Trust,
      attribute: 'channel.payment_script_exposure',
      value: paymentHigh > 0 ? 'high' : 'medium',
      numeric_value: paymentMatches.length,
      confidence: paymentConf,
      scoping, cycle_ref,
      evidence_refs: paymentMatches.map(e => makeRef('evidence', e.id)),
      description: `${paymentMatches.length} payment integrity exposure(s).${paymentCommercial > 0 ? ` ${paymentCommercial} on checkout/payment surfaces.` : ''} Script injection or formjacking-pattern exposure near purchase-critical pages.`,
    }));
  }

  // ── Channel trust: open redirects, CORS, directory listing ──
  // Gate: requires at least 1 high-severity match (open redirect = high)
  // Low-signal matches (directory listing, CORS) alone do not fire unless 2+ present
  const channelMatches = groupBy('channel_trust');
  const channelHigh = highSevCount(channelMatches);
  const channelConf = avgConfidence(channelMatches);

  if (channelMatches.length > 0 && channelConf >= CONFIDENCE_FLOOR && (channelHigh > 0 || channelMatches.length >= 2)) {
    signals.push(createSignal({ ids,
      signal_key: 'channel_hijack_exposure',
      category: SignalCategory.Trust,
      attribute: 'channel.hijack_exposure',
      value: channelHigh > 0 ? 'high' : 'medium',
      numeric_value: channelMatches.length,
      confidence: channelConf,
      scoping, cycle_ref,
      evidence_refs: channelMatches.map(e => makeRef('evidence', e.id)),
      description: `${channelMatches.length} channel trust exposure(s).${channelHigh > 0 ? ' Includes high-severity issues (open redirects) that enable phishing using the brand domain.' : ' Multiple posture weaknesses that compound to enable traffic diversion or impersonation.'}`,
    }));
  }

  // ── Commerce continuity: admin panels, debug, env files ──
  // Gate: always fires if present (these are unambiguously dangerous)
  const opsMatches = groupBy('commerce_continuity');
  const opsConf = avgConfidence(opsMatches);

  if (opsMatches.length > 0 && opsConf >= CONFIDENCE_FLOOR) {
    signals.push(createSignal({ ids,
      signal_key: 'commerce_continuity_threat',
      category: SignalCategory.Operational,
      attribute: 'channel.commerce_continuity_threat',
      value: highSevCount(opsMatches) > 0 ? 'high' : 'medium',
      numeric_value: opsMatches.length,
      confidence: opsConf,
      scoping, cycle_ref,
      evidence_refs: opsMatches.map(e => makeRef('evidence', e.id)),
      description: `${opsMatches.length} operational exposure(s) threatening commerce continuity. Exposed admin panels, debug endpoints, or configuration files exploitable to disrupt the commercial operation.`,
    }));
  }

  // ── Trust posture: HSTS, mixed content, expired cert ──
  // TIGHTENED GATE: low-signal checks (missing HSTS alone, single mixed-content) do NOT fire.
  // Requires: 1 high-severity match (expired cert) OR 2+ matches (pattern, not single config)
  const trustMatches = groupBy('trust_posture');
  const trustHigh = highSevCount(trustMatches);
  const trustConf = avgConfidence(trustMatches);

  if (trustMatches.length > 0 && trustConf >= CONFIDENCE_FLOOR && (trustHigh > 0 || trustMatches.length >= 2)) {
    signals.push(createSignal({ ids,
      signal_key: 'low_trust_technical_posture',
      category: SignalCategory.Trust,
      attribute: 'channel.low_trust_posture',
      value: trustHigh > 0 ? 'high' : 'medium',
      numeric_value: trustMatches.length,
      confidence: trustConf,
      scoping, cycle_ref,
      evidence_refs: trustMatches.map(e => makeRef('evidence', e.id)),
      description: `${trustMatches.length} trust posture weakness(es). ${trustHigh > 0 ? 'Includes critical issues (expired certificate, browser security warnings) that actively block buyers.' : 'Multiple visible weaknesses that compound to undermine purchase confidence.'}`,
    }));
  }

  // ── Abuse exposure: APIs, business-logic, economic exploitation ──
  // TIGHTENED GATE: single low-confidence match (GraphQL introspection alone) does NOT fire.
  // Requires: 1 match on commercial surface OR 2+ matches OR 1 high-severity match
  const abuseMatches = groupBy('abuse_exposure');
  const abuseHigh = highSevCount(abuseMatches);
  const abuseCommercial = commercialCount(abuseMatches);
  const abuseConf = avgConfidence(abuseMatches);

  if (abuseMatches.length > 0 && abuseConf >= CONFIDENCE_FLOOR && (abuseHigh > 0 || abuseCommercial > 0 || abuseMatches.length >= 2)) {
    // Split: economic exploitation checks (cart, coupon, refund) vs generic API exposure
    const economicChecks = ['vi_abuse_cart_manipulation', 'vi_abuse_coupon_enumeration', 'vi_abuse_refund_endpoint_exposed'];
    const economicMatches = abuseMatches.filter(e => economicChecks.includes((e.payload as NucleiMatchPayload).check_id));
    const genericAbuseMatches = abuseMatches.filter(e => !economicChecks.includes((e.payload as NucleiMatchPayload).check_id));

    // Signal 1: Economic exploitation (cart/coupon/refund abuse)
    if (economicMatches.length > 0) {
      const econConf = avgConfidence(economicMatches);
      signals.push(createSignal({ ids,
        signal_key: 'economic_exploitation_exposure',
        category: SignalCategory.Operational,
        attribute: 'channel.economic_exploitation',
        value: economicMatches.length >= 2 ? 'high' : 'medium',
        numeric_value: economicMatches.length,
        confidence: econConf,
        scoping, cycle_ref,
        evidence_refs: economicMatches.map(e => makeRef('evidence', e.id)),
        description: `${economicMatches.length} business-logic exploitation condition(s). Cart manipulation, coupon enumeration, or refund endpoint exposure enables systematic margin theft, discount abuse, or automated refund fraud.`,
      }));
    }

    // Signal 2: General abuse conditions (API exposure, enumeration, rate limiting)
    if (genericAbuseMatches.length > 0 && (genericAbuseMatches.length >= 2 || abuseCommercial > 0)) {
      const genConf = avgConfidence(genericAbuseMatches);
      signals.push(createSignal({ ids,
        signal_key: 'abuse_exposure_conditions',
        category: SignalCategory.Operational,
        attribute: 'channel.abuse_exposure',
        value: genericAbuseMatches.length >= 2 ? 'high' : 'medium',
        numeric_value: genericAbuseMatches.length,
        confidence: genConf,
        scoping, cycle_ref,
        evidence_refs: genericAbuseMatches.map(e => makeRef('evidence', e.id)),
        description: `${genericAbuseMatches.length} abuse-enabling condition(s). Exposed APIs, schema introspection, or missing rate limits enable automated fraud, scraping, and credential attacks at scale.`,
      }));
    }
  }

  // ── Compound: payment integrity + trust posture ──
  // Gate: both families must have independently fired (already gated above)
  if (paymentMatches.length > 0 && trustMatches.length > 0 &&
      (paymentHigh > 0 || paymentCommercial > 0) && (trustHigh > 0 || trustMatches.length >= 2)) {
    const allRefs = [...paymentMatches, ...trustMatches].map(e => makeRef('evidence', e.id));
    signals.push(createSignal({ ids,
      signal_key: 'checkout_infrastructure_brittle',
      category: SignalCategory.Trust,
      attribute: 'channel.checkout_infra_brittle',
      value: 'high',
      numeric_value: paymentMatches.length + trustMatches.length,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: allRefs.slice(0, 10),
      description: `Payment integrity exposures (${paymentMatches.length}) combined with trust posture weaknesses (${trustMatches.length}). Checkout trust anchored to infrastructure that is both technically weak and actively exploitable.`,
    }));
  }

  // ── Compound: multi-category exposure pattern ──
  // Gate: requires 3+ exposures across 2+ families with at least 1 on commercial surface
  const allExposures = nucleiMatches.length;
  const allCommercial = commercialCount(nucleiMatches);
  const familiesPresent = new Set(nucleiMatches.map(e => (e.payload as NucleiMatchPayload).downside_family)).size;

  if (allExposures >= 3 && familiesPresent >= 2 && allCommercial >= 1) {
    signals.push(createSignal({ ids,
      signal_key: 'channel_compromise_pattern',
      category: SignalCategory.Trust,
      attribute: 'channel.compromise_pattern',
      value: allCommercial >= 2 ? 'high' : 'medium',
      numeric_value: allExposures,
      confidence: 60,
      scoping, cycle_ref,
      evidence_refs: nucleiMatches.slice(0, 10).map(e => makeRef('evidence', e.id)),
      description: `${allExposures} exposures across ${familiesPresent} categories, ${allCommercial} on commercial surfaces. Multiple simultaneous exposure types signal a channel not hardened for commercial operation.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 3B: Deep Discovery Signals from Katana
//
// Governance gates:
// - CONFIDENCE_FLOOR: avg confidence must reach 50
// - NET_NEW_MINIMUM: at least 1 net-new discovery required
// - COMMERCIAL_REQUIRED for pricing/abuse families
// - Per-family quality gates prevent false positives
// ──────────────────────────────────────────────

function extractDeepDiscoverySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const katanaEvidence = byType.get(EvidenceType.KatanaDiscovery) || [];
  if (katanaEvidence.length === 0) return;

  const CONFIDENCE_FLOOR = 50;

  // Helper: group by discovery family
  const groupBy = (family: string) => katanaEvidence.filter(e =>
    (e.payload as KatanaDiscoveryPayload).discovery_family === family,
  );
  const avgConfidence = (matches: Evidence[]) =>
    matches.length === 0 ? 0 : Math.round(matches.reduce((s, e) =>
      s + (e.payload as KatanaDiscoveryPayload).confidence, 0) / matches.length,
    );
  const netNewCount = (matches: Evidence[]) =>
    matches.filter(e => (e.payload as KatanaDiscoveryPayload).is_net_new).length;
  const guessableCount = (matches: Evidence[]) =>
    matches.filter(e => (e.payload as KatanaDiscoveryPayload).appears_guessable).length;
  const unsafeguardedCount = (matches: Evidence[]) =>
    matches.filter(e =>
      (e.payload as KatanaDiscoveryPayload).appears_guessable &&
      !(e.payload as KatanaDiscoveryPayload).has_visible_safeguards,
    ).length;
  const commercialCount = (matches: Evidence[]) =>
    matches.filter(e => (e.payload as KatanaDiscoveryPayload).is_commercial_surface).length;
  const jsDiscoveredCount = (matches: Evidence[]) =>
    matches.filter(e =>
      (e.payload as KatanaDiscoveryPayload).discovery_method === 'js_crawl' ||
      (e.payload as KatanaDiscoveryPayload).discovery_method === 'dynamic_route',
    ).length;

  // ── pricing_control family ──
  const pricingMatches = groupBy('pricing_control');
  if (pricingMatches.length > 0) {
    const conf = avgConfidence(pricingMatches);
    const netNew = netNewCount(pricingMatches);
    const guessable = guessableCount(pricingMatches);

    // Gate: must have net-new AND (commercial surface OR guessable) AND confidence floor
    if (conf >= CONFIDENCE_FLOOR && netNew >= 1 && (commercialCount(pricingMatches) >= 1 || guessable >= 1)) {
      const severity = guessable >= 2 && unsafeguardedCount(pricingMatches) >= 1 ? 'high' : netNew >= 2 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'promotion_logic_abuse_exposure',
        category: SignalCategory.Revenue,
        attribute: 'deep_discovery.pricing_control',
        value: severity,
        numeric_value: pricingMatches.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: pricingMatches.map(e => makeRef('evidence', e.id)),
        description: `${pricingMatches.length} promotion/discount/coupon routes discovered through deep crawl (${netNew} net-new, ${guessable} guessable). Discount logic is structurally exposed to enumeration or manipulation.`,
        ids,
      }));
    }
  }

  // ── commerce_variant family — cart variants ──
  const commerceVariants = groupBy('commerce_variant');
  const cartVariants = commerceVariants.filter(e =>
    (e.payload as KatanaDiscoveryPayload).route_intent === 'cart' ||
    (e.payload as KatanaDiscoveryPayload).route_intent === 'checkout',
  );
  if (cartVariants.length >= 2) {
    const conf = avgConfidence(cartVariants);
    const netNew = netNewCount(cartVariants);

    // Gate: 2+ cart/checkout variants with at least 1 net-new
    if (conf >= CONFIDENCE_FLOOR && netNew >= 1) {
      const severity = netNew >= 3 ? 'high' : netNew >= 2 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'cart_variant_weak_pricing_control',
        category: SignalCategory.Revenue,
        attribute: 'deep_discovery.cart_variants',
        value: severity,
        numeric_value: cartVariants.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: cartVariants.map(e => makeRef('evidence', e.id)),
        description: `${cartVariants.length} cart/checkout route variants discovered (${netNew} net-new). Multiple cart paths increase the risk of weaker pricing controls on alternate variants.`,
        ids,
      }));
    }
  }

  // ── pricing_control + refund_return — hidden discount/refund routes ──
  const refundAbuse = groupBy('business_logic_abuse').filter(e =>
    (e.payload as KatanaDiscoveryPayload).route_intent === 'refund_return',
  );
  const discountRoutes = pricingMatches.filter(e =>
    (e.payload as KatanaDiscoveryPayload).route_intent === 'coupon_discount',
  );
  const hiddenSafeguardRoutes = [...refundAbuse, ...discountRoutes];
  if (hiddenSafeguardRoutes.length >= 1) {
    const conf = avgConfidence(hiddenSafeguardRoutes);
    const netNew = netNewCount(hiddenSafeguardRoutes);
    const weakly = unsafeguardedCount(hiddenSafeguardRoutes);

    // Gate: at least 1 net-new + confidence floor
    if (conf >= CONFIDENCE_FLOOR && netNew >= 1) {
      const severity = weakly >= 2 ? 'high' : weakly >= 1 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'hidden_discount_refund_weakness',
        category: SignalCategory.Revenue,
        attribute: 'deep_discovery.hidden_safeguard_routes',
        value: severity,
        numeric_value: hiddenSafeguardRoutes.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: hiddenSafeguardRoutes.map(e => makeRef('evidence', e.id)),
        description: `${hiddenSafeguardRoutes.length} discount/refund routes discovered outside the expected safeguard envelope (${netNew} net-new, ${weakly} without visible safeguards).`,
        ids,
      }));
    }
  }

  // ── business_logic_abuse family — guessable business endpoints ──
  const abuseMatches = groupBy('business_logic_abuse');
  if (abuseMatches.length > 0) {
    const conf = avgConfidence(abuseMatches);
    const guessable = guessableCount(abuseMatches);
    const weakly = unsafeguardedCount(abuseMatches);

    // Gate: at least 1 guessable/unsafeguarded OR 2+ total + confidence floor
    if (conf >= CONFIDENCE_FLOOR && (weakly >= 1 || abuseMatches.length >= 2)) {
      const severity = weakly >= 3 ? 'high' : weakly >= 1 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'guessable_business_endpoint_exposure',
        category: SignalCategory.Operational,
        attribute: 'deep_discovery.guessable_endpoints',
        value: severity,
        numeric_value: abuseMatches.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: abuseMatches.map(e => makeRef('evidence', e.id)),
        description: `${abuseMatches.length} business-critical endpoints discovered through deep crawl (${guessable} guessable, ${weakly} without visible safeguards). Commerce actions are more discoverable than their business importance warrants.`,
        ids,
      }));
    }
  }

  // ── safeguard_bypass family — alternate pricing safeguard bypass ──
  const bypassMatches = groupBy('safeguard_bypass');
  if (bypassMatches.length >= 1) {
    const conf = avgConfidence(bypassMatches);
    const netNew = netNewCount(bypassMatches);
    const commercial = commercialCount(bypassMatches);

    // Gate: net-new + commercial or 2+ total + confidence floor
    if (conf >= CONFIDENCE_FLOOR && (netNew >= 1 && commercial >= 1 || bypassMatches.length >= 2)) {
      const severity = netNew >= 2 && commercial >= 1 ? 'high' : netNew >= 1 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'alternate_pricing_safeguard_bypass',
        category: SignalCategory.Revenue,
        attribute: 'deep_discovery.safeguard_bypass',
        value: severity,
        numeric_value: bypassMatches.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: bypassMatches.map(e => makeRef('evidence', e.id)),
        description: `${bypassMatches.length} alternate commercial actions discovered that may bypass intended pricing safeguards (${netNew} net-new, ${commercial} on commercial surfaces).`,
        ids,
      }));
    }
  }

  // ── commerce_variant family — JS-discovered purchase variants ──
  const jsVariants = commerceVariants.filter(e =>
    (e.payload as KatanaDiscoveryPayload).discovery_method === 'js_crawl' ||
    (e.payload as KatanaDiscoveryPayload).discovery_method === 'dynamic_route',
  );
  if (jsVariants.length >= 1) {
    const conf = avgConfidence(jsVariants);
    const netNew = netNewCount(jsVariants);

    // Gate: at least 1 net-new JS-discovered + confidence floor
    if (conf >= CONFIDENCE_FLOOR && netNew >= 1) {
      const severity = netNew >= 3 ? 'high' : netNew >= 2 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'js_discovered_purchase_variant',
        category: SignalCategory.Revenue,
        attribute: 'deep_discovery.js_commerce_variants',
        value: severity,
        numeric_value: jsVariants.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: jsVariants.map(e => makeRef('evidence', e.id)),
        description: `${jsVariants.length} JavaScript-discovered commerce routes found (${netNew} net-new). Client-side route variants may operate outside the main safeguard and measurement model.`,
        ids,
      }));
    }
  }

  // ── Dynamic route weakness — all families, weak governance ──
  const allDiscoveries = katanaEvidence;
  const allUnsafeguarded = unsafeguardedCount(allDiscoveries);
  const allJsDiscovered = jsDiscoveredCount(allDiscoveries);

  if (allJsDiscovered >= 2 && allUnsafeguarded >= 1) {
    const conf = avgConfidence(allDiscoveries);
    if (conf >= CONFIDENCE_FLOOR) {
      const severity = allUnsafeguarded >= 3 ? 'high' : allUnsafeguarded >= 2 ? 'medium' : 'low';
      signals.push(createSignal({
        signal_key: 'dynamic_route_weak_governance',
        category: SignalCategory.Operational,
        attribute: 'deep_discovery.dynamic_route_weakness',
        value: severity,
        numeric_value: allJsDiscovered,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: allDiscoveries.slice(0, 10).map(e => makeRef('evidence', e.id)),
        description: `${allJsDiscovered} dynamically discovered routes with ${allUnsafeguarded} lacking visible safeguards. Commerce logic discovered through deep crawling is structurally weaker than the visible purchase flow.`,
        ids,
      }));
    }
  }

  // ── support_burden family — hidden support actions ──
  const supportMatches = groupBy('support_burden');
  if (supportMatches.length >= 2) {
    const conf = avgConfidence(supportMatches);
    const netNew = netNewCount(supportMatches);

    // Gate: 2+ support routes with at least 1 net-new + confidence floor
    if (conf >= CONFIDENCE_FLOOR && netNew >= 1) {
      const severity = netNew >= 3 ? 'medium' : 'low'; // support burden is inherently medium severity
      signals.push(createSignal({
        signal_key: 'hidden_support_burden_exposure',
        category: SignalCategory.Support,
        attribute: 'deep_discovery.support_burden',
        value: severity,
        numeric_value: supportMatches.length,
        confidence: conf,
        scoping, cycle_ref,
        evidence_refs: supportMatches.map(e => makeRef('evidence', e.id)),
        description: `${supportMatches.length} support/help routes structurally separated from the commercial journey (${netNew} not linked from purchase paths). Hidden support creates downstream burden instead of reducing buyer hesitation.`,
        ids,
      }));
    }
  }

  // ── Compound: alternate variant control breakdown ──
  // Fires when BOTH pricing control AND commerce variant signals exist
  const hasPricingSignal = pricingMatches.length > 0 && avgConfidence(pricingMatches) >= CONFIDENCE_FLOOR && netNewCount(pricingMatches) >= 1;
  const hasVariantSignal = commerceVariants.length >= 2 && avgConfidence(commerceVariants) >= CONFIDENCE_FLOOR && netNewCount(commerceVariants) >= 1;
  if (hasPricingSignal && hasVariantSignal) {
    const allEvidence = [...pricingMatches, ...commerceVariants];
    const conf = avgConfidence(allEvidence);
    if (conf >= CONFIDENCE_FLOOR) {
      signals.push(createSignal({
        signal_key: 'alternate_variant_control_breakdown',
        category: SignalCategory.Revenue,
        attribute: 'deep_discovery.compound_control_breakdown',
        value: 'high',
        numeric_value: allEvidence.length,
        confidence: Math.min(conf, 85), // conservative on compound
        scoping, cycle_ref,
        evidence_refs: allEvidence.slice(0, 10).map(e => makeRef('evidence', e.id)),
        description: `Both pricing control exposure (${pricingMatches.length} routes) and commerce variants (${commerceVariants.length} routes) detected. Trust, measurement, and pricing controls break apart on alternate commerce variants.`,
        ids,
      }));
    }
  }

  // ── Compound: deep commerce exploitation risk ──
  // Fires when business_logic_abuse + safeguard_bypass both present
  // with unsafeguarded endpoints on commercial surfaces
  const hasAbuseSignal = abuseMatches.length > 0 && avgConfidence(abuseMatches) >= CONFIDENCE_FLOOR && unsafeguardedCount(abuseMatches) >= 1;
  const hasBypassSignal = bypassMatches.length >= 1 && avgConfidence(bypassMatches) >= CONFIDENCE_FLOOR;
  const hasDeepExploitRisk = hasAbuseSignal && (hasBypassSignal || unsafeguardedCount(abuseMatches) >= 2);
  if (hasDeepExploitRisk) {
    const allEvidence = [...abuseMatches, ...bypassMatches];
    const conf = avgConfidence(allEvidence);
    const totalUnsafe = unsafeguardedCount(allEvidence);
    if (conf >= CONFIDENCE_FLOOR) {
      signals.push(createSignal({
        signal_key: 'deep_commerce_exploitation_risk',
        category: SignalCategory.Operational,
        attribute: 'deep_discovery.compound_exploitation',
        value: totalUnsafe >= 3 ? 'high' : 'medium',
        numeric_value: allEvidence.length,
        confidence: Math.min(conf, 85),
        scoping, cycle_ref,
        evidence_refs: allEvidence.slice(0, 10).map(e => makeRef('evidence', e.id)),
        description: `${allEvidence.length} deeply reachable commerce surfaces with ${totalUnsafe} lacking safeguards. Business-logic abuse endpoints and safeguard bypass routes compound to make deep commerce surfaces easier to exploit than the primary flow.`,
        ids,
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Phase 2D: Network Analysis Signals
//
// Translates runtime network evidence into
// business-grade signals about conversion,
// trust, measurement, and mobile weakness.
//
// Governance gates:
// - COMMERCIAL_SURFACE_REQUIRED for most signals
// - MIN_PROBLEM_COUNT prevents single-event noise
// - Comparative thresholds for "slower than rest"
// - Mobile signals require mobile viewport evidence
// ──────────────────────────────────────────────

function extractNetworkAnalysisSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const networkEvidence = byType.get(EvidenceType.NetworkAnalysis) || [];
  if (networkEvidence.length === 0) return;

  // Separate desktop vs mobile evidence
  const desktopEvidence: Evidence[] = [];
  const mobileEvidence: Evidence[] = [];
  const commercialEvidence: Evidence[] = [];

  for (const ev of networkEvidence) {
    const p = ev.payload as NetworkAnalysisPayload;
    if (p.viewport === 'mobile') mobileEvidence.push(ev);
    else desktopEvidence.push(ev);
    if (p.is_commercial_surface) commercialEvidence.push(ev);
  }

  const allRefs = networkEvidence.map(e => makeRef('evidence', e.id));

  // ── 1. Checkout API latency ──
  const paymentSlowEvidence = networkEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.is_commercial_surface && p.payment_slowest_ms > 3000;
  });
  if (paymentSlowEvidence.length >= 1) {
    const worst = paymentSlowEvidence.reduce((max, e) =>
      (e.payload as NetworkAnalysisPayload).payment_slowest_ms > (max.payload as NetworkAnalysisPayload).payment_slowest_ms ? e : max,
    );
    const worstMs = (worst.payload as NetworkAnalysisPayload).payment_slowest_ms;
    const severity = worstMs > 8000 ? 'high' : worstMs > 5000 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'checkout_api_latency_degrading',
      category: SignalCategory.Friction,
      attribute: 'network.checkout_api_latency',
      value: severity,
      numeric_value: worstMs,
      confidence: 70,
      scoping, cycle_ref, ids,
      evidence_refs: paymentSlowEvidence.map(e => makeRef('evidence', e.id)),
      description: `Payment-critical API responses taking ${worstMs}ms on commercial surfaces. Checkout latency above 3s degrades purchase completion progressively.`,
    }));
  }

  // ── 2. Commercial pages slower than rest ──
  if (networkEvidence.length >= 3) {
    const commercialDurations = commercialEvidence
      .map(e => (e.payload as NetworkAnalysisPayload).slowest_critical_request_ms)
      .filter(d => d > 0);
    const nonCommercialDurations = networkEvidence
      .filter(e => !(e.payload as NetworkAnalysisPayload).is_commercial_surface)
      .map(e => (e.payload as NetworkAnalysisPayload).slowest_critical_request_ms)
      .filter(d => d > 0);

    if (commercialDurations.length >= 1 && nonCommercialDurations.length >= 1) {
      const avgCommercial = commercialDurations.reduce((s, d) => s + d, 0) / commercialDurations.length;
      const avgNonCommercial = nonCommercialDurations.reduce((s, d) => s + d, 0) / nonCommercialDurations.length;
      const ratio = avgCommercial / Math.max(avgNonCommercial, 1);
      if (ratio > 1.5 && avgCommercial > 2000) {
        const severity = ratio > 3 ? 'high' : ratio > 2 ? 'medium' : 'low';
        signals.push(createSignal({
          signal_key: 'commercial_pages_disproportionately_slow',
          category: SignalCategory.Friction,
          attribute: 'network.commercial_slow_ratio',
          value: severity,
          numeric_value: Math.round(ratio * 100),
          confidence: 65,
          scoping, cycle_ref, ids,
          evidence_refs: commercialEvidence.slice(0, 5).map(e => makeRef('evidence', e.id)),
          description: `Commercial pages are ${ratio.toFixed(1)}x slower than the rest of the site (${Math.round(avgCommercial)}ms vs ${Math.round(avgNonCommercial)}ms). The pages that generate revenue are disproportionately slow.`,
        }));
      }
    }
  }

  // ── 3. Paid landing overloaded ──
  const heavyLandings = networkEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.third_party_total_weight_ms > 8000 && p.total_third_party > 15;
  });
  if (heavyLandings.length >= 1) {
    const worst = heavyLandings[0].payload as NetworkAnalysisPayload;
    const severity = worst.third_party_total_weight_ms > 15000 ? 'high' : 'medium';
    signals.push(createSignal({
      signal_key: 'paid_landing_overloaded',
      category: SignalCategory.Friction,
      attribute: 'network.landing_overloaded',
      value: severity,
      numeric_value: worst.total_third_party,
      confidence: 65,
      scoping, cycle_ref, ids,
      evidence_refs: heavyLandings.map(e => makeRef('evidence', e.id)),
      description: `Landing page loads ${worst.total_third_party} third-party requests totaling ${worst.third_party_total_weight_ms}ms. Paid traffic is hitting a heavy runtime before buyers reach the first meaningful action.`,
    }));
  }

  // ── 4. Third-party weight delaying trust/intent ──
  const thirdPartyHeavy = commercialEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.third_party_total_weight_ms > 5000 && p.total_third_party > 10;
  });
  if (thirdPartyHeavy.length >= 1) {
    const p = thirdPartyHeavy[0].payload as NetworkAnalysisPayload;
    signals.push(createSignal({
      signal_key: 'third_party_weight_delays_trust',
      category: SignalCategory.Trust,
      attribute: 'network.third_party_weight',
      value: p.third_party_total_weight_ms > 10000 ? 'high' : 'medium',
      numeric_value: p.third_party_total_weight_ms,
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: thirdPartyHeavy.map(e => makeRef('evidence', e.id)),
      description: `${p.total_third_party} third-party requests on commercial surfaces adding ${p.third_party_total_weight_ms}ms of dependency weight. Non-essential external chains delay the moment of trust and buyer intent.`,
    }));
  }

  // ── 5. Checkout depends on brittle third-party services ──
  const brittleCheckout = commercialEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.payment_requests_failed > 0 || p.third_party_failed >= 2;
  });
  if (brittleCheckout.length >= 1) {
    const totalPaymentFails = brittleCheckout.reduce((s, e) => s + (e.payload as NetworkAnalysisPayload).payment_requests_failed, 0);
    const totalThirdPartyFails = brittleCheckout.reduce((s, e) => s + (e.payload as NetworkAnalysisPayload).third_party_failed, 0);
    const severity = totalPaymentFails > 0 ? 'high' : totalThirdPartyFails >= 3 ? 'high' : 'medium';
    signals.push(createSignal({
      signal_key: 'checkout_brittle_third_party',
      category: SignalCategory.Operational,
      attribute: 'network.checkout_brittle_deps',
      value: severity,
      numeric_value: totalPaymentFails + totalThirdPartyFails,
      confidence: 70,
      scoping, cycle_ref, ids,
      evidence_refs: brittleCheckout.map(e => makeRef('evidence', e.id)),
      description: `${totalPaymentFails} payment and ${totalThirdPartyFails} third-party request failures on checkout surfaces. Purchase completion depends on unstable external services.`,
    }));
  }

  // ── 6. Purchase flow blocked by failing requests ──
  const purchaseBlocked = commercialEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.payment_failures > 0 || (p.commerce_content_failed > 0 && p.is_commercial_surface);
  });
  if (purchaseBlocked.length >= 1) {
    const totalFails = purchaseBlocked.reduce((s, e) => {
      const p = e.payload as NetworkAnalysisPayload;
      return s + p.payment_failures + p.commerce_content_failed;
    }, 0);
    signals.push(createSignal({
      signal_key: 'purchase_flow_blocked_by_failures',
      category: SignalCategory.Friction,
      attribute: 'network.purchase_blocked',
      value: 'high',
      numeric_value: totalFails,
      confidence: 75,
      scoping, cycle_ref, ids,
      evidence_refs: purchaseBlocked.map(e => makeRef('evidence', e.id)),
      description: `${totalFails} payment or commerce request failures detected on purchase surfaces. Buyers are actively blocked from completing transactions by failing requests.`,
    }));
  }

  // ── 8. Measurement breaks on revenue path ──
  const measurementBreaks = commercialEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.measurement_requests_failed > 0 && p.is_commercial_surface;
  });
  if (measurementBreaks.length >= 1) {
    const totalFails = measurementBreaks.reduce((s, e) => s + (e.payload as NetworkAnalysisPayload).measurement_requests_failed, 0);
    signals.push(createSignal({
      signal_key: 'measurement_breaks_on_revenue_path',
      category: SignalCategory.Measurement,
      attribute: 'network.measurement_revenue_break',
      value: totalFails >= 3 ? 'high' : 'medium',
      numeric_value: totalFails,
      confidence: 70,
      scoping, cycle_ref, ids,
      evidence_refs: measurementBreaks.map(e => makeRef('evidence', e.id)),
      description: `${totalFails} measurement/analytics request failures on revenue-generating pages. Conversion data is silently dropping on the surfaces that matter most.`,
    }));
  }

  // ── 9. Buyers reach purchase before deps ready ──
  const depsNotReady = commercialEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return (p.payment_slowest_ms > 5000 || p.trust_latest_start_ms > 5000) && p.is_commercial_surface;
  });
  if (depsNotReady.length >= 1) {
    const worst = depsNotReady[0].payload as NetworkAnalysisPayload;
    const lateMs = Math.max(worst.payment_slowest_ms, worst.trust_latest_start_ms);
    signals.push(createSignal({
      signal_key: 'purchase_before_deps_ready',
      category: SignalCategory.Friction,
      attribute: 'network.deps_not_ready',
      value: lateMs > 8000 ? 'high' : 'medium',
      numeric_value: lateMs,
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: depsNotReady.map(e => makeRef('evidence', e.id)),
      description: `Critical payment or trust dependencies take ${lateMs}ms to become available. Buyers can reach the purchase moment before essential services are ready.`,
    }));
  }

  // ── 10. Trust/reassurance assets late load ──
  const trustLate = commercialEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.trust_latest_start_ms > 5000 && p.trust_requests_total > 0;
  });
  if (trustLate.length >= 1) {
    const worst = trustLate[0].payload as NetworkAnalysisPayload;
    signals.push(createSignal({
      signal_key: 'trust_assets_late_load',
      category: SignalCategory.Trust,
      attribute: 'network.trust_late_load',
      value: worst.trust_latest_start_ms > 8000 ? 'high' : 'medium',
      numeric_value: worst.trust_latest_start_ms,
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: trustLate.map(e => makeRef('evidence', e.id)),
      description: `Trust and reassurance assets (support widgets, review badges, chat) start loading ${worst.trust_latest_start_ms}ms after page load. Buyers face hesitation before reassurance arrives.`,
    }));
  }

  // ── 11. Mobile heavy runtime chain ──
  const mobileHeavy = mobileEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.is_commercial_surface && (p.third_party_total_weight_ms > 6000 || p.total_third_party > 15);
  });
  if (mobileHeavy.length >= 1) {
    const worst = mobileHeavy[0].payload as NetworkAnalysisPayload;
    // Compare to desktop if available
    const desktopCommercial = desktopEvidence.find(e => (e.payload as NetworkAnalysisPayload).is_commercial_surface);
    const desktopWeight = desktopCommercial ? (desktopCommercial.payload as NetworkAnalysisPayload).third_party_total_weight_ms : null;
    const mobileWorse = desktopWeight !== null && worst.third_party_total_weight_ms > desktopWeight * 1.3;
    const severity = mobileWorse ? 'high' : worst.third_party_total_weight_ms > 10000 ? 'high' : 'medium';
    signals.push(createSignal({
      signal_key: 'mobile_heavy_runtime_chain',
      category: SignalCategory.Friction,
      attribute: 'network.mobile_heavy_runtime',
      value: severity,
      numeric_value: worst.third_party_total_weight_ms,
      confidence: 65,
      scoping, cycle_ref, ids,
      evidence_refs: mobileHeavy.map(e => makeRef('evidence', e.id)),
      description: `Mobile commerce path loaded ${worst.total_third_party} third-party requests totaling ${worst.third_party_total_weight_ms}ms dependency weight${mobileWorse ? ' — heavier than desktop' : ''}. Media spend is landing into a mobile experience that cannot convert efficiently.`,
    }));
  }

  // ── 13. Support/payment/trust deps fail on mobile ──
  const mobileFailing = mobileEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.is_commercial_surface && (p.payment_requests_failed > 0 || p.trust_requests_failed > 0 || p.measurement_requests_failed > 0);
  });
  if (mobileFailing.length >= 1) {
    const totalFails = mobileFailing.reduce((s, e) => {
      const p = e.payload as NetworkAnalysisPayload;
      return s + p.payment_requests_failed + p.trust_requests_failed + p.measurement_requests_failed;
    }, 0);
    signals.push(createSignal({
      signal_key: 'mobile_critical_deps_failing',
      category: SignalCategory.Friction,
      attribute: 'network.mobile_deps_failing',
      value: totalFails >= 3 ? 'high' : 'medium',
      numeric_value: totalFails,
      confidence: 70,
      scoping, cycle_ref, ids,
      evidence_refs: mobileFailing.map(e => makeRef('evidence', e.id)),
      description: `${totalFails} critical dependency failures (payment, trust, measurement) on mobile commercial surfaces. Mobile buyers face a weaker operational environment than desktop.`,
    }));
  }

  // ── 15. Trust-critical surfaces rely on unstable deps ──
  const unstableTrust = networkEvidence.filter(e => {
    const p = e.payload as NetworkAnalysisPayload;
    return p.trust_requests_failed > 0 || (p.third_party_failures > 0 && p.trust_requests_total > 0);
  });
  if (unstableTrust.length >= 1) {
    const totalTrustFails = unstableTrust.reduce((s, e) => s + (e.payload as NetworkAnalysisPayload).trust_requests_failed, 0);
    const totalThirdPartyFails = unstableTrust.reduce((s, e) => s + (e.payload as NetworkAnalysisPayload).third_party_failures, 0);
    signals.push(createSignal({
      signal_key: 'trust_surfaces_unstable_deps',
      category: SignalCategory.Trust,
      attribute: 'network.trust_unstable_deps',
      value: totalTrustFails >= 2 ? 'high' : 'medium',
      numeric_value: totalTrustFails + totalThirdPartyFails,
      confidence: 65,
      scoping, cycle_ref, ids,
      evidence_refs: unstableTrust.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${totalTrustFails} trust-layer and ${totalThirdPartyFails} third-party failures on surfaces that need to make buyers feel safe. Support widgets, review badges, and trust signals depend on unstable external services.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 3E: Discoverability Signals
//
// Extracts demand-capture and representation quality
// signals from EXISTING evidence (PageContent, Meta,
// StructuredData, Link). No new collectors needed.
//
// Gates:
// - Commercial surface required for most signals
// - Minimum page count to avoid low-evidence noise
// - Compound conditions for weak signals
// ──────────────────────────────────────────────

function extractDiscoverabilitySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const metas = byType.get(EvidenceType.Meta) || [];
  const structuredData = byType.get(EvidenceType.StructuredDataItem) || [];
  const links = byType.get(EvidenceType.Link) || [];

  if (pages.length < 3) return; // need meaningful crawl depth

  const COMMERCIAL_PATTERN = /checkout|cart|pay|payment|billing|order|purchase|pricing|product|comprar|pedido|carrinho|carrito|precos|tienda/i;

  const commercialPages = pages.filter(e => COMMERCIAL_PATTERN.test((e.payload as PageContentPayload).url));
  if (commercialPages.length === 0) return; // discoverability only fires with commercial intent

  // ── 1. Weak search representation on commercial pages ──
  const weakSearchPages = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    const missingTitle = !p.title || p.title.length < 10;
    const missingDesc = !p.meta_description || p.meta_description.length < 30;
    return missingTitle || missingDesc;
  });

  if (weakSearchPages.length >= 1) {
    const ratio = weakSearchPages.length / commercialPages.length;
    const severity = ratio > 0.5 ? 'high' : ratio > 0.25 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'commercial_pages_weak_search_representation',
      category: SignalCategory.Discoverability,
      attribute: 'discoverability.weak_search_representation',
      value: severity,
      numeric_value: weakSearchPages.length,
      confidence: 70,
      scoping, cycle_ref, ids,
      evidence_refs: weakSearchPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${weakSearchPages.length} of ${commercialPages.length} commercial pages have missing or thin title/description. Search engines and AI systems cannot properly represent these pages in results.`,
    }));
  }

  // ── 2. Weak social previews ──
  const metasByUrl = new Map<string, Evidence>();
  for (const m of metas) metasByUrl.set((m.payload as MetaPayload).page_url, m);

  const weakSocialPages = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    const meta = metasByUrl.get(p.url);
    if (!meta) return true;
    const og = (meta.payload as MetaPayload).og_tags || {};
    return !og['og:title'] || !og['og:description'] || !og['og:image'];
  });

  if (weakSocialPages.length >= 2) {
    const ratio = weakSocialPages.length / commercialPages.length;
    const severity = ratio > 0.6 ? 'high' : ratio > 0.3 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'social_previews_fail_commercial_value',
      category: SignalCategory.Discoverability,
      attribute: 'discoverability.weak_social_preview',
      value: severity,
      numeric_value: weakSocialPages.length,
      confidence: 65,
      scoping, cycle_ref, ids,
      evidence_refs: weakSocialPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${weakSocialPages.length} commercial pages lack Open Graph tags for social sharing. Shared links appear as raw URLs without product images, titles, or descriptions.`,
    }));
  }

  // ── 3. Inconsistent brand representation ──
  const titles = commercialPages
    .map(e => (e.payload as PageContentPayload).title)
    .filter((t): t is string => !!t && t.length > 3);

  if (titles.length >= 3) {
    // Check if titles share a consistent brand pattern (common word/phrase)
    const wordFreq = new Map<string, number>();
    for (const t of titles) {
      const words = t.toLowerCase().split(/[\s|—–\-:]+/).filter(w => w.length > 3);
      const seen = new Set<string>();
      for (const w of words) {
        if (!seen.has(w)) { wordFreq.set(w, (wordFreq.get(w) || 0) + 1); seen.add(w); }
      }
    }
    const brandWord = [...wordFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    const brandConsistency = brandWord ? brandWord[1] / titles.length : 0;

    if (brandConsistency < 0.4 && titles.length >= 4) {
      signals.push(createSignal({
        signal_key: 'brand_inconsistent_across_surfaces',
        category: SignalCategory.Discoverability,
        attribute: 'discoverability.brand_inconsistency',
        value: brandConsistency < 0.2 ? 'high' : 'medium',
        confidence: 55,
        scoping, cycle_ref, ids,
        evidence_refs: commercialPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
        description: `Commercial page titles show low brand consistency (${Math.round(brandConsistency * 100)}%). Brand appears inconsistently across search and sharing surfaces.`,
      }));
    }
  }

  // ── 4. Commercial pages unlikely to be reliably indexed ──
  const noCanonical = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    return !p.canonical_url;
  });
  // Check for noindex in meta
  const noindexPages = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    const meta = metasByUrl.get(p.url);
    if (!meta) return false;
    const robots = (meta.payload as MetaPayload).robots;
    return robots && /noindex/i.test(robots);
  });

  const indexingProblems = noCanonical.length + noindexPages.length;
  if (indexingProblems >= 2) {
    const severity = noindexPages.length > 0 ? 'high' : indexingProblems > 3 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'commercial_pages_unlikely_indexed',
      category: SignalCategory.Discoverability,
      attribute: 'discoverability.indexing_risk',
      value: severity,
      numeric_value: indexingProblems,
      confidence: 65,
      scoping, cycle_ref, ids,
      evidence_refs: [...noCanonical, ...noindexPages].slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${indexingProblems} commercial pages have indexing problems (${noCanonical.length} missing canonical, ${noindexPages.length} marked noindex). Revenue-generating pages may be invisible to search.`,
    }));
  }

  // ── 5. Weak semantic intent signals ──
  const commercialStructuredData = structuredData.filter(e =>
    (e.payload as StructuredDataItemPayload).is_commerce_signal,
  );
  const hasProductSchema = commercialStructuredData.some(e =>
    (e.payload as StructuredDataItemPayload).schema_type === 'Product',
  );
  const hasOrgSchema = structuredData.some(e =>
    (e.payload as StructuredDataItemPayload).schema_type === 'Organization',
  );

  if (!hasProductSchema && commercialPages.length >= 2) {
    signals.push(createSignal({
      signal_key: 'weak_semantic_intent_signals',
      category: SignalCategory.Discoverability,
      attribute: 'discoverability.weak_semantic_signals',
      value: !hasOrgSchema ? 'high' : 'medium',
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: commercialPages.slice(0, 3).map(e => makeRef('evidence', e.id)),
      description: `Commercial pages lack structured data that helps search engines and AI understand page purpose. No Product schema found${!hasOrgSchema ? ', no Organization schema either' : ''}.`,
    }));
  }

  // ── 6. Preview disconnected from conversion ──
  const previewMismatch = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    const meta = metasByUrl.get(p.url);
    if (!meta || !p.title) return false;
    const og = (meta.payload as MetaPayload).og_tags || {};
    const ogTitle = og['og:title'];
    if (!ogTitle) return false;
    // Check if OG title substantially differs from page title
    const similarity = simpleWordOverlap(p.title, ogTitle);
    return similarity < 0.3;
  });

  if (previewMismatch.length >= 2) {
    signals.push(createSignal({
      signal_key: 'previews_disconnected_from_conversion',
      category: SignalCategory.Discoverability,
      attribute: 'discoverability.preview_mismatch',
      value: previewMismatch.length >= 4 ? 'high' : 'medium',
      numeric_value: previewMismatch.length,
      confidence: 55,
      scoping, cycle_ref, ids,
      evidence_refs: previewMismatch.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${previewMismatch.length} commercial pages have social/search previews that don't match the actual page content. Visitors arrive with mismatched expectations.`,
    }));
  }

  // ── 7. Commercial pages not structurally exposed ──
  const linksByTarget = new Map<string, number>();
  for (const l of links) {
    const p = l.payload as LinkPayload;
    if (!p.is_external) {
      const count = linksByTarget.get(p.href) || 0;
      linksByTarget.set(p.href, count + 1);
    }
  }

  const orphanedCommercial = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    const inboundCount = linksByTarget.get(p.url) || 0;
    return inboundCount === 0;
  });

  if (orphanedCommercial.length >= 2) {
    const ratio = orphanedCommercial.length / commercialPages.length;
    const severity = ratio > 0.5 ? 'high' : ratio > 0.25 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'commercial_pages_not_exposed_for_discovery',
      category: SignalCategory.Discoverability,
      attribute: 'discoverability.pages_not_exposed',
      value: severity,
      numeric_value: orphanedCommercial.length,
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: orphanedCommercial.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${orphanedCommercial.length} commercial pages have zero internal links pointing to them. Search crawlers and users cannot reach these pages through normal navigation.`,
    }));
  }
}

function simpleWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

// ──────────────────────────────────────────────
// Phase 3E: Brand Integrity Signals
//
// Translates brand impersonation evidence into
// business-grade signals about traffic interception,
// fraud risk, and brand dilution.
//
// Gates:
// - Minimum confidence score required
// - Active domain required for high-severity signals
// - Commerce signals boost confidence
// ──────────────────────────────────────────────

function extractBrandIntegritySignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const brandEvidence = byType.get(EvidenceType.BrandImpersonationMatch) || [];
  if (brandEvidence.length === 0) return;

  const CONFIDENCE_FLOOR = 40;

  // ── Classify evidence by enhanced signals ──
  const active = brandEvidence.filter(e =>
    (e.payload as BrandImpersonationMatchPayload).is_active,
  );
  const highConf = active.filter(e =>
    (e.payload as BrandImpersonationMatchPayload).confidence_score >= 70,
  );
  const medConf = active.filter(e => {
    const score = (e.payload as BrandImpersonationMatchPayload).confidence_score;
    return score >= 40 && score < 70;
  });
  const withCommerce = active.filter(e => {
    const p = e.payload as BrandImpersonationMatchPayload;
    return p.has_commerce_signals || p.has_payment_capture;
  });
  const typosquats = active.filter(e =>
    (e.payload as BrandImpersonationMatchPayload).threat_type === 'typosquat',
  );
  const withCredentialCapture = active.filter(e =>
    (e.payload as BrandImpersonationMatchPayload).has_credential_capture,
  );
  const withPaymentCapture = active.filter(e =>
    (e.payload as BrandImpersonationMatchPayload).has_payment_capture,
  );
  const withSensitivePath = active.filter(e =>
    (e.payload as BrandImpersonationMatchPayload).has_sensitive_path,
  );

  // ── 1. Lookalike domains competing for traffic ──
  if (highConf.length >= 1 || medConf.length >= 3) {
    const severity = highConf.length >= 3 ? 'high' : highConf.length >= 1 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'lookalike_domains_competing',
      category: SignalCategory.BrandIntegrity,
      attribute: 'brand.lookalike_domains',
      value: severity,
      numeric_value: highConf.length + medConf.length,
      confidence: Math.min(85, 50 + highConf.length * 10),
      scoping, cycle_ref, ids,
      evidence_refs: [...highConf, ...medConf].slice(0, 10).map(e => makeRef('evidence', e.id)),
      description: `${highConf.length} high-confidence and ${medConf.length} medium-confidence lookalike domains detected. Brand traffic is exposed to interception.`,
    }));
  }

  // ── 2. External sites mimicking brand (title OR favicon match) ──
  const mimicryEvidence = active.filter(e => {
    const p = e.payload as BrandImpersonationMatchPayload;
    const hasVisualMatch = p.favicon_similarity_score !== null && p.favicon_similarity_score >= 60;
    const hasTitleMatch = p.title_similarity !== null && p.title_similarity > 50;
    return (hasVisualMatch || hasTitleMatch) && p.confidence_score >= 40;
  });
  if (mimicryEvidence.length >= 1) {
    const faviconMatches = mimicryEvidence.filter(e =>
      (e.payload as BrandImpersonationMatchPayload).favicon_similarity_score !== null &&
      (e.payload as BrandImpersonationMatchPayload).favicon_similarity_score! >= 60,
    );
    const severity = mimicryEvidence.length >= 3 ? 'high' : mimicryEvidence.length >= 2 ? 'high' : 'medium';
    signals.push(createSignal({
      signal_key: 'external_sites_mimicking_brand',
      category: SignalCategory.BrandIntegrity,
      attribute: 'brand.content_mimicry',
      value: severity,
      numeric_value: mimicryEvidence.length,
      confidence: faviconMatches.length > 0 ? 80 : 70,
      scoping, cycle_ref, ids,
      evidence_refs: mimicryEvidence.map(e => makeRef('evidence', e.id)),
      description: `${mimicryEvidence.length} external domains mimick the brand (${faviconMatches.length} with matching favicon, ${mimicryEvidence.length - faviconMatches.length} with similar titles). Active impersonation detected.`,
    }));
  }

  // ── 3. Brand traffic exposed to deceptive surfaces ──
  if (typosquats.length >= 1) {
    const hasCapture = typosquats.some(e => {
      const p = e.payload as BrandImpersonationMatchPayload;
      return p.has_credential_capture || p.has_payment_capture;
    });
    const severity = hasCapture ? 'high' : typosquats.length >= 3 ? 'high' : typosquats.length >= 2 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'brand_traffic_deceptive_surfaces',
      category: SignalCategory.BrandIntegrity,
      attribute: 'brand.deceptive_surfaces',
      value: severity,
      numeric_value: typosquats.length,
      confidence: hasCapture ? 80 : 65,
      scoping, cycle_ref, ids,
      evidence_refs: typosquats.map(e => makeRef('evidence', e.id)),
      description: `${typosquats.length} typosquat domains are active${hasCapture ? ' — some contain credential or payment capture forms' : ''}. Users who mistype the brand URL land on deceptive surfaces.`,
    }));
  }

  // ── 4. Suspicious domains capturing purchase intent ──
  // Now requires commerce signals OR payment keywords/capture, medium+ confidence
  if (withCommerce.length >= 1) {
    const withPayment = withCommerce.filter(e =>
      (e.payload as BrandImpersonationMatchPayload).has_payment_capture,
    );
    const severity = withPayment.length >= 1 ? 'high' : withCommerce.length >= 3 ? 'high' : withCommerce.length >= 2 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'suspicious_domains_purchase_intent',
      category: SignalCategory.BrandIntegrity,
      attribute: 'brand.commerce_interception',
      value: severity,
      numeric_value: withCommerce.length,
      confidence: withPayment.length > 0 ? 80 : 70,
      scoping, cycle_ref, ids,
      evidence_refs: withCommerce.map(e => makeRef('evidence', e.id)),
      description: `${withCommerce.length} lookalike domains show commerce intent${withPayment.length > 0 ? ` (${withPayment.length} with active payment capture)` : ''}. Purchase-intent traffic may be diverted to impostor storefronts.`,
    }));
  }

  // ── 5. Phishing exposure (ENHANCED) ──
  // Now requires: high confidence AND (credential_capture OR payment_capture OR sensitive_path)
  const phishingCandidates = active.filter(e => {
    const p = e.payload as BrandImpersonationMatchPayload;
    return p.confidence_score >= 70 && (p.has_credential_capture || p.has_payment_capture || p.has_sensitive_path);
  });
  // Also include: medium+ confidence with BOTH capture signals
  const strongPhishing = active.filter(e => {
    const p = e.payload as BrandImpersonationMatchPayload;
    return p.confidence_score >= 40 && (p.has_credential_capture || p.has_payment_capture) && !phishingCandidates.includes(e);
  });
  const allPhishing = [...phishingCandidates, ...strongPhishing];

  if (allPhishing.length >= 1) {
    const captureCount = allPhishing.filter(e => {
      const p = e.payload as BrandImpersonationMatchPayload;
      return p.has_credential_capture || p.has_payment_capture;
    }).length;
    const severity = captureCount >= 2 ? 'high' : captureCount >= 1 ? 'high' : 'medium';
    signals.push(createSignal({
      signal_key: 'customers_exposed_to_phishing',
      category: SignalCategory.BrandIntegrity,
      attribute: 'brand.phishing_exposure',
      value: severity,
      numeric_value: allPhishing.length,
      confidence: captureCount > 0 ? 85 : 75,
      scoping, cycle_ref, ids,
      evidence_refs: allPhishing.map(e => makeRef('evidence', e.id)),
      description: `${allPhishing.length} domains combine brand similarity with phishing patterns${captureCount > 0 ? ` — ${captureCount} actively capture credentials or payment data` : ''}. Customers are exposed to fraud through brand-mimicking surfaces.`,
    }));
  }

  // ── 6. Brand dilution across variants ──
  if (active.length >= 5) {
    const avgConfidence = Math.round(active.reduce((s, e) =>
      s + (e.payload as BrandImpersonationMatchPayload).confidence_score, 0) / active.length);
    if (avgConfidence >= CONFIDENCE_FLOOR) {
      signals.push(createSignal({
        signal_key: 'brand_diluted_across_variants',
        category: SignalCategory.BrandIntegrity,
        attribute: 'brand.dilution',
        value: active.length >= 10 ? 'high' : 'medium',
        numeric_value: active.length,
        confidence: 60,
        scoping, cycle_ref, ids,
        evidence_refs: active.slice(0, 10).map(e => makeRef('evidence', e.id)),
        description: `${active.length} active domain variants with brand similarity detected. Brand presence is fragmented across multiple surfaces, reducing search click-through and buyer trust.`,
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Phase 4B: Behavioral Intelligence Signals
//
// Translates aggregated behavioral evidence into
// business-grade signals about conversion path
// integrity, hesitation, and commercial surface health.
//
// Gates:
// - Minimum session count for statistical relevance
// - Commercial surface requirement for most signals
// - Rate thresholds to prevent noise
// ──────────────────────────────────────────────

function extractBehavioralSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const behavioralEvidence = byType.get(EvidenceType.BehavioralSession) || [];
  if (behavioralEvidence.length === 0) return;

  const MIN_SESSIONS = 20;

  // Aggregate across all behavioral evidence
  for (const ev of behavioralEvidence) {
    const p = ev.payload as BehavioralSessionPayload;
    if (p.session_count < MIN_SESSIONS) continue;

    const refs = [makeRef('evidence', ev.id)];

    // 1. Policy view then abandonment
    if (p.policy_then_abandon_count > 0 && p.policy_opened_rate > 0.05) {
      const rate = p.policy_then_abandon_count / p.session_count;
      if (rate > 0.03) {
        signals.push(createSignal({
          signal_key: 'policy_view_then_abandonment',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.policy_abandon',
          value: rate > 0.08 ? 'high' : rate > 0.05 ? 'medium' : 'low',
          numeric_value: p.policy_then_abandon_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.policy_then_abandon_count} sessions opened a policy page and then abandoned without further commercial action. Refund/return policy content is triggering doubt rather than building confidence.`,
        }));
      }
    }

    // 2. High-intent detour before abandonment
    if (p.high_intent_detour_count > 0) {
      const rate = p.high_intent_detour_count / p.session_count;
      if (rate > 0.02) {
        signals.push(createSignal({
          signal_key: 'high_intent_detour_before_abandonment',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.intent_detour',
          value: rate > 0.06 ? 'high' : rate > 0.03 ? 'medium' : 'low',
          numeric_value: p.high_intent_detour_count,
          confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.high_intent_detour_count} sessions reached checkout then detoured to reassurance content before abandoning. High-intent buyers are losing confidence at the moment of commitment.`,
        }));
      }
    }

    // 3. Support discovered too late
    if (p.support_after_checkout_count > 0 && p.support_opened_rate > 0.03) {
      const rate = p.support_after_checkout_count / p.session_count;
      if (rate > 0.02) {
        signals.push(createSignal({
          signal_key: 'support_discovered_too_late',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.support_late',
          value: rate > 0.05 ? 'high' : 'medium',
          numeric_value: p.support_after_checkout_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.support_after_checkout_count} sessions only discovered support AFTER reaching checkout. Support is being found too late to resolve pre-purchase hesitation.`,
        }));
      }
    }

    // 4. CTA visible but behaviorally dead
    if (p.dead_cta_surface_count > 0) {
      signals.push(createSignal({
        signal_key: 'cta_visible_but_dead',
        category: SignalCategory.Behavioral,
        attribute: 'behavioral.dead_cta',
        value: p.dead_cta_surface_count >= 3 ? 'high' : p.dead_cta_surface_count >= 2 ? 'medium' : 'low',
        numeric_value: p.dead_cta_surface_count,
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${p.dead_cta_surface_count} commercial surfaces have CTAs that are visible but behaviorally dead — high views with near-zero click-through.`,
      }));
    }

    // 5. Purchase hesitation with backtrack
    if (p.backtrack_rate > 0.10) {
      signals.push(createSignal({
        signal_key: 'purchase_hesitation_backtrack',
        category: SignalCategory.Behavioral,
        attribute: 'behavioral.backtrack',
        value: p.backtrack_rate > 0.20 ? 'high' : 'medium',
        numeric_value: p.backtrack_session_count,
        confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${Math.round(p.backtrack_rate * 100)}% of sessions backtrack during the purchase journey. Buyers reach a commercial step and retreat — indicating hesitation or missing trust signals.`,
      }));
    }

    // 6. Critical step retries before abandonment
    if (p.retry_then_abandon_count > 0) {
      const rate = p.retry_then_abandon_count / p.session_count;
      if (rate > 0.02) {
        signals.push(createSignal({
          signal_key: 'critical_step_retries_before_abandonment',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.retry_abandon',
          value: rate > 0.05 ? 'high' : 'medium',
          numeric_value: p.retry_then_abandon_count,
          confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.retry_then_abandon_count} sessions repeatedly retried a critical step before abandoning. Users encounter errors or confusion that blocks progression.`,
        }));
      }
    }

    // 7. Mobile fails first commercial action
    if (p.mobile_session_count > MIN_SESSIONS && p.mobile_first_action_failure_rate > 0.15) {
      signals.push(createSignal({
        signal_key: 'mobile_fails_first_commercial_action',
        category: SignalCategory.Behavioral,
        attribute: 'behavioral.mobile_first_action_fail',
        value: p.mobile_first_action_failure_rate > 0.30 ? 'high' : 'medium',
        numeric_value: Math.round(p.mobile_first_action_failure_rate * 100),
        confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${Math.round(p.mobile_first_action_failure_rate * 100)}% of mobile sessions fail to progress past the first commercial action. Mobile users face a broken or unusable entry point to the commercial flow.`,
      }));
    }

    // 8. Funnel step alive but not advancing
    if (p.stalled_step_count > 0) {
      signals.push(createSignal({
        signal_key: 'funnel_step_alive_not_advancing',
        category: SignalCategory.Behavioral,
        attribute: 'behavioral.stalled_step',
        value: p.stalled_step_count >= 3 ? 'high' : p.stalled_step_count >= 2 ? 'medium' : 'low',
        numeric_value: p.stalled_step_count,
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${p.stalled_step_count} funnel steps are alive (receiving sessions) but not advancing users to the next step. These are behavioral dead ends in the commercial flow.`,
      }));
    }

    // ── Phase 4B Hardening: 12 new behavioral signals ──

    // 9. Hesitation before conversion due to missing trust signals near CTA
    if (p.hesitation_before_cta_count > 0) {
      const rate = p.hesitation_before_cta_count / p.session_count;
      if (rate > 0.05) {
        signals.push(createSignal({
          signal_key: 'hesitation_before_conversion_missing_trust',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.hesitation_trust',
          value: rate > 0.15 ? 'high' : rate > 0.08 ? 'medium' : 'low',
          numeric_value: p.hesitation_before_cta_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.hesitation_before_cta_count} sessions show hesitation pauses before conversion CTAs on commercial surfaces. Users view the action but delay engagement — indicating insufficient trust or reassurance at the decision point.`,
        }));
      }
    }

    // 10. Pricing hesitation with unclear value justification
    // COMPOUND GATE: requires BOTH pricing hesitation AND pricing backtrack.
    // rapid_backtrack alone is never a standalone explanation — it must be paired
    // with pricing surface view + failure to advance to conversion.
    if (p.pricing_then_hesitation_count > 0 && p.pricing_backtrack_count > 0) {
      const rate = p.pricing_backtrack_count / p.session_count;
      // Additional compound gate: pricing backtracks must represent meaningful share
      // of pricing views, not just isolated navigation noise
      const pricingHesitationRate = p.pricing_then_hesitation_count / p.session_count;
      if (rate > 0.04 && pricingHesitationRate > 0.02) {
        signals.push(createSignal({
          signal_key: 'pricing_hesitation_unclear_value',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.pricing_hesitation',
          value: rate > 0.12 ? 'high' : rate > 0.06 ? 'medium' : 'low',
          numeric_value: p.pricing_backtrack_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.pricing_backtrack_count} sessions view pricing then backtrack to product or explanation pages without advancing. The price is seen but the value case is not carrying it.`,
        }));
      }
    }

    // 11. Policy detour before conversion
    if (p.policy_detour_before_conversion_count > 0) {
      const rate = p.policy_detour_before_conversion_count / p.session_count;
      if (rate > 0.03) {
        signals.push(createSignal({
          signal_key: 'policy_detour_before_conversion',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.policy_detour',
          value: rate > 0.10 ? 'high' : rate > 0.05 ? 'medium' : 'low',
          numeric_value: p.policy_detour_before_conversion_count,
          confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.policy_detour_before_conversion_count} sessions open policy pages after expressing intent but before converting. Users seek trust reassurance at the commitment moment rather than proceeding.`,
        }));
      }
    }

    // 12. CTA viewed but not engaged — calibrated by surface context
    if (p.cta_viewed_count > 0 && p.cta_clicked_count >= 0) {
      const engagementRate = p.cta_viewed_count > 0 ? p.cta_clicked_count / p.cta_viewed_count : 0;

      // Surface-aware engagement thresholds:
      // High-intent surfaces (checkout, pricing, cart) expect higher engagement → stricter threshold
      // General surfaces (homepage, landing, product) tolerate lower engagement → looser threshold
      // This prevents false positives on informational pages while catching real CTA failures
      // on pages where users arrive with purchase intent.
      const hasHighIntentSurfaces = p.checkout_reached_rate > 0.10 || p.milestone_intent_count > (p.session_count * 0.15);
      const minViews = hasHighIntentSurfaces ? 30 : 80;
      const engagementCeiling = hasHighIntentSurfaces ? 0.08 : 0.04;

      if (p.cta_viewed_count >= minViews && engagementRate < engagementCeiling) {
        // Severity also scales with surface context: low engagement on high-intent = more severe
        let value: string;
        if (hasHighIntentSurfaces) {
          value = engagementRate < 0.02 ? 'high' : engagementRate < 0.05 ? 'medium' : 'low';
        } else {
          value = engagementRate < 0.01 ? 'high' : engagementRate < 0.03 ? 'medium' : 'low';
        }
        const contextNote = hasHighIntentSurfaces
          ? 'on high-intent surfaces where users arrive with purchase motivation'
          : 'across general commercial surfaces';

        signals.push(createSignal({
          signal_key: 'cta_viewed_not_engaged',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.cta_low_engagement',
          value,
          numeric_value: Math.round(engagementRate * 10000) / 100,
          confidence: hasHighIntentSurfaces ? 70 : 60, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `Primary CTAs are viewed ${p.cta_viewed_count} times but clicked only ${p.cta_clicked_count} times (${Math.round(engagementRate * 100)}% engagement) ${contextNote}. The CTA is visible but fails to compel action — indicating weak positioning, copy, or surrounding context.`,
        }));
      }
    }

    // 13. Sensitive input abandonment — suppressed when no concrete field kind
    if (p.sensitive_input_abandon_count > 0 && p.sensitive_input_abandon_top_kinds.length > 0) {
      const rate = p.sensitive_input_abandon_count / p.session_count;
      const topKind = p.sensitive_input_abandon_top_kinds[0];
      // Require a defensible, specific field kind — not 'other'
      if (rate > 0.03 && topKind && topKind !== 'other') {
        signals.push(createSignal({
          signal_key: 'sensitive_input_abandonment',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.sensitive_input_abandon',
          // Encode severity:field_kind so inference can parameterize the title
          value: `${rate > 0.10 ? 'high' : rate > 0.05 ? 'medium' : 'low'}:${topKind}`,
          numeric_value: p.sensitive_input_abandon_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.sensitive_input_abandon_count} sessions abandon after interacting with ${topKind} input fields. Users engage with the form but drop off after encountering sensitive data requests.`,
        }));
      }
    }

    // 14. Form excessive fields before conversion
    if (p.form_excessive_field_count > 0) {
      const formStartRate = p.session_count > 0 ? (p.checkout_reached_count + p.conversion_count) / p.session_count : 0;
      if (formStartRate < 0.30 || p.form_excessive_field_count >= 2) {
        signals.push(createSignal({
          signal_key: 'form_excessive_fields_before_conversion',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.form_excessive',
          value: p.form_excessive_field_count >= 3 ? 'high' : p.form_excessive_field_count >= 2 ? 'medium' : 'low',
          numeric_value: p.form_excessive_field_count,
          confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.form_excessive_field_count} conversion-proximate forms require excessive or sensitive fields. High field count and sensitive data requests create measurable friction before conversion.`,
        }));
      }
    }

    // 15. Form submission retry friction
    if (p.form_retry_session_count > 0) {
      const rate = p.form_retry_rate;
      if (rate > 0.03) {
        signals.push(createSignal({
          signal_key: 'form_submission_retry_friction',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.form_retry',
          value: rate > 0.10 ? 'high' : rate > 0.05 ? 'medium' : 'low',
          numeric_value: p.form_retry_session_count,
          confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.form_retry_session_count} sessions retry form submission multiple times. Users re-submit without progress — indicating poor validation feedback or broken submission handling.`,
        }));
      }
    }

    // 16. Surface oscillation before dropoff — suppressed when surface pair is not concrete
    if (p.surface_oscillation_count > 0 && p.surface_oscillation_top_pairs.length > 0) {
      const rate = p.surface_oscillation_count / p.session_count;
      if (rate > 0.03) {
        const topPair = p.surface_oscillation_top_pairs[0];
        // Require both surfaces to be identifiable (not just surface IDs)
        const surfaceA = topPair.surface_a;
        const surfaceB = topPair.surface_b;
        if (surfaceA && surfaceB && surfaceA !== surfaceB) {
          signals.push(createSignal({
            signal_key: 'surface_oscillation_before_dropoff',
            category: SignalCategory.Behavioral,
            attribute: 'behavioral.surface_oscillation',
            // Encode severity:surfaceA:surfaceB so inference can parameterize the title
            value: `${rate > 0.10 ? 'high' : rate > 0.05 ? 'medium' : 'low'}:${surfaceA}:${surfaceB}`,
            numeric_value: p.surface_oscillation_count,
            confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
            description: `${p.surface_oscillation_count} sessions oscillate between ${surfaceA} and ${surfaceB} before dropping off. Back-and-forth navigation indicates an unresolved decision that neither surface addresses.`,
          }));
        }
      }
    }

    // 17. Conversion final-step retry
    if (p.conversion_retry_count > 0) {
      const rate = p.conversion_retry_count / p.session_count;
      if (rate > 0.02) {
        signals.push(createSignal({
          signal_key: 'conversion_final_step_retry',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.conversion_retry',
          value: rate > 0.08 ? 'high' : rate > 0.04 ? 'medium' : 'low',
          numeric_value: p.conversion_retry_count,
          confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.conversion_retry_count} sessions attempt conversion multiple times in the final steps. Repeated attempts without confirmation indicate friction at the moment of closure.`,
        }));
      }
    }

    // 18. CTA late availability delays action
    if (p.cta_rendered_late_count > 0) {
      if (p.cta_rendered_late_count >= 2 || (p.avg_time_to_first_commercial_action_ms && p.avg_time_to_first_commercial_action_ms > 10000)) {
        signals.push(createSignal({
          signal_key: 'cta_late_availability_delays_action',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.cta_late',
          value: p.cta_rendered_late_count >= 5 ? 'high' : p.cta_rendered_late_count >= 3 ? 'medium' : 'low',
          numeric_value: p.cta_rendered_late_count,
          confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.cta_rendered_late_count} primary CTAs render late on high-intent surfaces. Users must wait for the action to become available — delaying the first meaningful commercial action.`,
        }));
      }
    }

    // 19. Checkout abandon without feedback
    if (p.checkout_immediate_abandon_count > 0) {
      const rate = p.checkout_immediate_abandon_count / p.session_count;
      if (rate > 0.03) {
        signals.push(createSignal({
          signal_key: 'checkout_abandon_no_feedback',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.checkout_abandon',
          value: rate > 0.10 ? 'high' : rate > 0.05 ? 'medium' : 'low',
          numeric_value: p.checkout_immediate_abandon_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.checkout_immediate_abandon_count} sessions initiate checkout then abandon without any progress indication. The UI provides no immediate feedback or reassurance after the commitment action.`,
        }));
      }
    }

    // 20. Sensitive input perceived risk dropoff — suppressed when no concrete field kind
    if (p.sensitive_field_dropoff_count > 0 && p.sensitive_field_dropoff_top_kinds.length > 0) {
      const rate = p.sensitive_field_dropoff_count / p.session_count;
      const topKind = p.sensitive_field_dropoff_top_kinds[0];
      if (rate > 0.03 && topKind && topKind !== 'other') {
        signals.push(createSignal({
          signal_key: 'sensitive_input_perceived_risk_dropoff',
          category: SignalCategory.Behavioral,
          attribute: 'behavioral.sensitive_risk_dropoff',
          // Encode severity:field_kind for parameterized reasoning
          value: `${rate > 0.10 ? 'high' : rate > 0.05 ? 'medium' : 'low'}:${topKind}`,
          numeric_value: p.sensitive_field_dropoff_count,
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${p.sensitive_field_dropoff_count} sessions drop off immediately after interacting with ${topKind} fields. Users perceive risk at the sensitive data entry moment — the trust model is insufficient for the data being requested.`,
        }));
      }
    }
  }
}

// ──────────────────────────────────────────────
// Wave 3.1: Policy Enrichment Signals (from LLM content analysis)
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Wave 3.3: Security Posture Signals
//
// Detects 4 finding families using only evidence the pipeline
// already collects: HTTP response headers, scripts, forms,
// iframes, redirects, and HTTP responses on probe paths.
// ──────────────────────────────────────────────

const KNOWN_REDIRECT_PROVIDERS = new Set([
  'stripe.com', 'checkout.stripe.com', 'paypal.com', 'paypalobjects.com',
  'google.com', 'accounts.google.com', 'facebook.com', 'apple.com',
  'shopify.com', 'mercadopago.com', 'pagseguro.com.br',
]);

const SENSITIVE_FILE_PATHS = ['/.env', '/.git/config', '/backup.sql', '/database.sql', '/wp-config.php.bak', '/server-status', '/phpinfo.php'];
const ADMIN_PATHS = ['/admin', '/wp-admin', '/administrator', '/cpanel', '/phpmyadmin'];
const API_DOC_PATHS = ['/swagger', '/api-docs', '/graphql', '/docs/api'];

function secHostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}
function secIsHttps(url: string): boolean {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}
function secIsHttp(url: string): boolean {
  try { return new URL(url).protocol === 'http:'; } catch { return false; }
}
function secPathOf(url: string): string {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
}
function secIsCheckoutUrl(url: string): boolean {
  const p = secPathOf(url);
  return /(checkout|cart|payment|pay|carrinho|pagamento)/.test(p);
}
function secGetHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return undefined;
}
function secRootDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

function extractSecurityPostureSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // ── Finding A: Security Header Posture ──
  const httpResponses = byType.get(EvidenceType.HttpResponse) || [];
  if (httpResponses.length > 0) {
    const headerPresence = { hsts: 0, csp: 0, xfo: 0, xcto: 0, referrer: 0, permissions: 0 };
    let cspWeak = false;
    let pagesWithoutHsts = 0;
    let pagesWithoutCsp = 0;
    let pagesWithoutClickjack = 0;
    let totalCommercialPages = 0;
    const cspWeakUrls: string[] = [];

    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (!secIsHttps(p.url)) continue;
      if (p.status_code < 200 || p.status_code >= 400) continue;

      const hsts = secGetHeader(p.headers, 'strict-transport-security');
      const csp = secGetHeader(p.headers, 'content-security-policy');
      const xfo = secGetHeader(p.headers, 'x-frame-options');
      const xcto = secGetHeader(p.headers, 'x-content-type-options');
      const referrer = secGetHeader(p.headers, 'referrer-policy');
      const permissions = secGetHeader(p.headers, 'permissions-policy');

      if (hsts) headerPresence.hsts++;
      else pagesWithoutHsts++;

      if (csp) {
        headerPresence.csp++;
        if (/unsafe-inline|unsafe-eval/.test(csp)) {
          cspWeak = true;
          if (cspWeakUrls.length < 3) cspWeakUrls.push(p.url);
        }
      } else {
        pagesWithoutCsp++;
      }

      const hasClickjackProtection = !!xfo || (csp && /frame-ancestors/.test(csp));
      if (xfo) headerPresence.xfo++;
      if (!hasClickjackProtection) pagesWithoutClickjack++;

      if (xcto) headerPresence.xcto++;
      if (referrer) headerPresence.referrer++;
      if (permissions) headerPresence.permissions++;

      if (secIsCheckoutUrl(p.url)) totalCommercialPages++;
    }

    const httpsPages = httpResponses.filter((e) => {
      const p = e.payload as HttpResponsePayload;
      return secIsHttps(p.url) && p.status_code >= 200 && p.status_code < 400;
    }).length;

    if (httpsPages > 0) {
      // Composite score 0-100 (each header ~16 points)
      const score = Math.round(
        ((headerPresence.hsts / httpsPages) * 17) +
        ((headerPresence.csp / httpsPages) * 17) +
        ((headerPresence.xfo / httpsPages) * 17) +
        ((headerPresence.xcto / httpsPages) * 17) +
        ((headerPresence.referrer / httpsPages) * 16) +
        ((headerPresence.permissions / httpsPages) * 16)
      );
      const scoreLevel = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
      signals.push(createSignal({ ids,
        signal_key: `security_headers_score`,
        category: SignalCategory.Security,
        attribute: 'security.headers.score',
        value: scoreLevel,
        numeric_value: score,
        confidence: 90,
        scoping, cycle_ref,
        evidence_refs: httpResponses.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `Security headers composite score: ${score}/100 across ${httpsPages} HTTPS pages.`,
      }));

      if (pagesWithoutHsts > 0) {
        signals.push(createSignal({ ids,
          signal_key: `hsts_missing`,
          category: SignalCategory.Security,
          attribute: 'security.headers.hsts_missing',
          value: 'true',
          numeric_value: pagesWithoutHsts,
          confidence: 95,
          scoping, cycle_ref,
          evidence_refs: httpResponses.slice(0, 2).map((e) => makeRef('evidence', e.id)),
          description: `Strict-Transport-Security header missing on ${pagesWithoutHsts} HTTPS page(s).`,
        }));
      }

      if (pagesWithoutCsp > 0 || cspWeak) {
        signals.push(createSignal({ ids,
          signal_key: `csp_missing_or_weak`,
          category: SignalCategory.Security,
          attribute: 'security.headers.csp_missing_or_weak',
          value: cspWeak ? 'weak' : 'missing',
          numeric_value: pagesWithoutCsp,
          confidence: 90,
          scoping, cycle_ref,
          evidence_refs: httpResponses.slice(0, 2).map((e) => makeRef('evidence', e.id)),
          description: cspWeak
            ? `Content-Security-Policy uses unsafe-inline/unsafe-eval on ${cspWeakUrls.length} page(s).`
            : `Content-Security-Policy header missing on ${pagesWithoutCsp} page(s).`,
        }));
      }

      if (pagesWithoutClickjack > 0) {
        signals.push(createSignal({ ids,
          signal_key: `clickjack_protection_missing`,
          category: SignalCategory.Security,
          attribute: 'security.headers.clickjack_missing',
          value: 'true',
          numeric_value: pagesWithoutClickjack,
          confidence: 90,
          scoping, cycle_ref,
          evidence_refs: httpResponses.slice(0, 2).map((e) => makeRef('evidence', e.id)),
          description: `Clickjacking protection (X-Frame-Options or CSP frame-ancestors) missing on ${pagesWithoutClickjack} page(s).`,
        }));
      }
    }
  }

  // ── Finding B: Mixed Content on Commercial Pages ──
  const scripts = byType.get(EvidenceType.Script) || [];
  const forms = byType.get(EvidenceType.Form) || [];
  const iframes = byType.get(EvidenceType.Iframe) || [];

  const mixedScripts: Evidence[] = [];
  const mixedFormsEvidence: Evidence[] = [];
  let mixedOnCheckoutCount = 0;
  const mixedCheckoutUrls = new Set<string>();

  for (const e of scripts) {
    const p = e.payload as ScriptPayload;
    if (secIsHttps(p.page_url) && secIsHttp(p.src)) {
      mixedScripts.push(e);
      if (secIsCheckoutUrl(p.page_url)) {
        mixedOnCheckoutCount++;
        mixedCheckoutUrls.add(p.page_url);
      }
    }
  }

  for (const e of forms) {
    const p = e.payload as FormPayload;
    if (secIsHttps(p.page_url) && p.action && secIsHttp(p.action)) {
      mixedFormsEvidence.push(e);
      if (secIsCheckoutUrl(p.page_url) || p.has_payment_fields) {
        mixedOnCheckoutCount++;
        mixedCheckoutUrls.add(p.page_url);
      }
    }
  }

  const mixedIframes: Evidence[] = [];
  for (const e of iframes) {
    const p = e.payload as IframePayload;
    if (secIsHttps(p.page_url) && secIsHttp(p.src)) {
      mixedIframes.push(e);
      if (secIsCheckoutUrl(p.page_url)) {
        mixedOnCheckoutCount++;
        mixedCheckoutUrls.add(p.page_url);
      }
    }
  }

  if (mixedScripts.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: `mixed_content_script`,
      category: SignalCategory.Security,
      attribute: 'security.mixed_content.script',
      value: 'true',
      numeric_value: mixedScripts.length,
      confidence: 95,
      scoping, cycle_ref,
      evidence_refs: mixedScripts.slice(0, 3).map((e) => makeRef('evidence', e.id)),
      description: `${mixedScripts.length} script(s) loaded over insecure HTTP from HTTPS pages.`,
    }));
  }

  if (mixedFormsEvidence.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: `mixed_content_form_action`,
      category: SignalCategory.Security,
      attribute: 'security.mixed_content.form_action',
      value: 'true',
      numeric_value: mixedFormsEvidence.length,
      confidence: 98,
      scoping, cycle_ref,
      evidence_refs: mixedFormsEvidence.slice(0, 3).map((e) => makeRef('evidence', e.id)),
      description: `${mixedFormsEvidence.length} form(s) submit to insecure HTTP from HTTPS pages.`,
    }));
  }

  if (mixedOnCheckoutCount > 0) {
    signals.push(createSignal({ ids,
      signal_key: `mixed_content_on_checkout`,
      category: SignalCategory.Security,
      attribute: 'security.mixed_content.on_checkout',
      value: 'true',
      numeric_value: mixedCheckoutUrls.size,
      confidence: 98,
      scoping, cycle_ref,
      evidence_refs: [...mixedScripts, ...mixedFormsEvidence, ...mixedIframes].slice(0, 3).map((e) => makeRef('evidence', e.id)),
      description: `Mixed content detected on ${mixedCheckoutUrls.size} commercial/checkout page(s).`,
    }));
  }

  // ── Finding C: Open Redirect Indicators ──
  const redirects = byType.get(EvidenceType.Redirect) || [];
  const REDIRECT_PARAM_NAMES = ['url', 'redirect', 'next', 'return_to', 'returnto', 'goto', 'target', 'redir', 'destination', 'continue', 'r'];

  const openRedirectCandidates: Evidence[] = [];
  const crossDomainRedirects: Evidence[] = [];
  // Note: an earlier version computed a `rootHost` from scoping.environment_id
  // to filter redirects that left the env's own domain. That field was
  // renamed to environment_ref (now a "environment:xxx" ref string, not a URL),
  // so the host-derivation was dead code. The cross-domain check below
  // compares source→target roots from the redirect evidence itself — it
  // doesn't need the env-level root.

  for (const e of redirects) {
    const p = e.payload as RedirectPayload;
    try {
      const sourceUrl = new URL(p.source_url);
      const targetHost = secHostOf(p.target_url);
      let foundOpenRedirect = false;
      for (const param of REDIRECT_PARAM_NAMES) {
        const value = sourceUrl.searchParams.get(param);
        if (value && (value.includes('://') || value.startsWith('//'))) {
          openRedirectCandidates.push(e);
          foundOpenRedirect = true;
          break;
        }
      }

      if (!foundOpenRedirect && targetHost) {
        const targetRoot = secRootDomain(targetHost);
        const sourceRoot = secRootDomain(sourceUrl.hostname);
        if (targetRoot !== sourceRoot && !KNOWN_REDIRECT_PROVIDERS.has(targetHost) && !KNOWN_REDIRECT_PROVIDERS.has(targetRoot)) {
          crossDomainRedirects.push(e);
        }
      }
    } catch { /* skip malformed redirect */ }
  }

  if (openRedirectCandidates.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: `redirect_with_url_parameter`,
      category: SignalCategory.Security,
      attribute: 'security.redirect.url_parameter',
      value: 'true',
      numeric_value: openRedirectCandidates.length,
      confidence: 70,
      scoping, cycle_ref,
      evidence_refs: openRedirectCandidates.slice(0, 3).map((e) => makeRef('evidence', e.id)),
      description: `${openRedirectCandidates.length} redirect(s) appear to use URL query parameters as the destination — potential open redirect.`,
    }));
  }

  if (crossDomainRedirects.length > 0) {
    signals.push(createSignal({ ids,
      signal_key: `redirect_chain_to_unknown_domain`,
      category: SignalCategory.Security,
      attribute: 'security.redirect.cross_domain',
      value: 'true',
      numeric_value: crossDomainRedirects.length,
      confidence: 65,
      scoping, cycle_ref,
      evidence_refs: crossDomainRedirects.slice(0, 3).map((e) => makeRef('evidence', e.id)),
      description: `${crossDomainRedirects.length} redirect(s) cross to a different root domain not in known providers list.`,
    }));
  }

  // ── Finding D: Exposed Sensitive Endpoints ──
  // Reads HttpResponsePayload for paths that match sensitive patterns and returned 200.
  if (httpResponses.length > 0) {
    const adminExposed: Evidence[] = [];
    const sensitiveExposed: Evidence[] = [];
    const apiDocsExposed: Evidence[] = [];

    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (p.status_code !== 200) continue;
      const path = secPathOf(p.url);
      if (!path) continue;

      if (ADMIN_PATHS.some((adm) => path === adm || path.startsWith(adm + '/'))) {
        adminExposed.push(e);
      }
      if (SENSITIVE_FILE_PATHS.some((sf) => path === sf || path.endsWith(sf))) {
        sensitiveExposed.push(e);
      }
      if (API_DOC_PATHS.some((api) => path === api || path.startsWith(api + '/'))) {
        apiDocsExposed.push(e);
      }
    }

    if (adminExposed.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `admin_panel_exposed`,
        category: SignalCategory.Security,
        attribute: 'security.endpoint.admin_exposed',
        value: 'true',
        numeric_value: adminExposed.length,
        confidence: 85,
        scoping, cycle_ref,
        evidence_refs: adminExposed.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${adminExposed.length} admin panel path(s) accessible (HTTP 200).`,
      }));
    }

    if (sensitiveExposed.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `sensitive_file_accessible`,
        category: SignalCategory.Security,
        attribute: 'security.endpoint.sensitive_file',
        value: 'true',
        numeric_value: sensitiveExposed.length,
        confidence: 98,
        scoping, cycle_ref,
        evidence_refs: sensitiveExposed.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${sensitiveExposed.length} sensitive file(s) publicly accessible (.env, .git, backups).`,
      }));
    }

    if (apiDocsExposed.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `api_docs_public`,
        category: SignalCategory.Security,
        attribute: 'security.endpoint.api_docs',
        value: 'true',
        numeric_value: apiDocsExposed.length,
        confidence: 80,
        scoping, cycle_ref,
        evidence_refs: apiDocsExposed.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${apiDocsExposed.length} API documentation endpoint(s) publicly accessible.`,
      }));
    }
  }

  // ── Finding E: Checkout Script Hijack Risk ──
  // External scripts WITHOUT known_provider on pages with payment forms + weak/missing CSP
  const cspSignal = signals.find(s => s.signal_key === 'csp_missing_or_weak');
  if (cspSignal && forms.length > 0 && scripts.length > 0) {
    const paymentPageUrls = new Set<string>();
    for (const e of forms) {
      const p = e.payload as FormPayload;
      if (p.has_payment_fields) paymentPageUrls.add(p.page_url);
    }

    if (paymentPageUrls.size > 0) {
      const hijackScripts: Evidence[] = [];
      for (const e of scripts) {
        const p = e.payload as ScriptPayload;
        if (p.is_external && !p.known_provider && paymentPageUrls.has(p.page_url)) {
          hijackScripts.push(e);
        }
      }

      if (hijackScripts.length > 0) {
        signals.push(createSignal({ ids,
          signal_key: `checkout_script_hijack_risk`,
          category: SignalCategory.Security,
          attribute: 'security.checkout.script_hijack_risk',
          value: 'true',
          numeric_value: hijackScripts.length,
          confidence: 80,
          scoping, cycle_ref,
          evidence_refs: hijackScripts.slice(0, 3).map((e) => makeRef('evidence', e.id)),
          description: `${hijackScripts.length} unvetted external script(s) load on payment pages without CSP protection.`,
        }));
      }
    }
  }

  // ── Finding F: Buyer Session Theft Risk (Cookie Security) ──
  if (httpResponses.length > 0) {
    let weakCookieCount = 0;
    const weakCookieEvidence: Evidence[] = [];

    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (p.status_code < 200 || p.status_code >= 400) continue;
      if (!secIsCheckoutUrl(p.url) && !/(product|pricing|cart|login|account|billing)/.test(secPathOf(p.url))) continue;

      const setCookie = secGetHeader(p.headers, 'set-cookie');
      if (!setCookie) continue;

      // Parse individual cookies from Set-Cookie header(s)
      const cookies = setCookie.split(/,(?=\s*[a-zA-Z_]+=)/);
      for (const cookie of cookies) {
        const lower = cookie.toLowerCase();
        const missingSecure = !lower.includes('secure');
        const missingHttpOnly = !lower.includes('httponly');
        const missingSameSite = !lower.includes('samesite');
        if (missingSecure || missingHttpOnly || missingSameSite) {
          weakCookieCount++;
          if (weakCookieEvidence.length < 3) weakCookieEvidence.push(e);
        }
      }
    }

    if (weakCookieCount > 0) {
      signals.push(createSignal({ ids,
        signal_key: `cookie_security_weak`,
        category: SignalCategory.Security,
        attribute: 'security.cookie.weak',
        value: 'true',
        numeric_value: weakCookieCount,
        confidence: 85,
        scoping, cycle_ref,
        evidence_refs: weakCookieEvidence.map((e) => makeRef('evidence', e.id)),
        description: `${weakCookieCount} cookie(s) on commercial pages lack Secure, HttpOnly, or SameSite flags.`,
      }));
    }
  }

  // ── Finding G: Payment Form Insecure Target ──
  if (forms.length > 0) {
    const KNOWN_PAYMENT_PROVIDERS = new Set([
      'stripe.com', 'checkout.stripe.com', 'js.stripe.com',
      'paypal.com', 'www.paypal.com', 'paypalobjects.com',
      'square.com', 'squareup.com',
      'braintreegateway.com', 'braintree-api.com',
      'adyen.com', 'checkout.adyen.com',
      'mercadopago.com', 'api.mercadopago.com',
      'pagseguro.com.br', 'pagseguro.uol.com.br',
      'shopify.com', 'checkout.shopify.com',
    ]);

    const insecureForms: Evidence[] = [];
    for (const e of forms) {
      const p = e.payload as FormPayload;
      if (!p.has_payment_fields) continue;

      const action = p.action || '';
      const isInsecureHttp = action.startsWith('http://');
      const isExternalUntrusted = p.is_external && p.target_host
        && !KNOWN_PAYMENT_PROVIDERS.has(p.target_host.toLowerCase())
        && !KNOWN_PAYMENT_PROVIDERS.has(secRootDomain(p.target_host.toLowerCase()));

      if (isInsecureHttp || isExternalUntrusted) {
        insecureForms.push(e);
      }
    }

    if (insecureForms.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `payment_form_insecure_target`,
        category: SignalCategory.Security,
        attribute: 'security.form.payment_insecure_target',
        value: 'true',
        numeric_value: insecureForms.length,
        confidence: 90,
        scoping, cycle_ref,
        evidence_refs: insecureForms.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${insecureForms.length} payment form(s) submit to insecure (HTTP) or untrusted external destinations.`,
      }));
    }
  }

  // ── Finding: Error Page Information Leak ──
  // 4xx/5xx responses with content_length > 2000 suggest verbose error pages
  // that may expose stack traces, framework details, or database info.
  if (httpResponses.length > 0) {
    const verboseErrorPages: Evidence[] = [];
    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (p.status_code >= 400 && p.status_code < 600 && (p.content_length ?? 0) > 2000) {
        verboseErrorPages.push(e);
      }
    }

    if (verboseErrorPages.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `error_page_leaks_internals`,
        category: SignalCategory.Security,
        attribute: 'security.error_page.leaks_internals',
        value: 'true',
        numeric_value: verboseErrorPages.length,
        confidence: 75,
        scoping, cycle_ref,
        evidence_refs: verboseErrorPages.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${verboseErrorPages.length} error page(s) (4xx/5xx) with content > 2 KB suggest verbose responses that may expose stack traces, framework versions, or database details.`,
      }));
    }
  }

  // ── Finding: Email Deliverability Risk (Heuristic) ──
  // Commerce site with checkout but no detectable email infrastructure
  const checkoutSignal = signals.find(s => s.attribute === 'checkout.detected' || s.attribute === 'checkout.mode');
  if (checkoutSignal) {
    const metas = byType.get(EvidenceType.Meta) || [];
    const techs = byType.get(EvidenceType.TechnologyDetected) || [];

    let hasEmailInfra = false;
    const EMAIL_TECH_KEYWORDS = ['mailchimp', 'sendgrid', 'mailgun', 'postmark', 'ses', 'sparkpost', 'mandrill', 'klaviyo', 'sendinblue', 'brevo', 'mailerlite', 'convertkit', 'drip', 'activecampaign', 'hubspot', 'intercom'];

    for (const e of techs) {
      const p = e.payload as TechnologyDetectedPayload;
      const key = p.technology_key.toLowerCase();
      const cat = p.category.toLowerCase();
      if (cat === 'email' || cat === 'email_provider' || cat === 'marketing_automation' || EMAIL_TECH_KEYWORDS.some(kw => key.includes(kw))) {
        hasEmailInfra = true;
        break;
      }
    }

    if (!hasEmailInfra) {
      // Check meta evidence for email-related structured data
      for (const e of metas) {
        const p = e.payload as MetaPayload;
        if (p.structured_data && Array.isArray(p.structured_data)) {
          for (const sd of p.structured_data) {
            const sdStr = JSON.stringify(sd).toLowerCase();
            if (sdStr.includes('email') && (sdStr.includes('transactional') || sdStr.includes('notification') || sdStr.includes('confirmation'))) {
              hasEmailInfra = true;
              break;
            }
          }
        }
        if (hasEmailInfra) break;
      }
    }

    if (!hasEmailInfra) {
      signals.push(createSignal({ ids,
        signal_key: `email_infrastructure_absent`,
        category: SignalCategory.Security,
        attribute: 'security.email.infrastructure_absent',
        value: 'true',
        numeric_value: 1,
        confidence: 60,
        scoping, cycle_ref,
        evidence_refs: checkoutSignal.evidence_refs.slice(0, 2),
        description: `Commerce site with checkout detected but no email infrastructure (ESP, transactional email provider) found — order confirmation emails may not reach buyers.`,
      }));
    }
  }

  // ── Finding: CORS Wildcard on Commercial Pages ──
  if (httpResponses.length > 0) {
    const corsWildcardEvidence: Evidence[] = [];

    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (p.status_code < 200 || p.status_code >= 400) continue;
      if (!secIsCheckoutUrl(p.url)) continue;

      const acao = secGetHeader(p.headers, 'access-control-allow-origin');
      if (acao && acao.trim() === '*') {
        corsWildcardEvidence.push(e);
      }
    }

    if (corsWildcardEvidence.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `cors_wildcard_on_commercial`,
        category: SignalCategory.Security,
        attribute: 'security.cors.wildcard_on_commercial',
        value: 'true',
        numeric_value: corsWildcardEvidence.length,
        confidence: 80,
        scoping, cycle_ref,
        evidence_refs: corsWildcardEvidence.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${corsWildcardEvidence.length} commercial page(s) return Access-Control-Allow-Origin: * — any website can make authenticated requests to checkout endpoints.`,
      }));
    }
  }

  // ── Finding: Rate Limiting Absent on Commerce (Heuristic) ──
  if (checkoutSignal && httpResponses.length > 0) {
    let hasRateLimitHeaders = false;
    const commercialResponses: Evidence[] = [];

    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (p.status_code < 200 || p.status_code >= 400) continue;
      if (!secIsCheckoutUrl(p.url) && !/(product|pricing|cart|login|account|billing|api)/.test(secPathOf(p.url))) continue;

      commercialResponses.push(e);
      const rl1 = secGetHeader(p.headers, 'x-ratelimit-limit');
      const rl2 = secGetHeader(p.headers, 'ratelimit-limit');
      const rl3 = secGetHeader(p.headers, 'x-rate-limit-limit');
      const rl4 = secGetHeader(p.headers, 'retry-after');
      if (rl1 || rl2 || rl3 || rl4) {
        hasRateLimitHeaders = true;
        break;
      }
    }

    if (!hasRateLimitHeaders && commercialResponses.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `no_rate_limit_headers_commercial`,
        category: SignalCategory.Security,
        attribute: 'security.rate_limit.absent_commercial',
        value: 'true',
        numeric_value: commercialResponses.length,
        confidence: 55,
        scoping, cycle_ref,
        evidence_refs: commercialResponses.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `No rate-limit headers (X-RateLimit-Limit, RateLimit-Limit, Retry-After) detected on ${commercialResponses.length} commercial page response(s) — heuristic indicator, absence of headers does not guarantee absence of rate limiting.`,
      }));
    }
  }

  // ── Finding: Predictable Data URL Patterns ──
  if (httpResponses.length > 0) {
    const PREDICTABLE_URL_PATTERN = /\/(order|invoice|user|account|customer|receipt|booking|ticket|reservation)\/\d+/i;
    const predictableEvidence: Evidence[] = [];

    for (const e of httpResponses) {
      const p = e.payload as HttpResponsePayload;
      if (p.status_code !== 200) continue;
      const path = secPathOf(p.url);
      if (PREDICTABLE_URL_PATTERN.test(path)) {
        predictableEvidence.push(e);
      }
    }

    if (predictableEvidence.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `predictable_data_url_pattern`,
        category: SignalCategory.Security,
        attribute: 'security.url.predictable_data_pattern',
        value: 'true',
        numeric_value: predictableEvidence.length,
        confidence: 70,
        scoping, cycle_ref,
        evidence_refs: predictableEvidence.slice(0, 3).map((e) => makeRef('evidence', e.id)),
        description: `${predictableEvidence.length} URL(s) matching predictable patterns (e.g. /order/123, /invoice/456) return HTTP 200 — sequential enumeration may expose customer data.`,
      }));
    }
  }
}

function extractPolicyEnrichmentSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const enrichments = byType.get(EvidenceType.ContentEnrichment) || [];
  if (enrichments.length === 0) return;

  for (const e of enrichments) {
    const p = e.payload as ContentEnrichmentPayload;
    if (p.enrichment_type !== 'policy_quality') continue;

    const refs = [makeRef('evidence', e.id)];

    // Signal 1: policy_quality_score — overall clarity assessment
    const qualityLevel = p.scores.clarity_score >= 70 ? 'good'
      : p.scores.clarity_score >= 40 ? 'fair' : 'poor';

    signals.push(createSignal({ ids,
      signal_key: `policy_quality_score_${p.source_url}`,
      category: SignalCategory.Policy,
      attribute: 'policy.enrichment.quality_score',
      value: qualityLevel,
      numeric_value: p.scores.clarity_score,
      confidence: p.confidence,
      scoping, cycle_ref,
      evidence_refs: refs,
      description: `Policy quality (LLM-assessed): ${qualityLevel} (clarity ${p.scores.clarity_score}/100, readability: ${p.scores.readability_grade}) for ${p.source_url}`,
    }));

    // Signal 2: policy_ambiguity_detected — fires when ambiguity flags exist
    if (p.flags.ambiguity_flags.length > 0) {
      signals.push(createSignal({ ids,
        signal_key: `policy_ambiguity_detected_${p.source_url}`,
        category: SignalCategory.Policy,
        attribute: 'policy.enrichment.ambiguity_detected',
        value: 'true',
        numeric_value: p.flags.ambiguity_flags.length,
        confidence: p.confidence,
        scoping, cycle_ref,
        evidence_refs: refs,
        description: `${p.flags.ambiguity_flags.length} ambiguous clause(s) detected in policy at ${p.source_url}: ${p.flags.ambiguity_flags.slice(0, 3).join('; ')}`,
      }));
    }

    // Signal 3: policy_missing_critical_section — one per missing critical section
    for (const missing of p.missing_elements) {
      signals.push(createSignal({ ids,
        signal_key: `policy_missing_section_${missing.replace(/\s+/g, '_').toLowerCase()}_${p.source_url}`,
        category: SignalCategory.Policy,
        attribute: 'policy.enrichment.missing_critical_section',
        value: missing,
        confidence: p.confidence,
        scoping, cycle_ref,
        evidence_refs: refs,
        description: `Policy at ${p.source_url} is missing critical section: ${missing}`,
      }));
    }
  }
}

// ──────────────────────────────────────────────
// Wave 3.1 Tier 2: Copy / Form / Onboarding enrichment signals
// Dormant until the semantic enrichment pass produces the evidence.
// ──────────────────────────────────────────────
function extractCopyEnrichmentSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const enrichments = byType.get(EvidenceType.ContentEnrichment) || [];
  if (enrichments.length === 0) return;

  for (const e of enrichments) {
    const p = e.payload as any; // ContentEnrichmentPayload — enrichment_type extended by enrichment pass
    const refs = [makeRef('evidence', e.id)];

    // Finding 1: Social proof quality — generic testimonials
    if (p.enrichment_type === 'social_proof_quality') {
      const results = (p.results || {}) as {
        has_names?: boolean; has_companies?: boolean; has_specific_outcomes?: boolean;
        generic_count?: number; total_count?: number;
      };
      const isGeneric = !results.has_names && !results.has_companies && !results.has_specific_outcomes;
      const genericRatio = (results.total_count && results.total_count > 0)
        ? (results.generic_count ?? 0) / results.total_count : 0;

      if (isGeneric || genericRatio > 0.5) {
        const severity = genericRatio >= 0.8 || isGeneric ? 'high' : genericRatio >= 0.5 ? 'medium' : 'low';
        signals.push(createSignal({ ids,
          signal_key: `social_proof_quality_low_${p.source_url}`,
          category: SignalCategory.Trust,
          attribute: 'enrichment.social_proof.quality',
          value: severity,
          numeric_value: genericRatio * 100,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Social proof quality is ${severity} at ${p.source_url}: testimonials lack names, companies, or measurable outcomes (${Math.round(genericRatio * 100)}% generic)`,
        }));
      }
    }

    // Finding 2: Form error message quality
    if (p.enrichment_type === 'form_error_quality') {
      const results = (p.results || {}) as {
        generic_error_count?: number; helpful_error_count?: number;
        total_error_count?: number; uses_technical_jargon?: boolean;
      };
      const total = results.total_error_count ?? 0;
      const genericCount = results.generic_error_count ?? 0;
      const genericRatio = total > 0 ? genericCount / total : 0;
      const isPoor = results.uses_technical_jargon || genericRatio > 0.5;

      if (isPoor && total > 0) {
        const severity = genericRatio >= 0.8 || results.uses_technical_jargon ? 'high' : genericRatio >= 0.5 ? 'medium' : 'low';
        signals.push(createSignal({ ids,
          signal_key: `form_error_messages_poor_${p.source_url}`,
          category: SignalCategory.Friction,
          attribute: 'enrichment.form_error.quality',
          value: severity,
          numeric_value: genericRatio * 100,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Form error messages at ${p.source_url} are ${severity}: ${genericCount}/${total} errors are generic/technical instead of helpful`,
        }));
      }
    }

    // Finding 3: Onboarding quality — no quick win
    if (p.enrichment_type === 'onboarding_quality') {
      const results = (p.results || {}) as {
        has_quick_win?: boolean; time_to_first_value_minutes?: number;
        delivers_immediate_result?: boolean; has_personalization?: boolean;
      };
      const noQuickWin = results.has_quick_win === false
        || (results.time_to_first_value_minutes != null && results.time_to_first_value_minutes > 5)
        || results.delivers_immediate_result === false;

      if (noQuickWin) {
        const ttv = results.time_to_first_value_minutes ?? null;
        const severity = (ttv != null && ttv > 15) || (!results.has_quick_win && !results.has_personalization) ? 'high'
          : (ttv != null && ttv > 5) || !results.has_quick_win ? 'medium' : 'low';
        signals.push(createSignal({ ids,
          signal_key: `onboarding_quick_win_absent_${p.source_url}`,
          category: SignalCategory.Onboarding,
          attribute: 'enrichment.onboarding.quick_win',
          value: severity,
          numeric_value: ttv ?? undefined,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Onboarding at ${p.source_url} does not deliver a quick win${ttv != null ? ` (time-to-value: ${ttv} min)` : ''}: new users see no immediate result, completed setup, or personalized recommendation`,
        }));
      }
    }

    // Finding 4: Checkout trust language absent
    if (p.enrichment_type === 'checkout_trust') {
      const results = (p.results || {}) as {
        trust_signals_present?: boolean; has_security_language?: boolean;
        has_guarantee?: boolean; has_urgency_manipulation?: boolean;
        trust_score?: number;
      };
      const trustScore = results.trust_score ?? 0;

      if (trustScore < 40) {
        const severity = trustScore < 20 ? 'high' : 'medium';
        signals.push(createSignal({ ids,
          signal_key: `checkout_trust_language_absent_${p.source_url}`,
          category: SignalCategory.Trust,
          attribute: 'enrichment.checkout_trust.score',
          value: severity,
          numeric_value: trustScore,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Checkout trust language absent at ${p.source_url}: trust score ${trustScore}/100, security language: ${results.has_security_language ? 'yes' : 'no'}, guarantee: ${results.has_guarantee ? 'yes' : 'no'}`,
        }));
      }
    }

    // Finding 5: CTA clarity weak on commercial pages
    if (p.enrichment_type === 'cta_clarity') {
      const results = (p.results || {}) as {
        ctas?: string[]; primary_cta_clear?: boolean;
        competing_ctas?: number; generic_cta_detected?: boolean;
        clarity_score?: number;
      };
      const clarityScore = results.clarity_score ?? 0;
      const competingCtas = results.competing_ctas ?? 0;

      if (clarityScore < 50 || competingCtas > 2) {
        const severity = clarityScore < 30 || competingCtas > 3 ? 'high' : 'medium';
        signals.push(createSignal({ ids,
          signal_key: `cta_clarity_weak_${p.source_url}`,
          category: SignalCategory.Clarity,
          attribute: 'enrichment.cta_clarity.score',
          value: severity,
          numeric_value: clarityScore,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `CTA clarity weak at ${p.source_url}: clarity score ${clarityScore}/100, ${competingCtas} competing CTAs, primary CTA clear: ${results.primary_cta_clear ? 'yes' : 'no'}, generic CTA: ${results.generic_cta_detected ? 'yes' : 'no'}`,
        }));
      }
    }

    // Finding 6: Product page copy generic
    if (p.enrichment_type === 'product_page_quality') {
      const results = (p.results || {}) as {
        is_generic_description?: boolean; benefits_vs_features_ratio?: number;
        objections_addressed?: boolean; description_quality_score?: number;
      };
      const qualityScore = results.description_quality_score ?? 0;

      if (qualityScore < 40) {
        const severity = qualityScore < 20 ? 'high' : 'medium';
        signals.push(createSignal({ ids,
          signal_key: `product_description_generic_${p.source_url}`,
          category: SignalCategory.Clarity,
          attribute: 'enrichment.product_page.quality_score',
          value: severity,
          numeric_value: qualityScore,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Product page copy generic at ${p.source_url}: quality score ${qualityScore}/100, generic description: ${results.is_generic_description ? 'yes' : 'no'}, objections addressed: ${results.objections_addressed ? 'yes' : 'no'}`,
        }));
      }
    }

    // Finding 7: Pricing page framing weak
    if (p.enrichment_type === 'pricing_page_framing') {
      const results = (p.results || {}) as {
        recommended_plan_clear?: boolean; value_framing_quality?: number;
        has_objection_handling?: boolean; framing_score?: number;
      };
      const framingScore = results.framing_score ?? 0;

      if (framingScore < 50) {
        const severity = framingScore < 25 ? 'high' : 'medium';
        signals.push(createSignal({ ids,
          signal_key: `pricing_page_framing_weak_${p.source_url}`,
          category: SignalCategory.Clarity,
          attribute: 'enrichment.pricing_page.framing_score',
          value: severity,
          numeric_value: framingScore,
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Pricing page framing weak at ${p.source_url}: framing score ${framingScore}/100, recommended plan clear: ${results.recommended_plan_clear ? 'yes' : 'no'}, objection handling: ${results.has_objection_handling ? 'yes' : 'no'}`,
        }));
      }
    }

    // Wave 3.9 C-E: Ad-LP message mismatch
    if (p.enrichment_type === 'ad_message_match') {
      const results = (p.results || {}) as {
        alignment_score?: number;
        headline_echoes_ad?: boolean;
        cta_type_matches?: boolean;
        value_proposition_consistent?: boolean;
        misleading_claims?: boolean;
        mismatch_points?: string[];
        spend_30d?: number;
        platform?: string;
        ad_headline?: string;
      };
      const alignmentScore = results.alignment_score ?? 100;
      const spend = results.spend_30d ?? 0;

      if (alignmentScore < 60) {
        const severity = (alignmentScore < 30 || results.misleading_claims)
          ? 'high'
          : alignmentScore < 50
            ? 'medium'
            : 'low';
        signals.push(createSignal({ ids,
          signal_key: `ad_message_mismatch_detected_${p.source_url}`,
          category: SignalCategory.Commerce,
          attribute: 'commerce.ad_message_mismatch',
          value: severity,
          numeric_value: Math.round(spend),
          confidence: p.confidence,
          scoping, cycle_ref,
          evidence_refs: refs,
          description: `Ad "${(results.ad_headline || '').slice(0, 60)}" (${results.platform || 'unknown'}, $${spend.toFixed(0)}/mo) promises one thing but the landing page at ${p.source_url} delivers another (alignment ${alignmentScore}/100). Mismatches: ${(results.mismatch_points || []).join('; ')}`,
        }));
      }
    }
  }
}

function createSignal(params: {
  signal_key: string;
  category: SignalCategory;
  attribute: string;
  value: string;
  numeric_value?: number;
  confidence: number;
  scoping: Scoping;
  cycle_ref: string;
  evidence_refs: string[];
  description: string;
  ids: IdGenerator;
}): Signal {
  const now = new Date();
  return {
    id: params.ids.next(),
    signal_key: params.signal_key,
    category: params.category,
    scoping: params.scoping,
    cycle_ref: params.cycle_ref,
    freshness: {
      observed_at: now,
      fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    attribute: params.attribute,
    value: params.value,
    numeric_value: params.numeric_value ?? null,
    confidence: params.confidence,
    evidence_refs: params.evidence_refs,
    subject_label: null,
    description: params.description,
    created_at: now,
    updated_at: now,
  };
}

// ──────────────────────────────────────────────
// Behavioral Cohort Signals (Pixel-Dependent Workspaces)
//
// These signals compare cohort slices against each other
// using relative thresholds rather than absolute ones.
// ──────────────────────────────────────────────

function extractBehavioralCohortSignals(
  byType: Map<EvidenceType, Evidence[]>,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // Cohort data is stored as BehavioralCohortPayload in evidence with
  // evidence_type still BehavioralSession but a cohorts sub-object.
  // In practice, cohort data is computed at recompute time and passed
  // via a special evidence entry. We look for it by checking payload.type.
  const behavioralEvidence = byType.get(EvidenceType.BehavioralSession) || [];
  let cohort: BehavioralCohortPayload | null = null;
  let evidenceRef = '';

  for (const ev of behavioralEvidence) {
    const p = ev.payload as any;
    if (p.type === 'behavioral_cohort') {
      cohort = p as BehavioralCohortPayload;
      evidenceRef = makeRef('evidence', ev.id);
      break;
    }
  }

  if (!cohort || cohort.total_session_count < 20) return;
  const refs = [evidenceRef];
  const c = cohort.cohorts;

  // ── First Impression Revenue signals ──

  // First-session milestone stall: first-timers stall before intent at a much higher rate
  if (c.first_session.session_count >= 10 && c.returning.session_count >= 10) {
    const firstIntentRate = c.first_session.milestone_intent_count / c.first_session.session_count;
    const returnIntentRate = c.returning.milestone_intent_count / c.returning.session_count;
    if (returnIntentRate > 0 && firstIntentRate < returnIntentRate * 0.6) {
      const gap = returnIntentRate - firstIntentRate;
      signals.push(createSignal({
        signal_key: 'first_session_milestone_stall',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.first_session.milestone_stall',
        value: firstIntentRate < returnIntentRate * 0.4 ? 'high' : 'medium',
        numeric_value: Math.round(gap * 100),
        confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `First-time visitors reach intent at ${Math.round(firstIntentRate * 100)}% vs ${Math.round(returnIntentRate * 100)}% for returning visitors. ${Math.round(gap * 100)}pp gap — first impressions stall before purchase intent forms.`,
      }));
    }
  }

  // First-session trust barrier: first-timers hesitate significantly more
  if (c.first_session.session_count >= 10 && c.returning.session_count >= 10) {
    const firstHesRate = c.first_session.hesitation_pause_rate;
    const returnHesRate = c.returning.hesitation_pause_rate;
    if (firstHesRate > returnHesRate * 1.5 && firstHesRate > 0.08) {
      signals.push(createSignal({
        signal_key: 'first_session_trust_barrier',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.first_session.trust_barrier',
        value: firstHesRate > returnHesRate * 2.5 ? 'high' : 'medium',
        numeric_value: Math.round(firstHesRate * 100),
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `First-time visitors show ${Math.round(firstHesRate * 100)}% hesitation rate vs ${Math.round(returnHesRate * 100)}% for returning visitors. New visitors lack the brand familiarity that returning visitors have.`,
      }));
    }
  }

  // First-session CTA timing gap
  if (c.first_session.session_count >= 10) {
    const firstTime = c.first_session.avg_time_to_first_commercial_action_ms;
    const returnTime = c.returning.avg_time_to_first_commercial_action_ms;
    if (firstTime !== null && returnTime !== null && returnTime > 0 && firstTime > returnTime * 1.8) {
      signals.push(createSignal({
        signal_key: 'first_session_cta_timing_gap',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.first_session.cta_timing',
        value: firstTime > returnTime * 3 ? 'high' : 'medium',
        numeric_value: Math.round(firstTime / 1000),
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `First-time visitors take ${Math.round(firstTime / 1000)}s to reach first commercial action vs ${Math.round(returnTime / 1000)}s for returning visitors. CTA or commercial entry is not optimized for newcomers.`,
      }));
    }
  }

  // ── Action Value Map signals ──

  // Low-value action dominates: high CTA views but low engagement
  if (c.first_session.cta_viewed_count > 0 || c.returning.cta_viewed_count > 0) {
    const totalViews = c.first_session.cta_viewed_count + c.returning.cta_viewed_count;
    const totalClicks = c.first_session.cta_clicked_count + c.returning.cta_clicked_count;
    const engagementRate = totalViews > 0 ? totalClicks / totalViews : 0;
    if (totalViews >= 50 && engagementRate < 0.05) {
      signals.push(createSignal({
        signal_key: 'low_value_action_dominates',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.action_value.low_engagement',
        value: engagementRate < 0.02 ? 'high' : 'medium',
        numeric_value: totalViews,
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${totalViews} CTA views across sessions but only ${Math.round(engagementRate * 100)}% engagement rate. Most visible actions are not driving conversion.`,
      }));
    }
  }

  // Dead-weight surface traffic: surfaces with sessions but zero conversion progression
  const allSlices = [c.first_session, c.returning];
  let totalSessions = 0;
  let totalAwareness = 0;
  let totalConvComplete = 0;
  for (const sl of allSlices) {
    totalSessions += sl.session_count;
    totalAwareness += sl.milestone_awareness_count;
    totalConvComplete += sl.milestone_conversion_complete_count;
  }
  if (totalSessions >= 20 && totalAwareness > 0) {
    const conversionFromAwareness = totalConvComplete / totalAwareness;
    if (conversionFromAwareness < 0.02) {
      signals.push(createSignal({
        signal_key: 'dead_weight_surface_traffic',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.action_value.dead_weight',
        value: conversionFromAwareness < 0.005 ? 'high' : 'medium',
        numeric_value: totalAwareness - totalConvComplete,
        confidence: 55, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${totalAwareness} sessions reach awareness but only ${totalConvComplete} complete conversion (${Math.round(conversionFromAwareness * 10000) / 100}%). Most traffic does not progress toward revenue.`,
      }));
    }
  }

  // High-value action underexposed: conversion is happening but CTA engagement is low
  if (totalConvComplete > 0 && c.first_session.cta_engagement_rate < 0.10 && c.returning.cta_engagement_rate < 0.10) {
    signals.push(createSignal({
      signal_key: 'high_value_action_underexposed',
      category: SignalCategory.Behavioral,
      attribute: 'cohort.action_value.underexposed',
      value: 'medium',
      numeric_value: totalConvComplete,
      confidence: 55, scoping, cycle_ref, ids, evidence_refs: refs,
      description: `Conversions happen (${totalConvComplete}) but CTA engagement is very low across cohorts. Revenue-positive actions are not visible or compelling enough.`,
    }));
  }

  // ── Acquisition Integrity signals ──

  if (c.paid_traffic.session_count >= 10 && c.organic_traffic.session_count >= 10) {
    // Paid traffic friction elevated
    const paidFriction = c.paid_traffic.backtrack_rate + c.paid_traffic.hesitation_pause_rate;
    const organicFriction = c.organic_traffic.backtrack_rate + c.organic_traffic.hesitation_pause_rate;
    if (paidFriction > organicFriction * 1.5 && paidFriction > 0.15) {
      signals.push(createSignal({
        signal_key: 'paid_traffic_friction_elevated',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.acquisition.paid_friction',
        value: paidFriction > organicFriction * 2.5 ? 'high' : 'medium',
        numeric_value: Math.round(paidFriction * 100),
        confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Paid traffic shows ${Math.round(paidFriction * 100)}% combined friction rate vs ${Math.round(organicFriction * 100)}% for organic. Paid visitors encounter significantly more obstacles.`,
      }));
    }

    // Paid traffic trust gap
    const paidTrust = c.paid_traffic.hesitation_pause_rate + c.paid_traffic.policy_opened_rate;
    const organicTrust = c.organic_traffic.hesitation_pause_rate + c.organic_traffic.policy_opened_rate;
    if (paidTrust > organicTrust * 1.5 && paidTrust > 0.10) {
      signals.push(createSignal({
        signal_key: 'paid_traffic_trust_gap',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.acquisition.paid_trust',
        value: paidTrust > organicTrust * 2 ? 'high' : 'medium',
        numeric_value: Math.round(paidTrust * 100),
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Paid visitors show ${Math.round(paidTrust * 100)}% trust-seeking behavior vs ${Math.round(organicTrust * 100)}% for organic. Paid traffic lacks brand familiarity.`,
      }));
    }

    // Paid + mobile compounding waste
    if (c.mobile.session_count >= 10) {
      const paidConv = c.paid_traffic.conversion_rate;
      const mobileConv = c.mobile.conversion_rate;
      const overallConv = (c.first_session.conversion_rate * c.first_session.session_count +
        c.returning.conversion_rate * c.returning.session_count) / (c.first_session.session_count + c.returning.session_count || 1);
      if (paidConv < overallConv * 0.5 && mobileConv < overallConv * 0.5) {
        signals.push(createSignal({
          signal_key: 'paid_mobile_compounding_waste',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.acquisition.paid_mobile',
          value: 'high',
          numeric_value: Math.round((overallConv - Math.min(paidConv, mobileConv)) * 100),
          confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `Paid traffic converts at ${Math.round(paidConv * 100)}% and mobile at ${Math.round(mobileConv * 100)}% vs overall ${Math.round(overallConv * 100)}%. Paid mobile visitors face compounded friction.`,
        }));
      }
    }
  }

  // ── Mobile Revenue Exposure signals ──

  if (c.mobile.session_count >= 10 && c.desktop.session_count >= 10) {
    // Mobile conversion gap
    if (c.desktop.conversion_rate > 0 && c.mobile.conversion_rate < c.desktop.conversion_rate * 0.6) {
      const gap = c.desktop.conversion_rate - c.mobile.conversion_rate;
      signals.push(createSignal({
        signal_key: 'mobile_conversion_gap',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.mobile.conversion_gap',
        value: c.mobile.conversion_rate < c.desktop.conversion_rate * 0.3 ? 'high' : 'medium',
        numeric_value: Math.round(gap * 100),
        confidence: 70, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Mobile converts at ${Math.round(c.mobile.conversion_rate * 100)}% vs desktop ${Math.round(c.desktop.conversion_rate * 100)}%. ${Math.round(gap * 100)}pp conversion gap represents trapped mobile revenue.`,
      }));
    }

    // Mobile form friction elevated
    if (c.mobile.form_retry_rate > c.desktop.form_retry_rate * 1.5 && c.mobile.form_retry_rate > 0.05) {
      signals.push(createSignal({
        signal_key: 'mobile_form_friction_elevated',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.mobile.form_friction',
        value: c.mobile.form_retry_rate > c.desktop.form_retry_rate * 2.5 ? 'high' : 'medium',
        numeric_value: Math.round(c.mobile.form_retry_rate * 100),
        confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Mobile form retry rate is ${Math.round(c.mobile.form_retry_rate * 100)}% vs desktop ${Math.round(c.desktop.form_retry_rate * 100)}%. Mobile users struggle with form input.`,
      }));
    }

    // Mobile CTA timing degraded
    if (c.mobile.cta_rendered_late_count > c.desktop.cta_rendered_late_count * 2 && c.mobile.cta_rendered_late_count >= 3) {
      signals.push(createSignal({
        signal_key: 'mobile_cta_timing_degraded',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.mobile.cta_timing',
        value: c.mobile.cta_rendered_late_count > c.desktop.cta_rendered_late_count * 4 ? 'high' : 'medium',
        numeric_value: c.mobile.cta_rendered_late_count,
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Mobile has ${c.mobile.cta_rendered_late_count} late-rendered CTAs vs ${c.desktop.cta_rendered_late_count} on desktop. Primary actions load slower on mobile.`,
      }));
    }
  }

  // ── Friction Tax signals ──

  // Funnel step friction cost: high overall friction with conversion impact
  {
    const overall = computeOverallSlice(c);
    if (overall.session_count >= 20) {
      const frictionScore = overall.hesitation_pause_rate + overall.form_retry_rate + overall.surface_oscillation_rate;
      if (frictionScore > 0.15) {
        signals.push(createSignal({
          signal_key: 'funnel_step_friction_cost',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.friction.step_cost',
          value: frictionScore > 0.30 ? 'high' : 'medium',
          numeric_value: Math.round(frictionScore * 100),
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `Combined friction score across funnel: ${Math.round(frictionScore * 100)}% (hesitation ${Math.round(overall.hesitation_pause_rate * 100)}% + form retries ${Math.round(overall.form_retry_rate * 100)}% + oscillation ${Math.round(overall.surface_oscillation_rate * 100)}%).`,
        }));
      }

      // Oscillation decision cost
      if (overall.surface_oscillation_rate > 0.05) {
        signals.push(createSignal({
          signal_key: 'oscillation_decision_cost',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.friction.oscillation',
          value: overall.surface_oscillation_rate > 0.12 ? 'high' : 'medium',
          numeric_value: Math.round(overall.surface_oscillation_rate * 100),
          confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${Math.round(overall.surface_oscillation_rate * 100)}% of sessions show back-and-forth navigation between surfaces. Users cannot make decisions and oscillate instead.`,
        }));
      }

      // Checkout entry friction
      const checkoutRate = overall.checkout_reached_rate;
      const intentRate = overall.milestone_intent_count / (overall.session_count || 1);
      if (intentRate > 0.1 && checkoutRate < intentRate * 0.4) {
        signals.push(createSignal({
          signal_key: 'checkout_entry_friction',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.friction.checkout_entry',
          value: checkoutRate < intentRate * 0.2 ? 'high' : 'medium',
          numeric_value: Math.round((intentRate - checkoutRate) * 100),
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${Math.round(intentRate * 100)}% of sessions express intent but only ${Math.round(checkoutRate * 100)}% reach checkout. ${Math.round((intentRate - checkoutRate) * 100)}pp drop at the conversion gate.`,
        }));
      }
    }
  }

  // ── Trust Revenue Gap signals ──

  {
    const overall = computeOverallSlice(c);
    if (overall.session_count >= 20) {
      // Trust deficit conversion drag
      const trustIndicator = overall.policy_opened_rate + overall.hesitation_pause_rate + overall.sensitive_input_abandon_rate;
      if (trustIndicator > 0.15 && overall.conversion_rate < 0.05) {
        signals.push(createSignal({
          signal_key: 'trust_deficit_conversion_drag',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.trust.conversion_drag',
          value: trustIndicator > 0.25 ? 'high' : 'medium',
          numeric_value: Math.round(trustIndicator * 100),
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `Combined trust-deficit behavior at ${Math.round(trustIndicator * 100)}% (policy views ${Math.round(overall.policy_opened_rate * 100)}% + hesitation ${Math.round(overall.hesitation_pause_rate * 100)}% + sensitive abandonment ${Math.round(overall.sensitive_input_abandon_rate * 100)}%) with only ${Math.round(overall.conversion_rate * 100)}% conversion.`,
        }));
      }

      // Reassurance seeking elevated
      const reassuranceRate = overall.policy_opened_rate + overall.support_opened_rate;
      if (reassuranceRate > 0.12) {
        signals.push(createSignal({
          signal_key: 'reassurance_seeking_elevated',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.trust.reassurance',
          value: reassuranceRate > 0.20 ? 'high' : 'medium',
          numeric_value: Math.round(reassuranceRate * 100),
          confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${Math.round(reassuranceRate * 100)}% of sessions seek reassurance (policy: ${Math.round(overall.policy_opened_rate * 100)}%, support: ${Math.round(overall.support_opened_rate * 100)}%). Users need trust verification before buying.`,
        }));
      }

      // Sensitive input trust gap
      if (overall.sensitive_input_abandon_rate > 0.04) {
        signals.push(createSignal({
          signal_key: 'sensitive_input_trust_gap',
          category: SignalCategory.Behavioral,
          attribute: 'cohort.trust.sensitive_input',
          value: overall.sensitive_input_abandon_rate > 0.10 ? 'high' : 'medium',
          numeric_value: Math.round(overall.sensitive_input_abandon_rate * 100),
          confidence: 65, scoping, cycle_ref, ids, evidence_refs: refs,
          description: `${Math.round(overall.sensitive_input_abandon_rate * 100)}% of sessions abandon at sensitive input fields. Top field types: ${overall.sensitive_input_abandon_top_kinds.join(', ') || 'unknown'}. Users perceive data privacy risk.`,
        }));
      }
    }
  }

  // ── Path to Purchase Efficiency signals ──

  if (c.first_session.session_count >= 10 || c.returning.session_count >= 10) {
    const overall = computeOverallSlice(c);

    // Path length exceeds efficient
    if (overall.avg_surface_progression_length > 5 && overall.conversion_rate < 0.05) {
      signals.push(createSignal({
        signal_key: 'path_length_exceeds_efficient',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.path.length_excessive',
        value: overall.avg_surface_progression_length > 8 ? 'high' : 'medium',
        numeric_value: Math.round(overall.avg_surface_progression_length * 10) / 10,
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Average session visits ${Math.round(overall.avg_surface_progression_length * 10) / 10} surfaces with only ${Math.round(overall.conversion_rate * 100)}% conversion. Visitors wander rather than progressing toward purchase.`,
      }));
    }

    // Intent decay time excessive
    const avgIntentToConv = overall.avg_time_intent_to_conversion_ms;
    if (avgIntentToConv !== null && avgIntentToConv > 120000) { // > 2 minutes
      signals.push(createSignal({
        signal_key: 'intent_decay_time_excessive',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.path.intent_decay',
        value: avgIntentToConv > 300000 ? 'high' : 'medium', // > 5 minutes
        numeric_value: Math.round(avgIntentToConv / 1000),
        confidence: 60, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `Average time from intent to conversion: ${Math.round(avgIntentToConv / 1000)}s. Purchase intent decays over time — long paths lose buyers.`,
      }));
    }

    // Intent absorber detected: high backtrack + oscillation together
    if (overall.backtrack_rate > 0.12 && overall.surface_oscillation_rate > 0.05) {
      signals.push(createSignal({
        signal_key: 'intent_absorber_detected',
        category: SignalCategory.Behavioral,
        attribute: 'cohort.path.intent_absorber',
        value: overall.backtrack_rate > 0.20 ? 'high' : 'medium',
        numeric_value: Math.round(overall.backtrack_rate * 100),
        confidence: 55, scoping, cycle_ref, ids, evidence_refs: refs,
        description: `${Math.round(overall.backtrack_rate * 100)}% backtrack rate combined with ${Math.round(overall.surface_oscillation_rate * 100)}% oscillation. Surfaces in the path absorb purchase intent rather than advancing it.`,
      }));
    }
  }
}

/** Combine first_session + returning into a weighted overall slice */
function computeOverallSlice(cohorts: BehavioralCohortPayload['cohorts']): import('../behavioral').BehavioralCohortSlice {
  const a = cohorts.first_session;
  const b = cohorts.returning;
  const total = a.session_count + b.session_count;
  if (total === 0) return a;

  const w = (va: number, vb: number) => (va * a.session_count + vb * b.session_count) / total;

  return {
    session_count: total,
    conversion_rate: w(a.conversion_rate, b.conversion_rate),
    checkout_reached_rate: w(a.checkout_reached_rate, b.checkout_reached_rate),
    avg_time_to_first_commercial_action_ms: a.avg_time_to_first_commercial_action_ms !== null && b.avg_time_to_first_commercial_action_ms !== null
      ? Math.round(w(a.avg_time_to_first_commercial_action_ms, b.avg_time_to_first_commercial_action_ms)) : a.avg_time_to_first_commercial_action_ms ?? b.avg_time_to_first_commercial_action_ms,
    avg_time_intent_to_conversion_ms: a.avg_time_intent_to_conversion_ms !== null && b.avg_time_intent_to_conversion_ms !== null
      ? Math.round(w(a.avg_time_intent_to_conversion_ms, b.avg_time_intent_to_conversion_ms)) : a.avg_time_intent_to_conversion_ms ?? b.avg_time_intent_to_conversion_ms,
    backtrack_rate: w(a.backtrack_rate, b.backtrack_rate),
    dead_click_rate: w(a.dead_click_rate, b.dead_click_rate),
    hesitation_pause_rate: w(a.hesitation_pause_rate, b.hesitation_pause_rate),
    form_retry_rate: w(a.form_retry_rate, b.form_retry_rate),
    input_focus_abandon_rate: w(a.input_focus_abandon_rate, b.input_focus_abandon_rate),
    cta_viewed_count: a.cta_viewed_count + b.cta_viewed_count,
    cta_clicked_count: a.cta_clicked_count + b.cta_clicked_count,
    cta_engagement_rate: (a.cta_viewed_count + b.cta_viewed_count) > 0
      ? (a.cta_clicked_count + b.cta_clicked_count) / (a.cta_viewed_count + b.cta_viewed_count) : 0,
    cta_rendered_late_count: a.cta_rendered_late_count + b.cta_rendered_late_count,
    policy_opened_rate: w(a.policy_opened_rate, b.policy_opened_rate),
    policy_then_abandon_rate: w(a.policy_then_abandon_rate, b.policy_then_abandon_rate),
    support_opened_rate: w(a.support_opened_rate, b.support_opened_rate),
    sensitive_input_abandon_rate: w(a.sensitive_input_abandon_rate, b.sensitive_input_abandon_rate),
    sensitive_input_abandon_top_kinds: [...new Set([...a.sensitive_input_abandon_top_kinds, ...b.sensitive_input_abandon_top_kinds])].slice(0, 3),
    surface_oscillation_rate: w(a.surface_oscillation_rate, b.surface_oscillation_rate),
    avg_surface_progression_length: w(a.avg_surface_progression_length, b.avg_surface_progression_length),
    milestone_awareness_count: a.milestone_awareness_count + b.milestone_awareness_count,
    milestone_consideration_count: a.milestone_consideration_count + b.milestone_consideration_count,
    milestone_intent_count: a.milestone_intent_count + b.milestone_intent_count,
    milestone_conversion_start_count: a.milestone_conversion_start_count + b.milestone_conversion_start_count,
    milestone_conversion_complete_count: a.milestone_conversion_complete_count + b.milestone_conversion_complete_count,
    handoff_without_return_rate: w(a.handoff_without_return_rate, b.handoff_without_return_rate),
    pricing_backtrack_rate: w(a.pricing_backtrack_rate, b.pricing_backtrack_rate),
    policy_detour_before_conversion_rate: w(a.policy_detour_before_conversion_rate, b.policy_detour_before_conversion_rate),
  };
}

// ──────────────────────────────────────────────
// Phase 4A: Commerce Context Signals
//
// Signals derived from Shopify integration data
// (CommerceContext). These fire only when real
// commerce data is present — never from heuristics.
// ──────────────────────────────────────────────

function extractCommerceContextSignals(
  commerce: CommerceContext,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // Integration evidence refs — these signals come from integration data, not crawl evidence
  const integrationRefs: string[] = [];

  // 1. Checkout abandonment rate high (> 60%)
  if (commerce.abandonment_rate !== null && commerce.abandonment_rate > 0.60) {
    const rate = commerce.abandonment_rate;
    const severity = rate > 0.80 ? 'high' : rate > 0.70 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'checkout_abandonment_rate_high',
      category: SignalCategory.Commerce,
      attribute: 'commerce.checkout_abandonment_rate',
      value: severity,
      numeric_value: Math.round(rate * 100),
      confidence: 95,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `Checkout abandonment rate is ${Math.round(rate * 100)}%. More than half of buyers who start checkout never complete it — revenue is walking away at the final step.`,
    }));
  }

  // 2. Promoted products out of stock
  if (commerce.out_of_stock_promoted_count !== null && commerce.out_of_stock_promoted_count > 0) {
    const count = commerce.out_of_stock_promoted_count;
    const severity = count >= 5 ? 'high' : count >= 2 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'promoted_products_out_of_stock',
      category: SignalCategory.Commerce,
      attribute: 'commerce.promoted_out_of_stock',
      value: severity,
      numeric_value: count,
      confidence: 95,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `${count} promoted product(s) are out of stock. Buyers land on pages for items they cannot purchase — ad spend and organic traffic convert to frustration instead of revenue.`,
    }));
  }

  // 3. Refund rate elevated (> 5%)
  if (commerce.refund_rate !== null && commerce.refund_rate > 0.05) {
    const rate = commerce.refund_rate;
    const severity = rate > 0.10 ? 'high' : rate > 0.07 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'refund_rate_elevated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.refund_rate',
      value: severity,
      numeric_value: Math.round(rate * 100),
      confidence: 95,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `Refund rate is ${(rate * 100).toFixed(1)}% of orders. Every refund erodes margin and signals expectation misalignment between what's promised and what's delivered.`,
    }));
  }

  // 4. Payment gateway concentrated (> 90%)
  if (commerce.payment_gateway_concentration !== null && commerce.payment_gateway_concentration > 0.90) {
    const ratio = commerce.payment_gateway_concentration;
    const severity = ratio > 0.98 ? 'high' : ratio > 0.95 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'payment_gateway_concentrated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.payment_gateway_concentration',
      value: severity,
      numeric_value: Math.round(ratio * 100),
      confidence: 90,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `${Math.round(ratio * 100)}% of transactions flow through a single payment gateway. One outage stops all revenue — no fallback path exists.`,
    }));
  }

  // 5. Discount usage elevated (> 40%)
  if (commerce.discount_usage_rate !== null && commerce.discount_usage_rate > 0.40) {
    const rate = commerce.discount_usage_rate;
    const severity = rate > 0.60 ? 'high' : rate > 0.50 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'discount_usage_elevated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.discount_usage_rate',
      value: severity,
      numeric_value: Math.round(rate * 100),
      confidence: 90,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `${Math.round(rate * 100)}% of orders use a discount code. Widespread discounting erodes margin and trains buyers to never pay full price.`,
    }));
  }

  // 6. Repeat purchase rate low (< 15%)
  if (commerce.repeat_purchase_rate !== null && commerce.repeat_purchase_rate < 0.15) {
    const rate = commerce.repeat_purchase_rate;
    const severity = rate < 0.05 ? 'high' : rate < 0.10 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'repeat_purchase_rate_low',
      category: SignalCategory.Commerce,
      attribute: 'commerce.repeat_purchase_rate',
      value: severity,
      numeric_value: Math.round(rate * 100),
      confidence: 90,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `Only ${Math.round(rate * 100)}% of customers make a repeat purchase. Acquisition cost is not being recovered through retention — every new customer is a one-time transaction.`,
    }));
  }

  // 7. Dead weight products (never sold in 30 days, > 5)
  if (commerce.products_never_sold_30d !== null && commerce.products_never_sold_30d > 5) {
    const count = commerce.products_never_sold_30d;
    const total = commerce.total_products ?? count;
    const ratio = total > 0 ? count / total : 0;
    const severity = ratio > 0.50 ? 'high' : ratio > 0.25 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'dead_weight_products_detected',
      category: SignalCategory.Commerce,
      attribute: 'commerce.dead_weight_products',
      value: severity,
      numeric_value: count,
      confidence: 90,
      scoping, cycle_ref, ids,
      evidence_refs: integrationRefs,
      description: `${count} product(s) haven't sold in 30 days${total > count ? ` (${Math.round(ratio * 100)}% of catalog)` : ''}. Dead inventory dilutes search, clutters navigation, and wastes operational effort on items that generate no revenue.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 4A++: Ads Creative × Crawl Evidence Compound Signals
//
// Traverses ad_targets edges in the graph. For each ad node, resolves
// the target page node, then checks on-page evidence for known issues:
//   - Dead destination (HTTP 4xx/5xx, timeout, long redirect chain)
//   - Trust gap (sensitive inputs + < 2 trust signals)
//   - Form friction (payment form with 10+ fields)
//   - Mobile degraded (mobile verification shows failures/slow load)
//
// Each compound signal carries the ad's spend so downstream
// inferences can quantify waste in real dollars.
// ──────────────────────────────────────────────

function extractAdsCreativeContextSignals(
  graph: BuiltGraph,
  evidence: Evidence[],
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // Collect ad nodes from graph.
  const adNodes: GraphNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.node_type === 'ad_creative' || node.node_type === 'ad_campaign') {
      adNodes.push(node);
    }
  }
  if (adNodes.length === 0) return;

  // Build page-level evidence index for fast lookup.
  const httpByUrl = new Map<string, { status: number; redirect_hops: number; response_time_ms: number }>();
  const formsByUrl = new Map<string, { max_fields: number; has_payment: boolean; has_sensitive: boolean }>();
  const trustByUrl = new Map<string, number>();
  const mobileByUrl = new Map<string, { duration_ms: number; steps_failed: number; reachable: boolean }>();

  for (const e of evidence) {
    switch (e.evidence_type) {
      case EvidenceType.HttpResponse: {
        const p = e.payload as HttpResponsePayload;
        const url = p.url;
        const existing = httpByUrl.get(url);
        if (!existing || p.status_code >= 400) {
          httpByUrl.set(url, {
            status: p.status_code,
            redirect_hops: 0,
            response_time_ms: p.response_time_ms,
          });
        }
        break;
      }
      case EvidenceType.Redirect: {
        const p = e.payload as RedirectPayload;
        const existing = httpByUrl.get(p.source_url);
        if (existing) existing.redirect_hops = p.hop_count;
        else httpByUrl.set(p.source_url, { status: 301, redirect_hops: p.hop_count, response_time_ms: 0 });
        break;
      }
      case EvidenceType.Form: {
        const p = e.payload as FormPayload;
        const existing = formsByUrl.get(p.page_url);
        const hasSensitive = p.has_payment_fields || p.field_names.some(f => {
          const n = f.toLowerCase().replace(/[_\-\s]/g, '');
          return ['card', 'cvv', 'cvc', 'cpf', 'cnpj', 'ssn', 'password', 'senha'].some(t => n.includes(t));
        });
        const newMax = Math.max(existing?.max_fields ?? 0, p.field_names.length);
        formsByUrl.set(p.page_url, {
          max_fields: newMax,
          has_payment: (existing?.has_payment ?? false) || p.has_payment_fields,
          has_sensitive: (existing?.has_sensitive ?? false) || hasSensitive,
        });
        break;
      }
      case EvidenceType.StructuredDataItem: {
        const p = e.payload as StructuredDataItemPayload;
        if (p.is_trust_signal) {
          trustByUrl.set(p.page_url, (trustByUrl.get(p.page_url) ?? 0) + 1);
        }
        break;
      }
      case EvidenceType.MobileVerificationResult: {
        const p = e.payload as MobileVerificationResultPayload;
        mobileByUrl.set(p.target_url, {
          duration_ms: p.duration_ms,
          steps_failed: p.steps_failed,
          reachable: p.checkout_reachable,
        });
        break;
      }
    }
  }

  // For each ad node, traverse ad_targets edge → check target page.
  for (const adNode of adNodes) {
    const edges = graph.edgeIndex.get(adNode.id) ?? [];
    const targetEdges = edges.filter(e => e.edge_type === 'ad_targets');
    if (targetEdges.length === 0) continue;

    const meta = adNode.metadata as Record<string, any>;
    const spend = (meta.spend_30d as number) ?? 0;
    const platform = (meta.platform as string) ?? 'unknown';
    const adLabel = adNode.label || `Ad ${adNode.id}`;
    if (spend <= 0) continue;

    for (const edge of targetEdges) {
      const pageNode = graph.nodes.get(edge.target_id);
      if (!pageNode || !pageNode.url) continue;
      const pageUrl = pageNode.url;

      // 1. Dead destination — 4xx/5xx or redirect chain > 3 hops
      const http = httpByUrl.get(pageUrl);
      if (http && (http.status >= 400 || http.redirect_hops > 3)) {
        signals.push(createSignal({
          signal_key: 'ad_creative_dead_destination',
          category: SignalCategory.Commerce,
          attribute: 'commerce.ad_creative_dead_destination',
          value: http.status >= 400 ? 'high' : 'medium',
          numeric_value: Math.round(spend),
          confidence: 95,
          scoping, cycle_ref, ids,
          evidence_refs: [],
          description: `Ad "${adLabel}" (${platform}) spends $${spend.toFixed(0)}/mo targeting ${pageUrl} which ${http.status >= 400 ? `returns HTTP ${http.status}` : `redirects through ${http.redirect_hops} hops`}. 100% of this spend reaches a dead end.`,
        }));
      }

      // 2. Trust gap — page has sensitive inputs but < 2 trust signals
      const forms = formsByUrl.get(pageUrl);
      const trust = trustByUrl.get(pageUrl) ?? 0;
      if (forms?.has_sensitive && trust < 2) {
        signals.push(createSignal({
          signal_key: 'ad_creative_landing_trust_gap',
          category: SignalCategory.Commerce,
          attribute: 'commerce.ad_creative_trust_gap',
          value: trust === 0 ? 'high' : 'medium',
          numeric_value: Math.round(spend),
          confidence: 85,
          scoping, cycle_ref, ids,
          evidence_refs: [],
          description: `Ad "${adLabel}" (${platform}, $${spend.toFixed(0)}/mo) sends buyers to ${pageUrl} where sensitive data is collected but only ${trust} trust signal(s) are present. Buyers entering payment or personal data without visible reassurance abandon at elevated rates.`,
        }));
      }

      // 3. Form friction — page has form with 10+ fields
      if (forms && forms.max_fields >= 10) {
        signals.push(createSignal({
          signal_key: 'ad_creative_form_friction_waste',
          category: SignalCategory.Commerce,
          attribute: 'commerce.ad_creative_form_friction',
          value: forms.max_fields >= 15 ? 'high' : 'medium',
          numeric_value: Math.round(spend),
          confidence: 80,
          scoping, cycle_ref, ids,
          evidence_refs: [],
          description: `Ad "${adLabel}" (${platform}, $${spend.toFixed(0)}/mo) sends buyers to ${pageUrl} which has a form with ${forms.max_fields} fields. Every field past 6 measurably increases abandonment — a portion of this spend converts to friction instead of revenue.`,
        }));
      }

      // 4. Mobile degraded — page has mobile verification failures or slow load
      const mobile = mobileByUrl.get(pageUrl);
      if (mobile && mobile.reachable && (mobile.steps_failed >= 1 || mobile.duration_ms >= 8000)) {
        signals.push(createSignal({
          signal_key: 'ad_creative_mobile_checkout_degraded',
          category: SignalCategory.Commerce,
          attribute: 'commerce.ad_creative_mobile_degraded',
          value: mobile.steps_failed >= 2 || mobile.duration_ms >= 15000 ? 'high' : 'medium',
          numeric_value: Math.round(spend),
          confidence: 75,
          scoping, cycle_ref, ids,
          evidence_refs: [],
          description: `Ad "${adLabel}" (${platform}, $${spend.toFixed(0)}/mo) sends mobile buyers to ${pageUrl} where the commercial path takes ${Math.round(mobile.duration_ms / 1000)}s and ${mobile.steps_failed} step(s) fail. Mobile traffic from this ad hits a degraded experience.`,
        }));
      }
    }
  }
}

import type { GraphNode } from '../graph/types';

// ──────────────────────────────────────────────
// Phase 4A+: Ad Context Signals
//
// Reads `total_ad_spend_monthly` + `ad_spend_by_platform` from the
// reconciled CommerceContext. These fields are populated by
// `reconcileCommerceContext()` in packages/integrations/reconcile.ts
// when an IntegrationSnapshot for provider='meta_ads' or 'google_ads'
// is present. No heuristic fallback — ad spend cannot be derived from
// crawl evidence.
//
// Two signals emitted:
//   - `ad_spend_platform_concentrated` — when a single platform holds
//     >= 70% of total spend (platform-risk pattern, analogous to
//     payment gateway concentration).
//   - `ads_active_without_conversion_tracking` — when any ad spend is
//     present but NO commerce integration is reconciled (sources
//     array lacks shopify/nuvemshop). ROAS is unmeasurable.
// ──────────────────────────────────────────────

function extractAdsContextSignals(
  commerce: CommerceContext,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const totalSpend = commerce.total_ad_spend_monthly;
  const byPlatform = commerce.ad_spend_by_platform || {};
  const platforms = Object.keys(byPlatform);

  // Guard: nothing to say if no ad spend data available.
  if (totalSpend == null || totalSpend <= 0 || platforms.length === 0) {
    return;
  }

  // 1. Ad-platform concentration risk. Fires when one platform is
  //    responsible for >= 70% of total spend. Severity escalates for
  //    very concentrated spend (>= 90%).
  const maxPlatformSpend = Math.max(...platforms.map((p) => byPlatform[p]));
  const concentrationRatio = maxPlatformSpend / totalSpend;
  if (concentrationRatio >= 0.70) {
    const dominantPlatform = platforms.find(
      (p) => byPlatform[p] === maxPlatformSpend,
    ) ?? 'unknown';
    const platformLabel = dominantPlatform === 'meta_ads' ? 'Meta Ads' : dominantPlatform === 'google_ads' ? 'Google Ads' : dominantPlatform;
    const severity =
      concentrationRatio >= 0.95 ? 'high' : concentrationRatio >= 0.85 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'ad_spend_platform_concentrated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.ad_spend_concentration',
      value: severity,
      numeric_value: Math.round(concentrationRatio * 100),
      confidence: 90,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `${Math.round(concentrationRatio * 100)}% of ad spend ($${totalSpend.toFixed(0)}/mo) flows through ${platformLabel}. A policy change, account disable, or platform outage would halt traffic acquisition until a new channel is stood up — which takes weeks.`,
    }));
  }

  // 2. Ads active without conversion tracking. Fires when spend is
  //    present but no commerce integration is reconciled — operator
  //    literally cannot measure ROAS. Confidence pinned high because
  //    the determination is binary: either conversion data exists or
  //    it doesn't.
  const conversionSources = new Set(commerce.sources || []);
  const hasCommerceData =
    conversionSources.has('shopify') ||
    conversionSources.has('nuvemshop') ||
    conversionSources.has('stripe');
  if (!hasCommerceData) {
    signals.push(createSignal({
      signal_key: 'ads_active_without_conversion_tracking',
      category: SignalCategory.Commerce,
      attribute: 'commerce.ads_without_conversion_visibility',
      value: 'high',
      numeric_value: Math.round(totalSpend),
      confidence: 95,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `$${totalSpend.toFixed(0)}/mo of ad spend is running across ${platforms.length} platform(s) (${platforms.join(', ')}) with no commerce platform connected. ROAS is literally unmeasurable — every dollar spent is a dollar you can't attribute, optimize, or prove was worth the cost.`,
    }));
  }
}

// ──────────────────────────────────────────────
// Phase 2.4: Commerce heuristic signal emission
//
// Converts heuristic-extractor output into the same signal_keys the
// data-driven commerce path emits, at lower confidence. Inference
// engine consumers read these without caring whether they came from
// integration data or heuristics — the confidence differential is how
// we surface the quality gap in the UI.
// ──────────────────────────────────────────────

function emitCommerceHeuristicSignals(
  heuristics: CommerceHeuristicSignals,
  scoping: Scoping,
  cycle_ref: string,
  signals: Signal[],
  ids: IdGenerator,
): void {
  // Single-payment-gateway risk — heuristic confidence 65 (vs 90 data-driven).
  // Only emit when heuristic found exactly one gateway across multiple pages;
  // the extractor itself enforces the 2-page floor.
  const pg = heuristics.payment_gateway;
  if (pg && pg.gateway_count === 1) {
    const detected = pg.detected_gateways[0] ?? 'unknown';
    signals.push(createSignal({
      signal_key: 'payment_gateway_concentrated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.payment_gateway_concentration',
      value: 'medium',
      numeric_value: 100,
      confidence: 65,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `Only ${detected} was detected across ${pg.sample_size} commerce-surface page(s). A single gateway is a single point of failure — one outage stops every transaction, and no fallback path exists. Heuristic detection; connect your commerce platform for a full-confidence reading.`,
    }));
  }

  // Discount abuse pattern — heuristic confidence 60. Emits when the
  // extractor found publicly-exposed promo codes across the scanned
  // pages; exposure>=0.05 means at least 1-in-20 pages carries a code.
  const da = heuristics.discount_abuse;
  if (da && da.exposure >= 0.05) {
    const severity = da.exposure > 0.30 ? 'high' : da.exposure > 0.15 ? 'medium' : 'low';
    const codeList = (da.exposed_codes ?? []).slice(0, 3).join(', ');
    const codeSuffix = da.exposed_codes && da.exposed_codes.length > 3
      ? ` (+${da.exposed_codes.length - 3} more)`
      : '';
    signals.push(createSignal({
      signal_key: 'discount_usage_elevated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.discount_usage_rate',
      value: severity,
      numeric_value: Math.round(da.exposure * 100),
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `Promo codes surfaced publicly on ${Math.round(da.exposure * 100)}% of ${da.sample_size} scanned pages${codeList ? ` (${codeList}${codeSuffix})` : ''}. When discounts are the default purchase path, full-price sales become the exception and margin erodes every month. Heuristic detection from visible marketing copy; connect your commerce platform for real usage rates.`,
    }));
  }

  // Checkout abandonment — heuristic confidence 60. The extractor enforces
  // the rate>=0.65 floor itself (only emits when payment forms carry 10+
  // fields), so any result here is above the inference engine's 0.60
  // activation threshold.
  const ca = heuristics.checkout_abandonment;
  if (ca) {
    const severity = ca.rate > 0.72 ? 'high' : ca.rate > 0.65 ? 'medium' : 'low';
    signals.push(createSignal({
      signal_key: 'checkout_abandonment_rate_high',
      category: SignalCategory.Commerce,
      attribute: 'commerce.checkout_abandonment_rate',
      value: severity,
      numeric_value: Math.round(ca.rate * 100),
      confidence: 60,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `Payment form friction implies ~${Math.round(ca.rate * 100)}% abandonment on ${ca.sample_size} payment surface(s). Long / multi-step payment forms drive buyers to abandon at the final step — every additional field past six adds measurable dropoff. Heuristic detection from form-field analysis; connect your commerce platform for the true rate.`,
    }));
  }

  // Refund rate — heuristic confidence 55. Rate pinned at 0.08 (just
  // above the inference engine's 0.05 activation threshold) because the
  // policy-friction proxy can't quantify magnitude, only signal presence.
  const rr = heuristics.refund_rate;
  if (rr) {
    signals.push(createSignal({
      signal_key: 'refund_rate_elevated',
      category: SignalCategory.Commerce,
      attribute: 'commerce.refund_rate',
      value: 'low',
      numeric_value: Math.round(rr.rate * 100),
      confidence: 55,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `Refund policy friction across ${rr.sample_size} policy page(s) — missing return-window or refund-process language, or policy word-counts outside the normal 150–2000 range. Hostile or buried refund paths correlate with higher actual refund rates because frustrated buyers escalate to chargebacks instead of returns. Heuristic detection from policy structure; connect your commerce platform for the true rate.`,
    }));
  }

  // Form-excessive-fields — heuristic confidence 55. Crawl-only fallback
  // for a signal the behavioral path emits at confidence 60. The
  // extractor itself suppresses when BehavioralSession evidence exists,
  // so this branch never double-emits against the pixel path.
  const ff = heuristics.form_excessive_fields;
  if (ff) {
    const severity =
      ff.form_count >= 3 ? 'high' : ff.form_count >= 2 ? 'medium' : 'low';
    const urlPreview = ff.form_urls.slice(0, 2).join(', ');
    const urlSuffix = ff.form_urls.length > 2 ? ` (+${ff.form_urls.length - 2} more)` : '';
    signals.push(createSignal({
      signal_key: 'form_excessive_fields_before_conversion',
      category: SignalCategory.Behavioral,
      attribute: 'behavioral.form_excessive',
      value: severity,
      numeric_value: ff.form_count,
      confidence: 55,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `${ff.form_count} conversion-proximate form(s) demand excessive input (up to ${ff.max_field_count} fields on ${urlPreview}${urlSuffix}). Long forms before the conversion step reduce completion rate measurably — every field past six adds dropoff. Heuristic detection from crawl evidence; instrument pixel tracking for behavior-confirmed rates.`,
    }));
  }

  // Sensitive-input trust gap — heuristic confidence 55 (below behavioral
  // cohort's 65). Severity high when any sensitive page has ZERO trust
  // signals, medium otherwise. Extractor auto-suppresses when behavioral
  // session evidence is present.
  const tg = heuristics.sensitive_input_trust_gap;
  if (tg) {
    const severity = tg.has_zero_trust_page ? 'high' : 'medium';
    const urlPreview = tg.example_urls.slice(0, 2).join(', ');
    const urlSuffix = tg.example_urls.length > 2 ? ` (+more)` : '';
    signals.push(createSignal({
      signal_key: 'sensitive_input_trust_gap',
      category: SignalCategory.Behavioral,
      attribute: 'cohort.trust.sensitive_input',
      value: severity,
      numeric_value: tg.gap_page_count,
      confidence: 55,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `${tg.gap_page_count} of ${tg.sensitive_page_count} page(s) asking for sensitive data (payment, password, ID) show fewer than 2 co-located trust signals (${urlPreview}${urlSuffix}). Buyers entering card numbers or personal data need visible reassurance — absent trust badges, reviews, or security seals drive abandonment at the most sensitive step. Heuristic detection from page-level proximity; instrument pixel tracking for behavior-confirmed abandonment rates.`,
    }));
  }

  // Mobile CTA timing — heuristic confidence 50 (lowest). The proxy
  // (journey friction vs late CTA render) is indirect, so we flag it as
  // weaker than other heuristics. Severity escalates on step failures,
  // which are stronger evidence than duration alone.
  const mct = heuristics.mobile_cta_timing;
  if (mct) {
    const severity =
      mct.total_steps_failed >= 2 || mct.max_duration_ms >= 15000
        ? 'high'
        : 'medium';
    signals.push(createSignal({
      signal_key: 'mobile_cta_timing_degraded',
      category: SignalCategory.Behavioral,
      attribute: 'cohort.mobile.cta_timing',
      value: severity,
      numeric_value: Math.round(mct.max_duration_ms / 1000),
      confidence: 50,
      scoping, cycle_ref, ids,
      evidence_refs: [],
      description: `Mobile commercial journey shows friction across ${mct.result_count} verification run(s): up to ${Math.round(mct.max_duration_ms / 1000)}s duration and ${mct.total_steps_failed} step failure(s) on reachable paths. Late-rendering or slow-to-interact CTAs are a likely cause. Heuristic proxy from mobile verification journeys; instrument pixel tracking for direct CTA render timing.`,
    }));
  }
}
