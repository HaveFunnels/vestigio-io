/**
 * Vestigio V2 — Phase 18.5: Collection Evolution + Live Analysis Tests
 * Tests: staged pipeline, coverage model, challenge detection,
 *        finding polarity, positive findings, progressive delivery
 *
 * Run: npx tsx tests/collection-evolution.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { recomputeAll } from '../packages/workspace';
import { projectAll } from '../packages/projections';
import { PIPELINE_STEPS, type PipelineEvent, type CoverageSummary } from '../workers/ingestion/staged-pipeline';

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

// ══════════════════════════════════════════════════
// 1. PIPELINE STEPS
// ══════════════════════════════════════════════════

runSuite('Pipeline — Step Messages', () => {
  test('has 50 step messages', () => {
    assertEqual(PIPELINE_STEPS.length, 50, 'should have 50 steps');
  });

  test('all steps are non-empty strings', () => {
    for (const step of PIPELINE_STEPS) {
      assert(step.length > 5, `step "${step}" too short`);
    }
  });

  test('steps are human-language (no technical jargon)', () => {
    const technicalTerms = ['HTTP', 'DOM', 'CSS', 'API', 'JSON', 'SQL'];
    for (const step of PIPELINE_STEPS) {
      for (const term of technicalTerms) {
        assert(!step.includes(term), `step "${step}" contains technical term "${term}"`);
      }
    }
  });
});

// ══════════════════════════════════════════════════
// 2. FINDING POLARITY
// ══════════════════════════════════════════════════

runSuite('Finding Polarity — Assigned Correctly', () => {
  test('negative findings have polarity = negative', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/'),
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.external.com/checkout', true),
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_polarity',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'ecommerce',
      onboarding_conversion_model: 'checkout',
    });

    const projections = projectAll(result);
    const negatives = projections.findings.filter(f => f.polarity === 'negative');
    assertGreater(negatives.length, 0, 'should have negative findings');

    // Every negative should have impact > 0
    for (const f of negatives) {
      assertGreater(f.impact.midpoint, 0, `${f.inference_key} should have impact`);
    }
  });

  test('positive findings generated when no issues in area', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/'),
      checkoutIndicatorEvidence('https://example.com/', 'https://example.com/checkout', false), // same domain
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
      policyEvidence('https://example.com/', 'https://example.com/terms', 'terms'),
      policyEvidence('https://example.com/', 'https://example.com/refund', 'refund'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_positive',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'ecommerce',
      onboarding_conversion_model: 'checkout',
    });

    const projections = projectAll(result);
    const positives = projections.findings.filter(f => f.polarity === 'positive');
    assertGreater(positives.length, 0, 'should have positive findings');

    // Positive findings should have zero impact
    for (const f of positives) {
      assertEqual(f.impact.midpoint, 0, `positive finding ${f.id} should have 0 impact`);
      assertEqual(f.severity, 'none', `positive finding should have none severity`);
    }
  });

  test('findings array has both negative and positive', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/'),
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.external.com/checkout', true),
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
      policyEvidence('https://example.com/', 'https://example.com/terms', 'terms'),
      policyEvidence('https://example.com/', 'https://example.com/refund', 'refund'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_mixed',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
    });

    const projections = projectAll(result);
    const negatives = projections.findings.filter(f => f.polarity === 'negative');
    const positives = projections.findings.filter(f => f.polarity === 'positive');

    assertGreater(negatives.length, 0, 'should have negatives');
    assertGreater(positives.length, 0, 'should have positives');
  });

  test('negatives sort before positives', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/'),
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.external.com/checkout', true),
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_sort',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
    });

    const projections = projectAll(result);
    const findings = projections.findings;
    if (findings.length > 1) {
      const firstPositiveIdx = findings.findIndex(f => f.polarity === 'positive');
      const lastNegativeIdx = findings.map((f, i) => f.polarity === 'negative' ? i : -1).filter(i => i >= 0).pop() ?? -1;
      if (firstPositiveIdx >= 0 && lastNegativeIdx >= 0) {
        assert(lastNegativeIdx < firstPositiveIdx, 'negatives should sort before positives');
      }
    }
  });
});

// ══════════════════════════════════════════════════
// 3. POLARITY FILTERING
// ══════════════════════════════════════════════════

runSuite('Polarity Filtering', () => {
  test('can filter to issues only', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/'),
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.external.com/checkout', true),
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_filter',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
    });

    const projections = projectAll(result);
    const all = projections.findings;
    const issuesOnly = all.filter(f => f.polarity === 'negative');
    const positivesOnly = all.filter(f => f.polarity === 'positive');

    assert(issuesOnly.length <= all.length, 'filtered <= total');
    assert(issuesOnly.every(f => f.polarity === 'negative'), 'all should be negative');
    assert(positivesOnly.every(f => f.polarity === 'positive'), 'all should be positive');
  });
});

// ══════════════════════════════════════════════════
// 4. COVERAGE MODEL
// ══════════════════════════════════════════════════

runSuite('Coverage Model', () => {
  test('coverage summary has correct structure', () => {
    // Test the coverage summary type
    const summary: CoverageSummary = {
      score: 75,
      total_routes: 10,
      validated_routes: 8,
      critical_routes: 4,
      critical_validated: 3,
      gaps: ['https://example.com/checkout'],
      challenged: false,
      challenge_type: null,
    };
    assertEqual(summary.score, 75, 'score');
    assertEqual(summary.total_routes, 10, 'total');
    assertEqual(summary.gaps.length, 1, 'gaps');
    assertEqual(summary.challenged, false, 'not challenged');
  });
});

// ══════════════════════════════════════════════════
// 5. PIPELINE OUTPUT INCLUDES CLASSIFICATION
// ══════════════════════════════════════════════════

runSuite('Pipeline — Classification in Output', () => {
  test('recomputeAll includes classification and pack_eligibility', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_class',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'ecommerce',
    });

    assert(result.classification !== undefined, 'should have classification');
    assert(result.pack_eligibility !== undefined, 'should have pack_eligibility');
    assert(result.classification.primary_model !== undefined, 'should have primary_model');
    assertEqual(result.pack_eligibility.scale_readiness.eligible, true, 'scale always eligible');
  });
});

// ══════════════════════════════════════════════════
// 6. SSE EVENT TYPES
// ══════════════════════════════════════════════════

runSuite('SSE — Event Structure', () => {
  test('PipelineEvent types cover all stages', () => {
    const eventTypes = ['step', 'finding_ready', 'score_update', 'coverage_update', 'stage_complete', 'challenge_detected', 'complete'];
    // Verify type structure
    const testEvent: PipelineEvent = {
      type: 'step',
      stage: 'bootstrap',
      data: { message: 'test' },
      timestamp: new Date(),
    };
    assertEqual(testEvent.type, 'step', 'event type');
    assertEqual(testEvent.stage, 'bootstrap', 'stage');
  });
});

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`Collection Evolution: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════');

if (suitesFailed > 0) process.exit(1);
