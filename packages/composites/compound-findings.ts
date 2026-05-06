// ──────────────────────────────────────────────
// Wave 4.7: Cross-Domain Compound Findings
//
// Detects causal chains that span multiple packs
// and produce multiplicative (not additive) impact.
// Compounds are always high-leverage findings that
// require ordered remediation.
//
// Runs AFTER the core pipeline and composites.
// Accepts FindingProjection[] OR the lightweight
// CompoundInput[] so it can run from both recompute
// (pre-projection) and from the projection layer.
// ──────────────────────────────────────────────

import type { FindingProjection } from '../projections/types';
import type { CommerceContext } from '../integrations';
import { INFERENCE_TO_PACK, INFERENCE_TITLES } from '../projections/engine';

// ── Types ──

/**
 * Lightweight finding representation for compound detection.
 * Can be built from Inference + QuantifiedValueCase in the
 * recompute pipeline without depending on the full projection layer.
 */
export interface CompoundInput {
  inference_key: string;
  pack: string;
  severity: string;
  surface: string;
  title: string;
  root_cause: string | null;
  impact_midpoint_cents: number;
}

export type CompoundType =
  | 'security_revenue_chain'
  | 'ad_promise_reality_behavior'
  | 'trust_hesitation_revenue'
  | 'post_purchase_chain'
  | 'brand_impersonation_revenue'
  | 'security_trust_double_exposure'
  | 'security_chargeback_compound'
  | 'copy_conversion_paralysis'
  | 'copy_pricing_confusion'
  | 'vertical_saas_trial_trust'
  | 'vertical_ecommerce_size_returns'
  | 'vertical_food_friction_chain'
  | 'performance_conversion_bleed'
  | 'mobile_revenue_compound'
  | 'stale_content_trust_erosion'
  | 'freshness_brand_decay'
  | 'invisible_commercial_pages'
  | 'seo_conversion_misalignment'
  | 'exposed_infrastructure_risk'
  | 'subdomain_trust_fragmentation';

export interface ChainLink {
  order: number;
  finding_key: string;
  pack: string;
  role: 'trigger' | 'consequence' | 'evidence';
  surface: string;
  description: string;
}

export interface CompoundFinding {
  id: string;
  compound_type: CompoundType;
  severity: 'critical' | 'high';
  chain: ChainLink[];
  combined_impact_cents: number;
  narrative: string;
  affected_surfaces: string[];
  packs_involved: string[];
  remediation_chain: string[];
  confidence: 'confirmed' | 'likely' | 'heuristic';
}

// ── Detection Helpers ──

const SECURITY_PACKS = new Set([
  'money_moment_exposure',
  'channel_integrity',
]);

const SECURITY_INFERENCE_KEYS = new Set([
  'security_header_weakness',
  'mixed_content_exposure',
  'sensitive_endpoint_exposed',
  'checkout_script_hijack_risk',
  'buyer_session_theft_risk',
  'checkout_clickjack_risk',
  'payment_data_unencrypted',
  'error_page_information_leak',
  'cors_misconfiguration_risk',
  'rate_limiting_absent_on_commerce',
  'predictable_order_urls',
  'payment_surface_compromised',
  'channel_traffic_divertible',
  'checkout_trust_brittle_infrastructure',
]);

const AD_TRACKING_KEYS = new Set([
  'ads_without_conversion_visibility',
  'measurement_blindspot',
  'measurement_coverage',
  'tracking_stack_gaps',
  'runtime_measurement_broken',
  'high_intent_surfaces_blind',
]);

const AD_MISMATCH_ROOT_CAUSES = new Set([
  'ad_landing_promise_gap',
]);

const TRUST_DECISION_KEYS = new Set([
  'trust_copy_absent_at_decision',
  'trust_break_in_checkout',
  'trust_surface_too_thin',
  'checkout_trust_language_absent',
]);

const POST_PURCHASE_KEYS = new Set([
  'post_purchase_confirmation_absent',
  'post_purchase_proof_too_weak',
  'refund_process_unclear',
  'refund_policy_gap',
  'refund_terms_too_thin',
  'copy_funnel_misalignment',
]);

const BRAND_IMPERSONATION_KEYS = new Set([
  'lookalike_domain_competing_for_traffic',
  'external_sites_mimicking_brand',
  'brand_traffic_exposed_to_deceptive_surfaces',
  'suspicious_domains_capturing_purchase_intent',
  'customers_exposed_to_phishing_surfaces',
  'brand_presence_diluted_across_variants',
]);

const BRAND_TRUST_KEYS = new Set([
  'brand_inconsistent_across_surfaces',
  'social_proof_ineffective',
  'social_previews_fail_commercial_value',
]);

const COPY_WEAK_KEYS = new Set([
  'cta_clarity_weak_on_commercial',
  'social_proof_ineffective',
  'social_proof_generic',
  'value_proposition_buried',
  'copy_cross_page_inconsistent',
]);

const FRESHNESS_KEYS = new Set([
  'commercial_page_stale',
  'pricing_page_outdated',
  'social_proof_expired',
  'content_decay_progression',
]);

const VERTICAL_SAAS_KEYS = new Set([
  'no_free_trial_offered',
  'integration_ecosystem_invisible',
  'changelog_stale_or_missing',
  'annual_discount_not_highlighted',
  'no_product_screenshot_visible',
]);

const VERTICAL_ECOMMERCE_KEYS = new Set([
  'size_guide_missing',
  'product_images_insufficient',
  'no_urgency_indicators',
  'cross_sell_absent',
  'return_policy_not_on_product',
]);

const MOBILE_KEYS = new Set([
  'mobile_commercial_path_blocked',
  'mobile_fails_first_commercial_action',
  'mobile_heavy_runtime_chain',
  'checkout_form_mobile_hostile',
  'form_submit_unreachable_mobile',
]);

const PRICING_KEYS = new Set([
  'pricing_page_framing_unclear',
  'pricing_hidden_behind_interaction',
  'pricing_currency_mismatch',
  'pricing_page_outdated',
]);

const DISCOVERABILITY_KEYS = new Set([
  'commercial_pages_not_exposed_for_discovery',
  'social_previews_fail_commercial_value',
  'brand_inconsistent_across_surfaces',
  'sitemap_missing_commercial_pages',
  'organic_cannibalization',
]);

const CHARGEBACK_KEYS = new Set([
  'refund_policy_gap',
  'refund_process_unclear',
  'refund_terms_too_thin',
  'post_purchase_proof_too_weak',
  'post_purchase_confirmation_absent',
]);

const SCALE_PERFORMANCE_KEYS = new Set([
  'commercial_pages_slow',
  'checkout_heavy_javascript',
  'lcp_above_threshold_on_commerce',
  'render_blocking_on_commercial_path',
]);

const SUBDOMAIN_EXPOSURE_KEYS = new Set([
  'admin_panel_exposed',
  'staging_environment_public',
  'internal_tool_indexed',
  'debug_endpoint_reachable',
]);

const CHANNEL_INTEGRITY_PAYMENT_KEYS = new Set([
  'payment_surface_compromised',
  'channel_traffic_divertible',
  'checkout_trust_brittle_infrastructure',
  'multiple_payment_subdomains',
]);

