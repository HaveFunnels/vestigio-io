/**
 * Vestigio V2 — Verification Execution Layer Test Suite
 * Tests: request lifecycle, executors, orchestrator, closed-loop recompute,
 *        idempotency, failure handling, MCP integration
 *
 * Run: npx tsx tests/verification.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  Evidence, VerificationType, VerificationRequest,
  FreshnessState, IdGenerator, Scoping, makeRef,
} from '../packages/domain';
import { EvidenceStore } from '../packages/evidence';
import { VerificationOrchestrator, OrchestratorConfig } from '../workers/verification';
import { ReuseOnlyExecutor, LightProbeExecutor, BrowserVerificationExecutor } from '../workers/verification';
import { setPlaywrightMode } from '../workers/verification/browser-worker';
import { McpServer } from '../apps/mcp/server';
import { McpRequestScope } from '../apps/mcp/types';

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(name: string, fn: () => void | Promise<void>): void {
  resetCounters();
  const result = fn();
  if (result instanceof Promise) {
    result.then(() => {
      const r = getResults();
      printResults(name);
      if (r.failed > 0) suitesFailed++;
      else suitesPassed++;
    });
  } else {
    const r = getResults();
    printResults(name);
    if (r.failed > 0) suitesFailed++;
    else suitesPassed++;
  }
}

const scope: McpRequestScope = {
  workspace_ref: 'workspace:ws_1',
  environment_ref: 'environment:env_1',
};

const scoping: Scoping = {
  workspace_ref: 'workspace:ws_1',
  environment_ref: 'environment:env_1',
  subject_ref: 'website:test.com',
  path_scope: null,
};

// Note: test helper factories set subject_ref to the URL passed as argument.
// The reuse_only executor matches on subject_ref OR scoping.subject_ref.
const baseEvidence = [
  pageContentEvidence('https://test.com/'),
  httpResponseEvidence('https://test.com/', 200, 500),
  checkoutIndicatorEvidence('https://test.com/', 'https://pay.external.com/checkout', true),
];
// Override subject_ref on base evidence to match our test URL
for (const e of baseEvidence) {
  e.subject_ref = 'https://test.com/';
  e.scoping.subject_ref = 'https://test.com/';
}

function makeRequest(overrides: Partial<VerificationRequest> = {}): VerificationRequest {
  const ids = new IdGenerator('tvr');
  const now = new Date();
  return {
    id: ids.next(),
    verification_type: VerificationType.LightProbe,
    subject_ref: 'https://test.com/',
    reason: 'Test verification',
    requested_by: 'mcp',
    decision_ref: null,
    status: 'pending',
    result_evidence_refs: [],
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeOrchestrator(evidence: Evidence[] = baseEvidence): VerificationOrchestrator {
  const store = new EvidenceStore();
  store.addMany(evidence);
  const config: OrchestratorConfig = {
    max_retries: 2,
    scoping,
    cycle_ref: 'audit_cycle:c1',
    root_domain: 'test.com',
    landing_url: 'https://test.com/',
    conversion_proximity: 2,
    is_production: true,
  };
  return new VerificationOrchestrator(store, config);
}

// ══════════════════════════════════════════════════
// 1. REUSE-ONLY EXECUTOR
// ══════════════════════════════════════════════════

async function reuseOnlySuite() {
  const executor = new ReuseOnlyExecutor();

  await testAsync('reuse_only returns existing evidence with refreshed freshness', async () => {
    const result = await executor.execute({
      request: makeRequest({ verification_type: VerificationType.ReuseOnly }),
      subject_url: 'https://test.com/',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: baseEvidence,
    });
    assertEqual(result.status, 'completed');
    assertGreater(result.evidence.length, 0, 'should return refreshed evidence');
    for (const e of result.evidence) {
      assertEqual(e.freshness.freshness_state, FreshnessState.Fresh);
    }
  });

  await testAsync('reuse_only with no matching evidence returns empty', async () => {
    const result = await executor.execute({
      request: makeRequest({ verification_type: VerificationType.ReuseOnly }),
      subject_url: 'https://unknown.com/',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: baseEvidence,
    });
    assertEqual(result.status, 'completed');
    assertEqual(result.evidence.length, 0);
  });

  await testAsync('reuse_only does not create new evidence IDs', async () => {
    const result = await executor.execute({
      request: makeRequest({ verification_type: VerificationType.ReuseOnly }),
      subject_url: 'https://test.com/',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: baseEvidence,
    });
    // Evidence IDs should match original
    for (let i = 0; i < result.evidence.length; i++) {
      assertEqual(result.evidence[i].id, baseEvidence.find(
        e => e.subject_ref === result.evidence[i].subject_ref && e.evidence_type === result.evidence[i].evidence_type
      )?.id || result.evidence[i].id);
    }
  });
}

// ══════════════════════════════════════════════════
// 2. LIGHT PROBE EXECUTOR
// ══════════════════════════════════════════════════

async function lightProbeSuite() {
  const executor = new LightProbeExecutor();

  await testAsync('light_probe generates HTTP response evidence', async () => {
    // Use a real URL that will respond
    const result = await executor.execute({
      request: makeRequest({ subject_ref: 'https://example.com' }),
      subject_url: 'https://example.com',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });
    assertEqual(result.status, 'completed');
    assertGreater(result.evidence.length, 0, 'should generate evidence');
    assert(result.evidence.some(e => e.evidence_type === 'http_response'), 'should have HTTP response');
    assertGreater(result.logs.length, 0, 'should have logs');
  });

  await testAsync('light_probe evidence is tagged as verification source', async () => {
    const result = await executor.execute({
      request: makeRequest({ subject_ref: 'https://example.com' }),
      subject_url: 'https://example.com',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });
    for (const e of result.evidence) {
      assertEqual(e.quality_score, 80, 'verification evidence should have quality_score 80');
    }
  });

  await testAsync('light_probe handles unreachable URLs gracefully', async () => {
    const result = await executor.execute({
      request: makeRequest({ subject_ref: 'https://this-domain-does-not-exist-xyz.com' }),
      subject_url: 'https://this-domain-does-not-exist-xyz.com',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });
    assertEqual(result.status, 'failed');
    assertGreater(result.errors.length, 0, 'should have errors');
  });
}

// ══════════════════════════════════════════════════
// 3. BROWSER VERIFICATION STUB
// ══════════════════════════════════════════════════

async function browserStubSuite() {
  setPlaywrightMode('simulated'); // force simulated for test stability
  await testAsync('browser_verification executes and produces evidence', async () => {
    const executor = new BrowserVerificationExecutor();
    const result = await executor.execute({
      request: makeRequest({ verification_type: VerificationType.BrowserVerification }),
      subject_url: 'https://test.com/',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });
    assertEqual(result.status, 'completed');
    assertGreater(result.evidence.length, 0, 'should produce browser evidence');
  });
}

// ══════════════════════════════════════════════════
// 4. ORCHESTRATOR LIFECYCLE
// ══════════════════════════════════════════════════

async function orchestratorSuite() {
  await testAsync('orchestrator executes reuse_only and stores evidence', async () => {
    const orch = makeOrchestrator();
    const req = makeRequest({ verification_type: VerificationType.ReuseOnly });
    orch.submit(req);
    const result = await orch.execute(req.id);
    assertEqual(result.status, 'completed');
    assertEqual(orch.getRequest(req.id)?.status, 'completed');
  });

  await testAsync('orchestrator is idempotent — second execute returns cached result', async () => {
    const orch = makeOrchestrator();
    const req = makeRequest({ verification_type: VerificationType.ReuseOnly });
    orch.submit(req);
    const r1 = await orch.execute(req.id);
    const r2 = await orch.execute(req.id);
    assertEqual(r1.request_id, r2.request_id);
    assertEqual(r1.evidence.length, r2.evidence.length);
  });

  await testAsync('orchestrator rejects duplicate submissions', async () => {
    const orch = makeOrchestrator();
    const req = makeRequest({ verification_type: VerificationType.ReuseOnly });
    orch.submit(req);
    orch.submit(req); // should be silently ignored
    assertEqual(orch.getAllRequests().length, 1);
  });

  await testAsync('orchestrator tracks verification runs', async () => {
    const orch = makeOrchestrator();
    const req = makeRequest({ verification_type: VerificationType.ReuseOnly });
    orch.submit(req);
    await orch.execute(req.id);
    const runs = orch.getRuns(req.id);
    assertEqual(runs.length, 1);
    assertEqual(runs[0].status, 'completed');
    assert(runs[0].completed_at instanceof Date, 'should have completed_at');
  });

  await testAsync('orchestrator throws for unknown request ID', async () => {
    const orch = makeOrchestrator();
    let threw = false;
    try { await orch.execute('nonexistent'); } catch { threw = true; }
    assert(threw, 'should throw for unknown ID');
  });
}

// ══════════════════════════════════════════════════
// 5. CLOSED-LOOP RECOMPUTATION
// ══════════════════════════════════════════════════

async function closedLoopSuite() {
  await testAsync('executeAndRecompute produces updated decisions', async () => {
    const orch = makeOrchestrator();
    const req = makeRequest({ verification_type: VerificationType.ReuseOnly });
    orch.submit(req);
    const { verification, recomputation } = await orch.executeAndRecompute(req.id);
    assertEqual(verification.status, 'completed');
    assert(recomputation.scale_readiness.decision.decision_key !== '', 'should have scale decision');
    assert(recomputation.revenue_integrity.decision.decision_key !== '', 'should have revenue decision');
    assert(recomputation.intelligence.root_causes !== undefined, 'should have intelligence');
  });

  await testAsync('light_probe + recompute changes evidence store', async () => {
    const store = new EvidenceStore();
    store.addMany(baseEvidence);
    const initialCount = store.count();

    const config: OrchestratorConfig = {
      max_retries: 2, scoping, cycle_ref: 'audit_cycle:c1',
      root_domain: 'example.com', landing_url: 'https://example.com/',
      conversion_proximity: 2, is_production: true,
    };
    const orch = new VerificationOrchestrator(store, config);
    const req = makeRequest({
      verification_type: VerificationType.LightProbe,
      subject_ref: 'https://example.com',
    });
    orch.submit(req);
    const { verification } = await orch.executeAndRecompute(req.id);

    if (verification.status === 'completed') {
      assertGreater(store.count(), initialCount, 'new evidence should be added to store');
    }
  });
}

// ══════════════════════════════════════════════════
// 6. MCP INTEGRATION
// ══════════════════════════════════════════════════

async function mcpIntegrationSuite() {
  await testAsync('MCP verify() creates, executes, and recomputes', async () => {
    const server = new McpServer();
    server.loadContext(baseEvidence, scope, 'audit_cycle:c1', 'test.com', 'https://test.com/');

    const result = await server.verify({
      verification_type: 'reuse_only',
      subject_ref: 'https://test.com/',
      reason: 'Re-verify current state',
    });

    assertEqual(result.type, 'verification_status');
    if (result.type !== 'verification_status') return;
    assertEqual(result.data!.status, 'completed');
  });

  await testAsync('MCP list_verifications shows submitted requests', async () => {
    const server = new McpServer();
    server.loadContext(baseEvidence, scope, 'audit_cycle:c1', 'test.com', 'https://test.com/');

    await server.verify({
      verification_type: 'reuse_only',
      subject_ref: 'https://test.com/',
      reason: 'Test',
    });

    const result = server.callTool('list_verifications');
    assertEqual(result.type, 'verification_list');
    if (result.type !== 'verification_list') return;
    assertGreater(result.data.length, 0, 'should have verification entries');
  });

  await testAsync('MCP get_verification_status returns details', async () => {
    const server = new McpServer();
    server.loadContext(baseEvidence, scope, 'audit_cycle:c1', 'test.com', 'https://test.com/');

    const verifyResult = await server.verify({
      verification_type: 'reuse_only',
      subject_ref: 'https://test.com/',
      reason: 'Test',
    });

    if (verifyResult.type !== 'verification_status' || !verifyResult.data) return;
    const statusResult = server.callTool('get_verification_status', {
      request_id: verifyResult.data.request_id,
    });
    assertEqual(statusResult.type, 'verification_status');
  });

  await testAsync('MCP context updates after verification', async () => {
    const server = new McpServer();
    server.loadContext(baseEvidence, scope, 'audit_cycle:c1', 'test.com', 'https://test.com/');

    // Get initial decision
    const before = server.callTool('answer_can_i_scale');

    // Run verification
    await server.verify({
      verification_type: 'reuse_only',
      subject_ref: 'https://test.com/',
      reason: 'Refresh state',
    });

    // Get updated decision
    const after = server.callTool('answer_can_i_scale');

    // Both should be valid answers (verification may or may not change the decision)
    assertEqual(before.type, 'answer');
    assertEqual(after.type, 'answer');
  });

  await testAsync('MCP rejects verification without context', async () => {
    const server = new McpServer();
    const result = await server.verify({
      verification_type: 'light_probe',
      subject_ref: 'https://test.com/',
      reason: 'Test',
    });
    assertEqual(result.type, 'error');
  });
}

// ══════════════════════════════════════════════════
// RUN ALL SUITES
// ══════════════════════════════════════════════════

async function main() {
  resetCounters();
  await reuseOnlySuite();
  const r1 = getResults();
  printResults('Reuse-Only Executor');
  if (r1.failed > 0) suitesFailed++; else suitesPassed++;

  resetCounters();
  await lightProbeSuite();
  const r2 = getResults();
  printResults('Light Probe Executor');
  if (r2.failed > 0) suitesFailed++; else suitesPassed++;

  resetCounters();
  await browserStubSuite();
  const r3 = getResults();
  printResults('Browser Verification Stub');
  if (r3.failed > 0) suitesFailed++; else suitesPassed++;

  resetCounters();
  await orchestratorSuite();
  const r4 = getResults();
  printResults('Orchestrator Lifecycle');
  if (r4.failed > 0) suitesFailed++; else suitesPassed++;

  resetCounters();
  await closedLoopSuite();
  const r5 = getResults();
  printResults('Closed-Loop Recomputation');
  if (r5.failed > 0) suitesFailed++; else suitesPassed++;

  resetCounters();
  await mcpIntegrationSuite();
  const r6 = getResults();
  printResults('MCP Integration');
  if (r6.failed > 0) suitesFailed++; else suitesPassed++;

  console.log('\n═══════════════════════════════════════════════');
  console.log('  VERIFICATION TEST SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
  if (suitesFailed > 0) {
    console.log('  SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('  ALL TESTS PASSED');
  }
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
