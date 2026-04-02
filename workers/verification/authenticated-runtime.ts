import {
  SaasAccessConfig,
  SaasAccessStatus,
  SaasAuthMethod,
  Evidence,
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
  IdGenerator,
  Scoping,
  Freshness,
} from '../../packages/domain';
import {
  evaluateSaasPrerequisites,
  SaasPrerequisiteState,
} from '../../apps/platform/saas-prerequisites';
import { decryptSecret } from '../../apps/platform/secret-service';
import { BROWSER_LIMITS } from './browser-types';

// ──────────────────────────────────────────────
// Authenticated Journey Runtime
//
// Extends the Playwright-based verification to
// handle authenticated SaaS sessions. Responsible
// for login, MFA detection, and evidence production.
//
// Outcome states (explicit, never ambiguous):
//   authenticated_success
//   authentication_failed
//   awaiting_manual_mfa
//   blocked_by_prerequisite
//   blocked_by_seed_data
//   runtime_error
//
// Rules:
// - one browser context per request
// - no session reuse across orgs
// - secrets accessed through decryptSecret() only
// - never logs plaintext credentials
// - produces typed evidence, not prose
// ──────────────────────────────────────────────

export type AuthOutcome =
  | 'authenticated_success'
  | 'authentication_failed'
  | 'awaiting_manual_mfa'
  | 'blocked_by_prerequisite'
  | 'blocked_by_seed_data'
  | 'runtime_error';

export interface AuthenticatedJourneyResult {
  outcome: AuthOutcome;
  final_url: string | null;
  page_title: string | null;
  steps_executed: number;
  duration_ms: number;
  screenshots: string[];
  console_errors: string[];
  error_message: string | null;
  mfa_detected: boolean;
  login_form_found: boolean;
  post_login_url: string | null;
}

export interface AuthRuntimeOptions {
  timeout_ms: number;
  screenshot_dir: string;
  max_login_attempts: number;
}

const DEFAULT_AUTH_OPTIONS: AuthRuntimeOptions = {
  timeout_ms: BROWSER_LIMITS.max_duration_ms,
  screenshot_dir: '/tmp/vestigio-auth-screenshots',
  max_login_attempts: 1,
};

// Common MFA selectors to detect MFA walls
const MFA_INDICATORS = [
  'input[name*="otp"]', 'input[name*="mfa"]', 'input[name*="totp"]',
  'input[name*="2fa"]', 'input[name*="code"]', 'input[name*="verification"]',
  '[data-testid*="mfa"]', '[data-testid*="2fa"]', '[data-testid*="otp"]',
  'text=Enter verification code', 'text=Two-factor authentication',
  'text=Enter the code', 'text=Authenticator app',
];

// Common login form selectors
const LOGIN_SELECTORS = {
  emailFields: [
    'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
    'input[id="email"]', 'input[id="username"]', 'input[autocomplete="email"]',
    'input[autocomplete="username"]',
  ],
  passwordFields: [
    'input[type="password"]', 'input[name="password"]', 'input[id="password"]',
    'input[autocomplete="current-password"]',
  ],
  submitButtons: [
    'button[type="submit"]', 'input[type="submit"]',
    'button:has-text("Log in")', 'button:has-text("Sign in")',
    'button:has-text("Login")', 'button:has-text("Continue")',
  ],
};

/**
 * Execute an authenticated journey verification.
 * Returns structured result — never throws.
 */
export async function executeAuthenticatedJourney(
  accessConfig: SaasAccessConfig,
  businessProfile: import('../../packages/domain').BusinessProfile | null,
  scoping: Scoping,
  cycleRef: string,
  options: Partial<AuthRuntimeOptions> = {},
): Promise<{ result: AuthenticatedJourneyResult; evidence: Evidence[] }> {
  const opts = { ...DEFAULT_AUTH_OPTIONS, ...options };
  const ids = new IdGenerator('auth');
  const startTime = Date.now();

  // ── Check prerequisites ─────────────────────
  const prereqs = evaluateSaasPrerequisites(accessConfig, businessProfile);
  if (prereqs.status === 'blocked') {
    const blockedResult = makeBlockedResult(prereqs, startTime);
    const evidence = buildPrerequisiteEvidence(ids, prereqs, accessConfig, scoping, cycleRef);
    return { result: blockedResult, evidence };
  }

  if (accessConfig.requires_seed_data === true) {
    return {
      result: {
        outcome: 'blocked_by_seed_data',
        final_url: null, page_title: null, steps_executed: 0,
        duration_ms: Date.now() - startTime, screenshots: [],
        console_errors: [], error_message: 'Test account requires seed data before analysis.',
        mfa_detected: false, login_form_found: false, post_login_url: null,
      },
      evidence: buildPrerequisiteEvidence(ids, prereqs, accessConfig, scoping, cycleRef),
    };
  }

  // ── Attempt authenticated session ───────────
  try {
    const loginResult = await attemptLogin(accessConfig, opts);
    const evidence = buildSessionEvidence(ids, loginResult, accessConfig, scoping, cycleRef);
    return { result: loginResult, evidence };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorResult: AuthenticatedJourneyResult = {
      outcome: 'runtime_error',
      final_url: null, page_title: null, steps_executed: 0,
      duration_ms: Date.now() - startTime, screenshots: [],
      console_errors: [], error_message: msg,
      mfa_detected: false, login_form_found: false, post_login_url: null,
    };
    const evidence = buildSessionEvidence(ids, errorResult, accessConfig, scoping, cycleRef);
    return { result: errorResult, evidence };
  }
}

