"use server";

import { getIp } from "./get-ip";

// ──────────────────────────────────────────────
// Rate Limiter — Redis-backed with in-memory fallback
//
// When REDIS_URL is configured:
//   Uses Redis INCR + EXPIRE for a simple fixed-window counter.
//   Key format: vestigio:ratelimit:{identifier}:{window}
//   Survives restarts. Shared across instances.
//
// When Redis is unavailable:
//   Falls back to the in-memory tracker below.
//   Still protects a single instance, but resets on restart.
//
// Never throws on Redis failure — always falls back gracefully.
// ──────────────────────────────────────────────

const REDIS_PREFIX = "vestigio:ratelimit";

// ──────────────────────────────────────────────
// Named Policies (P2.3)
//
// Callers pass a policy key instead of raw (limit, windowMs) so the
// numbers live in one file. Tune here rather than tracking down every
// route that lifted them at import time.
// ──────────────────────────────────────────────

export type RateLimitPolicy =
	| "auth"        // sign-in / sign-up — hostile bots
	| "reset"       // password reset — email-relay abuse
	| "newsletter"  // newsletter opt-in — spam signups
	| "audit"       // public /audit form
	| "public-api"  // any unauthenticated JSON endpoint
	| "user-write"  // authenticated user mutation
	| "user-read"   // authenticated user read
	| "webhook";    // 3rd-party webhook (per-source key, not IP)

const POLICIES: Record<RateLimitPolicy, { limit: number; windowMs: number }> = {
	"auth":        { limit: 10, windowMs: 60_000 },
	"reset":       { limit: 3, windowMs: 60_000 },
	"newsletter":  { limit: 3, windowMs: 60_000 },
	"audit":       { limit: 5, windowMs: 60_000 },
	"public-api":  { limit: 30, windowMs: 60_000 },
	"user-write":  { limit: 60, windowMs: 60_000 },
	"user-read":   { limit: 120, windowMs: 60_000 },
	"webhook":     { limit: 300, windowMs: 60_000 },
};

// ──────────────────────────────────────────────
// In-Memory Fallback
// ──────────────────────────────────────────────

const trackers: Record<string, { count: number; expiresAt: number }> = {};

function cleanup() {
  const now = Date.now();
  for (const key of Object.keys(trackers)) {
    if (trackers[key].expiresAt < now) {
      delete trackers[key];
    }
  }
}

// Run cleanup every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(cleanup, 60_000);
}

// ──────────────────────────────────────────────
// Redis Rate Limiter
// ──────────────────────────────────────────────

interface RateLimitResult {
  limited: boolean;
  retryAfterSec: number; // 0 when not limited
}

async function redisRateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  let redis: any = null;
  try {
    const { getRedis } = await import("./redis");
    redis = getRedis();
  } catch { /* ioredis not available */ }
  if (!redis) return null; // signal to fall back

  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const windowKey = Math.floor(Date.now() / windowMs);
    const nextWindowStartMs = (windowKey + 1) * windowMs;
    const key = `${REDIS_PREFIX}:${identifier}:${windowKey}`;

    const count = await redis.incr(key);
    if (count === 1) {
      // First request in this window — set expiry
      await redis.expire(key, windowSec + 1); // +1s buffer
    }

    const limited = count > limit;
    const retryAfterSec = limited
      ? Math.max(1, Math.ceil((nextWindowStartMs - Date.now()) / 1000))
      : 0;
    return { limited, retryAfterSec };
  } catch {
    // Redis failure — return null to signal fallback
    return null;
  }
}

