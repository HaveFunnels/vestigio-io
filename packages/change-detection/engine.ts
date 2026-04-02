import { Decision, Signal, EffectiveSeverity, DecisionImpact } from '../domain';
import {
  DecisionChange,
  EvidenceChange,
  CycleChangeReport,
  CycleChangeSummary,
  ChangeClass,
  ChangeSeverity,
} from './types';

// ──────────────────────────────────────────────
// Change Detection Engine
//
// Compares two cycle results and classifies every
// difference as regression, improvement, noise,
// or stable state. Deterministic and explainable.
// ──────────────────────────────────────────────

// Noise threshold: score changes within this range are considered noise
const NOISE_THRESHOLD = 5;
// Minimum delta to consider a change notable
const NOTABLE_THRESHOLD = 15;
// Minimum delta to consider a change significant
const SIGNIFICANT_THRESHOLD = 30;

export interface CycleSnapshot {
  cycle_ref: string;
  decisions: Decision[];
  signals: Signal[];
}

/**
 * Compare two cycle snapshots and produce a change report.
 */
export function detectChanges(
  previous: CycleSnapshot,
  current: CycleSnapshot,
): CycleChangeReport {
  const now = new Date();

  // Index decisions by key for lookup
  const prevByKey = new Map(previous.decisions.map(d => [d.decision_key, d]));
  const currByKey = new Map(current.decisions.map(d => [d.decision_key, d]));

  const decisionChanges: DecisionChange[] = [];

  // Check all current decisions against previous
  for (const [key, currDecision] of currByKey) {
    const prevDecision = prevByKey.get(key);

    if (!prevDecision) {
      // New issue
      decisionChanges.push(createNewIssueChange(currDecision, previous.cycle_ref, current.cycle_ref));
      continue;
    }

    // Compare existing decisions
    const change = compareDecisions(prevDecision, currDecision, previous.cycle_ref, current.cycle_ref);
    if (change) decisionChanges.push(change);
  }

  // Check for resolved issues (in previous but not in current)
  for (const [key, prevDecision] of prevByKey) {
    if (!currByKey.has(key)) {
      decisionChanges.push(createResolvedChange(prevDecision, previous.cycle_ref, current.cycle_ref));
    }
  }

  // Detect signal-level changes (material only)
  const evidenceChanges = detectSignalChanges(previous.signals, current.signals);

  // Classify
  const regressions = decisionChanges.filter(c => c.change_class === 'regression');
  const improvements = decisionChanges.filter(c => c.change_class === 'improvement');
  const stableRisks = decisionChanges.filter(c => c.change_class === 'stable_risk');
  const newIssues = decisionChanges.filter(c => c.change_class === 'new_issue');
  const resolved = decisionChanges.filter(c => c.change_class === 'resolved');
  const noise = decisionChanges.filter(c => c.change_class === 'noise');

  const summary = buildSummary(decisionChanges, regressions, improvements, stableRisks, newIssues, resolved, noise);

  return {
    previous_cycle_ref: previous.cycle_ref,
    current_cycle_ref: current.cycle_ref,
    generated_at: now,
    decision_changes: decisionChanges,
    regressions,
    improvements,
    stable_risks: stableRisks,
    new_issues: newIssues,
    resolved_issues: resolved,
    evidence_changes: evidenceChanges,
    summary,
  };
}

// ──────────────────────────────────────────────
// Decision comparison
// ──────────────────────────────────────────────

function compareDecisions(
  prev: Decision,
  curr: Decision,
  prevCycleRef: string,
  currCycleRef: string,
): DecisionChange {
  const riskDelta = (curr.raw_risk_score || 0) - (prev.raw_risk_score || 0);
  const confidenceDelta = curr.confidence_score - prev.confidence_score;
  const severityChanged = prev.effective_severity !== curr.effective_severity;
  const impactChanged = prev.decision_impact !== curr.decision_impact;

  const changeClass = classifyChange(prev, curr, riskDelta);
  const severity = classifyChangeSeverity(riskDelta, severityChanged, impactChanged);
  const factors = identifyContributingFactors(prev, curr, riskDelta, confidenceDelta);
  const summary = buildChangeSummary(curr.decision_key, changeClass, riskDelta, severity);

  return {
    decision_key: curr.decision_key,
    question_key: curr.question_key,
    change_class: changeClass,
    severity,
    previous_cycle_ref: prevCycleRef,
    current_cycle_ref: currCycleRef,
    risk_score_delta: riskDelta,
    confidence_score_delta: confidenceDelta,
    severity_change: severityChanged
      ? { from: prev.effective_severity, to: curr.effective_severity }
      : null,
    impact_change: impactChanged
      ? { from: prev.decision_impact, to: curr.decision_impact }
      : null,
    contributing_factors: factors,
    summary,
  };
}

