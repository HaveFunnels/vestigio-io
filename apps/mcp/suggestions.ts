import {
  McpSuggestions,
  McpSessionContext,
  FindingChatContext,
  MultiFindingContext,
} from './types';
import { EngineContext, getFindingProjections, getActionProjections, getChangeReport, getImpactSummary } from './context';
import { ProjectionResult, FindingProjection } from '../../packages/projections';
import { generateNextQuestions, generateFindingPrompts, generateMultiFindingPrompts } from './questions';

// ──────────────────────────────────────────────
// Suggestion Engine
//
// Produces McpSuggestions for every MCP answer.
// Considers current context, exploration history,
// and impact to guide the user toward high-value
// exploration paths.
// ──────────────────────────────────────────────

export function buildSuggestions(
  ctx: EngineContext,
  session: McpSessionContext,
  answerDomain: 'scale' | 'revenue' | 'root_cause' | 'fix_first' | 'finding' | 'multi_finding' | 'saas',
): McpSuggestions {
  const projections: ProjectionResult = {
    findings: getFindingProjections(ctx),
    actions: getActionProjections(ctx),
    workspaces: [], // not needed for suggestions
    coherence_score: ctx.result.conflict_report?.resolved_decisions?.coherence_score ?? 100,
    system_health: null, // not needed for suggestions
    change_report: getChangeReport(ctx),
  };
  const impactSummary = getImpactSummary(ctx);

  // Generate context-aware questions
  const questions = generateNextQuestions(session, projections, impactSummary);

  // Generate action suggestions
  const actionSuggestions: string[] = [];
  const topActions = projections.actions.slice(0, 3);
  for (const a of topActions) {
    if (a.impact) {
      actionSuggestions.push(`${a.title} (saves ~$${Math.round(a.impact.midpoint / 1000)}k/mo)`);
    }
  }

  // Determine navigation suggestions based on domain
  const nav: McpSuggestions['navigation'] = {};

  switch (answerDomain) {
    case 'scale':
      nav.open_workspace = 'preflight';
      if (!session.exploration_state.explored_maps.includes('revenue_leakage')) {
        nav.open_map = 'revenue_leakage';
      }
      nav.open_actions = true;
      break;
    case 'revenue':
      nav.open_workspace = 'revenue';
      nav.open_map = 'revenue_leakage';
      nav.open_analysis = true;
      break;
    case 'root_cause':
      nav.open_map = 'root_cause';
      nav.open_analysis = true;
      break;
    case 'fix_first':
      nav.open_actions = true;
      if (!session.exploration_state.explored_maps.includes('root_cause')) {
        nav.open_map = 'root_cause';
      }
      break;
    case 'finding':
      nav.open_analysis = true;
      nav.open_map = 'root_cause';
      break;
    case 'multi_finding':
      nav.open_analysis = true;
      nav.open_actions = true;
      nav.open_map = 'root_cause';
      break;
  }

  return {
    questions: questions.slice(0, 3),
    actions: actionSuggestions.slice(0, 3),
    navigation: nav,
  };
}

// ──────────────────────────────────────────────
// Contextual Chat Context builders
// ──────────────────────────────────────────────

export function buildFindingChatContext(
  findingId: string,
  projections: ProjectionResult,
): FindingChatContext | null {
  const finding = projections.findings.find(f => f.id === findingId);
  if (!finding) return null;

  return {
    finding_id: finding.id,
    title: finding.title,
    root_cause: finding.root_cause,
    impact: {
      monthly_range: finding.impact.monthly_range,
      midpoint: finding.impact.midpoint,
    },
    effect: finding.effect,
    severity: finding.severity,
    pack: finding.pack,
    suggested_prompts: generateFindingPrompts(finding),
  };
}

export function buildMultiFindingContext(
  findingIds: string[],
  projections: ProjectionResult,
): MultiFindingContext | null {
  const findings = projections.findings.filter(f => findingIds.includes(f.id));
  if (findings.length === 0) return null;

  // Compute combined impact
  let totalMin = 0;
  let totalMax = 0;
  for (const f of findings) {
    totalMin += f.impact.monthly_range.min;
    totalMax += f.impact.monthly_range.max;
  }

  // Detect shared root causes
  const rootCauseCount = new Map<string, number>();
  for (const f of findings) {
    if (f.root_cause) {
      rootCauseCount.set(f.root_cause, (rootCauseCount.get(f.root_cause) || 0) + 1);
    }
  }
  const sharedRootCauses = [...rootCauseCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([rc]) => rc);

  // Detect relationships
  const relationships = analyzeRelationships(findings, sharedRootCauses);

  const prompts = generateMultiFindingPrompts(findings, sharedRootCauses);

  return {
    finding_ids: findingIds,
    combined_impact: {
      monthly_range: { min: Math.round(totalMin), max: Math.round(totalMax) },
      midpoint: Math.round((totalMin + totalMax) / 2),
    },
    shared_root_causes: sharedRootCauses,
    relationships,
    suggested_prompts: prompts,
  };
}

