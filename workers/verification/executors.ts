import { URL } from 'url';
import {
  Evidence,
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
  VerificationType,
  IdGenerator,
  makeRef,
  Scoping,
  Freshness,
  HttpResponsePayload,
  RedirectPayload,
  PageContentPayload,
} from '../../packages/domain';
import { httpFetch } from '../ingestion/http-client';
import { parsePage } from '../ingestion/parser';
import {
  VerificationExecutor,
  ExecutorInput,
  ExecutorOutput,
  VerificationLog,
} from './types';

// ──────────────────────────────────────────────
// Reuse-Only Executor
// Re-evaluates existing evidence without network calls.
// Returns the existing evidence as-is for recomputation.
// ──────────────────────────────────────────────

export class ReuseOnlyExecutor implements VerificationExecutor {
  type = VerificationType.ReuseOnly;

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const logs: VerificationLog[] = [];
    const now = new Date();

    logs.push({ timestamp: now, level: 'info', message: `Reuse-only verification for ${input.subject_url}` });

    const matching = input.existing_evidence.filter(
      e => e.subject_ref === input.subject_url || e.scoping.subject_ref === input.subject_url,
    );

    if (matching.length === 0) {
      logs.push({ timestamp: new Date(), level: 'warn', message: 'No existing evidence found for subject' });
      return { status: 'completed', evidence: [], logs, errors: [] };
    }

    logs.push({ timestamp: new Date(), level: 'info', message: `Found ${matching.length} existing evidence item(s)` });

    // Refresh freshness timestamps on existing evidence
    const refreshed = matching.map(e => ({
      ...e,
      freshness: {
        ...e.freshness,
        observed_at: now,
        fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        freshness_state: FreshnessState.Fresh,
        staleness_reason: null,
      } as Freshness,
      updated_at: now,
    }));

    return { status: 'completed', evidence: refreshed, logs, errors: [] };
  }
}

// ──────────────────────────────────────────────
// Light Probe Executor
// Minimal HTTP probe: validates status, redirects,
// headers, and basic HTML presence.
// ──────────────────────────────────────────────

export class LightProbeExecutor implements VerificationExecutor {
  type = VerificationType.LightProbe;

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const ids = new IdGenerator('vev');
    const logs: VerificationLog[] = [];
    const evidence: Evidence[] = [];
    const errors: string[] = [];
    const now = new Date();

    logs.push({ timestamp: now, level: 'info', message: `Light probe for ${input.subject_url}` });

    try {
      const response = await httpFetch(input.subject_url);
      logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `HTTP ${response.status_code} in ${response.response_time_ms}ms (final: ${response.final_url})`,
      });

      const freshness: Freshness = {
        observed_at: new Date(),
        fresh_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
        freshness_state: FreshnessState.Fresh,
        staleness_reason: null,
      };

      // HTTP response evidence
      evidence.push(createVerificationEvidence(ids, {
        evidence_type: EvidenceType.HttpResponse,
        subject_ref: input.subject_url,
        scoping: input.scoping,
        cycle_ref: input.cycle_ref,
        freshness,
        payload: {
          type: 'http_response',
          url: response.url,
          status_code: response.status_code,
          headers: response.headers,
          response_time_ms: response.response_time_ms,
          content_type: response.content_type,
          content_length: response.content_length,
        } as HttpResponsePayload,
      }));

      // Redirect evidence
      if (response.redirect_chain.length > 0) {
        evidence.push(createVerificationEvidence(ids, {
          evidence_type: EvidenceType.Redirect,
          subject_ref: input.subject_url,
          scoping: input.scoping,
          cycle_ref: input.cycle_ref,
          freshness,
          payload: {
            type: 'redirect',
            source_url: response.url,
            target_url: response.final_url,
            status_code: response.redirect_chain[0].status_code,
            hop_count: response.redirect_chain.length,
            chain: response.redirect_chain,
          } as RedirectPayload,
        }));
        logs.push({
          timestamp: new Date(),
          level: 'info',
          message: `${response.redirect_chain.length} redirect(s) detected`,
        });
      }

      // Basic page content if HTML
      const isHtml = response.content_type != null && response.content_type.includes('text/html');
      if (isHtml && response.body) {
        const parsed = parsePage(response.body, response.final_url);
        evidence.push(createVerificationEvidence(ids, {
          evidence_type: EvidenceType.PageContent,
          subject_ref: response.final_url,
          scoping: input.scoping,
          cycle_ref: input.cycle_ref,
          freshness,
          payload: {
            type: 'page_content',
            url: response.final_url,
            title: parsed.title,
            meta_description: parsed.meta_description,
            h1: parsed.h1,
            canonical_url: parsed.canonical_url,
            lang: parsed.lang,
            has_forms: parsed.forms.length > 0,
            form_count: parsed.forms.length,
            script_count: parsed.scripts.length,
            external_script_count: parsed.scripts.filter(s => s.is_external).length,
            internal_link_count: parsed.links.filter(l => !l.is_external).length,
            external_link_count: parsed.links.filter(l => l.is_external).length,
          } as PageContentPayload,
        }));
      }

      logs.push({ timestamp: new Date(), level: 'info', message: `Probe complete. ${evidence.length} evidence item(s) generated.` });
      return { status: 'completed', evidence, logs, errors };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      logs.push({ timestamp: new Date(), level: 'error', message: `Probe failed: ${msg}` });
      return { status: 'failed', evidence, logs, errors };
    }
  }
}