function severityRank(sev: string): number {
  switch (sev) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

function formatDollars(cents: number): string {
  const d = Math.abs(cents) / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (d >= 1_000) return `$${(d / 1_000).toFixed(0)}k`;
  return `$${Math.round(d)}`;
}

// Minimal surface lookup — avoids importing the full INFERENCE_SURFACES
// (which is not exported). Covers the keys needed for compound detection.
const COMPOUND_SURFACES: Record<string, string> = {
  trust_copy_absent_at_decision: '/checkout, /pricing',
  trust_break_in_checkout: '/checkout',
  trust_surface_too_thin: '/checkout',
  checkout_trust_language_absent: '/checkout',
  ads_without_conversion_visibility: 'Meta Ads / Google Ads (attribution)',
  measurement_blindspot: '/checkout → /thank-you',
  measurement_coverage: '/ (sitewide)',
  tracking_stack_gaps: '/ (sitewide measurement)',
  ad_creative_message_mismatch: 'Meta Ads / Google Ads → landing page',
  post_purchase_confirmation_absent: '/checkout → post-purchase',
  post_purchase_proof_too_weak: '/thank-you (confirmation)',
  refund_process_unclear: '/policies (refund process)',
  refund_policy_gap: '/policies',
  refund_terms_too_thin: '/policies (refund)',
};

/**
 * Build CompoundInput[] from raw Inference[] + QuantifiedValueCase[].
 * Used by recomputeAll() to feed compound detection without circular deps.
 */
export interface ValueCaseLike {
  inference_key: string;
  estimated_impact: { range: { min: number; max: number } };
}

export interface InferenceLike {
  inference_key: string;
  severity_hint: string | null;
  confidence: number;
  scoping: { surface_ref?: string | null } | any;
}

export function buildCompoundInputs(
  inferences: InferenceLike[],
  valueCases: ValueCaseLike[],
): CompoundInput[] {
  const impactMap = new Map<string, number>();
  for (const vc of valueCases) {
    const mid = (vc.estimated_impact.range.min + vc.estimated_impact.range.max) / 2;
    impactMap.set(vc.inference_key, mid);
  }

  const seen = new Set<string>();
  const results: CompoundInput[] = [];

  for (const inf of inferences) {
    if (seen.has(inf.inference_key)) continue;
    seen.add(inf.inference_key);

    const pack = INFERENCE_TO_PACK[inf.inference_key];
    if (!pack) continue;

    const title = INFERENCE_TITLES[inf.inference_key] || inf.inference_key;
    const surface = COMPOUND_SURFACES[inf.inference_key] || inf.scoping?.surface_ref || '/';
    const severity = inf.severity_hint || 'medium';
    const midpoint = impactMap.get(inf.inference_key) ?? 0;

    results.push({
      inference_key: inf.inference_key,
      pack,
      severity,
      surface,
      title,
      root_cause: null, // root cause resolved at projection layer
      impact_midpoint_cents: midpoint,
    });
  }

  return results;
}

// ── Normalization — accept both full projections and lightweight inputs ──

function normalizeInput(input: FindingProjection[] | CompoundInput[]): CompoundInput[] {
  if (input.length === 0) return [];
  const first = input[0];
  // If it has `inference_key` and `impact_midpoint_cents`, it's already CompoundInput
  if ('impact_midpoint_cents' in first) return input as CompoundInput[];
  // Otherwise it's FindingProjection[]
  return (input as FindingProjection[]).map(f => ({
    inference_key: f.inference_key,
    pack: f.pack,
    severity: f.severity,
    surface: f.surface,
    title: f.title,
    root_cause: f.root_cause,
    impact_midpoint_cents: f.impact.midpoint,
  }));
}

// ── Main Detection Function ──

export function detectCompoundFindings(
  findings: FindingProjection[] | CompoundInput[],
  commerceContext: CommerceContext | null,
  behavioralContext: any | null,
): CompoundFinding[] {
  const items = normalizeInput(findings);
  const compounds: CompoundFinding[] = [];

  // Run each detector
  const securityRevenue = detectSecurityRevenueChain(items, commerceContext);
  if (securityRevenue) compounds.push(securityRevenue);

  const adPromise = detectAdPromiseRealityBehavior(items, commerceContext, behavioralContext);
  if (adPromise) compounds.push(adPromise);

  const trustHesitation = detectTrustHesitationRevenue(items, commerceContext);
  if (trustHesitation) compounds.push(trustHesitation);

  const postPurchase = detectPostPurchaseChain(items, commerceContext);
  if (postPurchase) compounds.push(postPurchase);

  const brandImpersonation = detectBrandImpersonationRevenue(items, commerceContext);
  if (brandImpersonation) compounds.push(brandImpersonation);

  // ── New Wave 4.8 Compound Detectors ──

  const securityTrustDouble = detectSecurityTrustDoubleExposure(items);
  if (securityTrustDouble) compounds.push(securityTrustDouble);

  const securityChargeback = detectSecurityChargebackCompound(items);
  if (securityChargeback) compounds.push(securityChargeback);

  const copyParalysis = detectCopyConversionParalysis(items);
  if (copyParalysis) compounds.push(copyParalysis);

  const copyPricing = detectCopyPricingConfusion(items);
  if (copyPricing) compounds.push(copyPricing);

  const verticalSaasTrial = detectVerticalSaasTrialTrust(items);
  if (verticalSaasTrial) compounds.push(verticalSaasTrial);

  const verticalEcommerceSize = detectVerticalEcommerceSizeReturns(items);
  if (verticalEcommerceSize) compounds.push(verticalEcommerceSize);

  const verticalFoodFriction = detectVerticalFoodFrictionChain(items);
  if (verticalFoodFriction) compounds.push(verticalFoodFriction);

  const performanceBleed = detectPerformanceConversionBleed(items);
  if (performanceBleed) compounds.push(performanceBleed);

  const mobileRevenue = detectMobileRevenueCompound(items);
  if (mobileRevenue) compounds.push(mobileRevenue);

  const staleContent = detectStaleContentTrustErosion(items);
  if (staleContent) compounds.push(staleContent);

  const freshnessBrand = detectFreshnessBrandDecay(items);
  if (freshnessBrand) compounds.push(freshnessBrand);

  const invisiblePages = detectInvisibleCommercialPages(items);
  if (invisiblePages) compounds.push(invisiblePages);

  const seoMisalignment = detectSeoConversionMisalignment(items);
  if (seoMisalignment) compounds.push(seoMisalignment);

  const exposedInfra = detectExposedInfrastructureRisk(items);
  if (exposedInfra) compounds.push(exposedInfra);

  const subdomainTrust = detectSubdomainTrustFragmentation(items);
  if (subdomainTrust) compounds.push(subdomainTrust);

  // Sort by impact descending
  compounds.sort((a, b) => b.combined_impact_cents - a.combined_impact_cents);

  return compounds;
}

// ── 1. Security Revenue Chain ──

function detectSecurityRevenueChain(
  findings: CompoundInput[],
  commerceContext: CommerceContext | null,
): CompoundFinding | null {
  // Find security findings (severity >= medium)
  const securityFindings = findings.filter(f =>
    (SECURITY_PACKS.has(f.pack) || SECURITY_INFERENCE_KEYS.has(f.inference_key)) &&
    severityRank(f.severity) >= 2,
  );
  if (securityFindings.length === 0) return null;

  // Check for ad tracking issues
  const trackingFindings = findings.filter(f => AD_TRACKING_KEYS.has(f.inference_key));
  const hasAdSpend = commerceContext?.total_ad_spend_monthly != null && commerceContext.total_ad_spend_monthly > 0;

  if (trackingFindings.length === 0 && !hasAdSpend) return null;

  // Build chain
  const topSecurity = securityFindings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  const surfaces = new Set<string>();
  surfaces.add(topSecurity.surface);

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topSecurity.inference_key,
      pack: topSecurity.pack,
      role: 'trigger',
      surface: topSecurity.surface,
      description: topSecurity.title,
    },
  ];

  if (trackingFindings.length > 0) {
    const topTracking = trackingFindings[0];
    surfaces.add(topTracking.surface);
    chain.push({
      order: 2,
      finding_key: topTracking.inference_key,
      pack: topTracking.pack,
      role: 'consequence',
      surface: topTracking.surface,
      description: topTracking.title,
    });
  }

  chain.push({
    order: 3,
    finding_key: 'attribution_blind',
    pack: 'revenue_integrity',
    role: 'consequence',
    surface: '/ (sitewide)',
    description: 'Attribution blind — unable to measure campaign effectiveness',
  });

  // Impact: 30% of ad spend wasted without attribution
  const adSpendMonthly = commerceContext?.total_ad_spend_monthly ?? 0;
  const impactCents = adSpendMonthly > 0
    ? Math.round(adSpendMonthly * 0.3 * 100) // convert to cents
    : Math.round(topSecurity.impact_midpoint_cents * 2); // fallback: 2x the security finding impact

  const packsInvolved = [...new Set(chain.map(c => c.pack))];
  const affectedSurfaces = [...surfaces];

  const adSpendStr = adSpendMonthly > 0 ? formatDollars(adSpendMonthly * 100) : 'unknown';
  const narrative = `Your ${topSecurity.title.toLowerCase()} on ${topSecurity.surface} is blocking tracking scripts. ` +
    `With ${adSpendStr}/mo in ads, you're flying blind on which campaigns convert.`;

  return {
    id: `compound_security_revenue_chain_${topSecurity.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'security_revenue_chain',
    severity: severityRank(topSecurity.severity) >= 3 ? 'critical' : 'high',
    chain,
    combined_impact_cents: impactCents,
    narrative,
    affected_surfaces: affectedSurfaces,
    packs_involved: packsInvolved,
    remediation_chain: [
      `Fix security issue: ${topSecurity.title}`,
      'Verify tracking scripts load after security fix',
      'Confirm conversion attribution is flowing',
    ],
    confidence: trackingFindings.length > 0 && hasAdSpend ? 'confirmed' : 'likely',
  };
}

// ── 2. Ad Promise Reality Behavior ──

function detectAdPromiseRealityBehavior(
  findings: CompoundInput[],
  commerceContext: CommerceContext | null,
  behavioralContext: any | null,
): CompoundFinding | null {
  // Find ad mismatch findings
  const adMismatchFindings = findings.filter(f =>
    AD_MISMATCH_ROOT_CAUSES.has(f.root_cause ?? '') ||
    f.inference_key === 'ad_creative_message_mismatch',
  );
  if (adMismatchFindings.length === 0) return null;

  const topMismatch = adMismatchFindings[0];
  const surface = topMismatch.surface;

  // Check behavioral evidence
  const hasBehavioralBounce = behavioralContext?.bounce_rate != null && behavioralContext.bounce_rate > 70;
  const hasShortSession = behavioralContext?.avg_session_duration != null && behavioralContext.avg_session_duration < 10;
  const hasBehavioralEvidence = hasBehavioralBounce || hasShortSession;

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topMismatch.inference_key,
      pack: topMismatch.pack,
      role: 'trigger',
      surface,
      description: topMismatch.title,
    },
  ];

  if (hasBehavioralEvidence) {
    chain.push({
      order: 2,
      finding_key: 'behavioral_bounce',
      pack: 'first_impression',
      role: 'evidence',
      surface,
      description: `High bounce rate (${behavioralContext?.bounce_rate ?? '>70'}%) or very short sessions`,
    });
  }

  chain.push({
    order: hasBehavioralEvidence ? 3 : 2,
    finding_key: 'ad_spend_wasted',
    pack: 'revenue_integrity',
    role: 'consequence',
    surface,
    description: 'Ad spend wasted on mismatched landing experience',
  });

  // Impact calculation
  const adSpendMonthly = commerceContext?.total_ad_spend_monthly ?? 0;
  let impactCents: number;
  if (hasBehavioralEvidence && adSpendMonthly > 0) {
    const excessBounce = Math.max(0, (behavioralContext?.bounce_rate ?? 70) - 40) / 100;
    impactCents = Math.round(adSpendMonthly * excessBounce * 100);
  } else if (adSpendMonthly > 0) {
    impactCents = Math.round(adSpendMonthly * 0.25 * 100);
  } else {
    impactCents = Math.round(topMismatch.impact_midpoint_cents * 1.5);
  }

  const bounceInfo = hasBehavioralEvidence
    ? `Bounce rate: ${behavioralContext?.bounce_rate ?? '>70'}%`
    : 'Behavioral data suggests visitors leave quickly';

  const narrative = `Your ad promises something your landing page doesn't deliver. ` +
    `${bounceInfo}. Estimated waste: ${formatDollars(impactCents)}/mo.`;

  const packsInvolved = [...new Set(chain.map(c => c.pack))];

  return {
    id: `compound_ad_promise_reality_${surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'ad_promise_reality_behavior',
    severity: 'high',
    chain,
    combined_impact_cents: impactCents,
    narrative,
    affected_surfaces: [surface],
    packs_involved: packsInvolved,
    remediation_chain: [
      'Align landing page messaging with ad creative claims',
      'Ensure page loads fast and delivers on the promised value immediately',
      'Re-check bounce rate after alignment fix',
    ],
    confidence: hasBehavioralEvidence ? 'confirmed' : 'heuristic',
  };
}

// ── 3. Trust Hesitation Revenue ──

function detectTrustHesitationRevenue(
  findings: CompoundInput[],
  commerceContext: CommerceContext | null,
): CompoundFinding | null {
  // Find trust-absent-at-decision findings on checkout/pricing pages
  const trustFindings = findings.filter(f =>
    TRUST_DECISION_KEYS.has(f.inference_key) &&
    (f.surface.includes('checkout') || f.surface.includes('pricing') || f.surface.includes('cart')),
  );
  if (trustFindings.length === 0) return null;

  const topTrust = trustFindings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];

  // Check commerce data for abandonment
  const hasCommerceAbandonment = commerceContext?.abandonment_rate != null && commerceContext.abandonment_rate > 50;
  const abandonmentRate = commerceContext?.abandonment_rate ?? null;

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topTrust.inference_key,
      pack: topTrust.pack,
      role: 'trigger',
      surface: topTrust.surface,
      description: topTrust.title,
    },
    {
      order: 2,
      finding_key: 'hesitation_abandonment',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topTrust.surface,
      description: abandonmentRate != null
        ? `Checkout abandonment at ${abandonmentRate.toFixed(0)}%`
        : 'Buyers hesitate and abandon without trust signals',
    },
    {
      order: 3,
      finding_key: 'trust_attributed_revenue_loss',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topTrust.surface,
      description: 'Revenue lost due to trust-attributed abandonment',
    },
  ];

  // Impact calculation
  let impactCents: number;
  if (hasCommerceAbandonment && commerceContext?.abandonment_value_monthly != null) {
    // 35% of abandonment value attributed to trust
    impactCents = Math.round(commerceContext.abandonment_value_monthly * 0.35 * 100);
  } else {
    // Fallback: use finding impact as baseline
    impactCents = Math.round(topTrust.impact_midpoint_cents * 2.5);
  }

  const rateStr = abandonmentRate != null ? `${abandonmentRate.toFixed(0)}%` : 'elevated';
  const narrative = `Your checkout page has no security badges, guarantees, or trust signals. ` +
    `Abandonment rate: ${rateStr}. Estimated trust-attributed loss: ${formatDollars(impactCents)}/mo.`;

  return {
    id: `compound_trust_hesitation_${topTrust.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'trust_hesitation_revenue',
    severity: hasCommerceAbandonment ? 'critical' : 'high',
    chain,
    combined_impact_cents: impactCents,
    narrative,
    affected_surfaces: [topTrust.surface],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Add security badges and trust seals to checkout page',
      'Add money-back guarantee or satisfaction promise',
      'Show social proof near payment form',
      'Verify abandonment rate decreases after changes',
    ],
    confidence: hasCommerceAbandonment ? 'confirmed' : 'heuristic',
  };
}

