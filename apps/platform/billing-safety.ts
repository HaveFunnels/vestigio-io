import { PlanKey } from '../../packages/plans';
import { getDailyUsageSummary, todayString } from './daily-usage';

// ──────────────────────────────────────────────
// Billing Safety — overflow protection + audit log
//
// Ensures:
//   - Usage never exceeds limits
//   - No negative counters
//   - All operations logged and auditable
//   - Safe math (no overflow)
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Usage Log (Auditable)
// ──────────────────────────────────────────────

export interface UsageLogEntry {
  timestamp: Date;
  organization_id: string;
  operation: string;
  amount: number;
  daily_total_after: number;
  limit: number;
  allowed: boolean;
  reason: string | null;
}

const usageLog: UsageLogEntry[] = [];
const MAX_LOG_ENTRIES = 10000;

export function logUsageEvent(entry: UsageLogEntry): void {
  usageLog.push(entry);
  // Prevent unbounded growth
  if (usageLog.length > MAX_LOG_ENTRIES) {
    usageLog.splice(0, usageLog.length - MAX_LOG_ENTRIES);
  }
}

export function getUsageLog(orgId?: string, limit: number = 100): UsageLogEntry[] {
  const filtered = orgId ? usageLog.filter(e => e.organization_id === orgId) : usageLog;
  return filtered.slice(-limit);
}

// ──────────────────────────────────────────────
// Safe Usage Increment — never exceeds limit
// ──────────────────────────────────────────────

export interface SafeIncrementResult {
  allowed: boolean;
  current: number;
  limit: number;
  reason: string | null;
}

export async function safeIncrementMcpUsage(
  orgId: string,
  plan: PlanKey,
): Promise<SafeIncrementResult> {
  const summary = await getDailyUsageSummary(orgId, plan);
  const { mcp_queries } = summary.usage;
  const limit = summary.limits.daily_mcp_budget;

  if (mcp_queries >= limit) {
    logUsageEvent({
      timestamp: new Date(),
      organization_id: orgId,
      operation: 'mcp_query',
      amount: 0,
      daily_total_after: mcp_queries,
      limit,
      allowed: false,
      reason: 'Daily limit reached',
    });
    return { allowed: false, current: mcp_queries, limit, reason: 'Daily MCP limit reached.' };
  }

  logUsageEvent({
    timestamp: new Date(),
    organization_id: orgId,
    operation: 'mcp_query',
    amount: 1,
    daily_total_after: mcp_queries + 1,
    limit,
    allowed: true,
    reason: null,
  });

  return { allowed: true, current: mcp_queries + 1, limit, reason: null };
}

export async function safeIncrementPlaywrightUsage(
  orgId: string,
  plan: PlanKey,
): Promise<SafeIncrementResult> {
  const summary = await getDailyUsageSummary(orgId, plan);
  const { playwright_runs } = summary.usage;
  const limit = summary.limits.playwright_budget;

  if (playwright_runs >= limit) {
    logUsageEvent({
      timestamp: new Date(),
      organization_id: orgId,
      operation: 'playwright_run',
      amount: 0,
      daily_total_after: playwright_runs,
      limit,
      allowed: false,
      reason: 'Daily limit reached',
    });
    return { allowed: false, current: playwright_runs, limit, reason: 'Daily Playwright limit reached.' };
  }

  logUsageEvent({
    timestamp: new Date(),
    organization_id: orgId,
    operation: 'playwright_run',
    amount: 1,
    daily_total_after: playwright_runs + 1,
    limit,
    allowed: true,
    reason: null,
  });

  return { allowed: true, current: playwright_runs + 1, limit, reason: null };
}

// ──────────────────────────────────────────────
// Safe Math — prevent negative/overflow
// ──────────────────────────────────────────────

export function safeSubtract(a: number, b: number): number {
  return Math.max(0, a - b);
}

