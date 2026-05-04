// ──────────────────────────────────────────────
// Multi-Cycle Trend Engine — Wave 7.1
//
// Loads N cycle snapshots, runs pairwise change
// detection across consecutive pairs, and classifies
// per-finding trend patterns over time.
//
// No competitor offers trend-based regression detection.
// ──────────────────────────────────────────────

import type { VersionedSnapshot } from '../change-detection/snapshot-store';
import type { CycleSnapshot } from '../change-detection/engine';
import { detectChanges } from '../change-detection/engine';
import type { CycleChangeReport, DecisionChange, CycleChangeSummary } from '../change-detection/types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * Trend pattern for a single finding across N cycles.
 *
 * `consecutive_regressions` — risk score increased 3+ consecutive cycles
 * `gradual_degradation`    — monotonic (non-strict) increase over the window
 * `sudden_spike`           — single-cycle delta ≥ 2× the average absolute delta
 * `improving`              — risk score decreased 3+ consecutive cycles
 * `oscillating`            — alternating direction �� 3 reversals
 * `stable`                 — no notable change across the window
 */
export type TrendPattern =
  | 'consecutive_regressions'
  | 'gradual_degradation'
  | 'sudden_spike'
  | 'improving'
  | 'oscillating'
  | 'stable';

/**
 * Trend data for a single finding (decision_key).
 */
export interface FindingTrend {
  decision_key: string;
  question_key: string;
  pattern: TrendPattern;
  /** Number of cycles the current pattern has held */
  streak_length: number;
  /** Risk score deltas per cycle pair (oldest→newest) */
  risk_deltas: number[];
  /** Risk scores at each cycle (oldest→newest, null if finding absent) */
  risk_scores: (number | null)[];
  /** Cycle refs in order (oldest→newest) */
  cycle_refs: string[];
  /** Overall risk score change from first to last occurrence */
  total_delta: number;
  /** Average absolute delta per cycle */
  avg_abs_delta: number;
  /** When the finding first appeared in the window */
  first_seen_cycle: string;
  /** When the finding was last seen (null = resolved before window end) */
  last_seen_cycle: string | null;
  /** Human-readable narrative */
  narrative: string;
}

/**
 * Workspace-level trend aggregation.
 */
export interface WorkspaceTrend {
  /** Overall health direction across all findings */
  direction: 'improving' | 'degrading' | 'stable' | 'mixed';
  /** Per-cycle summaries from pairwise comparisons (oldest→newest) */
  cycle_summaries: CycleChangeSummary[];
  /** Volatility: avg number of change_class transitions per cycle */
  volatility: number;
  /** Regression velocity: avg regressions per cycle */
  regression_velocity: number;
  /** Improvement velocity: avg improvements per cycle */
  improvement_velocity: number;
}

/**
 * Complete trend analysis result.
 */
export interface TrendAnalysis {
  /** Number of cycles analyzed */
  lookback_cycles: number;
  /** Cycle refs in chronological order (oldest→newest) */
  cycle_refs: string[];
  /** Per-finding trend patterns */
  finding_trends: FindingTrend[];
  /** Workspace-level aggregate */
  workspace_trend: WorkspaceTrend;
  /** Findings with actionable patterns (sorted by severity) */
  alerts: FindingTrend[];
}

// ──────────────────────────────────────────────
// Thresholds
// ──────────────────────────────────────────────

/** Minimum consecutive cycles for a streak pattern */
const MIN_STREAK = 3;
/** Spike multiplier: delta ≥ SPIKE_FACTOR × avg_abs_delta = sudden_spike */
const SPIKE_FACTOR = 2;
/** Minimum absolute delta to consider non-noise (aligned with change-detection engine) */
const NOISE_FLOOR = 5;

// ──────────────────────────────────────────────
// Core Engine
// ──────────────────────────────────────────────

/**
 * Run multi-cycle trend analysis.
 *
 * @param snapshots — Ordered newest→oldest (as returned by asyncList).
 *                    Reversed internally to oldest→newest for analysis.
 * @param filterPattern — Optional: only return findings matching this pattern.
 */
