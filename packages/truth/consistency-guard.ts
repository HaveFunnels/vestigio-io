import { Signal } from '../domain';
import { HarmonizationResult } from './signal-harmonizer';
import { TruthState, TruthContradiction } from './types';

// ──────────────────────────────────────────────
// Truth Consistency Guard
//
// Ensures harmonized truth is the ONLY source of
// truth for multi-source attributes. No downstream
// component can operate on unresolved conflicting truth.
//
// Responsibilities:
// 1. Attach contradiction metadata to signals so it
//    flows through inference → decision → projection
// 2. Validate no signal escapes harmonization unresolved
// 3. Provide explainability data for contradiction context
// ──────────────────────────────────────────────

/**
 * Metadata attached to each signal after truth harmonization.
 * Flows through the entire pipeline for explainability.
 */
export interface TruthMetadata {
  /** Whether this signal was subject to truth resolution */
  harmonized: boolean;
  /** Number of contradictions found for this signal's group */
  contradiction_count: number;
  /** Severity of contradictions (if any) */
  contradiction_severities: string[];
  /** Resolution method used (unanimous, authority, recency, etc.) */
  resolution_method: string | null;
  /** Whether the resolved value was contested */
  is_contested: boolean;
  /** Original confidence before truth adjustment */
  pre_harmonization_confidence: number;
  /** Confidence delta from truth resolution */
  truth_confidence_delta: number;
}

/**
 * Extended signal with truth metadata for downstream consumption.
 */
export interface SignalWithTruth extends Signal {
  truth_metadata: TruthMetadata;
}

/**
 * Result of the consistency guard — validated signals with truth metadata.
 */
export interface TruthConsistencyResult {
  /** Signals annotated with truth metadata */
  signals: SignalWithTruth[];
  /** Unresolved contradictions that could not be harmonized */
  unresolved_contradictions: UnresolvedContradiction[];
  /** Whether all multi-source signals were successfully harmonized */
  fully_consistent: boolean;
  /** Summary for explainability */
  consistency_summary: ConsistencySummary;
}

export interface UnresolvedContradiction {
  signal_key: string;
  subject_ref: string;
  contradiction_count: number;
  highest_severity: string;
  reason: string;
}

export interface ConsistencySummary {
  total_signals: number;
  harmonized_signals: number;
  contested_signals: number;
  unresolved_count: number;
  total_contradictions: number;
  /** Human-readable narrative */
  narrative: string;
}

/**
 * Attach truth metadata to harmonized signals and validate consistency.
 * Called immediately after harmonizeSignals() in the pipeline.
 *
 * This ensures:
 * - Every signal carries its truth provenance
 * - Contradiction metadata flows through to explainability
 * - No unresolved conflicts silently propagate
 */
export function guardTruthConsistency(
  originalSignals: Signal[],
  harmonizedSignals: Signal[],
  harmonization: HarmonizationResult,
): TruthConsistencyResult {
  // Build lookup: signal_key:subject_ref → truth state
  const truthByGroup = new Map<string, TruthState>();
  for (const ts of harmonization.truth_states) {
    for (const res of ts.resolutions) {
      truthByGroup.set(`${res.claim_key}:${ts.subject_ref}`, ts);
    }
  }

  // Build original confidence lookup
  const originalConfidence = new Map<string, number>();
  for (const sig of originalSignals) {
    originalConfidence.set(sig.id, sig.confidence);
  }

  const annotated: SignalWithTruth[] = [];
  const unresolved: UnresolvedContradiction[] = [];
  let harmonizedCount = 0;
  let contestedCount = 0;
  let totalContradictions = 0;

  for (const sig of harmonizedSignals) {
    const groupKey = `${sig.signal_key}:${sig.scoping.subject_ref}`;
    const truthState = truthByGroup.get(groupKey);
    const origConf = originalConfidence.get(sig.id) ?? sig.confidence;

    if (!truthState) {
      // Single-source signal — no harmonization needed
      annotated.push({
        ...sig,
        truth_metadata: {
          harmonized: false,
          contradiction_count: 0,
          contradiction_severities: [],
          resolution_method: null,
          is_contested: false,
          pre_harmonization_confidence: origConf,
          truth_confidence_delta: 0,
        },
      });
      continue;
    }

    // Find the resolution for this signal
    const resolution = truthState.resolutions.find(r => r.claim_key === sig.signal_key);
    const isContested = resolution?.is_contested ?? false;
    const contradictions = resolution?.contradictions ?? [];
    const severities = contradictions.map(c => c.severity);

    harmonizedCount++;
    if (isContested) contestedCount++;
    totalContradictions += contradictions.length;

    // Check for unresolvable contradictions (multiple critical contradictions)
    const criticalCount = severities.filter(s => s === 'critical').length;
    if (criticalCount >= 2 && isContested) {
      unresolved.push({
        signal_key: sig.signal_key,
        subject_ref: sig.scoping.subject_ref,
        contradiction_count: contradictions.length,
        highest_severity: 'critical',
        reason: `${criticalCount} critical contradictions could not be fully resolved. Confidence heavily penalized.`,
      });
    }

    annotated.push({
      ...sig,
      truth_metadata: {
        harmonized: true,
        contradiction_count: contradictions.length,
        contradiction_severities: severities,
        resolution_method: resolution?.resolution_method ?? null,
        is_contested: isContested,
        pre_harmonization_confidence: origConf,
        truth_confidence_delta: sig.confidence - origConf,
      },
    });
  }

  const narrative = buildNarrative(
    harmonizedSignals.length, harmonizedCount, contestedCount,
    unresolved.length, totalContradictions,
  );

  return {
    signals: annotated,
    unresolved_contradictions: unresolved,
    fully_consistent: unresolved.length === 0,
    consistency_summary: {
      total_signals: harmonizedSignals.length,
      harmonized_signals: harmonizedCount,
      contested_signals: contestedCount,
      unresolved_count: unresolved.length,
      total_contradictions: totalContradictions,
      narrative,
    },
  };
}

