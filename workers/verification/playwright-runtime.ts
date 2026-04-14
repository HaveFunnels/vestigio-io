import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { VerificationStep, VerificationScenario, BROWSER_LIMITS, classifyNetworkRequest, isCommercialPage, buildNetworkAnalysisSummary } from './browser-types';
import type { StepResult, CapturedNetworkRequest, NetworkAnalysisSummary } from './browser-types';
import { acquireBrowserSlot, releaseBrowserSlot } from './chromium-pool';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ──────────────────────────────────────────────
// Playwright Runtime
//
// Clean adapter: our VerificationStep → real browser actions.
// Owns the browser lifecycle. One browser per request.
// Captures artifacts (screenshots, console, network).
// Respects all safety limits from BROWSER_LIMITS.
//
// NOT used directly — called by BrowserWorker.
// ──────────────────────────────────────────────

export type ViewportMode = 'desktop' | 'mobile';

export const VIEWPORT_PRESETS: Record<ViewportMode, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 375, height: 812 },
};

export interface RuntimeOptions {
  timeout_ms: number;
  screenshot_dir: string;
  allowed_domains: string[];  // scope enforcement
  viewport: ViewportMode;     // Phase 2B: mobile/desktop viewport
}

export interface RuntimeResult {
  steps: StepResult[];
  screenshots: string[];
  console_errors: string[];
  network_errors: string[];
  redirect_chain: string[];
  final_url: string;
  title: string | null;
  checkout_detected: boolean;
  errors_detected: boolean;
  duration_ms: number;
  // Phase 2D: Network analysis
  network_analysis: NetworkAnalysisSummary | null;
}

const DEFAULT_OPTIONS: RuntimeOptions = {
  timeout_ms: BROWSER_LIMITS.max_duration_ms,
  screenshot_dir: path.join(os.tmpdir(), 'vestigio-screenshots'),
  allowed_domains: [],
  viewport: 'desktop',
};

export class PlaywrightRuntime {
  private options: RuntimeOptions;

  constructor(options: Partial<RuntimeOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    // Ensure screenshot dir exists
    if (!fs.existsSync(this.options.screenshot_dir)) {
      fs.mkdirSync(this.options.screenshot_dir, { recursive: true });
    }
  }

  async executeScenario(
    scenario: VerificationScenario,
    targetUrl: string,
  ): Promise<RuntimeResult> {
    const steps: StepResult[] = [];
    const screenshots: string[] = [];
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    const redirectChain: string[] = [];
    let finalUrl = targetUrl;
    let title: string | null = null;
    let checkoutDetected = false;
    let errorsDetected = false;

    const startTime = Date.now();
    let browser: Browser | null = null;

    // Phase 2D: Network request capture (scoped outside try for access in return)
    const capturedRequests: CapturedNetworkRequest[] = [];
    const requestStartTimes = new Map<string, number>();
    const rootDomain = this.extractRootDomain(targetUrl);

    // Wave 5 Fase 1A: cap concurrent Chromium launches per process so a
    // burst of cycles can't OOM the worker. Slot is released in the
    // finally{} block at the bottom of this method (see browser?.close()).
    let slotHeld = false;
    try {
      await acquireBrowserSlot();
      slotHeld = true;
      browser = await chromium.launch({ headless: true });
      const vp = VIEWPORT_PRESETS[this.options.viewport];
      const isMobile = this.options.viewport === 'mobile';
      const context = await browser.newContext({
        viewport: vp,
        userAgent: isMobile
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1 Vestigio-Mobile/1.0'
          : 'Vestigio-Verification/1.0',
        isMobile,
        hasTouch: isMobile,
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();
      const pageLoadStart = Date.now();

      page.on('request', (req) => {
        requestStartTimes.set(req.url(), Date.now() - pageLoadStart);
      });

      // ── Artifact capture listeners ───────────

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      page.on('requestfailed', (req) => {
        const url = req.url();
        networkErrors.push(`${req.failure()?.errorText || 'unknown'}: ${url}`);
        const host = this.extractHost(url);
        const isFirstParty = host === rootDomain || host.endsWith(`.${rootDomain}`);
        capturedRequests.push({
          url,
          host,
          resource_type: req.resourceType(),
          method: req.method(),
          is_first_party: isFirstParty,
          role: classifyNetworkRequest(url, req.resourceType(), finalUrl, rootDomain),
          status: null,
          failed: true,
          failure_reason: req.failure()?.errorText || 'unknown',
          duration_ms: null,
          started_at_ms: requestStartTimes.get(url) || 0,
          is_commercial_surface: isCommercialPage(finalUrl),
        });
      });

      page.on('response', (response) => {
        const status = response.status();
        if (status >= 300 && status < 400) {
          const location = response.headers()['location'];
          if (location) redirectChain.push(location);
        }
        // Phase 2D: Capture all responses for network analysis
        const req = response.request();
        const url = req.url();
        const host = this.extractHost(url);
        const isFirstParty = host === rootDomain || host.endsWith(`.${rootDomain}`);
        const startMs = requestStartTimes.get(url) || 0;
        capturedRequests.push({
          url,
          host,
          resource_type: req.resourceType(),
          method: req.method(),
          is_first_party: isFirstParty,
          role: classifyNetworkRequest(url, req.resourceType(), finalUrl, rootDomain),
          status,
          failed: status >= 400,
          failure_reason: status >= 400 ? `HTTP ${status}` : null,
          duration_ms: Date.now() - pageLoadStart - startMs,
          started_at_ms: startMs,
          is_commercial_surface: isCommercialPage(finalUrl),
        });
      });

      // Track navigation URLs
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          const url = frame.url();
          if (url && url !== 'about:blank') {
            redirectChain.push(url);
            finalUrl = url;
            if (url.includes('checkout') || url.includes('pay') || url.includes('cart')) {
              checkoutDetected = true;
            }
          }
        }
      });

      // ── Execute steps ───────────────────────

      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        const stepStart = Date.now();

        // Global timeout check
        if (Date.now() - startTime > this.options.timeout_ms) {
          steps.push({ step_index: i, step_type: step.type, success: false, duration_ms: 0, error: 'Global timeout exceeded' });
          errorsDetected = true;
          break;
        }

        try {
          const result = await this.executeStep(page, step, i);
          steps.push({
            step_index: i,
            step_type: step.type,
            success: result.success,
            duration_ms: Date.now() - stepStart,
            error: result.error,
            screenshot_path: result.screenshotPath,
          });
          if (result.screenshotPath) screenshots.push(result.screenshotPath);
          if (!result.success) errorsDetected = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          steps.push({ step_index: i, step_type: step.type, success: false, duration_ms: Date.now() - stepStart, error: msg });
          errorsDetected = true;
        }
      }

