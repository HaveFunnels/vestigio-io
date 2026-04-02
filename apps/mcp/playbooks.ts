import { PlanKey } from '../../packages/plans';

// ──────────────────────────────────────────────
// Playbooks — Prebuilt High-Value Query Flows
//
// Each playbook is a structured series of prompts
// that guide the user through a valuable analysis.
//
// Reduces blank-page syndrome.
// Maximizes value per daily budget spent.
// ──────────────────────────────────────────────

export interface PlaybookStep {
  label: string;
  tool_name: string;
  params?: Record<string, unknown>;
  estimated_queries: number;
}

export interface Playbook {
  id: string;
  title: string;
  description: string;
  icon: 'revenue' | 'conversion' | 'chargeback' | 'onboarding' | 'trust' | 'landing';
  category: 'revenue' | 'growth' | 'risk' | 'operations';
  steps: PlaybookStep[];
  total_estimated_queries: number;
  min_plan: PlanKey;
  tags: string[];
}

// ──────────────────────────────────────────────
// Built-in Playbooks
// ──────────────────────────────────────────────

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'find_revenue_leaks',
    title: 'Find Revenue Leaks',
    description: 'Identify where money is being lost in your conversion funnel and get prioritized fixes.',
    icon: 'revenue',
    category: 'revenue',
    steps: [
      { label: 'Assess revenue integrity', tool_name: 'answer_where_losing_money', estimated_queries: 1 },
      { label: 'Get top findings by impact', tool_name: 'get_finding_projections', estimated_queries: 1 },
      { label: 'Investigate root causes', tool_name: 'get_root_causes', estimated_queries: 1 },
      { label: 'Get prioritized fixes', tool_name: 'answer_fix_first', estimated_queries: 1 },
    ],
    total_estimated_queries: 4,
    min_plan: 'vestigio',
    tags: ['revenue', 'leakage', 'conversion', 'money'],
  },
  {
    id: 'improve_conversion',
    title: 'Improve Conversion',
    description: 'Analyze your checkout and conversion paths to find friction points and quick wins.',
    icon: 'conversion',
    category: 'growth',
    steps: [
      { label: 'Check scale readiness', tool_name: 'answer_can_i_scale', estimated_queries: 1 },
      { label: 'View revenue leakage map', tool_name: 'get_map', params: { map_type: 'revenue_leakage' }, estimated_queries: 1 },
      { label: 'Identify conversion blockers', tool_name: 'get_preflight_status', estimated_queries: 1 },
      { label: 'Get prioritized actions', tool_name: 'get_prioritized_actions', estimated_queries: 1 },
    ],
    total_estimated_queries: 4,
    min_plan: 'vestigio',
    tags: ['conversion', 'checkout', 'funnel', 'growth'],
  },
  {
    id: 'reduce_chargeback_risk',
    title: 'Reduce Chargeback Risk',
    description: 'Identify trust gaps and policy issues that increase chargeback likelihood.',
    icon: 'chargeback',
    category: 'risk',
    steps: [
      { label: 'Assess revenue integrity', tool_name: 'answer_where_losing_money', estimated_queries: 1 },
      { label: 'View chargeback risk map', tool_name: 'get_map', params: { map_type: 'chargeback_risk' }, estimated_queries: 1 },
      { label: 'Get root causes', tool_name: 'get_root_causes', estimated_queries: 1 },
      { label: 'Get fix priorities', tool_name: 'answer_fix_first', estimated_queries: 1 },
    ],
    total_estimated_queries: 4,
    min_plan: 'pro',
    tags: ['chargeback', 'trust', 'policy', 'risk'],
  },
  {
    id: 'audit_onboarding',
    title: 'Audit Onboarding Friction',
    description: 'Check your onboarding flow for friction, unclear steps, and activation blockers.',
    icon: 'onboarding',
    category: 'growth',
    steps: [
      { label: 'Get workspace summary', tool_name: 'get_workspace_summary', estimated_queries: 1 },
      { label: 'View findings', tool_name: 'get_finding_projections', estimated_queries: 1 },
      { label: 'Root cause analysis', tool_name: 'answer_underlying_cause', estimated_queries: 1 },
      { label: 'Action plan', tool_name: 'answer_fix_first', estimated_queries: 1 },
    ],
    total_estimated_queries: 4,
    min_plan: 'vestigio',
    tags: ['onboarding', 'activation', 'friction', 'ux'],
  },
  {
    id: 'check_trust',
    title: 'Check Trust & Readiness',
    description: 'Evaluate whether your site builds enough trust for visitors to convert confidently.',
    icon: 'trust',
    category: 'operations',
    steps: [
      { label: 'Preflight check', tool_name: 'get_preflight_status', estimated_queries: 1 },
      { label: 'Graph analysis', tool_name: 'get_graph_path_summary', estimated_queries: 1 },
      { label: 'Revenue risk assessment', tool_name: 'get_revenue_integrity_summary', estimated_queries: 1 },
    ],
    total_estimated_queries: 3,
    min_plan: 'vestigio',
    tags: ['trust', 'readiness', 'preflight', 'security'],
  },
  {
    id: 'landing_vs_app',
    title: 'Landing Promise vs App Reality',
    description: 'Compare what your landing page promises with what the app actually delivers.',
    icon: 'landing',
    category: 'growth',
    steps: [
      { label: 'Workspace overview', tool_name: 'get_workspace_summary', estimated_queries: 1 },
      { label: 'Decision explainability', tool_name: 'get_decision_explainability', params: { pack_key: 'scale_readiness_pack' }, estimated_queries: 1 },
      { label: 'Find mismatches', tool_name: 'get_finding_projections', estimated_queries: 1 },
      { label: 'Action plan', tool_name: 'get_prioritized_actions', estimated_queries: 1 },
    ],
    total_estimated_queries: 4,
    min_plan: 'pro',
    tags: ['landing', 'mismatch', 'promise', 'reality'],
  },
];

