/**
 * Vestigio V2 — Impact Estimation Engine Test Suite
 * Tests: quantification always present, ranges correct, business input scaling,
 *        fallback heuristics, aggregation, MCP answer integration
 *
 * Run: npx tsx tests/impact.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testInference,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { Inference, InferenceCategory } from '../packages/domain';
import { estimateImpact, summarizeImpact, BusinessInputs, QuantifiedValueCase } from '../packages/impact';
import { recomputeAll } from '../packages/workspace';
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

const scoping = testScoping();
const cycleRef = 'audit_cycle:c1';
const scope: McpRequestScope = { workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1' };

const defaultBusiness: BusinessInputs = {
  monthly_revenue: 100000,
  average_order_value: 150,
  monthly_transactions: 667,
  conversion_rate: 0.025,
  chargeback_rate: 0.01,
  churn_rate: 0.04,
};

// ══════════════════════════════════════════════════
// 1. QUANTIFICATION ALWAYS PRESENT
// ══════════════════════════════════════════════════

runSuite('Quantification Always Present', () => {
  test('every value case has numeric range (NEVER null)', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'medium', severity_hint: 'medium', confidence: 65 }),
      testInference({ inference_key: 'refund_policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'support_unreachable', conclusion_value: 'high', severity_hint: 'high', confidence: 60 }),
    ];
    const valueCases = estimateImpact(inferences, defaultBusiness);

    assertGreater(valueCases.length, 0, 'should produce value cases');
    for (const vc of valueCases) {
      assert(vc.estimated_impact.range.min >= 0, `${vc.inference_key}: range.min must be >= 0`);
      assert(vc.estimated_impact.range.max > 0, `${vc.inference_key}: range.max must be > 0`);
      assert(vc.estimated_impact.range.max >= vc.estimated_impact.range.min, `${vc.inference_key}: max >= min`);
      assert(vc.estimated_impact.percentage_delta !== null && vc.estimated_impact.percentage_delta > 0,
        `${vc.inference_key}: percentage_delta must be > 0`);
      assert(vc.confidence > 0 && vc.confidence <= 100, `${vc.inference_key}: confidence in range`);
      assert(vc.cause.length > 0, `${vc.inference_key}: cause must not be empty`);
      assert(vc.effect.length > 0, `${vc.inference_key}: effect must not be empty`);
      assert(vc.reasoning.length > 0, `${vc.inference_key}: reasoning must not be empty`);
    }
  });

  test('no vague outputs — every case has numeric values', () => {
    const inferences = [
      testInference({ inference_key: 'checkout_integrity', conclusion_value: 'weak', severity_hint: 'high', confidence: 70 }),
    ];
    const valueCases = estimateImpact(inferences, defaultBusiness);
    assertEqual(valueCases.length, 1);
    assert(valueCases[0].estimated_impact.monthly_revenue_delta !== null, 'must have monthly delta');
    assertGreater(valueCases[0].estimated_impact.monthly_revenue_delta!, 0, 'monthly delta must be > 0');
  });

  test('negative/false inferences produce no value cases', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'false', confidence: 55 }),
      testInference({ inference_key: 'commerce_context', conclusion_value: 'false', confidence: 50 }),
    ];
    const valueCases = estimateImpact(inferences, defaultBusiness);
    assertEqual(valueCases.length, 0);
  });
});

// ══════════════════════════════════════════════════
// 2. BUSINESS INPUT SCALING
// ══════════════════════════════════════════════════

runSuite('Business Input Scaling', () => {
  test('higher revenue produces higher absolute impact', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
    ];
    const small = estimateImpact(inferences, { ...defaultBusiness, monthly_revenue: 10000 });
    const large = estimateImpact(inferences, { ...defaultBusiness, monthly_revenue: 500000 });

    assert(small.length === 1 && large.length === 1, 'both should produce 1 case');
    assert(large[0].estimated_impact.range.max > small[0].estimated_impact.range.max,
      'larger business should have larger absolute impact');
  });

  test('same inference, same business → same estimate (deterministic)', () => {
    const inferences = [
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];
    const r1 = estimateImpact(inferences, defaultBusiness);
    const r2 = estimateImpact(inferences, defaultBusiness);
    assertEqual(r1[0].estimated_impact.range.min, r2[0].estimated_impact.range.min);
    assertEqual(r1[0].estimated_impact.range.max, r2[0].estimated_impact.range.max);
  });

  test('severity affects range: high > medium > low', () => {
    const highInf = [testInference({ inference_key: 'revenue_leakage', conclusion_value: 'high', severity_hint: 'high', confidence: 75 })];
    const medInf = [testInference({ inference_key: 'revenue_leakage', conclusion_value: 'medium', severity_hint: 'medium', confidence: 65 })];
    const lowInf = [testInference({ inference_key: 'revenue_leakage', conclusion_value: 'low', severity_hint: 'low', confidence: 55 })];

    const high = estimateImpact(highInf, defaultBusiness);
    const med = estimateImpact(medInf, defaultBusiness);
    const low = estimateImpact(lowInf, defaultBusiness);

    assert(high[0].estimated_impact.range.max > med[0].estimated_impact.range.max, 'high > medium');
    assert(med[0].estimated_impact.range.max > low[0].estimated_impact.range.max, 'medium > low');
  });
});

// ══════════════════════════════════════════════════
// 3. FALLBACK HEURISTICS
// ══════════════════════════════════════════════════

runSuite('Fallback Heuristics', () => {
  test('no business inputs → still produces quantified estimates', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
    ];
    const valueCases = estimateImpact(inferences, null);

    assertEqual(valueCases.length, 1);
    assertGreater(valueCases[0].estimated_impact.range.max, 0, 'should still have numeric impact');
    assertEqual(valueCases[0].basis_type, 'heuristic', 'should mark as heuristic');
  });

  test('fallback has lower confidence than real inputs', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
    ];
    const withInputs = estimateImpact(inferences, defaultBusiness);
    const fallback = estimateImpact(inferences, null);

    assert(fallback[0].confidence < withInputs[0].confidence,
      'fallback should have lower confidence');
  });

  test('fallback widens range relative to base (uncertainty factor)', () => {
    const inferences = [
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
    ];
    // Use same revenue as fallback ($50k) to isolate the uncertainty effect
    const sameRevenue = { ...defaultBusiness, monthly_revenue: 50000 };
    const withInputs = estimateImpact(inferences, sameRevenue);
    const fallback = estimateImpact(inferences, null);

    const withSpread = withInputs[0].estimated_impact.range.max - withInputs[0].estimated_impact.range.min;
    const fbSpread = fallback[0].estimated_impact.range.max - fallback[0].estimated_impact.range.min;
    assert(fbSpread > withSpread, 'fallback should have wider relative spread');
  });
});

// ══════════════════════════════════════════════════
// 4. IMPACT AGGREGATION
// ══════════════════════════════════════════════════

runSuite('Impact Aggregation', () => {
  test('summarizeImpact aggregates across all value cases', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 75 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'revenue_leakage', conclusion_value: 'medium', severity_hint: 'medium', confidence: 65 }),
    ];
    const valueCases = estimateImpact(inferences, defaultBusiness);
    const summary = summarizeImpact(valueCases);

    assertGreater(summary.total_monthly_loss_mid, 0, 'should have total loss');
    assertGreater(summary.total_monthly_loss_range.max, summary.total_monthly_loss_range.min, 'range max > min');
    assert(summary.highest_impact_issue !== null, 'should identify highest impact');
    assertGreater(summary.highest_impact_value, 0, 'highest value > 0');
    assertEqual(summary.issue_count, valueCases.length);
  });

  test('empty value cases produce zero summary', () => {
    const summary = summarizeImpact([]);
    assertEqual(summary.total_monthly_loss_mid, 0);
    assertEqual(summary.issue_count, 0);
    assertEqual(summary.highest_impact_issue, null);
  });
});

// ══════════════════════════════════════════════════
// 5. PIPELINE INTEGRATION
// ══════════════════════════════════════════════════

runSuite('Pipeline Integration', () => {
  test('recomputeAll includes impact in result', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const result = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    assert(result.impact !== undefined, 'should have impact');
    assertGreater(result.impact.value_cases.length, 0, 'should have value cases');
    assertGreater(result.impact.summary.total_monthly_loss_mid, 0, 'should have total loss > 0');
  });

  test('recomputeAll with business_inputs produces scaled impact', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];

    const withInputs = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
      business_inputs: { ...defaultBusiness, monthly_revenue: 200000 },
    });

    const withoutInputs = recomputeAll({
      evidence, scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });

    // Both should have impact. With inputs should classify as
    // data_driven (since defaultBusiness has all 3 core fields set:
    // monthly_revenue, average_order_value, monthly_transactions).
    // Without inputs should be heuristic.
    assertGreater(withInputs.impact.value_cases.length, 0, 'with inputs: has cases');
    assertGreater(withoutInputs.impact.value_cases.length, 0, 'without inputs: has cases');
    assert(
      withInputs.impact.value_cases.some(vc => vc.basis_type === 'data_driven' || vc.basis_type === 'mixed'),
      'with inputs: should be data_driven or mixed (not heuristic)',
    );
    assert(withoutInputs.impact.value_cases.every(vc => vc.basis_type === 'heuristic'), 'without inputs: should be heuristic');
  });
});

// ══════════════════════════════════════════════════
// 6. MCP ANSWER INTEGRATION
// ══════════════════════════════════════════════════

runSuite('MCP Answer Impact', () => {
  test('MCP answers include impact_summary', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const server = new McpServer();
    server.loadContext(evidence, scope, cycleRef, 'shop.com', 'https://shop.com/');

    const tools = ['answer_can_i_scale', 'answer_where_losing_money', 'answer_underlying_cause', 'answer_fix_first'];
    for (const tool of tools) {
      const result = server.callTool(tool);
      if (result.type !== 'answer') continue;
      // Impact summary should be present when there are issues
      assert('impact_summary' in result.data, `${tool}: should have impact_summary field`);
    }
  });

  test('impact_summary has monetary values', () => {
    const evidence = [
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    ];
    const server = new McpServer();
    server.loadContext(evidence, scope, cycleRef, 'shop.com', 'https://shop.com/');

    const result = server.callTool('answer_can_i_scale');
    if (result.type !== 'answer' || !result.data.impact_summary) return;

    const impact = result.data.impact_summary;
    assertGreater(impact.total_monthly_loss_mid, 0, 'should have monetary value');
    assert(impact.total_monthly_loss_range.max >= impact.total_monthly_loss_range.min, 'valid range');
    assert(impact.currency === 'USD', 'should have currency');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  IMPACT TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
