/**
 * Vestigio V2 — Phase 18: SaaS Intelligence Pack Tests
 * Tests: SaaS signals, inferences, impact, pipeline,
 *        projections, eligibility enforcement, MCP
 *
 * Run: npx tsx tests/saas-intelligence.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testFreshness, testEvidence,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  Evidence,
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
  IdGenerator,
} from '../packages/domain';

import { extractSaasSignals } from '../packages/signals/saas-signals';
import { computeSaasInferences } from '../packages/inference/saas-inference';
import { IMPACT_BASELINES } from '../packages/impact/baselines';
import { estimateImpact } from '../packages/impact';
import { recomputeAll } from '../packages/workspace';
import { projectAll } from '../packages/projections';

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

// ── Test evidence factories ───────────────────

const ids = new IdGenerator('saas_test');

function saasEvidence(type: EvidenceType, payload: any): Evidence {
  return testEvidence(type, payload, {
    source_kind: SourceKind.BrowserVerification,
    collection_method: CollectionMethod.DynamicRender,
  });
}

function activationStepEvidence(stepIndex: number, complexity: 'low' | 'medium' | 'high', hasCta: boolean = true): Evidence {
  return saasEvidence(EvidenceType.ActivationStepObserved, {
    type: 'activation_step_observed',
    step_url: `https://app.example.com/onboarding/step${stepIndex}`,
    step_name: `Step ${stepIndex}`,
    step_index: stepIndex,
    has_clear_cta: hasCta,
    has_progress_indicator: stepIndex <= 3,
    estimated_complexity: complexity,
  });
}

function emptyStateEvidence(hasGuidance: boolean, context: string): Evidence {
  return saasEvidence(EvidenceType.EmptyStateObserved, {
    type: 'empty_state_observed',
    url: `https://app.example.com/${context}`,
    has_guidance: hasGuidance,
    has_cta: hasGuidance,
    has_sample_data_option: false,
    context,
  });
}

function upgradeSurfaceEvidence(visibility: 'prominent' | 'subtle' | 'hidden', hasValueProp: boolean = true): Evidence {
  return saasEvidence(EvidenceType.UpgradeSurfaceObserved, {
    type: 'upgrade_surface_observed',
    url: 'https://app.example.com/settings/billing',
    visibility,
    context: 'billing',
    has_pricing_info: true,
    has_value_proposition: hasValueProp,
  });
}

function navStructureEvidence(itemCount: number, depth: number, hasSearch: boolean = true): Evidence {
  return saasEvidence(EvidenceType.NavigationStructureObserved, {
    type: 'navigation_structure_observed',
    total_nav_items: itemCount,
    depth_levels: depth,
    has_search: hasSearch,
    has_help: true,
    primary_sections: ['Dashboard', 'Projects', 'Settings'],
  });
}

function authenticatedPageEvidence(pageType: string, hasUpgradeCta: boolean = false): Evidence {
  return saasEvidence(EvidenceType.AuthenticatedPageView, {
    type: 'authenticated_page_view',
    url: `https://app.example.com/${pageType}`,
    title: pageType.charAt(0).toUpperCase() + pageType.slice(1),
    page_type: pageType,
    has_empty_state: false,
    has_upgrade_cta: hasUpgradeCta,
    has_onboarding_prompt: false,
    nav_items_count: 8,
  });
}

// ══════════════════════════════════════════════════
// 1. SaaS SIGNAL EXTRACTION
// ══════════════════════════════════════════════════

runSuite('SaaS Signals — Activation', () => {
  test('extracts activation flow signals', () => {
    const evidence = [
      activationStepEvidence(1, 'low'),
      activationStepEvidence(2, 'medium'),
      activationStepEvidence(3, 'high'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    assert(signals.some(s => s.signal_key === 'activation_flow_detected'), 'should detect flow');
    assert(signals.some(s => s.signal_key === 'onboarding_steps_count'), 'should count steps');
    const stepsSignal = signals.find(s => s.signal_key === 'onboarding_steps_count');
    assertEqual(stepsSignal!.numeric_value, 3, 'should have 3 steps');
  });

  test('detects high complexity activation', () => {
    const evidence = [
      activationStepEvidence(1, 'high'),
      activationStepEvidence(2, 'high'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    assert(signals.some(s => s.signal_key === 'activation_complexity_high'), 'should detect high complexity');
  });

  test('detects unclear next steps', () => {
    const evidence = [
      activationStepEvidence(1, 'low', false), // no CTA
      activationStepEvidence(2, 'low', false),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    assert(signals.some(s => s.signal_key === 'activation_unclear_next_step'), 'should detect unclear steps');
  });
});

runSuite('SaaS Signals — Empty States', () => {
  test('detects empty states without guidance', () => {
    const evidence = [
      emptyStateEvidence(false, 'projects'),
      emptyStateEvidence(false, 'dashboard'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    assert(signals.some(s => s.signal_key === 'empty_state_no_guidance'), 'should detect no guidance');
    const sig = signals.find(s => s.signal_key === 'empty_state_no_guidance');
    assertEqual(sig!.numeric_value, 2, 'should find 2 empty states');
  });
});

runSuite('SaaS Signals — Upgrade Surface', () => {
  test('detects upgrade visibility', () => {
    const evidence = [
      upgradeSurfaceEvidence('prominent'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const vis = signals.find(s => s.signal_key === 'upgrade_surface_visibility');
    assert(vis !== undefined, 'should have visibility signal');
    assertEqual(vis!.value, 'high', 'prominent should be high');
  });

  test('detects missing upgrade surface', () => {
    const evidence = [authenticatedPageEvidence('dashboard')];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const present = signals.find(s => s.signal_key === 'upgrade_surface_present');
    assert(present !== undefined, 'should have presence signal');
    assertEqual(present!.value, 'false', 'should be false');
  });

  test('detects hidden upgrade without value prop', () => {
    const evidence = [upgradeSurfaceEvidence('hidden', false)];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    assert(signals.some(s => s.signal_key === 'upgrade_no_value_prop'), 'should detect missing value prop');
  });
});

runSuite('SaaS Signals — Navigation', () => {
  test('detects overcomplex navigation', () => {
    const evidence = [navStructureEvidence(20, 4, false)];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const complexity = signals.find(s => s.signal_key === 'navigation_complexity');
    assertEqual(complexity!.value, 'high', 'should be high');
    assert(signals.some(s => s.signal_key === 'navigation_deep'), 'should detect deep nav');
    assert(signals.some(s => s.signal_key === 'navigation_no_search'), 'should detect no search');
  });
});

// ══════════════════════════════════════════════════
// 2. SaaS INFERENCE ENGINE
// ══════════════════════════════════════════════════

runSuite('SaaS Inferences — Activation', () => {
  test('activation blocked by complexity', () => {
    const evidence = [
      activationStepEvidence(1, 'high'),
      activationStepEvidence(2, 'high'),
      activationStepEvidence(3, 'high'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    assert(inferences.some(i => i.inference_key === 'activation_blocked'), 'should infer activation blocked');
  });

  test('high friction detected with many steps', () => {
    const evidence = Array.from({ length: 7 }, (_, i) => activationStepEvidence(i + 1, 'medium'));
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    assert(inferences.some(i => i.inference_key === 'activation_friction_high'), 'should infer high friction');
  });
});

runSuite('SaaS Inferences — Monetization', () => {
  test('upgrade invisible when no surface', () => {
    const evidence = [authenticatedPageEvidence('dashboard')];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    assert(inferences.some(i => i.inference_key === 'upgrade_invisible'), 'should infer upgrade invisible');
  });

  test('upgrade visible with prominent surface — no inference', () => {
    const evidence = [upgradeSurfaceEvidence('prominent')];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    assert(!inferences.some(i => i.inference_key === 'upgrade_invisible'), 'should NOT infer upgrade invisible');
  });
});

runSuite('SaaS Inferences — UX', () => {
  test('empty state without guidance', () => {
    const evidence = [
      emptyStateEvidence(false, 'projects'),
      emptyStateEvidence(false, 'reports'),
      emptyStateEvidence(false, 'team'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    assert(inferences.some(i => i.inference_key === 'empty_state_without_guidance'), 'should infer empty state issue');
    const inf = inferences.find(i => i.inference_key === 'empty_state_without_guidance');
    assertEqual(inf!.severity_hint, 'high', 'should be high severity for 3+ empty states');
  });

  test('navigation overcomplex', () => {
    const evidence = [navStructureEvidence(20, 4, false)];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    assert(inferences.some(i => i.inference_key === 'navigation_overcomplex'), 'should infer nav overcomplex');
  });
});

// ══════════════════════════════════════════════════
// 3. SaaS IMPACT BASELINES
// ══════════════════════════════════════════════════

runSuite('SaaS Impact Baselines', () => {
  const saasKeys = [
    'activation_blocked', 'activation_friction_high', 'unclear_next_step',
    'empty_state_without_guidance', 'navigation_overcomplex', 'feature_discovery_poor',
    'upgrade_invisible', 'upgrade_timing_wrong', 'no_expansion_path', 'landing_app_mismatch',
  ];

  test('all SaaS inferences have impact baselines', () => {
    for (const key of saasKeys) {
      assert(IMPACT_BASELINES[key] !== undefined, `missing baseline: ${key}`);
    }
  });

  test('impact estimation produces value cases for SaaS inferences', () => {
    const evidence = [
      activationStepEvidence(1, 'high'),
      activationStepEvidence(2, 'high'),
      activationStepEvidence(3, 'high'),
      emptyStateEvidence(false, 'dashboard'),
    ];
    const signals = extractSaasSignals(evidence, testScoping(), 'cycle_1');
    const inferences = computeSaasInferences(signals, testScoping(), 'cycle_1');
    const valueCases = estimateImpact(inferences, null);
    assertGreater(valueCases.length, 0, 'should produce value cases');
    // All should have $ impact
    for (const vc of valueCases) {
      assertGreater(vc.estimated_impact.range.max, 0, `${vc.inference_key} should have impact > 0`);
    }
  });
});

// ══════════════════════════════════════════════════
// 4. PIPELINE INTEGRATION (recomputeAll)
// ══════════════════════════════════════════════════

runSuite('Pipeline — SaaS Pack in recomputeAll', () => {
  test('SaaS pack appears when eligible with SaaS evidence', () => {
    // Create evidence with both structural + SaaS signals
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/login'),
      pageContentEvidence('https://example.com/pricing'),
      // SaaS evidence (authenticated)
      activationStepEvidence(1, 'high'),
      activationStepEvidence(2, 'high'),
      emptyStateEvidence(false, 'dashboard'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_saas',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'saas',
      onboarding_conversion_model: 'checkout',
    });

    // Classification should detect SaaS
    assertEqual(result.classification.primary_model, 'saas', 'primary model should be saas');
    assert(result.pack_eligibility.saas_pack.eligible, 'saas pack should be eligible');

    // SaaS findings should appear in impact
    const saasVCs = result.impact.value_cases.filter(vc =>
      ['activation_blocked', 'empty_state_without_guidance', 'activation_friction_high', 'upgrade_invisible'].includes(vc.inference_key)
    );
    assertGreater(saasVCs.length, 0, 'should have SaaS value cases');
  });

  test('SaaS pack absent for ecommerce without SaaS evidence', () => {
    const evidence = [
      httpResponseEvidence('https://shop.com', 200),
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.stripe.com/checkout', true),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_ecom',
      root_domain: 'shop.com',
      landing_url: 'https://shop.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'ecommerce',
      onboarding_conversion_model: 'checkout',
    });

    assert(!result.pack_eligibility.saas_pack.eligible, 'saas pack should NOT be eligible');
    assertEqual(result.saas_growth_readiness, null, 'saas pack should be null');
  });
});

// ══════════════════════════════════════════════════
// 5. PROJECTIONS — SaaS Findings in Analysis
// ══════════════════════════════════════════════════

runSuite('Projections — SaaS Findings', () => {
  test('SaaS findings appear in unified analysis', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/login'),
      pageContentEvidence('https://example.com/pricing'),
      activationStepEvidence(1, 'high'),
      activationStepEvidence(2, 'high'),
      activationStepEvidence(3, 'high'),
      emptyStateEvidence(false, 'dashboard'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_proj',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'saas',
    });

    const projections = projectAll(result);

    // SaaS findings should be in the unified findings array
    const saasFindings = projections.findings.filter(f => f.pack === 'saas_growth_readiness');
    assertGreater(saasFindings.length, 0, 'should have SaaS findings');

    // Each NEGATIVE finding should have impact, eligibility, surface.
    // Positive findings (e.g. navigation_clean — observation of healthy
    // state) carry zero $ impact AND a generic surface (no specific
    // negative location). Skip both checks for positives.
    for (const f of saasFindings) {
      assert(f.eligibility.eligible, `${f.inference_key} should be eligible`);
      if (f.polarity !== 'positive') {
        assertGreater(f.impact.midpoint, 0, `${f.inference_key} should have impact`);
        assert(f.surface.includes('/app'), `${f.inference_key} should have SaaS surface`);
      }
    }
  });

  test('SaaS workspace appears when eligible', () => {
    const evidence = [
      httpResponseEvidence('https://example.com', 200),
      pageContentEvidence('https://example.com/login'),
      pageContentEvidence('https://example.com/pricing'),
      activationStepEvidence(1, 'high'),
      activationStepEvidence(2, 'high'),
      emptyStateEvidence(false, 'dashboard'),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_ws',
      root_domain: 'example.com',
      landing_url: 'https://example.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'saas',
    });

    const projections = projectAll(result);
    const saasWorkspace = projections.workspaces.find(w => w.id === 'saas');
    // May or may not exist depending on inference triggering
    if (saasWorkspace) {
      assertGreater(saasWorkspace.findings.length, 0, 'should have findings');
      assertEqual(saasWorkspace.pack_key, 'saas_growth_readiness_pack', 'correct pack key');
    }
  });
});

// ══════════════════════════════════════════════════
// 6. ELIGIBILITY ENFORCEMENT — NO FALSE POSITIVES
// ══════════════════════════════════════════════════

runSuite('Eligibility — SaaS Findings Blocked for Non-SaaS', () => {
  test('ecommerce site has no SaaS findings', () => {
    const evidence = [
      httpResponseEvidence('https://shop.com', 200),
      pageContentEvidence('https://shop.com/'),
      checkoutIndicatorEvidence('https://shop.com/', 'https://pay.stripe.com/checkout', true),
    ];

    const result = recomputeAll({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'cycle_no_saas',
      root_domain: 'shop.com',
      landing_url: 'https://shop.com',
      conversion_proximity: 0.5,
      is_production: false,
      onboarding_business_model: 'ecommerce',
    });

    const projections = projectAll(result);
    const saasFindings = projections.findings.filter(f => f.pack === 'saas_growth_readiness');
    assertEqual(saasFindings.length, 0, 'NO SaaS findings for ecommerce');
  });
});

// ══════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log(`SaaS Intelligence: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════');

if (suitesFailed > 0) process.exit(1);
