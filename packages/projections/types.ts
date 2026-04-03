// ──────────────────────────────────────────────
// Projection Types — read models for UI surfaces
//
// Projections are deterministic, derived from MultiPackResult.
// No business logic. No inference. Pure data shaping.
// ──────────────────────────────────────────────

export interface FindingProjection {
  id: string;
  title: string;
  root_cause: string | null;
  severity: string;
  confidence: number;

  impact: {
    monthly_range: { min: number; max: number };
    midpoint: number;
    impact_type: string;
    percentage_delta: number | null;
    currency: string;
  };

  pack: string;
  surface: string;
  freshness: string;
  inference_key: string;
  reasoning: string;
  cause: string;
  effect: string;
  basis_type: string;
  eligibility: {
    eligible: boolean;
    confidence: number;
  };
  polarity: 'negative' | 'positive' | 'neutral';

  /** Phase 27: Truth provenance — was this finding's evidence contested? */
  truth_context: FindingTruthContext | null;
  /** Phase 27: Suppression context — is this finding affected by suppression? */
  suppression_context: FindingSuppressionContext | null;

  /** Phase 0 UX: Verification lifecycle maturity */
  verification_maturity: 'unverified' | 'pending' | 'partially' | 'verified' | 'degraded' | 'stale' | null;
  /** Phase 0 UX: How this finding was verified */
  verification_method: 'static_only' | 'browser_verified' | 'mixed' | 'unknown';
  /** Phase 0 UX: Change class from cycle-to-cycle change detection */
  change_class: 'regression' | 'improvement' | 'new_issue' | 'resolved' | 'stable_risk' | null;
  /** Phase 0 UX: Aggregated evidence quality scores */
  evidence_quality: {
    source_reliability: number;
    completeness: number;
    recency: number;
    corroboration: number;
    composite: number;
  } | null;
}

export interface FindingTruthContext {
  /** Whether the backing signals had contradictions */
  has_contradictions: boolean;
  /** Number of contradictions */
  contradiction_count: number;
  /** Confidence impact from truth resolution */
  truth_confidence_delta: number;
}

export interface FindingSuppressionContext {
  /** Whether this finding is affected by active suppression */
  is_suppressed: boolean;
  /** How visible this finding should be */
  visibility: 'hidden' | 'dimmed' | 'annotated' | 'visible';
  /** Confidence reduction from suppression */
  confidence_reduction: number;
  /** User-facing explanation */
  explanation: string;
}

export interface ActionProjection {
  id: string;
  title: string;
  description: string;
  root_cause: string | null;

  impact: {
    monthly_range: { min: number; max: number };
    midpoint: number;
  } | null;

  confidence: number;
  cross_pack: boolean;
  priority_score: number;
  severity: string;
  action_type: string;

  /** Phase 1B UX: Categorized action type for operational display */
  category: 'incident' | 'opportunity' | 'verification' | 'observation';
  /** Phase 1B UX: Operational status from matching incident/opportunity */
  operational_status: string | null;
  /** Phase 1B UX: Decision lifecycle status */
  decision_status: string | null;
  /** Phase 1B UX: Effort hint from domain action or global action */
  effort_hint: string | null;
  /** Phase 1B UX: Change class from cycle-to-cycle change detection */
  change_class: 'regression' | 'improvement' | 'new_issue' | 'resolved' | 'stable_risk' | null;
  /** Phase 1B UX: Verification lifecycle maturity */
  verification_maturity: 'unverified' | 'pending' | 'partially' | 'verified' | 'degraded' | 'stale' | null;
  /** Phase 1B UX: Suggested resolution path */
  resolve_path: 'fix' | 'verify' | 'track' | 'dismiss' | null;
}

export interface WorkspaceProjection {
  id: string;
  name: string;
  type: 'preflight' | 'revenue' | 'chargeback';
  pack_key: string;
  decision_key: string;
  decision_impact: string;

  summary: {
    total_loss_range: { min: number; max: number };
    total_loss_mid: number;
    top_issues: string[];
    confidence: number;
    issue_count: number;
    currency: string;
  };

