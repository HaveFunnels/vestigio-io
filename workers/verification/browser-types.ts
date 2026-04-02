import { VerificationRequest, Ref, Scoping } from '../../packages/domain';

// ──────────────────────────────────────────────
// Browser Verification — Request + Result Types
//
// Extends the base VerificationRequest with
// browser-specific scenarios, steps, and cost.
// ──────────────────────────────────────────────

export type BrowserIntent = 'checkout' | 'journey' | 'form' | 'cta' | 'generic';
export type VerificationPriority = 'low' | 'medium' | 'high';

export interface BrowserVerificationTarget {
  url: string;
  path_scope?: string;
  intent: BrowserIntent;
}

// ── Steps ──────────────────────────────────────

export type VerificationStep =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; value: string }
  | { type: 'wait_for'; selector: string; timeout_ms?: number }
  | { type: 'assert_visible'; selector: string }
  | { type: 'screenshot'; label: string }
  | { type: 'wait_ms'; ms: number };

export interface VerificationScenario {
  name: string;
  steps: VerificationStep[];
}

// ── Request ────────────────────────────────────

export interface BrowserVerificationRequest {
  type: 'browser_verification';
  subject_ref: string;
  environment_ref: string;
  decision_ref?: string;
  target: BrowserVerificationTarget;
  scenarios: VerificationScenario[];
  priority: VerificationPriority;
  expected_value_score?: number;
  cost_estimate?: CreditCostEstimate;
}

// ── Cost ───────────────────────────────────────

export interface CreditCostEstimate {
  base_cost: number;
  step_cost: number;
  screenshot_cost: number;
  total_estimated: number;
}

export function estimateVerificationCost(scenarios: VerificationScenario[]): CreditCostEstimate {
  const BASE_COST = 5;           // credits per run
  const COST_PER_STEP = 1;       // credits per step
  const COST_PER_SCREENSHOT = 2; // credits per screenshot

  let stepCount = 0;
  let screenshotCount = 0;

  for (const s of scenarios) {
    for (const step of s.steps) {
      stepCount++;
      if (step.type === 'screenshot') screenshotCount++;
    }
  }

  return {
    base_cost: BASE_COST,
    step_cost: stepCount * COST_PER_STEP,
    screenshot_cost: screenshotCount * COST_PER_SCREENSHOT,
    total_estimated: BASE_COST + (stepCount * COST_PER_STEP) + (screenshotCount * COST_PER_SCREENSHOT),
  };
}

// ── Result ─────────────────────────────────────

export interface StepResult {
  step_index: number;
  step_type: string;
  success: boolean;
  duration_ms: number;
  error?: string;
  screenshot_path?: string;
}

export interface BrowserVerificationResult {
  status: 'success' | 'failed' | 'partial';
  request_id: string;

  steps: StepResult[];

  artifacts: {
    screenshots: string[];
    console_errors: string[];
    network_errors: string[];
  };

  observations: {
    redirect_chain: string[];
    final_url: string;
    checkout_detected: boolean;
    errors_detected: boolean;
    title: string | null;
  };

  credits_consumed: number;
  confidence_delta: number;
  duration_ms: number;
}

// ── Safety Limits ──────────────────────────────

export const BROWSER_LIMITS = {
  max_steps_per_run: 20,
  max_duration_ms: 60_000,     // 60 seconds
  max_screenshots: 10,
  max_scenarios: 5,
  max_retries: 2,
};

// ── Phase 2B: Console Error Classification ──────

export type RuntimeErrorBucket =
  | 'purchase_interruption'       // payment SDK, checkout flow errors
  | 'navigation_failure'          // route loading, page crash, DOM errors
  | 'tracking_failure'            // analytics, pixel, tag manager errors
  | 'widget_failure'              // chat, support, consent widget errors
  | 'payment_provider_error'      // Stripe, PayPal, provider SDK errors
  | 'general_runtime';            // other JS errors

export interface ClassifiedConsoleError {
  raw_message: string;
  bucket: RuntimeErrorBucket;
  is_commercial_impact: boolean;  // true if affects purchase/conversion/measurement
  confidence: number;             // 0-100
}

