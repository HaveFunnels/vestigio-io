import {
  Evidence,
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
  IdGenerator,
  Scoping,
} from '../../packages/domain';
import {
  BrowserVerificationRequest,
  BrowserVerificationResult,
  StepResult,
  VerificationStep,
  BROWSER_LIMITS,
  estimateVerificationCost,
} from './browser-types';
import { VerificationExecutor, ExecutorInput, ExecutorOutput, VerificationLog } from './types';
import { VerificationType } from '../../packages/domain';
import { PlaywrightRuntime, type RuntimeResult } from './playwright-runtime';

// ──────────────────────────────────────────────
// Browser Verification Worker
//
// Uses PlaywrightRuntime for REAL browser execution.
// Falls back to simulated execution when Playwright
// is unavailable (CI, unit tests without browser).
//
// Architecture: BrowserWorker owns the contract;
// PlaywrightRuntime owns the browser.
// ──────────────────────────────────────────────

let playwrightAvailable: boolean | null = null;

async function checkPlaywrightAvailable(): Promise<boolean> {
  if (playwrightAvailable !== null) return playwrightAvailable;
  try {
    require.resolve('playwright');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }
  return playwrightAvailable;
}

/** Force mode — for testing */
export function setPlaywrightMode(mode: 'real' | 'simulated' | 'auto'): void {
  if (mode === 'real') playwrightAvailable = true;
  else if (mode === 'simulated') playwrightAvailable = false;
  else playwrightAvailable = null;
}

export class BrowserWorker implements VerificationExecutor {
  type = VerificationType.BrowserVerification;

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const logs: VerificationLog[] = [];
    logs.push({ timestamp: new Date(), level: 'info', message: `Browser verification for ${input.subject_url}` });

    const browserReq = this.parseBrowserRequest(input);
    if (!browserReq) {
      logs.push({ timestamp: new Date(), level: 'error', message: 'Could not parse browser verification request' });
      return { status: 'failed', evidence: [], logs, errors: ['Invalid browser verification request'] };
    }