// ── 4. Post-Purchase Chain ──

function detectPostPurchaseChain(
  findings: CompoundInput[],
  commerceContext: CommerceContext | null,
): CompoundFinding | null {
  // Find post-purchase related findings
  const postPurchaseFindings = findings.filter(f => POST_PURCHASE_KEYS.has(f.inference_key));
  if (postPurchaseFindings.length === 0) return null;

  // Check commerce data for disputes/refunds
  const hasHighRefunds = commerceContext?.refund_rate != null && commerceContext.refund_rate > 5;
  // Dispute rate threshold: 0.5%
  // We don't have dispute_rate in CommerceContext directly, so derive from refund_rate
  const hasCommerceEvidence = hasHighRefunds;

  if (!hasCommerceEvidence && postPurchaseFindings.length < 2) return null;

  const topFinding = postPurchaseFindings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topFinding.inference_key,
      pack: topFinding.pack,
      role: 'trigger',
      surface: topFinding.surface,
      description: topFinding.title,
    },
    {
      order: 2,
      finding_key: 'customer_uncertainty',
      pack: 'chargeback_resilience',
      role: 'consequence',
      surface: topFinding.surface,
      description: 'Customers uncertain about purchase outcome',
    },
    {
      order: 3,
      finding_key: 'disputes_refunds',
      pack: 'chargeback_resilience',
      role: 'consequence',
      surface: '/ (sitewide)',
      description: hasHighRefunds
        ? `Refund rate: ${(commerceContext!.refund_rate! * 100).toFixed(1)}%`
        : 'Elevated dispute/refund risk from poor post-purchase experience',
    },
  ];

  // Impact: dispute costs
  let impactCents: number;
  if (hasHighRefunds && commerceContext?.refund_rate != null) {
    // Excess refund rate * estimated monthly transactions * avg order value
    const excessRate = commerceContext.refund_rate - 0.03; // 3% baseline
    const aov = commerceContext.avg_customer_lifetime_value ?? 5000; // fallback $50
    // Estimate monthly transactions from abandonment data or LTV
    const monthlyTransactions = commerceContext.abandonment_value_monthly
      ? Math.round(commerceContext.abandonment_value_monthly / (aov / 100) * 0.5)
      : 100;
    impactCents = Math.round(excessRate * monthlyTransactions * aov);
  } else {
    impactCents = Math.round(
      postPurchaseFindings.reduce((sum, f) => sum + f.impact_midpoint_cents, 0) * 1.5,
    );
  }

  const refundStr = hasHighRefunds && commerceContext?.refund_rate != null
    ? `Refund rate: ${(commerceContext.refund_rate * 100).toFixed(1)}%.`
    : 'Post-purchase experience gaps detected.';
  const narrative = `Your confirmation page doesn't show delivery timeline or tracking info. ` +
    `${refundStr} Direct cost: ${formatDollars(impactCents)}/mo.`;

  return {
    id: `compound_post_purchase_${topFinding.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'post_purchase_chain',
    severity: hasHighRefunds ? 'critical' : 'high',
    chain,
    combined_impact_cents: impactCents,
    narrative,
    affected_surfaces: [...new Set(postPurchaseFindings.map(f => f.surface))],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Add delivery timeline and tracking info to confirmation page',
      'Clarify refund policy on post-purchase pages',
      'Add proactive customer communication about order status',
      'Monitor refund/dispute rates after changes',
    ],
    confidence: hasCommerceEvidence ? 'confirmed' : 'likely',
  };
}

// ── 5. Brand Impersonation Revenue ──

// ── 6. Security Trust Double Exposure ──

function detectSecurityTrustDoubleExposure(
  findings: CompoundInput[],
): CompoundFinding | null {
  const securityFindings = findings.filter(f =>
    (SECURITY_PACKS.has(f.pack) || SECURITY_INFERENCE_KEYS.has(f.inference_key)) &&
    severityRank(f.severity) >= 2 &&
    f.surface.includes('checkout'),
  );
  if (securityFindings.length === 0) return null;

  const trustFindings = findings.filter(f =>
    TRUST_DECISION_KEYS.has(f.inference_key) &&
    f.surface.includes('checkout'),
  );
  if (trustFindings.length === 0) return null;

  const topSecurity = securityFindings[0];
  const topTrust = trustFindings[0];

  const combinedImpact = Math.round(
    (topSecurity.impact_midpoint_cents + topTrust.impact_midpoint_cents) * 1.5,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topSecurity.inference_key,
      pack: topSecurity.pack,
      role: 'trigger',
      surface: topSecurity.surface,
      description: topSecurity.title,
    },
    {
      order: 2,
      finding_key: topTrust.inference_key,
      pack: topTrust.pack,
      role: 'trigger',
      surface: topTrust.surface,
      description: topTrust.title,
    },
    {
      order: 3,
      finding_key: 'double_exposure_revenue_loss',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: '/checkout',
      description: 'Perda de receita por exposição dupla no checkout',
    },
  ];

  return {
    id: `compound_security_trust_double_exposure_checkout`,
    compound_type: 'security_trust_double_exposure',
    severity: 'critical',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Seu checkout tem falhas de segurança E nada tranquiliza o comprador — risco duplo que custa ${formatDollars(combinedImpact)}/mês em abandonos.`,
    affected_surfaces: ['/checkout'],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Corrigir vulnerabilidades de segurança no checkout',
      'Adicionar selos de confiança e garantias visíveis',
      'Verificar queda na taxa de abandono após correções',
    ],
    confidence: 'confirmed',
  };
}

