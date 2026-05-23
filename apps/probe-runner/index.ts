// ──────────────────────────────────────────────
// Probe Runner — Wave 21.2
//
// Lightweight critical-page diff scheduler. The probe runner is the
// "always-on" half of Vestigio: it fetches a small set of
// commercially-important URLs per environment on a plan-based cadence
// (max=5min, pro=15min, vestigio=60min), computes a content hash, and
// persists a PageProbe row. When the hash differs from the prior
// probe for the same (env, url), it enqueues a TARGETED audit cycle
// pointing at the changed URL — engine.run({ scope: { kind:
// 'targeted', url } }) re-fetches + re-enriches only that URL via the
// Wave 20.7 API, so a copy edit on /pricing turns into a Vestigio
// re-audit within minutes instead of waiting for the next scheduled
// cold cycle.
//
// Cost model: one HTTP GET per (env, url) per probe pass. At 3 URLs
// per env × 12 passes/hour for a max-plan customer = 36 GETs/hour.
// Compared to a full audit cycle (~30-60min, hundreds of GETs +
// Haiku calls), this is rounding noise. The savings come from NOT
// running a full audit when nothing changed.
//
// Failure model: best-effort. Per-URL fetch errors are logged + the
// probe row is still persisted with status=0 so the next pass has
// something to diff against. A complete probe-pass failure for an env
// is non-fatal — the next cron tick retries. The probeLastRunAt
// debounce is INSIDE this module so multiple replicas calling
// runProbePass concurrently still produce one effective pass per
// cadence window (combined with the cron's withLeadership lock).
// ──────────────────────────────────────────────

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { httpFetch } from "../../workers/ingestion/http-client";

export interface ProbeCadence {
  /** Minimum minutes between probe passes for an env on this plan. */
  intervalMinutes: number;
}

export const PLAN_CADENCE: Record<string, ProbeCadence> = {
  vestigio: { intervalMinutes: 60 },
  pro: { intervalMinutes: 15 },
  max: { intervalMinutes: 5 },
};

export const DEFAULT_CADENCE: ProbeCadence = { intervalMinutes: 60 };

/** Max URLs to probe per env per pass — keeps the cost bounded even
 *  if probeUrlsJson somehow gets stuffed with a 100-URL list. */
export const MAX_URLS_PER_ENV = 5;

/** Cap on probed body length when computing the hash. Long pages don't
 *  meaningfully change the diff signal beyond the first ~200KB and we
 *  don't want a 5MB HTML page to drive the hash cost. */
const BODY_HASH_CAP_BYTES = 200_000;

/**
 * Compute a stable content hash for a probe. Strips obvious
 * cycle-noise (timestamps, csrf tokens, etag-like ids in HTML
 * comments) so a probe doesn't fire on every page that includes
 * `<meta name="generated" content="2026-05-23T12:34:56Z">` or a
 * per-request csrf token.
 *
 * This is intentionally conservative — false positives (we triggered
 * a targeted audit when nothing meaningful changed) are cheap (one
 * extra audit cycle) and false negatives (we missed a real change)
 * are expensive (always-on pitch fails). We prefer the cheap side
 * but normalize the most common noise sources.
 */
