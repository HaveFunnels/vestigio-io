import { Ref } from '../domain';
import type { VerificationStrategy } from '../domain/actions';

// ──────────────────────────────────────────────
// Root Cause — a shared underlying issue that manifests
// across multiple inferences and decisions
// ──────────────────────────────────────────────

export interface RootCause {
  id: string;
  root_cause_key: string;
  category: RootCauseCategory;
  title: string;
  description: string;

  // Contributing elements (no inference appears in more than one root cause)
  contributing_inferences: Ref[];
  contributing_signals: Ref[];
  contributing_evidence: Ref[];

  // Aggregated scores
  severity: RootCauseSeverity;
  confidence: number;  // 0..100, aggregated from inferences

  // Impact classification
  impact_types: ImpactDimension[];
  affected_packs: string[];  // which decision packs this root cause affects
}

export type RootCauseCategory =
  | 'trust_failure'
  | 'conversion_fragmentation'
  | 'measurement_gap'
  | 'friction_barrier'
  | 'conversion_clarity'
  | 'policy_deficiency'
  | 'support_gap'
  | 'expectation_failure'
  | 'expectation_alignment'
  | 'dispute_exposure'
  // Phase 3A: Channel integrity
  | 'channel_integrity'
  | 'commerce_continuity'
  | 'abuse_exposure'
  // Phase 3D: SaaS growth
  | 'saas_activation_failure'
  | 'saas_product_friction'
  // Phase 3E: Discoverability & Brand
  | 'discoverability_gap'
  | 'brand_impersonation'
  // Phase 4B: Behavioral
  | 'behavioral_conversion_failure'
  | 'behavioral_path_integrity'
  // Wave 2.3: Runtime fragility (separated from friction_barrier so maps treat them distinctly)
  | 'runtime_fragility'
  // Tier 1 Copy Analysis
  | 'copy_clarity'
  // Wave 3.10 Copy Analysis Pack
  | 'copy_strategy'
  // Wave 8.3: Content Freshness & Decay
  | 'content_freshness';

export type RootCauseSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ImpactDimension = 'scale_risk' | 'revenue_loss' | 'trust_erosion' | 'measurement_blind' | 'chargeback_risk';

// ──────────────────────────────────────────────
// Decision Link — connects decisions to root causes
// ──────────────────────────────────────────────

export interface DecisionLink {
  decision_ref: Ref;
  decision_key: string;
  pack_key: string;
  root_cause_refs: RootCauseContribution[];
}

export interface RootCauseContribution {
  root_cause_ref: Ref;
  contribution_strength: 'primary' | 'contributing' | 'related';
}

// ──────────────────────────────────────────────
// Global Action — unified, deduplicated, cross-pack prioritized
// ──────────────────────────────────────────────

export interface GlobalAction {
  id: string;
  action_key: string;
  title: string;
  description: string;
  source_decisions: Ref[];
  root_cause_ref: Ref | null;
  action_type: string;
  priority: number;           // 1 = highest
  expected_impact: ImpactDimension[];
  confidence: number;
  severity: string;
  cross_pack_impact: number;  // how many packs this action helps (1 or 2)
  merged_from: Ref[];         // original action refs that were deduplicated into this

  /**
   * Ordered, actionable remediation steps — pulled through from the
   * merged source Action(s). When multiple actions merged, the first
   * non-null `remediation_steps` wins; Phase 2 backfills templates
   * keyed by action_key so that merged actions converge on identical
   * steps. See docs/REMEDIATION_FORMAT.md.
   */
  remediation_steps: string[] | null;
  /**
   * Dev-hours estimate carried over from the source Action. Median
   * across merged actions when multiple contribute.
   */
  estimated_effort_hours: number | null;

  /**
   * How the finding is re-verified. Carried from the source Action
   * during the merge — all actions sharing an action_key converge
   * on the same strategy per Phase 2.5 backfill rules, so the
   * merge picks the first non-null.
   */
  verification_strategy: VerificationStrategy | null;
  /** User-facing copy describing the verification. See Action.verification_notes. */
  verification_notes: string | null;
  /** ETA in seconds for the verification. See Action.verification_eta_seconds. */
  verification_eta_seconds: number | null;
}

// ──────────────────────────────────────────────
// Intelligence Summary
// ──────────────────────────────────────────────

export interface IntelligenceSummary {
  underlying_problems: string[];    // "What are the real problems?"
  fix_first: string[];              // "What should be fixed first?"
  cross_pack_issues: string[];      // "What affects both revenue and scale?"
  total_root_causes: number;
  total_global_actions: number;
  highest_severity: RootCauseSeverity | null;
}

// ──────────────────────────────────────────────
// Top-level intelligence result
// ──────────────────────────────────────────────

export interface DecisionIntelligenceResult {
  root_causes: RootCause[];
  decision_links: DecisionLink[];
  global_actions: GlobalAction[];
  summary: IntelligenceSummary;
}
