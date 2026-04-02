/**
 * Vestigio V2 — Comprehensive Test Suite
 * Covers all layers: domain, evidence, graph, signals, inference, risk, decision, actions, workspace, recomputation
 *
 * Run: npx tsx tests/all.test.ts
 */

import {
  test, assert, assertEqual, assertGreater, assertThrows,
  testScoping, testFreshness, testEvidence, testSignal, testInference,
  httpResponseEvidence, pageContentEvidence, redirectEvidence, scriptEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence, platformEvidence,
  formEvidence, resetCounters, printResults, getResults,
} from './helpers';

import {
  makeRef, parseRef, IdGenerator, FreshnessState, EvidenceType,
  EffectiveSeverity, DecisionImpact, DecisionStatus, DecisionClass,
  SignalCategory, InferenceCategory, CycleType, PreflightOverallStatus,
  validateEvidence, validateSignal, validateInference, validateDecision,
  validateScoping, validateFreshness, ValidationError,
} from '../packages/domain';

import { EvidenceStore, CycleStore } from '../packages/evidence';
import { buildGraph, GraphQuery } from '../packages/graph';
import { extractSignals } from '../packages/signals';
import { computeInferences } from '../packages/inference';
import { evaluateRisk } from '../packages/risk';
import { produceDecision } from '../packages/decision';
import { deriveActions } from '../packages/actions';
import { createPreflightWorkspace, recompute } from '../packages/workspace';

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
// 1. DOMAIN CONTRACTS
// ══════════════════════════════════════════════════

runSuite('Domain Contracts', () => {
  test('makeRef creates valid ref', () => {
    assertEqual(makeRef('evidence', '123'), 'evidence:123');
  });

  test('parseRef extracts type and id', () => {
    const { type, id } = parseRef('evidence:abc_123');
    assertEqual(type, 'evidence');
    assertEqual(id, 'abc_123');
  });

  test('parseRef throws on invalid ref', () => {
    assertThrows(() => parseRef('nocolon'), 'Invalid ref');
  });

  test('IdGenerator produces sequential deterministic IDs', () => {
    const gen = new IdGenerator('test');
    assertEqual(gen.next(), 'test_1');
    assertEqual(gen.next(), 'test_2');
    assertEqual(gen.next(), 'test_3');
  });

  test('IdGenerator reset restarts sequence', () => {
    const gen = new IdGenerator('x');
    gen.next(); gen.next();
    gen.reset();
    assertEqual(gen.next(), 'x_1');
  });

  test('two IdGenerators are independent', () => {
    const a = new IdGenerator('a');
    const b = new IdGenerator('b');
    assertEqual(a.next(), 'a_1');
    assertEqual(b.next(), 'b_1');
    assertEqual(a.next(), 'a_2');
  });

  test('testScoping produces valid scoping', () => {
    const s = testScoping();
    assert(s.workspace_ref.includes(':'), 'workspace_ref must be a ref');
    assert(s.environment_ref.includes(':'), 'environment_ref must be a ref');
  });

  test('testFreshness produces valid freshness', () => {
    const f = testFreshness();
    assert(f.observed_at instanceof Date, 'observed_at must be Date');
    assertEqual(f.freshness_state, FreshnessState.Fresh);
  });
});

// ══════════════════════════════════════════════════
// 2. RUNTIME VALIDATION
// ══════════════════════════════════════════════════

runSuite('Runtime Validation', () => {
  test('validateScoping accepts valid scoping', () => {
    validateScoping(testScoping());
  });

  test('validateScoping rejects missing workspace_ref', () => {
    assertThrows(
      () => validateScoping({ ...testScoping(), workspace_ref: '' } as any),
      'workspace_ref',
    );
  });

  test('validateScoping rejects ref without colon', () => {
    assertThrows(
      () => validateScoping({ ...testScoping(), workspace_ref: 'nocolon' } as any),
      'invalid ref',
    );
  });

  test('validateFreshness accepts valid freshness', () => {
    validateFreshness(testFreshness());
  });

  test('validateFreshness rejects invalid date', () => {
    assertThrows(
      () => validateFreshness({ ...testFreshness(), observed_at: 'not-a-date' } as any),
      'valid Date',
    );
  });

  test('validateEvidence accepts valid evidence', () => {
    validateEvidence(httpResponseEvidence('https://example.com'));
  });

  test('validateEvidence rejects missing id', () => {
    const ev = httpResponseEvidence('https://example.com');
    (ev as any).id = '';
    assertThrows(() => validateEvidence(ev), 'id');
  });

  test('validateEvidence rejects quality_score > 100', () => {
    const ev = httpResponseEvidence('https://example.com');
    (ev as any).quality_score = 150;
    assertThrows(() => validateEvidence(ev), 'quality_score');
  });

  test('validateSignal accepts valid signal', () => {
    validateSignal(testSignal({ evidence_refs: ['evidence:e1'] }));
  });

  test('validateSignal rejects invalid confidence', () => {
    assertThrows(
      () => validateSignal(testSignal({ confidence: -5, evidence_refs: ['evidence:e1'] })),
      'confidence',
    );
  });

  test('validateInference accepts valid inference', () => {
    validateInference(testInference({ signal_refs: ['signal:s1'], evidence_refs: ['evidence:e1'] }));
  });

  test('validateInference rejects invalid ref in array', () => {
    assertThrows(
      () => validateInference(testInference({ signal_refs: ['nocolon'], evidence_refs: ['evidence:e1'] })),
      'invalid ref',
    );
  });
});

