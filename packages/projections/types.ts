// ──────────────────────────────────────────────
// Projection Types — read models for UI surfaces
//
// Projections are deterministic, derived from MultiPackResult.
// No business logic. No inference. Pure data shaping.
// ──────────────────────────────────────────────

/**
 * Verification lifecycle stage — projection-layer string union.
 *
 * Wave 2.4 renamed these from `unverified/pending/partially/verified/degraded/stale`
 * to language that does NOT suggest the finding might be fake. The previous
 * vocabulary framed browser verification as a check on whether the finding
 * was real. The new vocabulary frames it as **corroboration** layered on top
 * of static evidence that is already real.
 *
 * Mapping from the engine's internal `VerificationMaturity` enum
 * (in packages/verification-lifecycle) is done in the projection engine —
 * the engine's enum stays unchanged; only the projection-layer string the
 * UI consumes was renamed.
 *
 * | New key                  | What it means                                                |
 * |--------------------------|--------------------------------------------------------------|
 * | `static_evidence`        | Real evidence collected from HTTP, HTML, scripts, policies. |
 * |                          | Browser verification has not been run yet (and may not be   |
 * |                          | needed for low-severity findings).                          |
 * | `confirming`             | Browser verification is currently running.                  |
 * | `partial_confirmation`   | Browser corroborated some but not all of the signals.       |
 * | `confirmed`              | Browser verification corroborated the finding in runtime.   |
 * | `evidence_weakened`      | Was confirmed once, but a re-check shows the supporting    |
 * |                          | evidence has weakened since then.                           |
 * | `confirmation_expired`   | Was confirmed once, but the confirmation is now too old to |
 * |                          | be trusted without re-checking.                             |
 */
export type VerificationStage =
  | 'static_evidence'
  | 'confirming'
  | 'partial_confirmation'
  | 'confirmed'
  | 'evidence_weakened'
  | 'confirmation_expired';

/**
 * Translate a legacy verification maturity string to the new Wave 2.4 vocabulary.
 * Used at deserialization boundaries (e.g. PrismaFindingStore.loadLatestForEnvironment)
 * so persisted projections from cycles run before Wave 2.4 still render correctly.
 * Returns null when input is null/unknown.
 */
export function migrateLegacyVerificationMaturity(
  raw: string | null | undefined,
): VerificationStage | null {
  if (!raw) return null;
  switch (raw) {
    // New keys — pass through unchanged
    case 'static_evidence':
    case 'confirming':
    case 'partial_confirmation':
    case 'confirmed':
    case 'evidence_weakened':
    case 'confirmation_expired':
      return raw;
    // Legacy keys — translate
    case 'unverified': return 'static_evidence';
    case 'pending': return 'confirming';
    case 'partially': return 'partial_confirmation';
    case 'verified': return 'confirmed';
    case 'degraded': return 'evidence_weakened';
    case 'stale': return 'confirmation_expired';
    default: return null;
  }
}

/**
 * Wave 2.4: confidence is bucketed into 3 tiers at the projection layer.
 * The numeric `confidence` field stays for backend consumers (engine,
 * change detection, calibration, MCP internal context, sorting), but the
 * UI consumes only `confidence_tier`. Low-tier findings are filtered
 * out of the projection entirely so users only see findings the engine
 * actually has reasonable evidence for.
 *
 * Thresholds (aligned with the engine's existing internal floor of 40
 * used in `packages/intelligence/root-causes.ts` and `packages/impact/engine.ts`):
 *   confidence >= 70   → 'high'    (strong signal — multiple converging inferences)
 *   confidence >= 40   → 'medium'  (standard signal — visible to user)
 *   confidence < 40    → 'low'     (filtered out before reaching the UI)
 *
 * 40 is the same threshold the engine already uses to skip low-quality
 * inferences in root-cause grouping, so a `low` confidence_tier finding
 * is already a finding the engine itself decided not to roll up.
 */
export type ConfidenceTier = 'low' | 'medium' | 'high';

/**
 * Derive the confidence tier from a numeric confidence score. Single
 * source of truth so projection, MCP, and any backend consumer that
 * needs the tier all agree.
 */
export function deriveConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 70) return 'high';
  if (confidence >= 40) return 'medium';
  return 'low';
}

export interface FindingProjection {
  id: string;
  title: string;
  root_cause: string | null;
  severity: string;
  /** Numeric confidence score from the engine (0-100). NOT exposed to the UI
   * directly anymore — use `confidence_tier` for any user-facing logic. */
  confidence: number;
  /** Bucketed confidence tier — `low` findings are filtered out of the
   * projection entirely, so any FindingProjection that reaches the UI is
   * either `medium` or `high`. */
  confidence_tier: ConfidenceTier;

