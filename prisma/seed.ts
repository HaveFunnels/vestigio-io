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
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// Demo data constants
// ──────────────────────────────────────────────

const DEMO_EMAIL = 'demo@vestigio.io';
const DEMO_PASSWORD = 'demo1234';
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
  const org = await prisma.organization.upsert({
    where: { id: 'demo_org' },
    create: {
      id: 'demo_org',
      name: 'Acme Store',
      ownerId: demoUser.id,
      plan: 'pro',
      status: 'active',
    },
    update: {
      name: 'Acme Store',
      ownerId: demoUser.id,
      plan: 'pro',
      status: 'active',
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
