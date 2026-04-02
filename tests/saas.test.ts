/**
 * Vestigio V2 — SaaS Control Plane Test Suite
 * Tests: plans, entitlements, usage tracking, MCP enforcement,
 *        bootstrap, session context, org activation
 *
 * Run: npx tsx tests/saas.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping,
  pageContentEvidence, checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  getPlanEntitlements,
  isPlanKey,
  planFromPriceId,
  priceIdForPlan,
  getAllPlans,
} from '../packages/plans';
import type { PlanKey } from '../packages/plans';
import {
  getUsage,
  incrementUsage,
  getUsageSummary,
  checkUsageLimit,
  resetUsage,
  resetAllUsage,
} from '../apps/mcp/usage';
import { McpServer } from '../apps/mcp/server';
import { bootstrapMcpContextSync, extractDomain, normalizeLandingUrl } from '../apps/mcp/bootstrap';
import { McpRequestScope } from '../apps/mcp/types';

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(name: string, fn: () => void): void {
  resetCounters();
  fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

const scope: McpRequestScope = { workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1' };

function standardEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  ];
}

// ══════════════════════════════════════════════════
// 1. PLAN MODEL + ENTITLEMENTS
// ══════════════════════════════════════════════════

runSuite('Plan Model', () => {
  test('getPlanEntitlements returns valid entitlements for all plans', () => {
    const plans: PlanKey[] = ['vestigio', 'pro', 'max'];
    for (const plan of plans) {
      const e = getPlanEntitlements(plan);
      assertEqual(e.plan, plan);
      assert(e.label.length > 0, `${plan}: has label`);
      assertGreater(e.max_mcp_calls_per_month, 0, `${plan}: has MCP limit`);
      assertGreater(e.max_environments, 0, `${plan}: has env limit`);
      assertGreater(e.max_members, 0, `${plan}: has member limit`);
    }
  });

  test('plan tiers scale correctly', () => {
    const vestigio = getPlanEntitlements('vestigio');
    const pro = getPlanEntitlements('pro');
    const max = getPlanEntitlements('max');

    assert(pro.max_mcp_calls_per_month > vestigio.max_mcp_calls_per_month, 'pro > vestigio MCP calls');
    assert(max.max_mcp_calls_per_month > pro.max_mcp_calls_per_month, 'max > pro MCP calls');
    assert(!vestigio.continuous_audits_enabled, 'vestigio: no continuous');
    assert(pro.continuous_audits_enabled, 'pro: has continuous');
    assert(!vestigio.credits_enabled, 'vestigio: no credits');
    assert(max.credits_enabled, 'max: has credits');
  });

  test('isPlanKey validates correctly', () => {
    assert(isPlanKey('vestigio'), 'vestigio is valid');
    assert(isPlanKey('pro'), 'pro is valid');
    assert(isPlanKey('max'), 'max is valid');
    assert(!isPlanKey('enterprise'), 'enterprise is invalid');
    assert(!isPlanKey(''), 'empty is invalid');
  });

  test('planFromPriceId maps Stripe prices to plans', () => {
    assertEqual(planFromPriceId('price_1ObHbkLtGdPVhGLem0CLA5iT'), 'vestigio');
    assertEqual(planFromPriceId('price_1ObHcJLtGdPVhGLeBp9hB4nv'), 'pro');
    assertEqual(planFromPriceId('price_1ObHcXLtGdPVhGLejTMpdiT8'), 'max');
    assertEqual(planFromPriceId('unknown_price'), 'vestigio'); // fallback
  });

  test('priceIdForPlan returns valid price IDs', () => {
    const vestigioPrice = priceIdForPlan('vestigio');
    const proPrice = priceIdForPlan('pro');
    const maxPrice = priceIdForPlan('max');
    assert(vestigioPrice.startsWith('price_'), 'vestigio: valid price ID');
    assert(proPrice.startsWith('price_'), 'pro: valid price ID');
    assert(maxPrice.startsWith('price_'), 'max: valid price ID');
    assert(vestigioPrice !== proPrice, 'different price IDs');
  });

  test('getAllPlans returns 3 plans', () => {
    const plans = getAllPlans();
    assertEqual(plans.length, 3);
  });
});

// ══════════════════════════════════════════════════
// 2. MCP USAGE TRACKING
// ══════════════════════════════════════════════════

runSuite('MCP Usage Tracking', () => {
  test('usage starts at zero', () => {
    resetAllUsage();
    assertEqual(getUsage('org_test'), 0);
  });

  test('incrementUsage tracks calls', () => {
    resetAllUsage();
    incrementUsage('org_test');
    assertEqual(getUsage('org_test'), 1);
    incrementUsage('org_test');
    assertEqual(getUsage('org_test'), 2);
    incrementUsage('org_test', 5);
    assertEqual(getUsage('org_test'), 7);
  });

  test('usage isolated per org', () => {
    resetAllUsage();
    incrementUsage('org_a', 10);
    incrementUsage('org_b', 5);
    assertEqual(getUsage('org_a'), 10);
    assertEqual(getUsage('org_b'), 5);
  });

  test('getUsageSummary reflects plan limits', () => {
    resetAllUsage();
    incrementUsage('org_test', 30);
    const summary = getUsageSummary('org_test', 'vestigio');
    assertEqual(summary.mcp_calls_used, 30);
    assertEqual(summary.mcp_calls_limit, 50);
    assertEqual(summary.mcp_calls_remaining, 20);
    assertEqual(summary.is_over_limit, false);
  });

  test('checkUsageLimit blocks when over limit', () => {
    resetAllUsage();
    incrementUsage('org_test', 50); // exhaust vestigio limit
    const check = checkUsageLimit('org_test', 'vestigio');
    assertEqual(check.allowed, false);
    assert(check.upgrade_message !== null, 'should have upgrade message');
    assert(check.upgrade_message!.includes('Pro'), 'should suggest Pro upgrade');
  });

  test('checkUsageLimit allows when under limit', () => {
    resetAllUsage();
    incrementUsage('org_test', 10);
    const check = checkUsageLimit('org_test', 'vestigio');
    assertEqual(check.allowed, true);
    assertEqual(check.upgrade_message, null);
  });

  test('pro plan has higher limit', () => {
    resetAllUsage();
    incrementUsage('org_test', 100);
    const vestigioCheck = checkUsageLimit('org_test', 'vestigio');
    const proCheck = checkUsageLimit('org_test', 'pro');
    assertEqual(vestigioCheck.allowed, false); // 100 > 50
    assertEqual(proCheck.allowed, true);        // 100 < 250
  });

  test('resetUsage clears org usage', () => {
    resetAllUsage();
    incrementUsage('org_test', 25);
    resetUsage('org_test');
    assertEqual(getUsage('org_test'), 0);
  });
});

// ══════════════════════════════════════════════════
// 3. MCP BOOTSTRAP
// ══════════════════════════════════════════════════

runSuite('MCP Bootstrap', () => {
  test('bootstrapMcpContextSync loads context', () => {
    const server = new McpServer();
    const evidence = standardEvidence();

    bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, evidence);

    assert(server.getContext() !== null, 'context should be loaded');
  });

  test('bootstrap produces working projections', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    const result = server.callTool('get_finding_projections');
    assertEqual(result.type, 'finding_projections');
    assertGreater((result.data as any).length, 0, 'should have findings');
  });

  test('bootstrap produces working answers', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    const result = server.callTool('answer_can_i_scale');
    assertEqual(result.type, 'answer');
    assert((result.data as any).suggestions !== null, 'should have suggestions');
  });

  test('extractDomain handles various URL formats', () => {
    assertEqual(extractDomain('https://example.com'), 'example.com');
    assertEqual(extractDomain('https://www.example.com/page'), 'www.example.com');
    assertEqual(extractDomain('example.com'), 'example.com');
    assertEqual(extractDomain('http://shop.io/checkout'), 'shop.io');
  });

  test('normalizeLandingUrl adds protocol', () => {
    assertEqual(normalizeLandingUrl('example.com'), 'https://example.com');
    assertEqual(normalizeLandingUrl('https://example.com'), 'https://example.com');
    assertEqual(normalizeLandingUrl('http://example.com'), 'http://example.com');
  });
});

// ══════════════════════════════════════════════════
// 4. USAGE + MCP INTEGRATION
// ══════════════════════════════════════════════════

runSuite('Usage + MCP Integration', () => {
  test('MCP calls can be metered after bootstrap', () => {
    resetAllUsage();
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_metered',
      organization_name: 'Metered Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    // Simulate metered call
    const orgId = 'org_metered';
    const check = checkUsageLimit(orgId, 'vestigio');
    assert(check.allowed, 'should be allowed initially');

    incrementUsage(orgId);
    const result = server.callTool('answer_can_i_scale');
    assertEqual(result.type, 'answer');

    assertEqual(getUsage(orgId), 1);
  });

  test('usage limit blocks further MCP calls', () => {
    resetAllUsage();
    const orgId = 'org_limited';

    // Exhaust limit
    for (let i = 0; i < 50; i++) incrementUsage(orgId);

    const check = checkUsageLimit(orgId, 'vestigio');
    assertEqual(check.allowed, false);
    assert(check.upgrade_message!.includes('Upgrade'), 'should suggest upgrade');
  });
});

// ══════════════════════════════════════════════════
// 5. SERVER SESSION + ORG CONTEXT
// ══════════════════════════════════════════════════

runSuite('Server Org Context', () => {
  test('server session tracks org context', () => {
    const server = new McpServer();
    server.updateSession({ active_workspace: 'preflight' });
    assertEqual(server.getSession().active_workspace, 'preflight');
  });

  test('reset session clears org context', () => {
    const server = new McpServer();
    server.updateSession({ active_workspace: 'revenue' });
    server.resetSession();
    assertEqual(server.getSession().active_workspace, undefined);
  });

  test('bootstrapped server has full tool access', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_tools',
      organization_name: 'Tools Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    // All projection tools should work
    const findings = server.callTool('get_finding_projections');
    const actions = server.callTool('get_action_projections');
    const workspaces = server.callTool('get_workspace_projections');
    const map = server.callTool('get_map', { map_type: 'root_cause' });

    assertEqual(findings.type, 'finding_projections');
    assertEqual(actions.type, 'action_projections');
    assertEqual(workspaces.type, 'workspace_projections');
    assertEqual(map.type, 'map');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  SAAS CONTROL PLANE TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
