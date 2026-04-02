import { Decision, Action, Inference, makeRef } from '../domain';
import {
  DecisionIntelligenceResult,
  IntelligenceSummary,
  RootCause,
  DecisionLink,
  GlobalAction,
} from './types';
import { groupIntoRootCauses } from './root-causes';
import { linkDecisions, prioritizeActions } from './linking';
import type { EngineTranslations } from '../projections/types';

// ──────────────────────────────────────────────
// Decision Intelligence Engine
//
// Transforms independent per-pack decisions into
// a coherent intelligence system with root causes,
// cross-pack links, and unified action priorities.
// ──────────────────────────────────────────────

export interface IntelligenceInput {
  inferences: Inference[];
  decisions: Decision[];
  actions_by_decision: Map<string, Action[]>;
  translations?: EngineTranslations;
}

export function produceIntelligence(input: IntelligenceInput): DecisionIntelligenceResult {
  const { inferences, decisions, actions_by_decision, translations } = input;

  // 1. Group inferences into root causes
  const rootCauses = groupIntoRootCauses(inferences, translations);

  // 2. Link decisions to root causes
  const decisionLinks = linkDecisions(decisions, rootCauses);

  // 3. Deduplicate and prioritize actions globally
  const globalActions = prioritizeActions(
    actions_by_decision, decisions, rootCauses, decisionLinks,
  );

  // 4. Build summary
  const summary = buildSummary(rootCauses, decisionLinks, globalActions, decisions);

  return {
    root_causes: rootCauses,
    decision_links: decisionLinks,
    global_actions: globalActions,
    summary,
  };
}

function buildSummary(
  rootCauses: RootCause[],
  decisionLinks: DecisionLink[],
  globalActions: GlobalAction[],
  decisions: Decision[],
): IntelligenceSummary {
  // "What are the real underlying problems?"
  const underlyingProblems = rootCauses.map(rc => rc.title);

  // "What should be fixed first?" — top 3 non-verification actions
  const fixFirst = globalActions
    .filter(a => a.action_type !== 'verification')
    .slice(0, 3)
    .map(a => a.title);

  // "What affects both revenue and scale?"
  const crossPackIssues = rootCauses
    .filter(rc => rc.affected_packs.length > 1)
    .map(rc => `${rc.title} — affects ${rc.affected_packs.map(p => p.replace(/_pack$/, '').replace(/_/g, ' ')).join(' and ')}`);

  // Highest severity
  const highestSeverity = rootCauses.length > 0 ? rootCauses[0].severity : null;

  return {
    underlying_problems: underlyingProblems,
    fix_first: fixFirst,
    cross_pack_issues: crossPackIssues,
    total_root_causes: rootCauses.length,
    total_global_actions: globalActions.length,
    highest_severity: highestSeverity,
  };
}
