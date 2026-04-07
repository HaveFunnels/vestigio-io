/**
 * Stage D / Enrichment framework tests — Wave 1
 *
 * Tests cover:
 *   - Scenario builders pick the right template per business model
 *   - Each scenario stays within BROWSER_LIMITS
 *   - Stage D's shouldRun() gates correctly (mode, spa_detected, landing_url)
 *   - Retry classifier identifies transient vs permanent errors
 *   - Backoff delays are exponential
 *   - Runner registry exposes the registered passes
 *
 * The actual browser execution is NOT exercised here — that depends on
 * Playwright which is unavailable in CI without extra setup. The
 * BrowserWorker has its own simulated-mode coverage in production.
 */

import { test, assert, assertEqual, printResults, testScoping } from "./helpers";
import {
  buildStageDScenarios,
  pickCommercialPathScenario,
  buildSupportReachScenario,
  buildEcommerceCommercialPath,
  buildLeadGenCommercialPath,
  buildSaasCommercialPath,
  buildHybridCommercialPath,
} from "../workers/ingestion/enrichment/scenarios";
import {
  __test_classifyRetryability,
  __test_backoffDelayMs,
  __test_shouldRun,
  STAGE_D_BROWSER_LIMITS,
} from "../workers/ingestion/enrichment/selective-headless";
import { listRegisteredPasses } from "../workers/ingestion/enrichment/runner";
import type { EnrichmentContext } from "../workers/ingestion/enrichment/types";

const LANDING = "https://example.com";

