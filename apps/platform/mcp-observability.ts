import { getPromptGateMetrics, PromptGateMetrics } from '../mcp/prompt-gate';
import { getSuggestionClickStats } from '../mcp/suggestion-engine-v2';
import { getPlaybookStats, getPlaybookRuns } from '../mcp/playbooks';
import { PlanKey } from '../../packages/plans';

// ──────────────────────────────────────────────
// MCP Observability — Admin Metrics
//
// Exposes MCP-specific engagement and usage data:
//   - Top playbooks used
//   - Prompt rewrite acceptance rate
//   - Weak prompt rate
//   - Average MCP depth/session
//   - Usage by org / plan
//   - Most common next-step suggestions clicked
//
// Goal: let operator understand what drives engagement,
// what burns budget, and what converts users.
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// MCP Session Tracking
// ──────────────────────────────────────────────

export interface McpSessionSummary {
  session_id: string;
  org_id: string;
  started_at: Date;
  ended_at: Date | null;
  queries_used: number;
  playbook_used: string | null;
  prompt_rewrites: number;
  chain_depth: number;
}

const sessionStore: McpSessionSummary[] = [];
const MAX_SESSIONS = 2000;
let sessionCounter = 0;

export function startMcpSession(orgId: string): McpSessionSummary {
  const session: McpSessionSummary = {
    session_id: `mcp_sess_${Date.now()}_${++sessionCounter}`,
    org_id: orgId,
    started_at: new Date(),
    ended_at: null,
    queries_used: 0,
    playbook_used: null,
    prompt_rewrites: 0,
    chain_depth: 0,
  };
  sessionStore.push(session);
  if (sessionStore.length > MAX_SESSIONS) {
    sessionStore.splice(0, sessionStore.length - MAX_SESSIONS);
  }
  return session;
}

export function updateMcpSession(
  sessionId: string,
  updates: Partial<Pick<McpSessionSummary, 'queries_used' | 'playbook_used' | 'prompt_rewrites' | 'chain_depth'>>,
): boolean {
  const session = sessionStore.find(s => s.session_id === sessionId);
  if (!session) return false;
  if (updates.queries_used !== undefined) session.queries_used = updates.queries_used;
  if (updates.playbook_used !== undefined) session.playbook_used = updates.playbook_used;
  if (updates.prompt_rewrites !== undefined) session.prompt_rewrites = updates.prompt_rewrites;
  if (updates.chain_depth !== undefined) session.chain_depth = updates.chain_depth;
  return true;
}

export function endMcpSession(sessionId: string): boolean {
  const session = sessionStore.find(s => s.session_id === sessionId);
  if (!session) return false;
  session.ended_at = new Date();
  return true;
}

// ──────────────────────────────────────────────
// Aggregate Observability Data
// ──────────────────────────────────────────────

export interface McpObservabilityDashboard {
  prompt_gate: PromptGateMetrics & {
    weak_prompt_rate: number;
    rewrite_acceptance_rate: number;
  };
  playbooks: {
    total_runs: number;
    completed: number;
    abandoned: number;
    completion_rate: number;
    top_playbooks: { playbook_id: string; run_count: number }[];
  };
  suggestions: {
    click_counts: Record<string, number>;
    most_clicked_type: string | null;
  };
  sessions: {
    total_sessions: number;
    avg_queries_per_session: number;
    avg_chain_depth: number;
    sessions_with_playbook: number;
    sessions_with_rewrites: number;
  };
}

export function getMcpObservabilityDashboard(): McpObservabilityDashboard {
  const pgMetrics = getPromptGateMetrics();
  const pbStats = getPlaybookStats();
  const clickStats = getSuggestionClickStats();

  // Prompt gate rates
  const weakRate = pgMetrics.total_evaluated > 0
    ? Math.round((pgMetrics.weak_count / pgMetrics.total_evaluated) * 100)
    : 0;
  const totalRewrites = pgMetrics.rewrites_accepted + pgMetrics.rewrites_rejected;
  const rewriteRate = totalRewrites > 0
    ? Math.round((pgMetrics.rewrites_accepted / totalRewrites) * 100)
    : 0;

  // Playbook data
  const pbCompletionRate = pbStats.total_runs > 0
    ? Math.round((pbStats.completed / pbStats.total_runs) * 100)
    : 0;
  const topPlaybooks = Object.entries(pbStats.by_playbook)
    .map(([id, count]) => ({ playbook_id: id, run_count: count }))
    .sort((a, b) => b.run_count - a.run_count)
    .slice(0, 5);

  // Suggestion clicks
  const maxClicked = Object.entries(clickStats)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const mostClickedType = maxClicked.length > 0 ? maxClicked[0][0] : null;

  // Session aggregates
  const completedSessions = sessionStore.filter(s => s.ended_at !== null);
  const avgQueries = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((s, sess) => s + sess.queries_used, 0) / completedSessions.length * 10) / 10
    : 0;
  const avgChainDepth = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((s, sess) => s + sess.chain_depth, 0) / completedSessions.length * 10) / 10
    : 0;
  const withPlaybook = completedSessions.filter(s => s.playbook_used !== null).length;
  const withRewrites = completedSessions.filter(s => s.prompt_rewrites > 0).length;

  return {
    prompt_gate: {
      ...pgMetrics,
      weak_prompt_rate: weakRate,
      rewrite_acceptance_rate: rewriteRate,
    },
    playbooks: {
      total_runs: pbStats.total_runs,
      completed: pbStats.completed,
      abandoned: pbStats.abandoned,
      completion_rate: pbCompletionRate,
      top_playbooks: topPlaybooks,
    },
    suggestions: {
      click_counts: clickStats,
      most_clicked_type: mostClickedType,
    },
    sessions: {
      total_sessions: sessionStore.length,
      avg_queries_per_session: avgQueries,
      avg_chain_depth: avgChainDepth,
      sessions_with_playbook: withPlaybook,
      sessions_with_rewrites: withRewrites,
    },
  };
}

// ──────────────────────────────────────────────
// Per-Org / Per-Plan Usage Breakdown
// ──────────────────────────────────────────────

export function getOrgMcpSessions(orgId: string): McpSessionSummary[] {
  return sessionStore.filter(s => s.org_id === orgId);
}

export function getSessionsByPlan(orgPlanMap: Record<string, PlanKey>): Record<PlanKey, number> {
  const counts: Record<PlanKey, number> = { vestigio: 0, pro: 0, max: 0 };
  for (const session of sessionStore) {
    const plan = orgPlanMap[session.org_id];
    if (plan) counts[plan]++;
  }
  return counts;
}

// ──────────────────────────────────────────────
// Reset (for testing)
// ──────────────────────────────────────────────

export function resetMcpObservability(): void {
  sessionStore.length = 0;
  sessionCounter = 0;
}
