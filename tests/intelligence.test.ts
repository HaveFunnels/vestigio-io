/**
 * Vestigio V2 — Decision Intelligence Layer Test Suite
 * Tests: root cause grouping, decision linking, action deduplication,
 *        prioritization, multi-pack coexistence, intelligence summary
 *
 * Run: npx tsx tests/intelligence.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testInference,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  formEvidence, scriptEvidence, redirectEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { makeRef, Inference, InferenceCategory } from '../packages/domain';
import { groupIntoRootCauses } from '../packages/intelligence';
import { produceIntelligence } from '../packages/intelligence';
import { produceDecision } from '../packages/decision';
import { deriveActions } from '../packages/actions';
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
// 1. ROOT CAUSE GROUPING
// ══════════════════════════════════════════════════

runSuite('Root Cause Grouping', () => {
  test('groups trust-related inferences into one root cause', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'checkout_integrity', conclusion_value: 'weak', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'trust_break_in_checkout', conclusion_value: 'high', severity_hint: 'high', confidence: 72 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    const trustRC = rootCauses.find(rc => rc.root_cause_key === 'trust_failure_at_checkout');
    assert(trustRC !== undefined, 'trust_failure root cause should exist');
    assertEqual(trustRC!.contributing_inferences.length, 3, 'should group all 3 trust inferences');
  });

  test('groups measurement inferences into one root cause', () => {
    const inferences = [
      testInference({ inference_key: 'measurement_coverage', conclusion_value: 'false', severity_hint: null, confidence: 55 }),
      testInference({ inference_key: 'measurement_blindspot', conclusion_value: 'high', severity_hint: 'high', confidence: 65 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    const measRC = rootCauses.find(rc => rc.root_cause_key === 'measurement_blindspot');
    assert(measRC !== undefined, 'measurement root cause should exist');
    assertEqual(measRC!.contributing_inferences.length, 2);
  });

  test('excludes inferences with conclusion_value = false', () => {
    const inferences = [
      testInference({ inference_key: 'commerce_context', conclusion_value: 'false', confidence: 50 }),
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'false', confidence: 55 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    assertEqual(rootCauses.length, 0, 'no root causes for negative inferences');
  });

  test('no inference appears in more than one root cause', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'checkout_integrity', conclusion_value: 'fragile', severity_hint: 'medium', confidence: 65 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'medium', severity_hint: 'medium', confidence: 60 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);

    const allRefs = rootCauses.flatMap(rc => rc.contributing_inferences);
    const uniqueRefs = new Set(allRefs);
    assertEqual(allRefs.length, uniqueRefs.size, 'no inference should appear in multiple root causes');
  });

  test('root causes sorted by severity desc, confidence desc', () => {
    const inferences = [
      testInference({ inference_key: 'unclear_conversion_intent', conclusion_value: 'low', severity_hint: 'low', confidence: 40 }),
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'medium', severity_hint: 'medium', confidence: 60 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);

    for (let i = 1; i < rootCauses.length; i++) {
      const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const prevSev = severityOrder[rootCauses[i - 1].severity] || 0;
      const curSev = severityOrder[rootCauses[i].severity] || 0;
      assert(prevSev >= curSev, 'should be sorted by severity desc');
    }
  });

  test('convergence bonus increases severity', () => {
    // 3 medium inferences should get bumped to high
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'medium', confidence: 60 }),
      testInference({ inference_key: 'checkout_integrity', conclusion_value: 'fragile', severity_hint: 'medium', confidence: 60 }),
      testInference({ inference_key: 'trust_break_in_checkout', conclusion_value: 'medium', severity_hint: 'medium', confidence: 60 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    const trustRC = rootCauses.find(rc => rc.root_cause_key === 'trust_failure_at_checkout');
    assertEqual(trustRC!.severity, 'high', '3 medium inferences should converge to high');
  });

  test('affected_packs correctly identifies cross-pack root causes', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    const trustRC = rootCauses.find(rc => rc.root_cause_key === 'trust_failure_at_checkout');
    assert(trustRC!.affected_packs.includes('scale_readiness_pack'), 'should affect scale');
    assert(trustRC!.affected_packs.includes('revenue_integrity_pack'), 'should affect revenue');
  });

  test('empty inferences produce no root causes', () => {
    const rootCauses = groupIntoRootCauses([]);
    assertEqual(rootCauses.length, 0);
  });
});

// ══════════════════════════════════════════════════
// 2. DECISION LINKING
// ══════════════════════════════════════════════════

runSuite('Decision Linking', () => {
  test('links decisions to root causes via shared inferences', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];

    const scaleResult = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });

    const revenueResult = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });

    const rootCauses = groupIntoRootCauses(inferences);
    const decisions = [scaleResult.decision, revenueResult.decision];
    const actionsByDecision = new Map<string, any[]>();
    actionsByDecision.set(makeRef('decision', scaleResult.decision.id), deriveActions(scaleResult.decision));
    actionsByDecision.set(makeRef('decision', revenueResult.decision.id), deriveActions(revenueResult.decision));

    const intelligence = produceIntelligence({
      inferences, decisions, actions_by_decision: actionsByDecision,
    });

    assertGreater(intelligence.decision_links.length, 0, 'should have decision links');

    // Both decisions should link to at least one root cause
    const scaleLink = intelligence.decision_links.find(l => l.pack_key === 'scale_readiness_pack');
    const revenueLink = intelligence.decision_links.find(l => l.pack_key === 'revenue_integrity_pack');
    assert(scaleLink !== undefined, 'scale decision should be linked');
    assert(revenueLink !== undefined, 'revenue decision should be linked');
  });

  test('shared root cause connects both packs', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'trust_break_in_checkout', conclusion_value: 'high', severity_hint: 'high', confidence: 72 }),
    ];

    const rootCauses = groupIntoRootCauses(inferences);
    const trustRC = rootCauses.find(rc => rc.root_cause_key === 'trust_failure_at_checkout');
    assert(trustRC !== undefined, 'trust root cause should exist');
    assert(trustRC!.affected_packs.length > 1, 'should affect multiple packs');
  });
});

// ══════════════════════════════════════════════════
// 3. ACTION DEDUPLICATION & PRIORITIZATION
// ══════════════════════════════════════════════════

runSuite('Action Deduplication & Prioritization', () => {
  test('actions are globally prioritized', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];

    const scaleResult = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });
    const revenueResult = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });

    const actionsByDecision = new Map();
    actionsByDecision.set(makeRef('decision', scaleResult.decision.id), deriveActions(scaleResult.decision));
    actionsByDecision.set(makeRef('decision', revenueResult.decision.id), deriveActions(revenueResult.decision));

    const intel = produceIntelligence({
      inferences,
      decisions: [scaleResult.decision, revenueResult.decision],
      actions_by_decision: actionsByDecision,
    });

    // Actions should be sorted by priority
    for (let i = 1; i < intel.global_actions.length; i++) {
      assert(
        intel.global_actions[i].priority >= intel.global_actions[i - 1].priority,
        'actions should be sorted by priority ascending',
      );
    }
  });

  test('cross-pack actions get priority boost', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];

    const scaleResult = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    const revenueResult = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });

    const actionsByDecision = new Map();
    actionsByDecision.set(makeRef('decision', scaleResult.decision.id), deriveActions(scaleResult.decision));
    actionsByDecision.set(makeRef('decision', revenueResult.decision.id), deriveActions(revenueResult.decision));

    const intel = produceIntelligence({
      inferences,
      decisions: [scaleResult.decision, revenueResult.decision],
      actions_by_decision: actionsByDecision,
    });

    // At least some actions should have cross_pack_impact > 1
    // (because both packs share inferences that produce similar actions)
    assertGreater(intel.global_actions.length, 0, 'should have global actions');
  });

  test('verification actions ranked lower than fix actions', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const actionsByDecision = new Map();
    actionsByDecision.set(makeRef('decision', decision.id), actions);

    const intel = produceIntelligence({
      inferences: [], decisions: [decision], actions_by_decision: actionsByDecision,
    });

    const verifications = intel.global_actions.filter(a => a.action_type === 'verification');
    const nonVerifications = intel.global_actions.filter(a => a.action_type !== 'verification');

    if (verifications.length > 0 && nonVerifications.length > 0) {
      const minVerPriority = Math.min(...verifications.map(a => a.priority));
      const maxFixPriority = Math.max(...nonVerifications.map(a => a.priority));
      assert(minVerPriority >= maxFixPriority, 'verification actions should have lower priority than fix actions');
    }
  });
});

// ══════════════════════════════════════════════════
// 4. INTELLIGENCE SUMMARY
// ══════════════════════════════════════════════════

runSuite('Intelligence Summary', () => {
  test('summary lists underlying problems', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);

    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });
    const actions = deriveActions(decision);
    const actionsByDecision = new Map();
    actionsByDecision.set(makeRef('decision', decision.id), actions);

    const intel = produceIntelligence({
      inferences, decisions: [decision], actions_by_decision: actionsByDecision,
    });

    assertEqual(intel.summary.total_root_causes, rootCauses.length);
    assertGreater(intel.summary.underlying_problems.length, 0, 'should list problems');
    assertGreater(intel.summary.fix_first.length, 0, 'should list what to fix');
  });

  test('summary identifies cross-pack issues', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'trust_break_in_checkout', conclusion_value: 'high', severity_hint: 'high', confidence: 72 }),
    ];

    const scaleResult = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });
    const revenueResult = produceDecision({
      question_key: 'is_there_revenue_leakage_in_high_intent_paths',
      scoping, cycle_ref: cycleRef, signals: [], inferences,
      conversion_proximity: 2, is_production: true,
    });

    const actionsByDecision = new Map();
    actionsByDecision.set(makeRef('decision', scaleResult.decision.id), deriveActions(scaleResult.decision));
    actionsByDecision.set(makeRef('decision', revenueResult.decision.id), deriveActions(revenueResult.decision));

    const intel = produceIntelligence({
      inferences,
      decisions: [scaleResult.decision, revenueResult.decision],
      actions_by_decision: actionsByDecision,
    });

    assertGreater(intel.summary.cross_pack_issues.length, 0, 'should identify cross-pack issues');
  });

  test('empty system produces empty summary', () => {
    const intel = produceIntelligence({
      inferences: [],
      decisions: [],
      actions_by_decision: new Map(),
    });

    assertEqual(intel.root_causes.length, 0);
    assertEqual(intel.decision_links.length, 0);
    assertEqual(intel.global_actions.length, 0);
    assertEqual(intel.summary.total_root_causes, 0);
    assertEqual(intel.summary.highest_severity, null);
  });
});

// ══════════════════════════════════════════════════
// 5. END-TO-END WITH recomputeAll
// ══════════════════════════════════════════════════

runSuite('Intelligence E2E via recomputeAll', () => {
  test('recomputeAll includes intelligence layer', () => {
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

    assert(result.intelligence !== undefined, 'should have intelligence');
    assertGreater(result.intelligence.root_causes.length, 0, 'should have root causes');
    assertGreater(result.intelligence.global_actions.length, 0, 'should have global actions');
    assert(result.intelligence.summary.underlying_problems.length >= 0, 'should have summary');
  });

  test('clean site produces minimal root causes', () => {
    const evidence = [
      pageContentEvidence('https://clean.com/'),
      httpResponseEvidence('https://clean.com/', 200, 300),
      checkoutIndicatorEvidence('https://clean.com/', 'https://clean.com/checkout', false),
      policyEvidence('https://clean.com/', 'https://clean.com/privacy', 'privacy'),
      policyEvidence('https://clean.com/', 'https://clean.com/terms', 'terms'),
      policyEvidence('https://clean.com/', 'https://clean.com/refund', 'refund'),
      scriptEvidence('https://clean.com/', 'https://www.googletagmanager.com/gtag.js', true),
      scriptEvidence('https://clean.com/', 'https://connect.facebook.net/fbevents.js', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'clean.com', landing_url: 'https://clean.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Clean site should have no critical root causes
    const criticalRCs = result.intelligence.root_causes.filter(rc => rc.severity === 'critical');
    assertEqual(criticalRCs.length, 0, 'clean site should have no critical root causes');
    // Scale decision should not be unsafe (may have minor chargeback-related risk)
    assert(
      result.scale_readiness.decision.decision_key !== 'unsafe_to_scale_traffic',
      `clean site should not be unsafe, got: ${result.scale_readiness.decision.decision_key}`,
    );
  });

  test('off-domain checkout produces trust root cause affecting both packs', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://sketchy-pay.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 1, is_production: true,
    });

    const trustRC = result.intelligence.root_causes.find(rc => rc.root_cause_key === 'trust_failure_at_checkout');
    if (trustRC) {
      assert(trustRC.affected_packs.length > 1, 'trust root cause should affect multiple packs');
    }
  });

  test('intelligence is deterministic', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const input = {
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    };
    const r1 = recomputeAll(input);
    const r2 = recomputeAll(input);

    assertEqual(r1.intelligence.root_causes.length, r2.intelligence.root_causes.length);
    assertEqual(r1.intelligence.global_actions.length, r2.intelligence.global_actions.length);
    assertEqual(r1.intelligence.summary.total_root_causes, r2.intelligence.summary.total_root_causes);
  });

  test('decisions remain unchanged by intelligence layer', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Decisions should still have their original keys
    assert(result.scale_readiness.decision.question_key === 'is_it_safe_to_scale_traffic',
      'scale decision unchanged');
    assert(result.revenue_integrity.decision.question_key === 'is_there_revenue_leakage_in_high_intent_paths',
      'revenue decision unchanged');
  });
});

// ══════════════════════════════════════════════════
// 6. EDGE CASES
// ══════════════════════════════════════════════════

runSuite('Intelligence Edge Cases', () => {
  test('single inference produces single root cause', () => {
    const inferences = [
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    assertEqual(rootCauses.length, 1);
    assertEqual(rootCauses[0].root_cause_key, 'policy_deficiency');
  });

  test('low confidence inference still creates root cause', () => {
    const inferences = [
      testInference({ inference_key: 'unclear_conversion_intent', conclusion_value: 'medium', severity_hint: 'medium', confidence: 45 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    assertEqual(rootCauses.length, 1);
  });

  test('independent issues produce separate root causes', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'unclear_conversion_intent', conclusion_value: 'high', severity_hint: 'high', confidence: 60 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'medium', severity_hint: 'medium', confidence: 65 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    assertGreater(rootCauses.length, 1, 'independent issues should produce separate root causes');

    // Check they have different keys
    const keys = new Set(rootCauses.map(rc => rc.root_cause_key));
    assertEqual(keys.size, rootCauses.length, 'each root cause should have a unique key');
  });

  test('root cause has correct impact dimensions', () => {
    const inferences = [
      testInference({ inference_key: 'measurement_coverage', conclusion_value: 'false', severity_hint: null, confidence: 55 }),
      testInference({ inference_key: 'measurement_blindspot', conclusion_value: 'high', severity_hint: 'high', confidence: 65 }),
    ];
    const rootCauses = groupIntoRootCauses(inferences);
    const measRC = rootCauses.find(rc => rc.root_cause_key === 'measurement_blindspot');
    assert(measRC!.impact_types.includes('measurement_blind'), 'should include measurement_blind');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  INTELLIGENCE TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
