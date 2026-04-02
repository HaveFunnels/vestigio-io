import { PlanKey, PlanLimits, AuditFrequency } from '../../packages/plans';

// ──────────────────────────────────────────────
// Plan Config Admin — Tunable Plan Parameters
//
// Allows admin to tune per-plan:
//   - Daily MCP budget
//   - Playwright budget
//   - Audit frequency policy
//   - Estimated token cost assumptions
//   - Per-plan internal margin estimates
//
// IMPORTANT: Internal/admin-only.
// Users see clean plan behavior, NOT token accounting.
// ──────────────────────────────────────────────

export interface PlanConfig {
  plan: PlanKey;
  daily_mcp_budget: number;
  playwright_budget: number;
  audit_frequency: AuditFrequency;
  estimated_tokens_per_query: number;
  cost_per_mcp_query_cents: number;
  cost_per_playwright_run_cents: number;
  cost_per_1k_tokens_cents: number;
  monthly_price_cents: number;
}

// ──────────────────────────────────────────────
// Default Plan Configs
// ──────────────────────────────────────────────

const DEFAULT_CONFIGS: Record<PlanKey, PlanConfig> = {
  vestigio: {
    plan: 'vestigio',
    daily_mcp_budget: 5,
    playwright_budget: 0,
    audit_frequency: 'none',
    estimated_tokens_per_query: 500,
    cost_per_mcp_query_cents: 2,
    cost_per_playwright_run_cents: 15,
    cost_per_1k_tokens_cents: 3,
    monthly_price_cents: 9900,
  },
  pro: {
    plan: 'pro',
    daily_mcp_budget: 25,
    playwright_budget: 5,
    audit_frequency: 'low',
    estimated_tokens_per_query: 500,
    cost_per_mcp_query_cents: 2,
    cost_per_playwright_run_cents: 15,
    cost_per_1k_tokens_cents: 3,
    monthly_price_cents: 19900,
  },
  max: {
    plan: 'max',
    daily_mcp_budget: 100,
    playwright_budget: 20,
    audit_frequency: 'high',
    estimated_tokens_per_query: 500,
    cost_per_mcp_query_cents: 2,
    cost_per_playwright_run_cents: 15,
    cost_per_1k_tokens_cents: 3,
    monthly_price_cents: 39900,
  },
};

// Active configs — can be overridden by admin
const activeConfigs: Record<PlanKey, PlanConfig> = {
  vestigio: { ...DEFAULT_CONFIGS.vestigio },
  pro: { ...DEFAULT_CONFIGS.pro },
  max: { ...DEFAULT_CONFIGS.max },
};

// ──────────────────────────────────────────────
// Read / Write Config
// ──────────────────────────────────────────────

export function getPlanConfig(plan: PlanKey): PlanConfig {
  return { ...activeConfigs[plan] };
}

export function getAllPlanConfigs(): PlanConfig[] {
  return Object.values(activeConfigs).map(c => ({ ...c }));
}

export function updatePlanConfig(plan: PlanKey, updates: Partial<Omit<PlanConfig, 'plan'>>): PlanConfig {
  const config = activeConfigs[plan];

  if (updates.daily_mcp_budget !== undefined) {
    config.daily_mcp_budget = Math.max(1, Math.min(1000, updates.daily_mcp_budget));
  }
  if (updates.playwright_budget !== undefined) {
    config.playwright_budget = Math.max(0, Math.min(100, updates.playwright_budget));
  }
  if (updates.audit_frequency !== undefined) {
    config.audit_frequency = updates.audit_frequency;
  }
  if (updates.estimated_tokens_per_query !== undefined) {
    config.estimated_tokens_per_query = Math.max(100, Math.min(5000, updates.estimated_tokens_per_query));
  }
  if (updates.cost_per_mcp_query_cents !== undefined) {
    config.cost_per_mcp_query_cents = Math.max(0, updates.cost_per_mcp_query_cents);
  }
  if (updates.cost_per_playwright_run_cents !== undefined) {
    config.cost_per_playwright_run_cents = Math.max(0, updates.cost_per_playwright_run_cents);
  }
  if (updates.cost_per_1k_tokens_cents !== undefined) {
    config.cost_per_1k_tokens_cents = Math.max(0, updates.cost_per_1k_tokens_cents);
  }
  if (updates.monthly_price_cents !== undefined) {
    config.monthly_price_cents = Math.max(0, updates.monthly_price_cents);
  }

  return { ...config };
}

// ──────────────────────────────────────────────
// Unit Economics from Config
// ──────────────────────────────────────────────

export interface ConfigBasedEconomics {
  plan: PlanKey;
  monthly_price_cents: number;
  estimated_max_daily_cost_cents: number;
  estimated_max_monthly_cost_cents: number;
  margin_pct: number;
  breakdown: {
    mcp_daily_cost: number;
    playwright_daily_cost: number;
    token_daily_cost: number;
  };
}

export function computeConfigBasedEconomics(plan: PlanKey): ConfigBasedEconomics {
  const config = activeConfigs[plan];

  const mcpDailyCost = config.daily_mcp_budget * config.cost_per_mcp_query_cents;
  const playwrightDailyCost = config.playwright_budget * config.cost_per_playwright_run_cents;
  const tokenDailyCost = Math.round(
    (config.daily_mcp_budget * config.estimated_tokens_per_query / 1000) * config.cost_per_1k_tokens_cents,
  );

  const totalDailyCost = mcpDailyCost + playwrightDailyCost + tokenDailyCost;
  const monthlyCost = totalDailyCost * 30;
  const margin = config.monthly_price_cents > 0
    ? Math.round(((config.monthly_price_cents - monthlyCost) / config.monthly_price_cents) * 100)
    : 0;

  return {
    plan,
    monthly_price_cents: config.monthly_price_cents,
    estimated_max_daily_cost_cents: totalDailyCost,
    estimated_max_monthly_cost_cents: monthlyCost,
    margin_pct: margin,
    breakdown: {
      mcp_daily_cost: mcpDailyCost,
      playwright_daily_cost: playwrightDailyCost,
      token_daily_cost: tokenDailyCost,
    },
  };
}

export function getAllConfigBasedEconomics(): ConfigBasedEconomics[] {
  return (['vestigio', 'pro', 'max'] as PlanKey[]).map(computeConfigBasedEconomics);
}

// ──────────────────────────────────────────────
// Config Change Log
// ──────────────────────────────────────────────

export interface ConfigChangeEntry {
  timestamp: Date;
  plan: PlanKey;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
}

const changeLog: ConfigChangeEntry[] = [];

export function recordConfigChange(
  plan: PlanKey,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  changedBy: string = 'admin',
): void {
  changeLog.push({ timestamp: new Date(), plan, field, old_value: oldValue, new_value: newValue, changed_by: changedBy });
}

export function getConfigChangeLog(limit: number = 50): ConfigChangeEntry[] {
  return changeLog.slice(-limit);
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetPlanConfigs(): void {
  activeConfigs.vestigio = { ...DEFAULT_CONFIGS.vestigio };
  activeConfigs.pro = { ...DEFAULT_CONFIGS.pro };
  activeConfigs.max = { ...DEFAULT_CONFIGS.max };
  changeLog.length = 0;
}
