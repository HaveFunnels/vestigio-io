import { Freshness, Ref, Scoping } from './common';
import { Evidence } from './evidence';
import { Signal } from './signal';
import { Inference } from './inference';
import { Decision, PrimaryOutcome } from './decision';
import {
  CollectionMethod,
  DecisionClass,
  DecisionImpact,
  DecisionStatus,
  EffectiveSeverity,
  EvidenceType,
  FreshnessState,
  InferenceCategory,
  SignalCategory,
  SourceKind,
} from './enums';

// ──────────────────────────────────────────────
// ValidationError
// ──────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(
    public readonly entity: string,
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${entity}.${field}: ${reason}`);
    this.name = 'ValidationError';
  }
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function requireString(entity: string, field: string, value: unknown): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(entity, field, 'must be a non-empty string');
  }
}

function requireDate(entity: string, field: string, value: unknown): void {
  if (!(value instanceof Date) || isNaN(value.getTime())) {
    throw new ValidationError(entity, field, 'must be a valid Date object');
  }
}

function requireScore(entity: string, field: string, value: unknown): void {
  if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 100) {
    throw new ValidationError(entity, field, 'must be a number in the 0..100 range');
  }
}

function requireNullableScore(entity: string, field: string, value: unknown): void {
  if (value === null || value === undefined) return;
  requireScore(entity, field, value);
}

function requireRef(entity: string, field: string, value: unknown): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(entity, field, 'must be a non-empty ref string');
  }
  if (!value.includes(':')) {
    throw new ValidationError(entity, field, `invalid ref format — expected "type:id", got "${value}"`);
  }
}

function requireRefArray(entity: string, field: string, values: unknown): void {
  if (!Array.isArray(values)) {
    throw new ValidationError(entity, field, 'must be an array of refs');
  }
  for (let i = 0; i < values.length; i++) {
    requireRef(entity, `${field}[${i}]`, values[i]);
  }
}

function requireEnum<T extends Record<string, string>>(
  entity: string,
  field: string,
  value: unknown,
  enumObj: T,
): void {
  const allowed = Object.values(enumObj) as string[];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(
      entity,
      field,
      `must be one of [${allowed.join(', ')}], got "${String(value)}"`,
    );
  }
}

// ──────────────────────────────────────────────
// Scoping
// ──────────────────────────────────────────────

export function validateScoping(s: Scoping): void {
  const e = 'Scoping';
  if (s == null || typeof s !== 'object') {
    throw new ValidationError(e, '(root)', 'must be a non-null object');
  }
  requireRef(e, 'workspace_ref', s.workspace_ref);
  requireRef(e, 'environment_ref', s.environment_ref);
  requireString(e, 'subject_ref', s.subject_ref);
  // path_scope is nullable — no required check
}

// ──────────────────────────────────────────────
// Freshness
// ──────────────────────────────────────────────

export function validateFreshness(f: Freshness): void {
  const e = 'Freshness';
  if (f == null || typeof f !== 'object') {
    throw new ValidationError(e, '(root)', 'must be a non-null object');
  }
  requireDate(e, 'observed_at', f.observed_at);
  requireDate(e, 'fresh_until', f.fresh_until);
  requireEnum(e, 'freshness_state', f.freshness_state, FreshnessState);
  // staleness_reason is nullable — no required check
}

// ──────────────────────────────────────────────
// Timestamped helpers
// ──────────────────────────────────────────────

function validateTimestamped(entity: string, t: { created_at: Date; updated_at: Date }): void {
  requireDate(entity, 'created_at', t.created_at);
  requireDate(entity, 'updated_at', t.updated_at);
}

// ──────────────────────────────────────────────
// Evidence
// ──────────────────────────────────────────────

export function validateEvidence(ev: Evidence): void {
  const e = 'Evidence';
  if (ev == null || typeof ev !== 'object') {
    throw new ValidationError(e, '(root)', 'must be a non-null object');
  }

  requireString(e, 'id', ev.id);
  requireString(e, 'evidence_key', ev.evidence_key);
  requireEnum(e, 'evidence_type', ev.evidence_type, EvidenceType);
  requireString(e, 'subject_ref', ev.subject_ref);
  requireRef(e, 'cycle_ref', ev.cycle_ref);
  requireEnum(e, 'source_kind', ev.source_kind, SourceKind);
  requireEnum(e, 'collection_method', ev.collection_method, CollectionMethod);
  requireScore(e, 'quality_score', ev.quality_score);

  validateScoping(ev.scoping);
  validateFreshness(ev.freshness);
  validateTimestamped(e, ev);

  if (ev.payload == null || typeof ev.payload !== 'object') {
    throw new ValidationError(e, 'payload', 'must be a non-null object');
  }
}

// ──────────────────────────────────────────────
// Signal
// ──────────────────────────────────────────────

export function validateSignal(s: Signal): void {
  const e = 'Signal';
  if (s == null || typeof s !== 'object') {
    throw new ValidationError(e, '(root)', 'must be a non-null object');
  }

  requireString(e, 'id', s.id);
  requireString(e, 'signal_key', s.signal_key);
  requireEnum(e, 'category', s.category, SignalCategory);
  requireRef(e, 'cycle_ref', s.cycle_ref);
  requireString(e, 'attribute', s.attribute);
  requireString(e, 'value', s.value);
  requireScore(e, 'confidence', s.confidence);
  requireRefArray(e, 'evidence_refs', s.evidence_refs);

  validateScoping(s.scoping);
  validateFreshness(s.freshness);
  validateTimestamped(e, s);
}

// ──────────────────────────────────────────────
// Inference
// ──────────────────────────────────────────────

export function validateInference(i: Inference): void {
  const e = 'Inference';
  if (i == null || typeof i !== 'object') {
    throw new ValidationError(e, '(root)', 'must be a non-null object');
  }

  requireString(e, 'id', i.id);
  requireString(e, 'inference_key', i.inference_key);
  requireEnum(e, 'category', i.category, InferenceCategory);
  requireRef(e, 'cycle_ref', i.cycle_ref);
  requireString(e, 'conclusion', i.conclusion);
  requireString(e, 'conclusion_value', i.conclusion_value);
  requireScore(e, 'confidence', i.confidence);
  requireRefArray(e, 'signal_refs', i.signal_refs);
  requireRefArray(e, 'evidence_refs', i.evidence_refs);
  requireString(e, 'reasoning', i.reasoning);

  validateScoping(i.scoping);
  validateFreshness(i.freshness);
  validateTimestamped(e, i);
}

// ──────────────────────────────────────────────
// Decision
// ──────────────────────────────────────────────

const VALID_PRIMARY_OUTCOMES: PrimaryOutcome[] = [
  'incident',
  'opportunity',
  'state',
  'observation',
];

export function validateDecision(d: Decision): void {
  const e = 'Decision';
  if (d == null || typeof d !== 'object') {
    throw new ValidationError(e, '(root)', 'must be a non-null object');
  }

  requireString(e, 'id', d.id);
  requireString(e, 'decision_key', d.decision_key);
  requireString(e, 'question_key', d.question_key);
  requireRef(e, 'cycle_ref', d.cycle_ref);

  requireEnum(e, 'status', d.status, DecisionStatus);
  requireEnum(e, 'category', d.category, DecisionClass);
  requireScore(e, 'confidence_score', d.confidence_score);
  requireNullableScore(e, 'raw_risk_score', d.raw_risk_score);
  requireNullableScore(e, 'raw_upside_score', d.raw_upside_score);
  requireEnum(e, 'effective_severity', d.effective_severity, EffectiveSeverity);
  requireEnum(e, 'decision_impact', d.decision_impact, DecisionImpact);

  if (
    typeof d.primary_outcome !== 'string' ||
    !VALID_PRIMARY_OUTCOMES.includes(d.primary_outcome)
  ) {
    throw new ValidationError(
      e,
      'primary_outcome',
      `must be one of [${VALID_PRIMARY_OUTCOMES.join(', ')}], got "${String(d.primary_outcome)}"`,
    );
  }

  // DecisionWhy
  if (d.why == null || typeof d.why !== 'object') {
    throw new ValidationError(e, 'why', 'must be a non-null object');
  }
  requireRefArray(e, 'why.signals', d.why.signals);
  requireRefArray(e, 'why.inferences', d.why.inferences);
  requireRefArray(e, 'why.evidence_refs', d.why.evidence_refs);
  requireString(e, 'why.summary', d.why.summary);

  // DecisionActions
  if (d.actions == null || typeof d.actions !== 'object') {
    throw new ValidationError(e, 'actions', 'must be a non-null object');
  }
  requireString(e, 'actions.primary', d.actions.primary);
  if (!Array.isArray(d.actions.secondary)) {
    throw new ValidationError(e, 'actions.secondary', 'must be an array');
  }
  if (!Array.isArray(d.actions.verification)) {
    throw new ValidationError(e, 'actions.verification', 'must be an array');
  }

  // DecisionProjections
  if (d.projections == null || typeof d.projections !== 'object') {
    throw new ValidationError(e, 'projections', 'must be a non-null object');
  }
  requireRefArray(e, 'projections.findings', d.projections.findings);
  requireRefArray(e, 'projections.incidents', d.projections.incidents);
  requireRefArray(e, 'projections.opportunities', d.projections.opportunities);
  requireRefArray(e, 'projections.preflight_checks', d.projections.preflight_checks);

  validateScoping(d.scoping);
  validateFreshness(d.freshness);
  validateTimestamped(e, d);
}
