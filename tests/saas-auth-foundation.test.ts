/**
 * Vestigio V2 — Phase 17A: SaaS Auth Foundation Test Suite
 * Tests: SaaS detection, prerequisite engine, MCP blocking,
 *        verification gating, evidence types, access config
 *
 * Run: npx tsx tests/saas-auth-foundation.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testFreshness,
  pageContentEvidence, checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  BusinessProfile,
  BusinessModel,
  SaasAccessConfig,
  SaasAccessStatus,
  SaasProfile,
  SaasAuthMethod,
  SaasMfaMode,
  createDefaultSaasAccessConfig,
  VerificationType,
  EvidenceType,
} from '../packages/domain';

import {
  evaluateSaasPrerequisites,
  isSaasEnvironment,
  formatPrerequisiteSummary,
  SaasPrerequisiteState,
} from '../apps/platform/saas-prerequisites';

import {
  buildSaasChecklist,
  composeSaasSetupAnswer,
  canRequestAuthenticatedVerification,
} from '../apps/mcp/saas-awareness';

import { validateVerificationRequest } from '../apps/mcp/verification';

import { AuthenticatedJourneyExecutor } from '../workers/verification/executors';

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

// ──────────────────────────────────────────────
// Test helpers — SaaS domain objects
// ──────────────────────────────────────────────

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
    churn_rate_range: { low: 0.03, high: 0.08 },
    traffic_plan_range: null,
    growth_goal: 'Reduce churn',
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
    password_encrypted: 'enc_placeholder_abc123',
    auth_method: 'password',
    mfa_mode: 'none',
    has_trial: null,
    requires_seed_data: null,
    test_account_available: null,
    activation_goal: null,
    primary_upgrade_path: null,
    last_verified_at: now,
    last_failure_reason: null,
    status: 'verified',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════
// 1. SaaS DETECTION
// ══════════════════════════════════════════════════

runSuite('SaaS Detection', () => {
  test('detects SaaS from business model', () => {
    const profile = testBusinessProfile();
    assert(isSaasEnvironment(profile), 'should detect SaaS');
  });

  test('detects SaaS from saas profile flag', () => {
    const profile = testBusinessProfile({ business_model: BusinessModel.Hybrid });
    assert(isSaasEnvironment(profile), 'hybrid with saas profile should detect');
  });

  test('non-SaaS ecommerce returns false', () => {
    const profile = testBusinessProfile({
      business_model: BusinessModel.Ecommerce,
      saas: null,
    });
    assert(!isSaasEnvironment(profile), 'ecommerce should not be SaaS');
  });

  test('null profile returns false', () => {
    assert(!isSaasEnvironment(null), 'null should not be SaaS');
  });

  test('BusinessProfile backward compatible — saas field is optional', () => {
    const profile = testBusinessProfile({ saas: null });
    // business_model is still SaaS, so isSaasEnvironment returns true
    assert(isSaasEnvironment(profile), 'SaaS model without saas profile should still detect');
  });
});

// ══════════════════════════════════════════════════
// 2. PREREQUISITE ENGINE
// ══════════════════════════════════════════════════

runSuite('Prerequisite Engine — Ready', () => {
  test('fully configured SaaS returns ready', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.status, 'ready', 'status');
    assertEqual(state.missing_items.length, 0, 'missing items count');
  });

  test('non-SaaS business always returns ready (prerequisites dont apply)', () => {
    const profile = testBusinessProfile({
      business_model: BusinessModel.Ecommerce,
      saas: null,
    });
    const state = evaluateSaasPrerequisites(null, profile);
    assertEqual(state.status, 'ready', 'non-SaaS should be ready');
  });
});

runSuite('Prerequisite Engine — Missing Items', () => {
  test('missing login URL is a blocker', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ app_login_url: null }),
    });
    const config = testAccessConfig({ login_url: '' });
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.status, 'blocked', 'should be blocked');
    assert(state.missing_items.includes('missing_login_url'), 'should include missing_login_url');
  });

  test('missing credentials is a blocker', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig({ email: null, password_encrypted: null });
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.status, 'blocked', 'should be blocked');
    assert(state.missing_items.includes('missing_credentials'), 'should include missing_credentials');
  });

  test('MFA required is a blocker', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ mfa_mode: 'required' }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.status, 'blocked', 'MFA required should block');
    assert(state.missing_items.includes('mfa_required'), 'should include mfa_required');
  });

  test('unknown auth method is a non-blocking missing item', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ auth_method: 'unknown' }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assert(state.missing_items.includes('missing_auth_method'), 'should include missing_auth_method');
    // Not a blocker on its own
    assertEqual(state.status, 'partial', 'should be partial');
  });

  test('seed data required is non-blocking', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ requires_seed_data: true }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assert(state.missing_items.includes('seed_data_required'), 'should include seed_data_required');
  });

  test('missing activation goal is non-blocking', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ activation_goal: null }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assert(state.missing_items.includes('missing_activation_goal'), 'should include missing_activation_goal');
  });

  test('access failed is a blocker', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig({ status: 'failed' as SaasAccessStatus });
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.status, 'blocked', 'failed access should block');
    assert(state.missing_items.includes('access_failed'), 'should include access_failed');
  });

  test('access expired is non-blocking', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig({ status: 'expired' as SaasAccessStatus });
    const state = evaluateSaasPrerequisites(config, profile);
    assert(state.missing_items.includes('access_expired'), 'should include access_expired');
  });

  test('unconfigured access config triggers missing_credentials', () => {
    const profile = testBusinessProfile();
    const state = evaluateSaasPrerequisites(null, profile);
    assert(state.missing_items.includes('missing_credentials'), 'null config should trigger missing credentials');
  });
});

runSuite('Prerequisite Engine — Warnings', () => {
  test('optional MFA generates warning', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ mfa_mode: 'optional' }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assert(state.warnings.length > 0, 'should have warnings');
    assert(state.warnings.some(w => w.includes('MFA')), 'should warn about MFA');
  });

  test('null test_account_available generates warning', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ test_account_available: null }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    assert(state.warnings.some(w => w.includes('Test account')), 'should warn about test account');
  });

  test('next_actions match missing items', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ app_login_url: null, activation_goal: null }),
    });
    const config = testAccessConfig({ login_url: '' });
    const state = evaluateSaasPrerequisites(config, profile);
    assertEqual(state.next_actions.length, state.missing_items.length, 'actions should match missing items count');
  });
});

// ══════════════════════════════════════════════════
// 3. SaaS ACCESS CONFIG MODEL
// ══════════════════════════════════════════════════

runSuite('SaaS Access Config', () => {
  test('createDefaultSaasAccessConfig returns unconfigured', () => {
    const config = createDefaultSaasAccessConfig('env_123');
    assertEqual(config.status, 'unconfigured', 'status');
    assertEqual(config.environment_id, 'env_123', 'environment_id');
    assertEqual(config.login_url, '', 'login_url');
    assert(config.email === null, 'email should be null');
    assert(config.password_encrypted === null, 'password should be null');
    assertEqual(config.auth_method, 'unknown', 'auth_method');
    assertEqual(config.mfa_mode, 'unknown', 'mfa_mode');
  });

  test('config id is deterministic from environment_id', () => {
    const a = createDefaultSaasAccessConfig('env_abc');
    const b = createDefaultSaasAccessConfig('env_abc');
    assertEqual(a.id, b.id, 'ids should match');
  });
});

// ══════════════════════════════════════════════════
// 4. VERIFICATION TYPE
// ══════════════════════════════════════════════════

runSuite('Authenticated Journey Verification Type', () => {
  test('VerificationType enum includes AuthenticatedJourneyVerification', () => {
    assertEqual(
      VerificationType.AuthenticatedJourneyVerification,
      'authenticated_journey_verification',
      'enum value',
    );
  });

  test('validateVerificationRequest accepts new type', () => {
    const result = validateVerificationRequest({
      verification_type: VerificationType.AuthenticatedJourneyVerification,
      subject_ref: 'https://app.example.com',
      reason: 'SaaS onboarding flow check',
      decision_ref: null,
      requested_by: 'mcp',
    });
    assert(result === null, 'should be valid');
  });

  test('AuthenticatedJourneyExecutor returns not_ready', async () => {
    const executor = new AuthenticatedJourneyExecutor();
    assertEqual(executor.type, VerificationType.AuthenticatedJourneyVerification, 'type');

    const result = await executor.execute({
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
      cycle_ref: 'audit_cycle:cycle_1',
      existing_evidence: [],
    });

    assertEqual(result.status, 'failed', 'should fail (not ready)');
    // May fail with INSUFFICIENT_CREDITS (vestigio plan) or not_configured (no access config)
    assert(
      result.errors[0].includes('not_configured') || result.errors[0].includes('INSUFFICIENT_CREDITS'),
      'error should mention not_configured or credits'
    );
    assert(result.evidence.length === 0, 'should produce no evidence');
  });
});

// ══════════════════════════════════════════════════
// 5. MCP SaaS AWARENESS
// ══════════════════════════════════════════════════

runSuite('MCP SaaS Awareness — Checklist', () => {
  test('non-SaaS target returns empty checklist', () => {
    const profile = testBusinessProfile({ business_model: BusinessModel.Ecommerce, saas: null });
    const checklist = buildSaasChecklist(profile, null);
    assertEqual(checklist.is_saas, false, 'is_saas');
    assertEqual(checklist.checklist_items.length, 0, 'no items');
  });

  test('SaaS target builds full checklist', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig();
    const checklist = buildSaasChecklist(profile, config);
    assertEqual(checklist.is_saas, true, 'is_saas');
    assertGreater(checklist.checklist_items.length, 5, 'should have multiple items');
    assertEqual(checklist.can_run_authenticated_verification, true, 'ready to verify');
  });

  test('incomplete SaaS shows blocked checklist', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ app_login_url: null }),
    });
    const checklist = buildSaasChecklist(profile, null);
    assertEqual(checklist.is_saas, true, 'is_saas');
    assertEqual(checklist.can_run_authenticated_verification, false, 'not ready');
    assert(checklist.checklist_items.some(i => !i.completed && i.blocking), 'should have blocking incomplete items');
  });
});

runSuite('MCP SaaS Awareness — Setup Answer', () => {
  test('non-SaaS returns null (use normal answers)', () => {
    const profile = testBusinessProfile({ business_model: BusinessModel.Ecommerce, saas: null });
    const answer = composeSaasSetupAnswer(profile, null);
    assert(answer === null, 'should be null for non-SaaS');
  });

  test('ready SaaS returns null (use normal answers)', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig();
    const answer = composeSaasSetupAnswer(profile, config);
    assert(answer === null, 'should be null when ready');
  });

  test('blocked SaaS returns setup answer', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ app_login_url: null }),
    });
    const answer = composeSaasSetupAnswer(profile, null);
    assert(answer !== null, 'should return answer');
    assert(answer!.direct_answer.includes('cannot analyze'), 'should mention cannot analyze');
    assertEqual(answer!.confidence, 0, 'confidence should be 0');
    assertGreater(answer!.why.length, 0, 'should have reasons');
    assert(answer!.suggestions !== null, 'should have suggestions');
  });

  test('partial SaaS returns setup answer', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ auth_method: 'unknown', activation_goal: null }),
    });
    const config = testAccessConfig();
    const answer = composeSaasSetupAnswer(profile, config);
    assert(answer !== null, 'should return answer for partial');
    assert(answer!.direct_answer.includes('partially configured'), 'should mention partial');
  });
});

runSuite('MCP SaaS Awareness — Verification Gating', () => {
  test('non-SaaS cannot request authenticated verification', () => {
    const profile = testBusinessProfile({ business_model: BusinessModel.Ecommerce, saas: null });
    const result = canRequestAuthenticatedVerification(profile, null);
    assertEqual(result.allowed, false, 'should not allow');
    assert(result.reason.includes('not a SaaS'), 'should mention not SaaS');
  });

  test('ready SaaS can request authenticated verification', () => {
    const profile = testBusinessProfile();
    const config = testAccessConfig();
    const result = canRequestAuthenticatedVerification(profile, config);
    assertEqual(result.allowed, true, 'should allow');
  });

  test('blocked SaaS cannot request authenticated verification', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ mfa_mode: 'required' }),
    });
    const config = testAccessConfig();
    const result = canRequestAuthenticatedVerification(profile, config);
    assertEqual(result.allowed, false, 'should not allow');
    assert(result.reason.includes('mfa_required'), 'should mention MFA');
  });
});

// ══════════════════════════════════════════════════
// 6. EVIDENCE TYPES
// ══════════════════════════════════════════════════

runSuite('SaaS Evidence Types', () => {
  test('AuthenticatedSessionAttempt evidence type exists', () => {
    assertEqual(
      EvidenceType.AuthenticatedSessionAttempt,
      'authenticated_session_attempt',
      'enum value',
    );
  });

  test('AuthenticationBlockedEvent evidence type exists', () => {
    assertEqual(
      EvidenceType.AuthenticationBlockedEvent,
      'authentication_blocked_event',
      'enum value',
    );
  });

  test('PrerequisiteMissingEvent evidence type exists', () => {
    assertEqual(
      EvidenceType.PrerequisiteMissingEvent,
      'prerequisite_missing_event',
      'enum value',
    );
  });
});

// ══════════════════════════════════════════════════
// 7. FORMAT PREREQUISITE SUMMARY
// ══════════════════════════════════════════════════

runSuite('Prerequisite Summary Formatting', () => {
  test('ready state gives clear message', () => {
    const state: SaasPrerequisiteState = {
      status: 'ready',
      missing_items: [],
      warnings: [],
      next_actions: [],
    };
    const summary = formatPrerequisiteSummary(state);
    assert(summary.includes('fully configured'), 'should say fully configured');
  });

  test('blocked state gives clear message with items', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ app_login_url: null }),
    });
    const state = evaluateSaasPrerequisites(null, profile);
    const summary = formatPrerequisiteSummary(state);
    assert(summary.includes('BLOCKED'), 'should say BLOCKED');
    assert(summary.includes('login URL'), 'should mention login URL');
  });

  test('partial state gives clear message', () => {
    const profile = testBusinessProfile({
      saas: testSaasProfile({ auth_method: 'unknown' }),
    });
    const config = testAccessConfig();
    const state = evaluateSaasPrerequisites(config, profile);
    const summary = formatPrerequisiteSummary(state);
    assert(summary.includes('partially configured'), 'should say partially configured');
  });
});

// ══════════════════════════════════════════════════
// 8. BACKWARD COMPATIBILITY
// ══════════════════════════════════════════════════

runSuite('Backward Compatibility', () => {
  test('BusinessProfile without saas field works', () => {
    const profile = testBusinessProfile({ saas: null });
    // Should not crash
    const state = evaluateSaasPrerequisites(null, profile);
    // SaaS model without saas profile → not_saas item
    assert(state.missing_items.includes('not_saas') || state.status === 'ready',
      'should handle null saas profile');
  });

  test('ecommerce business profile with null saas field works normally', () => {
    const profile = testBusinessProfile({
      business_model: BusinessModel.Ecommerce,
      saas: null,
    });
    const state = evaluateSaasPrerequisites(null, profile);
    assertEqual(state.status, 'ready', 'should be ready (non-SaaS)');
    assertEqual(state.missing_items.length, 0, 'no missing items');
  });

  test('existing VerificationType values unchanged', () => {
    assertEqual(VerificationType.ReuseOnly, 'reuse_only', 'reuse');
    assertEqual(VerificationType.LightProbe, 'light_probe', 'probe');
    assertEqual(VerificationType.BrowserVerification, 'browser_verification', 'browser');
    assertEqual(VerificationType.IntegrationPull, 'integration_pull', 'integration');
  });

  test('existing EvidenceType values unchanged', () => {
    assertEqual(EvidenceType.HttpResponse, 'http_response', 'http');
    assertEqual(EvidenceType.BrowserNavigationTrace, 'browser_navigation_trace', 'nav trace');
    assertEqual(EvidenceType.BrowserCheckoutConfirmation, 'browser_checkout_confirmation', 'checkout');
  });
});

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`SaaS Auth Foundation: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════');

if (suitesFailed > 0) process.exit(1);