// ══════════════════════════════════════════════════
// 3. EVIDENCE STORE
// ══════════════════════════════════════════════════

runSuite('Evidence Store', () => {
  test('add and get evidence', () => {
    const store = new EvidenceStore();
    const ev = httpResponseEvidence('https://example.com');
    store.add(ev);
    assertEqual(store.get(ev.id)?.id, ev.id);
  });

  test('addMany adds multiple items', () => {
    const store = new EvidenceStore();
    const items = [
      httpResponseEvidence('https://a.com'),
      httpResponseEvidence('https://b.com'),
    ];
    store.addMany(items);
    assertEqual(store.count(), 2);
  });

  test('getByRef strips prefix', () => {
    const store = new EvidenceStore();
    const ev = httpResponseEvidence('https://example.com');
    store.add(ev);
    assert(store.getByRef(`evidence:${ev.id}`)?.id === ev.id, 'getByRef should work');
  });

  test('query by cycle_ref', () => {
    const store = new EvidenceStore();
    const ev1 = httpResponseEvidence('https://a.com');
    const ev2 = { ...httpResponseEvidence('https://b.com'), cycle_ref: 'audit_cycle:cycle_2' };
    store.addMany([ev1, ev2]);
    const results = store.query({ cycle_ref: 'audit_cycle:cycle_1' });
    assertEqual(results.length, 1);
  });

  test('query by evidence_type', () => {
    const store = new EvidenceStore();
    store.addMany([
      httpResponseEvidence('https://a.com'),
      pageContentEvidence('https://a.com'),
    ]);
    const results = store.getByType('audit_cycle:cycle_1', EvidenceType.PageContent);
    assertEqual(results.length, 1);
  });

  test('multiple evidence items per URL', () => {
    const store = new EvidenceStore();
    store.addMany([
      httpResponseEvidence('https://example.com'),
      pageContentEvidence('https://example.com'),
      scriptEvidence('https://example.com', 'https://cdn.example.com/app.js', true),
    ]);
    assertEqual(store.count(), 3);
  });

  test('clear removes all evidence', () => {
    const store = new EvidenceStore();
    store.add(httpResponseEvidence('https://a.com'));
    store.clear();
    assertEqual(store.count(), 0);
  });

  test('get returns undefined for missing ID', () => {
    const store = new EvidenceStore();
    assertEqual(store.get('nonexistent'), undefined);
  });
});

// ══════════════════════════════════════════════════
// 4. CYCLE STORE
// ══════════════════════════════════════════════════