export function computeProbeHash(body: string): string {
  let normalized = body.slice(0, BODY_HASH_CAP_BYTES);

  // Strip ISO timestamps inside HTML comments (Next.js prerender
  // markers, build IDs, etc.).
  normalized = normalized.replace(/<!--[\s\S]*?-->/g, "");

  // Strip common CSRF / nonce attributes — these rotate per request.
  normalized = normalized.replace(/(csrf|nonce|csp-nonce|data-nonce)=("|')[^"']*\2/gi, "$1=\"\"");

  // Strip Next.js / Webpack chunk hashes in script src — they
  // change on every deploy but the page content is identical.
  normalized = normalized.replace(/\/_next\/static\/[a-zA-Z0-9_-]+\//g, "/_next/static/");
  normalized = normalized.replace(/[?&]v=[a-zA-Z0-9]+/g, "");

  // Collapse between-tag whitespace so HTML reformatting alone (a
  // minifier flip, a Prettier-driven template re-indent) doesn't fire
  // a probe. We deliberately preserve in-text whitespace because
  // changes inside text content ("$50" → "$ 50") might be real copy
  // edits that matter — false positives there are still much cheaper
  // than false negatives on real customer-visible changes.
  normalized = normalized.replace(/>\s+</g, "><");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return createHash("sha256").update(normalized).digest("hex");
}

export interface ProbeResult {
  url: string;
  contentHash: string;
  statusCode: number;
  contentLength: number;
  fetchMs: number;
  changedFromPrior: boolean | null;
  priorHash: string | null;
  error?: string;
}

export interface ProbePassResult {
  environmentId: string;
  probesRun: number;
  probesChanged: number;
  errors: number;
  durationMs: number;
  /** Per-URL outcomes — handy for telemetry / admin debugging. */
  results: ProbeResult[];
}

/**
 * Probe a single URL. Fetches, hashes, compares against the most
 * recent prior probe for the same (env, url), and persists a new
 * PageProbe row. Returns the result so the caller can decide whether
 * to enqueue a targeted audit.
 *
 * Network errors are caught and persisted as probes with statusCode=0
 * so the next pass still has a hash to diff against (it'll see that
 * the failure persisted vs. recovered, which is itself a signal).
 */
export async function probeOneUrl(
  prisma: PrismaClient,
  environmentId: string,
  url: string,
): Promise<ProbeResult> {
  const start = Date.now();
  let body = "";
  let statusCode = 0;
  let contentLength = 0;
  let errorMsg: string | undefined;

  try {
    const resp = await httpFetch(url);
    body = resp.body;
    statusCode = resp.status_code;
    contentLength = resp.content_length ?? body.length;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const fetchMs = Date.now() - start;
  // For network errors we hash the empty string — distinct from "200
  // with empty body" because statusCode differs.
  const contentHash = computeProbeHash(body);

  // Pull the most recent prior probe to compute diff.
  const prior = await prisma.pageProbe.findFirst({
    where: { environmentId, url },
    orderBy: { observedAt: "desc" },
    select: { contentHash: true },
  });

  const priorHash = prior?.contentHash ?? null;
  const changedFromPrior = priorHash === null ? null : priorHash !== contentHash;

  await prisma.pageProbe.create({
    data: {
      environmentId,
      url,
      contentHash,
      statusCode,
      contentLength,
      fetchMs,
      changedFromPrior,
      priorHash,
    },
  });

  return {
    url,
    contentHash,
    statusCode,
    contentLength,
    fetchMs,
    changedFromPrior,
    priorHash,
    error: errorMsg,
  };
}

/**
 * Resolve the list of URLs to probe for an environment.
 *
 * Priority order:
 *   1. env.probeUrlsJson if it's a non-empty string[] — operator-
 *      authored allow-list takes priority.
 *   2. env.landingUrl as the single fallback.
 *
 * Wave 21.3 will extend (2) with auto-discovered commercial URLs from
 * the most recent completed audit cycle (pricing, checkout, etc.).
 * Keeping it landing-only for now so the initial rollout has a single
 * predictable cost surface.
 */
export function resolveProbeUrls(env: {
  landingUrl: string;
  probeUrlsJson: unknown;
}): string[] {
  if (Array.isArray(env.probeUrlsJson)) {
    const urls = env.probeUrlsJson
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .slice(0, MAX_URLS_PER_ENV);
    if (urls.length > 0) return urls;
  }
  return env.landingUrl ? [env.landingUrl] : [];
}

/**
 * Run a probe pass against a single environment. Pure logic — caller
 * handles cron registration, leader election, and the decision to
 * enqueue targeted audits (those callbacks fire from the cron in
 * instrumentation-node.ts).
 *
 * Returns a ProbePassResult that the caller can both log + use to
 * decide whether to enqueue downstream work.
 */
export async function runProbePassForEnv(
  prisma: PrismaClient,
  env: {
    id: string;
    landingUrl: string;
    probeUrlsJson: unknown;
    probeEnabled: boolean;
    probeLastRunAt: Date | null;
    activated: boolean;
    continuousPaused: boolean;
  },
  opts: {
    /** Override the plan cadence — used in tests. */
    minIntervalMinutes?: number;
    /** Current time anchor — used in tests. */
    now?: Date;
  } = {},
): Promise<ProbePassResult | null> {
  const now = opts.now ?? new Date();

  // Gates: never probe an env we shouldn't be probing.
  if (!env.probeEnabled) return null;
  if (!env.activated) return null;
  if (env.continuousPaused) return null;

  // Plan-cadence debounce. The cron fires more often than any plan's
  // cadence because we don't want max-tier customers to wait an extra
  // hour just because the cron tick lined up wrong. The debounce here
  // is what enforces actual per-env cadence.
  if (opts.minIntervalMinutes && env.probeLastRunAt) {
    const sinceLast = now.getTime() - env.probeLastRunAt.getTime();
    const minMs = opts.minIntervalMinutes * 60 * 1000;
    if (sinceLast < minMs) return null;
  }

  const urls = resolveProbeUrls(env);
  if (urls.length === 0) return null;

  const start = Date.now();
  const results: ProbeResult[] = [];
  let errors = 0;
  let changed = 0;

  for (const url of urls) {
    try {
      const r = await probeOneUrl(prisma, env.id, url);
      results.push(r);
      if (r.error) errors++;
      if (r.changedFromPrior === true) changed++;
    } catch (err) {
      // Catch-all so a single bad URL doesn't kill the whole env pass.
      errors++;
      results.push({
        url,
        contentHash: "",
        statusCode: 0,
        contentLength: 0,
        fetchMs: 0,
        changedFromPrior: null,
        priorHash: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await prisma.environment.update({
    where: { id: env.id },
    data: { probeLastRunAt: now },
  });

  return {
    environmentId: env.id,
    probesRun: results.length,
    probesChanged: changed,
    errors,
    durationMs: Date.now() - start,
    results,
  };
}

/**
 * Get the probe cadence for a plan key. Falls back to the
 * conservative default when an unknown plan name is supplied.
 */
export function cadenceForPlan(plan: string | null | undefined): ProbeCadence {
  if (!plan) return DEFAULT_CADENCE;
  return PLAN_CADENCE[plan.toLowerCase()] ?? DEFAULT_CADENCE;
}