function classifyChange(
  prev: Decision,
  curr: Decision,
  riskDelta: number,
): ChangeClass {
  const absRiskDelta = Math.abs(riskDelta);

  // Within noise range
  if (absRiskDelta <= NOISE_THRESHOLD &&
      prev.effective_severity === curr.effective_severity &&
      prev.decision_impact === curr.decision_impact) {
    // Still risky?
    if (isRiskyDecision(curr)) return 'stable_risk';
    return 'stable_healthy';
  }

  if (absRiskDelta <= NOISE_THRESHOLD) {
    // Score didn't change much but severity/impact shifted — could be at a boundary
    if (severityRank(curr.effective_severity) > severityRank(prev.effective_severity)) {
      return 'regression';
    }
    if (severityRank(curr.effective_severity) < severityRank(prev.effective_severity)) {
      return 'improvement';
    }
    return 'noise';
  }

  if (riskDelta > NOISE_THRESHOLD) return 'regression';
  if (riskDelta < -NOISE_THRESHOLD) return 'improvement';
  return 'noise';
}

function classifyChangeSeverity(
  riskDelta: number,
  severityChanged: boolean,
  impactChanged: boolean,
): ChangeSeverity {
  const absRiskDelta = Math.abs(riskDelta);

  if (absRiskDelta >= SIGNIFICANT_THRESHOLD || (severityChanged && impactChanged)) {
    return 'critical';
  }
  if (absRiskDelta >= NOTABLE_THRESHOLD || severityChanged) {
    return 'significant';
  }
  if (absRiskDelta > NOISE_THRESHOLD) {
    return 'notable';
  }
  if (absRiskDelta > 0) {
    return 'minor';
  }
  return 'none';
}

function identifyContributingFactors(
  prev: Decision,
  curr: Decision,
  riskDelta: number,
  confidenceDelta: number,
): string[] {
  const factors: string[] = [];

  if (Math.abs(riskDelta) > NOISE_THRESHOLD) {
    factors.push(`Risk score ${riskDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(riskDelta)} points`);
  }

  if (Math.abs(confidenceDelta) > 10) {
    factors.push(`Confidence ${confidenceDelta > 0 ? 'improved' : 'degraded'} by ${Math.abs(confidenceDelta)} points`);
  }

  if (prev.effective_severity !== curr.effective_severity) {
    factors.push(`Severity changed from ${prev.effective_severity} to ${curr.effective_severity}`);
  }

  if (prev.decision_impact !== curr.decision_impact) {
    factors.push(`Impact changed from ${prev.decision_impact} to ${curr.decision_impact}`);
  }

  // Check for new/removed evidence
  const prevEvidenceSet = new Set(prev.why.evidence_refs);
  const currEvidenceSet = new Set(curr.why.evidence_refs);
  const newEvidence = curr.why.evidence_refs.filter(r => !prevEvidenceSet.has(r));
  const removedEvidence = prev.why.evidence_refs.filter(r => !currEvidenceSet.has(r));

  if (newEvidence.length > 0) {
    factors.push(`${newEvidence.length} new evidence items discovered`);
  }
  if (removedEvidence.length > 0) {
    factors.push(`${removedEvidence.length} evidence items no longer present`);
  }

  return factors;
}

function createNewIssueChange(
  decision: Decision,
  prevCycleRef: string,
  currCycleRef: string,
): DecisionChange {
  return {
    decision_key: decision.decision_key,
    question_key: decision.question_key,
    change_class: 'new_issue',
    severity: isRiskyDecision(decision) ? 'significant' : 'notable',
    previous_cycle_ref: prevCycleRef,
    current_cycle_ref: currCycleRef,
    risk_score_delta: decision.raw_risk_score || 0,
    confidence_score_delta: decision.confidence_score,
    severity_change: null,
    impact_change: null,
    contributing_factors: ['First observation of this decision'],
    summary: `New: ${decision.decision_key} (severity: ${decision.effective_severity}, impact: ${decision.decision_impact})`,
  };
}

function createResolvedChange(
  decision: Decision,
  prevCycleRef: string,
  currCycleRef: string,
): DecisionChange {
  return {
    decision_key: decision.decision_key,
    question_key: decision.question_key,
    change_class: 'resolved',
    severity: 'notable',
    previous_cycle_ref: prevCycleRef,
    current_cycle_ref: currCycleRef,
    risk_score_delta: -(decision.raw_risk_score || 0),
    confidence_score_delta: -decision.confidence_score,
    severity_change: { from: decision.effective_severity, to: 'none' },
    impact_change: { from: decision.decision_impact, to: 'observe' },
    contributing_factors: ['Issue no longer detected in current cycle'],
    summary: `Resolved: ${decision.decision_key} (was severity: ${decision.effective_severity})`,
  };
}