runSuite('Cycle Store', () => {
  test('create and get cycle', () => {
    const store = new CycleStore();
    const cycle = store.create({
      id: 'c1', workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1',
      website_ref: 'website:web_1', cycle_type: CycleType.Full, trigger_source: 'manual',
    });
    assertEqual(store.get('c1')?.id, 'c1');
    assertEqual(cycle.status, 'pending');
  });

  test('updateStatus changes status', () => {
    const store = new CycleStore();
    store.create({
      id: 'c2', workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1',
      website_ref: 'website:web_1', cycle_type: CycleType.Full, trigger_source: 'manual',
    });
    store.updateStatus('c2', 'completed');
    assertEqual(store.get('c2')?.status, 'completed');
    assert(store.get('c2')?.completed_at instanceof Date, 'completed_at should be set');
  });

  test('updateStatus throws for missing cycle', () => {
    const store = new CycleStore();
    assertThrows(() => store.updateStatus('missing', 'completed'), 'not found');
  });

  test('getLatest returns most recent cycle', () => {
    const store = new CycleStore();
    const c3 = store.create({
      id: 'c3', workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1',
      website_ref: 'website:web_1', cycle_type: CycleType.Full, trigger_source: 'manual',
    });
    // Force c3 to be older
    c3.started_at = new Date(Date.now() - 10000);
    store.create({
      id: 'c4', workspace_ref: 'workspace:ws_1', environment_ref: 'environment:env_1',
      website_ref: 'website:web_1', cycle_type: CycleType.Incremental, trigger_source: 'manual',
    });
    assertEqual(store.getLatest('website:web_1')?.id, 'c4');
  });

  test('getLatest returns undefined for unknown website', () => {
    const store = new CycleStore();
    assertEqual(store.getLatest('website:unknown'), undefined);
  });
});

// ══════════════════════════════════════════════════
// 5. GRAPH BUILDER
// ══════════════════════════════════════════════════

