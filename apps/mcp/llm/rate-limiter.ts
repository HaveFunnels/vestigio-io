// ──────────────────────────────────────────────
// Rate Limiter — Per-Org Burst Protection
//
// Dual-mode: Redis (production/Railway) or In-Memory (dev).
// Automatically detects Redis via REDIS_URL env var.
//
// Sliding window per-minute rate limit on top of
// the existing daily budget in cost-guardrails.ts.
//
// Note: No shell commands or child_process usage.
// Redis is accessed via the ioredis client library only.
// ──────────────────────────────────────────────

import type { PlanKey } from '../../../packages/plans';
import type { RateLimitResult } from './types';

const PLAN_RATE_LIMITS: Record<string, number> = {
  vestigio: 3,
  pro: 10,
  max: 30,
};

const WINDOW_MS = 60_000;
const MAX_ENTRIES_PER_ORG = 200;

// ── Rate Limiter Interface ───────────────────

interface RateLimiterBackend {
  checkAndRecord(orgId: string, limit: number): Promise<RateLimitResult>;
  cleanup(): Promise<void>;
}

// ── In-Memory Backend (dev/single-instance) ──

class InMemoryRateLimiter implements RateLimiterBackend {
  private windows = new Map<string, number[]>();

  async checkAndRecord(orgId: string, limit: number): Promise<RateLimitResult> {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const timestamps = (this.windows.get(orgId) || []).filter((t) => t > cutoff);

    timestamps.push(now);
    if (timestamps.length > MAX_ENTRIES_PER_ORG) timestamps.splice(0, timestamps.length - MAX_ENTRIES_PER_ORG);
    this.windows.set(orgId, timestamps);

    const countBefore = timestamps.length - 1;
    if (countBefore >= limit) {
      return {
        allowed: false,
        remaining: 0,
        reset_at: timestamps[0] + WINDOW_MS,
        reason: `Rate limit exceeded: ${countBefore}/${limit} per minute`,
      };
    }

    return { allowed: true, remaining: limit - timestamps.length, reset_at: now + WINDOW_MS };
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    for (const [orgId, timestamps] of this.windows.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) this.windows.delete(orgId);
      else this.windows.set(orgId, active);
    }
  }
}

// ── Redis Backend (production/multi-instance) ──

class RedisRateLimiter implements RateLimiterBackend {
  private redisUrl: string;
  private clientPromise: Promise<any> | null = null;
  private inMemoryFallback = new InMemoryRateLimiter(); // Fail-safe: never fail-open

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = await import('ioredis');
        const Redis = mod.default;
        return new Redis(this.redisUrl, { maxRetriesPerRequest: 1 });
      })();
    }
    return this.clientPromise;
  }

  async checkAndRecord(orgId: string, limit: number): Promise<RateLimitResult> {
    const now = Date.now();
    const key = `vestigio:ratelimit:${orgId}`;

    try {
      const client = await this.getClient();

      // Atomic: remove expired + add current + count + set TTL
      const pipeline = client.pipeline();
      pipeline.zremrangebyscore(key, 0, now - WINDOW_MS);
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 6)}`);
      pipeline.zcard(key);
      pipeline.expire(key, 120);

      const results = await pipeline.exec();
      const count = (results?.[2]?.[1] as number) || 0;

      if (count > limit) {
        return {
          allowed: false,
          remaining: 0,
          reset_at: now + WINDOW_MS,
          reason: `Rate limit exceeded: ${count}/${limit} per minute`,
        };
      }

      return { allowed: true, remaining: limit - count, reset_at: now + WINDOW_MS };
    } catch (err) {
      // Redis unavailable — fall back to in-memory rate limiting (NOT fail-open)
      console.warn('[rate-limiter] Redis unavailable, falling back to in-memory:', err instanceof Error ? err.message : err);
      return this.inMemoryFallback.checkAndRecord(orgId, limit);
    }
  }

  async cleanup(): Promise<void> {
    // Redis TTL handles cleanup automatically
  }
}

// ── Singleton ────────────────────────────────

let backend: RateLimiterBackend | null = null;

function getBackend(): RateLimiterBackend {
  if (!backend) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      backend = new RedisRateLimiter(redisUrl);
    } else {
      backend = new InMemoryRateLimiter();
    }
  }
  return backend;
}

// ── Public API ───────────────────────────────

export async function checkAndRecordRateLimit(orgId: string, plan: PlanKey): Promise<RateLimitResult> {
  const limit = PLAN_RATE_LIMITS[plan] || PLAN_RATE_LIMITS.vestigio;
  return getBackend().checkAndRecord(orgId, limit);
}

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000;

export async function cleanupStaleWindows(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  await getBackend().cleanup();
}
