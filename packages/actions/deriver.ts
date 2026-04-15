import {
  Decision,
  Action,
  ActionType,
  DecisionImpact,
  EffectiveSeverity,
  FreshnessState,
  Scoping,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Action Deriver — produces actions from decisions
// ──────────────────────────────────────────────

import { IdGenerator } from '../domain';

export function deriveActions(decision: Decision): Action[] {
  const actions: Action[] = [];
  const ids = new IdGenerator('act');
  const now = new Date();

  // Primary action
  if (decision.actions.primary) {
    actions.push(createAction(ids, {
      action_key: `${decision.decision_key}_primary`,
      scoping: decision.scoping,
      cycle_ref: decision.cycle_ref,
      decision_ref: makeRef('decision', decision.id),
      action_type: decisionToActionType(decision),
      title: decision.actions.primary,
      description: decision.why.summary,
      priority: impactToPriority(decision.decision_impact),
      severity: decision.effective_severity,
      decision_impact: decision.decision_impact,
      evidence_refs: decision.why.evidence_refs,
    }));
  }

  // Secondary actions
  for (let i = 0; i < decision.actions.secondary.length; i++) {
    actions.push(createAction(ids, {
      action_key: `${decision.decision_key}_secondary_${i}`,
      scoping: decision.scoping,
      cycle_ref: decision.cycle_ref,
      decision_ref: makeRef('decision', decision.id),
      action_type: decisionToActionType(decision),
      title: decision.actions.secondary[i],
      description: decision.why.summary,
      priority: impactToPriority(decision.decision_impact) + i + 1,
      severity: downgrade(decision.effective_severity),
      decision_impact: decision.decision_impact,
      evidence_refs: [],
    }));
  }

  // Verification actions
  for (let i = 0; i < decision.actions.verification.length; i++) {
    actions.push(createAction(ids, {
      action_key: `${decision.decision_key}_verify_${i}`,
      scoping: decision.scoping,
      cycle_ref: decision.cycle_ref,
      decision_ref: makeRef('decision', decision.id),
      action_type: 'verification',
      title: decision.actions.verification[i],
      description: 'Verification step to confirm resolution.',
      priority: 90 + i,
      severity: EffectiveSeverity.Low,
      decision_impact: DecisionImpact.Observe,
      evidence_refs: [],
    }));
  }

  return actions;
}

function decisionToActionType(decision: Decision): ActionType {
  switch (decision.category) {
    case 'opportunity':
      return 'opportunity_capture';
    case 'risk':
    case 'gate':
      return 'risk_mitigation';
    default:
      return 'observation';
  }
}

function impactToPriority(impact: DecisionImpact): number {
  switch (impact) {
    case DecisionImpact.Incident: return 1;
    case DecisionImpact.BlockLaunch: return 2;
    case DecisionImpact.FixBeforeScale: return 3;
    case DecisionImpact.Optimize: return 5;
    case DecisionImpact.Observe: return 8;
  }
}

function downgrade(severity: EffectiveSeverity): EffectiveSeverity {
  const order = [
    EffectiveSeverity.None,
    EffectiveSeverity.Low,
    EffectiveSeverity.Medium,
    EffectiveSeverity.High,
    EffectiveSeverity.Critical,
  ];
  const idx = order.indexOf(severity);
  return idx > 0 ? order[idx - 1] : EffectiveSeverity.None;
}

function createAction(
  ids: IdGenerator,
  params: {
    action_key: string;
    scoping: Scoping;
    cycle_ref: string;
    decision_ref: string;
    action_type: ActionType;
    title: string;
    description: string;
    priority: number;
    severity: EffectiveSeverity;
    decision_impact: DecisionImpact;
    evidence_refs: string[];
  },
): Action {
  const now = new Date();
  return {
    id: ids.next(),
    ...params,
    effort_hint: null,
    // Phase 1 defaults — Phase 2 backfills templates per action_key.
    // Decision packs that already have a concrete fix recipe can
    // override via the createAction params once deriver.ts accepts
    // them; for now every action ships with null here.
    remediation_steps: null,
    estimated_effort_hours: null,
    // Phase 1.5 verification metadata. Phase 2.5 classifies every
    // action_key into a VerificationStrategy + writes the notes.
    verification_strategy: null,
    verification_notes: null,
    verification_eta_seconds: null,
    status: 'pending',
    created_at: now,
    updated_at: now,
  };
}
