// ──────────────────────────────────────────────
// Plan Types — Vestigio SaaS Plans + Entitlements
// ──────────────────────────────────────────────

export type PlanKey = 'vestigio' | 'pro' | 'max';
export type AuditFrequency = 'none' | 'low' | 'high';

export interface PlanLimits {
  daily_mcp_budget: number;
  audit_frequency: AuditFrequency;
  playwright_budget: number;
}

export interface PlanEntitlements {
  plan: PlanKey;
  label: string;
  max_mcp_calls_per_month: number;
  continuous_audits_enabled: boolean;
  credits_enabled: boolean;
  max_environments: number;
  max_members: number;
  limits: PlanLimits;
}

export interface PlanPricing {
  plan: PlanKey;
  stripe_price_id: string;
  monthly_price_cents: number;
}

export interface UsageSummary {
  mcp_calls_used: number;
  mcp_calls_limit: number;
  mcp_calls_remaining: number;
  is_over_limit: boolean;
  period: string; // YYYY-MM
}

// ──────────────────────────────────────────────
// Daily Usage Tracking
// ──────────────────────────────────────────────

export interface DailyUsage {
  mcp_queries: number;
  estimated_tokens: number;
  playwright_runs: number;
}

export interface DailyUsageSummary {
  date: string; // YYYY-MM-DD
  usage: DailyUsage;
  limits: PlanLimits;
  mcp_remaining: number;
  playwright_remaining: number;
  mcp_pct: number;       // 0-100
  playwright_pct: number; // 0-100
}

// ──────────────────────────────────────────────
// MCP Guard Result
// ──────────────────────────────────────────────

export type McpGuardResult =
  | { status: 'allowed'; summary: DailyUsageSummary }
  | { status: 'blocked'; reason: string; summary: DailyUsageSummary };

// ──────────────────────────────────────────────
// Audit Scheduler Types
// ──────────────────────────────────────────────

export type AuditTrigger = 'onboarding_complete' | 'manual_refresh' | 'time_based' | 'mcp_triggered';
export type AuditType = 'incremental' | 'full';

export interface ScheduledAudit {
  id: string;
  environment_id: string;
  trigger: AuditTrigger;
  audit_type: AuditType;
  scheduled_at: Date;
  status: 'pending' | 'running' | 'complete' | 'failed';
}

// ──────────────────────────────────────────────
// Analysis Job (Execution Orchestration)
// ──────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'partial' | 'complete' | 'failed';

export interface AnalysisJob {
  id: string;
  environment_id: string;
  organization_id: string;
  status: JobStatus;
  progress: number;          // 0-100
  stages_completed: string[];
  created_at: Date;
  updated_at: Date;
  error?: string;
}

// ──────────────────────────────────────────────
// Cost Guardrail Context
// ──────────────────────────────────────────────

export interface ExpensiveOperationContext {
  operation: 'playwright_run' | 'deep_crawl' | 'full_audit' | 'mcp_query';
  organization_id: string;
  environment_id: string;
  estimated_cost_units: number;
}