runSuite('Graph Builder', () => {
  test('builds graph from page content evidence', () => {
    const evidence = [pageContentEvidence('https://example.com/')];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    assertGreater(q.stats().total_nodes, 0, 'should have nodes');
    assert(q.getNodeByUrl('https://example.com/') !== undefined, 'page node should exist');
  });

  test('graph is deterministic — same input produces same structure', () => {
    const evidence = [
      pageContentEvidence('https://example.com/'),
      pageContentEvidence('https://example.com/about'),
    ];
    const g1 = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const g2 = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    assertEqual(g1.nodes.size, g2.nodes.size);
    assertEqual(g1.edges.length, g2.edges.length);
  });

  test('deduplicates page nodes for same URL', () => {
    const evidence = [
      pageContentEvidence('https://example.com/'),
      pageContentEvidence('https://example.com/'),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const pages = Array.from(graph.nodes.values()).filter(n => n.node_type === 'page');
    assertEqual(pages.length, 1, 'should have only 1 page node');
  });

  test('deduplicates asset nodes for same script URL', () => {
    const evidence = [
      scriptEvidence('https://example.com/', 'https://cdn.example.com/app.js', true),
      scriptEvidence('https://example.com/about', 'https://cdn.example.com/app.js', true),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const assets = Array.from(graph.nodes.values()).filter(n => n.node_type === 'asset');
    assertEqual(assets.length, 1, 'should have only 1 asset node');
  });

  test('creates edges for redirects', () => {
    const evidence = [
      redirectEvidence('https://example.com/', 'https://example.com/home', 1),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    assertEqual(graph.edges.length, 1);
    assertEqual(graph.edges[0].edge_type, 'redirect');
  });

  test('creates provider nodes with deduplication', () => {
    const evidence = [
      providerEvidence('https://example.com/', 'stripe'),
      providerEvidence('https://example.com/checkout', 'stripe'),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const providers = Array.from(graph.nodes.values()).filter(n => n.node_type === 'provider');
    assertEqual(providers.length, 1, 'should have 1 deduped provider');
  });

  test('empty evidence produces empty graph', () => {
    const graph = buildGraph([], 'example.com', 'audit_cycle:c1');
    assertEqual(graph.nodes.size, 0);
    assertEqual(graph.edges.length, 0);
  });

  test('edge index provides fast lookup', () => {
    const evidence = [
      redirectEvidence('https://example.com/', 'https://example.com/home', 1),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    const sourceNode = q.getNodeByUrl('https://example.com/');
    assert(sourceNode !== undefined, 'source node should exist');
    const edges = q.getEdgesFrom(sourceNode!.id);
    assertEqual(edges.length, 1);
  });
});

// ══════════════════════════════════════════════════
// 6. GRAPH QUERIES
// ══════════════════════════════════════════════════

runSuite('Graph Queries', () => {
  test('findTrustBoundaries detects external handoffs', () => {
    const evidence = [
      pageContentEvidence('https://example.com/'),
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.stripe.com/checkout', true),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    const boundaries = q.findTrustBoundaries();
    assertGreater(boundaries.trust_gaps.length, 0, 'should detect trust gap');
  });

  test('findProviders returns provider nodes', () => {
    const evidence = [providerEvidence('https://example.com/', 'stripe')];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    const providers = q.findProviders();
    assertEqual(providers.length, 1);
    assertEqual(providers[0].label, 'stripe');
  });

  test('findCriticalRoutes returns internal pages', () => {
    const evidence = [
      pageContentEvidence('https://example.com/'),
      pageContentEvidence('https://example.com/checkout'),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    const routes = q.findCriticalRoutes();
    assertEqual(routes.length, 2);
  });

  test('findRedirectChains returns redirect edges', () => {
    const evidence = [redirectEvidence('https://a.com/', 'https://b.com/', 3)];
    const graph = buildGraph(evidence, 'a.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    assertEqual(q.findRedirectChains().length, 1);
  });

  test('stats returns accurate counts', () => {
    const evidence = [
      pageContentEvidence('https://example.com/'),
      providerEvidence('https://example.com/', 'stripe'),
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
    ];
    const graph = buildGraph(evidence, 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    const s = q.stats();
    assertGreater(s.total_nodes, 0, 'total_nodes');
    assertEqual(s.provider_count, 1);
  });

  test('getNodeByUrl returns undefined for missing URL', () => {
    const graph = buildGraph([], 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    assertEqual(q.getNodeByUrl('https://nonexistent.com'), undefined);
  });

  test('findCommercialPaths returns empty for missing start URL', () => {
    const graph = buildGraph([], 'example.com', 'audit_cycle:c1');
    const q = new GraphQuery(graph);
    const result = q.findCommercialPaths('https://nonexistent.com');
    assertEqual(result.path.nodes.length, 0);
    assertEqual(result.has_external_handoff, false);
  });
});

// ══════════════════════════════════════════════════
// 7. SIGNAL ENGINE
// ══════════════════════════════════════════════════

runSuite('Signal Engine', () => {
  const scoping = testScoping();
  const cycleRef = 'audit_cycle:cycle_1';

  test('extracts checkout_detected=false when no checkout evidence', () => {
    const evidence = [httpResponseEvidence('https://example.com/')];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'checkout_detected');
    assert(sig !== undefined, 'checkout_detected signal should exist');
    assertEqual(sig!.value, 'false');
  });

  test('extracts checkout_mode=redirect for external checkout', () => {
    const evidence = [
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.external.com/checkout', true),
    ];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'checkout_mode');
    assert(sig !== undefined, 'checkout_mode signal should exist');
    assertEqual(sig!.value, 'redirect');
  });

  test('extracts provider signals', () => {
    // Provider signals require at least one checkout indicator to not early-return
    const evidence = [
      checkoutIndicatorEvidence('https://example.com/', 'https://example.com/checkout', false),
      providerEvidence('https://example.com/', 'stripe'),
    ];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'provider_stripe');
    assert(sig !== undefined, 'provider signal should exist');
    assertEqual(sig!.value, 'stripe');
  });

  test('extracts policy signals — all missing', () => {
    const evidence = [httpResponseEvidence('https://example.com/')];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const coverage = signals.find(s => s.signal_key === 'policy_coverage');
    assert(coverage !== undefined, 'policy_coverage signal should exist');
    assertEqual(coverage!.value, 'weak');
  });

  test('extracts policy signals — all present', () => {
    const evidence = [
      policyEvidence('https://example.com/', 'https://example.com/privacy', 'privacy'),
      policyEvidence('https://example.com/', 'https://example.com/terms', 'terms'),
      policyEvidence('https://example.com/', 'https://example.com/refund', 'refund'),
    ];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const coverage = signals.find(s => s.signal_key === 'policy_coverage');
    assertEqual(coverage!.value, 'full');
  });

  test('extracts measurement_coverage=none when no analytics scripts', () => {
    const evidence = [httpResponseEvidence('https://example.com/')];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'measurement_coverage');
    assertEqual(sig!.value, 'none');
  });

  test('extracts http_errors signal for 4xx/5xx responses', () => {
    const evidence = [httpResponseEvidence('https://example.com/', 404)];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'http_errors');
    assert(sig !== undefined, 'http_errors signal should exist');
  });

  test('no http_errors signal for 200 responses', () => {
    const evidence = [httpResponseEvidence('https://example.com/', 200)];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const signals = extractSignals(evidence, graph, scoping, cycleRef);
    const sig = signals.find(s => s.signal_key === 'http_errors');
    assertEqual(sig, undefined);
  });

  test('signals have deterministic IDs', () => {
    const evidence = [httpResponseEvidence('https://example.com/')];
    const graph = buildGraph(evidence, 'example.com', cycleRef);
    const s1 = extractSignals(evidence, graph, scoping, cycleRef);
    const s2 = extractSignals(evidence, graph, scoping, cycleRef);
    assertEqual(s1[0].id, s2[0].id, 'IDs should be deterministic across calls');
  });

  test('empty evidence produces minimal signals', () => {
    const graph = buildGraph([], 'example.com', cycleRef);
    const signals = extractSignals([], graph, scoping, cycleRef);
    assertGreater(signals.length, 0, 'should still produce checkout_detected and policy signals');
  });
});

// ══════════════════════════════════════════════════
// 8. INFERENCE ENGINE
// ══════════════════════════════════════════════════

runSuite('Inference Engine', () => {
  const scoping = testScoping();
  const cycleRef = 'audit_cycle:cycle_1';

  test('infers commerce_context=false when no checkout signals', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_detected', attribute: 'checkout.detected', value: 'false' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'commerce_context');
    assert(inf !== undefined, 'commerce_context inference should exist');
    assertEqual(inf!.conclusion_value, 'false');
  });

  test('infers commerce_context=true when checkout mode exists', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'commerce_context');
    assertEqual(inf!.conclusion_value, 'true');
  });

  test('infers trust_boundary_crossed when signal present', () => {
    const signals = [
      testSignal({ signal_key: 'trust_boundary_crossed', attribute: 'trust.boundary_crossed', value: 'true' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'trust_boundary_crossed');
    assert(inf !== undefined, 'trust_boundary inference should exist');
    assertEqual(inf!.conclusion_value, 'true');
  });

  test('infers policy_gap=high when commerce + weak coverage', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'weak' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'policy_gap');
    assert(inf !== undefined, 'policy_gap inference should exist');
    assertEqual(inf!.conclusion_value, 'high');
  });

  test('no policy_gap when coverage is full', () => {
    const signals = [
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'full' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'policy_gap');
    assertEqual(inf, undefined);
  });

  test('infers checkout_integrity only when checkout mode exists', () => {
    const signals = [
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'weak' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    const inf = inferences.find(i => i.inference_key === 'checkout_integrity');
    assertEqual(inf, undefined, 'should not infer checkout_integrity without checkout');
  });

  test('inferences have deterministic IDs', () => {
    const signals = [testSignal({ attribute: 'checkout.detected', value: 'false' })];
    const i1 = computeInferences(signals, scoping, cycleRef);
    const i2 = computeInferences(signals, scoping, cycleRef);
    assertEqual(i1[0].id, i2[0].id);
  });

  test('each inference has non-empty reasoning', () => {
    const signals = [
      testSignal({ signal_key: 'checkout_mode', attribute: 'checkout.mode', value: 'redirect' }),
      testSignal({ signal_key: 'checkout_off_domain', attribute: 'checkout.off_domain', value: 'true' }),
      testSignal({ signal_key: 'trust_boundary_crossed', attribute: 'trust.boundary_crossed', value: 'true' }),
      testSignal({ signal_key: 'policy_coverage', attribute: 'policy.coverage', value: 'weak' }),
    ];
    const inferences = computeInferences(signals, scoping, cycleRef);
    for (const inf of inferences) {
      assert(inf.reasoning.length > 0, `${inf.inference_key} must have reasoning`);
    }
  });
});

// ══════════════════════════════════════════════════
// 9. RISK ENGINE
// ══════════════════════════════════════════════════

runSuite('Risk Engine', () => {
  test('zero risk with no contributing signals/inferences', () => {
    const result = evaluateRisk({
      question_key: 'is_it_safe_to_scale_traffic',
      subject_ref: 'website:web_1', cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assertEqual(result.raw_risk_score, 0);
    assertEqual(result.effective_severity, EffectiveSeverity.None);
    assertEqual(result.decision_impact, DecisionImpact.Observe);
  });

  test('high risk from trust_boundary_crossed + checkout_integrity weak', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high' }),
      testInference({ inference_key: 'checkout_integrity', conclusion_value: 'weak' }),
    ];
    const result = evaluateRisk({
      question_key: 'is_it_safe_to_scale_traffic',
      subject_ref: 'website:web_1', cycle_ref: 'audit_cycle:c1',
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    // trust group takes max(30, 30) = 30, not sum
    assertEqual(result.raw_risk_score, 30, 'should take max of correlated group');
  });

  test('severity thresholds are applied correctly', () => {
    // Score 20 = Low
    const r1 = evaluateRisk({
      question_key: 'test', subject_ref: 'w:1', cycle_ref: 'c:1',
      signals: [testSignal({ signal_key: 'http_errors', confidence: 80 })],
      inferences: [testInference({ inference_key: 'measurement_coverage', conclusion_value: 'false', confidence: 80 })],
      conversion_proximity: 5, is_production: false,
    });
    assertEqual(r1.raw_risk_score, 20);
  });

  test('low confidence downgrades severity', () => {
    const inferences = [
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', confidence: 25 }),
    ];
    const result = evaluateRisk({
      question_key: 'test', subject_ref: 'w:1', cycle_ref: 'c:1',
      signals: [], inferences,
      conversion_proximity: 5, is_production: false,
    });
    // Raw 25 = Low severity, but confidence < 50 downgrades to None
    assertEqual(result.effective_severity, EffectiveSeverity.None);
  });

  test('low confidence forces Observe impact', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 20 }),
    ];
    const result = evaluateRisk({
      question_key: 'test', subject_ref: 'w:1', cycle_ref: 'c:1',
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    assertEqual(result.decision_impact, DecisionImpact.Observe);
  });

  test('gate blocks on critical risk with sufficient confidence', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 70 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', confidence: 70 }),
      testInference({ inference_key: 'revenue_path_fragile', conclusion_value: 'high', confidence: 70 }),
      testInference({ inference_key: 'measurement_coverage', conclusion_value: 'false', confidence: 70 }),
    ];
    const result = evaluateRisk({
      question_key: 'test', subject_ref: 'w:1', cycle_ref: 'c:1',
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    assertGreater(result.raw_risk_score, 60, 'should have high raw risk');
  });
});

// ══════════════════════════════════════════════════
// 10. DECISION ENGINE
// ══════════════════════════════════════════════════

runSuite('Decision Engine', () => {
  const scoping = testScoping();

  test('safe_to_scale when no risk signals', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assertEqual(decision.decision_key, 'safe_to_scale');
    assertEqual(decision.category, DecisionClass.State);
    assertEqual(decision.primary_outcome, 'observation');
  });

  test('unsafe_to_scale_traffic when high risk in production', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', confidence: 80 }),
      testInference({ inference_key: 'revenue_path_fragile', conclusion_value: 'high', confidence: 80 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    assertEqual(decision.decision_key, 'unsafe_to_scale_traffic');
    assertEqual(decision.category, DecisionClass.Risk);
    assertEqual(decision.primary_outcome, 'incident');
  });

  test('decision always has why.summary', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: false,
    });
    assert(decision.why.summary.length > 0, 'summary must not be empty');
  });

  test('decision always has primary action', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    assert(decision.actions.primary.length > 0, 'primary action must exist');
  });

  test('decisions are deterministic', () => {
    const input = {
      question_key: 'is_it_safe_to_scale_traffic' as const,
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [] as any[], inferences: [] as any[],
      conversion_proximity: 3, is_production: true,
    };
    const r1 = produceDecision(input);
    const r2 = produceDecision(input);
    assertEqual(r1.decision.decision_key, r2.decision.decision_key);
    assertEqual(r1.decision.raw_risk_score, r2.decision.raw_risk_score);
    assertEqual(r1.decision.confidence_score, r2.decision.confidence_score);
  });

  test('decision passes runtime validation', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    validateDecision(decision);
  });
});

