import {
  Ref,
  Scoping,
  FreshnessState,
  EffectiveSeverity,
  DecisionImpact,
  VerificationType,
} from '../../packages/domain';
import type {
  RootCauseSeverity,
  ImpactDimension,
} from '../../packages/intelligence';

// ──────────────────────────────────────────────
// MCP Request Contracts
// ──────────────────────────────────────────────

export interface McpRequestScope {
  workspace_ref: string;
  environment_ref: string;
  subject_ref?: string;
  path_scope?: string;
}

export interface McpToolRequest<P = Record<string, unknown>> {
  tool_name: string;
  scope: McpRequestScope;
  params: P;
}

// ──────────────────────────────────────────────
// MCP Response Contracts
// ──────────────────────────────────────────────

export interface McpAnswer {
  direct_answer: string;
  confidence: number;          // 0..100
  freshness: FreshnessState;
  staleness_reason: string | null;
  why: string[];
  recommended_next_step: string;
  supporting_refs: Ref[];
  optional_verification: VerificationSuggestion | null;
  impact_summary: McpImpactSummary | null;
  navigation: McpAnswerNavigation | null;
  suggestions: McpSuggestions | null;
  contextual_focus: McpContextualFocus | null;
}

export interface McpAnswerNavigation {
  related_findings: string[];
  related_actions: string[];
  related_workspace: string | null;
  suggested_map: string | null;
  suggestions: string[];
}

// ──────────────────────────────────────────────
// Active Intelligence — Suggestions + Context
// ──────────────────────────────────────────────

export interface McpSuggestions {
  questions: string[];
  actions: string[];
  navigation: {
    open_workspace?: string;
    open_map?: string;
    open_analysis?: boolean;
    open_actions?: boolean;
  };
}

export interface McpContextualFocus {
  finding?: FindingChatContext;
  multi_finding?: MultiFindingContext;
}

export interface FindingChatContext {
  finding_id: string;
  title: string;
  root_cause: string | null;
  impact: {
    monthly_range: { min: number; max: number };
    midpoint: number;
  };
  effect: string;
  severity: string;
  pack: string;
  suggested_prompts: string[];
}

export interface MultiFindingContext {
  finding_ids: string[];
  combined_impact: {
    monthly_range: { min: number; max: number };
    midpoint: number;
  };
  shared_root_causes: string[];
  relationships: string[];
  suggested_prompts: string[];
}

export interface McpSessionContext {
  active_workspace?: string;
  selected_findings?: string[];
  selected_actions?: string[];
  last_viewed_map?: string;
  exploration_state: {
    explored_packs: string[];
    explored_root_causes: string[];
    explored_maps: string[];
    asked_questions: string[];
  };
}

export interface McpImpactSummary {
  total_monthly_loss_range: { min: number; max: number };
  total_monthly_loss_mid: number;
  highest_impact_issue: string | null;
  highest_impact_value: number;
  confidence_level: number;
  currency: string;
}

export interface VerificationSuggestion {
  verification_type: VerificationType;
  reason: string;
  expected_benefit: string;
}

// ──────────────────────────────────────────────
// Resource Views — typed read-only projections
// ──────────────────────────────────────────────

export interface WorkspaceSummaryView {
  workspace_ref: string;
  environment_ref: string;
  cycle_ref: string;
  packs: PackSummaryView[];
  root_causes: RootCauseSummaryView[];
  prioritized_actions: ActionSummaryView[];
  overall_health: HealthStatus;
  confidence: number;
  freshness: FreshnessState;
}

export type HealthStatus = 'healthy' | 'at_risk' | 'critical' | 'unknown';

export interface PackSummaryView {
  pack_key: string;
  label: string;
  decision_key: string;
  decision_impact: DecisionImpact;
  effective_severity: EffectiveSeverity;
  confidence: number;
  summary: string;
}

export interface RootCauseSummaryView {
  root_cause_key: string;
  title: string;
  severity: RootCauseSeverity;
  confidence: number;
  impact_types: ImpactDimension[];
  affected_packs: string[];
  inference_count: number;
}

export interface ActionSummaryView {
  action_key: string;
  title: string;
  priority: number;
  severity: string;
  confidence: number;
  cross_pack_impact: number;
  action_type: string;
  root_cause_title: string | null;
}

export interface DecisionExplainabilityView {
  decision_key: string;
  question_key: string;
  pack_key: string;
  summary: string;
  confidence: number;
  freshness: FreshnessState;
  effective_severity: EffectiveSeverity;
  decision_impact: DecisionImpact;
  why_signals: string[];
  why_inferences: string[];
  why_evidence_count: number;
  actions: {
    primary: string;
    secondary: string[];
    verification: string[];
  };
  root_causes: RootCauseSummaryView[];
}

export interface PreflightStatusView {
  overall_status: string;
  readiness_score: number;
  confidence: number;
  blockers: PreflightItemView[];
  risks: PreflightItemView[];
  decision_summary: string;
  freshness: FreshnessState;
}

export interface PreflightItemView {
  title: string;
  description: string;
  severity: string;
}

export interface RevenueIntegritySummaryView {
  decision_key: string;
  risk_level: string;
  confidence: number;
  freshness: FreshnessState;
  leakage_points: LeakagePointView[];
  trust_issues: string[];
  measurement_gaps: string[];
  where_money_is_lost: string[];
  what_to_fix_first: string[];
}

export interface LeakagePointView {
  title: string;
  description: string;
  severity: string;
}

export interface GraphPathSummaryView {
  total_nodes: number;
  total_edges: number;
  internal_pages: number;
  external_hosts: number;
  providers: string[];
  policies: string[];
  redirect_count: number;
  trust_gaps: number;
}

// ──────────────────────────────────────────────
// Verification Request (MCP-emitted)
// ──────────────────────────────────────────────

export interface McpVerificationRequest {
  verification_type: VerificationType;
  subject_ref: string;
  reason: string;
  decision_ref: Ref | null;
  requested_by: 'mcp';
}

// ──────────────────────────────────────────────
// Tool Adapter Interfaces (future extensibility)
// ──────────────────────────────────────────────

export interface ToolCapability {
  tool_id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  available: boolean;
  cost_level: 'free' | 'low' | 'medium' | 'high';
}

export interface ToolExecutionRequest {
  tool_id: string;
  input: Record<string, unknown>;
  scope: McpRequestScope;
  reason: string;
}

export interface ToolExecutionResult {
  tool_id: string;
  status: 'completed' | 'failed' | 'pending';
  output: Record<string, unknown> | null;
  error: string | null;
  evidence_refs: Ref[];
}

// ──────────────────────────────────────────────
// MCP Server Registration Types
// ──────────────────────────────────────────────

export interface McpResourceDefinition {
  name: string;
  description: string;
  uri_template: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