// ── 7. Security Chargeback Compound ──

function detectSecurityChargebackCompound(
  findings: CompoundInput[],
): CompoundFinding | null {
  const securityFindings = findings.filter(f =>
    (SECURITY_PACKS.has(f.pack) || SECURITY_INFERENCE_KEYS.has(f.inference_key)) &&
    severityRank(f.severity) >= 2,
  );
  if (securityFindings.length === 0) return null;

  const chargebackFindings = findings.filter(f => CHARGEBACK_KEYS.has(f.inference_key));
  if (chargebackFindings.length === 0) return null;

  const topSecurity = securityFindings[0];
  const topChargeback = chargebackFindings[0];

  const combinedImpact = Math.round(
    (topSecurity.impact_midpoint_cents + topChargeback.impact_midpoint_cents) * 1.8,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topSecurity.inference_key,
      pack: topSecurity.pack,
      role: 'trigger',
      surface: topSecurity.surface,
      description: topSecurity.title,
    },
    {
      order: 2,
      finding_key: topChargeback.inference_key,
      pack: topChargeback.pack,
      role: 'trigger',
      surface: topChargeback.surface,
      description: topChargeback.title,
    },
    {
      order: 3,
      finding_key: 'chargeback_escalation',
      pack: 'chargeback_resilience',
      role: 'consequence',
      surface: '/ (sitewide)',
      description: 'Escalada de chargebacks por insegurança + políticas ausentes',
    },
  ];

  return {
    id: `compound_security_chargeback_${topSecurity.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'security_chargeback_compound',
    severity: 'critical',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Falhas de segurança + políticas ausentes = receita para chargebacks em massa. Custo estimado: ${formatDollars(combinedImpact)}/mês entre estornos e taxas.`,
    affected_surfaces: [...new Set([topSecurity.surface, topChargeback.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Corrigir falhas de segurança prioritárias',
      'Publicar política de reembolso clara e acessível',
      'Adicionar canal de suporte visível antes do estorno',
    ],
    confidence: 'confirmed',
  };
}

// ── 8. Copy Conversion Paralysis ──

function detectCopyConversionParalysis(
  findings: CompoundInput[],
): CompoundFinding | null {
  const ctaFindings = findings.filter(f => f.inference_key === 'cta_clarity_weak_on_commercial');
  if (ctaFindings.length === 0) return null;

  const socialProofFindings = findings.filter(f =>
    f.inference_key === 'social_proof_ineffective' || f.inference_key === 'social_proof_generic',
  );
  if (socialProofFindings.length === 0) return null;

  const topCta = ctaFindings[0];
  const topSocial = socialProofFindings[0];

  const combinedImpact = Math.round(
    (topCta.impact_midpoint_cents + topSocial.impact_midpoint_cents) * 1.6,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topCta.inference_key,
      pack: topCta.pack,
      role: 'trigger',
      surface: topCta.surface,
      description: topCta.title,
    },
    {
      order: 2,
      finding_key: topSocial.inference_key,
      pack: topSocial.pack,
      role: 'trigger',
      surface: topSocial.surface,
      description: topSocial.title,
    },
    {
      order: 3,
      finding_key: 'conversion_paralysis',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topCta.surface,
      description: 'Paralisia de conversão — visitante não sabe o que fazer nem por que confiar',
    },
  ];

  return {
    id: `compound_copy_conversion_paralysis_${topCta.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'copy_conversion_paralysis',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Ninguém sabe o que clicar E não tem motivo para confiar — dois bloqueios simultâneos que custam ${formatDollars(combinedImpact)}/mês em conversões perdidas.`,
    affected_surfaces: [...new Set([topCta.surface, topSocial.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Reescrever CTAs com ação clara e benefício explícito',
      'Substituir prova social genérica por depoimentos específicos com números',
      'Testar variações e medir taxa de clique',
    ],
    confidence: 'confirmed',
  };
}

// ── 9. Copy Pricing Confusion ──

function detectCopyPricingConfusion(
  findings: CompoundInput[],
): CompoundFinding | null {
  const copyFindings = findings.filter(f => COPY_WEAK_KEYS.has(f.inference_key));
  if (copyFindings.length === 0) return null;

  const pricingFindings = findings.filter(f => PRICING_KEYS.has(f.inference_key));
  if (pricingFindings.length === 0) return null;

  const topCopy = copyFindings[0];
  const topPricing = pricingFindings[0];

  const combinedImpact = Math.round(
    (topCopy.impact_midpoint_cents + topPricing.impact_midpoint_cents) * 1.5,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topCopy.inference_key,
      pack: topCopy.pack,
      role: 'trigger',
      surface: topCopy.surface,
      description: topCopy.title,
    },
    {
      order: 2,
      finding_key: topPricing.inference_key,
      pack: topPricing.pack,
      role: 'trigger',
      surface: topPricing.surface,
      description: topPricing.title,
    },
    {
      order: 3,
      finding_key: 'double_confusion_drop',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topPricing.surface,
      description: 'Desistência dupla — mensagem não convence e preço não faz sentido',
    },
  ];

  return {
    id: `compound_copy_pricing_confusion_${topPricing.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'copy_pricing_confusion',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `A mensagem não convence E o preço não faz sentido — o comprador desiste duas vezes antes de chegar no checkout. Perda: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topCopy.surface, topPricing.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Alinhar proposta de valor com a estrutura de preços',
      'Reescrever copy da página de preços com ancoragem de valor',
      'Adicionar comparativo claro entre planos',
    ],
    confidence: 'confirmed',
  };
}