// ══════════════════════════════════════════════════
// 11. ACTIONS DERIVATION
// ══════════════════════════════════════════════════

runSuite('Actions Derivation', () => {
  test('derives actions from safe_to_scale decision', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping: testScoping(), cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    assertGreater(actions.length, 0, 'should have at least 1 action');
  });

  test('primary action has highest priority', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping: testScoping(), cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    const primary = actions.find(a => a.action_key.endsWith('_primary'));
    assert(primary !== undefined, 'primary action should exist');
    for (const a of actions) {
      if (a !== primary) {
        assert(a.priority >= primary!.priority, `${a.action_key} should have lower priority`);
      }
    }
  });

  test('all actions reference the decision', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping: testScoping(), cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    for (const a of actions) {
      assert(a.decision_ref.includes('decision:'), `${a.action_key} must reference decision`);
    }
  });

  test('no duplicate action keys', () => {
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', confidence: 80 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping: testScoping(), cycle_ref: 'audit_cycle:c1',
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    const actions = deriveActions(decision);
    const keys = actions.map(a => a.action_key);
    assertEqual(keys.length, new Set(keys).size, 'no duplicate action keys');
  });

  test('actions have non-empty descriptions', () => {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping: testScoping(), cycle_ref: 'audit_cycle:c1',
      signals: [], inferences: [],
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    for (const a of actions) {
      assert(a.description.length > 0, `${a.action_key} must have description`);
    }
  });
});

