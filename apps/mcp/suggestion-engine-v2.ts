import {
  McpSuggestions,
  McpSessionContext,
} from './types';
import { EngineContext, getFindingProjections, getActionProjections, getImpactSummary, getRootCauses, getMaps } from './context';
import { ProjectionResult, FindingProjection, ActionProjection } from '../../packages/projections';

// ──────────────────────────────────────────────
// Suggestion Engine v2 — Proactive Intelligence
//
// Every MCP answer now includes:
//   - best next question
//   - best next analysis
//   - best next action
//   - best next workspace/map to open
//
// Rules:
//   - Avoid repetition (check session history)
//   - Use usage budget wisely
//   - Prefer highest-value next step
//   - Respect eligibility + classification
// ──────────────────────────────────────────────

export interface EnhancedSuggestions extends McpSuggestions {
  best_next_question: string | null;
  best_next_analysis: string | null;
  best_next_action: string | null;
  best_next_navigation: string | null;
  usage_note: string | null;
  chain: ChainSuggestion | null;
}

export interface ChainSuggestion {
  from_type: 'finding' | 'root_cause' | 'action' | 'verification' | 'saas_issue' | 'revenue_issue';
  to_type: 'root_cause' | 'action' | 'verification' | 'landing_mismatch' | 'trust_onboarding';
  label: string;
  prompt: string;
}

export interface SuggestionContext {
  answer_domain: string;
  finding_id?: string;
  root_cause?: string;
  action_id?: string;
  mcp_remaining: number;
  mcp_pct: number;
}

// ──────────────────────────────────────────────
// Build Enhanced Suggestions
// ──────────────────────────────────────────────

export function buildEnhancedSuggestions(
  ctx: EngineContext,
  session: McpSessionContext,
  suggestionCtx: SuggestionContext,
): EnhancedSuggestions {
  const findings = getFindingProjections(ctx);
  const actions = getActionProjections(ctx);
  const rootCauses = getRootCauses(ctx);
  const impact = getImpactSummary(ctx);
  const maps = getMaps(ctx);
  const explored = session.exploration_state;

  // Build standard suggestions
  const questions = generateSmartQuestions(findings, actions, explored, suggestionCtx);
  const actionSuggestions = generateActionSuggestions(actions, explored);
  const nav = generateNavigation(suggestionCtx.answer_domain, explored, maps.length > 0);

  // Best-next picks
  const bestNextQuestion = pickBestQuestion(questions, explored.asked_questions);
  const bestNextAnalysis = pickBestAnalysis(findings, explored);
  const bestNextAction = pickBestAction(actions);
  const bestNextNav = pickBestNavigation(explored, maps.length > 0);

  // Context chaining
  const chain = buildChainSuggestion(suggestionCtx, findings, actions, rootCauses);

  // Usage note
  const usageNote = buildUsageNote(suggestionCtx.mcp_remaining, suggestionCtx.mcp_pct);

  return {
    questions: questions.slice(0, 3),
    actions: actionSuggestions.slice(0, 3),
    navigation: nav,
    best_next_question: bestNextQuestion,
    best_next_analysis: bestNextAnalysis,
    best_next_action: bestNextAction,
    best_next_navigation: bestNextNav,
    usage_note: usageNote,
    chain,
  };
}

// ──────────────────────────────────────────────
// Smart Question Generation
// ──────────────────────────────────────────────

function generateSmartQuestions(
  findings: FindingProjection[],
  actions: ActionProjection[],
  explored: McpSessionContext['exploration_state'],
  ctx: SuggestionContext,
): string[] {
  const questions: { q: string; score: number }[] = [];
  const asked = new Set(explored.asked_questions);

  // High-impact unexplored finding
  const topUnexplored = findings.find(f => !asked.has(f.id));
  if (topUnexplored) {
    const q = `What's driving the $${formatK(topUnexplored.impact.midpoint)}/mo loss from "${topUnexplored.title}"?`;
    questions.push({ q, score: topUnexplored.impact.midpoint });
  }

  // Cross-pack analysis
  const crossActions = actions.filter(a => a.cross_pack);
  if (crossActions.length > 0 && !asked.has('cross_pack')) {
    questions.push({ q: `Show me the ${crossActions.length} fixes that solve issues across multiple areas.`, score: 8000 });
  }

  // Revenue-specific
  if (!explored.explored_packs.includes('revenue_integrity')) {
    const revFindings = findings.filter(f => f.pack === 'revenue_integrity');
    if (revFindings.length > 0) {
      const total = revFindings.reduce((s, f) => s + f.impact.midpoint, 0);
      questions.push({ q: `Show me the top 3 revenue leaks ($${formatK(total)}/mo at stake).`, score: total });
    }
  }

  // Root cause exploration
  const uniqueRCs = [...new Set(findings.map(f => f.root_cause).filter(Boolean) as string[])];
  const unexploredRCs = uniqueRCs.filter(rc => !explored.explored_root_causes.includes(rc));
  if (unexploredRCs.length > 0) {
    questions.push({ q: `What's causing "${unexploredRCs[0]}" and how many issues does it affect?`, score: 6000 });
  }

  // Verification suggestion for low confidence
  const lowConf = findings.filter(f => f.confidence < 50);
  if (lowConf.length > 0) {
    questions.push({ q: `${lowConf.length} findings have low confidence — should we verify the highest-impact one?`, score: 5000 });
  }

  // Budget-aware: if running low, suggest consolidation
  if (ctx.mcp_pct >= 70) {
    questions.push({ q: 'Give me a single summary of the most important thing to fix today.', score: 9000 });
  }

  questions.sort((a, b) => b.score - a.score);
  return questions.map(q => q.q);
}