/**
 * Simulated login attempt — used when Playwright is unavailable.
 * Returns deterministic result for testing.
 */
export async function simulateAuthenticatedJourney(
  accessConfig: SaasAccessConfig,
  businessProfile: import('../../packages/domain').BusinessProfile | null,
  scoping: Scoping,
  cycleRef: string,
): Promise<{ result: AuthenticatedJourneyResult; evidence: Evidence[] }> {
  const ids = new IdGenerator('auth_sim');
  const startTime = Date.now();

  // Check prerequisites first
  const prereqs = evaluateSaasPrerequisites(accessConfig, businessProfile);
  if (prereqs.status === 'blocked') {
    const blockedResult = makeBlockedResult(prereqs, startTime);
    const evidence = buildPrerequisiteEvidence(ids, prereqs, accessConfig, scoping, cycleRef);
    return { result: blockedResult, evidence };
  }

  // Check seed data requirement
  if (accessConfig.requires_seed_data === true) {
    return {
      result: {
        outcome: 'blocked_by_seed_data',
        final_url: null, page_title: null, steps_executed: 0,
        duration_ms: Date.now() - startTime, screenshots: [],
        console_errors: [], error_message: 'Test account requires seed data before analysis.',
        mfa_detected: false, login_form_found: false, post_login_url: null,
      },
      evidence: buildPrerequisiteEvidence(ids, prereqs, accessConfig, scoping, cycleRef),
    };
  }

  // Simulate based on MFA mode — 'required' is caught by prerequisites above,
  // but 'optional' may trigger MFA at runtime (simulated for testing)
  if (accessConfig.mfa_mode === 'required' || accessConfig.mfa_mode === 'optional') {
    const result: AuthenticatedJourneyResult = {
      outcome: 'awaiting_manual_mfa',
      final_url: accessConfig.login_url,
      page_title: 'Two-Factor Authentication',
      steps_executed: 2,
      duration_ms: Date.now() - startTime,
      screenshots: [],
      console_errors: [],
      error_message: 'MFA required — awaiting manual completion.',
      mfa_detected: true,
      login_form_found: true,
      post_login_url: null,
    };
    return { result, evidence: buildSessionEvidence(ids, result, accessConfig, scoping, cycleRef) };
  }

  // Simulate success
  const result: AuthenticatedJourneyResult = {
    outcome: 'authenticated_success',
    final_url: accessConfig.login_url.replace('/login', '/dashboard'),
    page_title: 'Dashboard',
    steps_executed: 3,
    duration_ms: Date.now() - startTime,
    screenshots: [`sim_auth_${Date.now()}.png`],
    console_errors: [],
    error_message: null,
    mfa_detected: false,
    login_form_found: true,
    post_login_url: accessConfig.login_url.replace('/login', '/dashboard'),
  };
  return { result, evidence: buildSessionEvidence(ids, result, accessConfig, scoping, cycleRef) };
}

// ──────────────────────────────────────────────
// Real Playwright login attempt
// ──────────────────────────────────────────────