function ctx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    evidence: [],
    coverage: new Map(),
    scoping: testScoping(),
    cycle_ref: "test_cycle:1",
    root_domain: "example.com",
    landing_url: LANDING,
    mode: "full",
    spa_detected: true,
    business_model: "ecommerce",
    conversion_model: "checkout",
    emit: () => {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Scenario builders
// ──────────────────────────────────────────────

test("scenarios — picker picks ecommerce template for ecommerce model", () => {
  const s = pickCommercialPathScenario("ecommerce", LANDING);
  assertEqual(s.name, "ecommerce_commercial_path", "ecommerce scenario name");
});

test("scenarios — picker picks lead_gen template for lead_gen model", () => {
  const s = pickCommercialPathScenario("lead_gen", LANDING);
  assertEqual(s.name, "leadgen_commercial_path", "lead_gen scenario name");
});

test("scenarios — picker picks saas template for saas model", () => {
  const s = pickCommercialPathScenario("saas", LANDING);
  assertEqual(s.name, "saas_commercial_path", "saas scenario name");
});

test("scenarios — picker falls back to hybrid for null business model", () => {
  const s = pickCommercialPathScenario(null, LANDING);
  assertEqual(s.name, "hybrid_commercial_path", "null falls back to hybrid");
});

test("scenarios — picker falls back to hybrid for unknown business model", () => {
  const s = pickCommercialPathScenario("nonprofit_b2g", LANDING);
  assertEqual(s.name, "hybrid_commercial_path", "unknown falls back to hybrid");
});

test("scenarios — every commercial-path template starts with navigate to landing", () => {
  for (const builder of [
    buildEcommerceCommercialPath,
    buildLeadGenCommercialPath,
    buildSaasCommercialPath,
    buildHybridCommercialPath,
  ]) {
    const s = builder(LANDING);
    assert(s.steps.length > 0, `${s.name} has steps`);
    const first = s.steps[0];
    assert(first.type === "navigate", `${s.name} first step is navigate`);
    if (first.type === "navigate") {
      assertEqual(first.url, LANDING, `${s.name} navigates to landing`);
    }
  }
});

test("scenarios — support reach probe checks for tel/mailto/contact/return", () => {
  const s = buildSupportReachScenario(LANDING);
  const selectors = s.steps
    .filter((step) => step.type === "assert_visible")
    .map((step) => (step as { selector: string }).selector);
  assert(
    selectors.some((sel) => sel.includes("tel:")),
    "checks for phone link",
  );
  assert(
    selectors.some((sel) => sel.includes("mailto:")),
    "checks for email link",
  );
  assert(
    selectors.some((sel) => sel.includes("contact")),
    "checks for contact link",
  );
  assert(
    selectors.some((sel) => sel.includes("return") || sel.includes("refund")),
    "checks for return/refund link",
  );
});

test("scenarios — full Stage D set returns 2 scenarios for any business model", () => {
  for (const model of ["ecommerce", "lead_gen", "saas", "hybrid", null]) {
    const set = buildStageDScenarios(model, LANDING);
    assertEqual(set.length, 2, `${model ?? "null"} returns 2 scenarios`);
    assert(
      set.some((s) => s.name === "support_reach_probe"),
      `${model ?? "null"} includes support reach`,
    );
  }
});

test("scenarios — total step + screenshot count stays within BROWSER_LIMITS", () => {
  // Each business model's full scenario set must fit BROWSER_LIMITS so
  // validateBrowserRequest doesn't reject the call. This test catches
  // accidental scenario bloat before it ships.
  for (const model of ["ecommerce", "lead_gen", "saas", "hybrid"]) {
    const set = buildStageDScenarios(model, LANDING);
    const totalSteps = set.reduce((s, sc) => s + sc.steps.length, 0);
    const totalScreenshots = set.reduce(
      (s, sc) => s + sc.steps.filter((st) => st.type === "screenshot").length,
      0,
    );
    assert(
      totalSteps <= STAGE_D_BROWSER_LIMITS.max_steps_per_run,
      `${model}: ${totalSteps} steps <= max ${STAGE_D_BROWSER_LIMITS.max_steps_per_run}`,
    );
    assert(
      totalScreenshots <= STAGE_D_BROWSER_LIMITS.max_screenshots,
      `${model}: ${totalScreenshots} screenshots <= max ${STAGE_D_BROWSER_LIMITS.max_screenshots}`,
    );
    assert(
      set.length <= STAGE_D_BROWSER_LIMITS.max_scenarios,
      `${model}: ${set.length} scenarios <= max ${STAGE_D_BROWSER_LIMITS.max_scenarios}`,
    );
  }
});

// ──────────────────────────────────────────────
// shouldRun() gating
// ──────────────────────────────────────────────

test("shouldRun — runs when all gates pass", () => {
  const decision = __test_shouldRun(ctx());
  assertEqual(decision.run, true, "all gates pass");
});

test("shouldRun — skips when mode is shallow", () => {
  const decision = __test_shouldRun(ctx({ mode: "shallow" }));
  assertEqual(decision.run, false, "shallow mode skips");
  assert(decision.reason.includes("mode"), "reason mentions mode");
});

test("shouldRun — skips when mode is shallow_plus", () => {
  const decision = __test_shouldRun(ctx({ mode: "shallow_plus" }));
  assertEqual(decision.run, false, "shallow_plus mode skips");
});

test("shouldRun — skips when SPA not detected", () => {
  const decision = __test_shouldRun(ctx({ spa_detected: false }));
  assertEqual(decision.run, false, "no SPA skips");
  assert(decision.reason.includes("JavaScript"), "reason mentions SPA");
});

test("shouldRun — skips when landing URL is empty", () => {
  const decision = __test_shouldRun(ctx({ landing_url: "" }));
  assertEqual(decision.run, false, "empty URL skips");
});

test("shouldRun — skips when landing URL is not http(s)", () => {
  const decision = __test_shouldRun(ctx({ landing_url: "javascript:void(0)" }));
  assertEqual(decision.run, false, "non-http URL skips");
});

// ──────────────────────────────────────────────
// Retry classification
// ──────────────────────────────────────────────

test("retry — turnstile is retryable", () => {
  const r = __test_classifyRetryability(["Cloudflare turnstile detected"]);
  assertEqual(r.retryable, true, "turnstile retryable");
  assert(r.reason.includes("bot_challenge"), "classified as bot_challenge");
});

test("retry — recaptcha is retryable", () => {
  const r = __test_classifyRetryability(["reCAPTCHA challenge"]);
  assertEqual(r.retryable, true, "recaptcha retryable");
});

test("retry — browser launch failure is retryable", () => {
  const r = __test_classifyRetryability(["Failed to launch chromium: ENOENT"]);
  assertEqual(r.retryable, true, "browser launch retryable");
  assert(r.reason.includes("browser_launch"), "classified as browser_launch");
});

test("retry — network error is retryable", () => {
  const r = __test_classifyRetryability(["net::ERR_CONNECTION_REFUSED"]);
  assertEqual(r.retryable, true, "network retryable");
  assert(r.reason.includes("network_transient"), "classified as network");
});

test("retry — navigation timeout is retryable", () => {
  const r = __test_classifyRetryability(["Navigation timeout of 30000ms exceeded"]);
  assertEqual(r.retryable, true, "nav timeout retryable");
});

test("retry — non-transient errors are NOT retryable", () => {
  const r = __test_classifyRetryability([
    "Selector 'a[href*=cart]' not found",
    "Step 3 failed: assert_visible",
  ]);
  assertEqual(r.retryable, false, "selector failure not retryable");
});

test("retry — empty error list is not retryable", () => {
  const r = __test_classifyRetryability([]);
  assertEqual(r.retryable, false, "empty errors not retryable");
});

// ──────────────────────────────────────────────
// Backoff timing
// ──────────────────────────────────────────────

test("backoff — exponential delays double per attempt", () => {
  const a1 = __test_backoffDelayMs(1);
  const a2 = __test_backoffDelayMs(2);
  const a3 = __test_backoffDelayMs(3);
  assertEqual(a2, a1 * 2, "attempt 2 = attempt 1 × 2");
  assertEqual(a3, a1 * 4, "attempt 3 = attempt 1 × 4");
});

// ──────────────────────────────────────────────
// Runner registry
// ──────────────────────────────────────────────

test("runner — registry contains selective_headless pass", () => {
  const passes = listRegisteredPasses();
  const stageD = passes.find((p) => p.name === "selective_headless");
  assert(!!stageD, "selective_headless registered");
  assert(stageD!.label.includes("Stage D"), "label mentions Stage D");
});

// ──────────────────────────────────────────────

printResults("Stage D Enrichment Framework");
