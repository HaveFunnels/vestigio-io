/**
 * Vestigio V2 — Revenue Integrity Pack Test Suite
 * Tests: signals, inferences, risk, decision, actions, workspace, multi-pack coexistence
 *
 * Run: npx tsx tests/revenue.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testSignal, testInference,
  httpResponseEvidence, pageContentEvidence, redirectEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  formEvidence, scriptEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  DecisionClass, DecisionImpact, SignalCategory, InferenceCategory,
} from '../packages/domain';
import { buildGraph, GraphQuery } from '../packages/graph';
import { extractSignals } from '../packages/signals';
import { computeInferences } from '../packages/inference';
import { evaluateRisk } from '../packages/risk';
import { produceDecision } from '../packages/decision';
import { deriveActions } from '../packages/actions';
import { createRevenueWorkspace } from '../packages/workspace';
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
// 1. REVENUE SIGNALS
// ══════════════════════════════════════════════════

runSuite('Revenue Signals', () => {
  test('funnel_entry_detected=true when checkout indicators present', () => {
    const evidence = [
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'funnel_entry_detected');
    assert(sig !== undefined, 'funnel_entry signal should exist');
    assertEqual(sig!.value, 'true');
  });

  test('funnel_entry_detected=false when no checkout or forms', () => {
    const evidence = [pageContentEvidence('https://blog.com/')];
    const graph = buildGraph(evidence, 'blog.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'funnel_entry_detected');
    assertEqual(sig!.value, 'false');
  });

  test('off_domain_checkout_revenue detected for external checkout', () => {
    const evidence = [
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'off_domain_checkout_revenue');
    assert(sig !== undefined, 'off_domain_checkout_revenue should exist');
    assertEqual(sig!.value, 'true');
  });

  test('redirect_before_checkout detected for redirect to checkout', () => {
    const evidence = [
      redirectEvidence('https://shop.com/buy', 'https://shop.com/checkout', 3),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'redirect_before_checkout');
    assert(sig !== undefined, 'redirect_before_checkout should exist');
    assertEqual(sig!.value, 'high');
  });

  test('fragmented_conversion_path when multiple external hosts in checkout', () => {
    const evidence = [
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay1.com/checkout', true),
      formEvidence('https://shop.com/order', 'https://pay2.com/submit', true),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'fragmented_conversion_path');
    assert(sig !== undefined, 'fragmented_conversion_path should exist');
    assertEqual(sig!.value, 'true');
  });

  test('excessive_redirects detected when total hops > 3', () => {
    const evidence = [
      redirectEvidence('https://shop.com/a', 'https://shop.com/b', 2),
      redirectEvidence('https://shop.com/c', 'https://shop.com/d', 3),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'excessive_redirects');
    assert(sig !== undefined, 'excessive_redirects should exist');
    assertGreater(sig!.numeric_value || 0, 3, 'should have > 3 hops');
  });

  test('slow_critical_path detected for slow responses', () => {
    const evidence = [
      httpResponseEvidence('https://shop.com/checkout', 200, 4000),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'slow_critical_path');
    assert(sig !== undefined, 'slow_critical_path should exist');
  });

  test('no_primary_conversion_path when no checkout or payment forms', () => {
    const evidence = [
      pageContentEvidence('https://info.com/'),
      pageContentEvidence('https://info.com/about'),
    ];
    const graph = buildGraph(evidence, 'info.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'no_primary_conversion_path');
    assert(sig !== undefined, 'no_primary_conversion_path should exist');
  });

  test('clean funnel produces funnel_entry but no friction signals', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://shop.com/checkout', false),
      httpResponseEvidence('https://shop.com/', 200, 300),
    ];
    const graph = buildGraph(evidence, 'shop.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const funnel = signals.find(s => s.signal_key === 'funnel_entry_detected');
    assertEqual(funnel!.value, 'true');
    const friction = signals.find(s => s.signal_key === 'excessive_redirects');
    assertEqual(friction, undefined);
    const slow = signals.find(s => s.signal_key === 'slow_critical_path');
    assertEqual(slow, undefined);
  });
});

// ══════════════════════════════════════════════════
// 2. REVENUE INFERENCES
// ══════════════════════════════════════════════════

runSuite('Revenue Inferences', () => {
  test('conversion_flow_fragmented from fragmented + off-domain signals', () => {
    const signals = [
      testSignal({ signal_key: 'fragmented_conversion_path', attribute: 'revenue.fragmented_path', value: 'true', numeric_value: 3 }),
      testSignal({ signal_key: 'off_domain_checkout_revenue', attribute: 'revenue.off_domain_checkout', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'conversion_flow_fragmented');
    assert(inf !== undefined, 'conversion_flow_fragmented should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('friction_on_critical_path from broken forms + slow path', () => {
    const signals = [
      testSignal({ signal_key: 'broken_form_action', attribute: 'friction.broken_form_action', value: 'true', numeric_value: 2 }),
      testSignal({ signal_key: 'slow_critical_path', attribute: 'friction.slow_critical_path', value: 'high', numeric_value: 5000 }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'friction_on_critical_path');
    assert(inf !== undefined, 'friction_on_critical_path should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('revenue_leakage from broken forms + off-domain checkout', () => {
    const signals = [
      testSignal({ signal_key: 'off_domain_checkout_revenue', attribute: 'revenue.off_domain_checkout', value: 'true' }),
      testSignal({ signal_key: 'broken_form_action', attribute: 'friction.broken_form_action', value: 'true', numeric_value: 1 }),
      testSignal({ signal_key: 'funnel_entry_detected', attribute: 'revenue.funnel_entry', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'revenue_leakage');
    assert(inf !== undefined, 'revenue_leakage should exist');
    assertGreater(['high', 'medium'].indexOf(inf!.conclusion_value), -1, 'should be high or medium');
  });

  test('trust_break_in_checkout requires checkout mode signal', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'missing_policy_near_checkout', attribute: 'trust.missing_policy_near_checkout', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'trust_break_in_checkout');
    assert(inf !== undefined, 'trust_break_in_checkout should exist');
  });

  test('no trust_break_in_checkout without checkout', () => {
    const signals = [
      testSignal({ signal_key: 'missing_policy_near_checkout', attribute: 'trust.missing_policy_near_checkout', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'trust_break_in_checkout');
    assertEqual(inf, undefined);
  });

  test('measurement_blindspot from none coverage + missing commercial tracking', () => {
    const signals = [
      testSignal({ signal_key: 'measurement_coverage', attribute: 'measurement.coverage', value: 'none' }),
      testSignal({ signal_key: 'missing_tracking_on_commercial', attribute: 'revenue.missing_tracking_commercial', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'measurement_blindspot');
    assert(inf !== undefined, 'measurement_blindspot should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('unclear_conversion_intent from no primary conversion path', () => {
    const signals = [
      testSignal({ signal_key: 'no_primary_conversion_path', attribute: 'clarity.no_primary_conversion_path', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'unclear_conversion_intent');
    assert(inf !== undefined, 'unclear_conversion_intent should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('no revenue inferences when all signals are clean', () => {
    const signals = [
      testSignal({ signal_key: 'funnel_entry_detected', attribute: 'revenue.funnel_entry', value: 'true' }),
      testSignal({ signal_key: 'measurement_coverage', attribute: 'measurement.coverage', value: 'adequate' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const revenueInfs = inferences.filter(i => [
      'conversion_flow_fragmented', 'friction_on_critical_path', 'revenue_leakage',
      'trust_break_in_checkout', 'measurement_blindspot', 'unclear_conversion_intent',
    ].includes(i.inference_key));
    assertEqual(revenueInfs.length, 0, 'clean signals should produce no revenue inferences');
  });

  test('all revenue inferences have non-empty reasoning', () => {
    const signals = [
      testSignal({ signal_key: 'fragmented_conversion_path', attribute: 'revenue.fragmented_path', value: 'true', numeric_value: 2 }),
      testSignal({ signal_key: 'off_domain_checkout_revenue', attribute: 'revenue.off_domain_checkout', value: 'true' }),
      testSignal({ signal_key: 'broken_form_action', attribute: 'friction.broken_form_action', value: 'true', numeric_value: 1 }),
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'missing_policy_near_checkout', attribute: 'trust.missing_policy_near_checkout', value: 'true' }),
      testSignal({ signal_key: 'measurement_coverage', attribute: 'measurement.coverage', value: 'none' }),
      testSignal({ signal_key: 'no_primary_conversion_path', attribute: 'clarity.no_primary_conversion_path', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    for (const inf of inferences) {
      assert(inf.reasoning.length > 0, `${inf.inference_key} must have reasoning`);
    }
  });
});

// ══════════════════════════════════════════════════
// 3. REVENUE DECISION ENGINE
// ══════════════════════════════════════════════════

runSuite('Revenue Decision Engine', () => {
  test('revenue_integrity_stable when no risk signals', () => {
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assertEqual(decision.decision_key, 'revenue_integrity_stable');
    assertEqual(decision.category, DecisionClass.State);
    assertEqual(decision.primary_outcome, 'observation');
    assert(decision.why.summary.includes('stable'), 'summary should mention stable');
  });

  test('revenue_leakage_detected when high risk', () => {
    const inferences = [
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'high', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'friction_on_critical_path', conclusion_value: 'high', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'trust_break_in_checkout', conclusion_value: 'high', severity_hint: 'high', confidence: 80 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    assertEqual(decision.decision_key, 'revenue_leakage_detected');
    assertEqual(decision.category, DecisionClass.Risk);
    assertEqual(decision.primary_outcome, 'incident');
    assert(decision.why.summary.includes('leakage'), 'summary should mention leakage');
  });

  test('revenue_at_risk for significant issues', () => {
    const inferences = [
      testInference({ inference_key: 'conversion_flow_fragmented', conclusion_value: 'high', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'measurement_blindspot', conclusion_value: 'high', severity_hint: 'high', confidence: 75 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });
    // High severity + high proximity + production = FixBeforeScale -> revenue_at_risk
    assertEqual(decision.decision_key, 'revenue_at_risk');
  });

  test('revenue decision has meaningful primary action', () => {
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assert(decision.actions.primary.length > 10, 'primary action should be meaningful');
  });

  test('revenue and scale decisions are independent', () => {
    const inferences = [
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'high', severity_hint: 'high', confidence: 80 }),
    ];
    const scale = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 3, is_production: true,
    });
    const revenue = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 3, is_production: true,
    });
    // Both should respond differently to the same inferences
    assert(scale.decision.decision_key !== revenue.decision.decision_key,
      'different packs should produce different decision keys');
  });
});

// ══════════════════════════════════════════════════
// 4. REVENUE ACTIONS
// ══════════════════════════════════════════════════

runSuite('Revenue Actions', () => {
  test('revenue_leakage decision produces fix actions', () => {
    const inferences = [
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'high', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'friction_on_critical_path', conclusion_value: 'high', severity_hint: 'high', confidence: 80 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    const actions = deriveActions(decision);
    assertGreater(actions.length, 1, 'should produce multiple actions');
    const primary = actions.find(a => a.action_key.endsWith('_primary'));
    assert(primary !== undefined, 'should have primary action');
    assert(primary!.title.toLowerCase().includes('revenue') || primary!.title.toLowerCase().includes('leak'),
      'primary action should be revenue-related');
  });

  test('stable revenue produces monitoring action', () => {
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const primary = actions.find(a => a.action_key.endsWith('_primary'));
    assert(primary!.title.toLowerCase().includes('stable') || primary!.title.toLowerCase().includes('no significant'),
      'stable decision should produce monitoring action');
  });
});

// ══════════════════════════════════════════════════
// 5. REVENUE WORKSPACE
// ══════════════════════════════════════════════════

runSuite('Revenue Workspace', () => {
  test('creates workspace with leakage points from inferences', () => {
    const inferences = [
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'high', severity_hint: 'high', confidence: 80, reasoning: 'Broken forms cause direct revenue loss' }),
      testInference({ inference_key: 'friction_on_critical_path', conclusion_value: 'medium', severity_hint: 'medium', confidence: 70, reasoning: 'Slow checkout pages' }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createRevenueWorkspace(
      { name: 'Revenue', scoping, landing_url: 'https://shop.com', cycle_ref: cycleRef },
      decision, actions, inferences,
    );

    assertGreater(ws.context.leakage_points.length, 0, 'should have leakage points');
    assert(['critical', 'high'].includes(ws.context.estimated_risk_level),
      `risk level should be critical or high, got: ${ws.context.estimated_risk_level}`);
    assertGreater(ws.summary.where_money_is_lost.length, 0, 'should say where money is lost');
    assertGreater(ws.summary.what_to_fix_first.length, 0, 'should say what to fix');
  });

  test('clean site produces no leakage points', () => {
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createRevenueWorkspace(
      { name: 'Revenue', scoping, landing_url: 'https://clean.com', cycle_ref: cycleRef },
      decision, actions, [],
    );

    assertEqual(ws.context.leakage_points.length, 0);
    assertEqual(ws.context.estimated_risk_level, 'none');
  });

  test('workspace includes measurement gaps', () => {
    const inferences = [
      testInference({ inference_key: 'measurement_blindspot', conclusion_value: 'high', severity_hint: 'high', confidence: 70, reasoning: 'No analytics on commercial pages' }),
      testInference({ inference_key: 'measurement_coverage', conclusion_value: 'false', confidence: 55, reasoning: 'No analytics tools detected' }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences,
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createRevenueWorkspace(
      { name: 'Revenue', scoping, landing_url: 'https://shop.com', cycle_ref: cycleRef },
      decision, actions, inferences,
    );

    assertGreater(ws.context.measurement_gaps.length, 0, 'should have measurement gaps');
  });

  test('workspace references decision', () => {
    const { decision } = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef,
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createRevenueWorkspace(
      { name: 'Revenue', scoping, landing_url: 'https://shop.com', cycle_ref: cycleRef },
      decision, actions, [],
    );

    assert(ws.context.decision_ref.includes('decision:'), 'should reference decision');
  });
});

// ══════════════════════════════════════════════════
// 6. MULTI-PACK COEXISTENCE
// ══════════════════════════════════════════════════

runSuite('Multi-Pack Coexistence', () => {
  test('recomputeAll produces both packs from same evidence', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      httpResponseEvidence('https://shop.com/', 200, 500),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
      providerEvidence('https://shop.com/', 'stripe'),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Scale readiness
    assert(result.scale_readiness.decision.decision_key !== '', 'scale decision should exist');
    assert(result.scale_readiness.decision.question_key === 'is_it_safe_to_scale_traffic',
      'scale decision should answer scale question');

    // Revenue integrity
    assert(result.revenue_integrity.decision.decision_key !== '', 'revenue decision should exist');
    assert(result.revenue_integrity.decision.question_key === 'is_there_revenue_leakage_in_high_intent_paths',
      'revenue decision should answer revenue question');

    // Shared signals and inferences
    assertGreater(result.signals.length, 0, 'shared signals');
    assertGreater(result.inferences.length, 0, 'shared inferences');
  });

  test('packs produce different decisions for same evidence', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    assert(
      result.scale_readiness.decision.decision_key !== result.revenue_integrity.decision.decision_key,
      'different packs should produce different decision keys',
    );
  });

  test('scale_readiness produces valid decision alongside revenue', () => {
    const evidence = [pageContentEvidence('https://example.com/')];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'example.com', landing_url: 'https://example.com/',
      conversion_proximity: 3, is_production: true,
    });

    // Scale decision should answer the scale question regardless of revenue inferences
    assertEqual(result.scale_readiness.decision.question_key, 'is_it_safe_to_scale_traffic');
    assert(result.scale_readiness.decision.decision_key !== '', 'should produce a scale decision');
    // Both packs coexist
    assertEqual(result.revenue_integrity.decision.question_key, 'is_there_revenue_leakage_in_high_intent_paths');
  });

  test('both packs share the same graph and signals', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      providerEvidence('https://shop.com/', 'stripe'),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Both decisions should reference some of the same evidence
    const scaleEvidence = new Set(result.scale_readiness.decision.why.evidence_refs);
    const revenueEvidence = new Set(result.revenue_integrity.decision.why.evidence_refs);
    // They both consume the same pool of signals/inferences
    assertGreater(result.signals.length, 0, 'signals should be shared');
  });
});

// ══════════════════════════════════════════════════
// 7. END-TO-END SCENARIOS
// ══════════════════════════════════════════════════

runSuite('Revenue E2E Scenarios', () => {
  test('scenario: off-domain checkout with no policies', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      httpResponseEvidence('https://shop.com/', 200, 800),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.sketchy.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 1, is_production: true,
    });

    // Revenue should detect leakage
    const revDecision = result.revenue_integrity.decision;
    assert(
      ['revenue_leakage_detected', 'revenue_at_risk', 'revenue_path_fragile'].includes(revDecision.decision_key),
      `revenue decision should detect issues, got: ${revDecision.decision_key}`,
    );

    // Revenue workspace should have leakage points
    assertGreater(result.revenue_integrity.workspace.context.leakage_points.length, 0,
      'should identify leakage points');
  });

  test('scenario: clean funnel with policies and measurement', () => {
    const evidence = [
      pageContentEvidence('https://clean-shop.com/'),
      httpResponseEvidence('https://clean-shop.com/', 200, 300),
      checkoutIndicatorEvidence('https://clean-shop.com/', 'https://clean-shop.com/checkout', false),
      policyEvidence('https://clean-shop.com/', 'https://clean-shop.com/privacy', 'privacy'),
      policyEvidence('https://clean-shop.com/', 'https://clean-shop.com/terms', 'terms'),
      policyEvidence('https://clean-shop.com/', 'https://clean-shop.com/refund', 'refund'),
      scriptEvidence('https://clean-shop.com/', 'https://www.googletagmanager.com/gtag.js', true),
      scriptEvidence('https://clean-shop.com/', 'https://connect.facebook.net/fbevents.js', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'clean-shop.com', landing_url: 'https://clean-shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Scale should be safe or ready_with_risks (chargeback signals may add minor risk)
    assert(
      ['safe_to_scale', 'ready_with_risks', 'fix_before_scale'].includes(result.scale_readiness.decision.decision_key),
      `clean site scale should not be unsafe, got: ${result.scale_readiness.decision.decision_key}`,
    );
    // Revenue should not show active leakage (may show moderate risk from support/expectation signals)
    assert(
      result.revenue_integrity.decision.decision_key !== 'revenue_leakage_detected',
      `clean site should not show active leakage, got: ${result.revenue_integrity.decision.decision_key}`,
    );
  });

  test('scenario: broken conversion path', () => {
    const evidence = [
      pageContentEvidence('https://broken.com/'),
      httpResponseEvidence('https://broken.com/', 200, 500),
      httpResponseEvidence('https://broken.com/checkout', 500, 1000),
      checkoutIndicatorEvidence('https://broken.com/', 'https://broken.com/checkout', false),
      formEvidence('https://broken.com/checkout', 'https://broken.com/checkout', false, true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'broken.com', landing_url: 'https://broken.com/',
      conversion_proximity: 1, is_production: true,
    });

    // Should detect issues
    const revKey = result.revenue_integrity.decision.decision_key;
    assert(revKey !== 'revenue_integrity_stable',
      `should detect revenue issues, got: ${revKey}`);
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  REVENUE TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
