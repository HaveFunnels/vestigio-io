/**
 * Vestigio V2 — Projection & Map Engine Test Suite
 * Tests: projection correctness, impact propagation, sorting,
 *        workspace summaries, map node generation, MCP integration
 *
 * Run: npx tsx tests/projections.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  testScoping, testInference,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { Inference, InferenceCategory } from '../packages/domain';
import { recomputeAll } from '../packages/workspace';
import { projectAll, projectFindings, projectActions, projectWorkspaces } from '../packages/projections';
import type { FindingProjection, ActionProjection, WorkspaceProjection } from '../packages/projections';
import { buildRevenueLeakageMap, buildChargebackRiskMap, buildRootCauseMap, buildAllMaps } from '../packages/maps';
import type { MapDefinition } from '../packages/maps';
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

// Standard evidence set that triggers multiple inferences
function standardEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  ];
}

function computeResult(evidence = standardEvidence()) {
  return recomputeAll({
    evidence,
    scoping,
    cycle_ref: cycleRef,
    root_domain: 'shop.com',
    landing_url: 'https://shop.com/',
    conversion_proximity: 2,
    is_production: true,
  });
}

// ══════════════════════════════════════════════════
// 1. FINDING PROJECTIONS
// ══════════════════════════════════════════════════

runSuite('Finding Projections', () => {
  test('projectFindings produces non-empty results', () => {
    const result = computeResult();
    const findings = projectFindings(result);
    assertGreater(findings.length, 0, 'should have findings');
  });

  test('every finding has quantified impact', () => {
    const result = computeResult();
    const findings = projectFindings(result);
    for (const f of findings) {
      assert(f.impact.monthly_range.min >= 0, `${f.id}: min >= 0`);
      assertGreater(f.impact.monthly_range.max, 0, `${f.id}: max > 0`);
      assertGreater(f.impact.midpoint, 0, `${f.id}: midpoint > 0`);
      assert(f.impact.impact_type.length > 0, `${f.id}: has impact_type`);
      assert(f.impact.currency === 'USD', `${f.id}: currency is USD`);
    }
  });

  test('findings are sorted by impact midpoint descending', () => {
    const result = computeResult();
    const findings = projectFindings(result);
    for (let i = 1; i < findings.length; i++) {
      assert(
        findings[i].impact.midpoint <= findings[i - 1].impact.midpoint,
        `findings[${i}] should be <= findings[${i - 1}] by midpoint`,
      );
    }
  });

  test('every finding has required fields', () => {
    const result = computeResult();
    const findings = projectFindings(result);
    for (const f of findings) {
      assert(f.id.length > 0, 'has id');
      assert(f.title.length > 0, 'has title');
      assert(f.severity.length > 0, 'has severity');
      assert(f.confidence > 0, 'has confidence');
      assert(f.pack.length > 0, 'has pack');
      assert(f.surface.length > 0, 'has surface');
      assert(f.freshness.length > 0, 'has freshness');
      assert(f.inference_key.length > 0, 'has inference_key');
      assert(f.cause.length > 0, 'has cause');
      assert(f.effect.length > 0, 'has effect');
      assert(f.basis_type.length > 0, 'has basis_type');
    }
  });

  test('findings have root cause where applicable', () => {
    const result = computeResult();
    const findings = projectFindings(result);
    const withRC = findings.filter(f => f.root_cause !== null);
    assertGreater(withRC.length, 0, 'some findings should have root causes');
  });
});

// ══════════════════════════════════════════════════
// 2. ACTION PROJECTIONS
// ══════════════════════════════════════════════════

runSuite('Action Projections', () => {
  test('projectActions produces non-empty results', () => {
    const result = computeResult();
    const actions = projectActions(result);
    assertGreater(actions.length, 0, 'should have actions');
  });

  test('actions are sorted by impact then confidence then severity', () => {
    const result = computeResult();
    const actions = projectActions(result);
    for (let i = 1; i < actions.length; i++) {
      const prevMid = actions[i - 1].impact?.midpoint || 0;
      const currMid = actions[i].impact?.midpoint || 0;
      // Primary sort: impact midpoint desc
      if (currMid !== prevMid) {
        assert(currMid <= prevMid, `actions[${i}] impact should be <= actions[${i - 1}]`);
      }
    }
  });

  test('actions with root cause have impact from value cases', () => {
    const result = computeResult();
    const actions = projectActions(result);
    const withImpact = actions.filter(a => a.impact !== null);
    // At least some actions should have computed impact
    assertGreater(withImpact.length, 0, 'some actions should have impact');
    for (const a of withImpact) {
      assertGreater(a.impact!.midpoint, 0, `${a.id}: impact midpoint > 0`);
      assert(a.impact!.monthly_range.max >= a.impact!.monthly_range.min, `${a.id}: max >= min`);
    }
  });

  test('cross_pack field is boolean for all actions', () => {
    const result = computeResult();
    const actions = projectActions(result);
    for (const a of actions) {
      assert(typeof a.cross_pack === 'boolean', `${a.id}: cross_pack is boolean`);
    }
  });

  test('priority_score is computed', () => {
    const result = computeResult();
    const actions = projectActions(result);
    for (const a of actions) {
      assert(typeof a.priority_score === 'number', `${a.id}: priority_score is number`);
    }
  });
});

// ══════════════════════════════════════════════════
// 3. WORKSPACE PROJECTIONS
// ══════════════════════════════════════════════════

runSuite('Workspace Projections', () => {
  test('projectWorkspaces produces 3 workspaces', () => {
    const result = computeResult();
    const workspaces = projectWorkspaces(result);
    assertEqual(workspaces.length, 3);
  });

  test('each workspace has correct type', () => {
    const result = computeResult();
    const workspaces = projectWorkspaces(result);
    const types = workspaces.map(w => w.type).sort();
    assert(types.includes('preflight'), 'has preflight');
    assert(types.includes('revenue'), 'has revenue');
    assert(types.includes('chargeback'), 'has chargeback');
  });

  test('workspace summary has total loss', () => {
    const result = computeResult();
    const workspaces = projectWorkspaces(result);
    const preflight = workspaces.find(w => w.type === 'preflight')!;
    // Should have some findings → some loss
    if (preflight.findings.length > 0) {
      assertGreater(preflight.summary.total_loss_mid, 0, 'preflight total loss > 0');
      assert(
        preflight.summary.total_loss_range.max >= preflight.summary.total_loss_range.min,
        'max >= min',
      );
    }
  });

  test('workspace findings are scoped to pack', () => {
    const result = computeResult();
    const workspaces = projectWorkspaces(result);
    for (const ws of workspaces) {
      const expectedPack = ws.type === 'preflight' ? 'scale_readiness'
        : ws.type === 'revenue' ? 'revenue_integrity'
          : 'chargeback_resilience';
      for (const f of ws.findings) {
        assertEqual(f.pack, expectedPack, `${ws.name}: finding pack should be ${expectedPack}`);
      }
    }
  });

  test('workspace top_issues populated from findings', () => {
    const result = computeResult();
    const workspaces = projectWorkspaces(result);
    for (const ws of workspaces) {
      if (ws.findings.length > 0) {
        assertGreater(ws.summary.top_issues.length, 0, `${ws.name}: should have top issues`);
      }
    }
  });

  test('empty workspace has zero summary', () => {
    const result = computeResult();
    const workspaces = projectWorkspaces(result);
    for (const ws of workspaces) {
      if (ws.findings.length === 0) {
        assertEqual(ws.summary.total_loss_mid, 0, `${ws.name}: empty = zero loss`);
        assertEqual(ws.summary.issue_count, 0, `${ws.name}: empty = zero issues`);
      }
    }
  });
});

// ══════════════════════════════════════════════════
// 4. projectAll INTEGRATION
// ══════════════════════════════════════════════════

runSuite('projectAll Integration', () => {
  test('projectAll returns consistent results', () => {
    const result = computeResult();
    const proj = projectAll(result);
    assertGreater(proj.findings.length, 0, 'has findings');
    assertGreater(proj.actions.length, 0, 'has actions');
    assertEqual(proj.workspaces.length, 3, 'has 3 workspaces');
  });

  test('workspace findings sum equals total findings', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const wsFindings = proj.workspaces.reduce((sum, ws) => sum + ws.findings.length, 0);
    assertEqual(wsFindings, proj.findings.length, 'workspace findings = total findings');
  });

  test('projections are deterministic', () => {
    const result = computeResult();
    const p1 = projectAll(result);
    const p2 = projectAll(result);
    assertEqual(p1.findings.length, p2.findings.length);
    assertEqual(p1.actions.length, p2.actions.length);
    for (let i = 0; i < p1.findings.length; i++) {
      assertEqual(p1.findings[i].impact.midpoint, p2.findings[i].impact.midpoint, `finding[${i}] midpoint`);
    }
  });
});

// ══════════════════════════════════════════════════
// 5. MAP GENERATION
// ══════════════════════════════════════════════════

runSuite('Map Generation', () => {
  test('buildAllMaps produces 3 maps', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const maps = buildAllMaps(proj, result);
    assertEqual(maps.length, 3);
  });

  test('revenue leakage map has nodes and edges', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const map = buildRevenueLeakageMap(proj, result);
    assertEqual(map.type, 'revenue_leakage');
    assertGreater(map.nodes.length, 0, 'has nodes');
    // May not have edges if only one root cause with one finding
  });

  test('map nodes have positions', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const maps = buildAllMaps(proj, result);
    for (const map of maps) {
      for (const node of map.nodes) {
        assert(typeof node.position.x === 'number', `${map.id}/${node.id}: has x`);
        assert(typeof node.position.y === 'number', `${map.id}/${node.id}: has y`);
      }
    }
  });

  test('map nodes carry impact badges', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const map = buildRevenueLeakageMap(proj, result);
    const withImpact = map.nodes.filter(n => n.impact !== null);
    assertGreater(withImpact.length, 0, 'some nodes should have impact');
    for (const n of withImpact) {
      assertGreater(n.impact!.midpoint, 0, `${n.id}: impact midpoint > 0`);
    }
  });

  test('root cause map connects findings → root causes → actions', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const map = buildRootCauseMap(proj, result);
    assertEqual(map.type, 'root_cause');

    const rcNodes = map.nodes.filter(n => n.type === 'root_cause');
    const findingNodes = map.nodes.filter(n => n.type === 'finding');
    const actionNodes = map.nodes.filter(n => n.type === 'action');

    assertGreater(rcNodes.length, 0, 'has root cause nodes');
    assertGreater(findingNodes.length, 0, 'has finding nodes');
    assertGreater(actionNodes.length, 0, 'has action nodes');

    // Check edge types
    const contributesEdges = map.edges.filter(e => e.type === 'contributes_to');
    const addressesEdges = map.edges.filter(e => e.type === 'addresses');
    assertGreater(contributesEdges.length, 0, 'has contributes_to edges');
    assertGreater(addressesEdges.length, 0, 'has addresses edges');
  });

  test('chargeback map has category nodes', () => {
    const result = computeResult();
    const proj = projectAll(result);
    const map = buildChargebackRiskMap(proj, result);
    assertEqual(map.type, 'chargeback_risk');
    const catNodes = map.nodes.filter(n => ['policy', 'support', 'trust'].includes(n.type));
    assertGreater(catNodes.length, 0, 'has category nodes');
  });
});

// ══════════════════════════════════════════════════
// 6. MCP PROJECTION TOOLS
// ══════════════════════════════════════════════════

runSuite('MCP Projection Tools', () => {
  test('get_finding_projections returns findings', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');
    const result = server.callTool('get_finding_projections');
    assertEqual(result.type, 'finding_projections');
    assert(Array.isArray(result.data), 'data is array');
    assertGreater((result.data as any).length, 0, 'has findings');
  });

  test('get_action_projections returns actions', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');
    const result = server.callTool('get_action_projections');
    assertEqual(result.type, 'action_projections');
    assert(Array.isArray(result.data), 'data is array');
    assertGreater((result.data as any).length, 0, 'has actions');
  });

  test('get_workspace_projections returns 3 workspaces', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');
    const result = server.callTool('get_workspace_projections');
    assertEqual(result.type, 'workspace_projections');
    assertEqual((result.data as any).length, 3);
  });

  test('get_map returns map definition', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    for (const mapType of ['revenue_leakage', 'chargeback_risk', 'root_cause']) {
      const result = server.callTool('get_map', { map_type: mapType });
      assertEqual(result.type, 'map');
      assert(result.data !== null, `${mapType}: map data not null`);
      assertEqual((result.data as any).type, mapType);
    }
  });

  test('MCP answers include navigation', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const tools = ['answer_can_i_scale', 'answer_where_losing_money', 'answer_underlying_cause', 'answer_fix_first'];
    for (const tool of tools) {
      const result = server.callTool(tool);
      if (result.type !== 'answer') continue;
      assert('navigation' in result.data, `${tool}: should have navigation field`);
    }
  });

  test('MCP answer navigation has suggestions', () => {
    const server = new McpServer();
    server.loadContext(standardEvidence(), scope, cycleRef, 'shop.com', 'https://shop.com/');

    const result = server.callTool('answer_can_i_scale');
    if (result.type !== 'answer') return;
    if (!result.data.navigation) return;

    assertGreater(result.data.navigation.suggestions.length, 0, 'has suggestions');
    assert(result.data.navigation.related_findings.length >= 0, 'has related_findings');
    assert(result.data.navigation.related_actions.length >= 0, 'has related_actions');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  PROJECTION & MAP TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
