import { getPlanLimits, PlanKey, DailyUsage, DailyUsageSummary, McpGuardResult } from '../../packages/plans';

// ──────────────────────────────────────────────
// Daily Usage Tracking — capacity-based model
//
// Tracks per-org daily usage of:
//   - MCP queries
//   - Estimated tokens
//   - Playwright runs
//
// Resets daily. Enforces plan limits.
// In-memory store with DB persistence interface.
// ──────────────────────────────────────────────

export interface DailyUsageStore {
  get(orgId: string, date: string): Promise<DailyUsage>;
  increment(orgId: string, date: string, field: keyof DailyUsage, amount: number): Promise<DailyUsage>;
}

// ──────────────────────────────────────────────
// In-Memory Store
// ──────────────────────────────────────────────

const store = new Map<string, DailyUsage>();

function storeKey(orgId: string, date: string): string {
  return `${orgId}:${date}`;
}

function emptyUsage(): DailyUsage {
  return { mcp_queries: 0, estimated_tokens: 0, playwright_runs: 0 };
}

export class InMemoryDailyUsageStore implements DailyUsageStore {
  async get(orgId: string, date: string): Promise<DailyUsage> {
    return store.get(storeKey(orgId, date)) || emptyUsage();
  }

  async increment(orgId: string, date: string, field: keyof DailyUsage, amount: number): Promise<DailyUsage> {
    const key = storeKey(orgId, date);
    const current = store.get(key) || emptyUsage();
    current[field] = Math.max(0, current[field] + amount);
    store.set(key, current);
    return { ...current };
  }
}

// ──────────────────────────────────────────────
// Prisma-compatible Store
// ──────────────────────────────────────────────

export class PrismaDailyUsageStore implements DailyUsageStore {
  constructor(private prisma: any) {}

  async get(orgId: string, date: string): Promise<DailyUsage> {
    const rows = await this.prisma.usage.findMany({
      where: { organizationId: orgId, period: date },
    });
    const usage = emptyUsage();
    for (const row of rows) {
      if (row.usageType === 'mcp_daily') usage.mcp_queries += row.amount;
      if (row.usageType === 'tokens_daily') usage.estimated_tokens += row.amount;
      if (row.usageType === 'playwright_daily') usage.playwright_runs += row.amount;
    }
    return usage;
  }

  async increment(orgId: string, date: string, field: keyof DailyUsage, amount: number): Promise<DailyUsage> {
    const typeMap: Record<keyof DailyUsage, string> = {
      mcp_queries: 'mcp_daily',
      estimated_tokens: 'tokens_daily',
      playwright_runs: 'playwright_daily',
    };
    await this.prisma.usage.create({
      data: { organizationId: orgId, usageType: typeMap[field], amount, period: date },
    });
    return this.get(orgId, date);
  }
}

// ──────────────────────────────────────────────
// Active Store Singleton
// ──────────────────────────────────────────────

let activeStore: DailyUsageStore = new InMemoryDailyUsageStore();

export function setDailyUsageStore(s: DailyUsageStore): void { activeStore = s; }
export function getDailyUsageStore(): DailyUsageStore { return activeStore; }

// ──────────────────────────────────────────────
// Date helper
// ──────────────────────────────────────────────

export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function getDailyUsageSummary(orgId: string, plan: PlanKey, date?: string): Promise<DailyUsageSummary> {
  const d = date || todayString();
  const usage = await activeStore.get(orgId, d);
  const limits = getPlanLimits(plan);

  const mcpRemaining = Math.max(0, limits.daily_mcp_budget - usage.mcp_queries);
  const playwrightRemaining = Math.max(0, limits.playwright_budget - usage.playwright_runs);

  return {
    date: d,
    usage,
    limits,
    mcp_remaining: mcpRemaining,
    playwright_remaining: playwrightRemaining,
    mcp_pct: limits.daily_mcp_budget > 0 ? Math.round((usage.mcp_queries / limits.daily_mcp_budget) * 100) : 0,
    playwright_pct: limits.playwright_budget > 0 ? Math.round((usage.playwright_runs / limits.playwright_budget) * 100) : 0,
  };
}

export async function recordMcpQuery(orgId: string, estimatedTokens: number = 500): Promise<DailyUsage> {
  const d = todayString();
  await activeStore.increment(orgId, d, 'mcp_queries', 1);
  return activeStore.increment(orgId, d, 'estimated_tokens', estimatedTokens);
}

export async function recordPlaywrightRun(orgId: string): Promise<DailyUsage> {
  return activeStore.increment(orgId, todayString(), 'playwright_runs', 1);
}

// ──────────────────────────────────────────────
// MCP Guard — canExecuteMcpQuery
// ──────────────────────────────────────────────

export async function canExecuteMcpQuery(
  orgId: string,
  plan: PlanKey,
): Promise<McpGuardResult> {
  const summary = await getDailyUsageSummary(orgId, plan);

  if (summary.usage.mcp_queries >= summary.limits.daily_mcp_budget) {
    return {
      status: 'blocked',
      reason: `Daily MCP budget reached (${summary.limits.daily_mcp_budget}/${summary.limits.daily_mcp_budget}). Resets tomorrow.`,
      summary,
    };
  }

  return { status: 'allowed', summary };
}

// ──────────────────────────────────────────────
// Playwright Guard
// ──────────────────────────────────────────────

export async function canExecutePlaywright(
  orgId: string,
  plan: PlanKey,
): Promise<McpGuardResult> {
  const summary = await getDailyUsageSummary(orgId, plan);

  if (summary.limits.playwright_budget === 0) {
    return {
      status: 'blocked',
      reason: 'Playwright is not available on your plan. Upgrade to Pro or Max.',
      summary,
    };
  }

  if (summary.usage.playwright_runs >= summary.limits.playwright_budget) {
    return {
      status: 'blocked',
      reason: `Daily Playwright budget reached (${summary.limits.playwright_budget}/${summary.limits.playwright_budget}). Resets tomorrow.`,
      summary,
    };
  }

  return { status: 'allowed', summary };
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetDailyUsage(): void {
  store.clear();
  activeStore = new InMemoryDailyUsageStore();
}
