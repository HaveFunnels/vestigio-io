import {
  Decision,
  Action,
  Finding,
  Inference,
  DecisionImpact,
  Scoping,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Behavioral Workspace — Generic Creator
//
// Shared factory for all 7 pixel-dependent workspaces.
// Each workspace is defined by its inference filter and
// domain-specific context extraction.
// ──────────────────────────────────────────────

export interface BehavioralWorkspaceConfig {
  name: string;
  scoping: Scoping;
  landing_url: string;
  cycle_ref: string;
}

export interface BehavioralWorkspaceResult {
  context: BehavioralWorkspaceContext;
  findings: Finding[];
  summary: BehavioralWorkspaceSummary;
}

export interface BehavioralWorkspaceContext {
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  key_issues: BehavioralIssue[];
  decision_ref: string;
  cycle_ref: string;
}

export interface BehavioralIssue {
  title: string;
  description: string;
  severity: string;
  inference_ref: string | null;
}

export interface BehavioralWorkspaceSummary {
  what_is_happening: string[];
  what_to_fix_first: string[];
  confidence_score: number;
  risk_score: number;
}

// ── Workspace definitions ──

interface WorkspaceDef {
  idPrefix: string;
  inferenceKeys: Set<string>;
  issueLabels: Record<string, string>;
}

const WORKSPACE_DEFS: Record<string, WorkspaceDef> = {
  first_impression: {
    idPrefix: 'fi',
    inferenceKeys: new Set([
      'first_session_milestone_stall',
      'first_session_trust_barrier',
      'first_session_cta_timing_gap',
    ]),
    issueLabels: {
      first_session_milestone_stall: 'First-time visitors stall before intent',
      first_session_trust_barrier: 'Trust barrier for new visitors',
      first_session_cta_timing_gap: 'Slow commercial entry for newcomers',
    },
  },
  action_value: {
    idPrefix: 'av',
    inferenceKeys: new Set([
      'low_value_action_dominates',
      'high_value_action_underexposed',
      'dead_weight_surface_traffic',
    ]),
    issueLabels: {
      low_value_action_dominates: 'Low-value actions dominate user attention',
      high_value_action_underexposed: 'Revenue-positive actions underexposed',
      dead_weight_surface_traffic: 'Dead-weight surface traffic',
    },
  },
  acquisition_integrity: {
    idPrefix: 'ai',
    inferenceKeys: new Set([
      'paid_traffic_friction_elevated',
      'paid_traffic_trust_gap',
      'paid_mobile_compounding_waste',
    ]),
    issueLabels: {
      paid_traffic_friction_elevated: 'Paid traffic faces elevated friction',
      paid_traffic_trust_gap: 'Trust gap for paid visitors',
      paid_mobile_compounding_waste: 'Paid + mobile compounding waste',
    },
  },
  mobile_revenue: {
    idPrefix: 'mr',
    inferenceKeys: new Set([
      'mobile_conversion_gap',
      'mobile_form_friction_elevated',
      'mobile_cta_timing_degraded',
    ]),
    issueLabels: {
      mobile_conversion_gap: 'Mobile vs desktop conversion gap',
      mobile_form_friction_elevated: 'Mobile form friction elevated',
      mobile_cta_timing_degraded: 'Mobile CTA timing degraded',
    },
  },
  friction_tax: {
    idPrefix: 'ft',
    inferenceKeys: new Set([
      'funnel_step_friction_cost',
      'oscillation_decision_cost',
      'checkout_entry_friction',
    ]),
    issueLabels: {
      funnel_step_friction_cost: 'Funnel friction tax',
      oscillation_decision_cost: 'Decision oscillation cost',
      checkout_entry_friction: 'Checkout entry friction',
    },
  },
  trust_gap: {
    idPrefix: 'tg',
    inferenceKeys: new Set([
      'trust_deficit_conversion_drag',
      'reassurance_seeking_elevated',
      'sensitive_input_trust_gap',
    ]),
    issueLabels: {
      trust_deficit_conversion_drag: 'Trust deficit drags conversion',
      reassurance_seeking_elevated: 'Elevated reassurance-seeking behavior',
      sensitive_input_trust_gap: 'Sensitive input trust gap',
    },
  },
  path_efficiency: {
    idPrefix: 'pe',
    inferenceKeys: new Set([
      'path_length_exceeds_efficient',
      'intent_absorber_detected',
      'intent_decay_time_excessive',
    ]),
    issueLabels: {
      path_length_exceeds_efficient: 'Path length exceeds efficient conversion',
      intent_absorber_detected: 'Intent absorber surfaces detected',
      intent_decay_time_excessive: 'Excessive intent-to-conversion time',
    },
  },
};

export type BehavioralWorkspaceType = keyof typeof WORKSPACE_DEFS;

export function createBehavioralWorkspace(
  workspaceType: BehavioralWorkspaceType,
  config: BehavioralWorkspaceConfig,
  decision: Decision,
  actions: Action[],
  inferences: Inference[],
): BehavioralWorkspaceResult {
  const def = WORKSPACE_DEFS[workspaceType];
  const ids = new IdGenerator(def.idPrefix);
  const now = new Date();

  // Filter relevant inferences
  const relevant = inferences.filter(i => def.inferenceKeys.has(i.inference_key));

  // Build key issues
  const keyIssues: BehavioralIssue[] = relevant
    .filter(i => i.severity_hint !== 'low' || i.conclusion_value !== 'low')
    .map(inf => ({
      title: def.issueLabels[inf.inference_key] || inf.inference_key.replace(/_/g, ' '),
      description: inf.reasoning,
      severity: inf.severity_hint || 'medium',
      inference_ref: makeRef('inference', inf.id),
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  // Risk level from decision
  const riskLevel = decisionToRiskLevel(decision);

  const context: BehavioralWorkspaceContext = {
    risk_level: riskLevel,
    key_issues: keyIssues,
    decision_ref: makeRef('decision', decision.id),
    cycle_ref: config.cycle_ref,
  };

  // Summary
  const whatIsHappening = keyIssues.map(i => i.title);
  const whatToFix: string[] = [];
  if (decision.actions.primary) whatToFix.push(decision.actions.primary);
  for (const s of decision.actions.secondary.slice(0, 3)) whatToFix.push(s);

  const summary: BehavioralWorkspaceSummary = {
    what_is_happening: whatIsHappening,
    what_to_fix_first: whatToFix,
    confidence_score: decision.confidence_score,
    risk_score: decision.raw_risk_score || 0,
  };

  // Findings from actions
  const findings: Finding[] = actions
    .filter(a => a.action_type !== 'verification')
    .map(action => ({
      id: ids.next(),
      finding_key: action.action_key,
      scoping: config.scoping,
      cycle_ref: config.cycle_ref,
      decision_ref: action.decision_ref,
      title: action.title,
      description: action.description,
      technical_detail: null,
      severity: action.severity,
      confidence: decision.confidence_score,
      evidence_refs: action.evidence_refs,
      remediation: action.title,
      page_url: config.landing_url,
      journey_stage: null,
      created_at: now,
      updated_at: now,
    }));

  return { context, findings, summary };
}

function decisionToRiskLevel(
  decision: Decision,
): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  switch (decision.decision_impact) {
    case DecisionImpact.Incident: return 'critical';
    case DecisionImpact.BlockLaunch: return 'critical';
    case DecisionImpact.FixBeforeScale: return 'high';
    case DecisionImpact.Optimize: return 'medium';
    case DecisionImpact.Observe:
      return (decision.raw_risk_score || 0) > 10 ? 'low' : 'none';
  }
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}
