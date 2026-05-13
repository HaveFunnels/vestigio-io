import { URL } from 'url';
import { httpFetch, HttpResponse } from './http-client';
import { parsePage, ParsedPage, getRootDomain, detectAbTestPlatform } from './parser';
import {
  Evidence, EvidenceType, SourceKind, CollectionMethod,
  FreshnessState, Scoping, Freshness,
  HttpResponsePayload, PageContentPayload, RedirectPayload,
  ScriptPayload, FormPayload, CheckoutIndicatorPayload,
  ProviderIndicatorPayload, PolicyPagePayload, PlatformIndicatorPayload,
} from '../../packages/domain';
import {
  computeClassification, extractClassificationInput, ClassificationState,
} from '../../packages/classification';
import {
  CrawlSession, DEFAULT_CONSTRAINTS, hashContent, shouldTriggerPlaywright,
  type CrawlConstraints,
} from './crawl-constraints';
import { runEnrichmentPasses } from './enrichment/runner';
import { canonicalUrl as canonicalUrlShared, urlMatchesExclusion } from '../../packages/url-normalize';
import { renderForIngestion } from './playwright-renderer';

// ──────────────────────────────────────────────
// Staged Pipeline — Progressive Analysis
//
// 4 stages for fast time-to-value:
//
// A: Bootstrap Discovery (0–3s) — root fetch + parse
// B: First Value Synthesis (<10s) — initial classification + first findings
// C: Prioritized Crawl — high-value surfaces only
// D: Selective Headless — Playwright for SPAs/ambiguity
//
// Emits events via callback for SSE streaming.
// ──────────────────────────────────────────────

export type PipelineStage =
  | 'bootstrap'
  | 'first_value'
  | 'crawl'
  | 'headless'
  // Enrichment passes (katana, nuclei, semantic) run after crawl + headless
  // and emit progress events via EnrichmentContext.emit — adding the stage
  // here keeps their events well-typed.
  | 'enrichment'
  | 'complete';

export interface PipelineEvent {
  type:
    | 'step'
    | 'finding_ready'
    | 'score_update'
    | 'coverage_update'
    | 'stage_complete'
    // Emitted by enrichment passes for "running X…" status updates in the
    // streaming progress UI. Distinct from `step` (bound to the fixed
    // staged-pipeline step sequence).
    | 'stage_progress'
    | 'challenge_detected'
    | 'complete';
  stage: PipelineStage;
  data: any;
  timestamp: Date;
}

// Where a URL was first surfaced from. Drives the "Source" badge in
// the inventory table and lets us answer "how did this page end up in
// the crawl?". Each candidate gets stamped at the moment we add it to
// the queue; later sightings of the same URL keep the first-seen
// source so users see the most authoritative origin.
export type DiscoverySource =
  | 'homepage'         // the root URL itself
  | 'homepage_link'    // <a> anchored from the homepage
  | 'critical_path'    // speculative critical-path probe (/checkout, /cart, etc.)
  | 'sitemap'          // /sitemap.xml (or sitemap-index child)
  | 'robots_txt'       // /robots.txt
  | 'redirect'         // destination of a redirect chain
  | 'pagination'       // rel=next / numbered-pagination link
  | 'internal_link'    // <a> from a non-homepage crawled page
  | 'behavioral_event' // sent from the in-browser pixel
  | 'manual';          // user-added (admin form, API)

// Why a discovered URL did not get persisted as a fetched surface.
// `null` (or absent) means the URL was either successfully fetched OR
// is still pending. Surfaced in the inventory "Why skipped?" column
// so customers can tell apart "we tried and failed" from "we never
// tried" and reason about coverage gaps.
export type SkipReason =
  | 'over_budget'      // max_pages_per_domain reached before we got here
  | 'excluded'         // matched a user-supplied exclusion pattern
  | 'deduped'          // canonical URL already fetched this cycle
  | 'loop_detected'    // content hash matched another already-fetched URL
  | 'challenge'        // Cloudflare/recaptcha/datadome blocked the fetch
  | 'asset'            // non-HTML response (PDF, image, …)
  | 'fetch_failed'     // network error (timeout, DNS, connection refused)
  | 'disallowed'       // robots.txt Disallow rule
  | 'aborted';         // crawl session aborted before reaching this URL

export interface CoverageEntry {
  url: string;
  discovered: boolean;
  validated: boolean;
  critical: boolean;
  confidence: number;
  /** Where this URL was first surfaced. */
  discoverySource?: DiscoverySource;
  /** Set when validated=false to explain why. */
  skipReason?: SkipReason;
  /** Detected A/B test platform on this page, if any (Optimizely, VWO, …). */
  abTestPlatform?: string | null;
}

export interface CoverageSummary {
  score: number;       // 0-100
  total_routes: number;
  validated_routes: number;
  critical_routes: number;
  critical_validated: number;
  gaps: string[];
  challenged: boolean;
  challenge_type: string | null;
}

// Crawl modes — controls which stages run and how aggressively.
//
// 'full'         — Stage A + B + C. Up to 30 pages, 60s budget. Default.
//                  Used by post-payment audit-runner.
// 'shallow_plus' — Stage A + truncated C. ~5 critical pages, 15s budget.
//                  Used by Growth admin prospect audits.
// 'shallow'      — Stage A only. 1 fetch (landing), 5s budget.
//                  Used by /lp/audit anonymous mini-audit.
//
// All modes share the same parser, same evidence shape, same coverage
// structure — only the stage gating + constraints differ. This means
// downstream consumers (mini-audit findings, full inferences) see
// uniform data and can be composed freely.
export type PipelineMode = 'full' | 'shallow_plus' | 'shallow';

export interface StagedPipelineInput {
  domain: string;
  workspace_ref: string;
  environment_ref: string;
  website_ref: string;
  cycle_ref: string;
  onboarding_business_model?: string;
  onboarding_conversion_model?: string;
  crawl_constraints?: Partial<CrawlConstraints>;
  mode?: PipelineMode;
  // Wave 5 Fase 3 — Optional URL allow-list. When provided, the Stage C
  // crawl loop only fetches URLs that appear in this set (the home/
  // critical-path seeds are still added by discovery, so this acts as a
  // filter, not a replacement). Used by hot + warm cycles to scope the
  // crawl to critical surfaces (hot) or critical + a rotating sample
  // (warm). Leaving this undefined means "crawl everything the
  // discovery finds", which is the cold cycle behavior.
  url_filter?: string[];
  // User-configured glob patterns (e.g. "/admin/*", "*.pdf") to exclude
  // from discovery + crawl. Stored on Environment.crawlExcludePatterns and
  // applied here so the audit-runner doesn't need to know about glob
  // syntax. Empty/undefined = no exclusions.
  exclude_patterns?: string[];
  // Per-cycle Playwright render budget. When set > 0, the pipeline
  // promotes SPA pages (detected by shouldTriggerPlaywright) by
  // re-fetching them with a headless browser and re-parsing the
  // rendered HTML. The budget protects against runaway cost — we stop
  // promoting once it's exhausted. Defaults to 0 (no Playwright in
  // ingestion), which preserves the legacy behavior.
  playwright_budget?: number;
}

