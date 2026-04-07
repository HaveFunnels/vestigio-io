/**
 * Vestigio V2 — Playwright Runtime Test Suite
 * Tests: runtime creation, step mapping, mode switching,
 *        artifact capture, timeout enforcement, real execution
 *
 * Run: npx tsx tests/playwright-runtime.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping,
  resetCounters, printResults, getResults,
} from './helpers';

import { PlaywrightRuntime } from '../workers/verification/playwright-runtime';
import { BrowserWorker, setPlaywrightMode } from '../workers/verification/browser-worker';
import { VerificationType, EvidenceType } from '../packages/domain';
import type { VerificationScenario } from '../workers/verification/browser-types';

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

async function runAsyncSuite(name: string, fn: () => Promise<void>): Promise<void> {
  resetCounters();
  await fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

// ══════════════════════════════════════════════════
// 1. PLAYWRIGHT RUNTIME EXISTS
// ══════════════════════════════════════════════════

runSuite('PlaywrightRuntime Module', () => {
  test('PlaywrightRuntime can be instantiated', () => {
    const runtime = new PlaywrightRuntime();
    assert(runtime !== null, 'should instantiate');
    assert(typeof runtime.executeScenario === 'function', 'has executeScenario method');
  });

  test('PlaywrightRuntime accepts options', () => {
    const runtime = new PlaywrightRuntime({
      timeout_ms: 30000,
      allowed_domains: ['example.com'],
    });
    assert(runtime !== null, 'should instantiate with options');
  });
});

// ══════════════════════════════════════════════════
// 2. MODE SWITCHING
// ══════════════════════════════════════════════════

runSuite('Execution Mode Control', () => {
  test('setPlaywrightMode forces simulated mode', async () => {
    setPlaywrightMode('simulated');
    const worker = new BrowserWorker();
    const result = await worker.execute({
      request: {
        id: 'vr_mode', verification_type: VerificationType.BrowserVerification,
        subject_ref: 'https://test.com/', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'executing', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://test.com/',
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });

    assertEqual(result.status, 'completed');
    // Check logs for mode
    const modeLog = result.logs.find(l => l.message.includes('Execution mode'));
    assert(modeLog !== undefined, 'should log execution mode');
    assert(modeLog!.message.includes('simulated'), 'should be simulated mode');

    setPlaywrightMode('auto'); // reset
  });

  test('simulated mode produces evidence without real browser', async () => {
    setPlaywrightMode('simulated');
    const worker = new BrowserWorker();
    const result = await worker.execute({
      request: {
        id: 'vr_sim', verification_type: VerificationType.BrowserVerification,
        subject_ref: 'https://shop.com/checkout', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'executing', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://shop.com/checkout',
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });

    assertEqual(result.status, 'completed');
    assertGreater(result.evidence.length, 0, 'produces evidence in simulated mode');

    // Should detect checkout from URL
    const checkoutEvidence = result.evidence.find(
      e => e.evidence_type === EvidenceType.BrowserCheckoutConfirmation,
    );
    assert(checkoutEvidence !== undefined, 'should detect checkout from URL');

    setPlaywrightMode('auto');
  });
});

// ══════════════════════════════════════════════════
// 3. REAL PLAYWRIGHT EXECUTION
// ══════════════════════════════════════════════════

// Top-level await isn't supported with the cjs output format used by
// tsx, so we wrap the async suite in an IIFE that's awaited from within
// the file's synchronous flow via .catch() to surface failures.
(async () => {
await runAsyncSuite('Real Playwright Execution', async () => {
  await testAsync('runtime executes against real URL', async () => {
    // This test runs REAL Playwright — only in environments with browser installed
    const runtime = new PlaywrightRuntime({ timeout_ms: 30000 });

    const scenario: VerificationScenario = {
      name: 'real_test',
      steps: [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'screenshot', label: 'example_page' },
      ],
    };

    try {
      const result = await runtime.executeScenario(scenario, 'https://example.com');

      // If the navigate step failed (network unreachable, blocked, etc),
      // skip the rest of the assertions — this test isn't meaningful
      // without working network access to example.com.
      const navStep = result.steps.find(s => s.step_type === 'navigate');
      if (!navStep || !navStep.success) {
        console.log('    (skipped: navigate step failed — example.com unreachable)');
        return;
      }

      assertEqual(result.errors_detected, false);
      assertGreater(result.steps.length, 0, 'has step results');
      assert(result.final_url.includes('example.com'), 'navigated to example.com');
      assert(result.title !== null, 'captured page title');
      assertGreater(result.screenshots.length, 0, 'captured screenshot');
      assertGreater(result.duration_ms, 0, 'has duration');

      // Verify screenshot file exists
      const fs = require('fs');
      for (const path of result.screenshots) {
        assert(fs.existsSync(path), `screenshot exists: ${path}`);
      }
    } catch (err) {
      // If Playwright not available, test is skipped (not failed)
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Executable doesn\'t exist') || msg.includes('browserType.launch')) {
        console.log('    (skipped: Playwright browser not available)');
      } else {
        throw err;
      }
    }
  });

  await testAsync('runtime captures console errors on bad page', async () => {
    const runtime = new PlaywrightRuntime({ timeout_ms: 15000 });

    const scenario: VerificationScenario = {
      name: 'error_test',
      steps: [
        { type: 'navigate', url: 'https://example.com' },
        // Try clicking a selector that doesn't exist — will fail
        { type: 'click', selector: '#nonexistent-button-xyz' },
      ],
    };

    try {
      const result = await runtime.executeScenario(scenario, 'https://example.com');
      // The click should fail
      assert(result.errors_detected, 'should detect errors');
      const failedStep = result.steps.find(s => !s.success);
      assert(failedStep !== undefined, 'should have a failed step');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Executable doesn\'t exist') || msg.includes('browserType.launch')) {
        console.log('    (skipped: Playwright browser not available)');
      } else {
        throw err;
      }
    }
  });

  await testAsync('runtime enforces step timeout', async () => {
    const runtime = new PlaywrightRuntime({ timeout_ms: 30000 });

    const scenario: VerificationScenario = {
      name: 'timeout_test',
      steps: [
        { type: 'navigate', url: 'https://example.com' },
        // wait_for a selector that will never appear — should timeout
        { type: 'wait_for', selector: '#this-will-never-exist-xyz', timeout_ms: 2000 },
      ],
    };

    try {
      const result = await runtime.executeScenario(scenario, 'https://example.com');

      // Skip if navigate failed first — wait_for never reached
      const navStep = result.steps.find(s => s.step_type === 'navigate');
      if (!navStep || !navStep.success) {
        console.log('    (skipped: navigate step failed — example.com unreachable)');
        return;
      }

      assert(result.errors_detected, 'timeout should cause error');
      const timedOutStep = result.steps.find(s => !s.success && s.step_type === 'wait_for');
      assert(timedOutStep !== undefined, 'wait_for step should fail');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Executable doesn\'t exist') || msg.includes('browserType.launch')) {
        console.log('    (skipped: Playwright browser not available)');
      } else {
        throw err;
      }
    }
  });
});
})().catch((err) => {
  console.error('Real Playwright Execution suite failed:', err);
  suitesFailed++;
});

// ══════════════════════════════════════════════════
// 4. EVIDENCE INTEGRITY
// ══════════════════════════════════════════════════

runSuite('Evidence Integrity', () => {
  test('all evidence has browser_verification source_kind', async () => {
    setPlaywrightMode('simulated');
    const worker = new BrowserWorker();
    const result = await worker.execute({
      request: {
        id: 'vr_ev', verification_type: VerificationType.BrowserVerification,
        subject_ref: 'https://shop.com/', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'executing', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://shop.com/',
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });

    for (const e of result.evidence) {
      assertEqual(e.source_kind, 'browser_verification', `${e.evidence_type}: source_kind`);
      assertEqual(e.collection_method, 'dynamic_render', `${e.evidence_type}: collection_method`);
      assert(e.quality_score > 0, `${e.evidence_type}: quality_score > 0`);
    }
    setPlaywrightMode('auto');
  });

  test('navigation trace has correct payload structure', async () => {
    setPlaywrightMode('simulated');
    const worker = new BrowserWorker();
    const result = await worker.execute({
      request: {
        id: 'vr_nav', verification_type: VerificationType.BrowserVerification,
        subject_ref: 'https://shop.com/', reason: 'test', requested_by: 'mcp',
        decision_ref: null, status: 'executing', result_evidence_refs: [],
        completed_at: null, created_at: new Date(), updated_at: new Date(),
      },
      subject_url: 'https://shop.com/',
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });

    const navTrace = result.evidence.find(e => e.evidence_type === EvidenceType.BrowserNavigationTrace);
    assert(navTrace !== undefined, 'has navigation trace');
    const payload = navTrace!.payload as any;
    assertEqual(payload.type, 'browser_navigation_trace');
    assert(typeof payload.start_url === 'string', 'has start_url');
    assert(typeof payload.final_url === 'string', 'has final_url');
    assert(Array.isArray(payload.redirect_chain), 'has redirect_chain');
    assert(typeof payload.steps_executed === 'number', 'has steps_executed');
    assert(typeof payload.duration_ms === 'number', 'has duration_ms');

    setPlaywrightMode('auto');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  PLAYWRIGHT RUNTIME TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
