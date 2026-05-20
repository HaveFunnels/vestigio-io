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