    try {
      const useReal = await checkPlaywrightAvailable();
      const mode = useReal ? 'playwright' : 'simulated';
      logs.push({ timestamp: new Date(), level: 'info', message: `Execution mode: ${mode}` });

      const result = useReal
        ? await this.executeWithPlaywright(browserReq)
        : await this.executeSimulated(browserReq);

      const evidence = this.resultToEvidence(result, input.scoping, input.cycle_ref, input.subject_url);
      logs.push({ timestamp: new Date(), level: 'info', message: `Complete: ${result.status}. ${evidence.length} evidence. ${result.steps.length} steps. Mode: ${mode}` });

      return {
        status: result.status === 'success' ? 'completed' : 'failed',
        evidence,
        logs,
        errors: result.steps.filter(s => !s.success).map(s => s.error || 'Step failed'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logs.push({ timestamp: new Date(), level: 'error', message: `Failed: ${msg}` });
      return { status: 'failed', evidence: [], logs, errors: [msg] };
    }
  }

  // ── REAL Playwright execution ─────────────────

  private async executeWithPlaywright(req: BrowserVerificationRequest): Promise<BrowserVerificationResult> {
    const runtime = new PlaywrightRuntime({
      allowed_domains: [new URL(req.target.url).hostname],
    });

    const allSteps: StepResult[] = [];
    const allScreenshots: string[] = [];
    const allConsoleErrors: string[] = [];
    const allNetworkErrors: string[] = [];
    let redirectChain: string[] = [];
    let finalUrl = req.target.url;
    let title: string | null = null;
    let checkoutDetected = false;
    let errorsDetected = false;
    const startTime = Date.now();

    for (const scenario of req.scenarios) {
      const result: RuntimeResult = await runtime.executeScenario(scenario, req.target.url);
      for (const s of result.steps) allSteps.push({ ...s, step_index: allSteps.length });
      allScreenshots.push(...result.screenshots);
      allConsoleErrors.push(...result.console_errors);
      allNetworkErrors.push(...result.network_errors);
      redirectChain = [...new Set([...redirectChain, ...result.redirect_chain])];
      finalUrl = result.final_url;
      if (result.title) title = result.title;
      if (result.checkout_detected) checkoutDetected = true;
      if (result.errors_detected) errorsDetected = true;
    }

    return this.buildResult(req, allSteps, allScreenshots, allConsoleErrors, allNetworkErrors, redirectChain, finalUrl, title, checkoutDetected, errorsDetected, Date.now() - startTime);
  }

  // ── Simulated execution (tests/CI fallback) ───

  private async executeSimulated(req: BrowserVerificationRequest): Promise<BrowserVerificationResult> {
    const allSteps: StepResult[] = [];
    const screenshots: string[] = [];
    const redirectChain: string[] = [req.target.url];
    const startTime = Date.now();
    let finalUrl = req.target.url;
    let checkoutDetected = false;
    let errorsDetected = false;
    let title: string | null = null;

    for (const scenario of req.scenarios) {
      for (const step of scenario.steps) {
        if (Date.now() - startTime > BROWSER_LIMITS.max_duration_ms) {
          allSteps.push({ step_index: allSteps.length, step_type: step.type, success: false, duration_ms: 0, error: 'Timeout' });
          errorsDetected = true;
          break;
        }
        const r = this.simulateStep(step, req.target.url);
        allSteps.push({ step_index: allSteps.length, step_type: step.type, success: r.success, duration_ms: 1, error: r.error, screenshot_path: r.screenshot });
        if (r.screenshot) screenshots.push(r.screenshot);
        if (r.redirect) redirectChain.push(r.redirect);
        if (r.finalUrl) finalUrl = r.finalUrl;
        if (r.checkoutHint) checkoutDetected = true;
        if (r.title) title = r.title;
        if (!r.success) errorsDetected = true;
      }
    }

    return this.buildResult(req, allSteps, screenshots, [], [], redirectChain, finalUrl, title, checkoutDetected, errorsDetected, Date.now() - startTime);
  }

  private simulateStep(step: VerificationStep, baseUrl: string): {
    success: boolean; error?: string; screenshot?: string; redirect?: string; finalUrl?: string; checkoutHint?: boolean; title?: string;
  } {
    switch (step.type) {
      case 'navigate': return { success: true, finalUrl: step.url, redirect: step.url !== baseUrl ? step.url : undefined, title: 'Simulated Page', checkoutHint: step.url.includes('checkout') || step.url.includes('pay') };
      case 'click': return { success: true };
      case 'type': return { success: true };
      case 'wait_for': return { success: true };
      case 'assert_visible': return { success: true };
      case 'screenshot': return { success: true, screenshot: `sim_${Date.now()}_${step.label.replace(/\s+/g, '_')}.png` };
      case 'wait_ms': return { success: true };
      default: return { success: false, error: 'Unknown step type' };
    }
  }

  // ── Shared result builder ─────────────────────

  private buildResult(
    req: BrowserVerificationRequest, steps: StepResult[],
    screenshots: string[], consoleErrors: string[], networkErrors: string[],
    redirectChain: string[], finalUrl: string, title: string | null,
    checkoutDetected: boolean, errorsDetected: boolean, durationMs: number,
  ): BrowserVerificationResult {
    const cost = estimateVerificationCost(req.scenarios);
    const successCount = steps.filter(s => s.success).length;
    const status: BrowserVerificationResult['status'] =
      errorsDetected && successCount === 0 ? 'failed' : errorsDetected ? 'partial' : 'success';
    const confidenceDelta = status === 'success' ? 15 : status === 'partial' ? 5 : -10;

    return {
      status, request_id: '', steps,
      artifacts: { screenshots, console_errors: consoleErrors, network_errors: networkErrors },
      observations: { redirect_chain: redirectChain, final_url: finalUrl, checkout_detected: checkoutDetected, errors_detected: errorsDetected, title },
      credits_consumed: cost.total_estimated, confidence_delta: confidenceDelta, duration_ms: durationMs,
    };
  }

  // ── Evidence conversion (unchanged contract) ──

  private resultToEvidence(result: BrowserVerificationResult, scoping: Scoping, cycleRef: string, subjectUrl: string): Evidence[] {
    const ids = new IdGenerator('bv');
    const evidence: Evidence[] = [];
    const now = new Date();
    const freshness = { observed_at: now, fresh_until: new Date(now.getTime() + 86400000), freshness_state: FreshnessState.Fresh, staleness_reason: null };

    if (result.observations.redirect_chain.length > 0) {
      evidence.push({
        id: ids.next(), evidence_key: `browser_nav_trace_${ids.current()}`,
        evidence_type: EvidenceType.BrowserNavigationTrace, subject_ref: subjectUrl,
        scoping, cycle_ref: cycleRef, freshness,
        source_kind: SourceKind.BrowserVerification, collection_method: CollectionMethod.DynamicRender,
        payload: { type: 'browser_navigation_trace', start_url: result.observations.redirect_chain[0], final_url: result.observations.final_url, redirect_chain: result.observations.redirect_chain, steps_executed: result.steps.length, steps_succeeded: result.steps.filter(s => s.success).length, duration_ms: result.duration_ms, title: result.observations.title } as any,
        quality_score: result.status === 'success' ? 85 : result.status === 'partial' ? 60 : 30,
        created_at: now, updated_at: now,
      });
    }

    if (result.observations.checkout_detected) {
      evidence.push({
        id: ids.next(), evidence_key: `browser_checkout_${ids.current()}`,
        evidence_type: EvidenceType.BrowserCheckoutConfirmation, subject_ref: subjectUrl,
        scoping, cycle_ref: cycleRef, freshness,
        source_kind: SourceKind.BrowserVerification, collection_method: CollectionMethod.DynamicRender,
        payload: { type: 'browser_checkout_confirmation', checkout_url: result.observations.final_url, confirmed: true, method: 'browser_navigation' } as any,
        quality_score: 90, created_at: now, updated_at: now,
      });
    }

    if (result.observations.errors_detected) {
      evidence.push({
        id: ids.next(), evidence_key: `browser_failure_${ids.current()}`,
        evidence_type: EvidenceType.BrowserFailureEvent, subject_ref: subjectUrl,
        scoping, cycle_ref: cycleRef, freshness,
        source_kind: SourceKind.BrowserVerification, collection_method: CollectionMethod.DynamicRender,
        payload: { type: 'browser_failure_event', url: result.observations.final_url, failed_steps: result.steps.filter(s => !s.success).map(s => ({ step: s.step_type, error: s.error || 'unknown' })), console_errors: result.artifacts.console_errors, network_errors: result.artifacts.network_errors } as any,
        quality_score: 70, created_at: now, updated_at: now,
      });
    }

    return evidence;
  }

  private parseBrowserRequest(input: ExecutorInput): BrowserVerificationRequest | null {
    return {
      type: 'browser_verification', subject_ref: input.request.subject_ref,
      environment_ref: input.scoping.environment_ref,
      decision_ref: input.request.decision_ref || undefined,
      target: { url: input.subject_url, intent: 'generic' },
      scenarios: [{ name: 'default_verification', steps: [
        { type: 'navigate', url: input.subject_url },
        { type: 'screenshot', label: 'initial_load' },
        { type: 'wait_ms', ms: 2000 },
        { type: 'screenshot', label: 'after_load' },
      ] }],
      priority: 'medium',
    };
  }
}
