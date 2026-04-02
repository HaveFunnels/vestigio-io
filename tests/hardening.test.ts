/**
 * Vestigio V2 — Production Hardening Test Suite
 * Tests: no demo data, DataState correctness, bootstrap determinism,
 *        graceful failure, usage persistence, audit lifecycle
 *
 * Run: npx tsx tests/hardening.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping,
  pageContentEvidence, checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { McpServer } from '../apps/mcp/server';
import { McpRequestScope } from '../apps/mcp/types';
import {
  bootstrapMcpContextSync,
  bootstrapMcpContext,
  BootstrapResult,
  extractDomain,
  normalizeLandingUrl,
} from '../apps/mcp/bootstrap';
import {
  getUsage,
  incrementUsage,
  getUsageSummary,
  checkUsageLimit,
  seedUsage,
  getUsageRecord,
  resetAllUsage,
  currentPeriod,
} from '../apps/mcp/usage';
import { getPlanEntitlements } from '../packages/plans';

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
// 1. MCP FAILS GRACEFULLY WITHOUT CONTEXT
// ══════════════════════════════════════════════════

runSuite('MCP Without Context', () => {
  test('callTool on empty server returns error', () => {
    const server = new McpServer();
    const result = server.callTool('get_finding_projections');
    assertEqual(result.type, 'error');
    assert((result.data as any).message.includes('No context'), 'should explain no context');
  });

  test('answer tool on empty server returns error', () => {
    const server = new McpServer();
    const result = server.callTool('answer_can_i_scale');
    assertEqual(result.type, 'error');
  });

  test('discuss_finding on empty server returns error', () => {
    const server = new McpServer();
    const result = server.callTool('discuss_finding', { finding_id: 'test' });
    assertEqual(result.type, 'error');
  });

  test('getContext returns null on fresh server', () => {
    const server = new McpServer();
    assertEqual(server.getContext(), null);
  });
});

// ══════════════════════════════════════════════════
// 2. BOOTSTRAP DETERMINISM
// ══════════════════════════════════════════════════

runSuite('Bootstrap Determinism', () => {
  test('same inputs produce same cycle_ref', () => {
    const server1 = new McpServer();
    const server2 = new McpServer();
    const input = {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
      audit_cycle_id: 'cycle_abc',
    };
    const evidence = standardEvidence();

    const r1 = bootstrapMcpContextSync(server1, input, evidence);
    const r2 = bootstrapMcpContextSync(server2, input, evidence);

    assert(r1.status === 'ready' && r2.status === 'ready', 'both should be ready');
    if (r1.status === 'ready' && r2.status === 'ready') {
      assertEqual(r1.cycle_ref, r2.cycle_ref, 'cycle refs should be identical');
    }
  });

  test('different audit_cycle_id produces different cycle_ref', () => {
    const server1 = new McpServer();
    const server2 = new McpServer();
    const base = {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    };
    const evidence = standardEvidence();

    const r1 = bootstrapMcpContextSync(server1, { ...base, audit_cycle_id: 'cycle_1' }, evidence);
    const r2 = bootstrapMcpContextSync(server2, { ...base, audit_cycle_id: 'cycle_2' }, evidence);

    if (r1.status === 'ready' && r2.status === 'ready') {
      assert(r1.cycle_ref !== r2.cycle_ref, 'different cycles should produce different refs');
    }
  });

  test('bootstrap with empty evidence returns no_data', () => {
    const server = new McpServer();
    const result = bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, []);

    assertEqual(result.status, 'no_data');
    assertEqual(server.getContext(), null); // should NOT have loaded
  });

  test('bootstrap with missing required fields returns error', () => {
    const server = new McpServer();
    const result = bootstrapMcpContextSync(server, {
      organization_id: '',
      organization_name: 'Test',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    assertEqual(result.status, 'error');
  });

  test('bootstrap result includes evidence count', () => {
    const server = new McpServer();
    const evidence = standardEvidence();
    const result = bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, evidence);

    if (result.status === 'ready') {
      assertEqual(result.evidence_count, evidence.length);
    }
  });
});

// ══════════════════════════════════════════════════
// 3. USAGE PERSISTENCE INTERFACE
// ══════════════════════════════════════════════════

runSuite('Usage Persistence', () => {
  test('seedUsage pre-loads cache from DB values', () => {
    resetAllUsage();
    seedUsage('org_seeded', 42);
    assertEqual(getUsage('org_seeded'), 42);
  });

  test('seedUsage + increment works correctly', () => {
    resetAllUsage();
    seedUsage('org_seeded', 100);
    incrementUsage('org_seeded', 5);
    assertEqual(getUsage('org_seeded'), 105);
  });

  test('getUsageRecord returns DB-writable record', () => {
    const record = getUsageRecord('org_1', 'mcp_chat');
    assertEqual(record.organizationId, 'org_1');
    assertEqual(record.usageType, 'mcp_chat');
    assertEqual(record.amount, 1);
    assertEqual(record.period, currentPeriod());
  });

  test('currentPeriod returns YYYY-MM format', () => {
    const p = currentPeriod();
    assert(/^\d{4}-\d{2}$/.test(p), `period should be YYYY-MM, got: ${p}`);
  });
});

// ══════════════════════════════════════════════════
// 4. NO DEMO DATA IN ENGINE
// ══════════════════════════════════════════════════

runSuite('No Demo Data in Engine', () => {
  test('fresh server produces no projections', () => {
    const server = new McpServer();
    const result = server.callTool('get_finding_projections');
    assertEqual(result.type, 'error'); // no context → error, not fake data
  });

  test('bootstrapped server produces real data only', () => {
    const server = new McpServer();
    const result = bootstrapMcpContextSync(server, {
      organization_id: 'org_real',
      organization_name: 'Real Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    assertEqual(result.status, 'ready');

    const findings = server.callTool('get_finding_projections');
    assertEqual(findings.type, 'finding_projections');
    // Findings should come from actual inference pipeline, not hardcoded
    for (const f of (findings.data as any[])) {
      assert(f.id.startsWith('finding_'), 'finding id should follow convention');
      assertGreater(f.impact.midpoint, 0, 'impact should be computed, not hardcoded');
    }
  });
});

// ══════════════════════════════════════════════════
// 5. AUDIT LIFECYCLE
// ══════════════════════════════════════════════════

runSuite('Audit Lifecycle', () => {
  test('bootstrap requires evidence (no silent fallback)', () => {
    const server = new McpServer();
    const result = bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test',
      environment_id: 'env_1',
      domain: 'empty.com',
      landing_url: 'https://empty.com/',
      is_production: true,
    }, []);

    assertEqual(result.status, 'no_data');
    assert(server.getContext() === null, 'context should not be loaded');
  });

  test('switching environments reloads context', () => {
    const server = new McpServer();

    // Load env 1
    bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
      audit_cycle_id: 'cycle_env1',
    }, standardEvidence());

    const ctx1 = server.getContext();
    assert(ctx1 !== null, 'should have context for env1');

    // Load env 2 — different evidence set
    bootstrapMcpContextSync(server, {
      organization_id: 'org_1',
      organization_name: 'Test',
      environment_id: 'env_2',
      domain: 'other.com',
      landing_url: 'https://other.com/',
      is_production: true,
      audit_cycle_id: 'cycle_env2',
    }, [pageContentEvidence('https://other.com/')]);

    const ctx2 = server.getContext();
    assert(ctx2 !== null, 'should have context for env2');
    // Contexts should be different (different domain)
    assert(ctx1!.root_domain !== ctx2!.root_domain || ctx1!.cycle_ref !== ctx2!.cycle_ref,
      'different env should produce different context');
  });
});

// ══════════════════════════════════════════════════
// 6. USAGE ENFORCEMENT EDGE CASES
// ══════════════════════════════════════════════════

runSuite('Usage Enforcement Edge Cases', () => {
  test('exactly at limit is blocked', () => {
    resetAllUsage();
    const limit = getPlanEntitlements('vestigio').max_mcp_calls_per_month;
    seedUsage('org_exact', limit);
    const check = checkUsageLimit('org_exact', 'vestigio');
    assertEqual(check.allowed, false);
  });

  test('one below limit is allowed', () => {
    resetAllUsage();
    const limit = getPlanEntitlements('vestigio').max_mcp_calls_per_month;
    seedUsage('org_below', limit - 1);
    const check = checkUsageLimit('org_below', 'vestigio');
    assertEqual(check.allowed, true);
  });

  test('max plan at limit suggests credits', () => {
    resetAllUsage();
    const limit = getPlanEntitlements('max').max_mcp_calls_per_month;
    seedUsage('org_max', limit);
    const check = checkUsageLimit('org_max', 'max');
    assertEqual(check.allowed, false);
    assert(check.upgrade_message!.includes('credits'), 'should suggest credits for max plan');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  PRODUCTION HARDENING TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