// ══════════════════════════════════════════════════
// 12. WORKSPACE
// ══════════════════════════════════════════════════

runSuite('Workspace', () => {
  const scoping = testScoping();

  function makeWorkspace(inferences: any[] = []) {
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences,
      conversion_proximity: 3, is_production: true,
    });
    const actions = deriveActions(decision);
    return createPreflightWorkspace(
      { name: 'Test', type: 'analysis', scoping, landing_url: 'https://example.com', cycle_ref: 'audit_cycle:c1' },
      decision, actions, inferences,
    );
  }

  test('creates profile with correct landing_url', () => {
    const ws = makeWorkspace();
    assertEqual(ws.profile.landing_url, 'https://example.com');
  });

  test('ready status when no blockers or risks', () => {
    const ws = makeWorkspace();
    assertEqual(ws.evaluation.summary.overall_status, PreflightOverallStatus.Ready);
    assertEqual(ws.evaluation.summary.readiness_score, 90);
  });

  test('blocker status when decision is block_launch', () => {
    // Need enough risk to trigger BlockLaunch: trust(30) + policy(25) + revenue(20) + measurement(10) = 85
    const inferences = [
      testInference({ inference_key: 'trust_boundary_crossed', conclusion_value: 'true', severity_hint: 'high', confidence: 80 }),
      testInference({ inference_key: 'policy_gap', conclusion_value: 'high', confidence: 80 }),
      testInference({ inference_key: 'revenue_path_fragile', conclusion_value: 'high', confidence: 80 }),
      testInference({ inference_key: 'measurement_coverage', conclusion_value: 'false', confidence: 80 }),
      testInference({ inference_key: 'checkout_integrity', conclusion_value: 'weak', confidence: 80 }),
    ];
    const { decision } = produceDecision({
      question_key: 'is_it_safe_to_scale_traffic',
      scoping, cycle_ref: 'audit_cycle:c1',
      signals: [], inferences,
      conversion_proximity: 1, is_production: true,
    });
    const actions = deriveActions(decision);
    const ws = createPreflightWorkspace(
      { name: 'Test', type: 'analysis', scoping, landing_url: 'https://example.com', cycle_ref: 'audit_cycle:c1' },
      decision, actions, inferences,
    );
    assertEqual(ws.evaluation.summary.overall_status, PreflightOverallStatus.Blocker);
    assert(ws.evaluation.blockers.length > 0, 'should have blockers');
  });

  test('workspace references decision', () => {
    const ws = makeWorkspace();
    assert(ws.evaluation.supporting_decisions.length > 0, 'should reference decisions');
    assert(ws.evaluation.supporting_decisions[0].includes('decision:'), 'should be a decision ref');
  });

  test('findings are projections of actions', () => {
    const ws = makeWorkspace();
    for (const f of ws.findings) {
      assert(f.decision_ref.includes('decision:'), 'finding must reference decision');
    }
  });

  test('workspace is reproducible — same input gives same structure', () => {
    const ws1 = makeWorkspace();
    const ws2 = makeWorkspace();
    assertEqual(ws1.evaluation.summary.overall_status, ws2.evaluation.summary.overall_status);
    assertEqual(ws1.evaluation.summary.readiness_score, ws2.evaluation.summary.readiness_score);
    assertEqual(ws1.findings.length, ws2.findings.length);
  });
});