  findings: FindingProjection[];

  /** Coherence context from cross-pack conflict resolution */
  coherence: WorkspaceCoherence | null;

  /** Phase 27: Profile-aware trust narrative */
  confidence_narrative: ConfidenceNarrative | null;

  /** Phase 2 UX: Workspace-level change summary from continuous monitoring */
  change_summary: {
    trend: 'improving' | 'degrading' | 'stable' | 'mixed';
    regression_count: number;
    improvement_count: number;
    resolved_count: number;
  } | null;
}

/**
 * Communicates the distinction between structural truth and economic certainty.
 * "This conclusion is structurally correct, but economically uncertain."
 */
export interface ConfidenceNarrative {
  /** Whether the structural analysis is reliable */
  structural_confidence: 'high' | 'medium' | 'low';
  /** Whether the economic estimates are reliable */
  economic_confidence: 'high' | 'medium' | 'low';
  /** Human-readable narrative for the user */
  narrative: string;
  /** Factors reducing economic confidence */
  uncertainty_factors: string[];
}

export interface WorkspaceCoherence {
  coherence_score: number;        // 0..100 — how internally consistent across packs
  has_conflicts: boolean;
  conflict_annotations: string[]; // user-facing notes about conflicts affecting this workspace
  suppressed: boolean;            // true if this workspace's decision is suppressed by a higher-priority pack
}

export interface DecisionChangeProjection {
  decision_key: string;
  title: string;
  change_class: string;
  change_severity: string;
  risk_score_delta: number;
  previous_severity: string | null;
  current_severity: string | null;
  previous_impact: string | null;
  current_impact: string | null;
  contributing_factors: string[];
}

export interface ChangeReportProjection {
  headline: string;
  overall_trend: 'improving' | 'degrading' | 'stable' | 'mixed';
  regression_count: number;
  improvement_count: number;
  new_issue_count: number;
  resolved_count: number;
  stable_risk_count: number;
  regressions: DecisionChangeProjection[];
  improvements: DecisionChangeProjection[];
  new_issues: DecisionChangeProjection[];
  resolved: DecisionChangeProjection[];
  previous_cycle_ref: string | null;
  current_cycle_ref: string | null;
}

export interface ProjectionResult {
  findings: FindingProjection[];
  actions: ActionProjection[];
  workspaces: WorkspaceProjection[];
  /** Overall cross-pack coherence score */
  coherence_score: number;
  /** Phase 27: System health indicators */
  system_health: SystemHealthIndicators | null;
  /** Phase 1C: Change report projection */
  change_report: ChangeReportProjection | null;
}

export interface SystemHealthIndicators {
  /** Whether the confidence pipeline is healthy (no double-penalization, etc.) */
  confidence_healthy: boolean;
  /** Whether all behavioral validations passed */
  behavior_valid: boolean;
  /** Whether truth is globally consistent */
  truth_consistent: boolean;
  /** Number of suppression blind spots */
  blind_spot_count: number;
  /** Overall change trend (if change detection ran) */
  change_trend: 'improving' | 'degrading' | 'stable' | 'mixed' | null;
}

// ──────────────────────────────────────────────
// Engine Translations — i18n support for engine output
//
// Mirrors the `engine` section of dictionary/{locale}.json.
// Passed through the engine chain to produce localized projections.
// ──────────────────────────────────────────────

export interface EngineTranslations {
  inference_titles: Record<string, string>;
  root_cause_titles: Record<string, string>;
  root_cause_descriptions: Record<string, string>;
  positive_checks: Record<string, { title: string; description: string }>;
  field_kind_labels: Record<string, string>;
  parametric_titles: Record<string, string>;
  actions: {
    default_primary: string;
    default_verification: string;
    scale_readiness: Record<string, string>;
    revenue_integrity: Record<string, string>;
    chargeback: Record<string, string>;
  };
  summaries: Record<string, string>;
  confidence_narrative: Record<string, string>;
  workspace_names: Record<string, string>;
}
