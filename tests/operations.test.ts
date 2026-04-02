/**
 * Vestigio V2 — Operations & Admin Test Suite
 * Tests: usage persistence, audit lifecycle, observability,
 *        maintenance mode
 *
 * Run: npx tsx tests/operations.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  getUsage, incrementUsage, seedUsage, getUsageSummary,
  checkUsageLimit, getUsageRecord, currentPeriod, resetAllUsage,
} from '../apps/mcp/usage';
import {
  isValidTransition,
} from '../apps/mcp/audit-lifecycle';
import {
  logMcpCall, getRecentLogs, getLogsByOrg, getErrorLogs, getLogStats,
  createMcpLogger, clearLogs,
} from '../apps/mcp/observability';
import {
  setOrgMaintenance, setEnvMaintenance, isInMaintenance,
  isOrgInMaintenance, isEnvInMaintenance, clearAllMaintenance,
} from '../apps/mcp/maintenance';

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

// ══════════════════════════════════════════════════
// 1. USAGE PERSISTENCE (sync API)
// ══════════════════════════════════════════════════

runSuite('Usage Persistence', () => {
  test('seed + get works', () => {
    resetAllUsage();
    seedUsage('org_persist', 42);
    assertEqual(getUsage('org_persist'), 42);
  });

  test('seed + increment accumulates', () => {
    resetAllUsage();
    seedUsage('org_persist', 100);
    incrementUsage('org_persist', 5);
    assertEqual(getUsage('org_persist'), 105);
  });

  test('increment from zero', () => {
    resetAllUsage();
    incrementUsage('org_new', 3);
    assertEqual(getUsage('org_new'), 3);
  });

  test('per-org isolation', () => {
    resetAllUsage();
    incrementUsage('org_a', 10);
    incrementUsage('org_b', 20);
    assertEqual(getUsage('org_a'), 10);
    assertEqual(getUsage('org_b'), 20);
  });

  test('getUsageRecord returns DB-writable shape', () => {
    const record = getUsageRecord('org_1', 'mcp_chat');
    assertEqual(record.organizationId, 'org_1');
    assertEqual(record.usageType, 'mcp_chat');
    assertEqual(record.amount, 1);
    assert(/^\d{4}-\d{2}$/.test(record.period), 'period YYYY-MM format');
  });

  test('getUsageSummary reflects limits', () => {
    resetAllUsage();
    seedUsage('org_sum', 30);
    const summary = getUsageSummary('org_sum', 'vestigio');
    assertEqual(summary.mcp_calls_used, 30);
    assertEqual(summary.mcp_calls_limit, 50);
    assertEqual(summary.mcp_calls_remaining, 20);
    assertEqual(summary.is_over_limit, false);
  });

  test('checkUsageLimit blocks at limit', () => {
    resetAllUsage();
    seedUsage('org_lim', 50);
    const check = checkUsageLimit('org_lim', 'vestigio');
    assertEqual(check.allowed, false);
    assert(check.upgrade_message!.includes('Pro'), 'suggest Pro');
  });

  test('checkUsageLimit allows under limit', () => {
    resetAllUsage();
    seedUsage('org_under', 49);
    const check = checkUsageLimit('org_under', 'vestigio');
    assertEqual(check.allowed, true);
  });

  test('currentPeriod format', () => {
    assert(/^\d{4}-\d{2}$/.test(currentPeriod()), 'YYYY-MM');
  });
});

// ══════════════════════════════════════════════════
// 2. AUDIT LIFECYCLE STATE MACHINE
// ══════════════════════════════════════════════════

runSuite('Audit Lifecycle State Machine', () => {
  test('pending → running valid', () => {
    assert(isValidTransition('pending', 'running'), 'valid');
  });

  test('pending → failed valid', () => {
    assert(isValidTransition('pending', 'failed'), 'valid');
  });

  test('running → complete valid', () => {
    assert(isValidTransition('running', 'complete'), 'valid');
  });

  test('running → failed valid', () => {
    assert(isValidTransition('running', 'failed'), 'valid');
  });

  test('complete → running INVALID', () => {
    assert(!isValidTransition('complete', 'running'), 'invalid');
  });

  test('complete → failed INVALID', () => {
    assert(!isValidTransition('complete', 'failed'), 'invalid');
  });

  test('failed → running INVALID', () => {
    assert(!isValidTransition('failed', 'running'), 'invalid');
  });

  test('pending → complete INVALID (skip running)', () => {
    assert(!isValidTransition('pending', 'complete'), 'invalid');
  });
});

// ══════════════════════════════════════════════════
// 3. OBSERVABILITY
// ══════════════════════════════════════════════════

runSuite('Observability', () => {
  test('logMcpCall stores entries', () => {
    clearLogs();
    logMcpCall({
      request_id: 'test-req-1',
      timestamp: new Date().toISOString(),
      org_id: 'org_1', env_id: 'env_1',
      tool: 'answer_can_i_scale',
      success: true, execution_ms: 150, usage_consumed: 1, error: null,
    });
    assertEqual(getRecentLogs().length, 1);
    assertEqual(getRecentLogs()[0].tool, 'answer_can_i_scale');
  });

  test('newest first ordering', () => {
    clearLogs();
    logMcpCall({ request_id: 'test-req-2', timestamp: '2026-03-01T10:00:00Z', org_id: 'org_1', env_id: 'env_1', tool: 'tool_a', success: true, execution_ms: 100, usage_consumed: 1, error: null });
    logMcpCall({ request_id: 'test-req-3', timestamp: '2026-03-01T11:00:00Z', org_id: 'org_1', env_id: 'env_1', tool: 'tool_b', success: true, execution_ms: 200, usage_consumed: 1, error: null });
    assertEqual(getRecentLogs()[0].tool, 'tool_b');
  });

  test('error filtering', () => {
    clearLogs();
    logMcpCall({ request_id: 'test-req-4', timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'ok', success: true, execution_ms: 100, usage_consumed: 1, error: null });
    logMcpCall({ request_id: 'test-req-5', timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'fail', success: false, execution_ms: 50, usage_consumed: 0, error: 'timeout' });
    assertEqual(getErrorLogs().length, 1);
    assertEqual(getErrorLogs()[0].tool, 'fail');
  });

  test('stats computation', () => {
    clearLogs();
    logMcpCall({ request_id: 'test-req-6', timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'a', success: true, execution_ms: 100, usage_consumed: 1, error: null });
    logMcpCall({ request_id: 'test-req-7', timestamp: new Date().toISOString(), org_id: 'org_1', env_id: 'env_1', tool: 'b', success: false, execution_ms: 200, usage_consumed: 0, error: 'err' });
    const stats = getLogStats();
    assertEqual(stats.total_calls, 2);
    assertEqual(stats.errors, 1);
    assertEqual(stats.avg_execution_ms, 150);
  });

  test('createMcpLogger works', () => {
    clearLogs();
    const logger = createMcpLogger('org_1', 'env_1');
    logger.log('answer_fix_first', Date.now() - 100, true);
    assertEqual(getRecentLogs().length, 1);
  });

  test('org filtering', () => {
    clearLogs();
    logMcpCall({ request_id: 'test-req-8', timestamp: new Date().toISOString(), org_id: 'org_a', env_id: 'env_1', tool: 'a', success: true, execution_ms: 50, usage_consumed: 1, error: null });
    logMcpCall({ request_id: 'test-req-9', timestamp: new Date().toISOString(), org_id: 'org_b', env_id: 'env_1', tool: 'b', success: true, execution_ms: 50, usage_consumed: 1, error: null });
    assertEqual(getLogsByOrg('org_a').length, 1);
  });
});

// ══════════════════════════════════════════════════
// 4. MAINTENANCE MODE
// ══════════════════════════════════════════════════

runSuite('Maintenance Mode', () => {
  test('org maintenance', () => {
    clearAllMaintenance();
    assertEqual(isInMaintenance('org_1'), false);
    setOrgMaintenance('org_1', true);
    assertEqual(isInMaintenance('org_1'), true);
    assertEqual(isOrgInMaintenance('org_1'), true);
  });

  test('env maintenance', () => {
    clearAllMaintenance();
    setEnvMaintenance('env_1', true);
    assertEqual(isInMaintenance('org_1', 'env_1'), true);
    assertEqual(isEnvInMaintenance('env_1'), true);
  });

  test('remove maintenance', () => {
    clearAllMaintenance();
    setOrgMaintenance('org_1', true);
    setOrgMaintenance('org_1', false);
    assertEqual(isInMaintenance('org_1'), false);
  });

  test('org blocks all envs', () => {
    clearAllMaintenance();
    setOrgMaintenance('org_1', true);
    assertEqual(isInMaintenance('org_1', 'env_1'), true);
    assertEqual(isInMaintenance('org_1', 'env_2'), true);
    assertEqual(isInMaintenance('org_2', 'env_1'), false);
  });

  test('clearAll', () => {
    setOrgMaintenance('org_1', true);
    setEnvMaintenance('env_1', true);
    clearAllMaintenance();
    assertEqual(isInMaintenance('org_1'), false);
    assertEqual(isInMaintenance('org_1', 'env_1'), false);
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  OPERATIONS & ADMIN TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