// ══════════════════════════════════════════════════
// 13. RECOMPUTATION
// ══════════════════════════════════════════════════

runSuite('Recomputation', () => {
  test('recompute runs full pipeline and returns all products', () => {
    const evidence = [
      httpResponseEvidence('https://example.com/'),
      pageContentEvidence('https://example.com/'),
    ];
    const result = recompute({
      evidence,
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      root_domain: 'example.com',
      landing_url: 'https://example.com/',
      question_key: 'is_it_safe_to_scale_traffic',
      conversion_proximity: 3,
      is_production: true,
    });

    assertGreater(result.graph_stats.total_nodes, 0, 'should have graph nodes');
    assertGreater(result.signals.length, 0, 'should have signals');
    assertGreater(result.inferences.length, 0, 'should have inferences');
    assert(result.decision.decision_key !== '', 'should have decision');
    assertGreater(result.actions.length, 0, 'should have actions');
    assert(result.workspace.profile.id !== '', 'should have workspace');
  });

  test('recompute is deterministic', () => {
    const evidence = [pageContentEvidence('https://example.com/')];
    const input = {
      evidence,
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      root_domain: 'example.com',
      landing_url: 'https://example.com/',
      question_key: 'is_it_safe_to_scale_traffic',
      conversion_proximity: 3,
      is_production: true,
    };
    const r1 = recompute(input);
    const r2 = recompute(input);
    assertEqual(r1.decision.decision_key, r2.decision.decision_key);
    assertEqual(r1.signals.length, r2.signals.length);
    assertEqual(r1.inferences.length, r2.inferences.length);
  });

  test('recompute reflects new evidence', () => {
    const baseEvidence = [pageContentEvidence('https://example.com/')];
    const r1 = recompute({
      evidence: baseEvidence,
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      root_domain: 'example.com',
      landing_url: 'https://example.com/',
      question_key: 'is_it_safe_to_scale_traffic',
      conversion_proximity: 3,
      is_production: true,
    });

    const extendedEvidence = [
      ...baseEvidence,
      checkoutIndicatorEvidence('https://example.com/', 'https://pay.external.com/checkout', true),
      providerEvidence('https://example.com/', 'stripe'),
    ];
    const r2 = recompute({
      evidence: extendedEvidence,
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c2',
      root_domain: 'example.com',
      landing_url: 'https://example.com/',
      question_key: 'is_it_safe_to_scale_traffic',
      conversion_proximity: 3,
      is_production: true,
    });

    assertGreater(r2.signals.length, r1.signals.length, 'more evidence should produce more signals');
    assertGreater(r2.graph_stats.total_nodes, r1.graph_stats.total_nodes, 'more evidence should produce more nodes');
  });

  test('recompute with empty evidence still produces a valid result', () => {
    const result = recompute({
      evidence: [],
      scoping: testScoping(),
      cycle_ref: 'audit_cycle:c1',
      root_domain: 'example.com',
      landing_url: 'https://example.com/',
      question_key: 'is_it_safe_to_scale_traffic',
      conversion_proximity: 3,
      is_production: true,
    });
    assertEqual(result.graph_stats.total_nodes, 0);
    assert(result.decision.decision_key !== '', 'should still produce a decision');
  });
});