// ──────────────────────────────────────────────
// Browser Verification Executor — IMPLEMENTED
// Uses BrowserWorker for scenario-based verification.
// Produces typed browser evidence (navigation trace,
// checkout confirmation, failure events).
// ──────────────────────────────────────────────

export { BrowserWorker as BrowserVerificationExecutor } from './browser-worker';

// ──────────────────────────────────────────────
// Integration Pull Executor — STUB
// ──────────────────────────────────────────────

export class IntegrationPullExecutor implements VerificationExecutor {
  type = VerificationType.IntegrationPull;

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    return {
      status: 'failed',
      evidence: [],
      logs: [{
        timestamp: new Date(),
        level: 'warn',
        message: 'Integration pull is not yet implemented.',
      }],
      errors: ['Integration pull not available in this phase.'],
    };
  }
}

// ──────────────────────────────────────────────
// Authenticated Journey Executor — LIVE
//
// Phase 17B: real authenticated runtime.
// Loads SaaS access config, validates prerequisites,
// and executes authenticated browser session.
// Falls back to simulated mode when Playwright
// is unavailable (tests/CI).
// ──────────────────────────────────────────────

import {
  simulateAuthenticatedJourney,
  executeAuthenticatedJourney,
  type AuthenticatedJourneyResult,
} from './authenticated-runtime';
import { getSaasAccessStore } from '../../apps/platform/saas-access-store';
import { createAuthLogger } from '../../apps/platform/auth-logging';
import { canAffordVerification, consumeCredits } from '../../apps/platform/credits';
import type { PlanKey } from '../../packages/plans';

let authPlaywrightMode: 'real' | 'simulated' | 'auto' = 'auto';
let authPlaywrightAvailable: boolean | null = null;

async function checkAuthPlaywrightAvailable(): Promise<boolean> {
  if (authPlaywrightMode === 'real') return true;
  if (authPlaywrightMode === 'simulated') return false;
  if (authPlaywrightAvailable !== null) return authPlaywrightAvailable;
  try {
    require.resolve('playwright');
    authPlaywrightAvailable = true;
  } catch {
    authPlaywrightAvailable = false;
  }
  return authPlaywrightAvailable;
}

export function setAuthPlaywrightMode(mode: 'real' | 'simulated' | 'auto'): void {
  authPlaywrightMode = mode;
  if (mode !== 'auto') authPlaywrightAvailable = null;
}

const AUTH_VERIFICATION_CREDIT_COST = 10;

export class AuthenticatedJourneyExecutor implements VerificationExecutor {
  type = VerificationType.AuthenticatedJourneyVerification;

  /** Optional: set org/plan context for credit enforcement */
  private orgId: string | null = null;
  private plan: PlanKey = 'vestigio';

