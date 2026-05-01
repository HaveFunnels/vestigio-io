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
  | 'brand_impersonation_revenue';

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