async function attemptLogin(
  config: SaasAccessConfig,
  opts: AuthRuntimeOptions,
): Promise<AuthenticatedJourneyResult> {
  const startTime = Date.now();

  // Dynamically require playwright (may not be available)
  let chromium: any;
  try {
    const pw = require('playwright');
    chromium = pw.chromium;
  } catch {
    // Fall back to simulation if Playwright not available
    return {
      outcome: 'runtime_error',
      final_url: null, page_title: null, steps_executed: 0,
      duration_ms: Date.now() - startTime, screenshots: [],
      console_errors: [], error_message: 'Playwright not available.',
      mfa_detected: false, login_form_found: false, post_login_url: null,
    };
  }

  let browser: any = null;
  const screenshots: string[] = [];
  const consoleErrors: string[] = [];
  let stepsExecuted = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Vestigio-AuthVerification/1.0',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    page.on('console', (msg: any) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Step 1: Navigate to login page
    await page.goto(config.login_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    stepsExecuted++;

    // Step 2: Find login form
    const loginFormFound = await findLoginForm(page);
    if (!loginFormFound) {
      return {
        outcome: 'authentication_failed',
        final_url: page.url(), page_title: await safeTitle(page),
        steps_executed: stepsExecuted,
        duration_ms: Date.now() - startTime, screenshots, console_errors: consoleErrors,
        error_message: 'Could not find login form on page.',
        mfa_detected: false, login_form_found: false, post_login_url: null,
      };
    }
    stepsExecuted++;

    // Step 3: Fill credentials
    const email = config.email || '';
    let password = '';
    if (config.password_encrypted) {
      try {
        password = decryptSecret(config.password_encrypted);
      } catch {
        return {
          outcome: 'runtime_error',
          final_url: page.url(), page_title: await safeTitle(page),
          steps_executed: stepsExecuted,
          duration_ms: Date.now() - startTime, screenshots, console_errors: consoleErrors,
          error_message: 'Failed to decrypt credentials.',
          mfa_detected: false, login_form_found: true, post_login_url: null,
        };
      }
    }

    await fillCredentials(page, email, password);
    stepsExecuted++;

    // Step 4: Submit form
    await submitLogin(page);
    stepsExecuted++;

    // Step 5: Wait and evaluate result
    await page.waitForTimeout(3000);
    stepsExecuted++;

    const currentUrl = page.url();
    const title = await safeTitle(page);

    // Check for MFA wall
    const mfaDetected = await detectMfa(page);
    if (mfaDetected) {
      return {
        outcome: 'awaiting_manual_mfa',
        final_url: currentUrl, page_title: title,
        steps_executed: stepsExecuted,
        duration_ms: Date.now() - startTime, screenshots, console_errors: consoleErrors,
        error_message: 'MFA challenge detected — awaiting manual completion.',
        mfa_detected: true, login_form_found: true, post_login_url: null,
      };
    }

    // Check if still on login page (auth failed)
    const stillOnLogin = await findLoginForm(page);
    if (stillOnLogin && currentUrl === config.login_url) {
      return {
        outcome: 'authentication_failed',
        final_url: currentUrl, page_title: title,
        steps_executed: stepsExecuted,
        duration_ms: Date.now() - startTime, screenshots, console_errors: consoleErrors,
        error_message: 'Login form still present after submission — credentials likely invalid.',
        mfa_detected: false, login_form_found: true, post_login_url: null,
      };
    }

    // Success — we navigated away from login
    return {
      outcome: 'authenticated_success',
      final_url: currentUrl, page_title: title,
      steps_executed: stepsExecuted,
      duration_ms: Date.now() - startTime, screenshots, console_errors: consoleErrors,
      error_message: null,
      mfa_detected: false, login_form_found: true, post_login_url: currentUrl,
    };

  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best effort */ }
    }
  }
}

// ──────────────────────────────────────────────
// Page interaction helpers
// ──────────────────────────────────────────────

async function findLoginForm(page: any): Promise<boolean> {
  for (const sel of LOGIN_SELECTORS.emailFields) {
    try {
      if (await page.isVisible(sel)) return true;
    } catch { /* selector not found */ }
  }
  for (const sel of LOGIN_SELECTORS.passwordFields) {
    try {
      if (await page.isVisible(sel)) return true;
    } catch { /* selector not found */ }
  }
  return false;
}

async function fillCredentials(page: any, email: string, password: string): Promise<void> {
  // Try email/username fields
  for (const sel of LOGIN_SELECTORS.emailFields) {
    try {
      if (await page.isVisible(sel)) {
        await page.fill(sel, email, { timeout: 5000 });
        break;
      }
    } catch { /* next selector */ }
  }

  // Try password fields
  for (const sel of LOGIN_SELECTORS.passwordFields) {
    try {
      if (await page.isVisible(sel)) {
        await page.fill(sel, password, { timeout: 5000 });
        break;
      }
    } catch { /* next selector */ }
  }
}

async function submitLogin(page: any): Promise<void> {
  for (const sel of LOGIN_SELECTORS.submitButtons) {
    try {
      if (await page.isVisible(sel)) {
        await page.click(sel, { timeout: 5000 });
        return;
      }
    } catch { /* next selector */ }
  }
  // Fallback: press Enter
  await page.keyboard.press('Enter');
}

async function detectMfa(page: any): Promise<boolean> {
  for (const sel of MFA_INDICATORS) {
    try {
      if (sel.startsWith('text=')) {
        const text = sel.slice(5);
        const content = await page.content();
        if (content.includes(text)) return true;
      } else {
        if (await page.isVisible(sel)) return true;
      }
    } catch { /* selector not found */ }
  }
  return false;
}