export function analyzeTrends(
  snapshots: VersionedSnapshot[],
  filterPattern?: TrendPattern,
): TrendAnalysis {
  if (snapshots.length < 2) {
    return emptyAnalysis(snapshots);
  }

  // Reverse to chronological order (oldest → newest)
  const chronological = [...snapshots].reverse();
  const cycleRefs = chronological.map(s => s.cycle_ref);

  // Run pairwise change detection across consecutive snapshots
  const pairwiseReports: CycleChangeReport[] = [];
  for (let i = 0; i < chronological.length - 1; i++) {
    const prev = chronological[i].snapshot;
    const curr = chronological[i + 1].snapshot;
    pairwiseReports.push(detectChanges(prev, curr));
  }

  // Build per-finding timeline: track risk scores across all snapshots
  const findingTimelines = buildFindingTimelines(chronological);

  // Classify patterns
  const findingTrends = classifyAllFindings(findingTimelines, cycleRefs, pairwiseReports);

  // Compute workspace-level trend
  const workspaceTrend = computeWorkspaceTrend(pairwiseReports);

  // Filter if requested
  const filteredTrends = filterPattern
    ? findingTrends.filter(ft => ft.pattern === filterPattern)
    : findingTrends;

  // Extract actionable alerts (non-stable, non-improving patterns first)
  const alerts = filteredTrends
    .filter(ft => ft.pattern !== 'stable' && ft.pattern !== 'improving')
    .sort((a, b) => {
      // Consecutive regressions first, then sudden spikes, then gradual degradation
      const priority: Record<TrendPattern, number> = {
        consecutive_regressions: 0,
        sudden_spike: 1,
        gradual_degradation: 2,
        oscillating: 3,
        improving: 4,
        stable: 5,
      };
      return (priority[a.pattern] - priority[b.pattern]) || (b.total_delta - a.total_delta);
    });

  return {
    lookback_cycles: chronological.length,
    cycle_refs: cycleRefs,
    finding_trends: filteredTrends,
    workspace_trend: workspaceTrend,
    alerts,
  };
}

// ──────────────────────────────────────────────
// Finding Timeline Builder
// ──────────────────────────────────────────────

interface FindingTimeline {
  decision_key: string;
  question_key: string;
  /** Risk score at each cycle index (null = finding absent) */
  scores: (number | null)[];
}

/**
 * Build per-finding risk score timelines across all snapshots.
 */
function buildFindingTimelines(
  snapshots: VersionedSnapshot[],
): FindingTimeline[] {
  // Collect all decision keys across all snapshots
  const allKeys = new Map<string, string>(); // decision_key → question_key
  for (const snap of snapshots) {
    for (const d of snap.snapshot.decisions) {
      if (!allKeys.has(d.decision_key)) {
        allKeys.set(d.decision_key, d.question_key);
      }
    }
  }

  // Build timelines
  const timelines: FindingTimeline[] = [];
  for (const [decisionKey, questionKey] of allKeys) {
    const scores: (number | null)[] = [];
    for (const snap of snapshots) {
      const decision = snap.snapshot.decisions.find(d => d.decision_key === decisionKey);
      scores.push(decision?.raw_risk_score ?? null);
    }
    timelines.push({ decision_key: decisionKey, question_key: questionKey, scores });
  }

  return timelines;
}

// ──────────────────────────────────────────────
// Pattern Classification
// ──────────────────────────────────────────────

function classifyAllFindings(
  timelines: FindingTimeline[],
  cycleRefs: string[],
  reports: CycleChangeReport[],
): FindingTrend[] {
  return timelines.map(tl => classifyFinding(tl, cycleRefs, reports));
}