// Constraint overrides per mode. Anything not set falls back to
// DEFAULT_CONSTRAINTS. The user-supplied crawl_constraints still wins
// over the mode preset (gives the audit-runner an escape hatch).
const MODE_CONSTRAINTS: Record<PipelineMode, Partial<CrawlConstraints>> = {
  full: {
    max_pages_per_domain: 30,
    global_timeout_ms: 60_000,
  },
  shallow_plus: {
    max_pages_per_domain: 6,
    global_timeout_ms: 15_000,
    per_request_timeout_ms: 5_000,
  },
  shallow: {
    max_pages_per_domain: 1,
    global_timeout_ms: 5_000,
    per_request_timeout_ms: 5_000,
  },
};

export interface SurfaceRelationEntry {
  sourceUrl: string;
  targetUrl: string;
  relationType: string;
  sourceHost: string;
  targetHost: string;
  isSameDomain: boolean;
  linkText?: string | null;
  position?: string;
}

export interface StagedPipelineResult {
  evidence: Evidence[];
  classification: ClassificationState;
  coverage: CoverageSummary;
  // Per-URL coverage data — exposed so the audit-runner worker can persist
  // PageInventoryItem rows. Existing callers (the SSE stream route) can ignore this.
  coverage_entries: CoverageEntry[];
  // Internal link graph — persisted as SurfaceRelation records by audit-runner.
  surface_relations: SurfaceRelationEntry[];
  stages_completed: PipelineStage[];
  errors: { url: string; error: string }[];
  duration_ms: number;
  // Diagnostic counters surfaced for telemetry (run-cycle logs these).
  excluded_urls?: number;
  playwright_renders?: number;
  playwright_skipped_budget?: number;
  playwright_avg_ms?: number;
}

// Challenge detection patterns
const CHALLENGE_PATTERNS = [
  { type: 'cloudflare', pattern: /cloudflare|cf-ray|__cf_bm/i },
  { type: 'recaptcha', pattern: /recaptcha|g-recaptcha/i },
  { type: 'hcaptcha', pattern: /hcaptcha/i },
  { type: 'datadome', pattern: /datadome/i },
  { type: 'akamai', pattern: /akamai|_abck/i },
  { type: 'rate_limit', pattern: /429|rate.?limit/i },
];

// Step messages — commercial, human language
export const PIPELINE_STEPS = [
  'Getting familiar with your business',
  'Mapping your website structure',
  'Understanding how users enter your funnel',
  'Looking at how you guide people to take action',
  'Checking trust and credibility signals',
  'Reviewing how money flows through your pages',
  'Analyzing your checkout integrity',
  'Evaluating conversion path clarity',
  'Inspecting policy coverage',
  'Detecting friction points',
  'Spotting missed opportunities',
  'Measuring analytics coverage',
  'Looking for trust continuity',
  'Reviewing payment provider setup',
  'Checking for revenue leakage',
  'Analyzing expectation alignment',
  'Evaluating support accessibility',
  'Scanning for security signals',
  'Reviewing redirect behavior',
  'Checking mobile readiness indicators',
  'Analyzing page load performance',
  'Detecting external dependencies',
  'Reviewing form structures',
  'Checking CTA clarity',
  'Analyzing competitive trust signals',
  'Reviewing pricing transparency',
  'Detecting chargeback risk factors',
  'Evaluating post-purchase guidance',
  'Checking refund policy coverage',
  'Analyzing customer journey flow',
  'Detecting abandoned cart signals',
  'Reviewing shipping information',
  'Checking social proof presence',
  'Analyzing contact accessibility',
  'Detecting measurement blind spots',
  'Reviewing funnel entry points',
  'Analyzing trust boundary crossings',
  'Checking domain consistency',
  'Evaluating platform signals',
  'Detecting provider integrations',
  'Analyzing cross-domain handoffs',
  'Reviewing error handling',
  'Checking form validation',
  'Analyzing navigation structure',
  'Detecting broken links',
  'Reviewing meta information',
  'Analyzing content structure',
  'Checking accessibility basics',
  'Putting everything together',
  'Finalizing your analysis',
];

// UUID-backed evidence IDs so two parallel workers cannot mint the same
// key. The previous Date.now()+counter form raced on multi-replica
// deploys where two processes could legitimately fire the same
// millisecond with the same in-process counter value, producing a
// Prisma unique-key violation that we were swallowing.
import { randomUUID } from 'crypto';
function nextId(): string {
  return `ev_stg_${randomUUID()}`;
}

/**
 * Run the staged pipeline with event emission for SSE.
 */
