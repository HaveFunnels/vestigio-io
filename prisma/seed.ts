/**
 * Vestigio — Database Seed Script
 *
 * Creates:
 * - Admin user (from ADMIN_EMAIL env or default)
 * - Default platform config entries
 * - Demo account with populated data (findings, pages, audit history)
 *
 * Run: npm run seed
 * Requires: DATABASE_URL to be set
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// Demo data constants
// ──────────────────────────────────────────────

const DEMO_EMAIL = 'demo@vestigio.io';
const DEMO_PASSWORD = 'Vestigio_Demo@2026';
const DEMO_DOMAIN = 'acme-store.com';

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const freshUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

function ts(d: Date) { return d.toISOString(); }

// ──────────────────────────────────────────────
// Snapshot: signals + decisions (CycleSnapshot)
// ──────────────────────────────────────────────

function buildDemoSnapshot(cycleRef: string, wsRef: string, envRef: string, webRef: string) {
  const scoping = {
    workspace_ref: wsRef,
    environment_ref: envRef,
    subject_ref: webRef,
    path_scope: null,
  };

  const fresh = {
    observed_at: ts(yesterday),
    fresh_until: ts(freshUntil),
    freshness_state: 'fresh',
    staleness_reason: null,
  };

  const signals = [
    {
      id: 'sig_1', signal_key: 'checkout_off_domain', category: 'checkout',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'checkout.off_domain', value: 'true', numeric_value: null,
      confidence: 88, evidence_refs: ['evidence:ev_1'],
      subject_label: null, description: 'Checkout flow leaves the primary domain to an external payment page',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_2', signal_key: 'policy_refund_missing', category: 'policy',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'policy.refund.present', value: 'false', numeric_value: null,
      confidence: 92, evidence_refs: ['evidence:ev_2'],
      subject_label: null, description: 'No refund or return policy page detected',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_3', signal_key: 'checkout_ssl_valid', category: 'trust',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'checkout.ssl.valid', value: 'true', numeric_value: null,
      confidence: 99, evidence_refs: ['evidence:ev_3'],
      subject_label: null, description: 'SSL certificate valid on checkout domain',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_4', signal_key: 'measurement_ga_present', category: 'measurement',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'measurement.ga4.present', value: 'true', numeric_value: null,
      confidence: 95, evidence_refs: ['evidence:ev_4'],
      subject_label: null, description: 'Google Analytics 4 detected on primary pages',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_5', signal_key: 'measurement_checkout_blind', category: 'measurement',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'measurement.checkout.present', value: 'false', numeric_value: null,
      confidence: 85, evidence_refs: ['evidence:ev_5'],
      subject_label: null, description: 'No measurement tag on checkout or thank-you pages',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_6', signal_key: 'support_contact_present', category: 'support',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'support.contact_page.present', value: 'true', numeric_value: null,
      confidence: 78, evidence_refs: ['evidence:ev_6'],
      subject_label: null, description: 'Contact page found but not linked from checkout',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_7', signal_key: 'privacy_policy_present', category: 'policy',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'policy.privacy.present', value: 'true', numeric_value: null,
      confidence: 90, evidence_refs: ['evidence:ev_7'],
      subject_label: null, description: 'Privacy policy page present and accessible',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_8', signal_key: 'conversion_cta_above_fold', category: 'journey',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'journey.cta.above_fold', value: 'true', numeric_value: null,
      confidence: 82, evidence_refs: ['evidence:ev_8'],
      subject_label: null, description: 'Primary CTA visible above the fold on landing page',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_9', signal_key: 'redirect_chain_long', category: 'checkout',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'checkout.redirect_hops', value: '3', numeric_value: 3,
      confidence: 76, evidence_refs: ['evidence:ev_9'],
      subject_label: null, description: 'Checkout requires 3 redirect hops before payment page',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_10', signal_key: 'mobile_viewport_ok', category: 'platform',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'platform.mobile.viewport_ok', value: 'true', numeric_value: null,
      confidence: 91, evidence_refs: ['evidence:ev_10'],
      subject_label: null, description: 'Mobile viewport meta tag configured correctly',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_11', signal_key: 'third_party_scripts_heavy', category: 'operational',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'operational.third_party_count', value: '14', numeric_value: 14,
      confidence: 80, evidence_refs: ['evidence:ev_11'],
      subject_label: null, description: '14 third-party scripts on checkout page slowing load',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'sig_12', signal_key: 'pricing_page_present', category: 'journey',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      attribute: 'journey.pricing.present', value: 'true', numeric_value: null,
      confidence: 94, evidence_refs: ['evidence:ev_12'],
      subject_label: null, description: 'Pricing page found and linked from main navigation',
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
  ];

  const decisions = [
    {
      id: 'dec_1',
      decision_key: 'unsafe_to_scale_traffic',
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      status: 'confirmed', category: 'risk',
      confidence_score: 82, raw_risk_score: 71, raw_upside_score: null,
      effective_severity: 'high', decision_impact: 'fix_before_scale',
      primary_outcome: 'incident',
      why: {
        signals: ['signal:sig_1', 'signal:sig_9', 'signal:sig_11'],
        inferences: ['inference:inf_1'],
        evidence_refs: ['evidence:ev_1', 'evidence:ev_9', 'evidence:ev_11'],
        gates: ['Checkout trust continuity broken by off-domain redirect'],
        summary: 'The checkout flow sends buyers off-domain through a 3-hop redirect chain with heavy third-party scripts. Scaling paid traffic into this funnel will amplify drop-off at the payment step.',
      },
      actions: {
        primary: 'Embed checkout on the primary domain or reduce redirect hops to 1',
        secondary: [
          'Audit third-party scripts on checkout page and remove non-essential ones',
          'Add trust badges and security indicators on the payment page',
        ],
        verification: [
          'Re-run analysis after checkout changes to confirm trust continuity',
          'Monitor checkout completion rate for 7 days after changes',
        ],
      },
      value_case: null,
      projections: {
        findings: ['finding:find_1', 'finding:find_2'],
        incidents: [], opportunities: [], preflight_checks: [],
      },
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'dec_2',
      decision_key: 'revenue_leakage_detected',
      question_key: 'is_revenue_integrity_sound',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      status: 'confirmed', category: 'risk',
      confidence_score: 78, raw_risk_score: 65, raw_upside_score: null,
      effective_severity: 'high', decision_impact: 'fix_before_scale',
      primary_outcome: 'incident',
      why: {
        signals: ['signal:sig_5', 'signal:sig_1'],
        inferences: ['inference:inf_2'],
        evidence_refs: ['evidence:ev_5', 'evidence:ev_1'],
        gates: ['Revenue leaking through unmeasured off-domain checkout'],
        summary: 'Checkout and thank-you pages have no measurement tags. Combined with off-domain checkout, conversion data is lost — making it impossible to optimize the revenue path.',
      },
      actions: {
        primary: 'Deploy conversion tracking on checkout and thank-you pages',
        secondary: [
          'Set up cross-domain tracking between primary site and checkout provider',
          'Create conversion funnel report to monitor drop-off points',
        ],
        verification: [
          'Verify purchase events fire correctly in GA4 real-time report',
          'Confirm end-to-end funnel data appears within 48 hours',
        ],
      },
      value_case: null,
      projections: {
        findings: ['finding:find_3', 'finding:find_4'],
        incidents: [], opportunities: [], preflight_checks: [],
      },
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'dec_3',
      decision_key: 'moderate_chargeback_risk',
      question_key: 'is_chargeback_risk_acceptable',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      status: 'confirmed', category: 'risk',
      confidence_score: 85, raw_risk_score: 58, raw_upside_score: null,
      effective_severity: 'medium', decision_impact: 'optimize',
      primary_outcome: 'incident',
      why: {
        signals: ['signal:sig_2', 'signal:sig_6'],
        inferences: ['inference:inf_3'],
        evidence_refs: ['evidence:ev_2', 'evidence:ev_6'],
        gates: ['No refund policy increases dispute probability'],
        summary: 'Missing refund policy and support link on checkout create conditions for chargebacks. Buyers who feel uncertain about returns will go straight to their bank.',
      },
      actions: {
        primary: 'Publish a clear refund and return policy page and link it from checkout',
        secondary: [
          'Add contact/support link in the checkout footer',
          'Include estimated delivery time near the purchase button',
        ],
        verification: [
          'Confirm refund policy is indexed and accessible from checkout',
          'Monitor chargeback rate for 30 days after changes',
        ],
      },
      value_case: null,
      projections: {
        findings: ['finding:find_5', 'finding:find_6'],
        incidents: [], opportunities: [], preflight_checks: [],
      },
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
    {
      id: 'dec_4',
      decision_key: 'revenue_integrity_stable',
      question_key: 'are_commercial_pages_discoverable',
      scoping, cycle_ref: cycleRef, freshness: fresh,
      status: 'confirmed', category: 'state',
      confidence_score: 90, raw_risk_score: null, raw_upside_score: 45,
      effective_severity: 'low', decision_impact: 'observe',
      primary_outcome: 'observation',
      why: {
        signals: ['signal:sig_3', 'signal:sig_4', 'signal:sig_8', 'signal:sig_10', 'signal:sig_12'],
        inferences: [],
        evidence_refs: ['evidence:ev_3', 'evidence:ev_4', 'evidence:ev_8', 'evidence:ev_10', 'evidence:ev_12'],
        gates: [],
        summary: 'Core commerce infrastructure (SSL, analytics, mobile, pricing page, CTA placement) is solid. These are positive indicators that the site is structurally ready for traffic.',
      },
      actions: {
        primary: 'No action required — continue monitoring',
        secondary: [],
        verification: [],
      },
      value_case: null,
      projections: {
        findings: [], incidents: [], opportunities: [], preflight_checks: [],
      },
      created_at: ts(yesterday), updated_at: ts(yesterday),
    },
  ];

  return { cycle_ref: cycleRef, decisions, signals };
}

// ──────────────────────────────────────────────
// Pages for the website inventory
// ──────────────────────────────────────────────

function buildDemoPages(websiteId: string, envId: string) {
  const pages = [
    { path: '/', pageType: 'landing', tier: 'primary', priority: 100, criticality: 90, title: 'Acme Store — Premium Electronics', statusCode: 200 },
    { path: '/products', pageType: 'category', tier: 'primary', priority: 90, criticality: 80, title: 'All Products — Acme Store', statusCode: 200 },
    { path: '/products/wireless-headphones-pro', pageType: 'product', tier: 'primary', priority: 85, criticality: 85, title: 'Wireless Headphones Pro — Acme Store', statusCode: 200 },
    { path: '/products/smart-speaker-x1', pageType: 'product', tier: 'primary', priority: 85, criticality: 85, title: 'Smart Speaker X1 — Acme Store', statusCode: 200 },
    { path: '/products/usb-c-hub-ultra', pageType: 'product', tier: 'secondary', priority: 70, criticality: 70, title: 'USB-C Hub Ultra — Acme Store', statusCode: 200 },
    { path: '/cart', pageType: 'cart', tier: 'primary', priority: 95, criticality: 95, title: 'Your Cart — Acme Store', statusCode: 200 },
    { path: '/checkout', pageType: 'checkout', tier: 'primary', priority: 100, criticality: 100, title: 'Checkout — Acme Store', statusCode: 200 },
    { path: '/pricing', pageType: 'landing', tier: 'primary', priority: 88, criticality: 82, title: 'Pricing — Acme Store', statusCode: 200 },
    { path: '/about', pageType: 'other', tier: 'tertiary', priority: 20, criticality: 10, title: 'About Us — Acme Store', statusCode: 200 },
    { path: '/contact', pageType: 'support', tier: 'secondary', priority: 55, criticality: 50, title: 'Contact Us — Acme Store', statusCode: 200 },
    { path: '/privacy-policy', pageType: 'policy', tier: 'secondary', priority: 40, criticality: 40, title: 'Privacy Policy — Acme Store', statusCode: 200 },
    { path: '/blog', pageType: 'blog', tier: 'tertiary', priority: 30, criticality: 15, title: 'Blog — Acme Store', statusCode: 200 },
    { path: '/blog/best-headphones-2026', pageType: 'blog', tier: 'tertiary', priority: 25, criticality: 10, title: 'Best Headphones of 2026 — Acme Store Blog', statusCode: 200 },
    { path: '/account', pageType: 'account', tier: 'secondary', priority: 50, criticality: 45, title: 'My Account — Acme Store', statusCode: 200 },
    { path: '/thank-you', pageType: 'other', tier: 'primary', priority: 80, criticality: 75, title: 'Order Confirmed — Acme Store', statusCode: 200 },
  ];

  return pages.map((p) => ({
    websiteRef: websiteId,
    environmentRef: envId,
    normalizedUrl: `https://${DEMO_DOMAIN}${p.path}`,
    path: p.path,
    pathScope: p.path === '/' ? null : p.path.split('/').slice(0, 2).join('/'),
    pageType: p.pageType,
    tier: p.tier,
    priority: p.priority,
    criticality: p.criticality,
    title: p.title,
    statusCode: p.statusCode,
    freshnessState: 'fresh' as const,
    freshnessAge: 3600,
  }));
}

// ──────────────────────────────────────────────
// Surface relations (links between pages)
// ──────────────────────────────────────────────

function buildDemoRelations(websiteId: string, cycleRef: string) {
  const base = `https://${DEMO_DOMAIN}`;
  const links: Array<{ source: string; target: string; type: string }> = [
    { source: '/', target: '/products', type: 'anchor' },
    { source: '/', target: '/pricing', type: 'anchor' },
    { source: '/products', target: '/products/wireless-headphones-pro', type: 'anchor' },
    { source: '/products', target: '/products/smart-speaker-x1', type: 'anchor' },
    { source: '/products/wireless-headphones-pro', target: '/cart', type: 'anchor' },
    { source: '/cart', target: '/checkout', type: 'anchor' },
    { source: '/checkout', target: 'https://pay.stripe.com/checkout/acme', type: 'redirect' },
    { source: '/', target: '/blog', type: 'anchor' },
    { source: '/', target: '/contact', type: 'anchor' },
    { source: '/', target: '/privacy-policy', type: 'anchor' },
  ];

  return links.map((l) => {
    const sourceUrl = l.source.startsWith('http') ? l.source : `${base}${l.source}`;
    const targetUrl = l.target.startsWith('http') ? l.target : `${base}${l.target}`;
    const sourceHost = new URL(sourceUrl).hostname;
    const targetHost = new URL(targetUrl).hostname;

    return {
      websiteRef: websiteId,
      sourceUrl,
      targetUrl,
      relationType: l.type,
      sourceHost,
      targetHost,
      isSameDomain: sourceHost === targetHost,
      confidence: 1.0,
      cycleRef,
      metadata: '{}',
    };
  });
}


// ──────────────────────────────────────────────
// Main seed
// ──────────────────────────────────────────────

async function main() {
  console.log('Vestigio seed script');
  console.log('====================\n');

  // ── 1. Admin user ──────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS?.split(',')[0]?.trim();
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        name: 'Admin',
        role: 'ADMIN',
      },
      update: { role: 'ADMIN' },
    });
    console.log(`  ✓ Admin user: ${adminEmail}`);
  } else {
    console.log('  - Skipping admin user (no ADMIN_EMAIL set)');
  }

  // ── 2. Platform config ─────────────────────
  const platformDefaults: Array<{ configKey: string; value: string }> = [
    { configKey: 'plan_vestigio_mcp_limit', value: '50' },
    { configKey: 'plan_pro_mcp_limit', value: '250' },
    { configKey: 'plan_max_mcp_limit', value: '1000' },
    { configKey: 'credit_base_cost', value: '0.05' },
    { configKey: 'credit_markup', value: '2.0' },
  ];

  for (const { configKey, value } of platformDefaults) {
    await prisma.platformConfig.upsert({
      where: { configKey },
      create: { configKey, value },
      update: {},
    });
    console.log(`  ✓ Config: ${configKey} = ${value}`);
  }

  // ── 3. Demo account ────────────────────────
  console.log('\n── Demo account ──────────────────\n');

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: 'Demo User',
      password: hashedPassword,
      emailVerified: now,
      role: 'USER',
    },
    update: {
      password: hashedPassword,
      emailVerified: now,
    },
  });
  console.log(`  ✓ Demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // Organization
  // NOTE: orgType='demo' is what makes isDemoOrg() in src/lib/demo-account.ts
  // recognise this row as the demo account. Combined with the hardcoded
  // id='demo_org', that gives the deletion guards two independent ways
  // to identify it — so renaming the id later won't accidentally
  // unprotect the org.
  const org = await prisma.organization.upsert({
    where: { id: 'demo_org' },
    create: {
      id: 'demo_org',
      name: 'Acme Store',
      ownerId: demoUser.id,
      plan: 'pro',
      status: 'active',
      orgType: 'demo',
    },
    update: {
      name: 'Acme Store',
      ownerId: demoUser.id,
      plan: 'pro',
      status: 'active',
      orgType: 'demo',
    },
  });
  console.log(`  ✓ Organization: ${org.name} (${org.plan})`);

  // Membership
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: demoUser.id, organizationId: org.id } },
    create: { userId: demoUser.id, organizationId: org.id, role: 'owner' },
    update: { role: 'owner' },
  });
  console.log('  ✓ Membership: owner');

  // Environment
  const env = await prisma.environment.upsert({
    where: { id: 'demo_env' },
    create: {
      id: 'demo_env',
      organizationId: org.id,
      domain: DEMO_DOMAIN,
      landingUrl: `https://${DEMO_DOMAIN}`,
      isProduction: true,
    },
    update: {
      domain: DEMO_DOMAIN,
      landingUrl: `https://${DEMO_DOMAIN}`,
    },
  });
  console.log(`  ✓ Environment: ${env.domain}`);

  // Business profile
  await prisma.businessProfile.upsert({
    where: { organizationId: org.id },
    create: {
      organizationId: org.id,
      businessModel: 'ecommerce',
      monthlyRevenue: 120000,
      averageOrderValue: 85,
      monthlyTransactions: 1412,
      conversionRate: 2.8,
      chargebackRate: 0.6,
      churnRate: null,
      conversionModel: 'checkout',
    },
    update: {},
  });
  console.log('  ✓ Business profile: ecommerce, $120k/mo revenue');

  // Business profile version
  await prisma.businessProfileVersion.upsert({
    where: { organizationId_version: { organizationId: org.id, version: 1 } },
    create: {
      organizationId: org.id,
      version: 1,
      profile: JSON.stringify({
        businessModel: 'ecommerce',
        monthlyRevenue: 120000,
        averageOrderValue: 85,
        monthlyTransactions: 1412,
        conversionRate: 2.8,
        chargebackRate: 0.6,
        conversionModel: 'checkout',
      }),
      source: 'manual',
      changeSummary: 'Initial profile setup during onboarding',
    },
    update: {},
  });
  console.log('  ✓ Business profile version: v1');

  // Audit cycle (completed)
  const cycle = await prisma.auditCycle.upsert({
    where: { id: 'demo_cycle' },
    create: {
      id: 'demo_cycle',
      organizationId: org.id,
      environmentId: env.id,
      status: 'complete',
      cycleType: 'full',
      createdAt: yesterday,
      completedAt: new Date(yesterday.getTime() + 4 * 60 * 1000), // 4 min analysis
    },
    update: {
      status: 'complete',
      completedAt: new Date(yesterday.getTime() + 4 * 60 * 1000),
    },
  });
  console.log('  ✓ Audit cycle: complete (full)');

  // Analysis job (completed)
  await prisma.analysisJob.upsert({
    where: { id: 'demo_job' },
    create: {
      id: 'demo_job',
      environmentId: env.id,
      organizationId: org.id,
      status: 'complete',
      progress: 100,
      stagesCompleted: JSON.stringify(['crawl', 'parse', 'classify', 'signals', 'decisions', 'impact']),
      error: null,
      createdAt: yesterday,
    },
    update: {
      status: 'complete',
      progress: 100,
      stagesCompleted: JSON.stringify(['crawl', 'parse', 'classify', 'signals', 'decisions', 'impact']),
    },
  });
  console.log('  ✓ Analysis job: complete (100%)');

  // Website
  const website = await prisma.website.upsert({
    where: { environmentRef_domain: { environmentRef: env.id, domain: DEMO_DOMAIN } },
    create: {
      environmentRef: env.id,
      domain: DEMO_DOMAIN,
      rootUrl: `https://${DEMO_DOMAIN}`,
      isPrimary: true,
    },
    update: {},
  });
  console.log(`  ✓ Website: ${DEMO_DOMAIN}`);

  // Pages
  const demoPages = buildDemoPages(website.id, env.id);
  let pagesCreated = 0;
  for (const page of demoPages) {
    await prisma.pageInventoryItem.upsert({
      where: { environmentRef_normalizedUrl: { environmentRef: env.id, normalizedUrl: page.normalizedUrl } },
      create: page,
      update: {},
    });
    pagesCreated++;
  }
  console.log(`  ✓ Pages: ${pagesCreated} pages crawled`);

  // Surface relations
  const demoRelations = buildDemoRelations(website.id, cycle.id);
  let relationsCreated = 0;
  for (const rel of demoRelations) {
    await prisma.surfaceRelation.create({ data: rel });
    relationsCreated++;
  }
  console.log(`  ✓ Surface relations: ${relationsCreated} links mapped`);

  // Versioned snapshot (findings data)
  const wsRef = `workspace:${org.id}`;
  const envRef = `environment:${env.id}`;
  const webRef = `website:${website.id}`;
  const cycleRef = `audit_cycle:${cycle.id}`;

  const snapshot = buildDemoSnapshot(cycleRef, wsRef, envRef, webRef);

  await prisma.versionedSnapshot.upsert({
    where: { id: 'demo_snapshot' },
    create: {
      id: 'demo_snapshot',
      cycleRef,
      workspaceRef: wsRef,
      environmentRef: envRef,
      schemaVersion: 1,
      snapshot: JSON.stringify(snapshot),
      isBaseline: true,
      decisionCount: snapshot.decisions.length,
      signalCount: snapshot.signals.length,
      auditMode: 'full',
      recomputeMs: 2340,
      contentHash: null,
      createdAt: yesterday,
    },
    update: {
      snapshot: JSON.stringify(snapshot),
      decisionCount: snapshot.decisions.length,
      signalCount: snapshot.signals.length,
    },
  });
  console.log(`  ✓ Snapshot: ${snapshot.decisions.length} decisions, ${snapshot.signals.length} signals`);

  // Usage records
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await prisma.usage.createMany({
    data: [
      { organizationId: org.id, usageType: 'mcp_chat', amount: 23, period },
      { organizationId: org.id, usageType: 'mcp_tool', amount: 47, period },
    ],
    skipDuplicates: true,
  });
  console.log(`  ✓ Usage: 23 chats, 47 tool calls (${period})`);

  // MCP session
  await prisma.mcpSession.create({
    data: {
      orgId: org.id,
      startedAt: yesterday,
      endedAt: new Date(yesterday.getTime() + 12 * 60 * 1000),
      queriesUsed: 8,
      promptRewrites: 2,
      chainDepth: 3,
      plan: 'pro',
    },
  });
  console.log('  ✓ MCP session: 1 completed session');

  // ── 4. Evidence records ────────────────────
  console.log('\n── Evidence records ──────────────\n');

  const evidenceItems = [
    {
      id: 'demo_evidence_1',
      evidenceKey: 'ev_checkout_screenshot',
      evidenceType: 'screenshot',
      payload: JSON.stringify({
        url: 'https://acme-store.com/checkout',
        screenshotUrl: '/evidence/checkout-page.png',
        viewport: { width: 1440, height: 900 },
        annotations: [
          { label: 'Missing trust badges', region: { x: 820, y: 340, w: 200, h: 60 } },
          { label: 'No security indicators', region: { x: 600, y: 520, w: 300, h: 40 } },
        ],
        observation: 'Checkout page lacks visible trust indicators (SSL badge, payment logos, security seals). The payment form is functional but offers no visual reassurance to buyers.',
        capturedAt: ts(yesterday),
      }),
      qualityScore: 92,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_2',
      evidenceKey: 'ev_payment_redirect_chain',
      evidenceType: 'network_analysis',
      payload: JSON.stringify({
        url: 'https://acme-store.com/checkout',
        redirectChain: [
          { step: 1, url: 'https://acme-store.com/checkout', status: 200, latencyMs: 320 },
          { step: 2, url: 'https://acme-store.com/api/create-session', status: 302, latencyMs: 890 },
          { step: 3, url: 'https://pay.stripe.com/checkout/acme?session=cs_live_abc123', status: 302, latencyMs: 1240 },
          { step: 4, url: 'https://checkout.stripe.com/c/pay/cs_live_abc123', status: 200, latencyMs: 2100 },
        ],
        totalHops: 3,
        totalLatencyMs: 4550,
        crossDomain: true,
        domainChanges: ['acme-store.com -> pay.stripe.com', 'pay.stripe.com -> checkout.stripe.com'],
        observation: 'Checkout requires 3 HTTP redirects across 2 domain changes before the buyer sees the payment form. Total redirect latency is 4.5 seconds, adding significant friction.',
      }),
      qualityScore: 88,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_3',
      evidenceKey: 'ev_refund_policy_missing',
      evidenceType: 'html_analysis',
      payload: JSON.stringify({
        crawledUrls: [
          'https://acme-store.com/',
          'https://acme-store.com/privacy-policy',
          'https://acme-store.com/contact',
          'https://acme-store.com/checkout',
        ],
        searchTerms: ['refund', 'return', 'exchange', 'money back', 'guarantee'],
        matchesFound: 0,
        footerLinks: ['Privacy Policy', 'Contact Us', 'About'],
        missingPolicies: ['Refund Policy', 'Return Policy', 'Shipping Policy', 'Terms of Service'],
        observation: 'No refund, return, or exchange policy detected anywhere on the site. The footer links to Privacy Policy and Contact but omits any purchase protection language. This is a top chargeback driver for ecommerce.',
      }),
      qualityScore: 95,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_4',
      evidenceKey: 'ev_third_party_scripts',
      evidenceType: 'script_audit',
      payload: JSON.stringify({
        url: 'https://acme-store.com/checkout',
        scripts: [
          { domain: 'www.googletagmanager.com', type: 'analytics', sizeKb: 82, blockingMs: 120 },
          { domain: 'www.google-analytics.com', type: 'analytics', sizeKb: 45, blockingMs: 80 },
          { domain: 'connect.facebook.net', type: 'advertising', sizeKb: 156, blockingMs: 340 },
          { domain: 'snap.licdn.com', type: 'advertising', sizeKb: 67, blockingMs: 190 },
          { domain: 'static.hotjar.com', type: 'analytics', sizeKb: 94, blockingMs: 210 },
          { domain: 'cdn.shopify.com', type: 'platform', sizeKb: 280, blockingMs: 150 },
          { domain: 'bat.bing.com', type: 'advertising', sizeKb: 34, blockingMs: 90 },
          { domain: 'cdn.jsdelivr.net', type: 'utility', sizeKb: 42, blockingMs: 60 },
          { domain: 'js.stripe.com', type: 'payment', sizeKb: 120, blockingMs: 180 },
          { domain: 'widget.intercom.io', type: 'support', sizeKb: 198, blockingMs: 420 },
          { domain: 'cdn.segment.com', type: 'analytics', sizeKb: 76, blockingMs: 140 },
          { domain: 'ct.pinterest.com', type: 'advertising', sizeKb: 28, blockingMs: 70 },
          { domain: 'www.clarity.ms', type: 'analytics', sizeKb: 56, blockingMs: 110 },
          { domain: 'js.driftt.com', type: 'support', sizeKb: 134, blockingMs: 280 },
        ],
        totalScripts: 14,
        totalSizeKb: 1412,
        totalBlockingMs: 2440,
        categories: { analytics: 5, advertising: 4, platform: 1, payment: 1, support: 2, utility: 1 },
        observation: '14 third-party scripts on the checkout page add 2.4s of blocking time and 1.4MB of payload. Advertising scripts (Facebook, LinkedIn, Bing, Pinterest) account for 690ms of blocking on a page where they provide no conversion value since checkout is off-domain.',
      }),
      qualityScore: 90,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_5',
      evidenceKey: 'ev_checkout_form_analysis',
      evidenceType: 'form_analysis',
      payload: JSON.stringify({
        url: 'https://checkout.stripe.com/c/pay/cs_live_abc123',
        formFields: [
          { name: 'email', type: 'email', required: true, autocomplete: 'email' },
          { name: 'card_number', type: 'text', required: true, autocomplete: 'cc-number' },
          { name: 'card_expiry', type: 'text', required: true, autocomplete: 'cc-exp' },
          { name: 'card_cvc', type: 'text', required: true, autocomplete: 'cc-csc' },
          { name: 'billing_name', type: 'text', required: true, autocomplete: 'name' },
          { name: 'billing_country', type: 'select', required: true, autocomplete: 'country' },
          { name: 'billing_zip', type: 'text', required: true, autocomplete: 'postal-code' },
        ],
        totalFields: 7,
        hasShippingAddress: false,
        hasPhoneField: false,
        hasGuestCheckout: true,
        autocompleteSupport: 'full',
        observation: 'Stripe-hosted checkout form is well-structured with proper autocomplete attributes. However, it collects no shipping address or phone number, which limits fraud verification and delivery communication.',
      }),
      qualityScore: 85,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_6',
      evidenceKey: 'ev_ssl_certificate',
      evidenceType: 'ssl_check',
      payload: JSON.stringify({
        domain: 'acme-store.com',
        issuer: "Let's Encrypt Authority X3",
        validFrom: '2026-02-15T00:00:00Z',
        validTo: '2026-05-15T00:00:00Z',
        daysRemaining: 41,
        protocol: 'TLSv1.3',
        cipherSuite: 'TLS_AES_256_GCM_SHA384',
        certChainValid: true,
        hstsEnabled: true,
        hstsMaxAge: 31536000,
        mixedContent: false,
        checkoutDomain: {
          domain: 'checkout.stripe.com',
          issuer: 'DigiCert SHA2 Extended Validation Server CA',
          validFrom: '2026-01-01T00:00:00Z',
          validTo: '2027-01-01T00:00:00Z',
          evCert: true,
        },
        observation: 'SSL certificates are valid on both the primary domain and checkout domain. The primary site uses TLS 1.3 with HSTS. Stripe checkout has an EV certificate. No mixed content detected.',
      }),
      qualityScore: 99,
      collectionMethod: 'api',
    },
    {
      id: 'demo_evidence_7',
      evidenceKey: 'ev_accessibility_mobile',
      evidenceType: 'accessibility_scan',
      payload: JSON.stringify({
        url: 'https://acme-store.com/',
        viewportTested: { width: 375, height: 812, device: 'iPhone 14' },
        viewportMeta: { present: true, content: 'width=device-width, initial-scale=1' },
        touchTargets: { total: 24, tooSmall: 3, minimumSize: '44x44px' },
        fontSizes: { bodyMin: 14, headingMin: 18, ctaMin: 16 },
        tapTargetIssues: [
          { element: '.footer-link', size: '32x32px', recommendation: 'Increase to 44x44px' },
          { element: '.social-icon', size: '28x28px', recommendation: 'Increase to 44x44px' },
          { element: '.breadcrumb a', size: '36x36px', recommendation: 'Increase to 44x44px' },
        ],
        scrollable: true,
        horizontalOverflow: false,
        observation: 'Mobile viewport is properly configured. Content is responsive and scrollable without horizontal overflow. However, 3 tap targets in footer and navigation are below the 44px minimum recommended size.',
      }),
      qualityScore: 78,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_8',
      evidenceKey: 'ev_seo_meta_tags',
      evidenceType: 'seo_analysis',
      payload: JSON.stringify({
        url: 'https://acme-store.com/',
        title: 'Acme Store — Premium Electronics',
        titleLength: 35,
        metaDescription: 'Shop premium electronics at Acme Store. Free shipping on orders over $50.',
        metaDescriptionLength: 72,
        ogTags: {
          'og:title': 'Acme Store — Premium Electronics',
          'og:description': 'Shop premium electronics at Acme Store.',
          'og:image': 'https://acme-store.com/og-image.jpg',
          'og:type': 'website',
        },
        twitterCard: { card: 'summary_large_image', site: '@acmestore' },
        canonicalUrl: 'https://acme-store.com/',
        robots: 'index, follow',
        structuredData: { '@type': 'WebSite', present: true },
        h1Count: 1,
        missingPages: [
          { path: '/products/wireless-headphones-pro', missing: ['og:image'] },
          { path: '/checkout', missing: ['meta description', 'og:title', 'og:description'] },
        ],
        observation: 'Homepage SEO is well-optimized with proper title, meta description, OG tags, and structured data. Product pages are partially optimized — some missing OG images. Checkout page has no SEO tags (expected for transactional pages but affects shared link previews).',
      }),
      qualityScore: 82,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_9',
      evidenceKey: 'ev_page_performance',
      evidenceType: 'performance',
      payload: JSON.stringify({
        pages: [
          { url: 'https://acme-store.com/', lcp: 2.1, fid: 45, cls: 0.05, ttfb: 380, fcp: 1.2, totalSizeKb: 3200 },
          { url: 'https://acme-store.com/products', lcp: 2.8, fid: 62, cls: 0.12, ttfb: 420, fcp: 1.5, totalSizeKb: 4100 },
          { url: 'https://acme-store.com/products/wireless-headphones-pro', lcp: 3.4, fid: 78, cls: 0.08, ttfb: 510, fcp: 1.8, totalSizeKb: 5200 },
          { url: 'https://acme-store.com/cart', lcp: 1.8, fid: 35, cls: 0.03, ttfb: 290, fcp: 0.9, totalSizeKb: 2100 },
          { url: 'https://acme-store.com/checkout', lcp: 4.2, fid: 120, cls: 0.18, ttfb: 680, fcp: 2.4, totalSizeKb: 6800 },
        ],
        worstPage: { url: 'https://acme-store.com/checkout', reason: 'Heavy third-party scripts and redirect chain' },
        coreWebVitals: { lcpPass: false, fidPass: false, clsPass: false },
        observation: 'Homepage and cart perform well. The checkout page is the worst performer: 4.2s LCP, 120ms FID, 0.18 CLS — all failing Core Web Vitals thresholds. The 6.8MB total payload is driven by 14 third-party scripts. Product pages are borderline with 3.4s LCP.',
      }),
      qualityScore: 91,
      collectionMethod: 'api',
    },
    {
      id: 'demo_evidence_10',
      evidenceKey: 'ev_cookie_audit',
      evidenceType: 'cookie_audit',
      payload: JSON.stringify({
        url: 'https://acme-store.com/',
        totalCookies: 18,
        categories: {
          essential: 3,
          analytics: 6,
          advertising: 7,
          functional: 2,
        },
        cookies: [
          { name: '_ga', domain: '.acme-store.com', category: 'analytics', expiry: '2 years', sameSite: 'Lax' },
          { name: '_ga_XXXXX', domain: '.acme-store.com', category: 'analytics', expiry: '2 years', sameSite: 'Lax' },
          { name: '_gid', domain: '.acme-store.com', category: 'analytics', expiry: '24 hours', sameSite: 'Lax' },
          { name: '_fbp', domain: '.acme-store.com', category: 'advertising', expiry: '3 months', sameSite: 'Lax' },
          { name: '_fbc', domain: '.acme-store.com', category: 'advertising', expiry: '2 years', sameSite: 'Lax' },
          { name: 'li_fat_id', domain: '.acme-store.com', category: 'advertising', expiry: '30 days', sameSite: 'None' },
          { name: '_uetsid', domain: '.acme-store.com', category: 'advertising', expiry: '1 day', sameSite: 'None' },
          { name: '_uetvid', domain: '.acme-store.com', category: 'advertising', expiry: '13 months', sameSite: 'None' },
          { name: '_pin_unauth', domain: '.acme-store.com', category: 'advertising', expiry: '1 year', sameSite: 'Lax' },
          { name: '_clck', domain: '.acme-store.com', category: 'analytics', expiry: '1 year', sameSite: 'Lax' },
        ],
        consentBanner: { present: false, required: true },
        observation: 'Site sets 18 cookies including 7 advertising cookies without a consent banner. This creates GDPR/ePrivacy compliance risk for European visitors. Advertising cookies from Facebook, LinkedIn, Bing, and Pinterest are set on first page load.',
      }),
      qualityScore: 87,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_11',
      evidenceKey: 'ev_broken_links',
      evidenceType: 'link_crawl',
      payload: JSON.stringify({
        totalLinksChecked: 142,
        brokenLinks: [
          { url: 'https://acme-store.com/returns', status: 404, linkedFrom: ['/', '/products'], anchorText: 'Returns' },
          { url: 'https://acme-store.com/warranty', status: 404, linkedFrom: ['/products/wireless-headphones-pro'], anchorText: 'Warranty Info' },
          { url: 'https://acme-store.com/shipping-info', status: 404, linkedFrom: ['/cart', '/checkout'], anchorText: 'Shipping Information' },
        ],
        brokenCount: 3,
        redirects: [
          { url: 'https://acme-store.com/shop', redirectsTo: 'https://acme-store.com/products', status: 301 },
        ],
        externalBrokenLinks: [
          { url: 'https://support.acme-store.com/help', status: 503, linkedFrom: ['/contact'], anchorText: 'Help Center' },
        ],
        observation: '3 broken internal links detected: /returns, /warranty, and /shipping-info all return 404. These are critical ecommerce pages linked from product and checkout pages. The missing /returns page compounds the refund policy absence. External help center returns 503.',
      }),
      qualityScore: 93,
      collectionMethod: 'browser',
    },
    {
      id: 'demo_evidence_12',
      evidenceKey: 'ev_conversion_funnel',
      evidenceType: 'conversion_funnel',
      payload: JSON.stringify({
        period: 'last_30_days',
        monthlyVisitors: 48000,
        funnelSteps: [
          { step: 'Landing Page', visitors: 48000, rate: 100, dropOff: 0 },
          { step: 'Product View', visitors: 22800, rate: 47.5, dropOff: 52.5 },
          { step: 'Add to Cart', visitors: 6840, rate: 30.0, dropOff: 70.0 },
          { step: 'Checkout Start', visitors: 3420, rate: 50.0, dropOff: 50.0 },
          { step: 'Payment Page (Stripe)', visitors: 1710, rate: 50.0, dropOff: 50.0 },
          { step: 'Purchase Complete', visitors: 1350, rate: 78.9, dropOff: 21.1 },
        ],
        overallConversionRate: 2.81,
        biggestDropOff: { step: 'Product View -> Add to Cart', rate: 70.0 },
        checkoutDropOff: { step: 'Checkout Start -> Payment Page', rate: 50.0, estimatedLostRevenue: 3200 },
        observation: 'The biggest revenue leak is between Checkout Start and Payment Page — 50% of buyers drop off during the redirect to Stripe. At $85 AOV, this represents ~$3,200/month in lost revenue. The product-to-cart drop-off (70%) is also high but typical for browse-heavy traffic.',
        estimatedMonthlyImpact: {
          checkoutDropOff: 3200,
          productPageDropOff: 1800,
          totalRecoverableRevenue: 5000,
        },
      }),
      qualityScore: 86,
      collectionMethod: 'api',
    },

    // ── High-impact evidence for compelling demo findings ──

    // Mobile checkout completely unreachable → 15-35% revenue impact
    {
      id: 'demo_evidence_13',
      evidenceKey: 'ev_mobile_verification',
      evidenceType: 'mobile_verification',
      payload: JSON.stringify({
        targetUrl: 'https://acme-store.com/',
        device: { name: 'iPhone 14 Pro', viewport: { width: 393, height: 852 } },
        commercialPathReachable: false,
        checkoutReachable: false,
        stepsSucceeded: 2,
        stepsFailed: 4,
        steps: [
          { action: 'navigate_home', success: true, url: 'https://acme-store.com/' },
          { action: 'tap_product', success: true, url: 'https://acme-store.com/products/wireless-headphones-pro' },
          { action: 'tap_add_to_cart', success: false, reason: 'Button not tappable — overlapped by sticky chat widget' },
          { action: 'navigate_cart', success: false, reason: 'Cart icon hidden behind hamburger menu; menu does not open on tap' },
          { action: 'proceed_to_checkout', success: false, reason: 'Never reached cart page' },
          { action: 'complete_payment', success: false, reason: 'Never reached checkout' },
        ],
        trustDegradedVsDesktop: true,
        trustGaps: ['No trust badges visible in mobile viewport', 'Payment icons below fold and never seen'],
        observation: 'Mobile visitors cannot add products to cart or reach checkout. The add-to-cart button is overlapped by the Intercom chat widget on screens narrower than 430px. The hamburger menu tap handler is broken, preventing navigation to cart. This blocks 100% of mobile conversions — approximately 55% of all traffic.',
      }),
      qualityScore: 94,
      collectionMethod: 'browser',
    },

    // Cart page returning 500 intermittently → critical path broken
    {
      id: 'demo_evidence_14',
      evidenceKey: 'ev_cart_http_errors',
      evidenceType: 'http_monitoring',
      payload: JSON.stringify({
        url: 'https://acme-store.com/cart',
        checks: [
          { timestamp: '2026-04-03T02:00:00Z', statusCode: 200, responseTimeMs: 480 },
          { timestamp: '2026-04-03T06:00:00Z', statusCode: 500, responseTimeMs: 12400 },
          { timestamp: '2026-04-03T10:00:00Z', statusCode: 500, responseTimeMs: 15200 },
          { timestamp: '2026-04-03T14:00:00Z', statusCode: 200, responseTimeMs: 520 },
          { timestamp: '2026-04-03T18:00:00Z', statusCode: 500, responseTimeMs: 11800 },
          { timestamp: '2026-04-03T22:00:00Z', statusCode: 200, responseTimeMs: 490 },
        ],
        errorRate: 0.5,
        avgResponseTimeMs: 6815,
        affectedPaths: ['/cart', '/cart/update'],
        errorPattern: 'Intermittent 500 errors correlate with peak traffic hours (6AM-10AM, 6PM). Server returns "Internal Server Error" with no retry headers.',
        observation: 'The cart page fails with HTTP 500 during approximately 50% of checks, primarily during peak traffic hours. Buyers who click "Add to Cart" during these windows see a blank error page with no recovery path. At $120k/mo revenue and 2.8% conversion rate, each hour of cart downtime during peak costs approximately $833 in lost sales.',
      }),
      qualityScore: 93,
      collectionMethod: 'api',
    },

    // Hidden discount endpoint discoverable via parameter guessing
    {
      id: 'demo_evidence_15',
      evidenceKey: 'ev_discount_endpoint_exposed',
      evidenceType: 'deep_crawl',
      payload: JSON.stringify({
        discoveredUrls: [
          {
            url: 'https://acme-store.com/api/discount/apply?code=WELCOME50',
            discoveryMethod: 'parameter_fuzzing',
            statusCode: 200,
            responseBody: '{"discount":50,"type":"percentage","applied":true}',
            routeIntent: 'coupon_discount',
            isNetNew: true,
            appearsGuessable: true,
            hasRateLimiting: false,
            hasAuthentication: false,
          },
          {
            url: 'https://acme-store.com/api/discount/apply?code=STAFF100',
            discoveryMethod: 'parameter_fuzzing',
            statusCode: 200,
            responseBody: '{"discount":100,"type":"percentage","applied":true}',
            routeIntent: 'coupon_discount',
            isNetNew: true,
            appearsGuessable: true,
            hasRateLimiting: false,
            hasAuthentication: false,
          },
          {
            url: 'https://acme-store.com/admin/orders/export?format=csv',
            discoveryMethod: 'path_enumeration',
            statusCode: 200,
            routeIntent: 'admin_data_export',
            isNetNew: true,
            appearsGuessable: true,
            hasAuthentication: false,
          },
        ],
        totalEndpointsTested: 340,
        totalDiscovered: 3,
        observation: 'Three unprotected endpoints discovered. Two discount codes (WELCOME50 for 50% off, STAFF100 for 100% off) can be applied by anyone without authentication or rate limiting. The STAFF100 code eliminates all revenue from any order. Additionally, an admin order export endpoint is publicly accessible without authentication, exposing customer data.',
      }),
      qualityScore: 97,
      collectionMethod: 'automated_scan',
    },

    // Payment API failures during checkout
    {
      id: 'demo_evidence_16',
      evidenceKey: 'ev_payment_api_failures',
      evidenceType: 'network_analysis',
      payload: JSON.stringify({
        context: 'checkout_flow',
        url: 'https://acme-store.com/checkout',
        requests: [
          { url: 'https://acme-store.com/api/create-payment-intent', method: 'POST', status: 200, durationMs: 1200, success: true },
          { url: 'https://acme-store.com/api/create-payment-intent', method: 'POST', status: 502, durationMs: 30000, success: false, error: 'Bad Gateway — upstream Stripe timeout' },
          { url: 'https://acme-store.com/api/create-payment-intent', method: 'POST', status: 502, durationMs: 30000, success: false, error: 'Bad Gateway — upstream Stripe timeout' },
          { url: 'https://acme-store.com/api/verify-address', method: 'POST', status: 504, durationMs: 15000, success: false, error: 'Gateway Timeout' },
        ],
        failureRate: 0.5,
        avgFailureDurationMs: 25000,
        retryBehavior: 'none',
        userFacingError: 'Buyers see "Something went wrong. Please try again." with no specific guidance. No automatic retry is attempted.',
        observation: 'Payment API calls fail approximately 50% of the time due to upstream Stripe timeouts (30-second timeout with no retry). Address verification also times out. When payment creation fails, the buyer sees a generic error with no retry mechanism — most abandon. Combined with the cart intermittent 500s, the checkout funnel has a ~75% technical failure rate during peak hours.',
      }),
      qualityScore: 91,
      collectionMethod: 'browser',
    },

    // Checkout analytics missing — measurement blind spot
    {
      id: 'demo_evidence_17',
      evidenceKey: 'ev_checkout_analytics_gap',
      evidenceType: 'script_audit',
      payload: JSON.stringify({
        comparison: [
          { page: 'https://acme-store.com/', analyticsScripts: ['GA4', 'GTM', 'Facebook Pixel', 'Segment', 'Hotjar', 'Clarity'], count: 6 },
          { page: 'https://acme-store.com/products/wireless-headphones-pro', analyticsScripts: ['GA4', 'GTM', 'Facebook Pixel', 'Segment', 'Hotjar'], count: 5 },
          { page: 'https://acme-store.com/cart', analyticsScripts: ['GA4', 'GTM'], count: 2 },
          { page: 'https://checkout.stripe.com/c/pay/cs_live_abc123', analyticsScripts: [], count: 0 },
          { page: 'https://acme-store.com/thank-you', analyticsScripts: [], count: 0 },
        ],
        gapAnalysis: {
          checkoutTracked: false,
          thankYouTracked: false,
          purchaseEventFiring: false,
          revenueAttributionPossible: false,
        },
        observation: 'Analytics tracking drops from 6 scripts on the homepage to zero on checkout and thank-you pages. Because checkout is off-domain (Stripe hosted), no first-party analytics runs there. The thank-you page has no tracking scripts at all — purchase events never fire. This means: (1) ad platforms cannot attribute conversions, inflating CPA by 40-60%, (2) A/B tests cannot measure checkout impact, (3) retargeting audiences exclude all converters, and (4) revenue reporting in analytics is $0 regardless of actual sales.',
      }),
      qualityScore: 96,
      collectionMethod: 'browser',
    },

    // Security vulnerabilities on payment flow
    {
      id: 'demo_evidence_18',
      evidenceKey: 'ev_security_scan_results',
      evidenceType: 'security_scan',
      payload: JSON.stringify({
        target: 'acme-store.com',
        findings: [
          {
            id: 'vuln_1',
            severity: 'high',
            title: 'Credit card form served over mixed content',
            description: 'The main checkout page at /checkout loads an iframe from an HTTP (non-HTTPS) source for the address autocomplete widget. This creates a mixed content warning and breaks the browser padlock indicator.',
            cwe: 'CWE-319',
            affectsPayment: true,
          },
          {
            id: 'vuln_2',
            severity: 'high',
            title: 'Session token in URL parameter',
            description: 'The checkout flow passes the session token as a URL query parameter (?session=cs_live_abc123). This token appears in browser history, server logs, and Referer headers sent to third parties.',
            cwe: 'CWE-598',
            affectsPayment: true,
          },
          {
            id: 'vuln_3',
            severity: 'medium',
            title: 'Missing Content-Security-Policy on checkout',
            description: 'The /checkout page has no Content-Security-Policy header. Any injected script could exfiltrate payment data.',
            cwe: 'CWE-693',
            affectsPayment: true,
          },
          {
            id: 'vuln_4',
            severity: 'critical',
            title: 'Admin panel accessible without authentication',
            description: 'The /admin/orders endpoint returns full order data (customer names, emails, addresses, last-4 card digits) without requiring authentication.',
            cwe: 'CWE-306',
            affectsPayment: false,
          },
        ],
        totalVulnerabilities: 4,
        criticalCount: 1,
        highCount: 2,
        mediumCount: 1,
        observation: 'Four security issues affect the payment flow and customer data. The most critical is an unauthenticated admin endpoint exposing all order data. Two high-severity issues affect checkout trust: mixed content breaking the padlock and session tokens in URLs. These issues compound the trust erosion from the off-domain redirect chain — buyers who notice the broken padlock or URL token are significantly more likely to abandon.',
      }),
      qualityScore: 94,
      collectionMethod: 'automated_scan',
    },
  ];

  let evidenceCreated = 0;
  for (const ev of evidenceItems) {
    try {
      await prisma.evidence.upsert({
        where: { cycleRef_evidenceKey: { cycleRef, evidenceKey: ev.evidenceKey } },
        create: {
          id: ev.id,
          evidenceKey: ev.evidenceKey,
          evidenceType: ev.evidenceType,
          subjectRef: webRef,
          workspaceRef: wsRef,
          environmentRef: envRef,
          cycleRef,
          observedAt: yesterday,
          freshUntil: freshUntil,
          freshnessState: 'fresh',
          sourceKind: 'automated',
          collectionMethod: ev.collectionMethod,
          qualityScore: ev.qualityScore,
          payload: ev.payload,
          auditCycleId: cycle.id,
        },
        update: {
          payload: ev.payload,
          qualityScore: ev.qualityScore,
        },
      });
      evidenceCreated++;
    } catch (e) {
      console.log(`  ⚠ Evidence ${ev.evidenceKey}: skipped (${(e as Error).message?.slice(0, 60)})`);
    }
  }
  console.log(`  ✓ Evidence: ${evidenceCreated} records created`);

  // ── 5. Conversations + Messages ────────────
  console.log('\n── Conversations ────────────────\n');

  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  // --- Conversation 1: Revenue Leak Analysis ---
  try {
    const conv1 = await prisma.conversation.upsert({
      where: { id: 'demo_conv_1' },
      create: {
        id: 'demo_conv_1',
        organizationId: org.id,
        userId: demoUser.id,
        environmentId: env.id,
        title: 'Revenue Leak Analysis',
        status: 'active',
        messageCount: 6,
        totalCostCents: 1.24,
        totalInputTokens: 8420,
        totalOutputTokens: 4180,
        createdAt: threeDaysAgo,
      },
      update: {
        title: 'Revenue Leak Analysis',
        messageCount: 6,
      },
    });

    const conv1Messages = [
      {
        id: 'demo_msg_1_1',
        role: 'user',
        content: 'Where am I losing money?',
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(threeDaysAgo.getTime()),
      },
      {
        id: 'demo_msg_1_2',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Revenue Leak Analysis\n\nBased on your latest audit of **acme-store.com**, I found **3 active revenue leaks** totaling an estimated **$5,000/month** in recoverable revenue. Here\'s the breakdown:',
          },
          {
            type: 'finding_card',
            finding_id: 'find_1',
            title: 'Checkout redirect drops 50% of buyers',
            severity: 'high',
            monthly_impact: 3200,
            description: 'Your checkout flow redirects through 3 hops to Stripe, causing a 50% drop-off between checkout start and payment page. At your $85 AOV, that\'s ~$3,200/month walking away.',
          },
          {
            type: 'finding_card',
            finding_id: 'find_2',
            title: 'No conversion tracking on checkout',
            severity: 'high',
            monthly_impact: null,
            description: 'GA4 is present on your main site but missing from the Stripe checkout and thank-you page. You\'re flying blind on your most critical funnel step — you can\'t optimize what you can\'t measure.',
          },
          {
            type: 'finding_card',
            finding_id: 'find_3',
            title: 'Product page abandonment above benchmark',
            severity: 'medium',
            monthly_impact: 1800,
            description: '70% of product page visitors leave without adding to cart. Industry benchmark is 55-60%. Slow product page load (3.4s LCP) and missing social proof are likely contributors.',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'Can you explain the checkout redirect issue?',
              'What\'s the fix priority?',
              'Show me the evidence for the checkout drop-off',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 2800,
        outputTokens: 1200,
        costCents: 0.38,
        toolCalls: JSON.stringify([
          { tool: 'get_audit_snapshot', input: { environmentId: 'demo_env' }, durationMs: 120 },
          { tool: 'get_business_profile', input: { organizationId: 'demo_org' }, durationMs: 45 },
        ]),
        purpose: 'core_chat',
        createdAt: new Date(threeDaysAgo.getTime() + 3000),
      },
      {
        id: 'demo_msg_1_3',
        role: 'user',
        content: 'Can you explain the checkout redirect issue?',
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(threeDaysAgo.getTime() + 60000),
      },
      {
        id: 'demo_msg_1_4',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Checkout Redirect Deep Dive\n\nHere\'s exactly what happens when a buyer clicks "Pay Now" on your checkout page:\n\n### The Redirect Chain\n1. **acme-store.com/checkout** — your checkout page (320ms)\n2. **acme-store.com/api/create-session** — your backend creates a Stripe session (890ms)\n3. **pay.stripe.com/checkout/acme** — Stripe\'s redirect endpoint (1,240ms)\n4. **checkout.stripe.com/c/pay/...** — the actual payment form (2,100ms)\n\n**Total time: 4.5 seconds** across 3 redirects and 2 domain changes.\n\n### Why This Kills Conversions\n- **Domain change breaks trust**: Buyers see the URL change from your brand to stripe.com. Less savvy shoppers think they\'re being redirected to a scam.\n- **4.5s of white screen**: Each redirect shows a blank page. Mobile users on 3G see even longer waits.\n- **No back button recovery**: If a buyer clicks back during redirects, they land in a broken state.\n\n### The Evidence\nI captured the full redirect chain via network analysis. Your checkout page also loads **14 third-party scripts** (2.4s of blocking time) before the redirect even starts, making the total checkout experience close to **7 seconds**.\n\n### Impact Math\n- 3,420 buyers reach checkout start per month\n- 1,710 make it to the Stripe payment page (50% survive)\n- 1,350 complete purchase (78.9% of those who see the form)\n- **1,710 lost buyers × $85 AOV × estimated 20% recoverable = ~$3,200/month**',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'What\'s the fix priority?',
              'How do I embed checkout on my domain?',
              'What scripts should I remove from checkout?',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 3200,
        outputTokens: 1400,
        costCents: 0.42,
        toolCalls: JSON.stringify([
          { tool: 'get_evidence', input: { evidenceKey: 'ev_payment_redirect_chain' }, durationMs: 80 },
          { tool: 'get_evidence', input: { evidenceKey: 'ev_third_party_scripts' }, durationMs: 65 },
        ]),
        purpose: 'core_chat',
        createdAt: new Date(threeDaysAgo.getTime() + 65000),
      },
      {
        id: 'demo_msg_1_5',
        role: 'user',
        content: "What's the fix priority?",
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(threeDaysAgo.getTime() + 120000),
      },
      {
        id: 'demo_msg_1_6',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Fix Priority Roadmap\n\nBased on impact, effort, and dependencies, here\'s your recommended order:\n\n### Week 1 — Quick Wins ($1,200/mo recovered)\n1. **Remove non-essential scripts from checkout** — Drop advertising pixels (Facebook, LinkedIn, Bing, Pinterest) from the checkout page. They can\'t track conversions on Stripe anyway. _Effort: 1 hour. Impact: ~15% faster checkout load._\n2. **Add refund policy page** — Publish a clear refund/return policy and link it from the footer and checkout. Reduces chargebacks and builds buyer confidence. _Effort: 2 hours. Impact: Reduces chargeback rate by ~0.2%._\n\n### Week 2 — High Impact ($3,200/mo recovered)\n3. **Switch to Stripe Embedded Checkout** — Replace the redirect flow with Stripe\'s embedded checkout component. Keeps buyers on your domain, eliminates 3 redirects, and cuts checkout time from 7s to under 2s. _Effort: 4-8 hours. Impact: ~$3,200/month in recovered revenue._\n\n### Week 3 — Measurement Foundation\n4. **Deploy cross-domain conversion tracking** — If you can\'t embed checkout yet, at minimum set up Stripe webhook → GA4 server-side tracking so you can measure purchases. _Effort: 3-4 hours. Impact: Unlocks optimization data._\n5. **Fix broken links** — /returns, /warranty, /shipping-info all return 404. Create these pages. _Effort: 3 hours. Impact: Supports buyer confidence._\n\n### Total Estimated Recovery: ~$5,000/month\n\nThe Stripe Embedded Checkout migration is the single highest-impact change. Everything else is supporting.',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'How do I implement Stripe Embedded Checkout?',
              'Draft a refund policy for my store',
              'What should I track in GA4?',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 2420,
        outputTokens: 1580,
        costCents: 0.44,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(threeDaysAgo.getTime() + 125000),
      },
    ];

    for (const msg of conv1Messages) {
      try {
        await prisma.conversationMessage.upsert({
          where: { id: msg.id },
          create: {
            id: msg.id,
            conversationId: conv1.id,
            role: msg.role,
            content: msg.content,
            model: msg.model,
            inputTokens: msg.inputTokens,
            outputTokens: msg.outputTokens,
            costCents: msg.costCents,
            toolCalls: msg.toolCalls,
            purpose: msg.purpose,
            createdAt: msg.createdAt,
          },
          update: {
            content: msg.content,
          },
        });
      } catch (e) {
        console.log(`  ⚠ Message ${msg.id}: skipped (${(e as Error).message?.slice(0, 60)})`);
      }
    }
    console.log('  ✓ Conversation 1: "Revenue Leak Analysis" (6 messages)');
  } catch (e) {
    console.log(`  ⚠ Conversation 1: skipped (${(e as Error).message?.slice(0, 60)})`);
  }

  // --- Conversation 2: Chargeback Risk Assessment ---
  try {
    const conv2 = await prisma.conversation.upsert({
      where: { id: 'demo_conv_2' },
      create: {
        id: 'demo_conv_2',
        organizationId: org.id,
        userId: demoUser.id,
        environmentId: env.id,
        title: 'Chargeback Risk Assessment',
        status: 'active',
        messageCount: 4,
        totalCostCents: 0.72,
        totalInputTokens: 5200,
        totalOutputTokens: 2800,
        createdAt: twoDaysAgo,
      },
      update: {
        title: 'Chargeback Risk Assessment',
        messageCount: 4,
      },
    });

    const conv2Messages = [
      {
        id: 'demo_msg_2_1',
        role: 'user',
        content: "What's my chargeback risk?",
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(twoDaysAgo.getTime()),
      },
      {
        id: 'demo_msg_2_2',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Chargeback Risk Assessment\n\nYour current chargeback rate is **0.6%** — above the Visa threshold of 0.9% but trending in the wrong direction. Here\'s what I found:\n\n### Risk Score: **Medium-High** (confidence: 85%)\n\n### Risk Factors Detected\n\n| Factor | Status | Impact |\n|--------|--------|--------|\n| Refund policy | ❌ Missing | High — #1 chargeback driver |\n| Return policy | ❌ Missing | High — buyers dispute instead of returning |\n| Support link on checkout | ❌ Not linked | Medium — buyers can\'t find help |\n| Contact page | ✅ Exists | Low — but not accessible from checkout |\n| Delivery estimate | ❌ Not shown | Medium — "item not received" disputes |\n| SSL/security | ✅ Valid | Low — no fraud-type disputes |\n\n### Estimated Monthly Chargeback Cost\n- Current: **$720/month** (0.6% × $120,000 revenue)\n- If rate reaches 0.9%: **$1,080/month** + processor warning\n- If rate exceeds 1.0%: **Account review + $25/chargeback fee**\n\nThe missing refund policy is the single biggest risk. Buyers who want a refund but can\'t find your policy go straight to their bank.',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'How do I reduce chargebacks?',
              'Draft a refund policy for me',
              'What does a Visa chargeback review look like?',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 2600,
        outputTokens: 1400,
        costCents: 0.36,
        toolCalls: JSON.stringify([
          { tool: 'get_audit_snapshot', input: { environmentId: 'demo_env' }, durationMs: 110 },
          { tool: 'get_business_profile', input: { organizationId: 'demo_org' }, durationMs: 50 },
        ]),
        purpose: 'core_chat',
        createdAt: new Date(twoDaysAgo.getTime() + 4000),
      },
      {
        id: 'demo_msg_2_3',
        role: 'user',
        content: 'How do I reduce chargebacks?',
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(twoDaysAgo.getTime() + 90000),
      },
      {
        id: 'demo_msg_2_4',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Chargeback Reduction Action Plan\n\nHere\'s a prioritized plan to bring your chargeback rate from 0.6% down to under 0.3% within 60 days:\n\n### Immediate (This Week)\n1. **Publish a refund/return policy** — Create a dedicated page at `/returns` with clear timelines (e.g., "30-day no-questions-asked returns"). Link it from:\n   - Site footer (every page)\n   - Checkout page (near payment button)\n   - Order confirmation email\n   - _Expected impact: -0.15% chargeback rate_\n\n2. **Add support contact to checkout flow** — Put your email/phone number and a "Need help?" link in the checkout footer. Buyers who can reach you won\'t call their bank.\n   - _Expected impact: -0.05% chargeback rate_\n\n### Short-Term (Next 2 Weeks)\n3. **Show estimated delivery dates** — Display "Estimated delivery: [date]" on the cart and checkout pages. "Item not received" is the second most common dispute reason.\n   - _Expected impact: -0.08% chargeback rate_\n\n4. **Send shipping confirmation with tracking** — If you\'re not already doing this, automated shipping emails with tracking numbers prevent "where\'s my order" disputes.\n   - _Expected impact: -0.05% chargeback rate_\n\n### Verification Steps\n- [ ] Confirm refund policy is live and linked from checkout (re-run Vestigio audit)\n- [ ] Test the full purchase flow and verify support links are visible\n- [ ] Monitor chargeback rate weekly for 60 days via Stripe dashboard\n- [ ] Set up a Stripe Radar rule to flag orders over $200 for manual review\n\n### Target Outcome\n**0.6% → 0.27%** chargeback rate, saving approximately **$400/month** in dispute costs and keeping you well below processor thresholds.',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'Draft the refund policy page content',
              'What Stripe Radar rules should I set up?',
              'How do I add delivery estimates?',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 2600,
        outputTokens: 1400,
        costCents: 0.36,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(twoDaysAgo.getTime() + 95000),
      },
    ];

    for (const msg of conv2Messages) {
      try {
        await prisma.conversationMessage.upsert({
          where: { id: msg.id },
          create: {
            id: msg.id,
            conversationId: conv2.id,
            role: msg.role,
            content: msg.content,
            model: msg.model,
            inputTokens: msg.inputTokens,
            outputTokens: msg.outputTokens,
            costCents: msg.costCents,
            toolCalls: msg.toolCalls,
            purpose: msg.purpose,
            createdAt: msg.createdAt,
          },
          update: {
            content: msg.content,
          },
        });
      } catch (e) {
        console.log(`  ⚠ Message ${msg.id}: skipped (${(e as Error).message?.slice(0, 60)})`);
      }
    }
    console.log('  ✓ Conversation 2: "Chargeback Risk Assessment" (4 messages)');
  } catch (e) {
    console.log(`  ⚠ Conversation 2: skipped (${(e as Error).message?.slice(0, 60)})`);
  }

  // --- Conversation 3: Scale Readiness Check ---
  try {
    const conv3 = await prisma.conversation.upsert({
      where: { id: 'demo_conv_3' },
      create: {
        id: 'demo_conv_3',
        organizationId: org.id,
        userId: demoUser.id,
        environmentId: env.id,
        title: 'Scale Readiness Check',
        status: 'active',
        messageCount: 4,
        totalCostCents: 0.68,
        totalInputTokens: 4800,
        totalOutputTokens: 2600,
        createdAt: yesterday,
      },
      update: {
        title: 'Scale Readiness Check',
        messageCount: 4,
      },
    });

    const conv3Messages = [
      {
        id: 'demo_msg_3_1',
        role: 'user',
        content: 'Can I safely scale paid traffic?',
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(yesterday.getTime()),
      },
      {
        id: 'demo_msg_3_2',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Scale Readiness: ❌ Not Yet Safe\n\n**Decision: Fix before scaling** (confidence: 82%)\n\nScaling paid traffic right now would amplify existing problems. Here\'s the signal breakdown:\n\n### 🔴 Blockers (must fix first)\n- **Checkout trust break**: Off-domain redirect through 3 hops loses 50% of checkout starters. Scaling traffic into a broken funnel just means paying more for the same drop-off.\n- **No conversion measurement**: Without tracking on checkout/thank-you pages, you can\'t measure ROAS. You\'d be scaling blind — no way to know which campaigns convert.\n\n### 🟡 Risks (fix soon)\n- **Chargeback rate at 0.6%**: More volume at this rate pushes you toward processor thresholds. At 2x traffic, you\'d be processing ~$240k/mo with 0.6% chargebacks = $1,440/mo in disputes.\n- **14 third-party scripts on checkout**: Page load is 7+ seconds. Paid traffic (especially mobile) has lower patience than organic.\n\n### 🟢 Strengths (ready to scale)\n- SSL and security infrastructure is solid\n- GA4 is tracking on main site pages\n- Mobile viewport is properly configured\n- Pricing page and CTAs are well-positioned\n- Core site performance (homepage, cart) is good\n\n### Bottom Line\nYour site infrastructure is **70% ready**. The checkout flow and measurement gaps are the two blockers. Fix those first, then you can scale with confidence.',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'What should I fix first before scaling?',
              'How long will the fixes take?',
              'What ROAS should I expect after fixes?',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 2400,
        outputTokens: 1300,
        costCents: 0.34,
        toolCalls: JSON.stringify([
          { tool: 'get_audit_snapshot', input: { environmentId: 'demo_env' }, durationMs: 105 },
          { tool: 'get_business_profile', input: { organizationId: 'demo_org' }, durationMs: 48 },
        ]),
        purpose: 'core_chat',
        createdAt: new Date(yesterday.getTime() + 5000),
      },
      {
        id: 'demo_msg_3_3',
        role: 'user',
        content: 'What should I fix first before scaling?',
        model: null,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        toolCalls: null,
        purpose: 'core_chat',
        createdAt: new Date(yesterday.getTime() + 120000),
      },
      {
        id: 'demo_msg_3_4',
        role: 'assistant',
        content: JSON.stringify([
          {
            type: 'markdown',
            content: '## Pre-Scale Roadmap\n\nHere\'s your 3-week path to being scale-ready:\n\n### Phase 1: Measurement (Days 1-3) — Unlock Data\n**Goal**: Be able to measure conversions end-to-end before changing anything else.\n\n1. **Set up Stripe webhooks → GA4 Measurement Protocol** — Server-side conversion tracking that works regardless of checkout hosting.\n   - Time: 3-4 hours (developer)\n   - Why first: You need baseline data before making checkout changes\n\n2. **Configure cross-domain GA4 tracking** — Add your Stripe checkout domain to GA4 referral exclusions and enable cross-domain measurement.\n   - Time: 30 minutes\n   - Why: Prevents Stripe from appearing as a referral source\n\n### Phase 2: Checkout Fix (Days 4-10) — Stop the Bleed\n**Goal**: Reduce checkout drop-off from 50% to under 20%.\n\n3. **Migrate to Stripe Embedded Checkout** — Stripe\'s `EmbeddedCheckout` component renders the payment form on your domain. No redirects, no domain changes.\n   - Time: 4-8 hours (developer)\n   - Expected impact: +$3,200/month revenue\n\n4. **Strip non-essential scripts from checkout** — Remove Facebook, LinkedIn, Bing, Pinterest, Hotjar, Clarity, Drift pixels from the checkout page.\n   - Time: 1 hour\n   - Expected impact: Checkout load time drops from 7s to ~2s\n\n### Phase 3: Trust & Policy (Days 11-17) — Build Confidence\n**Goal**: Reduce chargebacks and increase buyer confidence.\n\n5. **Publish refund + shipping policies** — Create `/returns` and `/shipping-info` pages.\n6. **Add support link to checkout** — Phone number or chat widget in checkout footer.\n7. **Fix broken links** — `/returns`, `/warranty`, `/shipping-info` all 404 currently.\n\n### Phase 4: Validate & Scale (Days 18-21)\n8. **Re-run Vestigio audit** — Verify all changes are detected\n9. **Monitor for 7 days** — Watch conversion rate, chargeback rate, page speed\n10. **Scale traffic** — Start with 25% budget increase, then ramp weekly\n\n### Expected Outcome After Fixes\n| Metric | Current | Target |\n|--------|---------|--------|\n| Checkout completion | 50% | 80%+ |\n| Chargeback rate | 0.6% | <0.3% |\n| Checkout load time | 7s | <2s |\n| Monthly revenue | $120k | $125k+ |\n| Recoverable at 2x traffic | — | +$10k/mo |',
          },
          {
            type: 'suggested_prompts',
            prompts: [
              'Generate a technical spec for the Stripe migration',
              'What should my GA4 conversion events look like?',
              'Show me checkout performance benchmarks',
            ],
          },
        ]),
        model: 'sonnet_4_6',
        inputTokens: 2400,
        outputTokens: 1300,
        costCents: 0.34,
        toolCalls: JSON.stringify([
          { tool: 'get_evidence', input: { evidenceKey: 'ev_page_performance' }, durationMs: 72 },
          { tool: 'get_evidence', input: { evidenceKey: 'ev_conversion_funnel' }, durationMs: 68 },
        ]),
        purpose: 'core_chat',
        createdAt: new Date(yesterday.getTime() + 128000),
      },
    ];

    for (const msg of conv3Messages) {
      try {
        await prisma.conversationMessage.upsert({
          where: { id: msg.id },
          create: {
            id: msg.id,
            conversationId: conv3.id,
            role: msg.role,
            content: msg.content,
            model: msg.model,
            inputTokens: msg.inputTokens,
            outputTokens: msg.outputTokens,
            costCents: msg.costCents,
            toolCalls: msg.toolCalls,
            purpose: msg.purpose,
            createdAt: msg.createdAt,
          },
          update: {
            content: msg.content,
          },
        });
      } catch (e) {
        console.log(`  ⚠ Message ${msg.id}: skipped (${(e as Error).message?.slice(0, 60)})`);
      }
    }
    console.log('  ✓ Conversation 3: "Scale Readiness Check" (4 messages)');
  } catch (e) {
    console.log(`  ⚠ Conversation 3: skipped (${(e as Error).message?.slice(0, 60)})`);
  }

  // ── 6. Token cost ledger entries ───────────
  console.log('\n── Token cost ledger ─────────────\n');

  const ledgerEntries = [
    { id: 'demo_ledger_1', conversationId: 'demo_conv_1', model: 'sonnet_4_6', purpose: 'core_chat', inputTokens: 8420, outputTokens: 4180, costCents: 1.24, latencyMs: 2800 },
    { id: 'demo_ledger_2', conversationId: 'demo_conv_2', model: 'sonnet_4_6', purpose: 'core_chat', inputTokens: 5200, outputTokens: 2800, costCents: 0.72, latencyMs: 2100 },
    { id: 'demo_ledger_3', conversationId: 'demo_conv_3', model: 'sonnet_4_6', purpose: 'core_chat', inputTokens: 4800, outputTokens: 2600, costCents: 0.68, latencyMs: 1900 },
    { id: 'demo_ledger_4', conversationId: 'demo_conv_1', model: 'haiku_4_5', purpose: 'input_guard', inputTokens: 320, outputTokens: 45, costCents: 0.003, latencyMs: 180 },
    { id: 'demo_ledger_5', conversationId: 'demo_conv_2', model: 'haiku_4_5', purpose: 'input_guard', inputTokens: 280, outputTokens: 38, costCents: 0.002, latencyMs: 160 },
  ];

  for (const entry of ledgerEntries) {
    try {
      await prisma.tokenCostLedger.upsert({
        where: { id: entry.id },
        create: {
          id: entry.id,
          organizationId: org.id,
          userId: demoUser.id,
          conversationId: entry.conversationId,
          model: entry.model,
          purpose: entry.purpose,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          costCents: entry.costCents,
          latencyMs: entry.latencyMs,
          isToolUse: false,
        },
        update: {},
      });
    } catch (e) {
      console.log(`  ⚠ Ledger ${entry.id}: skipped (${(e as Error).message?.slice(0, 60)})`);
    }
  }
  console.log(`  ✓ Token ledger: ${ledgerEntries.length} entries`);

  // ── 7. Chat feedback ──────────────────────
  console.log('\n── Chat feedback ────────────────\n');

  const feedbackItems = [
    {
      id: 'demo_feedback_1',
      conversationId: 'demo_conv_1',
      messageId: 'demo_msg_1_2',
      rating: 'positive' as const,
      comment: 'Really helpful breakdown of where the revenue is leaking. The dollar amounts make it easy to prioritize.',
      messagePreview: 'Based on your latest audit of acme-store.com, I found 3 active revenue leaks totaling an estimated $5,000/month in recoverable revenue.',
      model: 'sonnet_4_6',
    },
    {
      id: 'demo_feedback_2',
      conversationId: 'demo_conv_3',
      messageId: 'demo_msg_3_4',
      rating: 'positive' as const,
      comment: 'The phased roadmap with time estimates is exactly what I needed. Clear and actionable.',
      messagePreview: 'Here\'s your 3-week path to being scale-ready: Phase 1: Measurement (Days 1-3) — Unlock Data...',
      model: 'sonnet_4_6',
    },
  ];

  for (const fb of feedbackItems) {
    try {
      await prisma.chatFeedback.upsert({
        where: { id: fb.id },
        create: {
          id: fb.id,
          organizationId: org.id,
          userId: demoUser.id,
          conversationId: fb.conversationId,
          messageId: fb.messageId,
          rating: fb.rating,
          comment: fb.comment,
          messagePreview: fb.messagePreview,
          model: fb.model,
        },
        update: {},
      });
    } catch (e) {
      console.log(`  ⚠ Feedback ${fb.id}: skipped (${(e as Error).message?.slice(0, 60)})`);
    }
  }
  console.log(`  ✓ Chat feedback: ${feedbackItems.length} positive ratings`);

  console.log('\n══════════════════════════════════');
  console.log('✓ Seed complete.');
  console.log(`\n  Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('══════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
