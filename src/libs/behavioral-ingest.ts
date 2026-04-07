import { createHash } from "crypto";
import { prisma } from "./prismaDb";

// ──────────────────────────────────────────────
// Behavioral Ingest Helpers — Wave 0.2
//
// Defense / hygiene utilities for /api/behavioral/ingest. Kept in a
// dedicated module so the route handler stays focused on the happy path.
//
// What lives here:
//   - IP hashing (privacy-preserving, daily-rotating salt)
//   - Environment-id validation cache (avoids hammering Prisma)
//   - In-memory per-IP rate limiter
//   - Event-shape sanitizer + safe truncation
//
// What does NOT live here:
//   - Prisma writes (route owns persistence)
//   - Aggregation logic (Wave 0.3 / packages/behavioral)
// ──────────────────────────────────────────────

// ── Constants ─────────────────────────────────────

/** Snippet event types we recognise. Anything else is dropped silently
 *  so older / newer snippet versions can coexist without 4xx noise. */
export const KNOWN_EVENT_TYPES = new Set<string>([
  "page_view",
  "route_change",
  "cta_click",
  "scroll_depth",
  "form_start",
  "form_submit",
  "form_error",
  "support_open",
  "policy_open",
  "checkout_open",
  "backtrack",
  "page_leave",
  "dead_click",
  "heartbeat",
  "step_reached",
  "order_bump_seen",
  "order_bump_accept",
  "upsell_seen",
  "upsell_accept",
  "confirmation_seen",
  "cta_viewed",
  "cta_rendered_late",
  "hesitation_pause",
  "trusted_handoff",
  "field_inventory",
  "input_focus_abandon",
  "form_retry",
  "rapid_backtrack",
]);

/** Hard cap on a single event's serialized payload, to keep the table
 *  bounded against accidental snippet bugs or hostile clients. */
export const MAX_EVENT_BYTES = 8 * 1024; // 8 KB

/** Hard cap on events per batch — the snippet flushes at 50, allow some
 *  margin for in-flight retries / sendBeacon reuse. */
export const MAX_BATCH_SIZE = 100;

/** Per-IP cap. Generous enough that a real user spamming a SPA cannot
 *  realistically hit it. */
export const RATE_LIMIT_EVENTS_PER_MINUTE = 600;

/** How long a positive env-id validation lives in the in-memory cache. */
const ENV_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/** Random per-process secret for the IP hash. We don't try to be
 *  resistant to a compromised server image — only to make hashes
 *  non-correlatable across days and across deployments. */
const PROCESS_SECRET = process.env.LEAD_FORM_SECRET || "vestigio-pixel-default";

// ── IP hashing ────────────────────────────────────

/**
 * Daily-rotating SHA-256 hash of the client IP. The day component
 * means the same visitor on the same IP yields a different hash
 * tomorrow, so the table cannot be used to correlate behavior across
 * days. Returns null when ip is unknown — the route stores null in
 * that case, which is honest.
 */