function classifyFinding(
  timeline: FindingTimeline,
  cycleRefs: string[],
  _reports: CycleChangeReport[],
): FindingTrend {
  const { decision_key, question_key, scores } = timeline;

  // Find first and last non-null indices
  const firstIdx = scores.findIndex(s => s !== null);
  const lastIdx = findLastIndex(scores, s => s !== null);

  // Compute deltas between consecutive non-null scores
  const deltas: number[] = [];
  let prevScore: number | null = null;
  let prevIdx = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] !== null) {
      if (prevScore !== null) {
        deltas.push(scores[i]! - prevScore);
      }
      prevScore = scores[i];
      prevIdx = i;
    }
  }

  const totalDelta = (scores[lastIdx] ?? 0) - (scores[firstIdx] ?? 0);
  const avgAbsDelta = deltas.length > 0
    ? deltas.reduce((sum, d) => sum + Math.abs(d), 0) / deltas.length
    : 0;

  // Classify the pattern
  const pattern = classifyPattern(deltas, avgAbsDelta);

  // Compute streak length for the current pattern
  const streakLength = computeStreak(deltas, pattern);

  const firstSeenCycle = cycleRefs[firstIdx] ?? cycleRefs[0];
  const lastSeenCycle = lastIdx === scores.length - 1 ? cycleRefs[lastIdx] : null;

  const narrative = buildNarrative(decision_key, pattern, streakLength, totalDelta, cycleRefs.length);

  return {
    decision_key,
    question_key,
    pattern,
    streak_length: streakLength,
    risk_deltas: deltas,
    risk_scores: scores,
    cycle_refs: cycleRefs,
    total_delta: totalDelta,
    avg_abs_delta: avgAbsDelta,
    first_seen_cycle: firstSeenCycle,
    last_seen_cycle: lastSeenCycle,
    narrative,
  };
}

function classifyPattern(deltas: number[], avgAbsDelta: number): TrendPattern {
  if (deltas.length === 0) return 'stable';

  // Check for sudden spike (any single delta ≥ SPIKE_FACTOR × average)
  if (avgAbsDelta > NOISE_FLOOR) {
    for (const d of deltas) {
      if (Math.abs(d) >= SPIKE_FACTOR * avgAbsDelta && Math.abs(d) > NOISE_FLOOR) {
        if (d > 0) return 'sudden_spike';
      }
    }
  }

  // Count consecutive regression/improvement streaks
  let regressionStreak = 0;
  let maxRegressionStreak = 0;
  let improvementStreak = 0;
  let maxImprovementStreak = 0;
  let reversals = 0;
  let prevDirection: 'up' | 'down' | 'flat' = 'flat';

  for (const d of deltas) {
    const direction: 'up' | 'down' | 'flat' =
      d > NOISE_FLOOR ? 'up' : d < -NOISE_FLOOR ? 'down' : 'flat';

    if (direction === 'up') {
      regressionStreak++;
      improvementStreak = 0;
      maxRegressionStreak = Math.max(maxRegressionStreak, regressionStreak);
    } else if (direction === 'down') {
      improvementStreak++;
      regressionStreak = 0;
      maxImprovementStreak = Math.max(maxImprovementStreak, improvementStreak);
    } else {
      // flat resets both streaks
      regressionStreak = 0;
      improvementStreak = 0;
    }

    if (direction !== 'flat' && prevDirection !== 'flat' && direction !== prevDirection) {
      reversals++;
    }
    if (direction !== 'flat') prevDirection = direction;
  }

  if (maxRegressionStreak >= MIN_STREAK) return 'consecutive_regressions';
  if (maxImprovementStreak >= MIN_STREAK) return 'improving';

  // Gradual degradation: monotonic non-strict increase (all deltas ≥ 0, total > noise)
  const totalDelta = deltas.reduce((sum, d) => sum + d, 0);
  if (deltas.length >= 2 && deltas.every(d => d >= 0) && totalDelta > NOISE_FLOOR) {
    return 'gradual_degradation';
  }

  // Oscillating: 3+ reversals
  if (reversals >= 3) return 'oscillating';

  return 'stable';
}