// ──────────────────────────────────────────────
// Action Suggestions
// ──────────────────────────────────────────────

function generateActionSuggestions(
  actions: ActionProjection[],
  explored: McpSessionContext['exploration_state'],
): string[] {
  const suggestions: string[] = [];
  for (const a of actions.slice(0, 5)) {
    if (a.impact) {
      suggestions.push(`${a.title} (saves ~$${formatK(a.impact.midpoint)}/mo)`);
    } else {
      suggestions.push(a.title);
    }
  }
  return suggestions;
}

// ──────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────

function generateNavigation(
  domain: string,
  explored: McpSessionContext['exploration_state'],
  hasMaps: boolean,
): McpSuggestions['navigation'] {
  const nav: McpSuggestions['navigation'] = {};

  switch (domain) {
    case 'scale':
      nav.open_workspace = 'preflight';
      if (!explored.explored_maps.includes('revenue_leakage')) nav.open_map = 'revenue_leakage';
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
      if (!explored.explored_maps.includes('root_cause')) nav.open_map = 'root_cause';
      break;
    case 'finding':
    case 'multi_finding':
      nav.open_analysis = true;
      nav.open_map = 'root_cause';
      break;
    case 'playbook':
      nav.open_analysis = true;
      nav.open_actions = true;
      break;
  }

  return nav;
}

// ──────────────────────────────────────────────
// Best-Next Pickers
// ──────────────────────────────────────────────

function pickBestQuestion(questions: string[], asked: string[]): string | null {
  const askedSet = new Set(asked);
  for (const q of questions) {
    if (!askedSet.has(q)) return q;
  }
  return questions[0] || null;
}

function pickBestAnalysis(findings: FindingProjection[], explored: McpSessionContext['exploration_state']): string | null {
  // Suggest analyzing the highest-impact unexplored finding
  const unexplored = findings.filter(f => !(explored.asked_questions || []).includes(f.id));
  if (unexplored.length === 0) return null;
  if (unexplored.length >= 3) {
    return `Compare the top 3 issues: ${unexplored.slice(0, 3).map(f => `"${f.title}"`).join(', ')}`;
  }
  return `Deep-dive into "${unexplored[0].title}" ($${formatK(unexplored[0].impact.midpoint)}/mo)`;
}

function pickBestAction(actions: ActionProjection[]): string | null {
  if (actions.length === 0) return null;
  const top = actions[0];
  if (top.impact) {
    return `Fix: ${top.title} (saves ~$${formatK(top.impact.midpoint)}/mo)`;
  }
  return `Fix: ${top.title}`;
}

function pickBestNavigation(explored: McpSessionContext['exploration_state'], hasMaps: boolean): string | null {
  if (!explored.explored_maps.includes('revenue_leakage') && hasMaps) {
    return 'Open the revenue leakage map';
  }
  if (!explored.explored_maps.includes('root_cause') && hasMaps) {
    return 'Open the root cause map';
  }
  if (!explored.explored_packs.includes('revenue_integrity')) {
    return 'Explore the revenue integrity workspace';
  }
  return null;
}

// ──────────────────────────────────────────────
// Context Chaining
// ──────────────────────────────────────────────