export async function runStagedPipeline(
  input: StagedPipelineInput,
  emit: (event: PipelineEvent) => void,
): Promise<StagedPipelineResult> {
  const startTime = Date.now();
  const evidence: Evidence[] = [];
  const surfaceRelations: SurfaceRelationEntry[] = [];
  const errors: { url: string; error: string }[] = [];
  const coverage = new Map<string, CoverageEntry>();
  const stagesCompleted: PipelineStage[] = [];
  const rootUrl = normalizeUrl(input.domain);
  const rootDomain = getRootDomain(new URL(rootUrl).hostname);
  const scoping = buildScoping(input);
  // Resolve mode + merge constraints. Order: defaults → mode preset →
  // explicit user override (so callers can still tighten per-call).
  const mode: PipelineMode = input.mode || 'full';
  const modeConstraints = MODE_CONSTRAINTS[mode] || {};
  const crawlSession = new CrawlSession(rootDomain, {
    ...DEFAULT_CONSTRAINTS,
    ...modeConstraints,
    ...input.crawl_constraints,
  });
  // User-configured exclusion globs (e.g. "/admin/*"). Empty array when
  // unset — `urlMatchesExclusion` is a fast no-op in that case.
  const excludePatterns: string[] = (input.exclude_patterns || []).filter(p => p && p.trim().length > 0);
  let excludedCount = 0;
  // Playwright budget tracking. Per-domain cap is a defense-in-depth
  // limit so a site that's 100% client-rendered can't burn the entire
  // budget on one host while leaving other domains starved.
  const playwrightBudget = Math.max(0, input.playwright_budget ?? 0);
  let playwrightUsed = 0;
  let playwrightSkippedBudget = 0;
  const playwrightDurations: number[] = [];
  const playwrightPerDomain = new Map<string, number>();
  const PLAYWRIGHT_PER_DOMAIN_CAP = 3;
  const PLAYWRIGHT_TIMEOUT_MS = 15_000;
  let stepIndex = 0;

  const emitStep = (message?: string) => {
    const msg = message || PIPELINE_STEPS[stepIndex % PIPELINE_STEPS.length];
    emit({ type: 'step', stage: getCurrentStage(stagesCompleted), data: { message: msg, index: stepIndex }, timestamp: new Date() });
    stepIndex++;
  };

  // ══════════════════════════════════════════════
  // STAGE A — Bootstrap Discovery (0–3s)
  // ══════════════════════════════════════════════
  emitStep('Getting familiar with your business');

  let homepageResponse: HttpResponse | null = null;
  let homepageParsed: ParsedPage | null = null;

  try {
    homepageResponse = await httpFetch(rootUrl);

    // Challenge detection
    const challengeType = detectChallenge(homepageResponse);
    if (challengeType) {
      emit({ type: 'challenge_detected', stage: 'bootstrap', data: { challenge_type: challengeType, url: rootUrl }, timestamp: new Date() });
    }

    homepageParsed = parsePage(homepageResponse.body, homepageResponse.final_url);

    // Emit bootstrap evidence
    addHttpEvidence(evidence, homepageResponse, rootUrl, scoping, input.cycle_ref);
    addPageContentEvidence(evidence, homepageParsed, homepageResponse.final_url, scoping, input.cycle_ref);
    addScriptEvidence(evidence, homepageParsed, homepageResponse.final_url, scoping, input.cycle_ref);
    addFormEvidence(evidence, homepageParsed, homepageResponse.final_url, scoping, input.cycle_ref);

    // Collect homepage surface relations (Stage A runs BEFORE the batch loop
    // in Stage C where normal pages have their links collected. Without this,
    // the homepage — typically the most important funnel origin — has 0 outbound
    // edges in the user journey map.)
    for (const link of homepageParsed.links) {
      if (!link.is_external && link.href) {
        surfaceRelations.push({
          sourceUrl: homepageResponse.final_url,
          targetUrl: link.href,
          relationType: 'anchor',
          sourceHost: homepageParsed.host,
          targetHost: link.target_host || homepageParsed.host,
          isSameDomain: true,
          linkText: link.text,
          position: link.position,
        });
      }
    }
    for (const form of homepageParsed.forms) {
      if (form.action && !form.is_external) {
        surfaceRelations.push({
          sourceUrl: homepageResponse.final_url,
          targetUrl: form.action,
          relationType: 'form_action',
          sourceHost: homepageParsed.host,
          targetHost: form.target_host || homepageParsed.host,
          isSameDomain: true,
          linkText: null,
          position: 'main',
        });
      }
    }

    const homepageAbTest = detectAbTestPlatform(homepageParsed);
    coverage.set(rootUrl, { url: rootUrl, discovered: true, validated: true, critical: true, confidence: 80, discoverySource: 'homepage', abTestPlatform: homepageAbTest });
  } catch (err) {
    errors.push({ url: rootUrl, error: err instanceof Error ? err.message : String(err) });
    emit({ type: 'stage_complete', stage: 'bootstrap', data: { success: false, error: errors[0].error }, timestamp: new Date() });
    return buildResult(evidence, input, coverage, stagesCompleted, errors, startTime);
  }

  stagesCompleted.push('bootstrap');
  emit({ type: 'stage_complete', stage: 'bootstrap', data: { evidence_count: evidence.length, routes: 1 }, timestamp: new Date() });

  // Shallow mode short-circuit — landing-only mini-audit. Skip stages B,
  // C, D entirely and return what we have. This is the /lp/audit path:
  // we want preview data + ~5 derived findings from a single fetch.
  if (mode === 'shallow') {
    detectPlatforms(evidence, homepageResponse!, homepageParsed!, scoping, input.cycle_ref);
    extractIndicators(homepageParsed!, homepageResponse!.final_url, scoping, input.cycle_ref, evidence);
    stagesCompleted.push('complete');
    emit({ type: 'complete', stage: 'complete', data: {
      total_evidence: evidence.length,
      total_pages: 1,
      duration_ms: Date.now() - startTime,
      coverage: buildCoverageSummary(coverage),
    }, timestamp: new Date() });
    return buildResult(evidence, input, coverage, stagesCompleted, errors, startTime);
  }

  emitStep('Mapping your website structure');

  // ══════════════════════════════════════════════
  // STAGE B — First Value Synthesis (<10s)
  // ══════════════════════════════════════════════

  // Extract checkout, policy, provider indicators from homepage
  extractIndicators(homepageParsed!, homepageResponse!.final_url, scoping, input.cycle_ref, evidence);

  // Try sitemap.xml and robots.txt (non-blocking, fast).
  // Skipped in shallow_plus mode to keep the budget tight.
  let sitemapUrls: string[] = [];
  if (mode === 'full') {
    emitStep('Understanding how users enter your funnel');
    sitemapUrls = await tryFetchMeta(rootUrl, scoping, input.cycle_ref, evidence, errors, coverage);
  }

  // Compute initial classification
  const classInput = extractClassificationInput(
    evidence,
    input.onboarding_business_model || null,
    input.onboarding_conversion_model || null,
  );
  const classification = computeClassification(classInput);

  emit({ type: 'score_update', stage: 'first_value', data: {
    classification_primary: classification.primary_model,
    confidence_level: classification.confidence_level,
    evidence_count: evidence.length,
  }, timestamp: new Date() });

  stagesCompleted.push('first_value');
  emit({ type: 'stage_complete', stage: 'first_value', data: {
    classification,
    evidence_count: evidence.length,
  }, timestamp: new Date() });

  // ══════════════════════════════════════════════
  // STAGE C — Prioritized Crawl
  // ══════════════════════════════════════════════

  emitStep('Looking at how you guide people to take action');

  // Discover high-value candidates
  const criticalPaths = ['/checkout', '/cart', '/login', '/contact', '/pricing',
    '/privacy', '/terms', '/refund-policy', '/return-policy', '/shipping', '/about'];

  let candidates = discoverHighValueCandidates(homepageParsed!, rootDomain, rootUrl, criticalPaths, mode);

  // Merge sitemap-discovered URLs into the candidate list. These are
  // added AFTER the homepage-link candidates so that speculative
  // critical paths and actually-linked pages get priority. Dedup
  // against existing candidates to avoid double-fetching. Sitemap-
  // sourced URLs are tagged so the inventory column can attribute
  // them correctly.
  if (sitemapUrls.length > 0) {
    const seen = new Set<string>(candidates.map(c => normalizeUrlForDedup(c.url)));
    seen.add(normalizeUrlForDedup(rootUrl));
    for (const sUrl of sitemapUrls) {
      const key = normalizeUrlForDedup(sUrl);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ url: sUrl, source: 'sitemap' });
      }
    }
  }

  // Apply user-configured exclusion globs early so the rest of the
  // pipeline (url_filter, page caps, coverage marking) never sees the
  // excluded URLs. We retain the homepage even if it matches — without
  // it the funnel/relations layers have no anchor.
  if (excludePatterns.length > 0) {
    const homepageKey = normalizeUrlForDedup(rootUrl);
    const before = candidates.length;
    candidates = candidates.filter((c) => {
      if (normalizeUrlForDedup(c.url) === homepageKey) return true;
      return !urlMatchesExclusion(c.url, excludePatterns);
    });
    excludedCount += before - candidates.length;
  }

  // Wave 5 Fase 3 — incremental URL filter. The audit-runner resolves
  // which URLs this cycle is allowed to crawl (critical set for hot,
  // critical + rotating sample for warm, everything for cold) and
  // passes the list through `input.url_filter`. When present, the
  // filter intersects with discovered candidates — we don't crawl
  // anything outside the allow-list, but we also don't add new URLs
  // (the critical set is already covered by discovery's critical
  // paths). The homepage is always retained even if it's not in the
  // allow-list because it's the entry point for all downstream
  // structure + inventory reconciliation.
  //
  // IMPORTANT (Fase 3 fix #4): the filter runs BEFORE the shallow_plus
  // slice. Otherwise the slice caps candidates at 5 regardless of how
  // many promoted critical URLs we want to cover, silently dropping
  // them. With the filter applied first, the slice only trims the
  // tail if the allow-list is larger than the per-mode page cap —
  // and even then the allow-list is ordered (hot = all critical first,
  // warm = critical first then rotation sample) so the most important
  // URLs survive.
  if (input.url_filter && input.url_filter.length > 0) {
    // Fase 3 fix #7 — compare in canonical form. Callers are expected
    // to pass a canonical allow-list (run-cycle.ts canonicalizes); we
    // canonicalize the candidates here so trailing slash / query-string
    // variation doesn't silently drop matches. Kept inline to avoid
    // cross-package dependency from workers/ingestion → apps/audit-runner.
    const canon = (u: string): string => {
      try {
        const parsed = new URL(u);
        parsed.search = "";
        parsed.hash = "";
        parsed.hostname = parsed.hostname.toLowerCase();
        let out = parsed.toString();
        if (parsed.pathname !== "/" && out.endsWith("/")) out = out.slice(0, -1);
        return out;
      } catch {
        return u.trim().toLowerCase();
      }
    };
    const allow = new Set<string>(input.url_filter.map(canon));
    const homepageUrl = canon(rootUrl);
    candidates = candidates.filter((c) => {
      const cc = canon(c.url);
      return allow.has(cc) || cc === homepageUrl;
    });
  }

  // shallow_plus mode: only fetch the top 5 candidates (already prioritized
  // by discoverHighValueCandidates, so the most critical commercial paths
  // get picked). Combined with max_pages_per_domain=6 in MODE_CONSTRAINTS
  // this caps the run at 1 + 5 = 6 fetches max.
  // When url_filter is set we honor the full allow-list size + homepage
  // instead of the 5-URL slice — the runner is responsible for keeping
  // the allow-list within a reasonable bound per cycle (hot critical
  // set is already bounded, warm samples at 30% of inventory).
  if (mode === 'shallow_plus' && !input.url_filter) {
    candidates = candidates.slice(0, 5);
  }

  // Mark all candidates in coverage with their discovery source. Source
  // is sticky: later sightings of the same URL never overwrite it, so
  // the inventory always shows where the URL was *first* surfaced.
  for (const c of candidates) {
    const path = safePathname(c.url);
    const isCritical = criticalPaths.some(p => path.includes(p.slice(1)));
    coverage.set(c.url, {
      url: c.url,
      discovered: true,
      validated: false,
      critical: isCritical,
      confidence: 0,
      discoverySource: c.source,
    });
  }
  // The root URL itself was marked as `homepage` earlier with no
  // source set — backfill so the inventory column has a value.
  const rootCoverage = coverage.get(rootUrl);
  if (rootCoverage && !rootCoverage.discoverySource) {
    coverage.set(rootUrl, { ...rootCoverage, discoverySource: 'homepage' });
  }

  emit({ type: 'coverage_update', stage: 'crawl', data: buildCoverageSummary(coverage), timestamp: new Date() });

  // Fetch high-value pages with step emissions (constrained by CrawlSession).
  // Every "skip" branch below stamps a `skipReason` on the coverage entry
  // so the inventory can explain why a discovered URL didn't get persisted.
  let fetchCount = 0;
  let spaDetected = false;
  for (const c of candidates) {
    const url = c.url;
    // User-supplied exclusion gate (also enforced at discovery, but a
    // defense-in-depth check here catches URLs added via late merges
    // and keeps a clear "excluded" marker in coverage).
    if (excludePatterns.length > 0 && urlMatchesExclusion(url, excludePatterns)) {
      const existing = coverage.get(url);
      coverage.set(url, {
        url,
        discovered: existing?.discovered ?? true,
        validated: false,
        critical: existing?.critical ?? false,
        confidence: 0,
        discoverySource: existing?.discoverySource ?? c.source,
        skipReason: 'excluded',
      });
      excludedCount++;
      continue;
    }

    // Crawl constraint check (over budget, dedup, global timeout, abort)
    const canFetch = crawlSession.canFetch(url);
    if (!canFetch.allowed) {
      // Translate CrawlSession's prose reason into a structured tag
      // so the UI can render it. The session only returns a string,
      // so we pattern-match keywords from canFetch.reason.
      const reason = canFetch.reason ?? '';
      const tag: SkipReason =
        /global timeout|aborted/i.test(reason) ? 'aborted'
        : /max pages/i.test(reason) ? 'over_budget'
        : /dedup/i.test(reason) ? 'deduped'
        : 'over_budget';
      coverage.set(url, { ...coverage.get(url)!, validated: false, confidence: 0, skipReason: tag });
      continue;
    }

    if (crawlSession.isAborted()) break;

    if (fetchCount % 3 === 0) {
      emitStep();
    }

    try {
      const response = await httpFetch(url);

      // Record in session for dedup
      const cHash = hashContent(response.body || '');
      crawlSession.recordFetch(url, cHash);

      // Loop detection — if same content as another URL, skip
      if (crawlSession.isLoopDetected(url, cHash)) {
        coverage.set(url, { ...coverage.get(url)!, validated: false, confidence: 5, skipReason: 'loop_detected' });
        continue;
      }

      // Challenge detection per page
      const challenge = detectChallenge(response);
      if (challenge) {
        emit({ type: 'challenge_detected', stage: 'crawl', data: { challenge_type: challenge, url }, timestamp: new Date() });
        coverage.set(url, { ...coverage.get(url)!, validated: false, confidence: 10, skipReason: 'challenge' });
        continue;
      }

      const isHtml = response.content_type?.includes('text/html');
      if (isHtml) {
        // Initial parse against the raw HTTP response body. We may
        // replace `parsed` + `finalHtml` below with a Playwright-
        // rendered version when the page looks like a thin SPA shell.
        let parsed = parsePage(response.body, response.final_url);
        let finalHtml = response.body;
        let finalUrlForExtractors = response.final_url;
        let renderedViaPlaywright = false;

        // SPA detection — flag for downstream consumers AND promote to
        // a Playwright render when budget allows. Without this, JS-
        // hydrated pages are seen as a near-empty shell and downstream
        // classification mis-types them.
        const looksLikeSpa = shouldTriggerPlaywright(response.body, parsed.scripts.length, response.body.length);
        if (looksLikeSpa) {
          spaDetected = true;
          emit({ type: 'step', stage: 'crawl', data: { message: 'Detected JavaScript-heavy page — headless verification may be needed', index: stepIndex }, timestamp: new Date() });

          if (playwrightBudget > 0) {
            const domainKey = parsed.host || rootDomain;
            const perDomainUsed = playwrightPerDomain.get(domainKey) ?? 0;
            if (playwrightUsed >= playwrightBudget) {
              playwrightSkippedBudget++;
            } else if (perDomainUsed >= PLAYWRIGHT_PER_DOMAIN_CAP) {
              playwrightSkippedBudget++;
            } else {
              const render = await renderForIngestion(response.final_url, {
                timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
                waitUntil: 'networkidle',
              });
              playwrightUsed++;
              playwrightPerDomain.set(domainKey, perDomainUsed + 1);
              playwrightDurations.push(render.durationMs);
              if (render.success && render.html && render.html.length > response.body.length) {
                // The rendered DOM is strictly richer than the raw HTML
                // we started with — swap. Re-parse so extractors see
                // the hydrated structure (forms, scripts, links, etc.).
                finalHtml = render.html;
                finalUrlForExtractors = render.finalUrl || response.final_url;
                parsed = parsePage(finalHtml, finalUrlForExtractors);
                renderedViaPlaywright = true;
              }

              // Always log a small PlaywrightRender evidence row so we
              // can audit per-URL Playwright behavior later. We keep
              // the body out of the payload (would balloon Postgres);
              // the HttpResponse evidence above stores the raw HTML
              // and `addPageContentEvidence` below stores the chosen
              // parsed content. This row is the bridge.
              evidence.push(createEvidence(
                EvidenceType.PlaywrightRender,
                `surface:${response.final_url}`,
                scoping,
                input.cycle_ref,
                {
                  type: 'playwright_render',
                  url: response.final_url,
                  rendered_url: render.finalUrl,
                  success: render.success,
                  rendered: renderedViaPlaywright,
                  status_code: render.statusCode,
                  content_type: render.contentType,
                  console_error_count: render.consoleErrorCount,
                  console_error_samples: render.consoleErrorSamples,
                  duration_ms: render.durationMs,
                  raw_body_length: response.body.length,
                  rendered_body_length: render.html.length,
                  error: render.error ?? null,
                },
              ));
            }
          }
        }

        // Wave 5 Fase 3: attach the content hash the session already
        // computed so the evidence row carries it to Postgres. The
        // incremental runner reads this to decide whether to re-parse
        // the page or carry forward the previous cycle's evidence.
        addHttpEvidence(evidence, response, url, scoping, input.cycle_ref, cHash);
        addPageContentEvidence(evidence, parsed, finalUrlForExtractors, scoping, input.cycle_ref);
        addScriptEvidence(evidence, parsed, finalUrlForExtractors, scoping, input.cycle_ref);
        addFormEvidence(evidence, parsed, finalUrlForExtractors, scoping, input.cycle_ref);
        extractIndicators(parsed, finalUrlForExtractors, scoping, input.cycle_ref, evidence);

        // Collect internal links for SurfaceRelation persistence
        for (const link of parsed.links) {
          if (!link.is_external && link.href) {
            surfaceRelations.push({
              sourceUrl: finalUrlForExtractors,
              targetUrl: link.href,
              relationType: 'anchor',
              sourceHost: parsed.host,
              targetHost: link.target_host || parsed.host,
              isSameDomain: true,
              linkText: link.text,
              position: link.position,
            });
          }
        }
        // Collect form actions
        for (const form of parsed.forms) {
          if (form.action && !form.is_external) {
            surfaceRelations.push({
              sourceUrl: finalUrlForExtractors,
              targetUrl: form.action,
              relationType: 'form_action',
              sourceHost: parsed.host,
              targetHost: form.target_host || parsed.host,
              isSameDomain: true,
              linkText: null,
              position: 'main',
            });
          }
        }

        const abTestPlatform = detectAbTestPlatform(parsed);
        coverage.set(url, {
          ...coverage.get(url)!,
          validated: true,
          confidence: renderedViaPlaywright ? 85 : 75,
          skipReason: undefined,
          abTestPlatform,
        });
      } else {
        // Non-HTML response — still successful fetch, but tagged as
        // `asset` so the inventory can show "PDF / image / etc."
        // instead of pretending it's a page. Asset rows are still
        // useful for analytics so we mark validated=true.
        addHttpEvidence(evidence, response, url, scoping, input.cycle_ref, cHash);
        coverage.set(url, { ...coverage.get(url)!, validated: true, confidence: 50, skipReason: 'asset' });
      }

      // Emit progressive finding ready events
      if (fetchCount > 0 && fetchCount % 4 === 0) {
        emit({ type: 'finding_ready', stage: 'crawl', data: { evidence_count: evidence.length }, timestamp: new Date() });
      }
    } catch (err) {
      errors.push({ url, error: err instanceof Error ? err.message : String(err) });
      coverage.set(url, { ...coverage.get(url)!, validated: false, confidence: 0, skipReason: 'fetch_failed' });
    }
    fetchCount++;
  }

  // Detect platforms
  if (homepageResponse && homepageParsed) {
    detectPlatforms(evidence, homepageResponse, homepageParsed, scoping, input.cycle_ref);
  }

  stagesCompleted.push('crawl');
  emit({ type: 'stage_complete', stage: 'crawl', data: {
    pages_fetched: fetchCount + 1,
    evidence_count: evidence.length,
    coverage: buildCoverageSummary(coverage),
  }, timestamp: new Date() });

  emitStep('Putting everything together');

  // ══════════════════════════════════════════════
  // ENRICHMENT PASSES — Stage D + future passes
  // ══════════════════════════════════════════════
  //
  // Pluggable post-Stage-C passes that add evidence to the cycle.
  // First implementation is Stage D Selective Headless (Wave 1).
  // Wave 3 LLM Semantic Enrichment will plug in here without
  // touching this file — see workers/ingestion/enrichment/README.md.
  //
  // Each pass decides for itself if it should run via shouldRun(); the
  // runner is a simple defensive iterator. Pass failures are logged
  // but never crash the cycle — the audit completes with whatever
  // evidence the earlier stages produced.

  const enrichmentResults = await runEnrichmentPasses({
    evidence,
    coverage,
    scoping,
    cycle_ref: input.cycle_ref,
    root_domain: rootDomain,
    landing_url: rootUrl,
    mode,
    spa_detected: spaDetected,
    business_model: input.onboarding_business_model || null,
    conversion_model: input.onboarding_conversion_model || null,
    emit,
  });

  for (const result of enrichmentResults) {
    if (result.status === 'completed') {
      evidence.push(...result.evidence_added);
      // Stage D maps to the existing 'headless' PipelineStage marker.
      // Future enrichment passes that don't have a pre-existing stage
      // label can either reuse 'headless' or extend the PipelineStage
      // union — we keep this loose for now since the stage label is
      // mostly for SSE progress display, not load-bearing logic.
      if (result.pass_name === 'selective_headless') {
        stagesCompleted.push('headless');
      }
    }
    // Always emit a stage_complete event for observability — even on
    // skipped/failed so the SSE stream can show "Stage D: skipped (no SPA)"
    emit({
      type: 'stage_complete',
      stage: 'headless',
      data: {
        pass: result.pass_name,
        status: result.status,
        reason: result.reason,
        evidence_added: result.evidence_added.length,
        duration_ms: result.duration_ms,
        attempts: result.attempts,
      },
      timestamp: new Date(),
    });
  }

  stagesCompleted.push('complete');
  emit({ type: 'complete', stage: 'complete', data: {
    total_evidence: evidence.length,
    total_pages: coverage.size,
    duration_ms: Date.now() - startTime,
    coverage: buildCoverageSummary(coverage),
  }, timestamp: new Date() });

  const result = buildResult(evidence, input, coverage, stagesCompleted, errors, startTime, surfaceRelations);
  result.excluded_urls = excludedCount;
  result.playwright_renders = playwrightUsed;
  result.playwright_skipped_budget = playwrightSkippedBudget;
  result.playwright_avg_ms = playwrightDurations.length > 0
    ? Math.round(playwrightDurations.reduce((a, b) => a + b, 0) / playwrightDurations.length)
    : 0;
  return result;
}

