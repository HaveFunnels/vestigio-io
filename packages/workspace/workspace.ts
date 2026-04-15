import {
  Decision,
  Action,
  Finding,
  PreflightProfile,
  PreflightEvaluation,
  PreflightOverallStatus,
  PreflightVersionStatus,
  EffectiveSeverity,
  DecisionImpact,
  FreshnessState,
  Scoping,
  Freshness,
  PreflightSummary,
  PreflightItem,
  Inference,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Workspace — persistent analysis context
// Preflight is a workspace type, not a special system.
// ──────────────────────────────────────────────

export interface WorkspaceConfig {
  name: string;
  type: WorkspaceType;
  scoping: Scoping;
  landing_url: string;
  cycle_ref: string;
}

export type WorkspaceType = 'analysis' | 'saved_view' | 'map';

export interface WorkspaceResult {
  profile: PreflightProfile;
  evaluation: PreflightEvaluation;
  findings: Finding[];
}

export function createPreflightWorkspace(
  config: WorkspaceConfig,
  decision: Decision,
  actions: Action[],
  inferences: Inference[],
): WorkspaceResult {
  const now = new Date();
  const ids = new IdGenerator('ws');
  const freshness: Freshness = {
    observed_at: now,
    fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    freshness_state: FreshnessState.Fresh,
    staleness_reason: null,
  };

  // 1. Create preflight profile
  const profile: PreflightProfile = {
    id: ids.next(),
    scoping: config.scoping,
    landing_url: config.landing_url,
    path_scope: config.scoping.path_scope || '/',
    goal_type: 'scale_traffic',
    planned_spend_range: null,
    expected_conversion_type: null,
    created_at: now,
    updated_at: now,
  };

  // 2. Derive blockers, risks, opportunities from decision
  const blockers: PreflightItem[] = [];
  const risks: PreflightItem[] = [];
  const opportunities: PreflightItem[] = [];

  if (
    decision.decision_impact === DecisionImpact.BlockLaunch ||
    decision.decision_impact === DecisionImpact.Incident
  ) {
    blockers.push({
      title: decision.decision_key.replace(/_/g, ' '),
      description: decision.why.summary,
      severity: 'critical',
      decision_ref: makeRef('decision', decision.id),
      evidence_refs: decision.why.evidence_refs,
    });
  } else if (decision.decision_impact === DecisionImpact.FixBeforeScale) {
    risks.push({
      title: decision.decision_key.replace(/_/g, ' '),
      description: decision.why.summary,
      severity: 'high',
      decision_ref: makeRef('decision', decision.id),
      evidence_refs: decision.why.evidence_refs,
    });
  }

  // Add inference-level items
  for (const inf of inferences) {
    if (inf.severity_hint === 'high') {
      risks.push({
        title: inf.inference_key.replace(/_/g, ' '),
        description: inf.reasoning,
        severity: 'high',
        decision_ref: null,
        evidence_refs: inf.evidence_refs,
      });
    } else if (inf.severity_hint === 'medium') {
      risks.push({
        title: inf.inference_key.replace(/_/g, ' '),
        description: inf.reasoning,
        severity: 'medium',
        decision_ref: null,
        evidence_refs: inf.evidence_refs,
      });
    }
  }

  // 3. Compute summary
  const overallStatus = blockers.length > 0
    ? PreflightOverallStatus.Blocker
    : risks.length > 0
      ? PreflightOverallStatus.ReadyWithRisks
      : PreflightOverallStatus.Ready;

  const readinessScore = blockers.length > 0
    ? Math.max(0, 30 - blockers.length * 10)
    : risks.length > 0
      ? Math.max(30, 70 - risks.length * 10)
      : 90;

  const summary: PreflightSummary = {
    overall_status: overallStatus,
    confidence_score: decision.confidence_score,
    readiness_score: readinessScore,
  };

  // 4. Create evaluation
  const evaluation: PreflightEvaluation = {
    id: ids.next(),
    profile_ref: makeRef('preflight_profile', profile.id),
    cycle_ref: makeRef('audit_cycle', config.cycle_ref),
    freshness,
    version_status: PreflightVersionStatus.Ready,
    summary,
    blockers,
    risks,
    opportunities,
    supporting_decisions: [makeRef('decision', decision.id)],
    evidence_refs: decision.why.evidence_refs,
    created_at: now,
    updated_at: now,
  };

  // 5. Generate findings from actions (projections)
  const findings: Finding[] = actions
    .filter((a) => a.action_type !== 'verification')
    .map((action) => ({
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

  return { profile, evaluation, findings };
}