// ── 10. Vertical SaaS Trial Trust ──

function detectVerticalSaasTrialTrust(
  findings: CompoundInput[],
): CompoundFinding | null {
  const saasFindings = findings.filter(f => VERTICAL_SAAS_KEYS.has(f.inference_key));
  if (saasFindings.length === 0) return null;

  const copyFindings = findings.filter(f => COPY_WEAK_KEYS.has(f.inference_key));
  if (copyFindings.length === 0) return null;

  const topSaas = saasFindings[0];
  const topCopy = copyFindings[0];

  const combinedImpact = Math.round(
    (topSaas.impact_midpoint_cents + topCopy.impact_midpoint_cents) * 1.4,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topSaas.inference_key,
      pack: topSaas.pack,
      role: 'trigger',
      surface: topSaas.surface,
      description: topSaas.title,
    },
    {
      order: 2,
      finding_key: topCopy.inference_key,
      pack: topCopy.pack,
      role: 'trigger',
      surface: topCopy.surface,
      description: topCopy.title,
    },
    {
      order: 3,
      finding_key: 'saas_barrier_compound',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topSaas.surface,
      description: 'Barreira dupla — incompreensão do produto + risco financeiro sem trial',
    },
  ];

  return {
    id: `compound_vertical_saas_trial_trust_${topSaas.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'vertical_saas_trial_trust',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `O comprador não entende o produto E não pode testar — barreira dupla que bloqueia ${formatDollars(combinedImpact)}/mês em assinaturas potenciais.`,
    affected_surfaces: [...new Set([topSaas.surface, topCopy.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Implementar trial gratuito ou demo interativa',
      'Reescrever proposta de valor com benefícios concretos',
      'Adicionar screenshots e vídeo do produto em uso',
    ],
    confidence: 'likely',
  };
}

// ── 11. Vertical Ecommerce Size Returns ──

function detectVerticalEcommerceSizeReturns(
  findings: CompoundInput[],
): CompoundFinding | null {
  const sizeFindings = findings.filter(f => f.inference_key === 'size_guide_missing');
  if (sizeFindings.length === 0) return null;

  const returnFindings = findings.filter(f =>
    f.inference_key === 'refund_policy_gap' ||
    f.inference_key === 'refund_process_unclear' ||
    f.inference_key === 'return_policy_not_on_product',
  );
  if (returnFindings.length === 0) return null;

  const topSize = sizeFindings[0];
  const topReturn = returnFindings[0];

  const combinedImpact = Math.round(
    (topSize.impact_midpoint_cents + topReturn.impact_midpoint_cents) * 1.7,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topSize.inference_key,
      pack: topSize.pack,
      role: 'trigger',
      surface: topSize.surface,
      description: topSize.title,
    },
    {
      order: 2,
      finding_key: topReturn.inference_key,
      pack: topReturn.pack,
      role: 'trigger',
      surface: topReturn.surface,
      description: topReturn.title,
    },
    {
      order: 3,
      finding_key: 'return_cost_escalation',
      pack: 'chargeback_resilience',
      role: 'consequence',
      surface: topSize.surface,
      description: 'Devoluções em massa por tamanho errado + política confusa',
    },
  ];

  return {
    id: `compound_vertical_ecommerce_size_returns_${topSize.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'vertical_ecommerce_size_returns',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Sem guia de tamanho E sem política clara de devolução — o comprador que arrisca VAI devolver. Custo em logística reversa: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topSize.surface, topReturn.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Criar guia de tamanhos com medidas reais e comparações',
      'Publicar política de devolução na página do produto',
      'Monitorar taxa de devolução por categoria',
    ],
    confidence: 'confirmed',
  };
}