function inMemoryRateLimitDetailed(
  identifier: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const tracker = trackers[identifier] || { count: 0, expiresAt: 0 };
  if (!trackers[identifier]) trackers[identifier] = tracker;
  if (tracker.expiresAt < Date.now()) {
    tracker.count = 0;
    tracker.expiresAt = Date.now() + windowMs;
  }
  tracker.count++;
  const limited = tracker.count > limit;
  const retryAfterSec = limited
    ? Math.max(1, Math.ceil((tracker.expiresAt - Date.now()) / 1000))
    : 0;
  return { limited, retryAfterSec };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

// IPs that bypass rate limiting (comma-separated env var)
const WHITELIST_IPS = new Set(
  (process.env.RATE_LIMIT_WHITELIST_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

async function evaluate(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisResult = await redisRateLimit(identifier, limit, windowMs);
  return redisResult ?? inMemoryRateLimitDetailed(identifier, limit, windowMs);
}

export async function rateLimitByIp(limit = 5, windowMs = 60000) {
  const ip = await getIp();

  // Wave 22.9 · third pass — earlier iterations shipped a bare
  // fail-open then a shared-bucket fallback. A background security
  // review flagged both: the shared bucket still lets N attempts per
  // window slip through to a proxy-bypass attacker.
  //
  // Right shape per the reviewer's option (c): fail-closed in prod,
  // fail-open only in dev. In prod behind Cloudflare + Railway both
  // proxies always set forwarded headers; if getIp() returns null
  // for a real prod request the upstream is misconfigured OR
  // someone is stripping headers to bypass throttle. Either way,
  // reject rather than serve.
  //
  // In dev (localhost, no proxy) fail-open so `pnpm dev` login works.
  // Downside preserved from the reviewer's guidance: dev's fail-open
  // is not a security hole because dev instances aren't public.
  //
  // NB: NextAuth's authorize() still runs checkLockout(email) — per-
  // account throttle that works regardless of IP. This IP throttle
  // is defense-in-depth against credential-stuffing across many
  // emails from one IP, not the primary account-lockout mechanism.
  if (!ip) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Rate limit exceeded");
    }
    return;
  }

  // Skip rate limiting for whitelisted IPs.
  if (WHITELIST_IPS.has(ip)) return;

  const { limited } = await evaluate(ip, limit, windowMs);
  if (limited) {
    throw new Error("Rate limit exceeded");
  }
}

/**
 * Rate limit by an arbitrary identifier (not just IP).
 * Useful for per-user or per-org rate limiting.
 */
export async function rateLimitByKey(key: string, limit = 5, windowMs = 60000) {
  const { limited } = await evaluate(key, limit, windowMs);
  if (limited) {
    throw new Error("Rate limit exceeded");
  }
}

/**
 * Composable rate limit check for use in API route handlers.
 * Returns a NextResponse (with Retry-After header) if rate limited,
 * null otherwise. Prefer the policy-based overload:
 *
 *   const limited = await checkRateLimit("auth");
 *   if (limited) return limited;
 *
 * The two-arg (limit, windowMs) form is kept for backwards compat
 * with existing callers.
 */
export async function checkRateLimit(policy: RateLimitPolicy): Promise<Response | null>;
export async function checkRateLimit(limit?: number, windowMs?: number): Promise<Response | null>;
export async function checkRateLimit(
  policyOrLimit: RateLimitPolicy | number = 5,
  windowMs = 60000,
): Promise<Response | null> {
  const { limit, window } =
    typeof policyOrLimit === "string"
      ? { limit: POLICIES[policyOrLimit].limit, window: POLICIES[policyOrLimit].windowMs }
      : { limit: policyOrLimit, window: windowMs };

  const ip = await getIp();
  if (!ip) {
    // No IP → cannot rate-limit; fail-open to avoid breaking Playwright
    // and unusual proxy layouts. Public routes should still have other
    // controls (Turnstile, HMAC signatures) to bound abuse.
    return null;
  }
  if (WHITELIST_IPS.has(ip)) return null;

  const { limited, retryAfterSec } = await evaluate(ip, limit, window);
  if (!limited) return null;

  const { NextResponse } = await import("next/server");
  return NextResponse.json(
    { message: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + retryAfterSec),
      },
    },
  );
}

/**
 * Policy-based variant that keys off an authenticated userId instead
 * of IP. Use for per-user quotas (e.g. resend-activation, chat).
 */
export async function checkRateLimitForUser(
  policy: RateLimitPolicy,
  userId: string,
): Promise<Response | null> {
  const { limit, windowMs } = POLICIES[policy];
  const { limited, retryAfterSec } = await evaluate(`user:${userId}`, limit, windowMs);
  if (!limited) return null;
  const { NextResponse } = await import("next/server");
  return NextResponse.json(
    { message: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + retryAfterSec),
      },
    },
  );
}