export function safeAdd(a: number, b: number, max: number = Number.MAX_SAFE_INTEGER): number {
  const result = a + b;
  if (result < 0) return 0; // overflow protection
  if (result > max) return max;
  return result;
}

// ──────────────────────────────────────────────
// Admin: Aggregate usage stats
// ──────────────────────────────────────────────

export interface OrgUsageStats {
  organization_id: string;
  date: string;
  mcp_queries: number;
  playwright_runs: number;
  estimated_tokens: number;
  is_over_mcp_limit: boolean;
  is_over_playwright_limit: boolean;
}

export async function getOrgUsageStats(
  orgId: string,
  plan: PlanKey,
  date?: string,
): Promise<OrgUsageStats> {
  const d = date || todayString();
  const summary = await getDailyUsageSummary(orgId, plan, d);

  return {
    organization_id: orgId,
    date: d,
    mcp_queries: summary.usage.mcp_queries,
    playwright_runs: summary.usage.playwright_runs,
    estimated_tokens: summary.usage.estimated_tokens,
    is_over_mcp_limit: summary.usage.mcp_queries >= summary.limits.daily_mcp_budget,
    is_over_playwright_limit: summary.usage.playwright_runs >= summary.limits.playwright_budget,
  };
}

// ──────────────────────────────────────────────
// Cost Estimation (Unit Economics)
// ──────────────────────────────────────────────

const COST_PER_MCP_QUERY_CENTS = 2;        // ~$0.02 per MCP query
const COST_PER_PLAYWRIGHT_RUN_CENTS = 15;   // ~$0.15 per Playwright run
const COST_PER_1K_TOKENS_CENTS = 3;         // ~$0.03 per 1K tokens

export interface CostEstimate {
  mcp_cost_cents: number;
  playwright_cost_cents: number;
  token_cost_cents: number;
  total_cost_cents: number;
}

export function estimateDailyCost(stats: OrgUsageStats): CostEstimate {
  const mcpCost = stats.mcp_queries * COST_PER_MCP_QUERY_CENTS;
  const playwrightCost = stats.playwright_runs * COST_PER_PLAYWRIGHT_RUN_CENTS;
  const tokenCost = Math.round((stats.estimated_tokens / 1000) * COST_PER_1K_TOKENS_CENTS);

  return {
    mcp_cost_cents: mcpCost,
    playwright_cost_cents: playwrightCost,
    token_cost_cents: tokenCost,
    total_cost_cents: mcpCost + playwrightCost + tokenCost,
  };
}

export interface PlanUnitEconomics {
  plan: PlanKey;
  monthly_price_cents: number;
  estimated_max_daily_cost_cents: number;
  estimated_max_monthly_cost_cents: number;
  margin_pct: number;
}

const PLAN_MONTHLY_CENTS: Record<PlanKey, number> = {
  vestigio: 9900,
  pro: 19900,
  max: 39900,
};

export function computePlanUnitEconomics(plan: PlanKey): PlanUnitEconomics {
  const { getPlanLimits } = require('../../packages/plans');
  const limits = getPlanLimits(plan);

  const maxDailyCost =
    (limits.daily_mcp_budget * COST_PER_MCP_QUERY_CENTS) +
    (limits.playwright_budget * COST_PER_PLAYWRIGHT_RUN_CENTS) +
    (limits.daily_mcp_budget * 500 / 1000 * COST_PER_1K_TOKENS_CENTS); // estimated 500 tokens per query

  const maxMonthlyCost = maxDailyCost * 30;
  const monthlyPrice = PLAN_MONTHLY_CENTS[plan];
  const margin = monthlyPrice > 0 ? Math.round(((monthlyPrice - maxMonthlyCost) / monthlyPrice) * 100) : 0;

  return {
    plan,
    monthly_price_cents: monthlyPrice,
    estimated_max_daily_cost_cents: maxDailyCost,
    estimated_max_monthly_cost_cents: maxMonthlyCost,
    margin_pct: margin,
  };
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetBillingLogs(): void {
  usageLog.length = 0;
}