function buildChainSuggestion(
  ctx: SuggestionContext,
  findings: FindingProjection[],
  actions: ActionProjection[],
  rootCauses: import('../../packages/intelligence').RootCause[],
): ChainSuggestion | null {
  const { answer_domain, finding_id, root_cause, action_id } = ctx;

  // Finding → Root Cause
  if (finding_id) {
    const finding = findings.find(f => f.id === finding_id);
    if (finding?.root_cause) {
      return {
        from_type: 'finding',
        to_type: 'root_cause',
        label: `Investigate root cause: "${finding.root_cause}"`,
        prompt: `What is causing "${finding.root_cause}" and what else is affected?`,
      };
    }
    // Finding → Action
    const relatedAction = actions.find(a => a.root_cause === finding?.root_cause);
    if (relatedAction) {
      return {
        from_type: 'finding',
        to_type: 'action',
        label: `Fix: ${relatedAction.title}`,
        prompt: `How do I fix "${relatedAction.title}" and what will the impact be?`,
      };
    }
  }

  // Root Cause → Action
  if (root_cause || answer_domain === 'root_cause') {
    const rc = root_cause || (rootCauses[0]?.title);
    if (rc) {
      const relatedActions = actions.filter(a => a.root_cause === rc);
      if (relatedActions.length > 0) {
        return {
          from_type: 'root_cause',
          to_type: 'action',
          label: `Fix: ${relatedActions[0].title}`,
          prompt: `What should I fix first to address "${rc}"?`,
        };
      }
    }
  }

  // Action → Verification
  if (action_id || answer_domain === 'fix_first') {
    const topAction = actions[0];
    if (topAction) {
      return {
        from_type: 'action',
        to_type: 'verification',
        label: 'Verify with a live browser check',
        prompt: `Can we verify "${topAction.title}" with a browser check?`,
      };
    }
  }

  // Revenue issue → Trust/Onboarding
  if (answer_domain === 'revenue') {
    const trustFindings = findings.filter(f =>
      f.inference_key.includes('trust') || f.inference_key.includes('onboarding'),
    );
    if (trustFindings.length > 0) {
      return {
        from_type: 'revenue_issue',
        to_type: 'trust_onboarding',
        label: 'Check trust and onboarding issues',
        prompt: 'Are trust issues or onboarding friction causing revenue leakage?',
      };
    }
  }

  // SaaS issue → Landing mismatch
  if (answer_domain === 'saas') {
    return {
      from_type: 'saas_issue',
      to_type: 'landing_mismatch',
      label: 'Compare landing promise vs app reality',
      prompt: 'Does my landing page align with what the app actually delivers?',
    };
  }

  // Default: finding → root cause for highest-impact finding
  if (findings.length > 0 && findings[0].root_cause) {
    return {
      from_type: 'finding',
      to_type: 'root_cause',
      label: `Dig deeper: "${findings[0].root_cause}"`,
      prompt: `What is the root cause behind "${findings[0].title}"?`,
    };
  }

  return null;
}

// ──────────────────────────────────────────────
// Usage Note
// ──────────────────────────────────────────────

function buildUsageNote(remaining: number, pct: number): string | null {
  if (pct >= 95) {
    return `Last ${remaining} query today. Make it count.`;
  }
  if (pct >= 80) {
    return `${remaining} queries left today. Consider using a playbook for maximum value.`;
  }
  if (pct >= 60) {
    return `${remaining} queries remaining today.`;
  }
  return null;
}

// ──────────────────────────────────────────────
// Suggestion Click Tracking
// ──────────────────────────────────────────────

export interface SuggestionClickEvent {
  timestamp: Date;
  org_id: string;
  suggestion_type: 'question' | 'action' | 'navigation' | 'chain' | 'playbook';
  suggestion_text: string;
}

const clickLog: SuggestionClickEvent[] = [];
const MAX_CLICK_LOG = 5000;

export function recordSuggestionClick(event: SuggestionClickEvent): void {
  clickLog.push(event);
  if (clickLog.length > MAX_CLICK_LOG) {
    clickLog.splice(0, clickLog.length - MAX_CLICK_LOG);
  }
}

export function getSuggestionClickLog(orgId?: string, limit: number = 100): SuggestionClickEvent[] {
  const filtered = orgId ? clickLog.filter(e => e.org_id === orgId) : clickLog;
  return filtered.slice(-limit);
}

export function getSuggestionClickStats(): Record<string, number> {
  const stats: Record<string, number> = {
    question: 0, action: 0, navigation: 0, chain: 0, playbook: 0,
  };
  for (const e of clickLog) {
    stats[e.suggestion_type] = (stats[e.suggestion_type] || 0) + 1;
  }
  return stats;
}

export function resetSuggestionClicks(): void {
  clickLog.length = 0;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatK(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(Math.round(value));
}
