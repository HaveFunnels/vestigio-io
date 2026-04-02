import {
  DecisionClass,
  DecisionImpact,
  DecisionStatus,
  EffectiveSeverity,
  FreshnessState,
} from './enums';
import { Freshness, Ref, Scoping, Timestamped } from './common';
import { ValueCase } from './value-case';

// ──────────────────────────────────────────────
// Decision — explainable answer to a business question
// ──────────────────────────────────────────────

export interface Decision extends Timestamped {
  id: string;
  decision_key: string;
  question_key: string;
  scoping: Scoping;
  cycle_ref: string;
  freshness: Freshness;

  // Classification
  status: DecisionStatus;
  category: DecisionClass;

  // Scores
  confidence_score: number;          // 0..100
  raw_risk_score: number | null;
  raw_upside_score: number | null;
  effective_severity: EffectiveSeverity;
  decision_impact: DecisionImpact;

  // Outcome
  primary_outcome: PrimaryOutcome;

  // Explainability
  why: DecisionWhy;

  // Actions
  actions: DecisionActions;

  // Value
  value_case: ValueCase | null;

  // Projections
  projections: DecisionProjections;
}

export type PrimaryOutcome = 'incident' | 'opportunity' | 'state' | 'observation';

export interface DecisionWhy {
  signals: Ref[];
  inferences: Ref[];
  evidence_refs: Ref[];
  gates: string[];
  summary: string;
}

export interface DecisionActions {
  primary: string;
  secondary: string[];
  verification: string[];
}

export interface DecisionProjections {
  findings: Ref[];
  incidents: Ref[];
  opportunities: Ref[];
  preflight_checks: Ref[];
}

// ──────────────────────────────────────────────
// Decision Pack — business question grouping
// ──────────────────────────────────────────────

export interface DecisionPack {
  pack_key: string;
  question_keys: string[];
  label: string;
  description: string;
}

export const SCALE_READINESS_PACK: DecisionPack = {
  pack_key: 'scale_readiness_pack',
  question_keys: ['is_it_safe_to_scale_traffic'],
  label: 'Scale Readiness',
  description: 'Is it safe to scale traffic to this environment?',
};

export const REVENUE_INTEGRITY_PACK: DecisionPack = {
  pack_key: 'revenue_integrity_pack',
  question_keys: ['is_there_revenue_leakage_in_high_intent_paths'],
  label: 'Revenue Integrity',
  description: 'Where is the system losing money, leaking conversions, or creating friction in the revenue path?',
};

export const CHARGEBACK_RESILIENCE_PACK: DecisionPack = {
  pack_key: 'chargeback_resilience_pack',
  question_keys: ['is_chargeback_pressure_elevated'],
  label: 'Chargeback Resilience',
  description: 'Is the system exposed to chargebacks? Are policies, support, and trust signals strong enough to prevent disputes?',
};
