import { PlanKey, ExpensiveOperationContext } from '../../packages/plans';
import { getDailyUsageSummary } from './daily-usage';

// ──────────────────────────────────────────────
// Cost Guardrails — internal safety layer
//
// Prevents excessive resource consumption:
//   - Excessive Playwright runs
//   - Deep crawl loops
//   - Redundant full audits
//   - MCP budget overruns
//
// All decisions are internal — no user-facing
// upgrade prompts. Just block or allow.
// ──────────────────────────────────────────────

// Maximum cost units per operation type per day (internal hard caps)
const HARD_CAPS: Record<string, number> = {
  playwright_run: 30,   // even Max plan capped at 30/day total
  deep_crawl: 10,       // max 10 deep crawl triggers/day
  full_audit: 3,        // max 3 full audits/day
  mcp_query: 150,       // hard cap even for Max
};

// In-memory counters (per org per day)
const dailyOpCounts = new Map<string, number>();

function opKey(orgId: string, operation: string): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${orgId}:${operation}:${day}`;
}

function getOpCount(orgId: string, operation: string): number {
  return dailyOpCounts.get(opKey(orgId, operation)) || 0;
}

function incrementOp(orgId: string, operation: string): void {
  const key = opKey(orgId, operation);
  dailyOpCounts.set(key, (dailyOpCounts.get(key) || 0) + 1);
}

// ──────────────────────────────────────────────
// Main Guard
// ──────────────────────────────────────────────

export interface GuardrailResult {
  allowed: boolean;
  reason: string | null;
  current_count: number;
  hard_cap: number;
}

export async function shouldExecuteExpensiveOperation(
  context: ExpensiveOperationContext,
  plan: PlanKey,
): Promise<GuardrailResult> {
  const { operation, organization_id } = context;
  const currentCount = getOpCount(organization_id, operation);
  const hardCap = HARD_CAPS[operation] || 10;

  // Hard cap check
  if (currentCount >= hardCap) {
    return {
      allowed: false,
      reason: `Daily hard cap reached for ${operation}: ${currentCount}/${hardCap}`,
      current_count: currentCount,
      hard_cap: hardCap,
    };
  }

  // Plan-aware budget check
  const summary = await getDailyUsageSummary(organization_id, plan);

  if (operation === 'playwright_run' && summary.usage.playwright_runs >= summary.limits.playwright_budget) {
    return {
      allowed: false,
      reason: `Playwright daily budget exhausted: ${summary.usage.playwright_runs}/${summary.limits.playwright_budget}`,
      current_count: currentCount,
      hard_cap: hardCap,
    };
  }

  if (operation === 'mcp_query' && summary.usage.mcp_queries >= summary.limits.daily_mcp_budget) {
    return {
      allowed: false,
      reason: `MCP daily budget exhausted: ${summary.usage.mcp_queries}/${summary.limits.daily_mcp_budget}`,
      current_count: currentCount,
      hard_cap: hardCap,
    };
  }

  // Record the operation
  incrementOp(organization_id, operation);

  return {
    allowed: true,
    reason: null,
    current_count: currentCount + 1,
    hard_cap: hardCap,
  };
}

// ──────────────────────────────────────────────
// Deep Crawl Loop Detection
// ──────────────────────────────────────────────

const crawlHistory = new Map<string, Set<string>>();

export function recordCrawlUrl(environmentId: string, url: string): boolean {
  if (!crawlHistory.has(environmentId)) {
    crawlHistory.set(environmentId, new Set());
  }
  const urls = crawlHistory.get(environmentId)!;
  if (urls.has(url)) return false; // duplicate — loop detected
  urls.add(url);
  return true;
}

export function getCrawlCount(environmentId: string): number {
  return crawlHistory.get(environmentId)?.size || 0;
}

export function clearCrawlHistory(environmentId: string): void {
  crawlHistory.delete(environmentId);
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetGuardrails(): void {
  dailyOpCounts.clear();
  crawlHistory.clear();
}