// ── 12. Vertical Food Friction Chain ──

function detectVerticalFoodFrictionChain(
  findings: CompoundInput[],
): CompoundFinding | null {
  const menuFindings = findings.filter(f => f.inference_key === 'menu_requires_signup');
  if (menuFindings.length === 0) return null;

  const deliveryFindings = findings.filter(f => f.inference_key === 'delivery_area_unclear');
  if (deliveryFindings.length === 0) return null;

  const topMenu = menuFindings[0];
  const topDelivery = deliveryFindings[0];

  const combinedImpact = Math.round(
    (topMenu.impact_midpoint_cents + topDelivery.impact_midpoint_cents) * 1.6,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topMenu.inference_key,
      pack: topMenu.pack,
      role: 'trigger',
      surface: topMenu.surface,
      description: topMenu.title,
    },
    {
      order: 2,
      finding_key: topDelivery.inference_key,
      pack: topDelivery.pack,
      role: 'trigger',
      surface: topDelivery.surface,
      description: topDelivery.title,
    },
    {
      order: 3,
      finding_key: 'food_order_abandonment',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topMenu.surface,
      description: 'Abandono antes do pedido — duas barreiras pré-decisão',
    },
  ];

  return {
    id: `compound_vertical_food_friction_${topMenu.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'vertical_food_friction_chain',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `O cliente não vê o cardápio E não sabe se entrega na região dele — duas barreiras antes de PENSAR em pedir. Pedidos perdidos: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topMenu.surface, topDelivery.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Liberar cardápio sem exigir cadastro',
      'Mostrar área de entrega com CEP ou mapa antes do pedido',
      'Medir taxa de conversão visitante → pedido após mudanças',
    ],
    confidence: 'confirmed',
  };
}

// ── 13. Performance Conversion Bleed ──

function detectPerformanceConversionBleed(
  findings: CompoundInput[],
): CompoundFinding | null {
  const perfFindings = findings.filter(f => SCALE_PERFORMANCE_KEYS.has(f.inference_key));
  if (perfFindings.length === 0) return null;

  const revenueFindings = findings.filter(f =>
    f.pack === 'revenue_integrity' && severityRank(f.severity) >= 2,
  );
  if (revenueFindings.length === 0) return null;

  const topPerf = perfFindings[0];
  const topRevenue = revenueFindings[0];

  const combinedImpact = Math.round(
    (topPerf.impact_midpoint_cents + topRevenue.impact_midpoint_cents) * 1.5,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topPerf.inference_key,
      pack: topPerf.pack,
      role: 'trigger',
      surface: topPerf.surface,
      description: topPerf.title,
    },
    {
      order: 2,
      finding_key: topRevenue.inference_key,
      pack: topRevenue.pack,
      role: 'evidence',
      surface: topRevenue.surface,
      description: topRevenue.title,
    },
    {
      order: 3,
      finding_key: 'speed_revenue_multiplier',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topPerf.surface,
      description: 'Cada segundo de atraso multiplica o abandono nas páginas com vazamento',
    },
  ];

  return {
    id: `compound_performance_conversion_bleed_${topPerf.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'performance_conversion_bleed',
    severity: 'critical',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Suas páginas comerciais são as mais lentas do site E já estão vazando receita — cada segundo de atraso multiplica o abandono. Impacto: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topPerf.surface, topRevenue.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Otimizar LCP e remover JS bloqueante nas páginas comerciais',
      'Corrigir vazamentos de receita identificados',
      'Medir conversão antes/depois da otimização de velocidade',
    ],
    confidence: 'confirmed',
  };
}

// ── 14. Mobile Revenue Compound ──

function detectMobileRevenueCompound(
  findings: CompoundInput[],
): CompoundFinding | null {
  const mobileFindings = findings.filter(f => MOBILE_KEYS.has(f.inference_key));
  if (mobileFindings.length === 0) return null;

  const formCheckoutFindings = findings.filter(f =>
    f.inference_key === 'checkout_form_mobile_hostile' ||
    f.inference_key === 'form_submit_unreachable_mobile' ||
    (f.pack === 'revenue_integrity' && f.surface.includes('checkout')),
  );
  // Need mobile nav issue + form/checkout issue (can be from same MOBILE_KEYS set)
  const navFindings = mobileFindings.filter(f =>
    f.inference_key === 'mobile_commercial_path_blocked' ||
    f.inference_key === 'mobile_fails_first_commercial_action',
  );
  if (navFindings.length === 0) return null;

  const frictionFindings = formCheckoutFindings.length > 0
    ? formCheckoutFindings
    : mobileFindings.filter(f =>
        f.inference_key === 'checkout_form_mobile_hostile' ||
        f.inference_key === 'form_submit_unreachable_mobile',
      );
  if (frictionFindings.length === 0) return null;

  const topNav = navFindings[0];
  const topFriction = frictionFindings[0];

  const combinedImpact = Math.round(
    (topNav.impact_midpoint_cents + topFriction.impact_midpoint_cents) * 1.8,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topNav.inference_key,
      pack: topNav.pack,
      role: 'trigger',
      surface: topNav.surface,
      description: topNav.title,
    },
    {
      order: 2,
      finding_key: topFriction.inference_key,
      pack: topFriction.pack,
      role: 'trigger',
      surface: topFriction.surface,
      description: topFriction.title,
    },
    {
      order: 3,
      finding_key: 'mobile_revenue_blocked',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: '/checkout (mobile)',
      description: 'Receita mobile bloqueada em dois pontos do funil',
    },
  ];

  return {
    id: `compound_mobile_revenue_${topNav.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'mobile_revenue_compound',
    severity: 'critical',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Compradores no celular não conseguem nem navegar até o checkout — e quando conseguem, o formulário é hostil ao toque. Receita mobile perdida: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topNav.surface, topFriction.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Destravar caminho comercial no mobile (menu, navegação, CTAs)',
      'Redesenhar formulário de checkout para touch-first',
      'Testar fluxo completo em dispositivos reais',
    ],
    confidence: 'confirmed',
  };
}