  impact: {
    monthly_range: { min: number; max: number };
    midpoint: number;
    impact_type: string;
    percentage_delta: number | null;
    currency: string;
    /**
     * Whether the monetary range is LOSS (money leaving the business
     * through this finding) or RETENTION (money the business is
     * keeping because a control is in place). Defaults to 'loss' on
     * legacy persisted projections that predate Phase 1.2. UI should
     * frame retained value as "retido" / "retained" rather than
     * "custo" / "cost".
     */
    role: 'loss' | 'retention';
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

  /** Verification lifecycle stage. Wave 2.4: renamed from "unverified/pending/..."
   * to operator-facing language that frames browser verification as an
   * additive enrichment layer on top of static evidence — not as a
   * "this finding might not be real" check. Static evidence is real
   * collected data; verification is corroboration. */
  verification_maturity: VerificationStage | null;
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

  /**
   * Ordered remediation steps for the finding. Surface-level cards
   * show step[0] as a preview; expanded view renders the full list.
   * Null when the backing Action has no backfilled template yet —
   * Phase 2 populates per action_key.
   */
  remediation_steps: string[] | null;
  /** Quantitative effort estimate in dev-hours. Null when uncalibrated. */
  estimated_effort_hours: number | null;
  /**
   * How this finding is re-verified when the user clicks Verify.
   * Null for findings without a backfilled classification yet —
   * Phase 2.5 populates per inference_key. See Action.verification_strategy
   * for the taxonomy + what each strategy dispatches.
   */
  verification_strategy:
    | 'http_static'
    | 'browser_runtime'
    | 'integration_pull'
    | 'external_scan'
    | 'pixel_accumulation'
    | 'heuristic_recompute'
    | 'reuse_only'
    | 'not_verifiable_explain'
    | null;
  /** User-facing copy describing the verification action. */
  verification_notes: string | null;
  /** Expected seconds the verification will take. Null for strategies
   * without a time-bounded dispatch (pixel_accumulation reports session
   * progress via verification_notes instead). */
  verification_eta_seconds: number | null;

  // ── Cross-references (3.20 Unified Entity Architecture) ──
  /** Workspaces where this finding appears (resolved from pack → workspace mapping). */
  workspace_refs: { id: string; name: string; type: string }[];
  /** Actions linked to this finding (resolved via root_cause → global_action chain). */
  action_refs: { id: string; title: string; status: string | null; category: string }[];
  /** Opportunity linked to this finding, if one exists. */
  opportunity_ref: { id: string; hypothesis: string; value_range: { min: number; max: number } } | null;
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
  /** Stable key for linking to knowledge base / external systems. */
  root_cause_key: string | null;

  impact: {
    monthly_range: { min: number; max: number };
    midpoint: number;
  } | null;

  /** Numeric confidence — kept for priority_score calculation and backend
   * consumers. NOT exposed to the UI; use `confidence_tier` instead. */
  confidence: number;
  /** Bucketed confidence tier for the UI. See FindingProjection.confidence_tier. */
  confidence_tier: ConfidenceTier;
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
  /** Phase 1B UX: Effort hint from domain action or global action (qualitative). */
  effort_hint: string | null;
  /**
   * Ordered remediation steps. See FindingProjection.remediation_steps.
   * Null for actions without a backfilled template.
   */
  remediation_steps: string[] | null;
  /** Quantitative effort estimate in dev-hours. Null when uncalibrated. */
  estimated_effort_hours: number | null;
  /** How this action is re-verified. See FindingProjection.verification_strategy. */
  verification_strategy:
    | 'http_static'
    | 'browser_runtime'
    | 'integration_pull'
    | 'external_scan'
    | 'pixel_accumulation'
    | 'heuristic_recompute'
    | 'reuse_only'
    | 'not_verifiable_explain'
    | null;
  /** User-facing copy describing the verification action. */
  verification_notes: string | null;
  /** Expected seconds the verification will take. */
  verification_eta_seconds: number | null;
  /** Phase 1B UX: Change class from cycle-to-cycle change detection */
  change_class: 'regression' | 'improvement' | 'new_issue' | 'resolved' | 'stable_risk' | null;
  /** Verification lifecycle stage — see FindingProjection.verification_maturity. */
  verification_maturity: VerificationStage | null;
  /** Phase 1B UX: Suggested resolution path */
  resolve_path: 'fix' | 'verify' | 'track' | 'dismiss' | null;

  // Wave 3.12: Opportunity enrichment
  /** Hypothesis of what uplift is expected (template-generated) */
  uplift_hypothesis: string | null;
  /** 0-100 raw upside score from opportunity engine */
  upside_score: number | null;
  /** Data basis for the value case */
  value_case_basis: 'data_driven' | 'heuristic' | 'mixed' | null;
  /** Root cause cluster this action belongs to (from OpportunityCompression) */
  cluster_key: string | null;
  /** Number of findings sharing the same cluster */
  cluster_count: number | null;
}

export type WorkspaceProjectionType =
  | 'preflight'
  | 'revenue'
  | 'chargeback'
  | 'security_posture'
  | 'copy_alignment'
  // Behavioral workspaces (pixel-dependent)
  | 'first_impression'
  | 'action_value'
  | 'acquisition_integrity'
  | 'mobile_revenue'
  | 'friction_tax'
  | 'trust_gap'
  | 'path_efficiency';

/**
 * Workspace category — drives the UI grouping into "Core" and "Behavioral"
 * sections. Core workspaces are always shown; behavioral workspaces are
 * always emitted (even as placeholders) and the UI greys them out when
 * pixel_status !== 'active'.
 */
export type WorkspaceCategory = 'core' | 'behavioral';

/**
 * Pixel data status for behavioral workspaces. Drives the UI's greyed-out
 * vs. active rendering and the "configure your pixel" banner.
 *
 * Always null for core workspaces (preflight, revenue, chargeback, saas).
 *
 * - 'unconfigured': no behavioral evidence at all → snippet not installed
 * - 'collecting':   snippet installed but < 20 sessions in the window
 * - 'active':       eligibility passed; the workspace can produce findings
 */
export type PixelStatus = 'unconfigured' | 'collecting' | 'active';

export interface WorkspaceProjection {
  id: string;
  name: string;
  type: WorkspaceProjectionType;
  pack_key: string;
  decision_key: string;
  decision_impact: string;