// ──────────────────────────────────────────────
// Signal-level change detection
// ──────────────────────────────────────────────

function detectSignalChanges(
  prevSignals: Signal[],
  currSignals: Signal[],
): EvidenceChange[] {
  const changes: EvidenceChange[] = [];
  const prevByKey = new Map(prevSignals.map(s => [s.signal_key + ':' + s.scoping.subject_ref, s]));
  const currByKey = new Map(currSignals.map(s => [s.signal_key + ':' + s.scoping.subject_ref, s]));

  for (const [key, curr] of currByKey) {
    const prev = prevByKey.get(key);
    if (!prev) {
      changes.push({
        subject_ref: curr.scoping.subject_ref,
        change_class: 'new_issue',
        evidence_type: curr.category,
        previous_value: null,
        current_value: curr.value,
        confidence_delta: curr.confidence,
        summary: `New signal: ${curr.signal_key} = ${curr.value}`,
      });
      continue;
    }

    if (prev.value !== curr.value) {
      const confidenceDelta = curr.confidence - prev.confidence;
      changes.push({
        subject_ref: curr.scoping.subject_ref,
        change_class: confidenceDelta > 0 ? 'improvement' : 'regression',
        evidence_type: curr.category,
        previous_value: prev.value,
        current_value: curr.value,
        confidence_delta: confidenceDelta,
        summary: `Signal ${curr.signal_key} changed from ${prev.value} to ${curr.value}`,
      });
    }
  }

  return changes;
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

function buildSummary(
  all: DecisionChange[],
  regressions: DecisionChange[],
  improvements: DecisionChange[],
  stableRisks: DecisionChange[],
  newIssues: DecisionChange[],
  resolved: DecisionChange[],
  noise: DecisionChange[],
): CycleChangeSummary {
  const regressionCount = regressions.length;
  const improvementCount = improvements.length;

  let overallTrend: CycleChangeSummary['overall_trend'];
  if (regressionCount > 0 && improvementCount === 0) overallTrend = 'degrading';
  else if (improvementCount > 0 && regressionCount === 0) overallTrend = 'improving';
  else if (regressionCount === 0 && improvementCount === 0) overallTrend = 'stable';
  else overallTrend = 'mixed';

  const parts: string[] = [];
  if (regressionCount > 0) parts.push(`${regressionCount} regression${regressionCount > 1 ? 's' : ''}`);
  if (improvementCount > 0) parts.push(`${improvementCount} improvement${improvementCount > 1 ? 's' : ''}`);
  if (newIssues.length > 0) parts.push(`${newIssues.length} new issue${newIssues.length > 1 ? 's' : ''}`);
  if (resolved.length > 0) parts.push(`${resolved.length} resolved`);
  if (stableRisks.length > 0) parts.push(`${stableRisks.length} unchanged risk${stableRisks.length > 1 ? 's' : ''}`);

  return {
    total_decisions_compared: all.length,
    regression_count: regressionCount,
    improvement_count: improvementCount,
    stable_risk_count: stableRisks.length,
    new_issue_count: newIssues.length,
    resolved_count: resolved.length,
    noise_count: noise.length,
    overall_trend: overallTrend,
    headline: parts.length > 0 ? parts.join(', ') : 'No changes detected',
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function isRiskyDecision(d: Decision): boolean {
  return d.decision_impact === DecisionImpact.Incident
    || d.decision_impact === DecisionImpact.BlockLaunch
    || d.decision_impact === DecisionImpact.FixBeforeScale;
}

function severityRank(sev: EffectiveSeverity): number {
  switch (sev) {
    case EffectiveSeverity.None: return 0;
    case EffectiveSeverity.Low: return 1;
    case EffectiveSeverity.Medium: return 2;
    case EffectiveSeverity.High: return 3;
    case EffectiveSeverity.Critical: return 4;
  }
}

function buildChangeSummary(
  decisionKey: string,
  changeClass: ChangeClass,
  riskDelta: number,
  severity: ChangeSeverity,
): string {
  switch (changeClass) {
    case 'regression':
      return `${decisionKey}: regressed (risk +${riskDelta}, severity: ${severity})`;
    case 'improvement':
      return `${decisionKey}: improved (risk ${riskDelta}, severity: ${severity})`;
    case 'stable_risk':
      return `${decisionKey}: unchanged but still risky`;
    case 'stable_healthy':
      return `${decisionKey}: stable and healthy`;
    case 'noise':
      return `${decisionKey}: minor fluctuation (within noise threshold)`;
    default:
      return `${decisionKey}: ${changeClass}`;
  }
}