// ──────────────────────────────────────────────
// Evidence builders (reuse pipeline patterns)
// ──────────────────────────────────────────────

function addHttpEvidence(evidence: Evidence[], response: HttpResponse, url: string, scoping: Scoping, cycleRef: string, contentHash?: string): void {
  const ev = createEvidence(EvidenceType.HttpResponse, url, scoping, cycleRef, {
    type: 'http_response', url: response.url, status_code: response.status_code,
    headers: response.headers, response_time_ms: response.response_time_ms,
    content_type: response.content_type, content_length: response.content_length,
  } as HttpResponsePayload);
  // Wave 5 Fase 3 — attach the body hash so the incremental runner can
  // look up "did this page change since the last cycle?" without having
  // to re-parse. Only attached to HttpResponse evidence (the only type
  // where we actually have the body).
  if (contentHash) ev.content_hash = contentHash;
  evidence.push(ev);

  if (response.redirect_chain.length > 0) {
    evidence.push(createEvidence(EvidenceType.Redirect, url, scoping, cycleRef, {
      type: 'redirect', source_url: response.url, target_url: response.final_url,
      status_code: response.redirect_chain[0].status_code,
      hop_count: response.redirect_chain.length, chain: response.redirect_chain,
    } as RedirectPayload));
  }
}