export function hashClientIp(ip: string | null): string | null {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return createHash("sha256")
    .update(`${ip}|${day}|${PROCESS_SECRET}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Best-effort client IP extraction from a fetch Request. Order:
 *   1. x-forwarded-for first hop (Railway / proxy)
 *   2. x-real-ip
 *   3. cf-connecting-ip
 *   4. null (no IP available — local dev with no proxy)
 */
export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") || headers.get("cf-connecting-ip") || null;
}

// ── Environment-id validation cache ───────────────

interface EnvCacheEntry {
  /** true = exists, false = does not exist (negative cache, shorter TTL) */
  exists: boolean;
  cachedAt: number;
}

const envCache = new Map<string, EnvCacheEntry>();

/**
 * Validates that an env_id corresponds to a real Environment row.
 * Positive results live for 5 minutes; negative results for 1 minute
 * so a freshly-created environment doesn't get rejected for too long.
 *
 * Returns true if the env exists. False otherwise. Errors are
 * conservative: on Prisma failure we return true so we don't black-hole
 * legitimate traffic during DB hiccups.
 */
export async function isKnownEnvironment(envId: string): Promise<boolean> {
  if (!envId || typeof envId !== "string" || envId.length > 64) return false;

  const cached = envCache.get(envId);
  const now = Date.now();
  if (cached) {
    const ttl = cached.exists ? ENV_CACHE_TTL_MS : 60_000;
    if (now - cached.cachedAt < ttl) return cached.exists;
  }

  try {
    const row = await prisma.environment.findUnique({
      where: { id: envId },
      select: { id: true },
    });
    const exists = row !== null;
    envCache.set(envId, { exists, cachedAt: now });
    return exists;
  } catch (err) {
    // DB hiccup — let traffic through rather than drop it. Wave 0.3
    // will simply skip events whose env_id no longer resolves.
    console.warn("[behavioral-ingest] env validation failed:", err);
    return true;
  }
}

// ── Rate limiter ──────────────────────────────────

interface RateBucket {
  count: number;
  windowStart: number;
}

const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60_000;

/**
 * Returns true if the request is within the per-IP rate limit.
 * Uses a 1-minute fixed window keyed on the daily IP hash.
 *
 * The keying choice (daily hash, not raw IP) means a user behind NAT
 * can still get rate-limited fairly. If we cared about per-user
 * granularity we'd key on (envId, sessionId), but rate limiting is
 * about cost protection — IP-level is the right axis for that.
 */
export function isWithinRateLimit(ipHash: string | null, eventCount: number): boolean {
  if (!ipHash) return true; // unknown IP — don't penalize
  const now = Date.now();
  const bucket = rateBuckets.get(ipHash);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(ipHash, { count: eventCount, windowStart: now });
    return eventCount <= RATE_LIMIT_EVENTS_PER_MINUTE;
  }
  bucket.count += eventCount;
  return bucket.count <= RATE_LIMIT_EVENTS_PER_MINUTE;
}

/** Periodically prune the rate-limit map so it doesn't leak memory. */
export function pruneRateBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now - bucket.windowStart > RATE_WINDOW_MS * 2) {
      rateBuckets.delete(key);
    }
  }
}

// ── Event sanitizer ───────────────────────────────

export interface SanitizedEvent {
  type: string;
  ts: number;
  url: string;
  payload: string; // JSON string ready to write into the payload column
}

/**
 * Validates a single event from the wire payload. Returns the sanitized
 * row-shape on success, or null if the event should be dropped silently.
 *
 * Drops:
 *   - unknown event types
 *   - non-string url / non-numeric ts
 *   - payloads that exceed MAX_EVENT_BYTES once serialized
 *   - timestamps wildly out of range (>1 day skew)
 */
export function sanitizeEvent(raw: unknown): SanitizedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  const type = typeof e.type === "string" ? e.type : null;
  if (!type || !KNOWN_EVENT_TYPES.has(type)) return null;

  const ts = typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : null;
  if (!ts) return null;

  // Reject events more than a day in the future or past — these are
  // almost always either client clock skew or replayed payloads.
  const now = Date.now();
  if (Math.abs(now - ts) > 24 * 60 * 60 * 1000) return null;

  const url = typeof e.url === "string" ? e.url.slice(0, 2048) : "";

  // Re-serialize so we drop unknown top-level keys and bound the size.
  // We deliberately do NOT prune fields inside `data` — the snippet
  // promises no PII and the aggregator needs the full shape.
  const safe = {
    type,
    ts,
    session_id: typeof e.session_id === "string" ? e.session_id : "",
    env_id: typeof e.env_id === "string" ? e.env_id : "",
    url,
    data: e.data && typeof e.data === "object" ? e.data : {},
  };

  let payload: string;
  try {
    payload = JSON.stringify(safe);
  } catch {
    return null;
  }
  if (payload.length > MAX_EVENT_BYTES) return null;

  return { type, ts, url, payload };
}

/** Truncate user-agent to a safe length for the column. */
export function safeUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  return ua.slice(0, 200);
}