  /** UI grouping bucket — 'core' or 'behavioral' */
  category: WorkspaceCategory;
  /** Pixel data status — null for core workspaces */
  pixel_status: PixelStatus | null;
  /**
   * Current/required session count progression for the "collecting" state.
   * Lets the UI render "12 / 20 sessions". Null for unconfigured + active
   * states and for core workspaces.
   */
  pixel_progress: { current: number; required: number } | null;

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

// ──────────────────────────────────────────────
// Wave 3.11: Perspective Grouping Types
// ──────────────────────────────────────────────

export interface PerspectiveGroup {
  id: string; // panorama, receita, confianca, comportamento, copy
  name: string;
  workspaces: WorkspaceProjection[];
  aggregate_loss_range: { min: number; max: number } | null;
  finding_count: number;
  regression_count: number;
  improvement_count: number;
  resolved_count: number;
  positive_check_count: number;
}

// ──────────────────────────────────────────────
// Wave 3.11: Revenue Map Types
// ──────────────────────────────────────────────

export interface RevenueMapEntry {
  perspective_id: string;
  label: string;
  total_min: number;
  total_max: number;
  midpoint: number;
  case_count: number;
}

// ──────────────────────────────────────────────
// Wave 3.11: Cycle Delta Lens Types
// ──────────────────────────────────────────────

export interface CycleDeltaByPerspective {
  perspective_id: string;
  regressions: { inference_key: string; severity: string }[];
  improvements: { inference_key: string; severity: string }[];
  new_issues: string[];
  resolved: string[];
}

// ──────────────────────────────────────────────
// Wave 3.11: Bragging Rights Lens Types
// ──────────────────────────────────────────────

export interface BraggingRights {
  positive_checks: { label: string; pack: string }[];
  resolved_since_last_cycle: number;
  improvements_count: number;
}

// ──────────────────────────────────────────────
// Engine Translations — i18n support for engine output
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
    /**
     * Security-posture decision pack actions. Optional because earlier
     * cycles ran without this lookup wired up — the engine falls back
     * to the hardcoded English text when missing.
     */
    security_posture?: Record<string, string>;
    copy_alignment?: Record<string, string>;
  };
  summaries: Record<string, string>;
  confidence_narrative: Record<string, string>;
  workspace_names: Record<string, string>;
  /**
   * Behavioral workspace issue labels keyed by inference_key. These
   * appear as the title of each "key issue" inside a behavioral
   * workspace card. Without translation here, the labels render in
   * English even when the rest of the UI is localized.
   */
  behavioral_issues?: Record<string, string>;
  /**
   * Causal map names ("Revenue Leakage Map", etc.) and their internal
   * category labels ("Policy Surface", "Support Surface", "Trust
   * Surface"). All optional — engine falls back to English when missing.
   */
  maps?: {
    names?: Record<string, string>;
    categories?: Record<string, string>;
  };
  /**
   * Phase 3.2: Finding body text translations. Keyed by inference_key.
   * Falls back to English hardcoded baselines when missing.
   */
  inference_causes?: Record<string, string>;
  inference_effects?: Record<string, string>;
  /**
   * Remediation steps keyed by inference_key. Falls back to the
   * REMEDIATION_CATALOG (pt-BR) when missing.
   */
  remediation?: Record<string, {
    remediation_steps: string[];
    verification_notes: string;
  }>;
  /**
   * Reasoning templates keyed by inference_key. Uses ICU MessageFormat
   * placeholders ({severity}, {count}, {factors}) for site-specific data.
   * Falls back to the English reasoning built inline in the inference engine.
   */
  reasoning_templates?: Record<string, string>;
}
