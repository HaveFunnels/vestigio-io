import { Signal, makeRef } from '../domain';
import { EvidenceQuality } from './quality';

// ──────────────────────────────────────────────
// Evidence Quality → Confidence Adjuster
//
// Adjusts signal confidence based on the quality of
// backing evidence. Low-quality evidence should reduce
// confidence; high-quality evidence can preserve it.
//
// This ensures evidence quality is not just metadata
// but actively governs downstream confidence.
// ──────────────────────────────────────────────

export interface QualityAdjustmentResult {
  signals: Signal[];
  adjustments_made: number;
  average_quality_score: number;
}

/**
 * Adjust signal confidence based on evidence quality scores.
 * Signals backed by low-quality evidence have confidence reduced.
 * Signals backed by high-quality evidence pass through unchanged.
 */
export function adjustConfidenceByQuality(
  signals: Signal[],
  qualityScores: EvidenceQuality[],
): QualityAdjustmentResult {
  if (qualityScores.length === 0) {
    return { signals, adjustments_made: 0, average_quality_score: 0 };
  }

  // Index quality by evidence ref
  const qualityByRef = new Map<string, EvidenceQuality>();
  for (const q of qualityScores) {
    qualityByRef.set(q.evidence_ref, q);
  }

  const avgQuality = qualityScores.reduce((sum, q) => sum + q.composite_score, 0) / qualityScores.length;

  let adjustmentsMade = 0;
  const adjusted = signals.map(sig => {
    const backingQualities = getBackingQualities(sig, qualityByRef);
    if (backingQualities.length === 0) return sig;

    // Average quality of backing evidence
    const avgBackingQuality = backingQualities.reduce((sum, q) => sum + q.composite_score, 0) / backingQualities.length;

    // Quality multiplier: maps 0..100 quality → 0.5..1.0 confidence retention
    // Quality >= 70: no penalty (multiplier = 1.0)
    // Quality 40-70: mild penalty (0.75-1.0)
    // Quality < 40: significant penalty (0.5-0.75)
    const multiplier = qualityToMultiplier(avgBackingQuality);

    if (multiplier >= 1.0) return sig;

    const adjustedConfidence = Math.max(5, Math.round(sig.confidence * multiplier));
    if (adjustedConfidence === sig.confidence) return sig;

    adjustmentsMade++;
    return { ...sig, confidence: adjustedConfidence };
  });

  return {
    signals: adjusted,
    adjustments_made: adjustmentsMade,
    average_quality_score: Math.round(avgQuality),
  };
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

function getBackingQualities(
  signal: Signal,
  qualityByRef: Map<string, EvidenceQuality>,
): EvidenceQuality[] {
  const result: EvidenceQuality[] = [];
  for (const ref of signal.evidence_refs) {
    const q = qualityByRef.get(ref);
    if (q) result.push(q);
  }
  return result;
}

function qualityToMultiplier(quality: number): number {
  if (quality >= 70) return 1.0;
  if (quality >= 40) {
    // Linear interpolation: 40 → 0.75, 70 → 1.0
    return 0.75 + (quality - 40) / 30 * 0.25;
  }
  // Below 40: 0 → 0.5, 40 → 0.75
  return 0.5 + (quality / 40) * 0.25;
}