function addPageContentEvidence(evidence: Evidence[], parsed: ParsedPage, finalUrl: string, scoping: Scoping, cycleRef: string): void {
  evidence.push(createEvidence(EvidenceType.PageContent, finalUrl, scoping, cycleRef, {
    type: 'page_content', url: finalUrl, title: parsed.title,
    meta_description: parsed.meta_description, h1: parsed.h1,
    canonical_url: parsed.canonical_url, lang: parsed.lang,
    has_forms: parsed.forms.length > 0, form_count: parsed.forms.length,
    script_count: parsed.scripts.length,
    external_script_count: parsed.scripts.filter(s => s.is_external).length,
    internal_link_count: parsed.links.filter(l => !l.is_external).length,
    external_link_count: parsed.links.filter(l => l.is_external).length,
    body_word_count: parsed.body_word_count ?? 0,
  } as PageContentPayload));
}

function addScriptEvidence(evidence: Evidence[], parsed: ParsedPage, finalUrl: string, scoping: Scoping, cycleRef: string): void {
  for (const script of parsed.scripts.filter(s => s.is_external)) {
    evidence.push(createEvidence(EvidenceType.Script, finalUrl, scoping, cycleRef, {
      type: 'script', page_url: finalUrl, src: script.src, host: script.host,
      is_external: true, known_provider: null,
    } as ScriptPayload));
  }
}

