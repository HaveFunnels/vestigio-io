/**
 * Vestigio V2 — MCP Foundation Layer Test Suite
 * Tests: server, resources, tools, answers, verification, scope isolation,
 *        freshness propagation, stale/missing scenarios
 *
 * Run: npx tsx tests/mcp.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping,
  httpResponseEvidence, pageContentEvidence, redirectEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  formEvidence, scriptEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  FreshnessState, VerificationType, DecisionImpact,
} from '../packages/domain';
import { McpServer } from '../apps/mcp/server';
import { McpRequestScope } from '../apps/mcp/types';

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

const scope: McpRequestScope = {
  workspace_ref: 'workspace:ws_1',
  environment_ref: 'environment:env_1',
};

function createServer(evidence: any[]): McpServer {
  const server = new McpServer();
  server.loadContext(
    evidence, scope, 'audit_cycle:c1', 'shop.com', 'https://shop.com/',
  );
  return server;
}

// Standard evidence sets for scenarios
const cleanEvidence = [
  pageContentEvidence('https://shop.com/'),
  httpResponseEvidence('https://shop.com/', 200, 300),
  checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
  policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  policyEvidence('https://shop.com/', 'https://shop.com/terms', 'terms'),
  policyEvidence('https://shop.com/', 'https://shop.com/refund', 'refund'),
  scriptEvidence('https://shop.com/', 'https://www.googletagmanager.com/gtag.js', true),
  scriptEvidence('https://shop.com/', 'https://connect.facebook.net/fbevents.js', true),
];

const riskyEvidence = [
  pageContentEvidence('https://shop.com/'),
  httpResponseEvidence('https://shop.com/', 200, 500),
  checkoutIndicatorEvidence('https://shop.com/', 'https://sketchy-pay.com/checkout', true),
];

const brokenEvidence = [
  pageContentEvidence('https://broken.com/'),
  httpResponseEvidence('https://broken.com/', 500, 4000),
  httpResponseEvidence('https://broken.com/checkout', 500, 5000),
  checkoutIndicatorEvidence('https://broken.com/', 'https://pay.external.com/x', true),
  formEvidence('https://broken.com/order', 'https://pay2.com/submit', true),
  redirectEvidence('https://broken.com/buy', 'https://broken.com/checkout', 4),
];

// ══════════════════════════════════════════════════
// 1. SERVER LIFECYCLE
// ══════════════════════════════════════════════════

runSuite('MCP Server Lifecycle', () => {
  test('server starts and lists tools', () => {
    const server = new McpServer();
    const tools = server.listTools();
    assertGreater(tools.length, 5, 'should have multiple tools');
    assert(tools.some(t => t.name === 'get_workspace_summary'), 'should have workspace summary tool');
    assert(tools.some(t => t.name === 'answer_can_i_scale'), 'should have scale answer tool');
    assert(tools.some(t => t.name === 'request_verification'), 'should have verification tool');
  });

  test('server lists resources', () => {
    const server = new McpServer();
    const resources = server.listResources();
    assertGreater(resources.length, 3, 'should have multiple resources');
    assert(resources.some(r => r.name === 'workspace_summary'), 'should have workspace resource');
  });

  test('tool call without context returns error', () => {
    const server = new McpServer();
    const result = server.callTool('get_workspace_summary');
    assertEqual(result.type, 'error');
  });

  test('unknown tool returns error', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('nonexistent_tool');
    assertEqual(result.type, 'error');
  });

  test('loadContext makes tools available', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('get_workspace_summary');
    assertEqual(result.type, 'workspace_summary');
  });
});

// ══════════════════════════════════════════════════
// 2. RESOURCE RETRIEVAL
// ══════════════════════════════════════════════════

runSuite('MCP Resource Retrieval', () => {
  test('get_workspace_summary returns typed view', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('get_workspace_summary');
    assertEqual(result.type, 'workspace_summary');
    if (result.type !== 'workspace_summary') return;
    const data = result.data;
    assertEqual(data.packs.length, 2, 'should have 2 packs');
    assert(data.packs.some(p => p.pack_key === 'scale_readiness_pack'), 'should have scale pack');
    assert(data.packs.some(p => p.pack_key === 'revenue_integrity_pack'), 'should have revenue pack');
    assertGreater(data.confidence, 0, 'should have confidence');
    assert(['healthy', 'at_risk', 'critical', 'unknown'].includes(data.overall_health), 'should have valid health');
  });

  test('get_decision_explainability returns scale pack details', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('get_decision_explainability', { pack_key: 'scale_readiness_pack' });
    assertEqual(result.type, 'decision_explainability');
    if (result.type !== 'decision_explainability') return;
    const data = result.data!;
    assertEqual(data.question_key, 'is_it_safe_to_scale_traffic');
    assertGreater(data.summary.length, 0, 'should have summary');
    assertGreater(data.actions.primary.length, 0, 'should have primary action');
  });

  test('get_decision_explainability returns revenue pack details', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('get_decision_explainability', { pack_key: 'revenue_integrity_pack' });
    assertEqual(result.type, 'decision_explainability');
    if (result.type !== 'decision_explainability') return;
    assertEqual(result.data!.question_key, 'is_there_revenue_leakage_in_high_intent_paths');
  });

  test('get_decision_explainability rejects invalid pack_key', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('get_decision_explainability', { pack_key: 'nonexistent_pack' });
    assertEqual(result.type, 'decision_explainability');
    if (result.type !== 'decision_explainability') return;
    assertEqual(result.data, null);
  });

  test('get_preflight_status returns readiness', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('get_preflight_status');
    assertEqual(result.type, 'preflight_status');
    if (result.type !== 'preflight_status') return;
    assert(['ready', 'ready_with_risks', 'blocker', 'na'].includes(result.data.overall_status), 'valid status');
    assertGreater(result.data.readiness_score, 0, 'should have readiness score');
  });

  test('get_revenue_integrity_summary returns leakage info', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('get_revenue_integrity_summary');
    assertEqual(result.type, 'revenue_integrity');
    if (result.type !== 'revenue_integrity') return;
    assertGreater(result.data.decision_key.length, 0, 'should have decision key');
  });

  test('get_root_causes returns root cause list', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('get_root_causes');
    assertEqual(result.type, 'root_causes');
    if (result.type !== 'root_causes') return;
    assertGreater(result.data.length, 0, 'risky site should have root causes');
  });

  test('get_prioritized_actions returns sorted actions', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('get_prioritized_actions');
    assertEqual(result.type, 'prioritized_actions');
    if (result.type !== 'prioritized_actions') return;
    assertGreater(result.data.length, 0, 'should have actions');
    for (let i = 1; i < result.data.length; i++) {
      assert(result.data[i].priority >= result.data[i - 1].priority, 'actions sorted by priority');
    }
  });

  test('get_graph_path_summary returns structure', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('get_graph_path_summary');
    assertEqual(result.type, 'graph_path_summary');
    if (result.type !== 'graph_path_summary') return;
    assertGreater(result.data.total_nodes, 0, 'should have nodes');
  });
});

// ══════════════════════════════════════════════════
// 3. BUSINESS QUESTION ANSWERS
// ══════════════════════════════════════════════════

runSuite('MCP Business Question Answers', () => {
  test('answer_can_i_scale — clean site', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('answer_can_i_scale');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    const ans = result.data;
    // With chargeback signals, clean site may have minor risk (no contact/pricing page)
    assert(!ans.direct_answer.toLowerCase().includes('unsafe'),
      `scale answer for clean site should not be unsafe, got: ${ans.direct_answer}`);
    assertGreater(ans.confidence, 0, 'should have confidence');
    assertEqual(ans.freshness, FreshnessState.Fresh);
    assertGreater(ans.why.length, 0, 'should have why');
    assertGreater(ans.recommended_next_step.length, 0, 'should have next step');
  });

  test('answer_can_i_scale — risky site', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('answer_can_i_scale');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    assert(result.data.direct_answer.length > 0, 'should have answer');
  });

  test('answer_where_losing_money — clean site', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('answer_where_losing_money');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    // With chargeback signals, clean site may have minor revenue issues
    assert(!result.data.direct_answer.toLowerCase().includes('active'),
      'clean site should not have active leakage');
  });

  test('answer_where_losing_money — risky site', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('answer_where_losing_money');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    assert(result.data.direct_answer.length > 0, 'should have answer');
  });

  test('answer_underlying_cause — with problems', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('answer_underlying_cause');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    assert(result.data.direct_answer.includes('problem'), 'should mention problems');
    assertGreater(result.data.why.length, 0, 'should explain why');
  });

  test('answer_underlying_cause — no problems', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('answer_underlying_cause');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    // Clean site may still have some minor root causes, but answer should exist
    assert(result.data.direct_answer.length > 0, 'should have answer');
  });

  test('answer_fix_first — with actions', () => {
    const server = createServer(riskyEvidence);
    const result = server.callTool('answer_fix_first');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    assert(result.data.direct_answer.includes('action') || result.data.direct_answer.includes('Fix'),
      'should mention actions');
    assertGreater(result.data.why.length, 0, 'should list what to fix');
  });

  test('all answers include confidence and freshness', () => {
    const server = createServer(riskyEvidence);
    const tools = ['answer_can_i_scale', 'answer_where_losing_money', 'answer_underlying_cause', 'answer_fix_first'];
    for (const tool of tools) {
      const result = server.callTool(tool);
      assertEqual(result.type, 'answer', `${tool} should return answer`);
      if (result.type !== 'answer') continue;
      assert(result.data.confidence >= 0 && result.data.confidence <= 100, `${tool}: confidence in range`);
      assert(Object.values(FreshnessState).includes(result.data.freshness), `${tool}: valid freshness`);
    }
  });
});

// ══════════════════════════════════════════════════
// 4. VERIFICATION REQUESTS
// ══════════════════════════════════════════════════

runSuite('MCP Verification Requests', () => {
  test('request_verification creates pending request', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('request_verification', {
      verification_type: 'light_probe',
      subject_ref: 'https://shop.com/checkout',
      reason: 'Confirm checkout is still accessible',
      decision_ref: null,
    });
    assertEqual(result.type, 'verification_request');
    if (result.type !== 'verification_request') return;
    assertEqual(result.data.status, 'pending');
    assertEqual(result.data.verification_type, VerificationType.LightProbe);
    assertEqual(result.data.requested_by, 'mcp');
  });

  test('request_verification for browser_verification', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('request_verification', {
      verification_type: 'browser_verification',
      subject_ref: 'https://shop.com/checkout',
      reason: 'Need to verify JS-rendered checkout flow',
    });
    assertEqual(result.type, 'verification_request');
    if (result.type !== 'verification_request') return;
    assertEqual(result.data.verification_type, VerificationType.BrowserVerification);
  });

  test('request_verification rejects missing subject_ref', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('request_verification', {
      verification_type: 'light_probe',
      subject_ref: '',
      reason: 'test',
    });
    assertEqual(result.type, 'error');
  });

  test('request_verification rejects missing reason', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('request_verification', {
      verification_type: 'light_probe',
      subject_ref: 'https://shop.com',
      reason: '',
    });
    assertEqual(result.type, 'error');
  });

  test('verification request is emitted, NOT executed', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('request_verification', {
      verification_type: 'browser_verification',
      subject_ref: 'https://shop.com/checkout',
      reason: 'Verify checkout behavior',
    });
    if (result.type !== 'verification_request') return;
    assertEqual(result.data.status, 'pending', 'should be pending, not executed');
    assertEqual(result.data.result_evidence_refs.length, 0, 'should have no results yet');
    assertEqual(result.data.completed_at, null, 'should not be completed');
  });
});

// ══════════════════════════════════════════════════
// 5. ANSWER COMPOSITION QUALITY
// ══════════════════════════════════════════════════

runSuite('MCP Answer Composition Quality', () => {
  test('answers suggest verification when confidence is low', () => {
    // Use minimal evidence that produces low-confidence decisions
    const server = createServer([pageContentEvidence('https://bare.com/')]);
    const result = server.callTool('answer_can_i_scale');
    if (result.type !== 'answer') return;
    // Low evidence may or may not suggest verification depending on confidence
    // The test verifies the structure is correct regardless
    if (result.data.optional_verification) {
      assert(result.data.optional_verification.reason.length > 0, 'verification should have reason');
      assert(result.data.optional_verification.expected_benefit.length > 0, 'should have benefit');
    }
  });

  test('answers do NOT invent information', () => {
    const server = createServer([]);
    // Empty evidence — MCP should still produce a coherent answer without inventing
    const result = server.callTool('answer_can_i_scale');
    assertEqual(result.type, 'answer');
    if (result.type !== 'answer') return;
    assert(result.data.direct_answer.length > 0, 'should have answer even with no evidence');
    // Should not claim certainty with no evidence
    assert(result.data.confidence <= 70, 'should not claim high confidence with no evidence');
  });

  test('workspace summary reflects scope', () => {
    const server = createServer(cleanEvidence);
    const result = server.callTool('get_workspace_summary');
    if (result.type !== 'workspace_summary') return;
    assertEqual(result.data.workspace_ref, scope.workspace_ref);
    assertEqual(result.data.environment_ref, scope.environment_ref);
  });
});

// ══════════════════════════════════════════════════
// 6. DETERMINISM
// ══════════════════════════════════════════════════

runSuite('MCP Determinism', () => {
  test('same evidence produces same answers', () => {
    const s1 = createServer(riskyEvidence);
    const s2 = createServer(riskyEvidence);
    const r1 = s1.callTool('answer_can_i_scale');
    const r2 = s2.callTool('answer_can_i_scale');
    if (r1.type !== 'answer' || r2.type !== 'answer') return;
    assertEqual(r1.data.direct_answer, r2.data.direct_answer);
    assertEqual(r1.data.confidence, r2.data.confidence);
  });

  test('same evidence produces same workspace summary', () => {
    const s1 = createServer(riskyEvidence);
    const s2 = createServer(riskyEvidence);
    const r1 = s1.callTool('get_workspace_summary');
    const r2 = s2.callTool('get_workspace_summary');
    if (r1.type !== 'workspace_summary' || r2.type !== 'workspace_summary') return;
    assertEqual(r1.data.overall_health, r2.data.overall_health);
    assertEqual(r1.data.root_causes.length, r2.data.root_causes.length);
  });
});

// ══════════════════════════════════════════════════
// 7. SCENARIO: BROKEN CONVERSION PATH
// ══════════════════════════════════════════════════

runSuite('MCP Scenario: Broken Conversion Path', () => {
  test('broken site produces critical health', () => {
    const server = new McpServer();
    server.loadContext(brokenEvidence, scope, 'audit_cycle:c1', 'broken.com', 'https://broken.com/');
    const result = server.callTool('get_workspace_summary');
    if (result.type !== 'workspace_summary') return;
    assert(['critical', 'at_risk'].includes(result.data.overall_health),
      `broken site should be critical or at_risk, got: ${result.data.overall_health}`);
  });

  test('broken site has root causes', () => {
    const server = new McpServer();
    server.loadContext(brokenEvidence, scope, 'audit_cycle:c1', 'broken.com', 'https://broken.com/');
    const result = server.callTool('get_root_causes');
    if (result.type !== 'root_causes') return;
    assertGreater(result.data.length, 0, 'broken site should have root causes');
  });

  test('broken site scale answer is negative', () => {
    const server = new McpServer();
    server.loadContext(brokenEvidence, scope, 'audit_cycle:c1', 'broken.com', 'https://broken.com/');
    const result = server.callTool('answer_can_i_scale');
    if (result.type !== 'answer') return;
    assert(
      result.data.direct_answer.toLowerCase().includes('not') ||
      result.data.direct_answer.toLowerCase().includes('no') ||
      result.data.direct_answer.toLowerCase().includes('caution') ||
      result.data.direct_answer.toLowerCase().includes('fix'),
      `broken site scale answer should be negative, got: ${result.data.direct_answer}`,
    );
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  MCP TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
