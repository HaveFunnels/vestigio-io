"use server";

import { getIp } from "./get-ip";
import { getRedis } from "./redis";

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

function inMemoryRateLimit(identifier: string, limit: number, windowMs: number): boolean {
  const tracker = trackers[identifier] || { count: 0, expiresAt: 0 };

  if (!trackers[identifier]) {
    trackers[identifier] = tracker;
  }

  if (tracker.expiresAt < Date.now()) {
    tracker.count = 0;
    tracker.expiresAt = Date.now() + windowMs;
  }

  tracker.count++;

  return tracker.count > limit;
}

// ──────────────────────────────────────────────
// Redis Rate Limiter
// ──────────────────────────────────────────────

async function redisRateLimit(identifier: string, limit: number, windowMs: number): Promise<boolean | null> {
  const redis = getRedis();
  if (!redis) return null; // signal to fall back

  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const windowKey = Math.floor(Date.now() / windowMs);
    const key = `${REDIS_PREFIX}:${identifier}:${windowKey}`;

    const count = await redis.incr(key);
    if (count === 1) {
      // First request in this window — set expiry
      await redis.expire(key, windowSec + 1); // +1s buffer
    }

    return count > limit;
  } catch {
    // Redis failure — return null to signal fallback
    return null;
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function rateLimitByIp(limit = 5, windowMs = 60000) {
  const ip = await getIp();

  if (!ip) {
    throw new Error("IP address not found");
  }

  // Try Redis first, fall back to in-memory
  const redisResult = await redisRateLimit(ip, limit, windowMs);
  const isLimited = redisResult !== null ? redisResult : inMemoryRateLimit(ip, limit, windowMs);

  if (isLimited) {
    throw new Error("Rate limit exceeded");
  }
}

/**
 * Rate limit by an arbitrary identifier (not just IP).
 * Useful for per-user or per-org rate limiting.
 */
export async function rateLimitByKey(key: string, limit = 5, windowMs = 60000) {
  const redisResult = await redisRateLimit(key, limit, windowMs);
  const isLimited = redisResult !== null ? redisResult : inMemoryRateLimit(key, limit, windowMs);

  if (isLimited) {
    throw new Error("Rate limit exceeded");
  }
}

/**
 * Composable rate limit check for use in API route handlers.
 * Returns a NextResponse if rate limited, null otherwise.
 */
export async function checkRateLimit(limit = 5, windowMs = 60000) {
  try {
    await rateLimitByIp(limit, windowMs);
    return null; // not rate limited
  } catch {
    const { NextResponse } = await import("next/server");
    return NextResponse.json(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }
}