// ──────────────────────────────────────────────
// Relationship analysis
// ──────────────────────────────────────────────

function analyzeRelationships(
  findings: FindingProjection[],
  sharedRootCauses: string[],
): string[] {
  const relationships: string[] = [];

  // Shared root causes
  if (sharedRootCauses.length > 0) {
    for (const rc of sharedRootCauses) {
      const affected = findings.filter(f => f.root_cause === rc);
      relationships.push(
        `"${rc}" is the shared root cause of ${affected.length} selected issues — fixing it addresses them all`,
      );
    }
  }

  // Same pack (compounding)
  const packGroups = new Map<string, FindingProjection[]>();
  for (const f of findings) {
    const list = packGroups.get(f.pack) || [];
    list.push(f);
    packGroups.set(f.pack, list);
  }
  for (const [pack, group] of packGroups) {
    if (group.length > 1) {
      const packLabel = pack.replace(/_/g, ' ');
      const totalImpact = group.reduce((s, f) => s + f.impact.midpoint, 0);
      relationships.push(
        `${group.length} issues compound within ${packLabel} — combined ${formatCurrency(totalImpact)}/mo impact`,
      );
    }
  }

  // Same surface (overlapping)
  const surfaceGroups = new Map<string, FindingProjection[]>();
  for (const f of findings) {
    const list = surfaceGroups.get(f.surface) || [];
    list.push(f);
    surfaceGroups.set(f.surface, list);
  }
  for (const [surface, group] of surfaceGroups) {
    if (group.length > 1) {
      relationships.push(
        `${group.length} issues affect the same surface (${surface}) — a single fix point`,
      );
    }
  }

  return relationships;
}

// ──────────────────────────────────────────────
// Contextual answer composition
// ──────────────────────────────────────────────

export function composeFindingAnswer(
  finding: FindingChatContext,
  projections: ProjectionResult,
): {
  direct_answer: string;
  why: string[];
  recommended_next_step: string;
} {
  const f = projections.findings.find(fi => fi.id === finding.finding_id);

  const direct_answer = `"${finding.title}" is estimated to cost ${formatCurrency(finding.impact.midpoint)}/mo. ${finding.effect}.`;

  const why: string[] = [];
  if (f) {
    why.push(f.reasoning);
  }
  if (finding.root_cause) {
    why.push(`Root cause: ${finding.root_cause}`);
  }
  why.push(`Severity: ${finding.severity} | Confidence: ${f?.confidence || 0}% | Pack: ${finding.pack.replace(/_/g, ' ')}`);

  // Find related actions
  const relatedActions = projections.actions.filter(a => a.root_cause === finding.root_cause);
  const recommended_next_step = relatedActions.length > 0
    ? relatedActions[0].title
    : `Investigate ${finding.title} and verify with a browser check.`;

  return { direct_answer, why, recommended_next_step };
}

export function composeMultiFindingAnswer(
  context: MultiFindingContext,
  projections: ProjectionResult,
): {
  direct_answer: string;
  why: string[];
  recommended_next_step: string;
} {
  const findings = projections.findings.filter(f => context.finding_ids.includes(f.id));

  let direct_answer = `Analyzing ${findings.length} issues with a combined impact of ${formatCurrency(context.combined_impact.midpoint)}/mo.`;

  if (context.shared_root_causes.length > 0) {
    direct_answer += ` These issues share ${context.shared_root_causes.length} root cause(s) — fixing "${context.shared_root_causes[0]}" will reduce impact across multiple issues.`;
  }

  const why = [...context.relationships];
  if (why.length === 0) {
    why.push('These issues appear to be independent — each requires separate attention.');
  }

  // Find the single best action
  const relatedActions = projections.actions.filter(a =>
    context.shared_root_causes.includes(a.root_cause || ''),
  );
  const recommended_next_step = relatedActions.length > 0
    ? `Fix first: ${relatedActions[0].title}`
    : `Address the highest-impact issue first: "${findings[0]?.title || 'unknown'}"`;

  return { direct_answer, why, recommended_next_step };
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}
