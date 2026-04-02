/**
 * Vestigio V2 — Browser Verification Test Suite
 * Tests: request validation, credit system, worker execution,
 *        evidence creation, plan gating, cost estimation
 *
 * Run: npx tsx tests/browser-verification.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, pageContentEvidence, checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  BrowserVerificationRequest,
  VerificationScenario,
  estimateVerificationCost,
  validateBrowserRequest,
  BROWSER_LIMITS,
} from '../workers/verification/browser-types';
import { BrowserWorker } from '../workers/verification/browser-worker';
import {
  getCreditBalance, canAffordVerification, consumeCredits,
  addPurchasedCredits, resetAllCredits,
} from '../apps/platform/credits';
import { VerificationType, EvidenceType } from '../packages/domain';
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

const scope: McpRequestScope = { workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1' };

function standardEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  ];
}

function sampleRequest(): BrowserVerificationRequest {
  return {
    type: 'browser_verification',
    subject_ref: 'website:shop.com',
    environment_ref: 'environment:env_1',
    target: { url: 'https://shop.com/checkout', intent: 'checkout' },
    scenarios: [{
      name: 'checkout_flow',
      steps: [
        { type: 'navigate', url: 'https://shop.com/checkout' },
        { type: 'screenshot', label: 'checkout_page' },
        { type: 'wait_for', selector: '.checkout-form' },
        { type: 'screenshot', label: 'after_form_load' },
      ],
    }],
    priority: 'high',
  };
}

// ══════════════════════════════════════════════════
// 1. REQUEST VALIDATION
// ══════════════════════════════════════════════════

runSuite('Request Validation', () => {
  test('valid request passes validation', () => {
    const error = validateBrowserRequest(sampleRequest());
    assertEqual(error, null);
  });

  test('empty scenarios rejected', () => {
    const req = { ...sampleRequest(), scenarios: [] };
    const error = validateBrowserRequest(req);
    assert(error !== null, 'should reject empty scenarios');
  });

  test('too many scenarios rejected', () => {
    const req = {
      ...sampleRequest(),
      scenarios: Array.from({ length: BROWSER_LIMITS.max_scenarios + 1 }, (_, i) => ({
        name: `scenario_${i}`,
        steps: [{ type: 'navigate' as const, url: 'https://shop.com' }],
      })),
    };
    const error = validateBrowserRequest(req);
    assert(error !== null, 'should reject too many scenarios');
  });

  test('too many steps rejected', () => {
    const req = {
      ...sampleRequest(),
      scenarios: [{
        name: 'big',
        steps: Array.from({ length: BROWSER_LIMITS.max_steps_per_run + 1 }, () => ({
          type: 'click' as const, selector: '.btn',
        })),
      }],
    };
    const error = validateBrowserRequest(req);
    assert(error !== null, 'should reject too many steps');
  });

  test('missing URL rejected', () => {
    const req = { ...sampleRequest(), target: { url: '', intent: 'checkout' as const } };
    const error = validateBrowserRequest(req);
    assert(error !== null, 'should reject empty URL');
  });
});

// ══════════════════════════════════════════════════
// 2. COST ESTIMATION
// ══════════════════════════════════════════════════

runSuite('Cost Estimation', () => {
  test('estimates cost for scenarios', () => {
    const cost = estimateVerificationCost(sampleRequest().scenarios);
    assertGreater(cost.base_cost, 0, 'has base cost');
    assertGreater(cost.step_cost, 0, 'has step cost');
    assertGreater(cost.screenshot_cost, 0, 'has screenshot cost');
    assertGreater(cost.total_estimated, 0, 'has total');
    assertEqual(cost.total_estimated, cost.base_cost + cost.step_cost + cost.screenshot_cost);
  });

  test('more steps = higher cost', () => {
    const small: VerificationScenario[] = [{
      name: 'small', steps: [{ type: 'navigate', url: 'https://x.com' }],
    }];
    const large: VerificationScenario[] = [{
      name: 'large', steps: [
        { type: 'navigate', url: 'https://x.com' },
        { type: 'click', selector: '.a' },
        { type: 'click', selector: '.b' },
        { type: 'screenshot', label: 'test' },
      ],
    }];
    const costSmall = estimateVerificationCost(small);
    const costLarge = estimateVerificationCost(large);
    assert(costLarge.total_estimated > costSmall.total_estimated, 'larger = more expensive');
  });
});

// ══════════════════════════════════════════════════
// 3. CREDIT SYSTEM
// ══════════════════════════════════════════════════

runSuite('Credit System', () => {
  test('vestigio plan has zero credits', () => {
    resetAllCredits();
    const balance = getCreditBalance('org_1', 'vestigio');
    assertEqual(balance.plan_included, 0);
    assertEqual(balance.available, 0);
  });

  test('pro plan has included credits', () => {
    resetAllCredits();
    const balance = getCreditBalance('org_1', 'pro');
    assertGreater(balance.plan_included, 0);
    assertEqual(balance.available, balance.plan_included);
  });

  test('max plan has most credits', () => {
    resetAllCredits();
    const pro = getCreditBalance('org_1', 'pro');
    const max = getCreditBalance('org_1', 'max');
    assert(max.plan_included > pro.plan_included, 'max > pro credits');
  });

  test('vestigio cannot afford any verification', () => {
    resetAllCredits();
    const check = canAffordVerification('org_1', 'vestigio', 5);
    assertEqual(check.allowed, false);
    assert(check.message!.includes('Pro or Max'), 'should suggest upgrade');
  });

  test('pro can afford within limit', () => {
    resetAllCredits();
    const check = canAffordVerification('org_1', 'pro', 10);
    assertEqual(check.allowed, true);
  });

  test('pro blocked when exceeding credits', () => {
    resetAllCredits();
    const balance = getCreditBalance('org_1', 'pro');
    const check = canAffordVerification('org_1', 'pro', balance.plan_included + 100);
    assertEqual(check.allowed, false);
    assert(check.message!.includes('Max'), 'pro should suggest Max upgrade');
  });

  test('max can purchase additional credits', () => {
    resetAllCredits();
    const balance = getCreditBalance('org_1', 'max');
    addPurchasedCredits('org_1', 500);
    const newBalance = getCreditBalance('org_1', 'max');
    assertEqual(newBalance.available, balance.plan_included + 500);
  });

  test('consumeCredits reduces balance', () => {
    resetAllCredits();
    addPurchasedCredits('org_1', 100);
    consumeCredits('org_1', 30);
    const balance = getCreditBalance('org_1', 'max');
    assertEqual(balance.consumed, 30);
    assertEqual(balance.available, balance.plan_included + 100 - 30);
  });
});

// ══════════════════════════════════════════════════
// 4. BROWSER WORKER EXECUTION
// ══════════════════════════════════════════════════

runSuite('Browser Worker', () => {
  test('worker executes and produces evidence', async () => {
    const worker = new BrowserWorker();
    const scoping = testScoping();

    const result = await worker.execute({
      request: {
        id: 'vr_1',
        verification_type: VerificationType.BrowserVerification,
        subject_ref: 'https://shop.com/checkout',
        reason: 'Low confidence checkout decision',
        requested_by: 'mcp',
        decision_ref: null,
        status: 'executing',
        result_evidence_refs: [],
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      subject_url: 'https://shop.com/checkout',
      scoping,
      cycle_ref: 'audit_cycle:c1',
      existing_evidence: [],
    });

    assertEqual(result.status, 'completed');
    assertGreater(result.evidence.length, 0, 'should produce evidence');
  });

  test('evidence includes navigation trace', async () => {
    const worker = new BrowserWorker();
    const result = await worker.execute({
      request: {
        id: 'vr_2', verification_type: VerificationType.BrowserVerification,
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
    assert(navTrace !== undefined, 'should have navigation trace evidence');
    assertEqual((navTrace!.payload as any).type, 'browser_navigation_trace');
  });

  test('evidence has correct source_kind', async () => {
    const worker = new BrowserWorker();
    const result = await worker.execute({
      request: {
        id: 'vr_3', verification_type: VerificationType.BrowserVerification,
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
    }
  });
});

// ══════════════════════════════════════════════════
// 5. MCP VERIFICATION INTEGRATION
// ══════════════════════════════════════════════════

runSuite('MCP Verification Integration', () => {
  test('MCP server can execute browser verification', async () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, 'audit_cycle:c1', 'shop.com', 'https://shop.com/');

    // Create and execute verification
    const createResult = server.callTool('request_verification', {
      verification_type: 'browser_verification',
      subject_ref: 'https://shop.com/checkout',
      reason: 'Confirm checkout flow',
    });

    assertEqual(createResult.type, 'verification_request');
  });

  test('browser verification in orchestrator produces evidence', async () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, 'audit_cycle:c1', 'shop.com', 'https://shop.com/');

    // Submit + execute
    const result = await server.verify({
      verification_type: 'browser_verification',
      subject_ref: 'https://shop.com/checkout',
      reason: 'Verify checkout flow integrity',
    });

    assertEqual(result.type, 'verification_status');
    // The browser worker should have produced evidence and updated context
    assert(result.data !== null, 'should have verification status');
  });
});

// ══════════════════════════════════════════════════
// 6. PLAN GATING
// ══════════════════════════════════════════════════

runSuite('Plan Gating', () => {
  test('vestigio plan cannot verify', () => {
    resetAllCredits();
    const check = canAffordVerification('org_gate', 'vestigio', 1);
    assertEqual(check.allowed, false);
  });

  test('pro plan can verify within credits', () => {
    resetAllCredits();
    const check = canAffordVerification('org_gate', 'pro', 10);
    assertEqual(check.allowed, true);
  });

  test('max plan can verify + buy more', () => {
    resetAllCredits();
    addPurchasedCredits('org_gate', 1000);
    const check = canAffordVerification('org_gate', 'max', 500);
    assertEqual(check.allowed, true);
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  BROWSER VERIFICATION TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
