import { DecisionImpact, EffectiveSeverity, FreshnessState } from './enums';
import { Freshness, Ref, Timestamped } from './common';

// ──────────────────────────────────────────────
// Risk Evaluation — canonical downside assessment
// ──────────────────────────────────────────────

export interface RiskEvaluation extends Timestamped {
  id: string;
  subject_ref: string;
  question_key: string;
  cycle_ref: string;
  freshness: Freshness;

  // Core scores
  raw_risk_score: number;       // 0..100
  confidence_score: number;     // 0..100
  convergence_score: number;    // count of converging signals

  // Derived
  gate_result: GateResult;
  effective_severity: EffectiveSeverity;
  decision_impact: DecisionImpact;

  // Rationale
  rationale: RiskRationale;
}

export interface GateResult {
  passed: boolean;
  downgraded: boolean;
  blocked: boolean;
  reasons: string[];
}

export interface RiskRationale {
  evidence_refs: Ref[];
  signals: Ref[];
  inferences: Ref[];
  penalties: RiskPenalty[];
}

export interface RiskPenalty {
  type: 'freshness' | 'confidence' | 'suppression' | 'business_context';
  description: string;
  adjustment: number;
}