const ERROR_CLASSIFICATION_PATTERNS: { bucket: RuntimeErrorBucket; patterns: RegExp[]; commercial: boolean }[] = [
  {
    bucket: 'purchase_interruption',
    commercial: true,
    patterns: [
      /checkout|payment|cart|order|billing|purchase/i,
      /submit.*form.*error/i,
      /transaction.*fail/i,
    ],
  },
  {
    bucket: 'payment_provider_error',
    commercial: true,
    patterns: [
      /stripe/i, /paypal/i, /braintree/i, /adyen/i, /square/i,
      /mercadopago/i, /pagseguro/i, /klarna/i,
    ],
  },
  {
    bucket: 'tracking_failure',
    commercial: true,
    patterns: [
      /gtag|google.*analytics|googletagmanager/i,
      /fbq|facebook.*pixel|meta.*pixel/i,
      /analytics.*error|tracking.*fail/i,
      /segment|mixpanel|amplitude|posthog|hotjar/i,
      /dataLayer/i,
    ],
  },
  {
    bucket: 'widget_failure',
    commercial: false,
    patterns: [
      /intercom|drift|zendesk|crisp|tidio|tawk|livechat|freshworks/i,
      /cookie.*consent|onetrust|cookiebot|didomi/i,
    ],
  },
  {
    bucket: 'navigation_failure',
    commercial: true,
    patterns: [
      /cannot read propert/i,
      /is not defined/i,
      /null is not an object/i,
      /TypeError|ReferenceError|SyntaxError/i,
      /chunk.*load.*fail/i,
      /loading.*chunk/i,
      /failed to fetch/i,
    ],
  },
];

export function classifyConsoleErrors(rawErrors: string[]): ClassifiedConsoleError[] {
  return rawErrors.map(raw => {
    for (const rule of ERROR_CLASSIFICATION_PATTERNS) {
      if (rule.patterns.some(p => p.test(raw))) {
        return {
          raw_message: raw.slice(0, 300), // cap length
          bucket: rule.bucket,
          is_commercial_impact: rule.commercial,
          confidence: 70,
        };
      }
    }
    return {
      raw_message: raw.slice(0, 300),
      bucket: 'general_runtime' as RuntimeErrorBucket,
      is_commercial_impact: false,
      confidence: 40,
    };
  });
}

// ── Phase 2B: Mobile Scenario Builders ──────────

export function buildMobileCommercialScenario(targetUrl: string): VerificationScenario {
  return {
    name: 'mobile_commercial_path',
    steps: [
      { type: 'navigate', url: targetUrl },
      { type: 'screenshot', label: 'mobile_homepage' },
      { type: 'wait_ms', ms: 2000 },
      { type: 'screenshot', label: 'mobile_after_load' },
    ],
  };
}

// ── Phase 2D: Network Analysis Types ──────────

/**
 * Business classification of a captured network request.
 * NOT raw DevTools output — commercially interpreted.
 */
export type NetworkRequestRole =
  | 'payment_critical'        // Stripe, PayPal, checkout API, payment SDK
  | 'measurement_critical'    // GA, GTM, pixels, analytics
  | 'trust_reassurance'       // support widgets, trust badges, reviews
  | 'commerce_content'        // product images, pricing, cart API
  | 'third_party_dependency'  // external scripts, CDNs, fonts
  | 'first_party'             // same-domain requests
  | 'non_essential';          // ads, social widgets, non-commercial

export interface CapturedNetworkRequest {
  url: string;
  host: string;
  resource_type: string;         // script, xhr, fetch, document, stylesheet, image, font
  method: string;                // GET, POST
  is_first_party: boolean;
  role: NetworkRequestRole;
  status: number | null;         // null if request failed before response
  failed: boolean;
  failure_reason: string | null;
  duration_ms: number | null;    // null if incomplete
  started_at_ms: number;         // relative to page load start
  is_commercial_surface: boolean; // whether the page URL is commercial
}

/**
 * Aggregated network analysis for a verification run.
 * Business-focused summary, not raw HAR.
 */
export interface NetworkAnalysisSummary {
  page_url: string;
  viewport: 'desktop' | 'mobile';
  total_requests: number;
  total_failed: number;
  total_third_party: number;
  total_duration_ms: number;
  /** Payment-critical request stats */
  payment_requests: { total: number; failed: number; avg_duration_ms: number; slowest_ms: number };
  /** Measurement-critical request stats */
  measurement_requests: { total: number; failed: number; avg_duration_ms: number };
  /** Trust/reassurance request stats */
  trust_requests: { total: number; failed: number; avg_duration_ms: number; latest_start_ms: number };
  /** Third-party dependency stats */
  third_party: { total: number; failed: number; total_weight_ms: number };
  /** Commerce content stats */
  commerce_content: { total: number; failed: number; avg_duration_ms: number };
  /** Timing thresholds */
  page_interactive_ms: number | null;  // time to first meaningful interaction
  slowest_critical_request_ms: number;
  /** Classified problem events */
  problems: NetworkProblem[];
}