      // Capture final state
      try {
        finalUrl = page.url();
        title = await page.title();
      } catch { /* page may have closed */ }

      await context.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (steps.length === 0) {
        steps.push({ step_index: 0, step_type: 'browser_launch', success: false, duration_ms: Date.now() - startTime, error: msg });
      }
      errorsDetected = true;
    } finally {
      if (browser) {
        try { await browser.close(); } catch { /* best effort */ }
      }
      // Wave 5 Fase 1A: release the concurrency slot regardless of
      // success/failure path. Guarded by slotHeld so a release can't
      // sneak through when acquireBrowserSlot() itself threw.
      if (slotHeld) releaseBrowserSlot();
    }

    // Phase 2D: Build network analysis summary
    const networkAnalysis = capturedRequests.length > 0
      ? buildNetworkAnalysisSummary(capturedRequests, finalUrl, this.options.viewport, null)
      : null;

    return {
      steps,
      screenshots,
      console_errors: consoleErrors,
      network_errors: networkErrors,
      redirect_chain: [...new Set(redirectChain)], // deduplicate
      final_url: finalUrl,
      title,
      checkout_detected: checkoutDetected,
      errors_detected: errorsDetected,
      duration_ms: Date.now() - startTime,
      network_analysis: networkAnalysis,
    };
  }

  // ──────────────────────────────────────────────
  // Individual step execution
  // ──────────────────────────────────────────────

  private async executeStep(
    page: Page,
    step: VerificationStep,
    index: number,
  ): Promise<{ success: boolean; error?: string; screenshotPath?: string }> {
    const STEP_TIMEOUT = 15_000; // 15s per step

    switch (step.type) {
      case 'navigate': {
        await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT });
        return { success: true };
      }

      case 'click': {
        await page.click(step.selector, { timeout: STEP_TIMEOUT });
        return { success: true };
      }

      case 'type': {
        await page.fill(step.selector, step.value, { timeout: STEP_TIMEOUT });
        return { success: true };
      }

      case 'wait_for': {
        const timeout = step.timeout_ms || STEP_TIMEOUT;
        await page.waitForSelector(step.selector, { timeout });
        return { success: true };
      }

      case 'assert_visible': {
        const visible = await page.isVisible(step.selector);
        if (!visible) {
          return { success: false, error: `Element not visible: ${step.selector}` };
        }
        return { success: true };
      }

      case 'screenshot': {
        const filename = `vg_${Date.now()}_${index}_${step.label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
        const filepath = path.join(this.options.screenshot_dir, filename);
        await page.screenshot({ path: filepath, fullPage: false });
        return { success: true, screenshotPath: filepath };
      }

      case 'wait_ms': {
        await new Promise(resolve => setTimeout(resolve, Math.min(step.ms, 10_000)));
        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown step type' };
    }
  }

  private extractHost(url: string): string {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  private extractRootDomain(url: string): string {
    try {
      const host = new URL(url).hostname;
      const parts = host.split('.');
      return parts.length >= 2 ? parts.slice(-2).join('.') : host;
    } catch { return ''; }
  }
}