// ──────────────────────────────────────────────
// Playbook Access Control
// ──────────────────────────────────────────────

const PLAN_RANK: Record<PlanKey, number> = { vestigio: 0, pro: 1, max: 2 };

export function getAvailablePlaybooks(plan: PlanKey): Playbook[] {
  const rank = PLAN_RANK[plan];
  return PLAYBOOKS.filter(p => PLAN_RANK[p.min_plan] <= rank);
}

export function canRunPlaybook(playbookId: string, plan: PlanKey, mcpRemaining: number): {
  allowed: boolean;
  reason: string | null;
} {
  const playbook = PLAYBOOKS.find(p => p.id === playbookId);
  if (!playbook) {
    return { allowed: false, reason: 'Playbook not found.' };
  }

  const rank = PLAN_RANK[plan];
  if (PLAN_RANK[playbook.min_plan] > rank) {
    return { allowed: false, reason: `This playbook requires the ${playbook.min_plan} plan or higher.` };
  }

  if (mcpRemaining < playbook.total_estimated_queries) {
    return {
      allowed: false,
      reason: `This playbook uses ~${playbook.total_estimated_queries} queries but you only have ${mcpRemaining} left today. Try again tomorrow or upgrade.`,
    };
  }

  return { allowed: true, reason: null };
}

export function getPlaybook(playbookId: string): Playbook | null {
  return PLAYBOOKS.find(p => p.id === playbookId) || null;
}

// ──────────────────────────────────────────────
// Playbook Execution Tracking
// ──────────────────────────────────────────────

export interface PlaybookRun {
  id: string;
  playbook_id: string;
  org_id: string;
  started_at: Date;
  completed_at: Date | null;
  steps_completed: number;
  total_steps: number;
  status: 'running' | 'completed' | 'abandoned';
}

const playbookRuns: PlaybookRun[] = [];
const MAX_RUNS = 1000;
let runCounter = 0;

export function startPlaybookRun(playbookId: string, orgId: string): PlaybookRun {
  const playbook = PLAYBOOKS.find(p => p.id === playbookId);
  const run: PlaybookRun = {
    id: `pbrun_${Date.now()}_${++runCounter}`,
    playbook_id: playbookId,
    org_id: orgId,
    started_at: new Date(),
    completed_at: null,
    steps_completed: 0,
    total_steps: playbook?.steps.length || 0,
    status: 'running',
  };
  playbookRuns.push(run);
  if (playbookRuns.length > MAX_RUNS) {
    playbookRuns.splice(0, playbookRuns.length - MAX_RUNS);
  }
  return run;
}

export function advancePlaybookRun(runId: string): boolean {
  const run = playbookRuns.find(r => r.id === runId);
  if (!run || run.status !== 'running') return false;
  run.steps_completed++;
  if (run.steps_completed >= run.total_steps) {
    run.status = 'completed';
    run.completed_at = new Date();
  }
  return true;
}

export function abandonPlaybookRun(runId: string): boolean {
  const run = playbookRuns.find(r => r.id === runId);
  if (!run || run.status !== 'running') return false;
  run.status = 'abandoned';
  run.completed_at = new Date();
  return true;
}

export function getPlaybookRuns(orgId?: string): PlaybookRun[] {
  if (orgId) return playbookRuns.filter(r => r.org_id === orgId);
  return [...playbookRuns];
}

export function getPlaybookStats(): {
  total_runs: number;
  completed: number;
  abandoned: number;
  by_playbook: Record<string, number>;
} {
  const byPlaybook: Record<string, number> = {};
  let completed = 0;
  let abandoned = 0;
  for (const run of playbookRuns) {
    byPlaybook[run.playbook_id] = (byPlaybook[run.playbook_id] || 0) + 1;
    if (run.status === 'completed') completed++;
    if (run.status === 'abandoned') abandoned++;
  }
  return { total_runs: playbookRuns.length, completed, abandoned, by_playbook: byPlaybook };
}

export function resetPlaybookRuns(): void {
  playbookRuns.length = 0;
  runCounter = 0;
}