function addFormEvidence(evidence: Evidence[], parsed: ParsedPage, finalUrl: string, scoping: Scoping, cycleRef: string): void {
  for (const form of parsed.forms) {
    evidence.push(createEvidence(EvidenceType.Form, finalUrl, scoping, cycleRef, {
      type: 'form', page_url: finalUrl, action: form.action, method: form.method,
      target_host: form.target_host, is_external: form.is_external,
      field_names: form.field_names, has_payment_fields: form.has_payment_fields,
    } as FormPayload));
  }
}

const CHECKOUT_TOKENS = ['checkout', 'cart', 'pay', 'payment', 'comprar', 'order', 'billing', 'purchase', 'buy', 'carrinho'];
const POLICY_TOKENS: Record<string, string> = { privacy: 'privacy', terms: 'terms', refund: 'refund', return: 'refund', shipping: 'shipping', cookie: 'cookie', security: 'security' };
const PROVIDER_PATTERNS: Record<string, RegExp[]> = {
  stripe: [/js\.stripe\.com/i], paypal: [/paypal\.com/i], shopify: [/cdn\.shopify\.com/i],
  mercadopago: [/mercadopago\.com/i], braintree: [/braintreegateway\.com/i],
};
const PLATFORM_PATTERNS: Record<string, { regex: RegExp; source: string }[]> = {
  shopify: [{ regex: /cdn\.shopify\.com/i, source: 'script' }],
  wordpress: [{ regex: /wp-content/i, source: 'html' }],
  wix: [{ regex: /wix\.com/i, source: 'script' }],
};

