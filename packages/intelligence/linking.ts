import { Decision, Action, makeRef, Ref, IdGenerator } from '../domain';
import {
  RootCause,
  DecisionLink,
  RootCauseContribution,
  GlobalAction,
  ImpactDimension,
} from './types';

// ──────────────────────────────────────────────
// Decision Linking — connects decisions to root causes
// ──────────────────────────────────────────────

export function linkDecisions(
  decisions: Decision[],
  rootCauses: RootCause[],
): DecisionLink[] {
  // Build index: inference_ref → root_cause
  const inferenceToRootCause = new Map<string, RootCause>();
  for (const rc of rootCauses) {
    for (const infRef of rc.contributing_inferences) {
      inferenceToRootCause.set(infRef, rc);
    }
  }

  const links: DecisionLink[] = [];

  for (const decision of decisions) {
    const contributions: RootCauseContribution[] = [];
    const seenRootCauses = new Set<string>();

    for (const infRef of decision.why.inferences) {
      const rc = inferenceToRootCause.get(infRef);
      if (!rc || seenRootCauses.has(rc.id)) continue;
      seenRootCauses.add(rc.id);

      // Determine contribution strength based on how many of the root cause's
      // inferences are referenced by this decision
      const rcInfSet = new Set(rc.contributing_inferences);
      const overlap = decision.why.inferences.filter(r => rcInfSet.has(r)).length;
      const ratio = overlap / rc.contributing_inferences.length;

      const strength: RootCauseContribution['contribution_strength'] =
        ratio >= 0.5 ? 'primary' : ratio > 0 ? 'contributing' : 'related';

      contributions.push({
        root_cause_ref: makeRef('root_cause', rc.id),
        contribution_strength: strength,
      });
    }

    // Also check evidence overlap for weaker links
    for (const rc of rootCauses) {
      if (seenRootCauses.has(rc.id)) continue;

      const rcEvidenceSet = new Set(rc.contributing_evidence);
      const overlap = decision.why.evidence_refs.filter(r => rcEvidenceSet.has(r)).length;
      if (overlap > 0) {
        seenRootCauses.add(rc.id);
        contributions.push({
          root_cause_ref: makeRef('root_cause', rc.id),
          contribution_strength: 'related',
        });
      }
    }

    if (contributions.length > 0) {
      const packKey = decision.question_key === 'is_it_safe_to_scale_traffic'
        ? 'scale_readiness_pack'
        : decision.question_key === 'is_there_revenue_leakage_in_high_intent_paths'
          ? 'revenue_integrity_pack'
          : 'unknown_pack';

      links.push({
        decision_ref: makeRef('decision', decision.id),
        decision_key: decision.decision_key,
        pack_key: packKey,
        root_cause_refs: contributions.sort((a, b) => {
          const order = { primary: 0, contributing: 1, related: 2 };
          return order[a.contribution_strength] - order[b.contribution_strength];
        }),
      });
    }
  }

  return links;
}

// ──────────────────────────────────────────────
// Global Action Prioritization + Deduplication
// ──────────────────────────────────────────────