// ── 15. Stale Content Trust Erosion ──

function detectStaleContentTrustErosion(
  findings: CompoundInput[],
): CompoundFinding | null {
  const freshnessFindings = findings.filter(f => FRESHNESS_KEYS.has(f.inference_key));
  if (freshnessFindings.length < 2) return null;

  const totalImpact = freshnessFindings.reduce((sum, f) => sum + f.impact_midpoint_cents, 0);
  const combinedImpact = Math.round(totalImpact * 1.4);

  const chain: ChainLink[] = freshnessFindings.slice(0, 3).map((f, i) => ({
    order: i + 1,
    finding_key: f.inference_key,
    pack: f.pack,
    role: (i === 0 ? 'trigger' : 'evidence') as 'trigger' | 'evidence',
    surface: f.surface,
    description: f.title,
  }));

  chain.push({
    order: chain.length + 1,
    finding_key: 'perceived_abandonment',
    pack: 'revenue_integrity',
    role: 'consequence',
    surface: '/ (sitewide)',
    description: 'Comprador conclui que a empresa não existe mais',
  });

  return {
    id: `compound_stale_content_trust_erosion`,
    compound_type: 'stale_content_trust_erosion',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Nada no site foi atualizado — conteúdo velho, prova social desatualizada. O comprador conclui que a empresa morreu. Custo: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set(freshnessFindings.map(f => f.surface))],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Atualizar depoimentos e provas sociais com dados recentes',
      'Revisar conteúdo comercial com datas e números atuais',
      'Implementar rotina mensal de atualização de conteúdo',
    ],
    confidence: 'confirmed',
  };
}

// ── 16. Freshness Brand Decay ──

function detectFreshnessBrandDecay(
  findings: CompoundInput[],
): CompoundFinding | null {
  const freshnessFindings = findings.filter(f => FRESHNESS_KEYS.has(f.inference_key));
  if (freshnessFindings.length === 0) return null;

  const brandFindings = findings.filter(f =>
    f.inference_key === 'brand_inconsistent_across_surfaces' ||
    (DISCOVERABILITY_KEYS.has(f.inference_key) && f.pack === 'discoverability'),
  );
  if (brandFindings.length === 0) return null;

  const topFreshness = freshnessFindings[0];
  const topBrand = brandFindings[0];

  const combinedImpact = Math.round(
    (topFreshness.impact_midpoint_cents + topBrand.impact_midpoint_cents) * 1.3,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topFreshness.inference_key,
      pack: topFreshness.pack,
      role: 'trigger',
      surface: topFreshness.surface,
      description: topFreshness.title,
    },
    {
      order: 2,
      finding_key: topBrand.inference_key,
      pack: topBrand.pack,
      role: 'trigger',
      surface: topBrand.surface,
      description: topBrand.title,
    },
    {
      order: 3,
      finding_key: 'brand_decay_compound',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: '/ (sitewide)',
      description: 'Percepção de marca abandonada afasta compradores',
    },
  ];

  return {
    id: `compound_freshness_brand_decay_${topFreshness.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'freshness_brand_decay',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Conteúdo desatualizado + marca inconsistente entre plataformas — o comprador não sabe se está no site oficial ou num clone abandonado. Perda: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topFreshness.surface, topBrand.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Unificar identidade visual em todas as plataformas',
      'Atualizar conteúdo com datas e informações correntes',
      'Sincronizar perfis sociais com site principal',
    ],
    confidence: 'likely',
  };
}

// ── 17. Invisible Commercial Pages ──

function detectInvisibleCommercialPages(
  findings: CompoundInput[],
): CompoundFinding | null {
  const discoverFindings = findings.filter(f =>
    f.inference_key === 'commercial_pages_not_exposed_for_discovery' ||
    f.inference_key === 'sitemap_missing_commercial_pages',
  );
  if (discoverFindings.length === 0) return null;

  const revenueFindings = findings.filter(f =>
    f.pack === 'revenue_integrity' && severityRank(f.severity) >= 2,
  );
  if (revenueFindings.length === 0) return null;

  const topDiscover = discoverFindings[0];
  const topRevenue = revenueFindings[0];

  const combinedImpact = Math.round(
    (topDiscover.impact_midpoint_cents + topRevenue.impact_midpoint_cents) * 1.6,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topDiscover.inference_key,
      pack: topDiscover.pack,
      role: 'trigger',
      surface: topDiscover.surface,
      description: topDiscover.title,
    },
    {
      order: 2,
      finding_key: topRevenue.inference_key,
      pack: topRevenue.pack,
      role: 'trigger',
      surface: topRevenue.surface,
      description: topRevenue.title,
    },
    {
      order: 3,
      finding_key: 'invisible_and_broken',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topDiscover.surface,
      description: 'Páginas de venda invisíveis + caminho de compra quebrado',
    },
  ];

  return {
    id: `compound_invisible_commercial_pages_${topDiscover.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'invisible_commercial_pages',
    severity: 'critical',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Suas páginas de venda são invisíveis pro Google E quando alguém chega, o caminho de compra está quebrado. Receita invisível: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topDiscover.surface, topRevenue.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Incluir páginas comerciais no sitemap e schema markup',
      'Corrigir problemas de revenue path nas páginas afetadas',
      'Submeter URLs para indexação e monitorar cobertura',
    ],
    confidence: 'confirmed',
  };
}

// ── 18. SEO Conversion Misalignment ──

function detectSeoConversionMisalignment(
  findings: CompoundInput[],
): CompoundFinding | null {
  const discoverFindings = findings.filter(f => DISCOVERABILITY_KEYS.has(f.inference_key));
  if (discoverFindings.length === 0) return null;

  const copyFindings = findings.filter(f => COPY_WEAK_KEYS.has(f.inference_key));
  if (copyFindings.length === 0) return null;

  const topDiscover = discoverFindings[0];
  const topCopy = copyFindings[0];

  const combinedImpact = Math.round(
    (topDiscover.impact_midpoint_cents + topCopy.impact_midpoint_cents) * 1.4,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topDiscover.inference_key,
      pack: topDiscover.pack,
      role: 'trigger',
      surface: topDiscover.surface,
      description: topDiscover.title,
    },
    {
      order: 2,
      finding_key: topCopy.inference_key,
      pack: topCopy.pack,
      role: 'trigger',
      surface: topCopy.surface,
      description: topCopy.title,
    },
    {
      order: 3,
      finding_key: 'seo_copy_disconnect',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topDiscover.surface,
      description: 'Promessa do Google diferente da experiência na página',
    },
  ];

  return {
    id: `compound_seo_conversion_misalignment_${topDiscover.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'seo_conversion_misalignment',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `O Google mostra uma versão do seu site que não convence, e quem clica encontra uma mensagem diferente — duplo desperdício de tráfego orgânico. Custo: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topDiscover.surface, topCopy.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Alinhar meta descriptions e titles com conteúdo real da página',
      'Reescrever copy da landing para entregar a promessa do snippet',
      'Monitorar CTR orgânico e bounce rate pós-clique',
    ],
    confidence: 'likely',
  };
}

// ── 19. Exposed Infrastructure Risk ──