function extractIndicators(parsed: ParsedPage, pageUrl: string, scoping: Scoping, cycleRef: string, evidence: Evidence[]): void {
  // Checkout indicators
  for (const link of parsed.links) {
    const tokens = CHECKOUT_TOKENS.filter(t => link.href.toLowerCase().includes(t) || (link.text?.toLowerCase().includes(t)));
    if (tokens.length > 0) {
      evidence.push(createEvidence(EvidenceType.CheckoutIndicator, pageUrl, scoping, cycleRef, {
        type: 'checkout_indicator', page_url: pageUrl, indicator_source: 'link',
        target_url: link.href, target_host: link.target_host, is_external: link.is_external,
        checkout_mode: link.is_external ? 'redirect' : null, confidence: link.is_external ? 60 : 40,
        tokens_matched: tokens,
      } as CheckoutIndicatorPayload));
    }
  }

  // Policy indicators
  for (const link of parsed.links) {
    const path = safePathname(link.href);
    for (const [token, policyType] of Object.entries(POLICY_TOKENS)) {
      if (path.includes(token) || link.text?.toLowerCase().includes(token)) {
        evidence.push(createEvidence(EvidenceType.PolicyPage, pageUrl, scoping, cycleRef, {
          type: 'policy_page', url: link.href, policy_type: policyType,
          detected: true, confidence: 65, word_count: null,
        } as PolicyPagePayload));
        break;
      }
    }
  }

  // Provider indicators
  for (const script of parsed.scripts) {
    for (const [provider, patterns] of Object.entries(PROVIDER_PATTERNS)) {
      if (patterns.some(p => p.test(script.src))) {
        evidence.push(createEvidence(EvidenceType.ProviderIndicator, pageUrl, scoping, cycleRef, {
          type: 'provider_indicator', page_url: pageUrl, provider_name: provider,
          detection_source: 'script', confidence: 70, domain_match: script.host,
        } as ProviderIndicatorPayload));
      }
    }
  }
}

function detectPlatforms(evidence: Evidence[], response: HttpResponse, parsed: ParsedPage, scoping: Scoping, cycleRef: string): void {
  const htmlAndScripts = response.body + ' ' + parsed.scripts.map(s => s.src).join(' ');
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const p of patterns) {
      if (p.regex.test(htmlAndScripts)) {
        evidence.push(createEvidence(EvidenceType.PlatformIndicator, response.final_url, scoping, cycleRef, {
          type: 'platform_indicator', platform_name: platform,
          detection_source: p.source, confidence: 60, matched_pattern: p.regex.source,
        } as PlatformIndicatorPayload));
        break;
      }
    }
  }
}

async function tryFetchMeta(rootUrl: string, scoping: Scoping, cycleRef: string, evidence: Evidence[], errors: any[], coverage: Map<string, CoverageEntry>): Promise<string[]> {
  const discoveredUrls: string[] = [];
  const rootDomain = getRootDomain(new URL(rootUrl).hostname);
  const sitemapsToFetch: string[] = [`${rootUrl}/sitemap.xml`];
  const disallowPaths: string[] = [];

  // 1. Fetch and parse robots.txt — extract Sitemap: directives and
  // basic Disallow rules. We don't enforce Disallow at fetch time (we
  // already respect site policies via rate limiting), but we DO use
  // them to filter discovered URLs.
  try {
    const robotsUrl = `${rootUrl}/robots.txt`;
    const response = await httpFetch(robotsUrl);
    if (response.status_code === 200 && response.body) {
      addHttpEvidence(evidence, response, robotsUrl, scoping, cycleRef);
      coverage.set(robotsUrl, { url: robotsUrl, discovered: true, validated: true, critical: false, confidence: 60, discoverySource: 'robots_txt' });
      const { sitemaps, disallows } = parseRobotsTxt(response.body);
      sitemapsToFetch.push(...sitemaps);
      disallowPaths.push(...disallows);
    }
  } catch { /* non-critical */ }

  // 2. Fetch sitemaps (including any discovered via robots.txt directives).
  // Handles sitemap-index files (which point to multiple sitemap files).
  const seenSitemaps = new Set<string>();
  for (const sitemapUrl of sitemapsToFetch) {
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    try {
      const response = await httpFetch(sitemapUrl);
      if (response.status_code === 200 && response.body) {
        addHttpEvidence(evidence, response, sitemapUrl, scoping, cycleRef);
        coverage.set(sitemapUrl, { url: sitemapUrl, discovered: true, validated: true, critical: false, confidence: 60, discoverySource: 'sitemap' });
        const parsed = parseSitemap(response.body, rootDomain);
        // If this was a sitemap-index, recurse into child sitemaps (one level)
        for (const childSitemap of parsed.childSitemaps) {
          if (seenSitemaps.has(childSitemap)) continue;
          seenSitemaps.add(childSitemap);
          try {
            const child = await httpFetch(childSitemap);
            if (child.status_code === 200 && child.body) {
              addHttpEvidence(evidence, child, childSitemap, scoping, cycleRef);
              const childParsed = parseSitemap(child.body, rootDomain);
              discoveredUrls.push(...childParsed.urls);
            }
          } catch { /* skip child */ }
        }
        discoveredUrls.push(...parsed.urls);
      }
    } catch { /* skip */ }
  }

  // 3. Filter out disallowed paths
  if (disallowPaths.length > 0) {
    const filtered = discoveredUrls.filter((u) => {
      try {
        const p = new URL(u).pathname;
        return !disallowPaths.some((d) => p.startsWith(d));
      } catch { return true; }
    });
    return filtered;
  }
  return discoveredUrls;
}

/**
 * Parse robots.txt for Sitemap: directives and User-agent: * Disallow rules.
 * We only honor wildcard user-agent rules (Vestigio doesn't identify itself
 * as a known crawler).
 */
function parseRobotsTxt(body: string): { sitemaps: string[]; disallows: string[] } {
  const sitemaps: string[] = [];
  const disallows: string[] = [];
  let inWildcardGroup = false;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (directive === 'sitemap' && /^https?:\/\//i.test(value)) {
      sitemaps.push(value);
    } else if (directive === 'user-agent') {
      inWildcardGroup = value === '*';
    } else if (directive === 'disallow' && inWildcardGroup && value && value !== '/') {
      disallows.push(value);
    }
  }
  return { sitemaps, disallows };
}

/**
 * Parse a sitemap XML — supports both URL sitemaps (<urlset>) and
 * sitemap-index files (<sitemapindex>). Returns child sitemap URLs
 * separately so the caller can fetch them.
 */