async function safeTitle(page: any): Promise<string | null> {
  try { return await page.title(); } catch { return null; }
}

// ──────────────────────────────────────────────
// Evidence builders
// ──────────────────────────────────────────────

function buildFreshness(): Freshness {
  const now = new Date();
  return {
    observed_at: now,
    fresh_until: new Date(now.getTime() + 86400000),
    freshness_state: FreshnessState.Fresh,
    staleness_reason: null,
  };
}

function buildSessionEvidence(
  ids: IdGenerator,
  result: AuthenticatedJourneyResult,
  config: SaasAccessConfig,
  scoping: Scoping,
  cycleRef: string,
): Evidence[] {
  const evidence: Evidence[] = [];
  const now = new Date();
  const freshness = buildFreshness();

  // Always produce a session attempt evidence
  evidence.push({
    id: ids.next(),
    evidence_key: `auth_session_${ids.current()}`,
    evidence_type: EvidenceType.AuthenticatedSessionAttempt,
    subject_ref: config.login_url,
    scoping,
    cycle_ref: cycleRef,
    freshness,
    source_kind: SourceKind.BrowserVerification,
    collection_method: CollectionMethod.DynamicRender,
    payload: {
      type: 'authenticated_session_attempt',
      login_url: config.login_url,
      auth_method: config.auth_method,
      success: result.outcome === 'authenticated_success',
      failure_reason: result.error_message,
      duration_ms: result.duration_ms,
    } as any,
    quality_score: result.outcome === 'authenticated_success' ? 85 : 40,
    created_at: now,
    updated_at: now,
  });

  // If blocked by MFA, produce blocked event
  if (result.outcome === 'awaiting_manual_mfa' || result.mfa_detected) {
    evidence.push({
      id: ids.next(),
      evidence_key: `auth_blocked_${ids.current()}`,
      evidence_type: EvidenceType.AuthenticationBlockedEvent,
      subject_ref: config.login_url,
      scoping,
      cycle_ref: cycleRef,
      freshness,
      source_kind: SourceKind.BrowserVerification,
      collection_method: CollectionMethod.DynamicRender,
      payload: {
        type: 'authentication_blocked_event',
        login_url: config.login_url,
        blocked_reason: 'MFA challenge detected during login.',
        blocker_type: 'mfa',
      } as any,
      quality_score: 70,
      created_at: now,
      updated_at: now,
    });
  }

  // If successful, produce navigation trace
  if (result.outcome === 'authenticated_success' && result.post_login_url) {
    evidence.push({
      id: ids.next(),
      evidence_key: `auth_nav_${ids.current()}`,
      evidence_type: EvidenceType.BrowserNavigationTrace,
      subject_ref: config.login_url,
      scoping,
      cycle_ref: cycleRef,
      freshness,
      source_kind: SourceKind.BrowserVerification,
      collection_method: CollectionMethod.DynamicRender,
      payload: {
        type: 'browser_navigation_trace',
        start_url: config.login_url,
        final_url: result.post_login_url,
        redirect_chain: [config.login_url, result.post_login_url],
        steps_executed: result.steps_executed,
        steps_succeeded: result.steps_executed,
        duration_ms: result.duration_ms,
        title: result.page_title,
      } as any,
      quality_score: 85,
      created_at: now,
      updated_at: now,
    });
  }

  return evidence;
}

function buildPrerequisiteEvidence(
  ids: IdGenerator,
  prereqs: SaasPrerequisiteState,
  config: SaasAccessConfig,
  scoping: Scoping,
  cycleRef: string,
): Evidence[] {
  const now = new Date();
  return [{
    id: ids.next(),
    evidence_key: `prereq_missing_${ids.current()}`,
    evidence_type: EvidenceType.PrerequisiteMissingEvent,
    subject_ref: config.login_url || `environment:${config.environment_id}`,
    scoping,
    cycle_ref: cycleRef,
    freshness: buildFreshness(),
    source_kind: SourceKind.BrowserVerification,
    collection_method: CollectionMethod.DynamicRender,
    payload: {
      type: 'prerequisite_missing_event',
      missing_items: prereqs.missing_items,
      environment_id: config.environment_id,
      evaluated_at: now,
    } as any,
    quality_score: 50,
    created_at: now,
    updated_at: now,
  }];
}

function makeBlockedResult(prereqs: SaasPrerequisiteState, startTime: number): AuthenticatedJourneyResult {
  return {
    outcome: 'blocked_by_prerequisite',
    final_url: null,
    page_title: null,
    steps_executed: 0,
    duration_ms: Date.now() - startTime,
    screenshots: [],
    console_errors: [],
    error_message: `Prerequisites not met: ${prereqs.missing_items.join(', ')}`,
    mfa_detected: false,
    login_form_found: false,
    post_login_url: null,
  };
}
