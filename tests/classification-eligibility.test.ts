/**
 * Vestigio V2 — Phase 17.8: Classification & Eligibility Tests
 * Tests: probabilistic classification, eligibility gating,
 *        credit enforcement, env isolation, MCP integration
 *
 * Run: npx tsx tests/classification-eligibility.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, formEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  computeClassification,
  extractClassificationInput,
  type ClassificationState,
  type ClassificationInput,
} from '../packages/classification';

import {
  isSaasPackEligible,
  isAuthenticatedVerificationEligible,
  isCheckoutAnalysisEligible,
  isChargebackRelevant,
  computePackEligibility,
} from '../packages/classification/eligibility';

import {
  SaasProfile,
  SaasAccessConfig,
  BusinessModel,
  VerificationType,
  Evidence,
  EvidenceType,
} from '../packages/domain';

import {
  canAffordVerification,
  consumeCredits,
  resetAllCredits,
} from '../apps/platform/credits';

import {
  createAuthLogger,
  getAuthLogs,
  getAuthLogsByCorrelation,
  clearAuthLogs,
} from '../apps/platform/auth-logging';

import {
  InMemorySaasAccessStore,
  getSaasAccessStore,
  resetSaasAccessStore,
} from '../apps/platform/saas-access-store';

import {
  encryptSecret,
} from '../apps/platform/secret-service';

import {
  AuthenticatedJourneyExecutor,
  setAuthPlaywrightMode,
} from '../workers/verification/executors';

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
    activation_goal: 'Create first project', primary_upgrade_path: 'Billing',
    requires_seed_data: false, test_account_available: true,
    ...overrides,
  };
}

function testAccessConfig(overrides: Partial<SaasAccessConfig> = {}): SaasAccessConfig {
  const now = new Date();
  return {
    id: 'sa_1', environment_id: 'env_1', login_url: 'https://app.example.com/login',
    email: 'test@test.com', password_encrypted: encryptSecret('pass'),
    auth_method: 'password', mfa_mode: 'none', has_trial: true,
    requires_seed_data: false, test_account_available: true,
    activation_goal: 'test', primary_upgrade_path: 'billing',
    last_verified_at: now, last_failure_reason: null, status: 'configured',
    created_at: now, updated_at: now,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════
// 1. CLASSIFICATION — MULTIPLE HYPOTHESES
// ══════════════════════════════════════════════════

runSuite('Classification — Multiple Hypotheses Coexist', () => {
  test('all hypotheses have baseline confidence', () => {
    const result = computeClassification({
      onboarding_business_model: null, onboarding_conversion_model: null,
      has_login_form: false, has_checkout: false, has_external_checkout: false,
      has_payment_forms: false, has_contact_forms: false, has_whatsapp_links: false,
      has_booking_widget: false, has_chat_widget: false, has_pricing_page: false,
      has_trial_signup: false, form_count: 0, external_script_count: 0,
      provider_indicators: [], platform_indicators: [],
    });
    // All should have some baseline confidence — never binary
    for (const [key, val] of Object.entries(result.business_model)) {
      assertGreater(val, 0, `${key} should have baseline > 0`);
    }
  });

  test('onboarding does not dominate alone', () => {
    const result = computeClassification({
      onboarding_business_model: 'saas', onboarding_conversion_model: null,
      has_login_form: false, has_checkout: true, has_external_checkout: false,
      has_payment_forms: true, has_contact_forms: false, has_whatsapp_links: false,
      has_booking_widget: false, has_chat_widget: false, has_pricing_page: false,
      has_trial_signup: false, form_count: 0, external_script_count: 0,
      provider_indicators: [], platform_indicators: [],
    });
    // Onboarding says SaaS but evidence says ecommerce
    // Both should have significant confidence — ambiguity
    assertGreater(result.business_model.saas, 0, 'saas should have some confidence');
    assertGreater(result.business_model.ecommerce, 0, 'ecommerce should have some confidence');
    // Ecommerce evidence should be significant enough to compete
    assert(result.business_model.ecommerce >= 0.3, 'ecommerce should compete with onboarding');
  });

  test('login form makes login the primary surface', () => {
    const withLogin = computeClassification({
      onboarding_business_model: null, onboarding_conversion_model: null,
      has_login_form: true, has_checkout: false, has_external_checkout: false,
      has_payment_forms: false, has_contact_forms: false, has_whatsapp_links: false,
      has_booking_widget: false, has_chat_widget: false, has_pricing_page: false,
      has_trial_signup: false, form_count: 0, external_script_count: 0,
      provider_indicators: [], platform_indicators: [],
    });
    // Login form should make login the dominant surface
    assertEqual(withLogin.primary_surface, 'login', 'login should be primary surface');
    // SaaS should increase but not dominate without pricing/trial
    assertGreater(withLogin.business_model.saas, 0, 'saas should have some confidence');
  });

  test('mixed signals produce multiple competing hypotheses', () => {
    const result = computeClassification({
      onboarding_business_model: null, onboarding_conversion_model: null,
      has_login_form: true, has_checkout: true, has_external_checkout: false,
      has_payment_forms: false, has_contact_forms: true, has_whatsapp_links: false,
      has_booking_widget: false, has_chat_widget: false, has_pricing_page: true,
      has_trial_signup: true, form_count: 2, external_script_count: 0,
      provider_indicators: [], platform_indicators: [],
    });
    // Multiple signals → saas, ecommerce, and leadgen all have confidence
    assertGreater(result.business_model.saas, 0.2, 'saas should have confidence');
    assertGreater(result.business_model.ecommerce, 0.2, 'ecommerce should have confidence');
    assertGreater(result.business_model.leadgen, 0.1, 'leadgen should have some confidence');
  });

  test('strong SaaS evidence produces high SaaS confidence', () => {
    const result = computeClassification({
      onboarding_business_model: 'saas', onboarding_conversion_model: null,
      has_login_form: true, has_checkout: false, has_external_checkout: false,
      has_payment_forms: false, has_contact_forms: false, has_whatsapp_links: false,
      has_booking_widget: false, has_chat_widget: false, has_pricing_page: true,
      has_trial_signup: true, form_count: 0, external_script_count: 0,
      provider_indicators: [], platform_indicators: [],
    });
    assertEqual(result.primary_model, 'saas', 'primary should be saas');
    assertGreater(result.business_model.saas, 0.7, 'saas confidence should be high');
  });

  test('ecommerce evidence produces high ecommerce confidence', () => {
    const result = computeClassification({
      onboarding_business_model: 'ecommerce', onboarding_conversion_model: 'checkout',
      has_login_form: false, has_checkout: true, has_external_checkout: false,
      has_payment_forms: true, has_contact_forms: false, has_whatsapp_links: false,
      has_booking_widget: false, has_chat_widget: false, has_pricing_page: false,
      has_trial_signup: false, form_count: 0, external_script_count: 0,
      provider_indicators: ['stripe'], platform_indicators: ['shopify'],
    });
    assertEqual(result.primary_model, 'ecommerce', 'primary should be ecommerce');
  });
});

runSuite('Classification — Extract from Evidence', () => {
  test('extracts signals from evidence array', () => {
    const evidence: Evidence[] = [
      pageContentEvidence('https://example.com/login'),
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.stripe.com/checkout', true),
      formEvidence('https://example.com/contact', '/submit', false, false),
    ];
    const input = extractClassificationInput(evidence, 'ecommerce', 'checkout');
    assertEqual(input.has_checkout, true, 'should detect checkout');
    assertEqual(input.has_external_checkout, true, 'should detect external checkout');
    assertEqual(input.onboarding_business_model, 'ecommerce', 'onboarding model');
  });
});

// ══════════════════════════════════════════════════
// 2. ELIGIBILITY — GATING
// ══════════════════════════════════════════════════

runSuite('Eligibility — SaaS Pack', () => {
  test('eligible with high SaaS confidence', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.8, ecommerce: 0.1, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.1, form: 0.1, whatsapp: 0, chat: 0, booking: 0, login: 0.7 },
      confidence_level: 'high', ambiguity: false, primary_model: 'saas', primary_surface: 'login',
    };
    const result = isSaasPackEligible(cls, testSaasProfile());
    assertEqual(result.eligible, true, 'should be eligible');
  });

  test('eligible via onboarding even with low evidence confidence', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.3, ecommerce: 0.4, leadgen: 0.15, services: 0.1, content: 0.05 },
      conversion_surfaces: { checkout: 0.3, form: 0.1, whatsapp: 0, chat: 0, booking: 0, login: 0.3 },
      confidence_level: 'low', ambiguity: true, primary_model: 'ecommerce', primary_surface: 'checkout',
    };
    const result = isSaasPackEligible(cls, testSaasProfile());
    assertEqual(result.eligible, true, 'should be eligible via onboarding');
  });

  test('blocked without SaaS signals or profile', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.1, ecommerce: 0.8, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.8, form: 0.05, whatsapp: 0, chat: 0, booking: 0, login: 0.05 },
      confidence_level: 'high', ambiguity: false, primary_model: 'ecommerce', primary_surface: 'checkout',
    };
    const result = isSaasPackEligible(cls, null);
    assertEqual(result.eligible, false, 'should be blocked');
    assertGreater(result.blockers.length, 0, 'should have blockers');
  });
});

runSuite('Eligibility — Checkout/Chargeback', () => {
  test('checkout eligible with checkout signals', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.1, ecommerce: 0.8, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.8, form: 0.05, whatsapp: 0, chat: 0, booking: 0, login: 0.05 },
      confidence_level: 'high', ambiguity: false, primary_model: 'ecommerce', primary_surface: 'checkout',
    };
    assertEqual(isCheckoutAnalysisEligible(cls).eligible, true, 'checkout eligible');
    assertEqual(isChargebackRelevant(cls).eligible, true, 'chargeback relevant');
  });

  test('checkout/chargeback blocked for content site', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.05, ecommerce: 0.05, leadgen: 0.1, services: 0.1, content: 0.7 },
      conversion_surfaces: { checkout: 0.05, form: 0.2, whatsapp: 0, chat: 0.1, booking: 0, login: 0.05 },
      confidence_level: 'high', ambiguity: false, primary_model: 'content', primary_surface: 'form',
    };
    assertEqual(isCheckoutAnalysisEligible(cls).eligible, false, 'checkout not eligible');
    assertEqual(isChargebackRelevant(cls).eligible, false, 'chargeback not relevant');
  });
});

runSuite('Eligibility — Authenticated Verification', () => {
  test('eligible with proper config', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.8, ecommerce: 0.1, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.1, form: 0.1, whatsapp: 0, chat: 0, booking: 0, login: 0.7 },
      confidence_level: 'high', ambiguity: false, primary_model: 'saas', primary_surface: 'login',
    };
    const result = isAuthenticatedVerificationEligible(cls, testSaasProfile(), testAccessConfig());
    assertEqual(result.eligible, true, 'should be eligible');
  });

  test('blocked without access config', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.8, ecommerce: 0.1, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.1, form: 0.1, whatsapp: 0, chat: 0, booking: 0, login: 0.7 },
      confidence_level: 'high', ambiguity: false, primary_model: 'saas', primary_surface: 'login',
    };
    const result = isAuthenticatedVerificationEligible(cls, testSaasProfile(), null);
    assertEqual(result.eligible, false, 'should be blocked');
    assert(result.blockers.some(b => b.includes('No SaaS access config')), 'should mention missing config');
  });

  test('blocked with MFA required', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.8, ecommerce: 0.1, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.1, form: 0.1, whatsapp: 0, chat: 0, booking: 0, login: 0.7 },
      confidence_level: 'high', ambiguity: false, primary_model: 'saas', primary_surface: 'login',
    };
    const config = testAccessConfig({ mfa_mode: 'required' });
    const result = isAuthenticatedVerificationEligible(cls, testSaasProfile(), config);
    assertEqual(result.eligible, false, 'MFA should block');
  });
});

// ══════════════════════════════════════════════════
// 3. CREDIT ENFORCEMENT
// ══════════════════════════════════════════════════

(async () => {

// Post-Wave 5 Fase 5: credits are DB-backed. These tests require a live
// DATABASE_URL. The outer IIFE (`(async () => { ... })()`) already lets us
// await inside; we convert individual tests to testAsync.
await runAsyncSuite('Credit Enforcement', async () => {
  await resetAllCredits();

  await testAsync('vestigio plan blocks verification', async () => {
    const result = await canAffordVerification('org_1', 'vestigio', 10);
    assertEqual(result.allowed, false, 'should block vestigio');
  });

  await testAsync('pro plan with credits allows verification', async () => {
    const result = await canAffordVerification('org_2', 'pro', 10);
    assertEqual(result.allowed, true, 'should allow pro');
  });

  await testAsync('pro plan blocks when credits exhausted', async () => {
    await consumeCredits('org_3', 50, 'pro'); // exhaust all pro credits
    const result = await canAffordVerification('org_3', 'pro', 10);
    assertEqual(result.allowed, false, 'should block after exhaustion');
  });

  await resetAllCredits();
});

await runAsyncSuite('Executor Credit Enforcement', async () => {
  setAuthPlaywrightMode('simulated');
  resetSaasAccessStore();
  await resetAllCredits();

  const store = getSaasAccessStore();
  await store.save('env_1', {
    login_url: 'https://app.example.com/login',
    email: 'test@test.com',
    password_encrypted: encryptSecret('pass'),
    auth_method: 'password', mfa_mode: 'none',
    has_trial: null, requires_seed_data: false,
    test_account_available: true, activation_goal: null,
    primary_upgrade_path: null,
  });

  await testAsync('executor blocks when plan has no credits', async () => {
    const executor = new AuthenticatedJourneyExecutor();
    executor.setOrgContext('org_no_credits', 'vestigio');

    const output = await executor.execute({
      request: {
        id: 'vr_credit', verification_type: VerificationType.AuthenticatedJourneyVerification,
        subject_ref: 'https://app.example.com', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'pending', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://app.example.com',
      scoping: testScoping(), cycle_ref: 'audit_cycle:credit_test',
      existing_evidence: [],
    });
    assertEqual(output.status, 'failed', 'should fail');
    assert(output.errors[0].includes('INSUFFICIENT_CREDITS'), 'should mention credits');
  });

  await testAsync('executor succeeds and consumes credits with pro plan', async () => {
    await resetAllCredits();
    const executor = new AuthenticatedJourneyExecutor();
    executor.setOrgContext('org_pro', 'pro');

    const output = await executor.execute({
      request: {
        id: 'vr_credit2', verification_type: VerificationType.AuthenticatedJourneyVerification,
        subject_ref: 'https://app.example.com', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'pending', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://app.example.com',
      scoping: testScoping(), cycle_ref: 'audit_cycle:credit_test2',
      existing_evidence: [],
    });
    assertEqual(output.status, 'completed', 'should succeed');
    // Credits should have been consumed
    const balance = await canAffordVerification('org_pro', 'pro', 1);
    assert(balance.balance.consumed > 0, 'credits should be consumed');
  });

  resetSaasAccessStore();
  await resetAllCredits();
  setAuthPlaywrightMode('auto');
});

// ══════════════════════════════════════════════════
// 4. MULTI-ENVIRONMENT ISOLATION
// ══════════════════════════════════════════════════

await runAsyncSuite('Environment Isolation', async () => {
  resetSaasAccessStore();
  const store = getSaasAccessStore();

  await testAsync('configs isolated per environment', async () => {
    await store.save('env_a', {
      login_url: 'https://a.com/login', email: 'a@a.com',
      password_encrypted: encryptSecret('a_pass'),
      auth_method: 'password', mfa_mode: 'none',
      has_trial: null, requires_seed_data: null,
      test_account_available: null, activation_goal: null,
      primary_upgrade_path: null,
    });
    await store.save('env_b', {
      login_url: 'https://b.com/login', email: 'b@b.com',
      password_encrypted: encryptSecret('b_pass'),
      auth_method: 'oauth', mfa_mode: 'optional',
      has_trial: null, requires_seed_data: null,
      test_account_available: null, activation_goal: null,
      primary_upgrade_path: null,
    });

    const configA = await store.get('env_a');
    const configB = await store.get('env_b');
    assertEqual(configA!.email, 'a@a.com', 'env_a email');
    assertEqual(configB!.email, 'b@b.com', 'env_b email');
    // Cross-org check: env_a config cannot be retrieved via env_b
    const crossCheck = await store.get('env_nonexistent');
    assert(crossCheck === null, 'cross-env should return null');
  });

  resetSaasAccessStore();
});

// ══════════════════════════════════════════════════
// 5. AUTH LOGS
// ══════════════════════════════════════════════════

runSuite('Auth Logs Persistence', () => {
  clearAuthLogs();

  test('creates entries with env_id and correlation', () => {
    const logger = createAuthLogger('env_test');
    logger.info('auth_attempt_started', 'Starting');
    logger.complete('authenticated_success', 500);

    const logs = getAuthLogs('env_test');
    assertEqual(logs.length, 2, 'two events');
    assert(logs[0].correlation_id === logs[1].correlation_id, 'same correlation');
    assertEqual(logs[0].environment_id, 'env_test', 'env_id');
  });

  test('no sensitive data in logs', () => {
    const allLogs = getAuthLogs();
    for (const log of allLogs) {
      const s = JSON.stringify(log);
      assert(!s.includes('password'), 'no password');
      assert(!s.includes('secret'), 'no secret');
    }
  });

  test('correlation grouping works', () => {
    const logger = createAuthLogger('env_corr');
    logger.info('auth_attempt_started', 'Start');
    logger.error('auth_attempt_failed', 'Bad creds', 'authentication_failed');
    const grouped = getAuthLogsByCorrelation(logger.correlation_id);
    assertEqual(grouped.length, 2, 'grouped by correlation');
  });

  clearAuthLogs();
});

// ══════════════════════════════════════════════════
// 6. PACK ELIGIBILITY SUMMARY
// ══════════════════════════════════════════════════

runSuite('Pack Eligibility — Full Summary', () => {
  test('ecommerce context', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.05, ecommerce: 0.85, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.85, form: 0.05, whatsapp: 0, chat: 0, booking: 0, login: 0.05 },
      confidence_level: 'high', ambiguity: false, primary_model: 'ecommerce', primary_surface: 'checkout',
    };
    const elig = computePackEligibility(cls, null, null);
    assertEqual(elig.scale_readiness.eligible, true, 'scale always eligible');
    assertEqual(elig.revenue_integrity.eligible, true, 'revenue eligible for ecommerce');
    assertEqual(elig.chargeback_resilience.eligible, true, 'chargeback eligible for ecommerce');
    assertEqual(elig.saas_pack.eligible, false, 'saas NOT eligible for ecommerce');
    assertEqual(elig.authenticated_verification.eligible, false, 'auth NOT eligible for ecommerce');
  });

  test('SaaS context', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.85, ecommerce: 0.05, leadgen: 0.05, services: 0.03, content: 0.02 },
      conversion_surfaces: { checkout: 0.1, form: 0.05, whatsapp: 0, chat: 0, booking: 0, login: 0.75 },
      confidence_level: 'high', ambiguity: false, primary_model: 'saas', primary_surface: 'login',
    };
    const elig = computePackEligibility(cls, testSaasProfile(), testAccessConfig());
    assertEqual(elig.scale_readiness.eligible, true, 'scale always eligible');
    assertEqual(elig.saas_pack.eligible, true, 'saas eligible');
    assertEqual(elig.authenticated_verification.eligible, true, 'auth eligible');
  });

  test('content site — minimal eligibility', () => {
    const cls: ClassificationState = {
      business_model: { saas: 0.05, ecommerce: 0.05, leadgen: 0.1, services: 0.1, content: 0.7 },
      conversion_surfaces: { checkout: 0.05, form: 0.2, whatsapp: 0, chat: 0.1, booking: 0, login: 0.05 },
      confidence_level: 'high', ambiguity: false, primary_model: 'content', primary_surface: 'form',
    };
    const elig = computePackEligibility(cls, null, null);
    assertEqual(elig.scale_readiness.eligible, true, 'scale always eligible');
    assertEqual(elig.revenue_integrity.eligible, false, 'revenue NOT eligible for content');
    assertEqual(elig.chargeback_resilience.eligible, false, 'chargeback NOT eligible for content');
    assertEqual(elig.saas_pack.eligible, false, 'saas NOT eligible for content');
  });
});

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`Classification & Eligibility: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════');

if (suitesFailed > 0) process.exit(1);

})();
