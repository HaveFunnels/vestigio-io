/**
 * Vestigio V2 — Chargeback Resilience Pack Test Suite
 * Run: npx tsx tests/chargeback.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testSignal, testInference,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  formEvidence, scriptEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { DecisionClass, SignalCategory } from '../packages/domain';
import { buildGraph } from '../packages/graph';
import { extractSignals } from '../packages/signals';
import { computeInferences } from '../packages/inference';
import { produceDecision } from '../packages/decision';
import { deriveActions } from '../packages/actions';
import { createChargebackWorkspace } from '../packages/workspace';
import { recomputeAll } from '../packages/workspace';

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
const cycleRef = 'audit_cycle:cycle_1';

// ══════════════════════════════════════════════════
// 1. CHARGEBACK SIGNALS
// ══════════════════════════════════════════════════

runSuite('Chargeback Signals', () => {
  test('contact_method_present=false when no contact evidence', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'contact_method_present');
    assert(sig !== undefined, 'contact signal should exist');
    assertEqual(sig!.value, 'false');
  });

  test('no_contact_method fires when no channels detected', () => {
    const evidence = [pageContentEvidence('https://shop.com/')];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'no_contact_method');
    assert(sig !== undefined, 'no_contact signal should exist');
  });

  test('refund_policy_accessible=false when no refund policy', () => {
    const evidence = [
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
      policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'refund_policy_accessible');
    assert(sig !== undefined, 'refund accessible signal should exist');
    assertEqual(sig!.value, 'false');
  });

  test('refund_policy_accessible=true when refund policy present', () => {
    const evidence = [
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
      policyEvidence('https://shop.com/', 'https://shop.com/refund', 'refund'),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'refund_policy_accessible');
    assertEqual(sig!.value, 'true');
  });

  test('pricing_not_visible fires when checkout exists but no pricing page', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'pricing_not_visible');
    assert(sig !== undefined, 'pricing signal should exist');
  });
});

// ══════════════════════════════════════════════════
// 2. CHARGEBACK INFERENCES
// ══════════════════════════════════════════════════

runSuite('Chargeback Inferences', () => {
  test('refund_policy_gap when no refund policy + checkout exists', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'embedded' }),
      testSignal({ signal_key: 'policy_refund_present', attribute: 'policy.refund.present', value: 'false' }),
      testSignal({ signal_key: 'refund_policy_accessible', attribute: 'chargeback.refund_policy_accessible', value: 'false' }),
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'weak' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'refund_policy_gap');
    assert(inf !== undefined, 'refund_policy_gap should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('support_unreachable when no contact method', () => {
    const signals = [
      testSignal({ signal_key: 'no_contact_method', attribute: 'support.no_contact', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'support_unreachable');
    assert(inf !== undefined, 'support_unreachable should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('expectation_misalignment when pricing not visible + off-domain checkout', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'pricing_not_visible', attribute: 'chargeback.pricing_not_visible', value: 'true' }),
      testSignal({ signal_key: 'checkout_off_domain', attribute: 'checkout.off_domain', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'expectation_misalignment');
    assert(inf !== undefined, 'expectation_misalignment should exist');
    assert(['high', 'medium'].includes(inf!.conclusion_value), 'should be high or medium');
  });

  test('dispute_risk_elevated aggregates multiple factors', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'policy_refund_present', attribute: 'policy.refund.present', value: 'false' }),
      testSignal({ signal_key: 'no_contact_method', attribute: 'support.no_contact', value: 'true' }),
      testSignal({ signal_key: 'trust_boundary_crossed', attribute: 'trust.boundary_crossed', value: 'true' }),
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'weak' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'dispute_risk_elevated');
    assert(inf !== undefined, 'dispute_risk should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('no chargeback inferences without checkout', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_detected', attribute: 'checkout.detected', value: 'false' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const chargebackInfs = inferences.filter(i => [
      'refund_policy_gap', 'expectation_misalignment', 'dispute_risk_elevated',
    ].includes(i.inference_key));
    assertEqual(chargebackInfs.length, 0, 'no chargeback inferences without checkout');
  });

  test('all chargeback inferences have reasoning', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'policy_refund_present', attribute: 'policy.refund.present', value: 'false' }),
      testSignal({ signal_key: 'no_contact_method', attribute: 'support.no_contact', value: 'true' }),
      testSignal({ signal_key: 'pricing_not_visible', attribute: 'chargeback.pricing_not_visible', value: 'true' }),
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'weak' }),
      testSignal({ signal_key: 'refund_policy_accessible', attribute: 'chargeback.refund_policy_accessible', value: 'false' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    for (const inf of inferences) {
      assert(inf.reasoning.length > 0, `${inf.inference_key} must have reasoning`);
    }
  });
});

// ══════════════════════════════════════════════════
// 3. CHARGEBACK DECISIONS
// ══════════════════════════════════════════════════

runSuite('Chargeback Decisions', () => {
  test('chargeback_resilience_strong when no risk', () => {
    const { decision } = produceDecision({
      question_key: 'is_chargeback_pressure_elevated',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assertEqual(decision.decision_key, 'chargeback_resilience_strong');
    assertEqual(decision.category, DecisionClass.State);
  });

  test('moderate_or_high_chargeback_risk when multiple high-severity inferences', () => {
    // Chargeback inferences + additional risk from trust/policy inferences
    const inferences = [
      testInference({ inference_key: 'refund_policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'support_unreachable', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'dispute_risk_elevated', conclusion_value: 'high', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'expectation_misalignment', conclusion_value: 'high', severity_hint: 'high', confidence: 65 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_chargeback_pressure_elevated',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    assert(
      ['high_chargeback_risk', 'moderate_chargeback_risk'].includes(decision.decision_key),
      `should detect chargeback risk, got: ${decision.decision_key}`,
    );
    assertEqual(decision.category, DecisionClass.Risk);
  });

  test('decision has meaningful primary action', () => {
    const { decision } = produceDecision({
      question_key: 'is_chargeback_pressure_elevated',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assert(decision.actions.primary.length > 10, 'should have meaningful action');
  });

  test('chargeback decision is independent from scale/revenue', () => {
    const inferences = [
      testInference({ inference_key: 'refund_policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 75 }),
    ];
    const scale = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 3, is_production: true,
    });
    const chargeback = produceDecision({
      question_key: 'is_chargeback_pressure_elevated',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 3, is_production: true,
    });
    assert(scale.decision.decision_key !== chargeback.decision.decision_key,
      'different packs should produce different decisions');
  });
});

// ══════════════════════════════════════════════════
// 4. CHARGEBACK WORKSPACE
// ══════════════════════════════════════════════════

runSuite('Chargeback Workspace', () => {
  test('workspace has risk factors from inferences', () => {
    const inferences = [
      testInference({ inference_key: 'refund_policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70, reasoning: 'Missing refund policy' }),
      testInference({ inference_key: 'support_unreachable', conclusion_value: 'medium', severity_hint: 'medium', confidence: 60, reasoning: 'No contact method' }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_chargeback_pressure_elevated',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createChargebackWorkspace(
      { name: 'CB', scoping, landing_url: 'https://shop.com', cycle_ref: cycleRef },
      decision, actions, inferences,
    );
    assertGreater(ws.context.risk_factors.length, 0, 'should have risk factors');
    assertGreater(ws.summary.where_disputes_happen.length, 0, 'should say where disputes happen');
  });

  test('clean workspace has no risk factors', () => {
    const { decision } = produceDecision({
      question_key: 'is_chargeback_pressure_elevated',
      scoping, cycle_ref: cycleRef, signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createChargebackWorkspace(
      { name: 'CB', scoping, landing_url: 'https://clean.com', cycle_ref: cycleRef },
      decision, actions, [],
    );
    assertEqual(ws.context.risk_factors.length, 0);
    assertEqual(ws.context.risk_level, 'none');
  });
});

// ══════════════════════════════════════════════════
// 5. MULTI-PACK COEXISTENCE
// ══════════════════════════════════════════════════

runSuite('Chargeback Multi-Pack', () => {
  test('recomputeAll includes chargeback pack', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    assert(result.chargeback_resilience !== undefined, 'should have chargeback pack');
    assert(result.chargeback_resilience.decision.question_key === 'is_chargeback_pressure_elevated',
      'should answer chargeback question');
  });

  test('three packs coexist without conflict', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // All three packs should produce valid decisions
    assert(result.scale_readiness.decision.decision_key !== '', 'scale decision exists');
    assert(result.revenue_integrity.decision.decision_key !== '', 'revenue decision exists');
    assert(result.chargeback_resilience.decision.decision_key !== '', 'chargeback decision exists');

    // All three should answer different questions
    const questions = new Set([
      result.scale_readiness.decision.question_key,
      result.revenue_integrity.decision.question_key,
      result.chargeback_resilience.decision.question_key,
    ]);
    assertEqual(questions.size, 3, 'each pack answers a different question');
  });

  test('chargeback root causes map into intelligence layer', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Intelligence should include chargeback-related root causes
    const cbPacks = result.intelligence.root_causes.filter(
      rc => rc.affected_packs.includes('chargeback_resilience_pack'),
    );
    assertGreater(cbPacks.length, 0, 'should have root causes affecting chargeback pack');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  CHARGEBACK TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