export type NetworkProblemType =
  | 'payment_request_failure'
  | 'payment_request_slow'
  | 'measurement_request_failure'
  | 'measurement_request_late'
  | 'trust_asset_late_load'
  | 'third_party_failure'
  | 'third_party_excessive_weight'
  | 'commerce_content_failure'
  | 'critical_dependency_stall';

export interface NetworkProblem {
  type: NetworkProblemType;
  url: string;
  host: string;
  role: NetworkRequestRole;
  detail: string;
  severity: 'high' | 'medium' | 'low';
}

// ── Network Request Classification ──────────

const PAYMENT_PATTERNS = /stripe|paypal|braintree|adyen|square|mercadopago|pagseguro|klarna|checkout\.com|pay\.|billing|mollie|razorpay/i;
const MEASUREMENT_PATTERNS = /google-analytics|googletagmanager|analytics\.google|gtag|fbq|facebook.*pixel|segment\.io|segment\.com|mixpanel|amplitude|posthog|hotjar|plausible|matomo|clarity\.ms|doubleclick|googlesyndication/i;
const TRUST_PATTERNS = /intercom|zendesk|drift|crisp|tidio|tawk|livechat|freshworks|freshdesk|trustpilot|reviews\.io|yotpo|judge\.me|stamped|onetrust|cookiebot|didomi|termly/i;
const COMMERCE_CONTENT_PATTERNS = /\/api\/(cart|product|pricing|order|checkout|catalog)/i;
const COMMERCIAL_PAGE_PATTERNS = /checkout|cart|pay|payment|billing|order|purchase|pricing|comprar|pedido|carrinho|carrito|pagamento/i;

export function classifyNetworkRequest(
  url: string,
  resourceType: string,
  pageUrl: string,
  rootDomain: string,
): NetworkRequestRole {
  const host = extractHost(url);
  const isFirstParty = host === rootDomain || host.endsWith(`.${rootDomain}`);

  if (PAYMENT_PATTERNS.test(url) || PAYMENT_PATTERNS.test(host)) return 'payment_critical';
  if (MEASUREMENT_PATTERNS.test(url) || MEASUREMENT_PATTERNS.test(host)) return 'measurement_critical';
  if (TRUST_PATTERNS.test(url) || TRUST_PATTERNS.test(host)) return 'trust_reassurance';
  if (COMMERCE_CONTENT_PATTERNS.test(url)) return 'commerce_content';
  if (isFirstParty) return 'first_party';
  if (resourceType === 'script' || resourceType === 'xhr' || resourceType === 'fetch') return 'third_party_dependency';
  return 'non_essential';
}

export function isCommercialPage(url: string): boolean {
  return COMMERCIAL_PAGE_PATTERNS.test(url);
}

