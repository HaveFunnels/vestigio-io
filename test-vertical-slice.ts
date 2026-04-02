/**
 * ────────────────────────────────────────────────
 * Vestigio V2 — Full Vertical Slice Test
 * ────────────────────────────────────────────────
 *
 * Validates the complete pipeline:
 *   domain -> ingestion -> evidence -> graph -> signals -> inference
 *   -> risk evaluation -> decision (scale_readiness) -> actions -> workspace
 *
 * Run: npx ts-node --skip-project test-vertical-slice.ts <domain>
 * Example: npx ts-node --skip-project test-vertical-slice.ts example.com
 */

import { URL } from 'url';
import { runIngestion, IngestionInput } from './workers/ingestion';
import { EvidenceStore, CycleStore } from './packages/evidence';
import { buildGraph, GraphQuery } from './packages/graph';
import { extractSignals } from './packages/signals';
import { computeInferences } from './packages/inference';
import { produceDecision } from './packages/decision';
import { deriveActions } from './packages/actions';
import { createPreflightWorkspace } from './packages/workspace';
import { CycleType, Scoping, makeRef } from './packages/domain';
import { getRootDomain } from './workers/ingestion/parser';

async function main() {
  const domain = process.argv[2];
  if (!domain) {
    console.error('Usage: npx ts-node --skip-project test-vertical-slice.ts <domain>');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  VESTIGIO V2 — Full Vertical Slice');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Domain: ${domain}`);
  console.log('═══════════════════════════════════════════════\n');

  // ── Setup ──────────────────────────────────────
  const workspaceRef = 'workspace:ws_1';
  const environmentRef = 'environment:env_1';
  const websiteRef = 'website:web_1';

  const cycleStore = new CycleStore();
  const evidenceStore = new EvidenceStore();

  const cycle = cycleStore.create({
    id: 'cycle_1',
    workspace_ref: workspaceRef,
    environment_ref: environmentRef,
    website_ref: websiteRef,
    cycle_type: CycleType.Full,
    trigger_source: 'manual',
  });

  const cycleRef = makeRef('audit_cycle', cycle.id);
  const scoping: Scoping = {
    workspace_ref: workspaceRef,
    environment_ref: environmentRef,
    subject_ref: websiteRef,
    path_scope: null,
  };

  // ── Phase 1: Ingestion ──────────────────────────
  console.log('▸ Phase 1: Ingestion...');
  cycleStore.updateStatus(cycle.id, 'collecting');

  const ingestionInput: IngestionInput = {
    domain,
    workspace_ref: workspaceRef,
    environment_ref: environmentRef,
    website_ref: websiteRef,
    cycle_ref: cycleRef,
  };

  const ingestionResult = await runIngestion(ingestionInput);
  evidenceStore.addMany(ingestionResult.evidence);

  console.log(`  Pages fetched: ${ingestionResult.pages_fetched}`);
  console.log(`  Evidence items: ${ingestionResult.evidence.length}`);
  console.log(`  Errors: ${ingestionResult.errors.length}`);
  if (ingestionResult.errors.length > 0) {
    for (const err of ingestionResult.errors.slice(0, 5)) {
      console.log(`    - ${err.url}: ${err.error}`);
    }
  }
  console.log();

  if (ingestionResult.evidence.length === 0) {
    console.error('✘ No evidence collected. Cannot proceed.');
    process.exit(1);
  }

  // ── Phase 2: Graph ──────────────────────────────
  console.log('▸ Phase 2: Building evidence graph...');
  cycleStore.updateStatus(cycle.id, 'processing');

  const rootUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const rootDomain = getRootDomain(new URL(rootUrl).hostname);
  const graph = buildGraph(ingestionResult.evidence, rootDomain, cycleRef);
  const graphQuery = new GraphQuery(graph);
  const stats = graphQuery.stats();

  console.log(`  Nodes: ${stats.total_nodes} (${stats.page_count} pages, ${stats.host_count} hosts)`);
  console.log(`  Edges: ${stats.total_edges}`);
  console.log(`  External hosts: ${stats.external_host_count}`);
  console.log(`  Providers detected: ${stats.provider_count}`);
  console.log(`  Policy pages: ${stats.policy_count}`);
  console.log(`  Redirects: ${stats.redirect_count}`);
  console.log();

  // ── Phase 3: Signals + Inference ────────────────
  console.log('▸ Phase 3: Extracting signals...');
  cycleStore.updateStatus(cycle.id, 'computing');

  const signals = extractSignals(ingestionResult.evidence, graph, scoping, cycleRef);
  console.log(`  Signals: ${signals.length}`);
  for (const sig of signals) {
    console.log(`    [${sig.category}] ${sig.attribute} = ${sig.value} (confidence: ${sig.confidence})`);
  }
  console.log();

  console.log('▸ Phase 3: Computing inferences...');
  const inferences = computeInferences(signals, scoping, cycleRef);
  console.log(`  Inferences: ${inferences.length}`);
  for (const inf of inferences) {
    console.log(`    [${inf.category}] ${inf.conclusion} = ${inf.conclusion_value} (confidence: ${inf.confidence})`);
    console.log(`      → ${inf.reasoning}`);
  }
  console.log();

  // ── Phase 4: Decision ───────────────────────────
  console.log('▸ Phase 4: Producing decision (scale_readiness_pack)...');

  const { decision, risk_evaluation } = produceDecision({
    question_key: 'is_it_safe_to_scale_traffic',
    scoping,
    cycle_ref: cycleRef,
    signals,
    inferences,
    conversion_proximity: 2,
    is_production: true,
  });

  console.log(`  Decision: ${decision.decision_key}`);
  console.log(`  Category: ${decision.category}`);
  console.log(`  Status: ${decision.status}`);
  console.log(`  Impact: ${decision.decision_impact}`);
  console.log(`  Severity: ${decision.effective_severity}`);
  console.log(`  Risk Score: ${risk_evaluation.raw_risk_score}/100`);
  console.log(`  Confidence: ${decision.confidence_score}/100`);
  console.log(`  Outcome: ${decision.primary_outcome}`);
  console.log(`  Summary: ${decision.why.summary}`);
  console.log(`  Primary Action: ${decision.actions.primary}`);
  if (decision.actions.secondary.length > 0) {
    console.log('  Secondary Actions:');
    for (const a of decision.actions.secondary) {
      console.log(`    - ${a}`);
    }
  }
  console.log();

  // ── Actions ─────────────────────────────────────
  console.log('▸ Deriving actions...');
  const actions = deriveActions(decision);
  console.log(`  Actions: ${actions.length}`);
  for (const action of actions) {
    console.log(`    [${action.action_type}] P${action.priority}: ${action.title}`);
  }
  console.log();

  // ── Workspace ───────────────────────────────────
  console.log('▸ Creating workspace (preflight)...');
  const workspace = createPreflightWorkspace(
    {
      name: 'Preflight',
      type: 'analysis',
      scoping,
      landing_url: rootUrl,
      cycle_ref: cycleRef,
    },
    decision,
    actions,
    inferences,
  );

  console.log(`  Profile: ${workspace.profile.id}`);
  console.log(`  Evaluation: ${workspace.evaluation.id}`);
  console.log(`  Overall Status: ${workspace.evaluation.summary.overall_status}`);
  console.log(`  Readiness Score: ${workspace.evaluation.summary.readiness_score}/100`);
  console.log(`  Confidence Score: ${workspace.evaluation.summary.confidence_score}/100`);
  console.log(`  Blockers: ${workspace.evaluation.blockers.length}`);
  console.log(`  Risks: ${workspace.evaluation.risks.length}`);
  console.log(`  Findings: ${workspace.findings.length}`);
  console.log();

  // ── Update cycle ────────────────────────────────
  cycleStore.updateStatus(cycle.id, 'completed');
  cycleStore.updateCoverage(cycle.id, {
    pages_discovered: ingestionResult.pages_fetched,
    pages_fetched: ingestionResult.pages_fetched,
    pages_analyzed: ingestionResult.pages_fetched,
    evidence_count: ingestionResult.evidence.length,
    signals_count: signals.length,
    inferences_count: inferences.length,
    decisions_count: 1,
  });

  // ── Validation ──────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  VALIDATION CHECKLIST');
  console.log('═══════════════════════════════════════════════');

  const checks = [
    { label: 'Domain ingested', ok: ingestionResult.pages_fetched > 0 },
    { label: 'Evidence stored', ok: evidenceStore.count() > 0 },
    { label: 'Graph built', ok: stats.total_nodes > 0 },
    { label: 'Signals generated', ok: signals.length > 0 },
    { label: 'Inferences created', ok: inferences.length > 0 },
    { label: 'scale_readiness decision produced', ok: decision.question_key === 'is_it_safe_to_scale_traffic' },
    { label: 'Actions derived', ok: actions.length > 0 },
    { label: 'Workspace created', ok: workspace.profile.id != null },
    { label: 'Cycle completed', ok: cycleStore.get(cycle.id)?.status === 'completed' },
  ];

  let allPassed = true;
  for (const check of checks) {
    const icon = check.ok ? '✔' : '✘';
    console.log(`  ${icon} ${check.label}`);
    if (!check.ok) allPassed = false;
  }

  console.log();
  if (allPassed) {
    console.log('  ✔ ALL CHECKS PASSED — Full vertical slice validated.');
  } else {
    console.log('  ✘ SOME CHECKS FAILED');
  }
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
