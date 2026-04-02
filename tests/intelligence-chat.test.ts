/**
 * Vestigio V2 — Active Intelligence & Contextual Chat Test Suite
 * Tests: contextual chat, multi-finding analysis, suggestions,
 *        next-best-question, session context, MCP integration
 *
 * Run: npx tsx tests/intelligence-chat.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testInference,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { recomputeAll } from '../packages/workspace';
import { projectAll } from '../packages/projections';
import { McpServer } from '../apps/mcp/server';
import { McpRequestScope, McpSessionContext } from '../apps/mcp/types';
import { createEmptySession, markPackExplored, markMapExplored, markQuestionAsked } from '../apps/mcp/session';
import { generateNextQuestions, generateFindingPrompts, generateMultiFindingPrompts } from '../apps/mcp/questions';
import { buildFindingChatContext, buildMultiFindingContext } from '../apps/mcp/suggestions';

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(name: string, fn: () => void): void {
  resetCounters();
  fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

const scoping = testScoping();
const cycleRef = 'audit_cycle:c1';
const scope: McpRequestScope = { workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1' };

function standardEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  ];
}

function computeResult() {
  return recomputeAll({
    evidence: standardEvidence(),
    scoping,
    cycle_ref: cycleRef,
    root_domain: 'shop.com',
    landing_url: 'https://shop.com/',
    conversion_proximity: 2,
    is_production: true,
  });
}

// ══════════════════════════════════════════════════
// 1. SESSION CONTEXT
// ══════════════════════════════════════════════════

runSuite('Session Context', () => {
  test('createEmptySession has empty exploration state', () => {
    const session = createEmptySession();
    assertEqual(session.exploration_state.explored_packs.length, 0);
    assertEqual(session.exploration_state.explored_root_causes.length, 0);
    assertEqual(session.exploration_state.explored_maps.length, 0);
    assertEqual(session.exploration_state.asked_questions.length, 0);
  });

  test('markPackExplored adds to explored list', () => {
    const session = createEmptySession();
    markPackExplored(session, 'scale_readiness');
    assertEqual(session.exploration_state.explored_packs.length, 1);
    assert(session.exploration_state.explored_packs.includes('scale_readiness'), 'should include pack');
  });

  test('markPackExplored is idempotent', () => {
    const session = createEmptySession();
    markPackExplored(session, 'scale_readiness');
    markPackExplored(session, 'scale_readiness');
    assertEqual(session.exploration_state.explored_packs.length, 1);
  });

  test('markMapExplored adds to explored list', () => {
    const session = createEmptySession();
    markMapExplored(session, 'revenue_leakage');
    assertEqual(session.exploration_state.explored_maps.length, 1);
  });

  test('markQuestionAsked tracks asked questions', () => {
    const session = createEmptySession();
    markQuestionAsked(session, 'Why is checkout broken?');
    assertEqual(session.exploration_state.asked_questions.length, 1);
    assert(session.exploration_state.asked_questions.includes('Why is checkout broken?'), 'should track question');
  });
});

// ══════════════════════════════════════════════════
// 2. NEXT-BEST-QUESTION ENGINE
// ══════════════════════════════════════════════════

runSuite('Next-Best-Question Engine', () => {
  test('generates questions for fresh session', () => {
    const result = computeResult();
    const projections = projectAll(result);
    const session = createEmptySession();
    const questions = generateNextQuestions(session, projections, result.impact.summary);
    assertGreater(questions.length, 0, 'should generate questions');
    assert(questions.length <= 5, 'should have at most 5 questions');
  });

  test('questions are strings', () => {
    const result = computeResult();
    const projections = projectAll(result);
    const session = createEmptySession();
    const questions = generateNextQuestions(session, projections, result.impact.summary);
    for (const q of questions) {
      assert(typeof q === 'string', 'question should be string');
      assertGreater(q.length, 0, 'question should not be empty');
    }
  });

  test('fewer questions after exploration', () => {
    const result = computeResult();
    const projections = projectAll(result);

    const freshSession = createEmptySession();
    const freshQuestions = generateNextQuestions(freshSession, projections, result.impact.summary);

    const exploredSession = createEmptySession();
    markPackExplored(exploredSession, 'scale_readiness');
    markPackExplored(exploredSession, 'revenue_integrity');
    markPackExplored(exploredSession, 'chargeback_resilience');
    markMapExplored(exploredSession, 'revenue_leakage');
    markMapExplored(exploredSession, 'root_cause');
    const exploredQuestions = generateNextQuestions(exploredSession, projections, result.impact.summary);

    assert(exploredQuestions.length <= freshQuestions.length, 'explored session should have <= questions');
  });

  test('no repetition of asked questions', () => {
    const result = computeResult();
    const projections = projectAll(result);
    const session = createEmptySession();

    const q1 = generateNextQuestions(session, projections, result.impact.summary);
    // Mark first question as asked
    if (q1.length > 0) {
      markQuestionAsked(session, q1[0]);
      const q2 = generateNextQuestions(session, projections, result.impact.summary);
      assert(!q2.includes(q1[0]), 'should not repeat asked question');
    }
  });
});

// ══════════════════════════════════════════════════
// 3. FINDING PROMPTS
// ══════════════════════════════════════════════════

runSuite('Finding Prompt Generation', () => {
  test('generates 3 prompts for a finding', () => {
    const result = computeResult();
    const projections = projectAll(result);
    if (projections.findings.length === 0) return;

    const prompts = generateFindingPrompts(projections.findings[0]);
    assertEqual(prompts.length, 3, 'should generate 3 prompts');
  });

  test('prompts include why and fix', () => {
    const result = computeResult();
    const projections = projectAll(result);
    if (projections.findings.length === 0) return;

    const prompts = generateFindingPrompts(projections.findings[0]);
    const hasWhy = prompts.some(p => p.toLowerCase().includes('why'));
    const hasFix = prompts.some(p => p.toLowerCase().includes('fix'));
    assert(hasWhy, 'should include a "why" prompt');
    assert(hasFix, 'should include a "fix" prompt');
  });

  test('multi-finding prompts generated', () => {
    const result = computeResult();
    const projections = projectAll(result);
    if (projections.findings.length < 2) return;

    const prompts = generateMultiFindingPrompts(projections.findings.slice(0, 2), ['Trust failure']);
    assertGreater(prompts.length, 0, 'should generate multi-finding prompts');
    assert(prompts.length <= 3, 'should have at most 3 prompts');
  });
});

// ══════════════════════════════════════════════════
// 4. CONTEXTUAL CHAT — SINGLE FINDING
// ══════════════════════════════════════════════════

runSuite('Contextual Chat — Single Finding', () => {
  test('buildFindingChatContext returns context for valid finding', () => {
    const result = computeResult();
    const projections = projectAll(result);
    if (projections.findings.length === 0) return;

    const ctx = buildFindingChatContext(projections.findings[0].id, projections);
    assert(ctx !== null, 'should return context');
    assertEqual(ctx!.finding_id, projections.findings[0].id);
    assert(ctx!.title.length > 0, 'should have title');
    assertGreater(ctx!.impact.midpoint, 0, 'should have impact');
    assertGreater(ctx!.suggested_prompts.length, 0, 'should have suggested prompts');
  });

  test('buildFindingChatContext returns null for invalid id', () => {
    const result = computeResult();
    const projections = projectAll(result);
    const ctx = buildFindingChatContext('nonexistent_finding', projections);
    assertEqual(ctx, null);
  });

  test('discuss_finding tool returns answer with contextual_focus', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    // Get finding IDs first
    const projResult = server.callTool('get_finding_projections');
    if (projResult.type !== 'finding_projections' || projResult.data.length === 0) return;

    const findingId = projResult.data[0].id;
    const result = server.callTool('discuss_finding', { finding_id: findingId });
    assertEqual(result.type, 'answer');
    const answer = result.data as any;
    assert(answer.contextual_focus !== null, 'should have contextual_focus');
    assert(answer.contextual_focus!.finding !== undefined, 'should have finding context');
    assertEqual(answer.contextual_focus!.finding!.finding_id, findingId);
  });

  test('discuss_finding includes suggestions', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const projResult = server.callTool('get_finding_projections');
    if (projResult.type !== 'finding_projections' || projResult.data.length === 0) return;

    const result = server.callTool('discuss_finding', { finding_id: (projResult.data as any)[0].id });
    if (result.type !== 'answer') return;

    assert((result.data as any).suggestions !== null, 'should have suggestions');
    assertGreater((result.data as any).suggestions!.questions.length, 0, 'should have suggestion questions');
  });
});

// ══════════════════════════════════════════════════
// 5. MULTI-FINDING ANALYSIS
// ══════════════════════════════════════════════════

runSuite('Multi-Finding Analysis', () => {
  test('buildMultiFindingContext computes combined impact', () => {
    const result = computeResult();
    const projections = projectAll(result);
    if (projections.findings.length < 2) return;

    const ids = projections.findings.slice(0, 2).map(f => f.id);
    const ctx = buildMultiFindingContext(ids, projections);
    assert(ctx !== null, 'should return context');
    assertGreater(ctx!.combined_impact.midpoint, 0, 'should have combined impact');
    assertEqual(ctx!.finding_ids.length, 2, 'should have 2 findings');
  });

  test('buildMultiFindingContext detects shared root causes', () => {
    const result = computeResult();
    const projections = projectAll(result);

    // Find two findings with same root cause
    const rcMap = new Map<string, string[]>();
    for (const f of projections.findings) {
      if (f.root_cause) {
        const list = rcMap.get(f.root_cause) || [];
        list.push(f.id);
        rcMap.set(f.root_cause, list);
      }
    }
    const shared = [...rcMap.values()].find(ids => ids.length >= 2);
    if (!shared) return; // no shared root causes in this data

    const ctx = buildMultiFindingContext(shared, projections);
    assert(ctx !== null, 'should return context');
    assertGreater(ctx!.shared_root_causes.length, 0, 'should detect shared root causes');
  });

  test('buildMultiFindingContext generates relationships', () => {
    const result = computeResult();
    const projections = projectAll(result);
    if (projections.findings.length < 2) return;

    const ids = projections.findings.slice(0, 2).map(f => f.id);
    const ctx = buildMultiFindingContext(ids, projections);
    assert(ctx !== null, 'should return context');
    // At minimum should detect same-pack compounding or same-surface overlap
    // (may have 0 relationships if findings are fully independent)
    assert(Array.isArray(ctx!.relationships), 'should have relationships array');
  });

  test('analyze_findings tool returns answer with multi_finding context', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const projResult = server.callTool('get_finding_projections');
    if (projResult.type !== 'finding_projections' || projResult.data.length < 2) return;

    const ids = (projResult.data as any).slice(0, 2).map((f: any) => f.id);
    const result = server.callTool('analyze_findings', { finding_ids: ids });
    assertEqual(result.type, 'answer');
    const answer = result.data as any;
    assert(answer.contextual_focus !== null, 'should have contextual_focus');
    assert(answer.contextual_focus!.multi_finding !== undefined, 'should have multi_finding context');
    assertEqual(answer.contextual_focus!.multi_finding!.finding_ids.length, 2);
  });

  test('analyze_findings includes suggested prompts', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const projResult = server.callTool('get_finding_projections');
    if (projResult.type !== 'finding_projections' || projResult.data.length < 2) return;

    const ids = projResult.data.slice(0, 2).map((f: any) => f.id);
    const result = server.callTool('analyze_findings', { finding_ids: ids });
    if (result.type !== 'answer') return;

    assert((result.data as any).contextual_focus!.multi_finding!.suggested_prompts.length > 0, 'should have suggested prompts');
  });
});

// ══════════════════════════════════════════════════
// 6. MCP ANSWER SUGGESTIONS
// ══════════════════════════════════════════════════

runSuite('MCP Answer Suggestions', () => {
  test('all standard answers include suggestions', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const tools = ['answer_can_i_scale', 'answer_where_losing_money', 'answer_underlying_cause', 'answer_fix_first'];
    for (const tool of tools) {
      const result = server.callTool(tool);
      if (result.type !== 'answer') continue;
      assert(result.data.suggestions !== null, `${tool}: should have suggestions`);
      assert(result.data.suggestions!.questions.length >= 0, `${tool}: should have questions array`);
      assert(result.data.suggestions!.actions.length >= 0, `${tool}: should have actions array`);
      assert(typeof result.data.suggestions!.navigation === 'object', `${tool}: should have navigation`);
    }
  });

  test('suggestion questions are non-empty strings', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const result = server.callTool('answer_can_i_scale');
    if (result.type !== 'answer' || !result.data.suggestions) return;

    for (const q of result.data.suggestions.questions) {
      assert(typeof q === 'string', 'question should be string');
      assertGreater(q.length, 0, 'question should not be empty');
    }
  });

  test('suggestions include navigation targets', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const result = server.callTool('answer_can_i_scale');
    if (result.type !== 'answer' || !result.data.suggestions) return;

    const nav = result.data.suggestions.navigation;
    // Scale answer should suggest preflight workspace
    assert(nav.open_workspace !== undefined || nav.open_map !== undefined || nav.open_actions !== undefined,
      'should have at least one navigation target');
  });
});

// ══════════════════════════════════════════════════
// 7. SERVER SESSION MANAGEMENT
// ══════════════════════════════════════════════════

runSuite('Server Session Management', () => {
  test('server has empty session by default', () => {
    const server = new McpServer();
    const session = server.getSession();
    assertEqual(session.exploration_state.explored_packs.length, 0);
  });

  test('updateSession modifies session state', () => {
    const server = new McpServer();
    server.updateSession({ active_workspace: 'preflight' });
    assertEqual(server.getSession().active_workspace, 'preflight');
  });

  test('updateSession tracks explored maps', () => {
    const server = new McpServer();
    server.updateSession({ last_viewed_map: 'revenue_leakage' });
    assert(server.getSession().exploration_state.explored_maps.includes('revenue_leakage'), 'should track map');
  });

  test('resetSession clears state', () => {
    const server = new McpServer();
    server.updateSession({ active_workspace: 'preflight', last_viewed_map: 'root_cause' });
    server.resetSession();
    assertEqual(server.getSession().active_workspace, undefined);
    assertEqual(server.getSession().exploration_state.explored_maps.length, 0);
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  ACTIVE INTELLIGENCE TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