function detectExposedInfrastructureRisk(
  findings: CompoundInput[],
): CompoundFinding | null {
  const subdomainFindings = findings.filter(f => SUBDOMAIN_EXPOSURE_KEYS.has(f.inference_key));
  if (subdomainFindings.length === 0) return null;

  const securityFindings = findings.filter(f =>
    (SECURITY_PACKS.has(f.pack) || SECURITY_INFERENCE_KEYS.has(f.inference_key)) &&
    severityRank(f.severity) >= 2,
  );
  if (securityFindings.length === 0) return null;

  const topSubdomain = subdomainFindings[0];
  const topSecurity = securityFindings[0];

  const combinedImpact = Math.round(
    (topSubdomain.impact_midpoint_cents + topSecurity.impact_midpoint_cents) * 2.0,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topSubdomain.inference_key,
      pack: topSubdomain.pack,
      role: 'trigger',
      surface: topSubdomain.surface,
      description: topSubdomain.title,
    },
    {
      order: 2,
      finding_key: topSecurity.inference_key,
      pack: topSecurity.pack,
      role: 'trigger',
      surface: topSecurity.surface,
      description: topSecurity.title,
    },
    {
      order: 3,
      finding_key: 'infrastructure_takeover_risk',
      pack: 'money_moment_exposure',
      role: 'consequence',
      surface: topSubdomain.surface,
      description: 'Risco de alteração não-autorizada de preços, estoque ou dados',
    },
  ];

  return {
    id: `compound_exposed_infrastructure_risk_${topSubdomain.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'exposed_infrastructure_risk',
    severity: 'critical',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `Painéis administrativos públicos + falhas de segurança = qualquer pessoa pode alterar preços, estoque ou dados de clientes. Risco: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topSubdomain.surface, topSecurity.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Remover acesso público a painéis admin e staging',
      'Implementar autenticação e IP whitelist',
      'Corrigir vulnerabilidades de segurança identificadas',
      'Auditar logs de acesso para atividade suspeita',
    ],
    confidence: 'confirmed',
  };
}

// ── 20. Subdomain Trust Fragmentation ──

function detectSubdomainTrustFragmentation(
  findings: CompoundInput[],
): CompoundFinding | null {
  const channelFindings = findings.filter(f => CHANNEL_INTEGRITY_PAYMENT_KEYS.has(f.inference_key));
  if (channelFindings.length === 0) return null;

  const trustFindings = findings.filter(f =>
    TRUST_DECISION_KEYS.has(f.inference_key) ||
    f.inference_key === 'checkout_trust_brittle_infrastructure',
  );
  if (trustFindings.length === 0) return null;

  const topChannel = channelFindings[0];
  const topTrust = trustFindings[0];

  const combinedImpact = Math.round(
    (topChannel.impact_midpoint_cents + topTrust.impact_midpoint_cents) * 1.5,
  );

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topChannel.inference_key,
      pack: topChannel.pack,
      role: 'trigger',
      surface: topChannel.surface,
      description: topChannel.title,
    },
    {
      order: 2,
      finding_key: topTrust.inference_key,
      pack: topTrust.pack,
      role: 'trigger',
      surface: topTrust.surface,
      description: topTrust.title,
    },
    {
      order: 3,
      finding_key: 'trust_fragmentation_at_payment',
      pack: 'revenue_integrity',
      role: 'consequence',
      surface: topChannel.surface,
      description: 'Confiança se fragmenta em cada redirect entre subdomínios',
    },
  ];

  return {
    id: `compound_subdomain_trust_fragmentation_${topChannel.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'subdomain_trust_fragmentation',
    severity: 'high',
    chain,
    combined_impact_cents: combinedImpact,
    narrative: `O comprador é jogado entre subdomínios no checkout E cada um parece um site diferente — confiança se fragmenta em cada redirect. Perda: ${formatDollars(combinedImpact)}/mês.`,
    affected_surfaces: [...new Set([topChannel.surface, topTrust.surface])],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Unificar checkout em domínio principal ou subdomínio consistente',
      'Manter identidade visual idêntica em todos os passos de pagamento',
      'Adicionar indicadores de progresso e segurança em cada etapa',
    ],
    confidence: 'likely',
  };
}

function detectBrandImpersonationRevenue(
  findings: CompoundInput[],
  commerceContext: CommerceContext | null,
): CompoundFinding | null {
  // Find brand impersonation findings (severity >= high)
  const impersonationFindings = findings.filter(f =>
    BRAND_IMPERSONATION_KEYS.has(f.inference_key) &&
    severityRank(f.severity) >= 3,
  );
  if (impersonationFindings.length === 0) return null;

  // Check for trust-related findings on main domain
  const trustFindings = findings.filter(f => BRAND_TRUST_KEYS.has(f.inference_key));

  const topImpersonation = impersonationFindings.sort((a, b) =>
    severityRank(b.severity) - severityRank(a.severity),
  )[0];

  const chain: ChainLink[] = [
    {
      order: 1,
      finding_key: topImpersonation.inference_key,
      pack: topImpersonation.pack,
      role: 'trigger',
      surface: topImpersonation.surface,
      description: topImpersonation.title,
    },
  ];

  if (trustFindings.length > 0) {
    chain.push({
      order: 2,
      finding_key: trustFindings[0].inference_key,
      pack: trustFindings[0].pack,
      role: 'evidence',
      surface: trustFindings[0].surface,
      description: trustFindings[0].title,
    });
  }

  chain.push({
    order: trustFindings.length > 0 ? 3 : 2,
    finding_key: 'trust_erosion',
    pack: 'revenue_integrity',
    role: 'consequence',
    surface: '/ (sitewide)',
    description: 'Brand trust eroded by impersonation activity',
  });

  // Impact: heuristic based on severity
  const isCritical = severityRank(topImpersonation.severity) >= 4;
  const monthlyRevenue = commerceContext?.avg_customer_lifetime_value
    ? commerceContext.avg_customer_lifetime_value * 100 // rough estimate
    : topImpersonation.impact_midpoint_cents * 10;
  const impactCents = isCritical
    ? Math.round(monthlyRevenue * 0.05)
    : Math.round(monthlyRevenue * 0.02);

  const narrative = `Active impersonation detected at ${topImpersonation.surface}. ` +
    (trustFindings.length > 0
      ? `Combined with brand inconsistencies on your site, estimated trust erosion: ${formatDollars(impactCents)}/mo.`
      : `Estimated trust erosion risk: ${formatDollars(impactCents)}/mo.`);

  return {
    id: `compound_brand_impersonation_${topImpersonation.surface.replace(/[^a-z0-9]/gi, '_')}`,
    compound_type: 'brand_impersonation_revenue',
    severity: isCritical ? 'critical' : 'high',
    chain,
    combined_impact_cents: impactCents,
    narrative,
    affected_surfaces: [
      topImpersonation.surface,
      ...trustFindings.map(f => f.surface),
    ],
    packs_involved: [...new Set(chain.map(c => c.pack))],
    remediation_chain: [
      'Report impersonating domains to registrars and hosting providers',
      'Set up brand monitoring for new lookalike domains',
      'Strengthen brand consistency on your own surfaces',
      'Add verified brand badges where available',
    ],
    confidence: trustFindings.length > 0 ? 'likely' : 'heuristic',
  };
}