  setOrgContext(orgId: string, plan: PlanKey): void {
    this.orgId = orgId;
    this.plan = plan;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const logs: VerificationLog[] = [];
    const envId = input.scoping.environment_ref.replace('environment:', '');
    const orgId = this.orgId || input.scoping.workspace_ref.replace('workspace:', '');
    const authLog = createAuthLogger(envId);
    const startTime = Date.now();

    logs.push({ timestamp: new Date(), level: 'info', message: `Authenticated journey verification for ${input.subject_url}` });
    authLog.info('auth_attempt_started', `Auth verification started for ${input.subject_url}`);

    // Credit enforcement — check before execution
    const creditCheck = await canAffordVerification(orgId, this.plan, AUTH_VERIFICATION_CREDIT_COST);
    if (!creditCheck.allowed) {
      authLog.error('auth_prerequisite_blocked', `Insufficient credits: ${creditCheck.message}`);
      logs.push({ timestamp: new Date(), level: 'error', message: `Credit check failed: ${creditCheck.message}` });
      return {
        status: 'failed',
        evidence: [],
        logs,
        errors: [`INSUFFICIENT_CREDITS: ${creditCheck.message}`],
      };
    }

    // Load SaaS access config from store (DB in production)
    const store = getSaasAccessStore();
    const accessConfig = await store.get(envId);

    if (!accessConfig) {
      authLog.error('auth_prerequisite_blocked', 'No SaaS access config found');
      logs.push({ timestamp: new Date(), level: 'error', message: 'No SaaS access config found for this environment.' });
      return {
        status: 'failed',
        evidence: [],
        logs,
        errors: ['not_configured: No SaaS access config found. Configure in Settings → Data Sources.'],
      };
    }

    const useReal = await checkAuthPlaywrightAvailable();
    const mode = useReal ? 'playwright' : 'simulated';
    logs.push({ timestamp: new Date(), level: 'info', message: `Auth execution mode: ${mode}` });

    const { result, evidence } = useReal
      ? await executeAuthenticatedJourney(accessConfig, null, input.scoping, input.cycle_ref)
      : await simulateAuthenticatedJourney(accessConfig, null, input.scoping, input.cycle_ref);

    const durationMs = Date.now() - startTime;
    logs.push({ timestamp: new Date(), level: 'info', message: `Outcome: ${result.outcome}. ${evidence.length} evidence items. ${result.steps_executed} steps.` });
    authLog.complete(result.outcome, durationMs);

    // Persist status transitions to DB
    if (result.outcome === 'authenticated_success') {
      await store.updateStatus(envId, 'verified');
    } else if (result.outcome === 'authentication_failed') {
      await store.updateStatus(envId, 'failed', result.error_message || 'Authentication failed');
    } else if (result.outcome === 'awaiting_manual_mfa') {
      await store.updateStatus(envId, 'awaiting_manual_mfa', 'MFA challenge detected');
      authLog.warn('auth_mfa_detected', 'MFA challenge detected — awaiting manual action');
    } else if (result.outcome === 'runtime_error') {
      await store.updateStatus(envId, 'failed', result.error_message || 'Runtime error');
      authLog.error('auth_runtime_error', result.error_message || 'Runtime error');
    }

    // Consume credits after execution (charged regardless of outcome)
    await consumeCredits(orgId, AUTH_VERIFICATION_CREDIT_COST, this.plan);
    authLog.info('auth_attempt_started', `Credits consumed: ${AUTH_VERIFICATION_CREDIT_COST} for org ${orgId}`);

    const isSuccess = result.outcome === 'authenticated_success';
    return {
      status: isSuccess ? 'completed' : 'failed',
      evidence,
      logs,
      errors: result.error_message ? [result.error_message] : [],
    };
  }
}

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────

function createVerificationEvidence(ids: IdGenerator, params: {
  evidence_type: EvidenceType;
  subject_ref: string;
  scoping: Scoping;
  cycle_ref: string;
  freshness: Freshness;
  payload: any;
}): Evidence {
  const id = ids.next();
  const now = new Date();
  return {
    id,
    evidence_key: `verification_${params.evidence_type}_${id}`,
    evidence_type: params.evidence_type,
    subject_ref: params.subject_ref,
    scoping: params.scoping,
    cycle_ref: params.cycle_ref,
    freshness: params.freshness,
    source_kind: SourceKind.HttpFetch,
    collection_method: CollectionMethod.StaticFetch,
    payload: params.payload,
    quality_score: 80, // verification evidence is higher quality (targeted)
    created_at: now,
    updated_at: now,
  };
}
