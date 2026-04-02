import { Signal, Evidence, makeRef } from '../domain';
import { TruthClaim, AuthorityLevel, SOURCE_AUTHORITY, TruthState, TruthContradiction } from './types';
import { resolveTruth } from './resolver';

// ──────────────────────────────────────────────
// Signal Harmonizer — truth resolution for multi-source signals
//
// After signal extraction, signals backed by multiple evidence
// sources may carry conflicting claims. This module:
// 1. Groups signals by (signal_key, subject_ref)
// 2. Builds truth claims from backing evidence
// 3. Resolves contradictions via authority/confidence/recency
// 4. Adjusts signal confidence based on resolved truth
// 5. Preserves contradictions for explainability
//
// Single-source signals pass through unmodified.
// ──────────────────────────────────────────────

export interface HarmonizationResult {
  signals: Signal[];
  truth_states: TruthState[];
  contradictions_found: number;
  signals_adjusted: number;
}

/**
 * Harmonize signals using truth resolution where multi-source evidence exists.
 * Single-source signals pass through unchanged.
 */
export function harmonizeSignals(
  signals: Signal[],
  evidence: Evidence[],
): HarmonizationResult {
  // Index evidence by ref for fast lookup
  const evidenceByRef = new Map<string, Evidence>();
  for (const e of evidence) {
    evidenceByRef.set(makeRef('evidence', e.id), e);
    evidenceByRef.set(`evidence:${e.id}`, e);
  }

  // Group signals by (signal_key, subject_ref)
  const groups = new Map<string, Signal[]>();
  for (const sig of signals) {
    const groupKey = `${sig.signal_key}:${sig.scoping.subject_ref}`;
    const existing = groups.get(groupKey) || [];
    existing.push(sig);
    groups.set(groupKey, existing);
  }

  const truthStates: TruthState[] = [];
  const harmonized: Signal[] = [];
  let contradictionsFound = 0;
  let signalsAdjusted = 0;

  for (const [groupKey, groupSignals] of groups) {
    // Single signal in group — check if it has multi-source evidence
    if (groupSignals.length === 1) {
      const sig = groupSignals[0];
      const backingEvidence = resolveBackingEvidence(sig, evidenceByRef);

      if (backingEvidence.length <= 1) {
        // Single source, pass through
        harmonized.push(sig);
        continue;
      }

      // Multi-source evidence for a single signal — resolve truth
      const claims = buildClaimsFromEvidence(sig, backingEvidence);
      if (claims.length <= 1) {
        harmonized.push(sig);
        continue;
      }

      const truthState = resolveTruth(sig.scoping.subject_ref, claims);
      truthStates.push(truthState);
      contradictionsFound += truthState.total_contradictions;

      // Adjust signal confidence based on truth resolution
      const adjusted = applyTruthToSignal(sig, truthState);
      if (adjusted.confidence !== sig.confidence) signalsAdjusted++;
      harmonized.push(adjusted);
      continue;
    }

    // Multiple signals with same key:subject — resolve across them
    const allClaims: TruthClaim[] = [];
    for (const sig of groupSignals) {
      const backingEvidence = resolveBackingEvidence(sig, evidenceByRef);
      allClaims.push(...buildClaimsFromSignal(sig, backingEvidence));
    }

    if (allClaims.length <= 1) {
      harmonized.push(...groupSignals);
      continue;
    }

    const subjectRef = groupSignals[0].scoping.subject_ref;
    const truthState = resolveTruth(subjectRef, allClaims);
    truthStates.push(truthState);
    contradictionsFound += truthState.total_contradictions;

    // Keep the signal with the value matching resolved truth, adjust confidence
    const resolvedSignal = selectResolvedSignal(groupSignals, truthState);
    if (resolvedSignal) {
      const adjusted = applyTruthToSignal(resolvedSignal, truthState);
      if (adjusted.confidence !== resolvedSignal.confidence) signalsAdjusted++;
      harmonized.push(adjusted);
    } else {
      // Fallback: keep all, adjust confidence
      for (const sig of groupSignals) {
        const adjusted = applyTruthToSignal(sig, truthState);
        if (adjusted.confidence !== sig.confidence) signalsAdjusted++;
        harmonized.push(adjusted);
      }
    }
  }

  return {
    signals: harmonized,
    truth_states: truthStates,
    contradictions_found: contradictionsFound,
    signals_adjusted: signalsAdjusted,
  };
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

function resolveBackingEvidence(
  signal: Signal,
  evidenceByRef: Map<string, Evidence>,
): Evidence[] {
  const result: Evidence[] = [];
  for (const ref of signal.evidence_refs) {
    const ev = evidenceByRef.get(ref);
    if (ev) result.push(ev);
  }
  return result;
}

function buildClaimsFromEvidence(
  signal: Signal,
  evidence: Evidence[],
): TruthClaim[] {
  const now = new Date();
  return evidence.map(ev => ({
    claim_key: signal.signal_key,
    value: signal.value,
    source_authority: SOURCE_AUTHORITY[ev.source_kind] || AuthorityLevel.Structural,
    confidence: signal.confidence,
    evidence_ref: makeRef('evidence', ev.id),
    observed_at: ev.freshness.observed_at,
    freshness_weight: computeFreshnessWeight(ev, now),
  }));
}

function buildClaimsFromSignal(
  signal: Signal,
  evidence: Evidence[],
): TruthClaim[] {
  const now = new Date();

  if (evidence.length === 0) {
    // No evidence resolved — build claim from signal alone
    return [{
      claim_key: signal.signal_key,
      value: signal.value,
      source_authority: AuthorityLevel.Structural,
      confidence: signal.confidence,
      evidence_ref: signal.evidence_refs[0] || '',
      observed_at: signal.freshness.observed_at,
      freshness_weight: 1.0,
    }];
  }

  return evidence.map(ev => ({
    claim_key: signal.signal_key,
    value: signal.value,
    source_authority: SOURCE_AUTHORITY[ev.source_kind] || AuthorityLevel.Structural,
    confidence: signal.confidence,
    evidence_ref: makeRef('evidence', ev.id),
    observed_at: ev.freshness.observed_at,
    freshness_weight: computeFreshnessWeight(ev, now),
  }));
}

function computeFreshnessWeight(evidence: Evidence, now: Date): number {
  const observedAt = evidence.freshness.observed_at.getTime();
  const freshUntil = evidence.freshness.fresh_until.getTime();
  const nowMs = now.getTime();

  if (nowMs <= freshUntil) return 1.0;

  // Decay past freshness window
  const overdueMs = nowMs - freshUntil;
  const overdueHours = overdueMs / (60 * 60 * 1000);

  if (overdueHours < 24) return 0.8;
  if (overdueHours < 72) return 0.5;
  return 0.3;
}

function applyTruthToSignal(signal: Signal, truthState: TruthState): Signal {
  // Find the resolution for this signal's claim key
  const resolution = truthState.resolutions.find(r => r.claim_key === signal.signal_key);
  if (!resolution) return signal;

  // If contested, reduce confidence proportionally to contradiction severity
  let adjustedConfidence = signal.confidence;

  if (resolution.is_contested) {
    // Contested claims reduce confidence based on contradiction severity
    const penaltyPerContradiction: Record<string, number> = {
      critical: 15,
      material: 8,
      minor: 3,
    };

    let totalPenalty = 0;
    for (const contradiction of resolution.contradictions) {
      totalPenalty += penaltyPerContradiction[contradiction.severity] || 3;
    }

    adjustedConfidence = Math.max(10, signal.confidence - totalPenalty);
  } else if (resolution.resolution_method === 'unanimous') {
    // Unanimous agreement boosts confidence
    const boost = Math.min(10, resolution.contributing_claims.length * 3);
    adjustedConfidence = Math.min(100, signal.confidence + boost);
  }

  // Use resolved confidence if it's more conservative
  if (resolution.resolved_confidence < adjustedConfidence) {
    adjustedConfidence = resolution.resolved_confidence;
  }

  if (adjustedConfidence === signal.confidence) return signal;

  return {
    ...signal,
    confidence: adjustedConfidence,
  };
}

function selectResolvedSignal(
  signals: Signal[],
  truthState: TruthState,
): Signal | null {
  if (truthState.resolutions.length === 0) return null;

  const resolution = truthState.resolutions[0];
  // Find signal matching resolved value
  const match = signals.find(s => s.value === resolution.resolved_value);
  return match || signals[0];
}
