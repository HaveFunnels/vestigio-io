/**
 * Vestigio V2 — Phase 17.5: Production Hardening & Wiring Tests
 * Tests: Prisma store, async interface, secret enforcement,
 *        auth logging, public view, multi-env isolation,
 *        executor integration, status persistence
 *
 * Run: npx tsx tests/production-wiring.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  SaasAccessConfig,
  SaasAccessStatus,
  SaasProfile,
  BusinessProfile,
  BusinessModel,
  toPublicView,
  createDefaultSaasAccessConfig,
  VerificationType,
  EvidenceType,
} from '../packages/domain';

import {
  InMemorySaasAccessStore,
  getSaasAccessStore,
  setSaasAccessStore,
  resetSaasAccessStore,
  type SaasAccessStoreInput,
} from '../apps/platform/saas-access-store';

import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isProductionEncryption,
} from '../apps/platform/secret-service';

import {
  createAuthLogger,
  getAuthLogs,
  getAuthLogsByCorrelation,
  clearAuthLogs,
} from '../apps/platform/auth-logging';

import {
  AuthenticatedJourneyExecutor,
  setAuthPlaywrightMode,
} from '../workers/verification/executors';

import {
  composeSaasSetupAnswer,
  composeAuthOutcomeAnswer,
  describeSaasAccessStatus,
  canRequestAuthenticatedVerification,
} from '../apps/mcp/saas-awareness';

import {
  evaluateSaasPrerequisites,
} from '../apps/platform/saas-prerequisites';

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

async function runAsyncSuite(name: string, fn: () => Promise<void>): Promise<void> {
  resetCounters();
  await fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

function testSaasProfile(overrides: Partial<SaasProfile> = {}): SaasProfile {
  return {
    is_saas: true, app_login_url: 'https://app.example.com/login',
    auth_method: 'password', mfa_mode: 'none', has_trial: true,
    activation_goal: 'Create first project', primary_upgrade_path: 'Settings → Billing',
    requires_seed_data: false, test_account_available: true,
    ...overrides,
  };
}

function testBusinessProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  const now = new Date();
  return {
    id: 'bp_1', workspace_ref: 'workspace:ws_1', business_model: BusinessModel.SaaS,
    monthly_revenue_range: null, average_ticket_range: null,
    chargeback_rate_range: null, churn_rate_range: null, traffic_plan_range: null,
    growth_goal: null, platform_hints: [], provider_hints: [],
    conversion_model: 'checkout', saas: testSaasProfile(),
    created_at: now, updated_at: now, ...overrides,
  };
}

function makeInput(overrides: Partial<SaasAccessStoreInput> = {}): SaasAccessStoreInput {
  return {
    login_url: 'https://app.example.com/login',
    email: 'test@example.com',
    password_encrypted: encryptSecret('test_password'),
    auth_method: 'password', mfa_mode: 'none',
    has_trial: true, requires_seed_data: false,
    test_account_available: true, activation_goal: 'First project',
    primary_upgrade_path: 'Billing page',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════
// 1. ASYNC STORE INTERFACE
// ══════════════════════════════════════════════════

(async () => {

await runAsyncSuite('Async Store — CRUD Operations', async () => {
  const store = new InMemorySaasAccessStore();

  await testAsync('save returns configured status', async () => {
    const config = await store.save('env_1', makeInput());
    assertEqual(config.status, 'configured', 'status');
    assertEqual(config.environment_id, 'env_1', 'env_id');
  });

  await testAsync('get returns saved config', async () => {
    const config = await store.get('env_1');
    assert(config !== null, 'should find config');
    assertEqual(config!.login_url, 'https://app.example.com/login', 'login_url');
  });

  await testAsync('get returns null for unknown', async () => {
    const config = await store.get('env_unknown');
    assert(config === null, 'should be null');
  });

  await testAsync('save without login_url → unconfigured', async () => {
    const config = await store.save('env_empty', makeInput({ login_url: '' }));
    assertEqual(config.status, 'unconfigured', 'status');
  });

  await testAsync('updateStatus persists', async () => {
    const updated = await store.updateStatus('env_1', 'verified');
    assert(updated !== null, 'should return config');
    assertEqual(updated!.status, 'verified', 'status');
    assert(updated!.last_verified_at !== null, 'should set verified_at');
  });

  await testAsync('updateStatus to failed records reason', async () => {
    const updated = await store.updateStatus('env_1', 'failed', 'Bad credentials');
    assertEqual(updated!.status, 'failed', 'status');
    assertEqual(updated!.last_failure_reason, 'Bad credentials', 'reason');
  });

  await testAsync('markVerified clears failure', async () => {
    const updated = await store.markVerified('env_1');
    assertEqual(updated!.status, 'verified', 'status');
    assert(updated!.last_failure_reason === null, 'reason cleared');
  });

  await testAsync('delete removes config', async () => {
    const deleted = await store.delete('env_1');
    assertEqual(deleted, true, 'should return true');
    const config = await store.get('env_1');
    assert(config === null, 'should be gone');
  });
});

// ══════════════════════════════════════════════════
// 2. MULTI-ENVIRONMENT ISOLATION
// ══════════════════════════════════════════════════

await runAsyncSuite('Multi-Environment Isolation', async () => {
  const store = new InMemorySaasAccessStore();

  await testAsync('configs are isolated per environment', async () => {
    await store.save('env_a', makeInput({ login_url: 'https://a.com/login', email: 'a@a.com' }));
    await store.save('env_b', makeInput({ login_url: 'https://b.com/login', email: 'b@b.com' }));

    const configA = await store.get('env_a');
    const configB = await store.get('env_b');
    assertEqual(configA!.email, 'a@a.com', 'env_a email');
    assertEqual(configB!.email, 'b@b.com', 'env_b email');
  });

  await testAsync('status update on one env does not affect another', async () => {
    await store.updateStatus('env_a', 'failed', 'Bad password');
    const configA = await store.get('env_a');
    const configB = await store.get('env_b');
    assertEqual(configA!.status, 'failed', 'env_a failed');
    assertEqual(configB!.status, 'configured', 'env_b still configured');
  });

  await testAsync('delete one env preserves other', async () => {
    await store.delete('env_a');
    const configA = await store.get('env_a');
    const configB = await store.get('env_b');
    assert(configA === null, 'env_a deleted');
    assert(configB !== null, 'env_b preserved');
  });
});

// ══════════════════════════════════════════════════
// 3. SECRET HANDLING
// ══════════════════════════════════════════════════

runSuite('Secret Handling Hardening', () => {
  test('encrypt and decrypt roundtrip', () => {
    const secret = 'my_production_password_!@#$%';
    const encrypted = encryptSecret(secret);
    assert(encrypted !== secret, 'should not be plaintext');
    const decrypted = decryptSecret(encrypted);
    assertEqual(decrypted, secret, 'roundtrip');
  });

  test('encrypted values are detected', () => {
    const enc = encryptSecret('test');
    assert(isEncrypted(enc), 'should detect');
    assert(!isEncrypted('plain_text'), 'should not detect plain');
  });

  test('toPublicView never leaks password_encrypted', () => {
    const config = createDefaultSaasAccessConfig('env_test');
    config.password_encrypted = encryptSecret('secret');
    const view = toPublicView(config);
    assert(!('password_encrypted' in view), 'should not have password field');
    assertEqual(view.has_password, true, 'has_password flag');
  });

  test('toPublicView with null password', () => {
    const config = createDefaultSaasAccessConfig('env_test');
    const view = toPublicView(config);
    assertEqual(view.has_password, false, 'no password');
  });
});

// ══════════════════════════════════════════════════
// 4. AUTH LOGGING
// ══════════════════════════════════════════════════

runSuite('Structured Auth Logging', () => {
  clearAuthLogs();

  test('logger creates entries with correlation_id', () => {
    const logger = createAuthLogger('env_1');
    logger.info('auth_attempt_started', 'Starting auth');
    const logs = getAuthLogs('env_1');
    assertEqual(logs.length, 1, 'one log');
    assert(logs[0].correlation_id !== null, 'has correlation_id');
    assertEqual(logs[0].event, 'auth_attempt_started', 'event type');
    assertEqual(logs[0].environment_id, 'env_1', 'env_id');
  });

  test('logs do not contain sensitive data', () => {
    const logs = getAuthLogs();
    for (const log of logs) {
      const str = JSON.stringify(log);
      assert(!str.includes('password'), 'no password in logs');
      assert(!str.includes('encrypted'), 'no encrypted in logs');
      assert(!str.includes('secret'), 'no secret in logs');
    }
  });

  test('correlation_id groups related events', () => {
    clearAuthLogs();
    const logger = createAuthLogger('env_2');
    logger.info('auth_attempt_started', 'Start');
    logger.complete('authenticated_success', 500);
    const logs = getAuthLogsByCorrelation(logger.correlation_id);
    assertEqual(logs.length, 2, 'two grouped logs');
  });

  test('clear removes all logs', () => {
    clearAuthLogs();
    assertEqual(getAuthLogs().length, 0, 'should be empty');
  });
});

// ══════════════════════════════════════════════════
// 5. EXECUTOR WITH ASYNC STORE + LOGGING
// ══════════════════════════════════════════════════

await runAsyncSuite('Executor — Async Store Integration', async () => {
  setAuthPlaywrightMode('simulated');
  resetSaasAccessStore();
  clearAuthLogs();

  await testAsync('executor fails without config (async)', async () => {
    const executor = new AuthenticatedJourneyExecutor();
    executor.setOrgContext('org_wiring_1', 'pro');
    const output = await executor.execute({
      request: {
        id: 'vr_1', verification_type: VerificationType.AuthenticatedJourneyVerification,
        subject_ref: 'https://app.example.com', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'pending', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://app.example.com',
      scoping: testScoping(), cycle_ref: 'audit_cycle:test_wiring',
      existing_evidence: [],
    });
    assertEqual(output.status, 'failed', 'should fail');
    assert(output.errors[0].includes('not_configured'), 'error mentions not_configured');
  });

  await testAsync('executor succeeds and persists verified status', async () => {
    const { resetAllCredits: rc } = require('../apps/platform/credits');
    rc();
    const store = getSaasAccessStore();
    await store.save('env_1', makeInput());

    const executor = new AuthenticatedJourneyExecutor();
    executor.setOrgContext('org_wiring_2', 'pro');
    const output = await executor.execute({
      request: {
        id: 'vr_2', verification_type: VerificationType.AuthenticatedJourneyVerification,
        subject_ref: 'https://app.example.com', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'pending', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://app.example.com',
      scoping: testScoping(), cycle_ref: 'audit_cycle:test_wiring_2',
      existing_evidence: [],
    });
    assertEqual(output.status, 'completed', 'should succeed');
    assertGreater(output.evidence.length, 0, 'evidence produced');

    // Verify status persisted in store
    const config = await store.get('env_1');
    assertEqual(config!.status, 'verified', 'status persisted');
  });

  await testAsync('executor generates auth logs', async () => {
    const logs = getAuthLogs('env_1');
    assertGreater(logs.length, 0, 'should have auth logs');
    assert(logs.some(l => l.event === 'auth_attempt_started'), 'should have started event');
    assert(logs.some(l => l.event === 'auth_attempt_success'), 'should have success event');
  });

  resetSaasAccessStore();
  setAuthPlaywrightMode('auto');
});

// ══════════════════════════════════════════════════
// 6. MCP READS REAL STORE DATA
// ══════════════════════════════════════════════════

await runAsyncSuite('MCP — Reads Persisted Data', async () => {
  resetSaasAccessStore();
  const store = getSaasAccessStore();

  await testAsync('MCP detects missing config', async () => {
    const config = await store.get('env_missing');
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('not configured'), 'should say not configured');
  });

  await testAsync('MCP detects configured state', async () => {
    await store.save('env_mcp', makeInput());
    const config = await store.get('env_mcp');
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('configured') || desc.includes('verified'), 'should detect state');
  });

  await testAsync('MCP detects verified state', async () => {
    await store.updateStatus('env_mcp', 'verified');
    const config = await store.get('env_mcp');
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('verified'), 'should say verified');
  });

  await testAsync('MCP detects failed state', async () => {
    await store.updateStatus('env_mcp', 'failed', 'Bad password');
    const config = await store.get('env_mcp');
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('failed') || desc.includes('Bad password'), 'should show failure');
  });

  await testAsync('MCP detects MFA state', async () => {
    await store.updateStatus('env_mcp', 'awaiting_manual_mfa');
    const config = await store.get('env_mcp');
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('MFA'), 'should mention MFA');
  });

  resetSaasAccessStore();
});

// ══════════════════════════════════════════════════
// 7. API RESPONSE FORMAT
// ══════════════════════════════════════════════════

runSuite('API Response — Public View Only', () => {
  test('public view excludes all sensitive fields', () => {
    const config: SaasAccessConfig = {
      id: 'test_id', environment_id: 'env_1',
      login_url: 'https://app.example.com/login',
      email: 'test@test.com',
      password_encrypted: 'v1:base64_stuff_here',
      auth_method: 'password', mfa_mode: 'none',
      has_trial: true, requires_seed_data: false,
      test_account_available: true, activation_goal: 'test',
      primary_upgrade_path: 'billing',
      last_verified_at: new Date(), last_failure_reason: null,
      status: 'verified', created_at: new Date(), updated_at: new Date(),
    };
    const view = toPublicView(config);
    const serialized = JSON.stringify(view);

    // Must not contain any secret data
    assert(!serialized.includes('v1:base64_stuff_here'), 'no encrypted password in output');
    assert(!serialized.includes('password_encrypted'), 'no password_encrypted key');
    assertEqual(view.has_password, true, 'has_password flag set');

    // Must contain non-secret fields
    assertEqual(view.login_url, config.login_url, 'login_url preserved');
    assertEqual(view.status, 'verified', 'status preserved');
  });
});

// ══════════════════════════════════════════════════
// 8. STORE UPSERT BEHAVIOR
// ══════════════════════════════════════════════════

await runAsyncSuite('Store — Upsert Semantics', async () => {
  const store = new InMemorySaasAccessStore();

  await testAsync('save upserts existing config', async () => {
    await store.save('env_1', makeInput({ email: 'first@test.com' }));
    await store.save('env_1', makeInput({ email: 'updated@test.com' }));
    const config = await store.get('env_1');
    assertEqual(config!.email, 'updated@test.com', 'email updated');
  });

  await testAsync('upsert preserves last_verified_at from previous', async () => {
    await store.updateStatus('env_1', 'verified');
    const before = await store.get('env_1');
    assert(before!.last_verified_at !== null, 'has verified_at');

    await store.save('env_1', makeInput({ email: 'new@test.com' }));
    const after = await store.get('env_1');
    assert(after!.last_verified_at !== null, 'verified_at preserved');
  });
});

// ══════════════════════════════════════════════════
// 9. PREREQUISITE ENGINE WITH ASYNC STORE
// ══════════════════════════════════════════════════

await runAsyncSuite('Prerequisite Engine — Real Store Data', async () => {
  resetSaasAccessStore();
  const store = getSaasAccessStore();

  await testAsync('evaluates with real stored config', async () => {
    await store.save('env_prereq', makeInput());
    const config = await store.get('env_prereq');
    const profile = testBusinessProfile();
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.status, 'ready', 'should be ready with complete config');
  });

  await testAsync('evaluates with null config', async () => {
    const config = await store.get('env_nonexistent');
    const profile = testBusinessProfile();
    const state = evaluateSaasPrerequisites(config, profile);
    // SaaS profile but no access config → blocked
    assert(state.status === 'blocked' || state.status === 'partial', 'should not be ready');
  });

  resetSaasAccessStore();
});

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`Production Wiring: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════');

if (suitesFailed > 0) process.exit(1);

})();
