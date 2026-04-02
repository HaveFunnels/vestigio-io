import { getPlanEntitlements, PlanKey } from '../../packages/plans';
import { UsageSummary } from '../../packages/plans/types';

// ──────────────────────────────────────────────
// MCP Usage Tracking — DB-BACKED
//
// Primary persistence: Prisma Usage table.
// In-memory cache for fast reads within a session.
// DB writes via UsageStore interface for testability.
//
// Production callers inject a real PrismaUsageStore.
// Tests use the in-memory InMemoryUsageStore.
// ──────────────────────────────────────────────

export interface UsageStore {
  getUsageCount(orgId: string, period: string): Promise<number>;
  recordUsage(orgId: string, usageType: string, amount: number, period: string): Promise<void>;
}

// ──────────────────────────────────────────────
// In-Memory Store (default, used in tests + engine)
// ──────────────────────────────────────────────

const memoryStore = new Map<string, number>();

export class InMemoryUsageStore implements UsageStore {
  private store = new Map<string, number>();
  async getUsageCount(orgId: string, period: string): Promise<number> {
    return this.store.get(`${orgId}:${period}`) || 0;
  }
  async recordUsage(orgId: string, usageType: string, amount: number, period: string): Promise<void> {
    const key = `${orgId}:${period}`;
    this.store.set(key, (this.store.get(key) || 0) + amount);
  }
  clear(): void { this.store.clear(); }
}

// Singleton default store
let activeStore: UsageStore = new InMemoryUsageStore();

export function setUsageStore(store: UsageStore): void {
  activeStore = store;
}

export function getActiveStore(): UsageStore {
  return activeStore;
}

// ──────────────────────────────────────────────
// Prisma-compatible Store (inject in production)
// ──────────────────────────────────────────────

export class PrismaUsageStore implements UsageStore {
  constructor(private prisma: any) {}

  async getUsageCount(orgId: string, period: string): Promise<number> {
    const result = await this.prisma.usage.aggregate({
      where: { organizationId: orgId, period },
      _sum: { amount: true },
    });
    return result._sum.amount || 0;
  }

  async recordUsage(orgId: string, usageType: string, amount: number, period: string): Promise<void> {
    await this.prisma.usage.create({
      data: { organizationId: orgId, usageType, amount, period },
    });
  }
}

// ──────────────────────────────────────────────
// Public API (sync wrappers with cache)
// ──────────────────────────────────────────────

// In-memory cache for fast synchronous checks
const usageCache = new Map<string, number>();

function cacheKey(orgId: string, period: string): string {
  return `${orgId}:${period}`;
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Seed cache from DB value (call on bootstrap) */
export function seedUsage(orgId: string, amount: number, period?: string): void {
  usageCache.set(cacheKey(orgId, period || currentPeriod()), amount);
}

/** Sync read from cache */
export function getUsage(orgId: string, period?: string): number {
  return usageCache.get(cacheKey(orgId, period || currentPeriod())) || 0;
}

/** Increment cache + persist to store */
export function incrementUsage(orgId: string, amount: number = 1): number {
  const p = currentPeriod();
  const key = cacheKey(orgId, p);
  const current = usageCache.get(key) || 0;
  const next = current + amount;
  usageCache.set(key, next);

  // Fire-and-forget DB write
  activeStore.recordUsage(orgId, 'mcp_chat', amount, p).catch(() => {});

  return next;
}

/** Async: load from DB into cache */
export async function loadUsageFromDb(orgId: string, period?: string): Promise<number> {
  const p = period || currentPeriod();
  const count = await activeStore.getUsageCount(orgId, p);
  usageCache.set(cacheKey(orgId, p), count);
  return count;
}

export function getUsageRecord(orgId: string, usageType: string = 'mcp_chat'): {
  organizationId: string;
  usageType: string;
  amount: number;
  period: string;
} {
  return { organizationId: orgId, usageType, amount: 1, period: currentPeriod() };
}

export function getUsageSummary(orgId: string, plan: PlanKey): UsageSummary {
  const period = currentPeriod();
  const used = getUsage(orgId, period);
  const entitlements = getPlanEntitlements(plan);
  const limit = entitlements.max_mcp_calls_per_month;

  return {
    mcp_calls_used: used,
    mcp_calls_limit: limit,
    mcp_calls_remaining: Math.max(0, limit - used),
    is_over_limit: used >= limit,
    period,
  };
}

export function checkUsageLimit(orgId: string, plan: PlanKey): {
  allowed: boolean;
  summary: UsageSummary;
  upgrade_message: string | null;
} {
  const summary = getUsageSummary(orgId, plan);

  if (summary.is_over_limit) {
    let upgradeMessage: string;
    if (plan === 'vestigio') {
      upgradeMessage = `You've used all ${summary.mcp_calls_limit} MCP calls this month. Upgrade to Pro for ${getPlanEntitlements('pro').max_mcp_calls_per_month} calls/month.`;
    } else if (plan === 'pro') {
      upgradeMessage = `You've used all ${summary.mcp_calls_limit} MCP calls this month. Upgrade to Max for ${getPlanEntitlements('max').max_mcp_calls_per_month} calls/month.`;
    } else {
      upgradeMessage = `You've used all ${summary.mcp_calls_limit} MCP calls this month. Purchase additional credits to continue.`;
    }
    return { allowed: false, summary, upgrade_message: upgradeMessage };
  }

  return { allowed: true, summary, upgrade_message: null };
}

export function resetUsage(orgId: string): void {
  usageCache.delete(cacheKey(orgId, currentPeriod()));
  memoryStore.delete(`${orgId}:${currentPeriod()}`);
}

export function resetAllUsage(): void {
  usageCache.clear();
  memoryStore.clear();
}