function computeStreak(deltas: number[], pattern: TrendPattern): number {
  if (deltas.length === 0) return 0;

  if (pattern === 'consecutive_regressions') {
    let streak = 0;
    for (let i = deltas.length - 1; i >= 0; i--) {
      if (deltas[i] > NOISE_FLOOR) streak++;
      else break;
    }
    return streak;
  }

  if (pattern === 'improving') {
    let streak = 0;
    for (let i = deltas.length - 1; i >= 0; i--) {
      if (deltas[i] < -NOISE_FLOOR) streak++;
      else break;
    }
    return streak;
  }

  // For other patterns, streak = total cycles in the window
  return deltas.length + 1;
}

// ──────────────────────────────────────────────
// Workspace Trend Aggregation
// ──────────────────────────────────────────────

function computeWorkspaceTrend(reports: CycleChangeReport[]): WorkspaceTrend {
  if (reports.length === 0) {
    return {
      direction: 'stable',
      cycle_summaries: [],
      volatility: 0,
      regression_velocity: 0,
      improvement_velocity: 0,
    };
  }

  const summaries = reports.map(r => r.summary);
  const totalRegressions = summaries.reduce((sum, s) => sum + s.regression_count, 0);
  const totalImprovements = summaries.reduce((sum, s) => sum + s.improvement_count, 0);
  const avgRegressions = totalRegressions / reports.length;
  const avgImprovements = totalImprovements / reports.length;

  // Volatility: average total non-noise changes per cycle
  const totalChangesPerCycle = summaries.map(s =>
    s.regression_count + s.improvement_count + s.new_issue_count + s.resolved_count,
  );
  const volatility = totalChangesPerCycle.reduce((sum, n) => sum + n, 0) / reports.length;

  // Direction: weight recent cycles more heavily (last 3 cycles count 2x)
  let weightedRegress = 0;
  let weightedImprove = 0;
  for (let i = 0; i < summaries.length; i++) {
    const weight = i >= summaries.length - 3 ? 2 : 1;
    weightedRegress += summaries[i].regression_count * weight;
    weightedImprove += summaries[i].improvement_count * weight;
  }

  let direction: WorkspaceTrend['direction'];
  if (weightedRegress > weightedImprove * 1.5) direction = 'degrading';
  else if (weightedImprove > weightedRegress * 1.5) direction = 'improving';
  else if (weightedRegress === 0 && weightedImprove === 0) direction = 'stable';
  else direction = 'mixed';

  return {
    direction,
    cycle_summaries: summaries,
    volatility,
    regression_velocity: avgRegressions,
    improvement_velocity: avgImprovements,
  };
}

// ──────────────────────────────────────────────
// Narrative Builder
// ──────────────────────────────────────────────

function buildNarrative(
  decisionKey: string,
  pattern: TrendPattern,
  streakLength: number,
  totalDelta: number,
  totalCycles: number,
): string {
  const key = decisionKey.replace(/_/g, ' ');

  switch (pattern) {
    case 'consecutive_regressions':
      return `${key} has been degrading for ${streakLength} consecutive cycles (risk +${totalDelta} over ${totalCycles} cycles analyzed)`;
    case 'gradual_degradation':
      return `${key} shows gradual degradation over ${totalCycles} cycles (risk +${totalDelta} total)`;
    case 'sudden_spike':
      return `${key} had a sudden risk spike (total delta: +${totalDelta} over ${totalCycles} cycles)`;
    case 'improving':
      return `${key} has been improving for ${streakLength} consecutive cycles (risk ${totalDelta} over ${totalCycles} cycles)`;
    case 'oscillating':
      return `${key} is oscillating — risk score alternating direction across ${totalCycles} cycles`;
    case 'stable':
      return `${key} is stable across ${totalCycles} cycles`;
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

function emptyAnalysis(snapshots: VersionedSnapshot[]): TrendAnalysis {
  return {
    lookback_cycles: snapshots.length,
    cycle_refs: snapshots.map(s => s.cycle_ref).reverse(),
    finding_trends: [],
    workspace_trend: {
      direction: 'stable',
      cycle_summaries: [],
      volatility: 0,
      regression_velocity: 0,
      improvement_velocity: 0,
    },
    alerts: [],
  };
}
