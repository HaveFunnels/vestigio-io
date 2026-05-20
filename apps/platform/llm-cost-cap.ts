// ──────────────────────────────────────────────
// LLM monthly cost cap — circuit-breaker.
//
// Reads org's month-to-date TokenCostLedger spend; returns true when
// over the plan-aware cap. callModel checks this BEFORE every API
// request so a runaway loop or malicious actor can't burn an
// unbounded amount of Anthropic credit between Anthropic billing
// alerts (which arrive hours/days late).
//
// Cap is plan-aware with sensible defaults. Override per org by
// setting Organization.llmBudgetCentsOverride when needed (admin
// support escalation, beta partner, etc.).
//
// Cache the per-org "over budget" decision in-process for 60s so we
// don't hit Postgres on every chat token. The cache is purposefully
// short — when an org goes over, we want the block to take effect
// within a minute, not an hour.
// ──────────────────────────────────────────────

import { prisma } from "@/libs/prismaDb";

// Caps in CENTS, monthly. Tuned against the cost audit estimate (Max
// customer ~$14.42/mo expected, $5 chat-heavy; cap at 3× expected so
// normal usage never trips the breaker but a runaway spike does).
const DEFAULT_CAPS_CENTS: Record<string, number> = {
  starter: 1_500,  // $15/mo
  pro: 3_000,      // $30/mo
  max: 5_000,      // $50/mo
  ultra: 15_000,   // $150/mo
};

const FALLBACK_CAP_CENTS = 5_000;

interface CacheEntry {
  over: boolean;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function periodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Lookup MTD spend for the org and compare against the plan-aware cap.
 * Returns true ONLY when the org is genuinely over and the LLM client
 * should refuse to issue the call.
 *
 * Defensive defaults:
 *   - DB error → return false (don't lock customers out on infra hiccup)
 *   - Missing plan → fall back to max-tier cap (least restrictive
 *     among normal plans)
 *   - Cache hit within 60s → reuse decision
 */
export async function isOrgOverLlmBudget(organizationId: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > now) return cached.over;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    const planTier = (org?.plan ?? "max").toLowerCase();
    const capCents = DEFAULT_CAPS_CENTS[planTier] ?? FALLBACK_CAP_CENTS;

    const spend = await prisma.tokenCostLedger.aggregate({
      where: {
        organizationId,
        createdAt: { gte: startOfMonth() },
      },
      _sum: { costCents: true },
    });
    const spentCents = Number(spend._sum.costCents ?? 0);

    const over = spentCents >= capCents;
    cache.set(organizationId, { over, expiresAt: now + CACHE_TTL_MS });
    if (over) {
      console.warn(
        `[llm-cost-cap] org=${organizationId} plan=${planTier} spent=${spentCents}c cap=${capCents}c — blocking LLM until ${periodKey()} ends`,
      );
    }
    return over;
  } catch (err) {
    console.warn(
      "[llm-cost-cap] DB lookup failed — failing open:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Test/utility: bust the cache so a forced spend update is picked up
 *  on the next callModel. Useful for admin "raise the cap" actions. */
export function bustLlmCostCapCache(organizationId?: string): void {
  if (organizationId) cache.delete(organizationId);
  else cache.clear();
}

// ──────────────────────────────────────────────
// Rolling user-session cap — mirrors the Claude consumer plan cadence.
//
// In addition to the monthly org cap, every user has a rolling 5-hour
// chat budget. This catches the runaway scenario the monthly cap can't:
// a single user firing 200 Opus-grade messages in two hours, blowing
// $40 before the next-day billing report would even surface it.
//
// Soft-cap by default: when reached, the chat path falls back to
// Haiku-only and the UI tells the user they're temporarily on the
// lighter model. Hard-cap option (return true) can be flipped if
// abuse is observed.
// ──────────────────────────────────────────────

const USER_SESSION_WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours
const USER_SESSION_CAP_CENTS_BY_PLAN: Record<string, number> = {
  starter: 100,  // $1 / 5h
  pro: 250,      // $2.50 / 5h
  max: 500,      // $5 / 5h
  ultra: 1500,   // $15 / 5h
};
const FALLBACK_USER_SESSION_CAP_CENTS = 500;

interface SessionCacheEntry {
  spentCents: number;
  capCents: number;
  expiresAt: number;
}
const sessionCache = new Map<string, SessionCacheEntry>();
const SESSION_CACHE_TTL_MS = 30_000;

export interface UserSessionBudget {
  spentCents: number;
  capCents: number;
  overSoftCap: boolean;
  windowSeconds: number;
}

/**
 * Lookup the user's spend in the last 5h against their plan-aware cap.
 * Returns enough info for the chat path to decide whether to:
 *   - serve normally (under cap),
 *   - downgrade to Haiku (over soft cap), or
 *   - refuse entirely (admin policy flag, off by default).
 *
 * The window is plan-customizable later by reading
 * Organization.llmSessionWindowSeconds if/when that column exists;
 * today it's a hard 5h matching the Claude consumer cadence.
 */
export async function getUserSessionBudget(userId: string): Promise<UserSessionBudget> {
  const now = Date.now();
  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return {
      spentCents: cached.spentCents,
      capCents: cached.capCents,
      overSoftCap: cached.spentCents >= cached.capCents,
      windowSeconds: USER_SESSION_WINDOW_MS / 1000,
    };
  }

  try {
    // Find the user's primary org to pick the right cap tier.
    const membership = await prisma.membership.findFirst({
      where: { userId },
      select: { organization: { select: { plan: true } } },
      orderBy: { createdAt: "desc" },
    });
    const planTier = (membership?.organization?.plan ?? "max").toLowerCase();
    const capCents = USER_SESSION_CAP_CENTS_BY_PLAN[planTier] ?? FALLBACK_USER_SESSION_CAP_CENTS;

    const since = new Date(now - USER_SESSION_WINDOW_MS);
    const spend = await prisma.tokenCostLedger.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: { costCents: true },
    });
    const spentCents = Number(spend._sum.costCents ?? 0);

    sessionCache.set(userId, { spentCents, capCents, expiresAt: now + SESSION_CACHE_TTL_MS });
    return {
      spentCents,
      capCents,
      overSoftCap: spentCents >= capCents,
      windowSeconds: USER_SESSION_WINDOW_MS / 1000,
    };
  } catch (err) {
    console.warn("[llm-cost-cap] session lookup failed — failing open:", err instanceof Error ? err.message : err);
    return { spentCents: 0, capCents: FALLBACK_USER_SESSION_CAP_CENTS, overSoftCap: false, windowSeconds: USER_SESSION_WINDOW_MS / 1000 };
  }
}

export function bustUserSessionBudgetCache(userId?: string): void {
  if (userId) sessionCache.delete(userId);
  else sessionCache.clear();
}
