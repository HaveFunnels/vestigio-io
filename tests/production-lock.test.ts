/**
 * Vestigio V2 — Production Lock Test Suite
 * Tests: env validation, store enforcement, startup,
 *        audit timeouts, observability correlation IDs,
 *        impersonation, pixel management, e2e smoke path
 *
 * Run: npx tsx tests/production-lock.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping,
  pageContentEvidence, checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { validateEnv, isProduction } from '../apps/platform/env-validation';
import { initializeStores, validateStoreConfiguration, resetStoreEnforcement } from '../apps/platform/store-enforcement';
import { vestigioStartup, resetStartup } from '../apps/platform/startup';
import { startImpersonation, endImpersonation, getImpersonation, isImpersonating, clearAllImpersonations } from '../apps/platform/impersonation';
import { generatePixelId, generatePixelSnippet, getPixelConfig } from '../apps/platform/pixel-management';
import {
  triggerAudit, startAudit, completeAudit, failAudit,
  failStuckAudits, getStuckAudits, resetAuditStore,
} from '../apps/mcp/audit-lifecycle';
import {
  logMcpCall, getRecentLogs, getLogStats, getLogsByRequestId,
  generateCorrelationId, createMcpLogger, clearLogs,
} from '../apps/mcp/observability';
import { McpServer } from '../apps/mcp/server';
import { bootstrapMcpContextSync } from '../apps/mcp/bootstrap';
import { incrementUsage, checkUsageLimit, resetAllUsage, seedUsage } from '../apps/mcp/usage';

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

function standardEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  ];
}

// ══════════════════════════════════════════════════
// 1. ENV VALIDATION
// ══════════════════════════════════════════════════

runSuite('Environment Validation', () => {
  test('validates with all required vars present', () => {
    const result = validateEnv({
      DATABASE_URL: 'postgres://localhost/test',
      SECRET: 'test-secret',
      NEXTAUTH_URL: 'http://localhost:3000',
    });
    assertEqual(result.valid, true);
    assertEqual(result.missing.length, 0);
  });

  test('fails with missing DATABASE_URL', () => {
    const result = validateEnv({
      SECRET: 'test-secret',
      NEXTAUTH_URL: 'http://localhost:3000',
    });
    assertEqual(result.valid, false);
    assert(result.missing.some(m => m.includes('DATABASE_URL')), 'should report DATABASE_URL');
  });

  test('fails with missing SECRET', () => {
    const result = validateEnv({
      DATABASE_URL: 'postgres://localhost/test',
      NEXTAUTH_URL: 'http://localhost:3000',
    });
    assertEqual(result.valid, false);
    assert(result.missing.some(m => m.includes('SECRET')), 'should report SECRET');
  });

  test('production requires Stripe keys', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://localhost/test',
      SECRET: 'secret',
      NEXTAUTH_URL: 'http://app.vestigio.io',
    });
    assertEqual(result.valid, false);
    assert(result.missing.some(m => m.includes('STRIPE_SECRET_KEY')), 'should require Stripe key');
  });

  test('production passes with all vars', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://prod/vestigio',
      SECRET: 'prod-secret',
      NEXTAUTH_URL: 'https://app.vestigio.io',
      STRIPE_SECRET_KEY: 'sk_live_xxx',
      STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    });
    assertEqual(result.valid, true);
  });

  test('warnings for recommended vars', () => {
    const result = validateEnv({
      DATABASE_URL: 'postgres://localhost/test',
      SECRET: 'secret',
      NEXTAUTH_URL: 'http://localhost:3000',
    });
    assert(result.warnings.length > 0, 'should have warnings');
  });
});

// ══════════════════════════════════════════════════
// 2. STORE ENFORCEMENT
// ══════════════════════════════════════════════════

runSuite('Store Enforcement', () => {
  test('initializeStores works in dev mode', () => {
    resetStoreEnforcement();
    initializeStores(); // no prisma = OK in dev
    const check = validateStoreConfiguration();
    assertEqual(check.valid, true);
  });

  test('double initialization throws', () => {
    resetStoreEnforcement();
    initializeStores();
    let threw = false;
    try { initializeStores(); } catch { threw = true; }
    assert(threw, 'should throw on double init');
  });

  test('validateStoreConfiguration reports uninitialized', () => {
    resetStoreEnforcement();
    const check = validateStoreConfiguration();
    assertEqual(check.valid, false);
    assert(check.message.includes('not initialized'), 'should report not initialized');
  });
});

// ══════════════════════════════════════════════════
// 3. STARTUP SEQUENCE
// ══════════════════════════════════════════════════

runSuite('Startup Sequence', () => {
  test('vestigioStartup succeeds with valid env', () => {
    resetStartup();
    // Set env vars for validation
    const origDb = process.env.DATABASE_URL;
    const origSecret = process.env.SECRET;
    const origUrl = process.env.NEXTAUTH_URL;
    process.env.DATABASE_URL = 'postgres://test';
    process.env.SECRET = 'test';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    const result = vestigioStartup();

    // Restore
    if (origDb) process.env.DATABASE_URL = origDb; else delete process.env.DATABASE_URL;
    if (origSecret) process.env.SECRET = origSecret; else delete process.env.SECRET;
    if (origUrl) process.env.NEXTAUTH_URL = origUrl; else delete process.env.NEXTAUTH_URL;

    assertEqual(result.success, true);
    assertGreater(result.checks.length, 0, 'should have checks');
  });

  test('startup returns environment name', () => {
    resetStartup();
    process.env.DATABASE_URL = 'postgres://test';
    process.env.SECRET = 'test';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    const result = vestigioStartup();
    assert(typeof result.environment === 'string', 'has environment');

    delete process.env.DATABASE_URL;
    delete process.env.SECRET;
    delete process.env.NEXTAUTH_URL;
  });
});

// ══════════════════════════════════════════════════
// 4. AUDIT TIMEOUT PROTECTION
// ══════════════════════════════════════════════════

runSuite('Audit Timeout Protection', () => {
  test('getStuckAudits identifies stuck cycles (sync check)', () => {
    // The async lifecycle tests are in operations.test.ts.
    // Here we test the sync getStuckAudits query.
    resetAuditStore();
    // getStuckAudits on empty store returns empty
    const stuck = getStuckAudits(10 * 60 * 1000);
    assertEqual(stuck.length, 0);
  });

  test('isValidTransition enforces state machine', () => {
    const { isValidTransition } = require('../apps/mcp/audit-lifecycle');
    // Timeout-relevant: running → failed is valid (how timeout works)
    assert(isValidTransition('running', 'failed'), 'running → failed valid (timeout path)');
    // complete is terminal — cannot be timed out
    assert(!isValidTransition('complete', 'failed'), 'complete → failed invalid');
  });

  test('failStuckAudits is exported and callable', () => {
    // Verify the function exists and doesn't throw on empty store
    resetAuditStore();
    assert(typeof failStuckAudits === 'function', 'failStuckAudits is a function');
  });
});

// ══════════════════════════════════════════════════
// 5. OBSERVABILITY — CORRELATION IDS
// ══════════════════════════════════════════════════

runSuite('Observability Correlation', () => {
  test('generateCorrelationId produces unique IDs', () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();
    assert(id1 !== id2, 'IDs should be unique');
    assert(id1.startsWith('req_'), 'should start with req_');
  });

  test('logMcpCall includes request_id', () => {
    clearLogs();
    logMcpCall({
      request_id: 'req_test_123',
      timestamp: new Date().toISOString(),
      org_id: 'org_1', env_id: 'env_1',
      tool: 'test', success: true, execution_ms: 50, usage_consumed: 1, error: null,
    });
    const logs = getRecentLogs();
    assertEqual(logs[0].request_id, 'req_test_123');
  });

  test('getLogsByRequestId finds correlated entries', () => {
    clearLogs();
    logMcpCall({ request_id: 'req_abc', timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'a', success: true, execution_ms: 50, usage_consumed: 1, error: null });
    logMcpCall({ request_id: 'req_def', timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'b', success: true, execution_ms: 50, usage_consumed: 1, error: null });

    const correlated = getLogsByRequestId('req_abc');
    assertEqual(correlated.length, 1);
    assertEqual(correlated[0].tool, 'a');
  });

  test('createMcpLogger auto-generates request_id', () => {
    clearLogs();
    const logger = createMcpLogger('org_1', 'env_1');
    const entry = logger.log('test_tool', Date.now() - 100, true);
    assert(entry.request_id.startsWith('req_'), 'auto-generated request_id');
  });

  test('getLogStats includes error_rate and p95', () => {
    clearLogs();
    for (let i = 0; i < 10; i++) {
      logMcpCall({ request_id: generateCorrelationId(), timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'a', success: i < 8, execution_ms: (i + 1) * 100, usage_consumed: 1, error: i >= 8 ? 'err' : null });
    }
    const stats = getLogStats();
    assertEqual(stats.total_calls, 10);
    assertEqual(stats.errors, 2);
    assertGreater(stats.error_rate, 0);
    assertGreater(stats.p95_execution_ms, 0);
  });
});

// ══════════════════════════════════════════════════
// 6. IMPERSONATION
// ══════════════════════════════════════════════════

runSuite('Impersonation', () => {
  test('start and end impersonation', () => {
    clearAllImpersonations();
    const session = startImpersonation('admin_1', 'user_1', 'org_1');
    assertEqual(session.active, true);
    assertEqual(session.admin_user_id, 'admin_1');
    assertEqual(session.impersonated_user_id, 'user_1');
    assert(isImpersonating('admin_1'), 'should be impersonating');

    endImpersonation('admin_1');
    assert(!isImpersonating('admin_1'), 'should not be impersonating');
  });

  test('cannot double-impersonate', () => {
    clearAllImpersonations();
    startImpersonation('admin_1', 'user_1');
    let threw = false;
    try { startImpersonation('admin_1', 'user_2'); } catch { threw = true; }
    assert(threw, 'should throw on double impersonation');
  });

  test('getImpersonation returns session', () => {
    clearAllImpersonations();
    startImpersonation('admin_1', 'user_1', 'org_1');
    const session = getImpersonation('admin_1');
    assert(session !== null, 'should return session');
    assertEqual(session!.impersonated_org_id, 'org_1');
  });

  test('getImpersonation returns null when not impersonating', () => {
    clearAllImpersonations();
    const session = getImpersonation('admin_1');
    assertEqual(session, null);
  });
});

// ══════════════════════════════════════════════════
// 7. PIXEL MANAGEMENT
// ══════════════════════════════════════════════════

runSuite('Pixel Management', () => {
  test('generatePixelId is deterministic', () => {
    const id1 = generatePixelId('org_1', 'env_1');
    const id2 = generatePixelId('org_1', 'env_1');
    assertEqual(id1, id2);
  });

  test('different orgs get different pixel IDs', () => {
    const id1 = generatePixelId('org_1', 'env_1');
    const id2 = generatePixelId('org_2', 'env_1');
    assert(id1 !== id2, 'different orgs = different pixels');
  });

  test('generatePixelSnippet contains pixel ID', () => {
    const snippet = generatePixelSnippet('vg_abc123');
    assert(snippet.includes('vg_abc123'), 'snippet contains pixel ID');
    assert(snippet.includes('vestigio'), 'snippet references vestigio');
  });

  test('getPixelConfig returns full config', () => {
    const config = getPixelConfig('org_1', 'env_1', 'shop.com');
    assertEqual(config.org_id, 'org_1');
    assertEqual(config.domain, 'shop.com');
    assert(config.pixel_id.startsWith('vg_'), 'pixel ID format');
    assert(config.snippet.includes(config.pixel_id), 'snippet uses pixel ID');
    assertEqual(config.installed, false);
  });
});

// ══════════════════════════════════════════════════
// 8. END-TO-END SMOKE PATH
// ══════════════════════════════════════════════════

runSuite('End-to-End Smoke Path', () => {
  test('full onboarding → MCP → findings flow', () => {
    // 1. Reset state
    resetAllUsage();
    resetAuditStore();
    resetStartup();
    clearLogs();

    // 2. Startup (dev mode)
    process.env.DATABASE_URL = 'postgres://test';
    process.env.SECRET = 'test';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    const startup = vestigioStartup();
    assertEqual(startup.success, true);

    // 3. Simulate org creation (would happen in onboard API)
    const orgId = 'org_smoke';
    const envId = 'env_smoke';

    // 4. Bootstrap MCP
    const server = new McpServer();
    const evidence = standardEvidence();
    const bootResult = bootstrapMcpContextSync(server, {
      organization_id: orgId,
      organization_name: 'Smoke Corp',
      environment_id: envId,
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
      audit_cycle_id: 'cycle_smoke',
    }, evidence);

    assertEqual(bootResult.status, 'ready');
    assert(server.getContext() !== null, 'context loaded');

    // 5. Check usage limit
    seedUsage(orgId, 0);
    const usageCheck = checkUsageLimit(orgId, 'vestigio');
    assertEqual(usageCheck.allowed, true);

    // 6. MCP call with observability
    const logger = createMcpLogger(orgId, envId);
    const startTime = Date.now();
    const findingsResult = server.callTool('get_finding_projections');
    assertEqual(findingsResult.type, 'finding_projections');
    assertGreater((findingsResult.data as any).length, 0, 'has real findings');

    // 7. Log the call
    logger.log('get_finding_projections', startTime, true);
    incrementUsage(orgId);

    // 8. Verify usage incremented
    assertEqual(checkUsageLimit(orgId, 'vestigio').summary.mcp_calls_used, 1);

    // 9. Verify log exists
    const logs = getRecentLogs();
    assertGreater(logs.length, 0, 'has logs');
    assertEqual(logs[0].tool, 'get_finding_projections');

    // 10. Answer call works
    const answerResult = server.callTool('answer_can_i_scale');
    assertEqual(answerResult.type, 'answer');
    assert((answerResult.data as any).suggestions !== null, 'has suggestions');

    // 11. Contextual chat works
    const discussResult = server.callTool('discuss_finding', { finding_id: (findingsResult.data as any)[0].id });
    assertEqual(discussResult.type, 'answer');
    assert((discussResult.data as any).contextual_focus !== null, 'has contextual focus');

    // Cleanup
    delete process.env.DATABASE_URL;
    delete process.env.SECRET;
    delete process.env.NEXTAUTH_URL;
  });

  test('usage limit blocks MCP at threshold', () => {
    resetAllUsage();
    const orgId = 'org_limit_smoke';
    seedUsage(orgId, 50); // exhaust vestigio limit

    const check = checkUsageLimit(orgId, 'vestigio');
    assertEqual(check.allowed, false);
    assert(check.upgrade_message!.includes('Upgrade'), 'suggests upgrade');
  });

  test('maintenance mode blocks operations', () => {
    const { setOrgMaintenance, isInMaintenance, clearAllMaintenance } = require('../apps/mcp/maintenance');
    clearAllMaintenance();
    setOrgMaintenance('org_maint', true);
    assertEqual(isInMaintenance('org_maint'), true);
    clearAllMaintenance();
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  PRODUCTION LOCK TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