function parseSitemap(xml: string, rootDomain: string): { urls: string[]; childSitemaps: string[] } {
  const urls: string[] = [];
  const childSitemaps: string[] = [];
  const isIndex = /<sitemapindex/i.test(xml);
  const locRegex = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const foundUrl = match[1].trim();
    try {
      const host = new URL(foundUrl).hostname;
      if (host === rootDomain || host.endsWith('.' + rootDomain)) {
        if (isIndex) {
          childSitemaps.push(foundUrl);
        } else {
          const path = new URL(foundUrl).pathname;
          if (!/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|pdf|zip|xml|json)$/i.test(path)) {
            urls.push(foundUrl);
          }
        }
      }
    } catch { /* invalid URL */ }
  }
  return { urls, childSitemaps };
}

// Backward-compat: keep the original name for any external callers.
function parseSitemapUrls(xml: string, rootDomain: string): string[] {
  return parseSitemap(xml, rootDomain).urls;
}

function detectChallenge(response: HttpResponse): string | null {
  const body = response.body || '';
  const headers = JSON.stringify(response.headers || {});
  const combined = body + headers;

  if (response.status_code === 403 || response.status_code === 429) {
    for (const { type, pattern } of CHALLENGE_PATTERNS) {
      if (pattern.test(combined)) return type;
    }
    return response.status_code === 429 ? 'rate_limit' : 'unknown_protection';
  }

  for (const { type, pattern } of CHALLENGE_PATTERNS) {
    if (pattern.test(combined) && (response.status_code === 503 || body.length < 5000)) {
      return type;
    }
  }
  return null;
}

interface DiscoveredCandidate {
  url: string;
  source: DiscoverySource;
}

function discoverHighValueCandidates(parsed: ParsedPage, rootDomain: string, rootUrl: string, criticalPaths: string[], mode: PipelineMode = 'full'): DiscoveredCandidate[] {
  const seen = new Set<string>([normalizeUrlForDedup(rootUrl)]);
  const candidates: DiscoveredCandidate[] = [];

  // 1. Always seed speculative critical paths first (highest priority).
  //    These are tagged as `critical_path` because they were guessed by
  //    Vestigio, not extracted from the customer's site.
  for (const p of criticalPaths) {
    const url = new URL(p, rootUrl).toString();
    const key = normalizeUrlForDedup(url);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({ url, source: 'critical_path' });
    }
  }

  // 2. Discover from homepage links. Tag as `homepage_link` since the
  //    URL was extracted from the root document's <a> tags.
  //    - In full mode: include ALL unique internal links so we reach
  //      pages like /helpcenter, /docs/gethelp, /termos-de-uso, /blog
  //      that don't match the high-value regex. The crawl session's
  //      max_pages_per_domain (30) still caps total fetches.
  //    - In shallow/shallow_plus: keep the old high-value filter to
  //      stay within tight budgets.
  const includeAllInternal = mode === 'full';
  for (const link of parsed.links) {
    if (link.is_external) continue;
    const key = normalizeUrlForDedup(link.href);
    if (seen.has(key)) continue;
    seen.add(key);

    if (includeAllInternal) {
      // Skip obvious non-page resources (images, stylesheets, etc.)
      const path = safePathname(link.href);
      if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|pdf|zip|xml|json)$/i.test(path)) continue;
      candidates.push({ url: link.href, source: 'homepage_link' });
    } else {
      const path = new URL(link.href).pathname.toLowerCase();
      const text = (link.text || '').toLowerCase();
      if (isHighValue(path, text)) candidates.push({ url: link.href, source: 'homepage_link' });
    }
  }

  // In full mode allow up to 50 candidates (the crawl session's
  // max_pages_per_domain still caps actual fetches at 30).
  const cap = mode === 'full' ? 50 : 20;
  return candidates.slice(0, cap);
}

function isHighValue(path: string, text: string): boolean {
  return /checkout|cart|login|signin|contact|pricing|privacy|terms|refund|shipping|about|support|faq|help/i.test(path + ' ' + text);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildResult(evidence: Evidence[], input: StagedPipelineInput, coverage: Map<string, CoverageEntry>, stages: PipelineStage[], errors: any[], startTime: number, surfaceRelations: SurfaceRelationEntry[] = []): StagedPipelineResult {
  const classInput = extractClassificationInput(evidence, input.onboarding_business_model || null, input.onboarding_conversion_model || null);
  return {
    evidence,
    classification: computeClassification(classInput),
    coverage: buildCoverageSummary(coverage),
    coverage_entries: Array.from(coverage.values()),
    surface_relations: surfaceRelations,
    stages_completed: stages,
    errors,
    duration_ms: Date.now() - startTime,
  };
}

function buildCoverageSummary(coverage: Map<string, CoverageEntry>): CoverageSummary {
  const entries = Array.from(coverage.values());
  const total = entries.length;
  const validated = entries.filter(e => e.validated).length;
  const critical = entries.filter(e => e.critical).length;
  const criticalValidated = entries.filter(e => e.critical && e.validated).length;
  const challenged = entries.some(e => e.discovered && !e.validated && e.confidence < 20);
  const gaps = entries.filter(e => e.critical && !e.validated).map(e => e.url);

  const score = total > 0 ? Math.round((validated / total) * 100) : 0;

  return { score, total_routes: total, validated_routes: validated, critical_routes: critical, critical_validated: criticalValidated, gaps, challenged, challenge_type: null };
}

function getCurrentStage(completed: PipelineStage[]): PipelineStage {
  if (completed.length === 0) return 'bootstrap';
  const last = completed[completed.length - 1];
  if (last === 'bootstrap') return 'first_value';
  if (last === 'first_value') return 'crawl';
  if (last === 'crawl') return 'headless';
  return 'complete';
}

function normalizeUrl(domain: string): string {
  return domain.startsWith('http') ? domain : `https://${domain}`;
}

// Delegated to packages/url-normalize for single source of truth.
function normalizeUrlForDedup(raw: string): string {
  return canonicalUrlShared(raw);
}

function safePathname(url: string): string {
  try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); }
}

function buildScoping(input: StagedPipelineInput): Scoping {
  return { workspace_ref: input.workspace_ref, environment_ref: input.environment_ref, subject_ref: input.website_ref, path_scope: null };
}

function buildFreshness(): Freshness {
  const now = new Date();
  return { observed_at: now, fresh_until: new Date(now.getTime() + 86400000), freshness_state: FreshnessState.Fresh, staleness_reason: null };
}

function createEvidence(type: EvidenceType, subjectRef: string, scoping: Scoping, cycleRef: string, payload: any): Evidence {
  const id = nextId();
  const now = new Date();
  return {
    id, evidence_key: `${type}_${id}`, evidence_type: type,
    subject_ref: subjectRef, scoping: { ...scoping, subject_ref: subjectRef },
    cycle_ref: cycleRef, freshness: buildFreshness(),
    source_kind: SourceKind.HttpFetch, collection_method: CollectionMethod.StaticFetch,
    payload, quality_score: 70, created_at: now, updated_at: now,
  };
}
