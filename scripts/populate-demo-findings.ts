/**
 * Populate demo account with rich findings directly.
 *
 * Instead of running the engine (which needs specific evidence types),
 * we create realistic FindingProjection records directly in the DB.
 * This gives the demo account a full set of findings across all
 * packs/perspectives for a compelling showcase.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/populate-demo-findings.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_CYCLE_ID = 'demo_cycle';
const DEMO_ENV_ID = 'demo_env';
const CYCLE_REF = 'audit_cycle:demo_cycle';

// ── Finding definitions ──────────────────────────

interface DemoFinding {
  inference_key: string;
  title: string;
  root_cause: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pack: string;
  category: string;
  surface: string;
  polarity: 'negative' | 'positive';
  impact_min: number;
  impact_max: number;
  impact_mid: number;
  change_class: string | null;
  verification_maturity: string;
  cause: string;
  effect: string;
  reasoning: string;
}

const FINDINGS: DemoFinding[] = [
  // ── Revenue Pack ──
  {
    inference_key: 'checkout_off_domain',
    title: 'Checkout redirects buyers to a different domain',
    root_cause: 'Untracked purchase paths',
    severity: 'high',
    pack: 'revenue_integrity',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 2400, impact_max: 4800, impact_mid: 3200,
    change_class: 'stable_risk',
    verification_maturity: 'confirmed',
    cause: 'Checkout flow redirects through 3 hops to Stripe hosted checkout, crossing 2 domains.',
    effect: '50% of buyers drop off during the redirect chain. Each redirect adds latency and breaks trust.',
    reasoning: 'At $85 AOV and 3,420 monthly checkout starts, 1,710 buyers never see the payment form. Conservative 20% recovery estimate yields ~$3,200/mo.',
  },
  {
    inference_key: 'conversion_tracking_absent',
    title: 'No conversion tracking on checkout or thank-you page',
    root_cause: 'Commerce pages invisible to measurement',
    severity: 'high',
    pack: 'revenue_integrity',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 800, impact_max: 2400, impact_mid: 1600,
    change_class: 'stable_risk',
    verification_maturity: 'confirmed',
    cause: 'GA4, Facebook Pixel, and Segment are present on 6 pages but absent from checkout and thank-you.',
    effect: 'Ad platforms report $0 revenue, inflating CPA by 40-60%. A/B tests cannot measure checkout impact.',
    reasoning: 'Without purchase attribution, ad spend optimization is blind. Estimated 15-25% waste on $6k/mo ad budget.',
  },
  {
    inference_key: 'product_page_high_abandonment',
    title: 'Product page abandonment 15pp above benchmark',
    root_cause: 'Friction barrier on conversion path',
    severity: 'medium',
    pack: 'revenue_integrity',
    category: 'core',
    surface: '/products/wireless-headphones-pro',
    polarity: 'negative',
    impact_min: 900, impact_max: 2700, impact_mid: 1800,
    change_class: null,
    verification_maturity: 'static_evidence',
    cause: '70% of product page visitors leave without adding to cart (benchmark: 55-60%). 3.4s LCP and missing social proof contribute.',
    effect: 'Each percentage point of cart-add rate recovered equals ~$120/mo at current traffic levels.',
    reasoning: 'Slow load time (3.4s LCP vs 2.5s target) and absence of reviews/testimonials on product pages suppress impulse purchases.',
  },
  {
    inference_key: 'cart_intermittent_500',
    title: 'Cart page fails with HTTP 500 during peak hours',
    root_cause: 'Runtime commerce fragility',
    severity: 'critical',
    pack: 'revenue_integrity',
    category: 'core',
    surface: '/cart',
    polarity: 'negative',
    impact_min: 3000, impact_max: 8000, impact_mid: 5000,
    change_class: 'regression',
    verification_maturity: 'confirmed',
    cause: 'Cart page returns HTTP 500 during approximately 50% of peak traffic hours (6AM-10AM, 6PM).',
    effect: 'Buyers who click "Add to Cart" see a blank error page with no recovery path. At $120k/mo revenue, each peak hour of downtime costs ~$833.',
    reasoning: 'Error pattern correlates with traffic spikes — likely a backend capacity or caching issue. 50% error rate during 6 peak hours/day is catastrophic.',
  },
  {
    inference_key: 'payment_api_timeout',
    title: 'Payment API times out 50% of attempts',
    root_cause: 'Runtime commerce fragility',
    severity: 'critical',
    pack: 'revenue_integrity',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 4000, impact_max: 10000, impact_mid: 6500,
    change_class: 'new_issue',
    verification_maturity: 'confirmed',
    cause: 'Payment intent creation fails with 502 Bad Gateway (30s Stripe timeout). No retry logic. Generic error shown to buyer.',
    effect: 'Combined with cart 500s, the checkout funnel has ~75% technical failure rate during peak hours.',
    reasoning: 'Payment failures are the single highest-impact issue. Even 10% failure rate at $120k/mo revenue implies $12k/mo at risk.',
  },

  // ── Chargeback Pack ──
  {
    inference_key: 'refund_policy_missing',
    title: 'No refund or return policy found on site',
    root_cause: 'Dispute defenses absent',
    severity: 'high',
    pack: 'chargeback_resilience',
    category: 'core',
    surface: '/',
    polarity: 'negative',
    impact_min: 400, impact_max: 1200, impact_mid: 720,
    change_class: 'stable_risk',
    verification_maturity: 'confirmed',
    cause: 'Crawl of all pages found zero mention of refund, return, exchange, or money-back terms. Footer links to Privacy Policy and Contact only.',
    effect: 'Buyers who want a refund have no self-service option — they file chargebacks instead. Top driver of chargeback rate.',
    reasoning: 'Industry data: stores without visible refund policy have 2-3x higher chargeback rate. At 0.6% current rate, adding a policy could reduce to 0.3%.',
  },
  {
    inference_key: 'checkout_trust_signals_absent',
    title: 'Checkout page missing trust badges and security indicators',
    root_cause: 'Trust deficit at decision point',
    severity: 'medium',
    pack: 'chargeback_resilience',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 200, impact_max: 600, impact_mid: 400,
    change_class: null,
    verification_maturity: 'partial_confirmation',
    cause: 'Checkout page has no visible trust badges, payment logos, or security seals. SSL badge not shown despite valid certificate.',
    effect: 'Reduced buyer confidence at the most critical conversion moment. Contributes to both abandonment and post-purchase regret chargebacks.',
    reasoning: 'Trust signals on checkout page reduce abandonment by 5-15% and friendly fraud chargebacks by 10-20% according to Baymard Institute.',
  },

  // ── Security Pack ──
  {
    inference_key: 'admin_endpoint_unprotected',
    title: 'Admin order export endpoint accessible without authentication',
    root_cause: 'Commerce operations exposed',
    severity: 'critical',
    pack: 'money_moment_exposure',
    category: 'core',
    surface: '/admin/orders/export',
    polarity: 'negative',
    impact_min: 5000, impact_max: 20000, impact_mid: 10000,
    change_class: 'stable_risk',
    verification_maturity: 'confirmed',
    cause: '/admin/orders/export?format=csv returns full order data (names, emails, addresses, last-4 card digits) with no authentication.',
    effect: 'Complete customer data exfiltration risk. GDPR/LGPD violation. Potential for targeted fraud using exposed payment data.',
    reasoning: 'Unprotected admin endpoints are a critical security vulnerability. Automated scanners will find this. Fines for data breach can reach 4% of annual revenue under GDPR.',
  },
  {
    inference_key: 'discount_code_guessable',
    title: 'Discount codes discoverable through parameter guessing',
    root_cause: 'Commerce abuse exposure',
    severity: 'high',
    pack: 'money_moment_exposure',
    category: 'core',
    surface: '/api/discount/apply',
    polarity: 'negative',
    impact_min: 1500, impact_max: 6000, impact_mid: 3000,
    change_class: null,
    verification_maturity: 'confirmed',
    cause: 'Two discount codes (WELCOME50 for 50%, STAFF100 for 100%) discoverable via parameter fuzzing. No rate limiting or authentication.',
    effect: 'STAFF100 eliminates all revenue from any order. WELCOME50 is likely intended for first-time buyers but is infinitely reusable.',
    reasoning: 'Unprotected discount endpoints with no rate limiting are actively exploited. Discount abuse typically costs 2-5% of revenue for affected stores.',
  },
  {
    inference_key: 'mixed_content_checkout',
    title: 'Checkout page loads non-secure content breaking padlock',
    root_cause: 'Trust deficit at decision point',
    severity: 'high',
    pack: 'money_moment_exposure',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 300, impact_max: 900, impact_mid: 500,
    change_class: null,
    verification_maturity: 'partial_confirmation',
    cause: 'Address autocomplete widget loaded via HTTP iframe. Browsers show "Not Secure" or broken padlock icon.',
    effect: 'Visible security warning during payment entry. Informed buyers abandon. Less informed buyers may proceed but file chargebacks later.',
    reasoning: 'Mixed content on payment pages directly contradicts PCI-DSS requirements and dramatically reduces buyer confidence.',
  },
  {
    inference_key: 'csp_missing_checkout',
    title: 'No Content-Security-Policy header on checkout',
    root_cause: 'Commerce operations exposed',
    severity: 'medium',
    pack: 'money_moment_exposure',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 100, impact_max: 500, impact_mid: 250,
    change_class: null,
    verification_maturity: 'static_evidence',
    cause: '/checkout returns no Content-Security-Policy header. Any injected script could exfiltrate payment data.',
    effect: 'XSS attacks on the checkout page can capture card numbers. Combined with the mixed content issue, the attack surface is significant.',
    reasoning: 'CSP is a defense-in-depth measure. Its absence doesn\'t guarantee exploitation but removes a critical safety net.',
  },
  {
    inference_key: 'session_token_in_url',
    title: 'Session token exposed in URL parameters',
    root_cause: 'Commerce operations exposed',
    severity: 'medium',
    pack: 'money_moment_exposure',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 200, impact_max: 800, impact_mid: 400,
    change_class: null,
    verification_maturity: 'confirmed',
    cause: 'Checkout flow passes session token as URL query parameter (?session=cs_live_abc123).',
    effect: 'Token appears in browser history, server logs, and Referer headers sent to all 14 third-party scripts on the page.',
    reasoning: 'URL-based session tokens are a well-known vulnerability (CWE-598). Combined with the many tracking scripts, token leakage is virtually guaranteed.',
  },

  // ── Preflight (positive checks) ──
  {
    inference_key: 'ssl_valid',
    title: 'SSL certificate valid with TLS 1.3 and HSTS',
    root_cause: '',
    severity: 'low',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/',
    polarity: 'positive',
    impact_min: 0, impact_max: 0, impact_mid: 0,
    change_class: null,
    verification_maturity: 'confirmed',
    cause: 'SSL certificate is valid (Let\'s Encrypt, 41 days remaining). TLS 1.3 with HSTS enabled.',
    effect: 'Buyers see the padlock icon. Search engines favor HTTPS sites.',
    reasoning: 'Baseline security requirement met. The EV certificate on checkout.stripe.com provides additional trust signal.',
  },
  {
    inference_key: 'mobile_viewport_configured',
    title: 'Mobile viewport properly configured',
    root_cause: '',
    severity: 'low',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/',
    polarity: 'positive',
    impact_min: 0, impact_max: 0, impact_mid: 0,
    change_class: null,
    verification_maturity: 'confirmed',
    cause: 'Viewport meta tag present with width=device-width. Content is responsive and scrollable without horizontal overflow.',
    effect: 'Mobile visitors can navigate the site. No zoom or scroll issues.',
    reasoning: '55% of traffic is mobile — viewport configuration is table stakes for conversion.',
  },
  {
    inference_key: 'seo_meta_present',
    title: 'Homepage SEO meta tags well-optimized',
    root_cause: '',
    severity: 'low',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/',
    polarity: 'positive',
    impact_min: 0, impact_max: 0, impact_mid: 0,
    change_class: null,
    verification_maturity: 'static_evidence',
    cause: 'Title, meta description, OG tags, Twitter card, canonical URL, and JSON-LD structured data all present and well-formed.',
    effect: 'Search engines and social platforms can properly index and preview the site.',
    reasoning: 'SEO hygiene on the homepage is solid. Product pages have partial coverage (some missing OG images).',
  },

  // ── Preflight negative findings ──
  {
    inference_key: 'mobile_checkout_blocked',
    title: 'Mobile checkout completely unreachable',
    root_cause: 'Friction barrier on conversion path',
    severity: 'critical',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/',
    polarity: 'negative',
    impact_min: 8000, impact_max: 20000, impact_mid: 14000,
    change_class: 'stable_risk',
    verification_maturity: 'confirmed',
    cause: 'Add-to-cart button overlapped by Intercom chat widget on screens <430px. Hamburger menu tap handler broken. Mobile users cannot reach cart or checkout.',
    effect: '100% of mobile conversions blocked. Mobile represents ~55% of traffic.',
    reasoning: 'At $120k/mo revenue and 55% mobile traffic, total mobile conversion blockage implies $14k/mo in unreachable revenue. Even partial fix (chat widget z-index) would recover significant portion.',
  },
  {
    inference_key: 'broken_ecommerce_links',
    title: '3 critical ecommerce pages return 404',
    root_cause: 'Commerce pages invisible or broken',
    severity: 'high',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/',
    polarity: 'negative',
    impact_min: 300, impact_max: 900, impact_mid: 500,
    change_class: null,
    verification_maturity: 'confirmed',
    cause: '/returns, /warranty, /shipping-info all return 404. Linked from product and checkout pages.',
    effect: 'Buyers looking for shipping info or return policy find dead ends. Compounds the refund policy absence.',
    reasoning: 'Broken links on critical ecommerce pages signal neglect and reduce buyer confidence at decision moments.',
  },
  {
    inference_key: 'checkout_performance_critical',
    title: 'Checkout page fails all Core Web Vitals',
    root_cause: 'Runtime commerce fragility',
    severity: 'high',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/checkout',
    polarity: 'negative',
    impact_min: 400, impact_max: 1200, impact_mid: 700,
    change_class: 'improvement',
    verification_maturity: 'confirmed',
    cause: 'Checkout: 4.2s LCP, 120ms FID, 0.18 CLS. 6.8MB payload driven by 14 third-party scripts (2.4s blocking time).',
    effect: 'Slow checkout increases abandonment. Google Core Web Vitals failure affects search ranking.',
    reasoning: 'Every 100ms of checkout latency reduces conversion by ~0.7% (Amazon study). Current 4.2s LCP vs 2.5s target implies measurable conversion loss.',
  },
  {
    inference_key: 'cookie_consent_missing',
    title: 'No cookie consent banner despite 18 tracking cookies',
    root_cause: 'Commerce operations exposed',
    severity: 'medium',
    pack: 'scale_readiness',
    category: 'core',
    surface: '/',
    polarity: 'negative',
    impact_min: 200, impact_max: 1000, impact_mid: 500,
    change_class: null,
    verification_maturity: 'static_evidence',
    cause: 'Site sets 18 cookies (7 advertising) on first page load without consent. No consent banner present.',
    effect: 'GDPR/ePrivacy violation for EU visitors. Potential fines and ad platform policy violations.',
    reasoning: 'Cookie compliance is mandatory in EU, increasingly enforced in Brazil (LGPD). Risk level depends on EU traffic volume.',
  },
];

async function main() {
  console.log('Populating demo findings...\n');

  let written = 0;
  for (const f of FINDINGS) {
    const projection = {
      id: `demo_finding_${f.inference_key}`,
      title: f.title,
      root_cause: f.root_cause || null,
      severity: f.severity,
      confidence: 80,
      confidence_tier: f.severity === 'critical' || f.severity === 'high' ? 'high' : 'medium',
      pack: f.pack,
      surface: f.surface,
      freshness: 'fresh',
      inference_key: f.inference_key,
      polarity: f.polarity,
      impact: {
        monthly_range: { min: f.impact_min, max: f.impact_max },
        midpoint: f.impact_mid,
        impact_type: 'revenue_loss',
        percentage_delta: null,
        currency: 'USD',
      },
      verification_maturity: f.verification_maturity,
      verification_method: f.verification_maturity === 'confirmed' ? 'browser_verified' : 'static_only',
      change_class: f.change_class,
      cause: f.cause,
      effect: f.effect,
      reasoning: f.reasoning,
      evidence_quality: {
        source_reliability: 85,
        completeness: 78,
        recency: 92,
        corroboration: 70,
        composite: 81,
      },
      truth_context: null,
      suppression_context: null,
    };

    try {
      await prisma.finding.upsert({
        where: {
          cycleId_inferenceKey: { cycleId: DEMO_CYCLE_ID, inferenceKey: f.inference_key },
        },
        create: {
          cycleId: DEMO_CYCLE_ID,
          environmentId: DEMO_ENV_ID,
          cycleRef: CYCLE_REF,
          inferenceKey: f.inference_key,
          pack: f.pack,
          severity: f.severity,
          polarity: f.polarity,
          confidence: 80,
          impactMin: f.impact_min,
          impactMax: f.impact_max,
          impactMidpoint: f.impact_mid,
          surface: f.surface,
          rootCause: f.root_cause || null,
          changeClass: f.change_class,
          verificationMaturity: f.verification_maturity,
          projection: JSON.stringify(projection),
        },
        update: {
          pack: f.pack,
          severity: f.severity,
          polarity: f.polarity,
          impactMin: f.impact_min,
          impactMax: f.impact_max,
          impactMidpoint: f.impact_mid,
          surface: f.surface,
          rootCause: f.root_cause || null,
          changeClass: f.change_class,
          verificationMaturity: f.verification_maturity,
          projection: JSON.stringify(projection),
        },
      });
      written++;
    } catch (err) {
      console.error(`  Failed: ${f.inference_key} — ${(err as Error).message?.slice(0, 80)}`);
    }
  }

  console.log(`✓ Persisted ${written}/${FINDINGS.length} findings`);

  // Summary
  const byPack: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let totalImpact = 0;
  for (const f of FINDINGS) {
    byPack[f.pack] = (byPack[f.pack] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    if (f.polarity === 'negative') totalImpact += f.impact_mid;
  }

  console.log('\nBreakdown:');
  for (const [pack, count] of Object.entries(byPack)) {
    console.log(`  ${pack}: ${count} findings`);
  }
  console.log(`\nSeverity: ${JSON.stringify(bySeverity)}`);
  console.log(`Total monthly exposure: $${totalImpact.toLocaleString()}/mo`);
  console.log(`Negative: ${FINDINGS.filter(f => f.polarity === 'negative').length}, Positive: ${FINDINGS.filter(f => f.polarity === 'positive').length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
