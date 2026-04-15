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
      first_session_milestone_stall: 'First-time visitors are leaving before they show intent to buy',
      first_session_trust_barrier: 'New visitors hit a trust wall before they engage',
      first_session_cta_timing_gap: 'It takes too long for new visitors to see what to do',
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
      low_value_action_dominates: 'Visitors are spending attention on actions that do not make money',
      high_value_action_underexposed: 'The actions that make you money are too hard to find',
      dead_weight_surface_traffic: 'Pages that bring no revenue are eating your traffic',
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
      paid_traffic_friction_elevated: 'Visitors from your ads are hitting more friction than the average buyer',
      paid_traffic_trust_gap: 'Visitors from ads do not trust your site as fast as organic visitors',
      paid_mobile_compounding_waste: 'Your paid mobile traffic is leaking money on two fronts at once',
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
      mobile_conversion_gap: 'Mobile buyers convert way less than desktop buyers',
      mobile_form_friction_elevated: 'Your forms are painful to fill out on a phone',
      mobile_cta_timing_degraded: 'Your buy buttons take too long to react on mobile',
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
      funnel_step_friction_cost: 'Each step in your funnel is costing you more than it should',
      oscillation_decision_cost: 'Buyers are bouncing back and forth before deciding — and many never decide',
      checkout_entry_friction: 'Something at the start of checkout is making buyers stall',
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
      trust_deficit_conversion_drag: 'Buyers want to convert but trust gaps are pulling them away',
      reassurance_seeking_elevated: 'Buyers keep checking policies and reviews — they need more reassurance to feel safe',
      sensitive_input_trust_gap: 'Buyers are abandoning the moment they have to type their card or personal data',
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
      path_length_exceeds_efficient: 'The path from interest to purchase is too long for buyers to stick with',
      intent_absorber_detected: 'Some pages are stealing attention from buyers without moving them toward a sale',
      intent_decay_time_excessive: 'Too much time passes between when a buyer wants to buy and when they can actually buy',
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
  // Translations are optional — when provided, the issue title is
  // looked up by inference_key in `engine.behavioral_issues` so the
  // workspace card renders in the user's language. Without it, we
  // fall back to the hardcoded English label from WORKSPACE_DEFS.
  behavioralIssueTranslations?: Record<string, string>,
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
      title: behavioralIssueTranslations?.[inf.inference_key]
        ?? def.issueLabels[inf.inference_key]
        ?? inf.inference_key.replace(/_/g, ' '),
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
      remediation_steps: action.remediation_steps,
      estimated_effort_hours: action.estimated_effort_hours,
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
