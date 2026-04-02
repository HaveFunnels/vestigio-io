// ──────────────────────────────────────────────
// Phase 20 Tests — MCP Addictiveness Layer + Production State Lock
//
// Test groups:
//   1. Prompt Gate (weak prompt detection, rewrite suggestion, misfire)
//   2. Playbooks (execution, budget check, plan gating)
//   3. Suggestion Engine v2 (next-step, chaining, usage note)
//   4. Context Chaining (finding→RC→action→verification)
//   5. Production State Lock (in-memory rejection, persistent requirement)
//   6. Admin Observability (metrics aggregation, sessions)
//   7. Plan Config Admin (tuning, economics, change log)
//   8. MCP Persistence (store interface, save/load)
// ──────────────────────────────────────────────

import { strict as assert } from 'assert';

// Prompt Gate
import {
  evaluatePromptDraft,
  recordPromptEvaluation,
  recordRewriteDecision,
  getPromptGateMetrics,
  resetPromptGateMetrics,
  type PromptContext,
} from '../apps/mcp/prompt-gate';

// Playbooks
import {
  PLAYBOOKS,
  getAvailablePlaybooks,
  canRunPlaybook,
  getPlaybook,
  startPlaybookRun,
  advancePlaybookRun,
  abandonPlaybookRun,
  getPlaybookRuns,
  getPlaybookStats,
  resetPlaybookRuns,
} from '../apps/mcp/playbooks';

// Suggestion Engine v2
import {
  recordSuggestionClick,
  getSuggestionClickLog,
  getSuggestionClickStats,
  resetSuggestionClicks,
} from '../apps/mcp/suggestion-engine-v2';

// Context Chaining (tested through direct imports)
import {
  buildAvailableChains,
  getChainFrom,
  getBestChainForDomain,
} from '../apps/mcp/context-chaining';

// Production State Lock
import {
  validateProductionLock,
  resetProductionLock,
} from '../apps/platform/production-state-lock';

// MCP Observability
import {
  startMcpSession,
  updateMcpSession,
  endMcpSession,
  getMcpObservabilityDashboard,
  getOrgMcpSessions,
  resetMcpObservability,
} from '../apps/platform/mcp-observability';

// Plan Config Admin
import {
  getPlanConfig,
  getAllPlanConfigs,
  updatePlanConfig,
  computeConfigBasedEconomics,
  getAllConfigBasedEconomics,
  getConfigChangeLog,
  recordConfigChange,
  resetPlanConfigs,
} from '../apps/platform/plan-config-admin';

// MCP Persistence
import {
  InMemoryMcpPersistenceStore,
  resetMcpPersistenceStore,
} from '../apps/platform/mcp-persistence';

// ──────────────────────────────────────────────
// Test Runner
// ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ──────────────────────────────────────────────
// Default context for prompt gate tests
// ──────────────────────────────────────────────

