import {
  Decision,
  DecisionImpact,
  EffectiveSeverity,
  DecisionClass,
  Ref,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Decision Conflict Resolver
//
// Ensures no contradictory outputs reach the user ungoverned.
// Detects conflicts between decisions across packs and resolves
// them through precedence rules, annotation, or meta-synthesis.
//
// Core rule: if one pack says "safe to scale" and another says
// "critical blocker exists", the user must see a coherent story.
// ──────────────────────────────────────────────

export interface DecisionConflict {
  decision_a_ref: Ref;
  decision_b_ref: Ref;
  conflict_type: ConflictType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolution: ConflictResolution;
}

export type ConflictType =
  | 'impact_contradiction'    // one says safe, another says critical
  | 'severity_divergence'     // same evidence, very different severity
  | 'confidence_asymmetry'    // one high confidence, another low on related topic
  | 'action_contradiction';   // recommended actions conflict

export interface ConflictResolution {
  method: 'precedence' | 'annotation' | 'synthesis' | 'deferred';
  winning_decision_ref: Ref | null;   // null for synthesis/annotation
  rationale: string;
  user_facing_note: string | null;    // displayed to user when conflict exists
  confidence_adjustment: number;      // penalty to lower-confidence decision
}

export interface ConflictReport {
  decisions_evaluated: number;
  conflicts: DecisionConflict[];
  has_critical_conflict: boolean;
  resolved_decisions: ResolvedDecisionSet;
  summary: string;
}

/**
 * After conflict resolution, decisions are annotated with conflict context.
 */
export interface ResolvedDecisionSet {
  decisions: ResolvedDecision[];
  coherence_score: number; // 0..100 — how internally consistent
}

export interface ResolvedDecision {
  decision_ref: Ref;
  original_impact: DecisionImpact;
  resolved_impact: DecisionImpact;
  conflict_refs: Ref[];         // references to conflicts affecting this decision
  suppressed: boolean;          // true if this decision should not surface independently
  annotation: string | null;    // added context for the user
}

// ──────────────────────────────────────────────
// Impact precedence — higher = takes priority in conflict
// ──────────────────────────────────────────────

const IMPACT_RANK: Record<DecisionImpact, number> = {
  [DecisionImpact.Observe]: 0,
  [DecisionImpact.Optimize]: 1,
  [DecisionImpact.FixBeforeScale]: 2,
  [DecisionImpact.BlockLaunch]: 3,
  [DecisionImpact.Incident]: 4,
};

const SEVERITY_RANK: Record<EffectiveSeverity, number> = {
  [EffectiveSeverity.None]: 0,
  [EffectiveSeverity.Low]: 1,
  [EffectiveSeverity.Medium]: 2,
  [EffectiveSeverity.High]: 3,
  [EffectiveSeverity.Critical]: 4,
};

/**
 * Resolve conflicts across a set of decisions.
 * Typically called with all pack decisions from a single recompute.
 */
export function resolveDecisionConflicts(decisions: Decision[]): ConflictReport {
  const conflicts: DecisionConflict[] = [];

  // Check all pairs
  for (let i = 0; i < decisions.length; i++) {
    for (let j = i + 1; j < decisions.length; j++) {
      const detected = detectConflicts(decisions[i], decisions[j]);
      conflicts.push(...detected);
    }
  }

  const hasCritical = conflicts.some(c => c.severity === 'critical');
  const resolved = buildResolvedSet(decisions, conflicts);
  const summary = buildConflictSummary(conflicts, decisions.length);

  return {
    decisions_evaluated: decisions.length,
    conflicts,
    has_critical_conflict: hasCritical,
    resolved_decisions: resolved,
    summary,
  };
}

// ──────────────────────────────────────────────
// Conflict detection between two decisions
// ──────────────────────────────────────────────

function detectConflicts(a: Decision, b: Decision): DecisionConflict[] {
  const conflicts: DecisionConflict[] = [];
  const aRef = makeRef('decision', a.id);
  const bRef = makeRef('decision', b.id);

  // 1. Impact contradiction: one says safe, another says critical
  const impactGap = Math.abs(IMPACT_RANK[a.decision_impact] - IMPACT_RANK[b.decision_impact]);
  if (impactGap >= 3) {
    const higher = IMPACT_RANK[a.decision_impact] > IMPACT_RANK[b.decision_impact] ? a : b;
    const lower = higher === a ? b : a;

    conflicts.push({
      decision_a_ref: aRef,
      decision_b_ref: bRef,
      conflict_type: 'impact_contradiction',
      severity: 'critical',
      description: `"${a.decision_key}" says ${a.decision_impact} but "${b.decision_key}" says ${b.decision_impact}`,
      resolution: {
        method: 'precedence',
        winning_decision_ref: makeRef('decision', higher.id),
        rationale: `Higher-impact decision (${higher.decision_impact}) takes precedence. ` +
          `The system cannot claim "${lower.decision_key}" while "${higher.decision_key}" exists.`,
        user_facing_note: `Note: while ${lower.decision_key} suggests ${lower.decision_impact}, ` +
          `${higher.decision_key} requires ${higher.decision_impact} action first.`,
        confidence_adjustment: 0,
      },
    });
  } else if (impactGap === 2) {
    // Moderate contradiction
    const higher = IMPACT_RANK[a.decision_impact] > IMPACT_RANK[b.decision_impact] ? a : b;
    const lower = higher === a ? b : a;

    conflicts.push({
      decision_a_ref: aRef,
      decision_b_ref: bRef,
      conflict_type: 'impact_contradiction',
      severity: 'medium',
      description: `Impact gap between "${a.decision_key}" (${a.decision_impact}) and "${b.decision_key}" (${b.decision_impact})`,
      resolution: {
        method: 'annotation',
        winning_decision_ref: null,
        rationale: `Both decisions valid but should be presented with context about their relationship.`,
        user_facing_note: `${lower.decision_key} assessment is conditional on addressing ${higher.decision_key} first.`,
        confidence_adjustment: 0,
      },
    });
  }

  // 2. Severity divergence with shared evidence
  const severityGap = Math.abs(SEVERITY_RANK[a.effective_severity] - SEVERITY_RANK[b.effective_severity]);
  const sharedEvidence = countSharedEvidence(a, b);

  if (severityGap >= 2 && sharedEvidence > 0) {
    conflicts.push({
      decision_a_ref: aRef,
      decision_b_ref: bRef,
      conflict_type: 'severity_divergence',
      severity: severityGap >= 3 ? 'high' : 'medium',
      description: `Same evidence evaluated as ${a.effective_severity} by "${a.decision_key}" but ${b.effective_severity} by "${b.decision_key}"`,
      resolution: {
        method: 'synthesis',
        winning_decision_ref: null,
        rationale: `Shared evidence (${sharedEvidence} items) interpreted differently across packs. ` +
          `This reflects different question contexts, not data conflict.`,
        user_facing_note: null,
        confidence_adjustment: 0,
      },
    });
  }

  // 3. Confidence asymmetry on shared evidence
  if (sharedEvidence > 0 && Math.abs(a.confidence_score - b.confidence_score) > 30) {
    const lowConfidence = a.confidence_score < b.confidence_score ? a : b;

    conflicts.push({
      decision_a_ref: aRef,
      decision_b_ref: bRef,
      conflict_type: 'confidence_asymmetry',
      severity: 'low',
      description: `Large confidence gap: "${a.decision_key}" at ${a.confidence_score}% vs "${b.decision_key}" at ${b.confidence_score}%`,
      resolution: {
        method: 'annotation',
        winning_decision_ref: null,
        rationale: `Confidence gap suggests different evidence coverage per question. ` +
          `Lower confidence decision should be flagged for verification.`,
        user_facing_note: `Confidence in ${lowConfidence.decision_key} is low (${lowConfidence.confidence_score}%). ` +
          `Consider verification before acting on it.`,
        confidence_adjustment: -5, // slight penalty on lower
      },
    });
  }

  return conflicts;
}

// ──────────────────────────────────────────────
// Resolution synthesis
// ──────────────────────────────────────────────

function buildResolvedSet(
  decisions: Decision[],
  conflicts: DecisionConflict[],
): ResolvedDecisionSet {
  const conflictsByDecision = new Map<string, DecisionConflict[]>();

  for (const conflict of conflicts) {
    const aConflicts = conflictsByDecision.get(conflict.decision_a_ref) || [];
    aConflicts.push(conflict);
    conflictsByDecision.set(conflict.decision_a_ref, aConflicts);

    const bConflicts = conflictsByDecision.get(conflict.decision_b_ref) || [];
    bConflicts.push(conflict);
    conflictsByDecision.set(conflict.decision_b_ref, bConflicts);
  }

  const resolved: ResolvedDecision[] = decisions.map(d => {
    const ref = makeRef('decision', d.id);
    const relevantConflicts = conflictsByDecision.get(ref) || [];

    // Check if this decision is "overridden" by a higher-precedence one
    let suppressed = false;
    let resolvedImpact = d.decision_impact;
    let annotation: string | null = null;

    for (const conflict of relevantConflicts) {
      if (conflict.resolution.method === 'precedence' &&
          conflict.resolution.winning_decision_ref !== null &&
          conflict.resolution.winning_decision_ref !== ref) {
        // This decision lost in precedence — don't suppress, but annotate
        annotation = conflict.resolution.user_facing_note;
      }

      if (conflict.resolution.user_facing_note && !annotation) {
        annotation = conflict.resolution.user_facing_note;
      }
    }

    return {
      decision_ref: ref,
      original_impact: d.decision_impact,
      resolved_impact: resolvedImpact,
      conflict_refs: relevantConflicts.map((_, i) => makeRef('conflict', String(i))),
      suppressed,
      annotation,
    };
  });

  // Coherence score: higher = fewer/less-severe conflicts
  const maxSeverityScore = decisions.length * (decisions.length - 1) / 2; // max possible pairs
  const conflictScore = conflicts.reduce((sum, c) => {
    switch (c.severity) {
      case 'critical': return sum + 4;
      case 'high': return sum + 3;
      case 'medium': return sum + 2;
      case 'low': return sum + 1;
    }
  }, 0);
  const coherence = maxSeverityScore > 0
    ? Math.max(0, Math.round(100 - (conflictScore / maxSeverityScore) * 100))
    : 100;

  return { decisions: resolved, coherence_score: coherence };
}

function buildConflictSummary(conflicts: DecisionConflict[], decisionCount: number): string {
  if (conflicts.length === 0) {
    return `All ${decisionCount} decisions are internally consistent.`;
  }

  const critical = conflicts.filter(c => c.severity === 'critical').length;
  const high = conflicts.filter(c => c.severity === 'high').length;
  const medium = conflicts.filter(c => c.severity === 'medium').length;
  const low = conflicts.filter(c => c.severity === 'low').length;

  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (high > 0) parts.push(`${high} high`);
  if (medium > 0) parts.push(`${medium} medium`);
  if (low > 0) parts.push(`${low} low`);

  return `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected across ${decisionCount} decisions: ${parts.join(', ')}.`;
}

function countSharedEvidence(a: Decision, b: Decision): number {
  const aSet = new Set(a.why.evidence_refs);
  return b.why.evidence_refs.filter(ref => aSet.has(ref)).length;
}