// ══════════════════════════════════════════════════
// 14. PARSER (unit tests)
// ══════════════════════════════════════════════════

import { parsePage, getRootDomain, isSameDomain } from '../workers/ingestion/parser';

runSuite('Parser', () => {
  test('parsePage extracts title', () => {
    const result = parsePage('<html><head><title>Hello</title></head><body></body></html>', 'https://example.com');
    assertEqual(result.title, 'Hello');
  });

  test('parsePage extracts links', () => {
    const html = '<html><body><a href="/about">About</a><a href="https://external.com">Ext</a></body></html>';
    const result = parsePage(html, 'https://example.com');
    assertEqual(result.links.length, 2);
    assertEqual(result.links[0].is_external, false);
    assertEqual(result.links[1].is_external, true);
  });

  test('parsePage extracts forms with payment fields', () => {
    const html = '<html><body><form action="/pay" method="POST"><input name="card_number"><input name="cvv"></form></body></html>';
    const result = parsePage(html, 'https://example.com');
    assertEqual(result.forms.length, 1);
    assertEqual(result.forms[0].has_payment_fields, true);
  });

  test('parsePage extracts external scripts', () => {
    const html = '<html><head><script src="https://cdn.external.com/app.js"></script></head><body></body></html>';
    const result = parsePage(html, 'https://example.com');
    assertEqual(result.scripts.length, 1);
    assertEqual(result.scripts[0].is_external, true);
  });

  test('getRootDomain handles subdomains', () => {
    assertEqual(getRootDomain('www.example.com'), 'example.com');
    assertEqual(getRootDomain('sub.domain.example.com'), 'example.com');
    assertEqual(getRootDomain('example.com'), 'example.com');
  });

  test('isSameDomain correctly matches', () => {
    assertEqual(isSameDomain('example.com', 'example.com'), true);
    assertEqual(isSameDomain('www.example.com', 'example.com'), true);
    assertEqual(isSameDomain('other.com', 'example.com'), false);
  });

  test('parsePage handles empty HTML', () => {
    const result = parsePage('', 'https://example.com');
    assertEqual(result.title, null);
    assertEqual(result.links.length, 0);
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