function extractHost(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * Analyze captured requests and produce a business-focused summary.
 */
export function buildNetworkAnalysisSummary(
  requests: CapturedNetworkRequest[],
  pageUrl: string,
  viewport: 'desktop' | 'mobile',
  pageInteractiveMs: number | null,
): NetworkAnalysisSummary {
  const problems: NetworkProblem[] = [];

  const paymentReqs = requests.filter(r => r.role === 'payment_critical');
  const measurementReqs = requests.filter(r => r.role === 'measurement_critical');
  const trustReqs = requests.filter(r => r.role === 'trust_reassurance');
  const thirdPartyReqs = requests.filter(r => !r.is_first_party);
  const commerceReqs = requests.filter(r => r.role === 'commerce_content');

  const avgDuration = (reqs: CapturedNetworkRequest[]) => {
    const completed = reqs.filter(r => r.duration_ms !== null);
    return completed.length === 0 ? 0 : Math.round(completed.reduce((s, r) => s + r.duration_ms!, 0) / completed.length);
  };

  // Detect problems
  const SLOW_THRESHOLD_MS = 3000;
  const LATE_TRUST_THRESHOLD_MS = 5000;

  for (const r of paymentReqs) {
    if (r.failed) {
      problems.push({ type: 'payment_request_failure', url: r.url, host: r.host, role: r.role, detail: r.failure_reason || 'Request failed', severity: 'high' });
    } else if (r.duration_ms && r.duration_ms > SLOW_THRESHOLD_MS) {
      problems.push({ type: 'payment_request_slow', url: r.url, host: r.host, role: r.role, detail: `${r.duration_ms}ms response time`, severity: 'medium' });
    }
  }

  for (const r of measurementReqs) {
    if (r.failed) {
      problems.push({ type: 'measurement_request_failure', url: r.url, host: r.host, role: r.role, detail: r.failure_reason || 'Request failed', severity: 'medium' });
    } else if (r.started_at_ms > LATE_TRUST_THRESHOLD_MS) {
      problems.push({ type: 'measurement_request_late', url: r.url, host: r.host, role: r.role, detail: `Started ${r.started_at_ms}ms after page load`, severity: 'low' });
    }
  }

  for (const r of trustReqs) {
    if (r.failed) {
      problems.push({ type: 'third_party_failure', url: r.url, host: r.host, role: r.role, detail: r.failure_reason || 'Trust asset failed to load', severity: 'medium' });
    } else if (r.started_at_ms > LATE_TRUST_THRESHOLD_MS) {
      problems.push({ type: 'trust_asset_late_load', url: r.url, host: r.host, role: r.role, detail: `Started ${r.started_at_ms}ms after page load`, severity: 'medium' });
    }
  }

  for (const r of thirdPartyReqs) {
    if (r.failed && r.role !== 'non_essential') {
      problems.push({ type: 'third_party_failure', url: r.url, host: r.host, role: r.role, detail: r.failure_reason || 'Third-party request failed', severity: r.role === 'payment_critical' ? 'high' : 'medium' });
    }
  }

  const totalThirdPartyWeight = thirdPartyReqs.filter(r => r.duration_ms !== null).reduce((s, r) => s + r.duration_ms!, 0);
  if (thirdPartyReqs.length > 20 && totalThirdPartyWeight > 10000) {
    problems.push({ type: 'third_party_excessive_weight', url: pageUrl, host: '', role: 'third_party_dependency', detail: `${thirdPartyReqs.length} third-party requests totaling ${totalThirdPartyWeight}ms`, severity: 'medium' });
  }

  const allDurations = requests.filter(r => r.duration_ms !== null).map(r => r.duration_ms!);
  const slowestCritical = paymentReqs.concat(commerceReqs).filter(r => r.duration_ms !== null).map(r => r.duration_ms!);

  return {
    page_url: pageUrl,
    viewport,
    total_requests: requests.length,
    total_failed: requests.filter(r => r.failed).length,
    total_third_party: thirdPartyReqs.length,
    total_duration_ms: allDurations.length > 0 ? Math.max(...allDurations) : 0,
    payment_requests: {
      total: paymentReqs.length,
      failed: paymentReqs.filter(r => r.failed).length,
      avg_duration_ms: avgDuration(paymentReqs),
      slowest_ms: paymentReqs.filter(r => r.duration_ms !== null).reduce((m, r) => Math.max(m, r.duration_ms!), 0),
    },
    measurement_requests: {
      total: measurementReqs.length,
      failed: measurementReqs.filter(r => r.failed).length,
      avg_duration_ms: avgDuration(measurementReqs),
    },
    trust_requests: {
      total: trustReqs.length,
      failed: trustReqs.filter(r => r.failed).length,
      avg_duration_ms: avgDuration(trustReqs),
      latest_start_ms: trustReqs.reduce((m, r) => Math.max(m, r.started_at_ms), 0),
    },
    third_party: {
      total: thirdPartyReqs.length,
      failed: thirdPartyReqs.filter(r => r.failed).length,
      total_weight_ms: totalThirdPartyWeight,
    },
    commerce_content: {
      total: commerceReqs.length,
      failed: commerceReqs.filter(r => r.failed).length,
      avg_duration_ms: avgDuration(commerceReqs),
    },
    page_interactive_ms: pageInteractiveMs,
    slowest_critical_request_ms: slowestCritical.length > 0 ? Math.max(...slowestCritical) : 0,
    problems,
  };
}

export function validateBrowserRequest(req: BrowserVerificationRequest): string | null {
  if (req.scenarios.length === 0) return 'At least one scenario is required';
  if (req.scenarios.length > BROWSER_LIMITS.max_scenarios) return `Max ${BROWSER_LIMITS.max_scenarios} scenarios`;

  let totalSteps = 0;
  let totalScreenshots = 0;
  for (const s of req.scenarios) {
    totalSteps += s.steps.length;
    totalScreenshots += s.steps.filter(st => st.type === 'screenshot').length;
  }

  if (totalSteps > BROWSER_LIMITS.max_steps_per_run) return `Max ${BROWSER_LIMITS.max_steps_per_run} steps per run`;
  if (totalScreenshots > BROWSER_LIMITS.max_screenshots) return `Max ${BROWSER_LIMITS.max_screenshots} screenshots`;

  if (!req.target.url) return 'Target URL is required';

  return null;
}
