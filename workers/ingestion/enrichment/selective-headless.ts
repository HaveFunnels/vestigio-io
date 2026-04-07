import { BrowserWorker } from "../../verification/browser-worker";
import {
  validateBrowserRequest,
  BROWSER_LIMITS,
  estimateVerificationCost,
} from "../../verification/browser-types";
import type {
  BrowserVerificationRequest,
  VerificationScenario,
} from "../../verification/browser-types";
import { buildStageDScenarios } from "./scenarios";
import type {
  EnrichmentContext,
  EnrichmentPass,
  EnrichmentResult,
  ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";

// ──────────────────────────────────────────────
// Stage D — Selective Headless
//
// First implementation of an EnrichmentPass. Triggers the existing
// BrowserWorker / PlaywrightRuntime stack with business-aware scenarios
// when the staged pipeline detected a JS-heavy site.
//
// Cost model (Wave 1):
//   - 1 SUCCESSFUL execution per cycle (retries don't count against the cap)
//   - max 3 attempts per execution (initial + 2 retries)
//   - retries fire ONLY on transient failure classes (turnstile, network,
//     browser launch, timeout) — real failures don't retry
//   - exponential backoff between attempts: 2s, 4s, 8s
//   - total worst-case duration: 3 × 60s + 6s backoff ≈ 186s
//
// What gets emitted as evidence (delegated to BrowserWorker.resultToEvidence):
//   - BrowserNavigationTrace (one per scenario that produced a redirect chain)
//   - BrowserCheckoutConfirmation (when checkout was reached)
//   - BrowserFailureEvent (when console/network/step errors detected)
//
// Future Wave 3 LLM enrichment will sit AFTER this pass in the registry,
// so it can read Stage D's browser-rendered evidence as input.
// ──────────────────────────────────────────────

const PASS_NAME = "selective_headless";
const PASS_LABEL = "Stage D — Selective Headless";

// Retry policy
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 2_000;

// Singleton — BrowserWorker is stateless so we reuse one instance.
// PlaywrightRuntime is created per-execution inside the worker.
const browserWorker = new BrowserWorker();

// ──────────────────────────────────────────────
// Eligibility (shouldRun)
// ──────────────────────────────────────────────

function shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
  // Gate 1: only the full audit cycle. Mini-audit (lp/audit) and prospect
  // scans (admin growth) use shallow / shallow_plus modes — they're
  // intentionally cheap fast probes and shouldn't burn Playwright budget.
  if (ctx.mode !== "full") {
    return {
      run: false,
      reason: `mode is '${ctx.mode}' — Stage D only runs in 'full' mode`,
    };
  }

  // Gate 2: SPA detection from Stage C. If shouldTriggerPlaywright()
  // didn't fire, the static crawl already captured everything useful
  // and Playwright wouldn't reveal more. Skip.
  if (!ctx.spa_detected) {
    return {
      run: false,
      reason: "no JavaScript-heavy pages detected during Stage C",
    };
  }

  // Gate 3: landing URL must be valid. The pipeline normally guarantees
  // this but defensive check keeps us from invoking Playwright with
  // garbage input.
  if (!ctx.landing_url || !ctx.landing_url.startsWith("http")) {
    return {
      run: false,
      reason: "no valid landing URL",
    };
  }

  return { run: true, reason: "SPA detected, mode=full, landing URL valid" };
}

// ──────────────────────────────────────────────
// Retry classification
//
// Decides which errors are worth retrying. Bot challenges and
// transient infra failures retry; logic errors don't.
// ──────────────────────────────────────────────

const RETRY_PATTERNS: { name: string; regex: RegExp }[] = [
  // Cloudflare turnstile / hCaptcha / generic bot challenges
  { name: "bot_challenge", regex: /turnstile|hcaptcha|recaptcha|cloudflare|cf-chl|just a moment|attention required/i },
  // Browser launch / executable issues
  { name: "browser_launch", regex: /executable|browserType|chromium|playwright.*launch|enoent|spawn.*fail/i },
  // Network transient errors
  { name: "network_transient", regex: /econnrefused|etimedout|enotfound|econnreset|network.*lost|net::err_/i },
  // Page navigation timeouts (different from logic timeouts)
  { name: "navigation_timeout", regex: /navigation.*timeout|net::err_aborted|page.*closed|target.*closed/i },
];

function classifyRetryability(errors: string[]): { retryable: boolean; reason: string } {
  const haystack = errors.join(" \n ").toLowerCase();
  for (const pattern of RETRY_PATTERNS) {
    if (pattern.regex.test(haystack)) {
      return { retryable: true, reason: `transient: ${pattern.name}` };
    }
  }
  return { retryable: false, reason: "non-transient (no retry)" };
}

