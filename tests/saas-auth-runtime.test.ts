/**
 * Vestigio V2 — Phase 17B: Authenticated Journey Runtime Test Suite
 * Tests: persistence, secret service, authenticated runtime,
 *        MFA handling, evidence generation, MCP integration,
 *        onboarding skip, Data Sources state
 *
 * Run: npx tsx tests/saas-auth-runtime.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping, testFreshness,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  BusinessProfile,
  BusinessModel,
  SaasAccessConfig,
  SaasAccessStatus,
  SaasProfile,
  createDefaultSaasAccessConfig,
  toPublicView,
  VerificationType,
  EvidenceType,
} from '../packages/domain';

import {
  InMemorySaasAccessStore,
  getSaasAccessStore,
  resetSaasAccessStore,
} from '../apps/platform/saas-access-store';

import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
} from '../apps/platform/secret-service';

import {
  simulateAuthenticatedJourney,
  type AuthenticatedJourneyResult,
} from '../workers/verification/authenticated-runtime';

import {
  AuthenticatedJourneyExecutor,
  setAuthPlaywrightMode,
} from '../workers/verification/executors';

import {
  composeSaasSetupAnswer,
  composeAuthOutcomeAnswer,
  describeSaasAccessStatus,
  canRequestAuthenticatedVerification,
  buildSaasChecklist,
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

// ── Test helpers ──────────────────────────────

function testSaasProfile(overrides: Partial<SaasProfile> = {}): SaasProfile {
  return {
    is_saas: true,
    app_login_url: 'https://app.example.com/login',
    auth_method: 'password',
    mfa_mode: 'none',
    has_trial: true,
    activation_goal: 'Create first project',
    primary_upgrade_path: 'Settings → Billing',
    requires_seed_data: false,
    test_account_available: true,
    ...overrides,
  };
}

function testBusinessProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  const now = new Date();
  return {
    id: 'bp_1',
    workspace_ref: 'workspace:ws_1',
    business_model: BusinessModel.SaaS,
    monthly_revenue_range: { low: 50000, high: 150000, currency: 'USD' },
    average_ticket_range: { low: 29, high: 99, currency: 'USD' },
    chargeback_rate_range: null,
    churn_rate_range: null,
    traffic_plan_range: null,
    growth_goal: null,
    platform_hints: [],
    provider_hints: [],
    conversion_model: 'checkout',
    saas: testSaasProfile(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function testAccessConfig(overrides: Partial<SaasAccessConfig> = {}): SaasAccessConfig {
  const now = new Date();
  return {
    id: 'saas_access:env_1',
    environment_id: 'env_1',
    login_url: 'https://app.example.com/login',
    email: 'test@example.com',
    password_encrypted: encryptSecret('test_password_123'),
    auth_method: 'password',
    mfa_mode: 'none',
    has_trial: true,
    requires_seed_data: false,
    test_account_available: true,
    activation_goal: 'Create first project',
    primary_upgrade_path: 'Settings → Billing',
    last_verified_at: now,
    last_failure_reason: null,
    status: 'verified',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════
// 1. PERSISTENCE — SaaS Access Store
// ══════════════════════════════════════════════════

(async () => {

// Store CRUD moved to production-wiring.test.ts (async interface)
// Keep a quick sanity check here
await runAsyncSuite('SaaS Access Store — Async Sanity', async () => {
  const store = new InMemorySaasAccessStore();

  await testAsync('save and get roundtrip', async () => {
    const config = await store.save('env_1', {
      login_url: 'https://app.example.com/login',
      email: 'test@example.com',
      password_encrypted: 'enc_test',
      auth_method: 'password',
      mfa_mode: 'none',
      has_trial: true,
      requires_seed_data: false,
      test_account_available: true,
      activation_goal: 'First project',
      primary_upgrade_path: 'Billing page',
    });
    assertEqual(config.status, 'configured', 'status');
    const fetched = await store.get('env_1');
    assert(fetched !== null, 'should find config');
    assertEqual(fetched!.email, 'test@example.com', 'email');
  });

  await testAsync('updateStatus and markVerified', async () => {
    await store.updateStatus('env_1', 'failed', 'Bad credentials');
    let config = await store.get('env_1');
    assertEqual(config!.status, 'failed', 'failed');
    await store.markVerified('env_1');
    config = await store.get('env_1');
    assertEqual(config!.status, 'verified', 'verified');
  });
});

// ══════════════════════════════════════════════════
// 2. SECRET SERVICE
// ══════════════════════════════════════════════════

runSuite('Secret Service', () => {
  test('encrypt and decrypt roundtrip', () => {
    const plaintext = 'my_super_secret_password_123!@#';
    const encrypted = encryptSecret(plaintext);
    assert(encrypted !== plaintext, 'should not be plaintext');
    const decrypted = decryptSecret(encrypted);
    assertEqual(decrypted, plaintext, 'roundtrip');
  });

  test('encrypted value is detected', () => {
    const encrypted = encryptSecret('test');
    assert(isEncrypted(encrypted), 'should be detected as encrypted');
  });

  test('plaintext is not detected as encrypted', () => {
    assert(!isEncrypted('plain_text'), 'should not be encrypted');
  });

  test('different encryptions produce different ciphertext', () => {
    const a = encryptSecret('same_value');
    const b = encryptSecret('same_value');
    // Dev mode uses base64 which is deterministic, so skip this test in dev mode
    if (!a.startsWith('dev:')) {
      assert(a !== b, 'should differ due to random IV');
    } else {
      assertEqual(a, b, 'dev mode is deterministic');
    }
  });
});

// ══════════════════════════════════════════════════
// 3. PUBLIC VIEW — SECRETS NEVER LEAK
// ══════════════════════════════════════════════════

runSuite('Public View — No Secret Leaks', () => {
  test('toPublicView hides password', () => {
    const config = testAccessConfig();
    const view = toPublicView(config);
    assert(!('password_encrypted' in view), 'should not have password_encrypted');
    assertEqual(view.has_password, true, 'should indicate password exists');
  });

  test('toPublicView with no password', () => {
    const config = testAccessConfig({ password_encrypted: null });
    const view = toPublicView(config);
    assertEqual(view.has_password, false, 'should indicate no password');
  });

  test('toPublicView preserves other fields', () => {
    const config = testAccessConfig();
    const view = toPublicView(config);
    assertEqual(view.login_url, config.login_url, 'login_url');
    assertEqual(view.email, config.email, 'email');
    assertEqual(view.status, config.status, 'status');
  });
});

// ══════════════════════════════════════════════════
// 4. SIMULATED AUTHENTICATED RUNTIME
// ══════════════════════════════════════════════════

await runAsyncSuite('Authenticated Runtime — Simulated Success', async () => {
  await testAsync('successful auth produces evidence', async () => {
    const config = testAccessConfig();
    const profile = testBusinessProfile();
    const { result, evidence } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:test_1',
    );
    assertEqual(result.outcome, 'authenticated_success', 'outcome');
    assert(result.login_form_found, 'should find login form');
    assert(!result.mfa_detected, 'no MFA');
    assert(result.post_login_url !== null, 'should have post-login URL');
    assertGreater(evidence.length, 0, 'should produce evidence');
    // Check evidence types
    const types = evidence.map(e => e.evidence_type);
    assert(types.includes(EvidenceType.AuthenticatedSessionAttempt), 'should have session attempt');
    assert(types.includes(EvidenceType.BrowserNavigationTrace), 'should have nav trace');
  });
});

await runAsyncSuite('Authenticated Runtime — MFA Handling', async () => {
  await testAsync('MFA required blocked by prerequisites', async () => {
    const config = testAccessConfig({ mfa_mode: 'required' });
    const profile = testBusinessProfile({ saas: testSaasProfile({ mfa_mode: 'required' }) });
    const { result } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:test_mfa_block',
    );
    // MFA required is caught by prerequisite engine as a blocker
    assertEqual(result.outcome, 'blocked_by_prerequisite', 'outcome');
  });

  await testAsync('MFA optional triggers awaiting_manual_mfa at runtime', async () => {
    const config = testAccessConfig({ mfa_mode: 'optional' });
    const profile = testBusinessProfile({ saas: testSaasProfile({ mfa_mode: 'optional' }) });
    const { result, evidence } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:test_mfa_optional',
    );
    assertEqual(result.outcome, 'awaiting_manual_mfa', 'outcome');
    assert(result.mfa_detected, 'should detect MFA');
    const blocked = evidence.filter(e => e.evidence_type === EvidenceType.AuthenticationBlockedEvent);
    assertGreater(blocked.length, 0, 'should have blocked event');
  });
});

await runAsyncSuite('Authenticated Runtime — Blocked by Prerequisites', async () => {
  await testAsync('missing login URL blocks execution', async () => {
    const config = testAccessConfig({ login_url: '' });
    const profile = testBusinessProfile({ saas: testSaasProfile({ app_login_url: null }) });
    const { result, evidence } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:test_blocked',
    );
    assertEqual(result.outcome, 'blocked_by_prerequisite', 'outcome');
    assert(result.error_message !== null, 'should have error message');
    // Should have prerequisite missing evidence
    const prereq = evidence.filter(e => e.evidence_type === EvidenceType.PrerequisiteMissingEvent);
    assertGreater(prereq.length, 0, 'should have prereq event');
  });

  await testAsync('seed data required blocks execution', async () => {
    const config = testAccessConfig({ requires_seed_data: true });
    const profile = testBusinessProfile({ saas: testSaasProfile({ requires_seed_data: true }) });
    const { result } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:test_seed',
    );
    assertEqual(result.outcome, 'blocked_by_seed_data', 'outcome');
  });
});

// ══════════════════════════════════════════════════
// 5. AUTHENTICATED JOURNEY EXECUTOR (integrated)
// ══════════════════════════════════════════════════

await runAsyncSuite('AuthenticatedJourneyExecutor — Simulated Mode', async () => {
  // Force simulated mode for tests
  setAuthPlaywrightMode('simulated');
  resetSaasAccessStore();

  await testAsync('executor fails without access config', async () => {
    const executor = new AuthenticatedJourneyExecutor();
    executor.setOrgContext('org_test', 'pro'); // needs credits to reach config check
    const output = await executor.execute({
      request: {
        id: 'vr_1',
        verification_type: VerificationType.AuthenticatedJourneyVerification,
        subject_ref: 'https://app.example.com',
        reason: 'test',
        requested_by: 'mcp',
        decision_ref: null,
        status: 'pending',
        result_evidence_refs: [],
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      subject_url: 'https://app.example.com',
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:test_exec',
      existing_evidence: [],
    });
    assertEqual(output.status, 'failed', 'should fail');
    assert(output.errors[0].includes('not_configured'), 'should mention not_configured');
  });

  await testAsync('executor succeeds with valid config', async () => {
    const { resetAllCredits: resetCreds } = require('../apps/platform/credits');
    await resetCreds();
    const store = getSaasAccessStore();
    const executor2 = new AuthenticatedJourneyExecutor();
    executor2.setOrgContext('org_test2', 'pro');
    await store.save('env_1', {
      login_url: 'https://app.example.com/login',
      email: 'test@example.com',
      password_encrypted: encryptSecret('test_pass'),
      auth_method: 'password',
      mfa_mode: 'none',
      has_trial: null,
      requires_seed_data: false,
      test_account_available: true,
      activation_goal: null,
      primary_upgrade_path: null,
    });

    const output = await executor2.execute({
      request: {
        id: 'vr_2',
        verification_type: VerificationType.AuthenticatedJourneyVerification,
        subject_ref: 'https://app.example.com',
        reason: 'test',
        requested_by: 'mcp',
        decision_ref: null,
        status: 'pending',
        result_evidence_refs: [],
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      subject_url: 'https://app.example.com',
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:test_exec_2',
      existing_evidence: [],
    });
    assertEqual(output.status, 'completed', 'should complete');
    assertGreater(output.evidence.length, 0, 'should produce evidence');

    // Check that store was updated to verified
    const config = await store.get('env_1');
    assertEqual(config!.status, 'verified', 'should be verified');
  });

  // Clean up
  resetSaasAccessStore();
  setAuthPlaywrightMode('auto');
});

// ══════════════════════════════════════════════════
// 6. MCP INTEGRATION
// ══════════════════════════════════════════════════

runSuite('MCP — Auth Outcome Answers', () => {
  test('success outcome produces confident answer', () => {
    const answer = composeAuthOutcomeAnswer('authenticated_success', testAccessConfig());
    assert(answer.direct_answer.includes('successfully'), 'should mention success');
    assertEqual(answer.confidence, 80, 'confidence');
    assert(answer.suggestions !== null, 'should have suggestions');
  });

  test('MFA outcome guides user', () => {
    const answer = composeAuthOutcomeAnswer('awaiting_manual_mfa', testAccessConfig());
    assert(answer.direct_answer.includes('MFA'), 'should mention MFA');
    assert(answer.recommended_next_step.includes('MFA'), 'next step mentions MFA');
  });

  test('failed outcome points to Data Sources', () => {
    const answer = composeAuthOutcomeAnswer('authentication_failed', testAccessConfig());
    assert(answer.recommended_next_step.includes('Data Sources'), 'should point to Data Sources');
  });

  test('blocked outcome points to Data Sources', () => {
    const answer = composeAuthOutcomeAnswer('blocked_by_prerequisite', null);
    assert(answer.recommended_next_step.includes('Data Sources'), 'should point to Data Sources');
  });
});

runSuite('MCP — SaaS Access Status Description', () => {
  test('unconfigured status', () => {
    const config = testAccessConfig({ status: 'unconfigured' });
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('not configured'), 'should say not configured');
    assert(desc.includes('Data Sources'), 'should mention Data Sources');
  });

  test('verified status', () => {
    const config = testAccessConfig({ status: 'verified' });
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('verified'), 'should say verified');
  });

  test('failed status includes reason', () => {
    const config = testAccessConfig({ status: 'failed', last_failure_reason: 'Bad password' });
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('Bad password'), 'should include reason');
  });

  test('awaiting MFA status', () => {
    const config = testAccessConfig({ status: 'awaiting_manual_mfa' as SaasAccessStatus });
    const desc = describeSaasAccessStatus(config);
    assert(desc.includes('MFA'), 'should mention MFA');
  });

  test('null config', () => {
    const desc = describeSaasAccessStatus(null);
    assert(desc.includes('not configured'), 'should say not configured');
  });
});

runSuite('MCP — Setup Answer Points to Data Sources', () => {
  test('blocked SaaS setup answer points to Data Sources', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ app_login_url: null }),
    });
    const answer = composeSaasSetupAnswer(profile, null);
    assert(answer !== null, 'should return answer');
    const nav = answer!.navigation;
    assert(nav !== null, 'should have navigation');
    assert(nav!.suggestions.some(s => s.includes('Data Sources')), 'should mention Data Sources');
  });
});

// ══════════════════════════════════════════════════
// 7. EVIDENCE TYPING
// ══════════════════════════════════════════════════

  await runAsyncSuite('Evidence Types for Auth Runtime', async () => {
  await testAsync('successful session produces typed evidence', async () => {
    const config = testAccessConfig();
    const profile = testBusinessProfile();
    const { evidence } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:ev_test',
    );
    for (const e of evidence) {
      assert(e.id.length > 0, 'should have id');
      assert(e.evidence_key.length > 0, 'should have key');
      assert(e.scoping !== null, 'should have scoping');
      assert(e.cycle_ref.length > 0, 'should have cycle_ref');
      assert(e.freshness !== null, 'should have freshness');
      assert(e.source_kind === 'browser_verification', 'should be browser_verification source');
      assert(e.collection_method === 'dynamic_render', 'should be dynamic_render');
      assertGreater(e.quality_score, 0, 'should have quality score');
    }
  });

  await testAsync('session attempt evidence has correct payload', async () => {
    const config = testAccessConfig();
    const profile = testBusinessProfile();
    const { evidence } = await simulateAuthenticatedJourney(
      config, profile, testScoping(), 'audit_cycle:ev_test_2',
    );
    const sessionEv = evidence.find(e => e.evidence_type === EvidenceType.AuthenticatedSessionAttempt);
    assert(sessionEv !== undefined, 'should have session evidence');
    const payload = sessionEv!.payload as any;
    assertEqual(payload.type, 'authenticated_session_attempt', 'payload type');
    assertEqual(payload.login_url, config.login_url, 'login_url in payload');
    assertEqual(payload.success, true, 'should be success');
  });
});

// ══════════════════════════════════════════════════
// 8. ONBOARDING SKIP (sync — inside IIFE for ordering)
// ══════════════════════════════════════════════════

runSuite('Onboarding Skip Flow', () => {
  test('skipped SaaS setup does not block prerequisites', () => {
    // After skip, no access config exists, but profile is SaaS
    const profile = testBusinessProfile();
    const state = evaluateSaasPrerequisites(null, profile);
    // Should be blocked (no config) but that's expected — it doesn't crash
    assert(state.status === 'blocked' || state.status === 'partial', 'should not be ready without config');
  });

  test('checklist shows not configured after skip', () => {
    const profile = testBusinessProfile();
    const checklist = buildSaasChecklist(profile, null);
    assertEqual(checklist.is_saas, true, 'is_saas');
    assertEqual(checklist.can_run_authenticated_verification, false, 'not ready');
  });

  test('non-SaaS business types are unaffected', () => {
    const profile = testBusinessProfile({ business_model: BusinessModel.Ecommerce, saas: null });
    const checklist = buildSaasChecklist(profile, null);
    assertEqual(checklist.is_saas, false, 'not SaaS');
    assertEqual(checklist.checklist_items.length, 0, 'no items');
  });
});

// ══════════════════════════════════════════════════
// 9. DOMAIN MODEL COMPLETENESS
// ══════════════════════════════════════════════════

runSuite('Domain Model — SaaS Access Config', () => {
  test('createDefaultSaasAccessConfig has all new fields', () => {
    const config = createDefaultSaasAccessConfig('env_test');
    assert(config.has_trial === null, 'has_trial null');
    assert(config.requires_seed_data === null, 'requires_seed_data null');
    assert(config.test_account_available === null, 'test_account_available null');
    assert(config.activation_goal === null, 'activation_goal null');
    assert(config.primary_upgrade_path === null, 'primary_upgrade_path null');
    assert(config.last_failure_reason === null, 'last_failure_reason null');
    assertEqual(config.status, 'unconfigured', 'status');
  });

  test('awaiting_manual_mfa is a valid status', () => {
    const config = testAccessConfig({ status: 'awaiting_manual_mfa' as SaasAccessStatus });
    assertEqual(config.status, 'awaiting_manual_mfa', 'status');
  });
});

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`SaaS Auth Runtime: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════');

if (suitesFailed > 0) process.exit(1);

})();