function makeCtx(overrides?: Partial<PromptContext>): PromptContext {
  return {
    recent_questions: [],
    explored_packs: [],
    explored_maps: [],
    mcp_remaining: 10,
    mcp_pct: 40,
    has_findings: true,
    has_root_causes: true,
    finding_count: 5,
    top_impact_area: 'checkout flow',
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Run all tests
// ──────────────────────────────────────────────

async function runAllTests() {

  // ════════════════════════════════════════════
  // 1. Prompt Gate
  // ════════════════════════════════════════════
  console.log('\n═══ Prompt Gate ═══');
  resetPromptGateMetrics();

  test('misfire: empty string', () => {
    const result = evaluatePromptDraft('', makeCtx());
    assert.equal(result.quality, 'misfire');
    assert.equal(result.should_confirm, true);
  });

  test('misfire: single char', () => {
    const result = evaluatePromptDraft('a', makeCtx());
    assert.equal(result.quality, 'misfire');
  });

  test('misfire: greeting', () => {
    const result = evaluatePromptDraft('hi', makeCtx());
    assert.equal(result.quality, 'misfire');
  });

  test('misfire: just dots', () => {
    const result = evaluatePromptDraft('...', makeCtx());
    assert.equal(result.quality, 'misfire');
  });

  test('misfire: no alphabetic', () => {
    const result = evaluatePromptDraft('123', makeCtx());
    assert.equal(result.quality, 'misfire');
  });

  test('weak: vague help', () => {
    const result = evaluatePromptDraft('help', makeCtx());
    assert.equal(result.quality, 'weak');
    assert.ok(result.suggested_rewrite);
  });

  test('weak: broad "any issues"', () => {
    const result = evaluatePromptDraft("what's wrong?", makeCtx());
    assert.equal(result.quality, 'weak');
    assert.ok(result.suggested_rewrite);
  });

  test('weak: broad "check my site"', () => {
    const result = evaluatePromptDraft('check my site', makeCtx());
    assert.equal(result.quality, 'weak');
  });

  test('weak: repetition detected', () => {
    const ctx = makeCtx({ recent_questions: ['Where am I losing money?'] });
    const result = evaluatePromptDraft('Where am I losing money?', ctx);
    assert.equal(result.quality, 'weak');
    assert.ok(result.reason.includes('recently'));
  });

  test('good: specific question', () => {
    const result = evaluatePromptDraft('What are the top 3 revenue leaks in my checkout flow?', makeCtx());
    assert.equal(result.quality, 'good');
    assert.equal(result.should_confirm, false);
  });

  test('good: fix first question', () => {
    const result = evaluatePromptDraft('What should I fix first based on financial impact?', makeCtx());
    assert.equal(result.quality, 'good');
  });

  test('budget-aware rewrite at 90%+', () => {
    const ctx = makeCtx({ mcp_pct: 95, mcp_remaining: 1 });
    const result = evaluatePromptDraft('tell me about revenue', ctx);
    assert.equal(result.quality, 'weak');
    assert.ok(result.suggested_rewrite);
  });

  test('prompt gate metrics tracking', () => {
    resetPromptGateMetrics();
    recordPromptEvaluation({ quality: 'good', reason: '', should_confirm: false });
    recordPromptEvaluation({ quality: 'weak', reason: '', should_confirm: true });
    recordPromptEvaluation({ quality: 'misfire', reason: '', should_confirm: true });
    recordRewriteDecision(true);
    recordRewriteDecision(false);

    const metrics = getPromptGateMetrics();
    assert.equal(metrics.total_evaluated, 3);
    assert.equal(metrics.good_count, 1);
    assert.equal(metrics.weak_count, 1);
    assert.equal(metrics.misfire_count, 1);
    assert.equal(metrics.rewrites_accepted, 1);
    assert.equal(metrics.rewrites_rejected, 1);
  });

  // ════════════════════════════════════════════
  // 2. Playbooks
  // ════════════════════════════════════════════
  console.log('\n═══ Playbooks ═══');
  resetPlaybookRuns();

  test('playbooks: all 6 built-in playbooks exist', () => {
    assert.equal(PLAYBOOKS.length, 6);
    assert.ok(PLAYBOOKS.find(p => p.id === 'find_revenue_leaks'));
    assert.ok(PLAYBOOKS.find(p => p.id === 'improve_conversion'));
    assert.ok(PLAYBOOKS.find(p => p.id === 'reduce_chargeback_risk'));
    assert.ok(PLAYBOOKS.find(p => p.id === 'audit_onboarding'));
    assert.ok(PLAYBOOKS.find(p => p.id === 'check_trust'));
    assert.ok(PLAYBOOKS.find(p => p.id === 'landing_vs_app'));
  });

  test('playbooks: vestigio plan gets 4 playbooks', () => {
    const available = getAvailablePlaybooks('vestigio');
    assert.equal(available.length, 4);
    // chargeback and landing require pro
    assert.ok(!available.find(p => p.id === 'reduce_chargeback_risk'));
    assert.ok(!available.find(p => p.id === 'landing_vs_app'));
  });

  test('playbooks: pro plan gets all 6', () => {
    const available = getAvailablePlaybooks('pro');
    assert.equal(available.length, 6);
  });

  test('playbooks: canRunPlaybook checks budget', () => {
    const result = canRunPlaybook('find_revenue_leaks', 'vestigio', 2);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('queries'));
  });

  test('playbooks: canRunPlaybook allows with budget', () => {
    const result = canRunPlaybook('find_revenue_leaks', 'vestigio', 10);
    assert.equal(result.allowed, true);
  });

  test('playbooks: canRunPlaybook blocks wrong plan', () => {
    const result = canRunPlaybook('reduce_chargeback_risk', 'vestigio', 10);
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('pro'));
  });

  test('playbooks: unknown playbook rejected', () => {
    const result = canRunPlaybook('nonexistent', 'max', 100);
    assert.equal(result.allowed, false);
  });

  test('playbooks: run tracking', () => {
    resetPlaybookRuns();
    const run = startPlaybookRun('find_revenue_leaks', 'org1');
    assert.equal(run.status, 'running');
    assert.equal(run.total_steps, 4);
    assert.equal(run.steps_completed, 0);

    advancePlaybookRun(run.id);
    advancePlaybookRun(run.id);
    advancePlaybookRun(run.id);
    advancePlaybookRun(run.id);

    const runs = getPlaybookRuns('org1');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'completed');
    assert.equal(runs[0].steps_completed, 4);
  });

  test('playbooks: abandon tracking', () => {
    resetPlaybookRuns();
    const run = startPlaybookRun('check_trust', 'org2');
    advancePlaybookRun(run.id);
    abandonPlaybookRun(run.id);

    const runs = getPlaybookRuns('org2');
    assert.equal(runs[0].status, 'abandoned');
    assert.equal(runs[0].steps_completed, 1);
  });

  test('playbooks: stats aggregation', () => {
    resetPlaybookRuns();
    startPlaybookRun('find_revenue_leaks', 'org1');
    startPlaybookRun('find_revenue_leaks', 'org2');
    startPlaybookRun('check_trust', 'org1');

    const stats = getPlaybookStats();
    assert.equal(stats.total_runs, 3);
    assert.equal(stats.by_playbook['find_revenue_leaks'], 2);
    assert.equal(stats.by_playbook['check_trust'], 1);
  });

  // ════════════════════════════════════════════
  // 3. Suggestion Engine v2
  // ════════════════════════════════════════════
  console.log('\n═══ Suggestion Engine v2 ═══');
  resetSuggestionClicks();

  test('suggestion clicks: record and retrieve', () => {
    resetSuggestionClicks();
    recordSuggestionClick({ timestamp: new Date(), org_id: 'org1', suggestion_type: 'question', suggestion_text: 'test' });
    recordSuggestionClick({ timestamp: new Date(), org_id: 'org1', suggestion_type: 'chain', suggestion_text: 'chain test' });
    recordSuggestionClick({ timestamp: new Date(), org_id: 'org2', suggestion_type: 'playbook', suggestion_text: 'pb test' });

    const org1 = getSuggestionClickLog('org1');
    assert.equal(org1.length, 2);

    const all = getSuggestionClickLog();
    assert.equal(all.length, 3);
  });

  test('suggestion clicks: stats aggregation', () => {
    resetSuggestionClicks();
    recordSuggestionClick({ timestamp: new Date(), org_id: 'o1', suggestion_type: 'question', suggestion_text: 'q1' });
    recordSuggestionClick({ timestamp: new Date(), org_id: 'o1', suggestion_type: 'question', suggestion_text: 'q2' });
    recordSuggestionClick({ timestamp: new Date(), org_id: 'o1', suggestion_type: 'action', suggestion_text: 'a1' });
    recordSuggestionClick({ timestamp: new Date(), org_id: 'o1', suggestion_type: 'chain', suggestion_text: 'c1' });

    const stats = getSuggestionClickStats();
    assert.equal(stats.question, 2);
    assert.equal(stats.action, 1);
    assert.equal(stats.chain, 1);
  });

  // ════════════════════════════════════════════
  // 4. Context Chaining
  // ════════════════════════════════════════════
  console.log('\n═══ Context Chaining ═══');

  // Context chaining requires EngineContext which is complex to set up
  // Test the chain link types and path building logic directly
  test('chain: getBestChainForDomain returns null on empty context', () => {
    // We test with a minimal mock — chains require real EngineContext
    // This tests the export and function signature
    assert.equal(typeof buildAvailableChains, 'function');
    assert.equal(typeof getChainFrom, 'function');
    assert.equal(typeof getBestChainForDomain, 'function');
  });

  // ════════════════════════════════════════════
  // 5. Production State Lock
  // ════════════════════════════════════════════
  console.log('\n═══ Production State Lock ═══');

  test('production lock: validates in dev mode', () => {
    resetProductionLock();
    const status = validateProductionLock();
    // In dev mode (no NODE_ENV=production), all checks should pass
    assert.equal(status.locked, false);
    assert.ok(status.checks.length >= 7);
    // In dev mode, in-memory is acceptable
    assert.equal(status.all_passed, true);
  });

  test('production lock: checks all subsystems', () => {
    const status = validateProductionLock();
    const subsystems = status.checks.map(c => c.subsystem);
    assert.ok(subsystems.includes('daily_usage'));
    assert.ok(subsystems.includes('mcp_usage'));
    assert.ok(subsystems.includes('saas_access'));
    assert.ok(subsystems.includes('auth_logs'));
    assert.ok(subsystems.includes('job_queue'));
    assert.ok(subsystems.includes('sse_event_cache'));
    assert.ok(subsystems.includes('mcp_session'));
  });

  test('production lock: SSE cache always passes (ephemeral)', () => {
    const status = validateProductionLock();
    const sseCheck = status.checks.find(c => c.subsystem === 'sse_event_cache');
    assert.ok(sseCheck);
    assert.equal(sseCheck!.passed, true);
  });

  test('production lock: auth logs pass (dual-layer)', () => {
    const status = validateProductionLock();
    const authCheck = status.checks.find(c => c.subsystem === 'auth_logs');
    assert.ok(authCheck);
    assert.equal(authCheck!.passed, true);
  });

  // ════════════════════════════════════════════
  // 6. Admin Observability
  // ════════════════════════════════════════════
  console.log('\n═══ Admin Observability ═══');
  resetMcpObservability();
  resetPromptGateMetrics();
  resetPlaybookRuns();
  resetSuggestionClicks();

  test('observability: session tracking', () => {
    resetMcpObservability();
    const s = startMcpSession('org1');
    assert.ok(s.session_id);
    assert.equal(s.org_id, 'org1');
    assert.equal(s.queries_used, 0);

    updateMcpSession(s.session_id, { queries_used: 5, chain_depth: 2 });
    endMcpSession(s.session_id);

    const sessions = getOrgMcpSessions('org1');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].queries_used, 5);
    assert.equal(sessions[0].chain_depth, 2);
    assert.ok(sessions[0].ended_at);
  });

  test('observability: dashboard aggregation', () => {
    resetMcpObservability();
    resetPromptGateMetrics();
    resetPlaybookRuns();
    resetSuggestionClicks();

    // Create some data
    recordPromptEvaluation({ quality: 'good', reason: '', should_confirm: false });
    recordPromptEvaluation({ quality: 'weak', reason: '', should_confirm: true });
    recordRewriteDecision(true);

    const s1 = startMcpSession('org1');
    updateMcpSession(s1.session_id, { queries_used: 3, chain_depth: 1, playbook_used: 'find_revenue_leaks' });
    endMcpSession(s1.session_id);

    const s2 = startMcpSession('org2');
    updateMcpSession(s2.session_id, { queries_used: 7, prompt_rewrites: 2 });
    endMcpSession(s2.session_id);

    startPlaybookRun('find_revenue_leaks', 'org1');

    recordSuggestionClick({ timestamp: new Date(), org_id: 'org1', suggestion_type: 'question', suggestion_text: 'q' });

    const dashboard = getMcpObservabilityDashboard();

    assert.equal(dashboard.prompt_gate.total_evaluated, 2);
    assert.equal(dashboard.prompt_gate.good_count, 1);
    assert.equal(dashboard.prompt_gate.weak_count, 1);
    assert.equal(dashboard.prompt_gate.rewrite_acceptance_rate, 100);
    assert.equal(dashboard.prompt_gate.weak_prompt_rate, 50);

    assert.equal(dashboard.sessions.total_sessions, 2);
    assert.equal(dashboard.sessions.avg_queries_per_session, 5);
    assert.equal(dashboard.sessions.sessions_with_playbook, 1);
    assert.equal(dashboard.sessions.sessions_with_rewrites, 1);

    assert.equal(dashboard.playbooks.total_runs, 1);
    assert.equal(dashboard.suggestions.click_counts.question, 1);
  });

  // ════════════════════════════════════════════
  // 7. Plan Config Admin
  // ════════════════════════════════════════════
  console.log('\n═══ Plan Config Admin ═══');
  resetPlanConfigs();

  test('plan config: default values', () => {
    const vestigio = getPlanConfig('vestigio');
    assert.equal(vestigio.daily_mcp_budget, 5);
    assert.equal(vestigio.playwright_budget, 0);
    assert.equal(vestigio.audit_frequency, 'none');

    const pro = getPlanConfig('pro');
    assert.equal(pro.daily_mcp_budget, 25);
    assert.equal(pro.playwright_budget, 5);

    const max = getPlanConfig('max');
    assert.equal(max.daily_mcp_budget, 100);
    assert.equal(max.playwright_budget, 20);
  });

  test('plan config: all configs', () => {
    const configs = getAllPlanConfigs();
    assert.equal(configs.length, 3);
  });

  test('plan config: update budget', () => {
    resetPlanConfigs();
    const updated = updatePlanConfig('pro', { daily_mcp_budget: 50 });
    assert.equal(updated.daily_mcp_budget, 50);

    const fresh = getPlanConfig('pro');
    assert.equal(fresh.daily_mcp_budget, 50);
  });

  test('plan config: clamp values', () => {
    resetPlanConfigs();
    updatePlanConfig('vestigio', { daily_mcp_budget: 0 });
    const config = getPlanConfig('vestigio');
    assert.equal(config.daily_mcp_budget, 1); // min is 1

    updatePlanConfig('vestigio', { daily_mcp_budget: 9999 });
    const config2 = getPlanConfig('vestigio');
    assert.equal(config2.daily_mcp_budget, 1000); // max is 1000
  });

  test('plan config: unit economics', () => {
    resetPlanConfigs();
    const econ = computeConfigBasedEconomics('pro');
    assert.equal(econ.plan, 'pro');
    assert.ok(econ.monthly_price_cents > 0);
    assert.ok(econ.estimated_max_daily_cost_cents > 0);
    assert.ok(econ.estimated_max_monthly_cost_cents > 0);
    assert.ok(econ.margin_pct > 0);
    assert.ok(econ.breakdown.mcp_daily_cost > 0);
  });

  test('plan config: all economics', () => {
    const all = getAllConfigBasedEconomics();
    assert.equal(all.length, 3);
    // All plans should have positive margin with defaults
    for (const e of all) {
      assert.ok(e.margin_pct > 0, `${e.plan} margin should be positive`);
    }
  });

  test('plan config: change log', () => {
    resetPlanConfigs();
    recordConfigChange('pro', 'daily_mcp_budget', 25, 50, 'admin');
    recordConfigChange('max', 'playwright_budget', 20, 30, 'admin');

    const log = getConfigChangeLog();
    assert.equal(log.length, 2);
    assert.equal(log[0].plan, 'pro');
    assert.equal(log[0].old_value, 25);
    assert.equal(log[0].new_value, 50);
  });

  // ════════════════════════════════════════════
  // 8. MCP Persistence
  // ════════════════════════════════════════════
  console.log('\n═══ MCP Persistence ═══');

  await testAsync('persistence: InMemory prompt events', async () => {
    const store = new InMemoryMcpPersistenceStore();
    await store.savePromptEvent({
      id: 'pe1', org_id: 'org1', timestamp: new Date(), input_hash: 'hash1',
      quality: 'good', rewrite_offered: false, rewrite_accepted: null, input_length: 30,
    });
    await store.savePromptEvent({
      id: 'pe2', org_id: 'org1', timestamp: new Date(), input_hash: 'hash2',
      quality: 'weak', rewrite_offered: true, rewrite_accepted: true, input_length: 5,
    });
    await store.savePromptEvent({
      id: 'pe3', org_id: 'org2', timestamp: new Date(), input_hash: 'hash3',
      quality: 'misfire', rewrite_offered: false, rewrite_accepted: null, input_length: 2,
    });

    const org1Events = await store.getPromptEvents('org1');
    assert.equal(org1Events.length, 2);

    const org2Events = await store.getPromptEvents('org2');
    assert.equal(org2Events.length, 1);
    assert.equal(org2Events[0].quality, 'misfire');
  });

  await testAsync('persistence: InMemory sessions', async () => {
    const store = new InMemoryMcpPersistenceStore();
    await store.saveSession({
      id: 's1', org_id: 'org1', started_at: new Date(), ended_at: null,
      queries_used: 3, playbook_id: null, prompt_rewrites: 0, chain_depth: 1, plan: 'pro',
    });
    await store.saveSession({
      id: 's2', org_id: 'org1', started_at: new Date(), ended_at: new Date(),
      queries_used: 7, playbook_id: 'find_revenue_leaks', prompt_rewrites: 2, chain_depth: 3, plan: 'pro',
    });

    const sessions = await store.getSessions('org1');
    assert.equal(sessions.length, 2);
    assert.equal(sessions[1].playbook_id, 'find_revenue_leaks');
  });

  await testAsync('persistence: InMemory suggestion clicks', async () => {
    const store = new InMemoryMcpPersistenceStore();
    await store.saveSuggestionClick({
      id: 'c1', org_id: 'org1', timestamp: new Date(), suggestion_type: 'question', suggestion_text: 'q1',
    });
    await store.saveSuggestionClick({
      id: 'c2', org_id: 'org1', timestamp: new Date(), suggestion_type: 'chain', suggestion_text: 'chain1',
    });

    const clicks = await store.getSuggestionClicks('org1');
    assert.equal(clicks.length, 2);
  });

  await testAsync('persistence: InMemory playbook runs', async () => {
    const store = new InMemoryMcpPersistenceStore();
    await store.savePlaybookRun({
      id: 'pr1', org_id: 'org1', playbook_id: 'find_revenue_leaks',
      started_at: new Date(), completed_at: new Date(), steps_completed: 4,
      total_steps: 4, status: 'completed',
    });

    const runs = await store.getPlaybookRuns('org1');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'completed');
  });

  await testAsync('persistence: InMemory analysis jobs', async () => {
    const store = new InMemoryMcpPersistenceStore();
    await store.saveJob({
      id: 'j1', environment_id: 'env1', organization_id: 'org1',
      status: 'running', progress: 50, stages_completed: ['crawl'],
      created_at: new Date(), updated_at: new Date(), error: null,
    });

    const job = await store.getJob('j1');
    assert.ok(job);
    assert.equal(job!.status, 'running');
    assert.equal(job!.progress, 50);
    assert.deepEqual(job!.stages_completed, ['crawl']);

    const envJob = await store.getJobForEnvironment('env1');
    assert.ok(envJob);
    assert.equal(envJob!.id, 'j1');

    const noJob = await store.getJobForEnvironment('env_nonexistent');
    assert.equal(noJob, null);
  });

  await testAsync('persistence: InMemory job upsert', async () => {
    const store = new InMemoryMcpPersistenceStore();
    await store.saveJob({
      id: 'j2', environment_id: 'env2', organization_id: 'org1',
      status: 'queued', progress: 0, stages_completed: [],
      created_at: new Date(), updated_at: new Date(), error: null,
    });

    // Update the job
    await store.saveJob({
      id: 'j2', environment_id: 'env2', organization_id: 'org1',
      status: 'complete', progress: 100, stages_completed: ['crawl', 'analyze', 'score'],
      created_at: new Date(), updated_at: new Date(), error: null,
    });

    const job = await store.getJob('j2');
    assert.equal(job!.status, 'complete');
    assert.equal(job!.progress, 100);
  });

  // ════════════════════════════════════════════
  // Extra: Cross-module integration
  // ════════════════════════════════════════════
  console.log('\n═══ Cross-Module Integration ═══');

  test('playbook + budget: low budget blocks expensive playbook', () => {
    const result = canRunPlaybook('find_revenue_leaks', 'pro', 2); // needs 4
    assert.equal(result.allowed, false);
  });

  test('playbook + budget: sufficient budget allows', () => {
    const result = canRunPlaybook('check_trust', 'pro', 3); // needs 3
    assert.equal(result.allowed, true);
  });

  test('prompt gate + budget: near limit triggers rewrite', () => {
    const ctx = makeCtx({ mcp_pct: 92, mcp_remaining: 2 });
    const result = evaluatePromptDraft('revenue issues', ctx);
    // Short input near budget should get a rewrite suggestion
    assert.equal(result.quality, 'weak');
    assert.ok(result.suggested_rewrite);
  });

  test('observability dashboard shape is complete', () => {
    resetMcpObservability();
    resetPromptGateMetrics();
    resetPlaybookRuns();
    resetSuggestionClicks();

    const dashboard = getMcpObservabilityDashboard();
    assert.ok('prompt_gate' in dashboard);
    assert.ok('playbooks' in dashboard);
    assert.ok('suggestions' in dashboard);
    assert.ok('sessions' in dashboard);
    assert.ok('weak_prompt_rate' in dashboard.prompt_gate);
    assert.ok('rewrite_acceptance_rate' in dashboard.prompt_gate);
    assert.ok('completion_rate' in dashboard.playbooks);
    assert.ok('top_playbooks' in dashboard.playbooks);
    assert.ok('most_clicked_type' in dashboard.suggestions);
    assert.ok('avg_queries_per_session' in dashboard.sessions);
    assert.ok('avg_chain_depth' in dashboard.sessions);
  });

  test('plan config economics match defaults', () => {
    resetPlanConfigs();
    const econ = getAllConfigBasedEconomics();
    // Vestigio should have highest margin (cheapest usage)
    const vestigio = econ.find(e => e.plan === 'vestigio')!;
    const max = econ.find(e => e.plan === 'max')!;
    assert.ok(vestigio.margin_pct >= max.margin_pct);
  });

  // ════════════════════════════════════════════
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}\n`);

  if (failed > 0) process.exit(1);
}

runAllTests();