function backoffDelayMs(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// Execution
// ──────────────────────────────────────────────

async function run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
  const startTime = Date.now();
  ctx.emit({
    type: "step",
    stage: "headless",
    data: { message: "Stage D: starting selective headless probe", index: 0 },
    timestamp: new Date(),
  });

  // Build scenarios — business-aware. Always 2 scenarios:
  // commercial path probe + support reach probe.
  const scenarios: VerificationScenario[] = buildStageDScenarios(
    ctx.business_model,
    ctx.landing_url,
  );

  const request: BrowserVerificationRequest = {
    type: "browser_verification",
    subject_ref: ctx.scoping.subject_ref || `website:${ctx.root_domain}`,
    environment_ref: ctx.scoping.environment_ref,
    target: { url: ctx.landing_url, intent: "generic" },
    scenarios,
    priority: "medium",
    cost_estimate: estimateVerificationCost(scenarios),
  };

  // Validate against BROWSER_LIMITS — catches accidental scenario bloat
  // before we even spawn a browser.
  const validationError = validateBrowserRequest(request);
  if (validationError) {
    return buildFailedResult(
      PASS_NAME,
      `Scenario validation failed: ${validationError}`,
      Date.now() - startTime,
      0,
    );
  }

  // Retry loop — execute the full request, retry on transient errors.
  // The cost cap is "1 successful execution per cycle" — retries do
  // not count, but a failed execution means Stage D is done for the cycle.
  let lastErrors: string[] = [];
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    ctx.emit({
      type: "step",
      stage: "headless",
      data: {
        message: `Stage D: attempt ${attempt}/${MAX_ATTEMPTS} — running ${scenarios.length} scenarios`,
        index: attempt,
      },
      timestamp: new Date(),
    });

    let output;
    try {
      output = await browserWorker.executeRequest(
        request,
        ctx.scoping,
        ctx.cycle_ref,
        ctx.landing_url,
      );
    } catch (err) {
      // Defensive — executeRequest itself catches and translates, but
      // if something escapes (e.g. process-level crash), we treat it as
      // an unconditional retry-eligible failure.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[stage-d ${ctx.cycle_ref}] attempt ${attempt} threw uncaught:`, err);
      lastErrors = [`uncaught: ${message}`];
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      break;
    }

    // Success path — return immediately with the evidence
    if (output.status === "completed") {
      ctx.emit({
        type: "step",
        stage: "headless",
        data: {
          message: `Stage D: success on attempt ${attempt} — ${output.evidence.length} evidence rows`,
          index: attempt,
        },
        timestamp: new Date(),
      });
      return {
        pass_name: PASS_NAME,
        status: "completed",
        reason: `success on attempt ${attempt}`,
        evidence_added: output.evidence,
        duration_ms: Date.now() - startTime,
        attempts,
        cost_units: request.cost_estimate?.total_estimated,
      };
    }

    // Failed — decide if retryable
    lastErrors = output.errors;
    const classification = classifyRetryability(output.errors);

    if (!classification.retryable) {
      ctx.emit({
        type: "step",
        stage: "headless",
        data: {
          message: `Stage D: failed (non-transient) on attempt ${attempt} — ${classification.reason}`,
          index: attempt,
        },
        timestamp: new Date(),
      });
      // Even on non-retryable failure, BrowserWorker may have produced
      // PARTIAL evidence (e.g., navigation succeeded but assert_visible
      // failed). We keep that evidence — it's still informative for
      // the engine. The result status still says completed because we
      // got data; the failed scenario steps will surface as
      // BrowserFailureEvent which inferences read.
      if (output.evidence.length > 0) {
        return {
          pass_name: PASS_NAME,
          status: "completed",
          reason: `partial: ${classification.reason}`,
          evidence_added: output.evidence,
          duration_ms: Date.now() - startTime,
          attempts,
          cost_units: request.cost_estimate?.total_estimated,
        };
      }
      // No evidence at all → genuine failure
      return buildFailedResult(
        PASS_NAME,
        `non-transient failure: ${output.errors.join("; ")}`,
        Date.now() - startTime,
        attempts,
      );
    }

    // Retryable failure — back off and try again
    ctx.emit({
      type: "step",
      stage: "headless",
      data: {
        message: `Stage D: retryable failure on attempt ${attempt} — ${classification.reason}, backing off ${backoffDelayMs(attempt)}ms`,
        index: attempt,
      },
      timestamp: new Date(),
    });
    if (attempt < MAX_ATTEMPTS) {
      await sleep(backoffDelayMs(attempt));
    }
  }

  // All retries exhausted
  return buildFailedResult(
    PASS_NAME,
    `all ${MAX_ATTEMPTS} attempts exhausted: ${lastErrors.join("; ")}`,
    Date.now() - startTime,
    attempts,
  );
}

// ──────────────────────────────────────────────
// Pass export
// ──────────────────────────────────────────────

export const selectiveHeadlessPass: EnrichmentPass = {
  name: PASS_NAME,
  label: PASS_LABEL,
  shouldRun,
  run,
};

// Re-export for tests
export {
  classifyRetryability as __test_classifyRetryability,
  backoffDelayMs as __test_backoffDelayMs,
  shouldRun as __test_shouldRun,
};

// Re-export the BROWSER_LIMITS constant so tests can sanity-check that
// our scenarios stay within bounds without importing browser-types.
export const STAGE_D_BROWSER_LIMITS = BROWSER_LIMITS;
