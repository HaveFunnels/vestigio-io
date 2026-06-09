import { BrowserWorker } from "../../verification/browser-worker";
import {
  validateBrowserRequest,
  BROWSER_LIMITS,
  estimateVerificationCost,
} from "../../verification/browser-types";
import type {
  BrowserVerificationRequest,
  CapturedNetworkRequest,
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
import { prisma } from "../../../src/libs/prismaDb";
import { urlTemplate } from "../../../packages/url-normalize";

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

  // Gate 2 RELAXED: Playwright now runs even for non-SPA sites.
  // Even server-rendered sites benefit from browser verification:
  //   - Detects cookie consent banners blocking CTAs
  //   - Reveals lazy-loaded trust signals (reviews, logos)
  //   - Captures real above-the-fold visual hierarchy
  //   - Finds JS-generated dynamic pricing/CTA content
  //   - Exposes pop-ups and exit-intent overlays
  // For non-SPA sites, scenarios run with reduced budget (homepage +
  // primary commercial page only) to keep cost proportional.

  // Gate 3: landing URL must be valid.
  if (!ctx.landing_url || !ctx.landing_url.startsWith("http")) {
    return {
      run: false,
      reason: "no valid landing URL",
    };
  }

  const reason = ctx.spa_detected
    ? "SPA detected, mode=full, landing URL valid"
    : "Non-SPA site, mode=full — running with reduced budget for overlay/CTA verification";
  return { run: true, reason };
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

  // Build scenarios — business-aware.
  // SPA sites: full 2 scenarios (commercial path + support reach)
  // Non-SPA sites: reduced budget — only homepage probe for overlays/CTAs
  let scenarios: VerificationScenario[] = buildStageDScenarios(
    ctx.business_model,
    ctx.landing_url,
  );

  // Non-SPA: limit to first scenario only (homepage/commercial probe)
  // to keep cost proportional. The key value from Playwright on static
  // sites is detecting overlays, consent banners, and above-the-fold state.
  if (!ctx.spa_detected && scenarios.length > 1) {
    scenarios = [scenarios[0]];
  }

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
      // Wire 1 — persist critical first-party surfaces captured during
      // the run. Filter is tight on purpose (see comments below) so a
      // typical cycle adds 0-10 NetworkSurface rows, not 50+.
      // Non-fatal: a persist failure logs but doesn't fail the cycle.
      const surfacesPersisted = await persistNetworkSurfaces(
        ctx,
        output.captured_requests,
      );
      ctx.emit({
        type: "step",
        stage: "headless",
        data: {
          message: `Stage D: success on attempt ${attempt} — ${output.evidence.length} evidence rows, ${surfacesPersisted} network surface(s) tracked`,
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

// ──────────────────────────────────────────────
// Wire 1 — NetworkSurface persistence
//
// Filter is intentionally tight: only commercially-critical first-party
// endpoints that returned 200 OK and are realistic body-inspection
// targets (json/xml/html, not images/fonts/css/js assets). Empirical
// volume on havefunnels is expected to be 0-10 surfaces per cycle,
// which is the simplification mantra of this wave — we are NOT trying
// to mirror everything Playwright captured, just the slice that maps
// to an actual audit unit downstream (Nuclei custom templates, body
// inspection in future wires).
//
// v1 just TRACKS. No audit fires here. The surfaces become inputs to
// future wires that act on them.
// ──────────────────────────────────────────────

const CRITICAL_ROLES = new Set<string>([
  "payment_critical",
  "commerce_content",
  "trust_reassurance", // support widgets, trust badges, reviews
]);

// Resource types worth tracking. Excludes images, fonts, stylesheets,
// raw scripts (we only care about endpoints whose bodies are
// commercially interpretable).
const TRACKABLE_RESOURCE_TYPES = new Set<string>([
  "xhr",
  "fetch",
  "document",
]);

// Body content types worth tracking. Loose substring match so e.g.
// "application/json; charset=utf-8" matches "json".
const TRACKABLE_CONTENT_TYPE_HINTS = ["json", "xml", "html"];

// Hard cap on rows persisted per cycle as a safety net. The role +
// resource-type filter typically keeps this well under 10, but a
// pathological page (e.g. a SaaS dashboard with hundreds of XHRs)
// could otherwise create runaway rows.
const MAX_NEW_SURFACES_PER_CYCLE = 30;

function envIdFromRef(environmentRef: string): string | null {
  const idx = environmentRef.indexOf(":");
  if (idx < 0) return null;
  return environmentRef.slice(idx + 1) || null;
}

async function persistNetworkSurfaces(
  ctx: EnrichmentContext,
  captured: CapturedNetworkRequest[] | undefined,
): Promise<number> {
  if (!captured || captured.length === 0) return 0;
  const envId = envIdFromRef(ctx.scoping.environment_ref);
  if (!envId) return 0;

  // Filter to the slice we care about.
  const candidates = captured.filter((c) => {
    if (!c.is_first_party) return false;
    if (!CRITICAL_ROLES.has(c.role)) return false;
    if (c.status !== 200) return false;
    if (!TRACKABLE_RESOURCE_TYPES.has(c.resource_type)) return false;
    return true;
  });
  if (candidates.length === 0) return 0;

  // Dedup by (template, method) within the cycle so we don't run
  // multiple upserts for the same surface caught across multiple
  // scenarios / multiple navigations.
  type Row = { template: string; method: string; role: string; exampleUrl: string };
  const seen = new Map<string, Row>();
  for (const c of candidates) {
    const template = urlTemplate(c.url);
    const key = `${template}::${c.method}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      template,
      method: c.method,
      role: c.role,
      exampleUrl: c.url,
    });
    if (seen.size >= MAX_NEW_SURFACES_PER_CYCLE) break;
  }

  let persisted = 0;
  for (const row of seen.values()) {
    try {
      await prisma.networkSurface.upsert({
        where: {
          environmentId_urlTemplate_method: {
            environmentId: envId,
            urlTemplate: row.template,
            method: row.method,
          },
        },
        create: {
          environmentId: envId,
          urlTemplate: row.template,
          method: row.method,
          role: row.role,
          contentType: null,
          exampleUrl: row.exampleUrl,
          firstSeenCycleRef: ctx.cycle_ref,
          lastSeenCycleRef: ctx.cycle_ref,
          capturedCount: 1,
        },
        update: {
          // Refresh tracking fields but keep firstSeen + the role
          // assigned by the first observation.
          lastSeenCycleRef: ctx.cycle_ref,
          capturedCount: { increment: 1 },
          exampleUrl: row.exampleUrl,
        },
      });
      persisted++;
    } catch (err) {
      console.warn(
        `[selective-headless] failed to upsert NetworkSurface ${row.template}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return persisted;
}