export function prioritizeActions(
  actionsByDecision: Map<string, Action[]>,
  decisions: Decision[],
  rootCauses: RootCause[],
  decisionLinks: DecisionLink[],
): GlobalAction[] {
  const ids = new IdGenerator('ga');

  // Build lookup: decision_ref → DecisionLink
  const linkByDecision = new Map<string, DecisionLink>();
  for (const link of decisionLinks) {
    linkByDecision.set(link.decision_ref, link);
  }

  // Build lookup: root_cause_ref → RootCause
  const rootCauseById = new Map<string, RootCause>();
  for (const rc of rootCauses) {
    rootCauseById.set(makeRef('root_cause', rc.id), rc);
  }

  // Collect all actions with metadata
  const allActions: Array<{
    action: Action;
    decisionRef: string;
    decisionKey: string;
    packKey: string;
    rootCauseRef: string | null;
    rootCause: RootCause | null;
  }> = [];

  for (const [decisionRef, actions] of actionsByDecision) {
    const link = linkByDecision.get(decisionRef);
    const decision = decisions.find(d => makeRef('decision', d.id) === decisionRef);
    const primaryRcRef = link?.root_cause_refs.find(r => r.contribution_strength === 'primary')?.root_cause_ref
      || link?.root_cause_refs[0]?.root_cause_ref
      || null;

    for (const action of actions) {
      allActions.push({
        action,
        decisionRef,
        decisionKey: decision?.decision_key || '',
        packKey: link?.pack_key || '',
        rootCauseRef: primaryRcRef,
        rootCause: primaryRcRef ? rootCauseById.get(primaryRcRef) || null : null,
      });
    }
  }

  // Deduplicate: actions with same title (normalized) across packs merge
  const mergeGroups = new Map<string, typeof allActions>();
  for (const entry of allActions) {
    const normalizedTitle = normalizeActionTitle(entry.action.title);
    const existing = mergeGroups.get(normalizedTitle) || [];
    existing.push(entry);
    mergeGroups.set(normalizedTitle, existing);
  }

  // Build GlobalActions
  const globalActions: GlobalAction[] = [];

  for (const [_, group] of mergeGroups) {
    const first = group[0];
    const sourceDecisions = [...new Set(group.map(g => g.decisionRef))];
    const mergedFrom = group.map(g => makeRef('action', g.action.id));
    const crossPackImpact = new Set(group.map(g => g.packKey)).size;

    // Determine impact dimensions from root cause
    const impactDimensions: ImpactDimension[] = [];
    if (first.rootCause) {
      impactDimensions.push(...first.rootCause.impact_types);
    } else {
      // Infer from pack
      for (const g of group) {
        if (g.packKey === 'scale_readiness_pack') impactDimensions.push('scale_risk');
        if (g.packKey === 'revenue_integrity_pack') impactDimensions.push('revenue_loss');
      }
    }

    // Compute priority: lower = more urgent
    // Factors: severity, cross-pack impact, action type, confidence
    const basePriority = Math.min(...group.map(g => g.action.priority));
    const crossPackBonus = crossPackImpact > 1 ? -2 : 0; // cross-pack issues are more urgent
    const severityBonus = first.rootCause
      ? (first.rootCause.severity === 'critical' ? -3 : first.rootCause.severity === 'high' ? -1 : 0)
      : 0;
    const verificationPenalty = first.action.action_type === 'verification' ? 10 : 0;

    const priority = Math.max(1, basePriority + crossPackBonus + severityBonus + verificationPenalty);

    // Best confidence from group
    const confidence = Math.max(...group.map(g => {
      const dec = decisions.find(d => makeRef('decision', d.id) === g.decisionRef);
      return dec?.confidence_score || 0;
    }));

    // Best severity from group
    const severityOrder = ['critical', 'high', 'medium', 'low', 'none'];
    const bestSeverity = group.reduce((best, g) => {
      const idx = severityOrder.indexOf(g.action.severity);
      const bestIdx = severityOrder.indexOf(best);
      return idx < bestIdx ? g.action.severity : best;
    }, 'none' as string);

    // Phase 1.1: carry remediation_steps + estimated_effort_hours
    // through the merge. When multiple actions merge into one
    // GlobalAction, the first non-null remediation_steps wins — by
    // the Phase 2 backfill rule, actions sharing an action_key
    // converge on identical steps, so "first non-null" is stable.
    // For effort hours, take the median of the non-null values
    // across the group to smooth outliers.
    const mergedRemediationSteps =
      group
        .map((g) => g.action.remediation_steps)
        .find((steps) => steps != null && steps.length > 0) ?? null;
    const effortHours = group
      .map((g) => g.action.estimated_effort_hours)
      .filter((h): h is number => h != null)
      .sort((a, b) => a - b);
    const mergedEffortHours =
      effortHours.length === 0
        ? null
        : effortHours[Math.floor(effortHours.length / 2)];

    // Phase 1.5 verification metadata merge — same first-non-null
    // policy as remediation. Actions sharing an action_key converge
    // on one VerificationStrategy per the Phase 2.5 backfill rule.
    // ETA picks the MAX of the group so the UI's estimate doesn't
    // undershoot when strategies with different time budgets merge.
    const mergedVerificationStrategy =
      group
        .map((g) => g.action.verification_strategy)
        .find((s) => s != null) ?? null;
    const mergedVerificationNotes =
      group
        .map((g) => g.action.verification_notes)
        .find((n) => n != null && n.length > 0) ?? null;
    const verificationEtas = group
      .map((g) => g.action.verification_eta_seconds)
      .filter((s): s is number => s != null);
    const mergedVerificationEta =
      verificationEtas.length === 0 ? null : Math.max(...verificationEtas);

    globalActions.push({
      id: ids.next(),
      action_key: first.action.action_key,
      title: first.action.title,
      description: first.action.description,
      source_decisions: sourceDecisions,
      root_cause_ref: first.rootCauseRef,
      action_type: first.action.action_type,
      priority,
      expected_impact: [...new Set(impactDimensions)],
      confidence,
      severity: bestSeverity,
      cross_pack_impact: crossPackImpact,
      merged_from: mergedFrom,
      remediation_steps: mergedRemediationSteps,
      estimated_effort_hours: mergedEffortHours,
      verification_strategy: mergedVerificationStrategy,
      verification_notes: mergedVerificationNotes,
      verification_eta_seconds: mergedVerificationEta,
    });
  }

  // Final sort by priority
  return globalActions.sort((a, b) => a.priority - b.priority);
}

function normalizeActionTitle(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}