/**
 * Validate that no downstream component has signals without truth metadata.
 * Use as a guard at inference computation entry point.
 */
export function assertTruthResolved(signals: SignalWithTruth[]): void {
  for (const sig of signals) {
    if (!sig.truth_metadata) {
      throw new Error(
        `Signal ${sig.id} (${sig.signal_key}) missing truth_metadata. ` +
        `All signals must pass through truth consistency guard before inference.`,
      );
    }
  }
}

/**
 * Extract contradiction context for a specific inference key.
 * Used by explainability layers to show truth provenance.
 */
export function getContradictionContext(
  signals: SignalWithTruth[],
  inferenceKey: string,
): ContradictionContext {
  const relevant = signals.filter(s =>
    s.signal_key.includes(inferenceKey) || inferenceKey.includes(s.signal_key),
  );

  const contested = relevant.filter(s => s.truth_metadata.is_contested);
  const totalDelta = relevant.reduce((sum, s) => sum + s.truth_metadata.truth_confidence_delta, 0);

  return {
    inference_key: inferenceKey,
    signals_evaluated: relevant.length,
    contested_signals: contested.length,
    total_confidence_impact: totalDelta,
    contradictions: contested.flatMap(s =>
      s.truth_metadata.contradiction_severities.map(sev => ({
        signal_key: s.signal_key,
        severity: sev,
        confidence_delta: s.truth_metadata.truth_confidence_delta,
      })),
    ),
    has_truth_issues: contested.length > 0,
  };
}

export interface ContradictionContext {
  inference_key: string;
  signals_evaluated: number;
  contested_signals: number;
  total_confidence_impact: number;
  contradictions: { signal_key: string; severity: string; confidence_delta: number }[];
  has_truth_issues: boolean;
}

// ──────────────────────────────────────────────
// Internal
// ──────────────────────────────────────────────

function buildNarrative(
  total: number,
  harmonized: number,
  contested: number,
  unresolvedCount: number,
  contradictions: number,
): string {
  if (harmonized === 0) {
    return `All ${total} signals from single sources — no truth resolution needed.`;
  }

  const parts: string[] = [];
  parts.push(`${harmonized} of ${total} signals required truth resolution`);

  if (contradictions > 0) {
    parts.push(`${contradictions} contradiction${contradictions > 1 ? 's' : ''} detected`);
  }

  if (contested > 0) {
    parts.push(`${contested} signal${contested > 1 ? 's' : ''} remain contested`);
  }

  if (unresolvedCount > 0) {
    parts.push(`${unresolvedCount} critical contradiction${unresolvedCount > 1 ? 's' : ''} could not be fully resolved`);
  } else {
    parts.push('all contradictions resolved');
  }

  return parts.join('; ') + '.';
}
