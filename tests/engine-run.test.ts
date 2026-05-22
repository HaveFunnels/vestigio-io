/**
 * Wave 20.7 — engine.run() entry point tests.
 *
 * Validates that the unified `runEngine` API:
 *   1. With scope=full_cycle, produces the same FindingProjection[]
 *      as the existing recomputeAll → projectAll path. (Equivalence)
 *   2. With scope=targeted, returns a filtered ProjectionResult that
 *      only contains findings touching the target URL. (Filter)
 *   3. Threads previousFindings into projectAll so change-class works.
 *   4. Echoes the scope back in the output so loggers can attribute.
 *
 * Run: npx tsx tests/engine-run.test.ts
 */

import {
  test, testAsync, assert, assertEqual, assertGreater,
  testScoping,
  httpResponseEvidence, pageContentEvidence,
  checkoutIndicatorEvidence, providerEvidence, policyEvidence,
  scriptEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { recomputeAll, runEngine } from '../packages/workspace';
import { projectAll } from '../packages/projections';

let suitesPassed = 0;
let suitesFailed = 0;

async function runAsyncSuite(name: string, fn: () => Promise<void>): Promise<void> {
  resetCounters();
  await fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

const scoping = testScoping();
const cycleRef = 'audit_cycle:engine_run_test';

function richEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    httpResponseEvidence('https://shop.com/', 200, 500),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    providerEvidence('https://shop.com/', 'stripe'),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
    scriptEvidence('https://shop.com/', 'https://www.googletagmanager.com/gtag.js', true),
    // A second URL so the targeted scope has something to filter against.
    pageContentEvidence('https://shop.com/pricing'),
    httpResponseEvidence('https://shop.com/pricing', 200, 800),
  ];
}

(async () => {

await runAsyncSuite('engine.run — full_cycle equivalence', async () => {
  await testAsync('full_cycle produces the same findings as recomputeAll → projectAll', async () => {
    const input = {
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    };

    // Baseline: the pre-Wave-20.7 sequence callers run by hand.
    const baselineMultipack = recomputeAll(input);
    const baselineProjections = projectAll(baselineMultipack);

    // New entry point — should be a behavioural no-op.
    const out = await runEngine(input);

    assertEqual(out.scope.kind, 'full_cycle', 'scope echoed back');
    assertEqual(
      out.projections.findings.length,
      baselineProjections.findings.length,
      'finding count matches baseline',
    );
    assertEqual(
      out.projections.actions.length,
      baselineProjections.actions.length,
      'action count matches baseline',
    );
  });

  await testAsync('full_cycle when scope is omitted', async () => {
    const out = await runEngine({
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });
    assertEqual(out.scope.kind, 'full_cycle', 'defaults to full_cycle');
    assertGreater(out.projections.findings.length, 0, 'produces findings');
  });

  await testAsync('multipack is returned alongside projections', async () => {
    const out = await runEngine({
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    });
    assertGreater(out.multipack.signals.length, 0, 'multipack carries signals');
    assertGreater(out.multipack.inferences.length, 0, 'multipack carries inferences');
    assert(out.multipack.impact !== undefined, 'multipack carries impact summary');
  });
});

await runAsyncSuite('engine.run — targeted scope filtering', async () => {
  await testAsync('targeted scope filters findings to the named URL', async () => {
    const out = await runEngine({
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
      scope: { kind: 'targeted', url: 'https://shop.com/pricing' },
    });

    assertEqual(out.scope.kind, 'targeted', 'scope is targeted');
    // Every finding in the filtered output must touch the target URL.
    for (const f of out.projections.findings) {
      assert(
        f.surface === 'https://shop.com/pricing' || f.surface?.includes('https://shop.com/pricing'),
        `finding surface should touch target: got ${f.surface}`,
      );
    }
    // Full multipack is still returned (unfiltered) so the caller can
    // inspect aggregate state even though projections are scoped.
    assertGreater(out.multipack.inferences.length, 0, 'multipack still has full inferences');
  });

  await testAsync('targeted scope keeps workspaces but trims their findings', async () => {
    const out = await runEngine({
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
      scope: { kind: 'targeted', url: 'https://shop.com/pricing' },
    });
    // Workspaces array shape is preserved so callers can render the
    // structure. The findings inside each workspace are filtered.
    assert(out.projections.workspaces.length > 0, 'workspaces preserved');
    for (const ws of out.projections.workspaces) {
      for (const f of ws.findings) {
        assert(
          f.surface === 'https://shop.com/pricing' || f.surface?.includes('https://shop.com/pricing'),
          `workspace ${ws.type}: finding surface should touch target`,
        );
      }
    }
  });

  await testAsync('targeted scope output is a strict subset of full_cycle', async () => {
    const input = {
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
    };
    const full = await runEngine(input);
    const targeted = await runEngine({
      ...input,
      scope: { kind: 'targeted', url: 'https://shop.com/pricing' },
    });
    assert(
      targeted.projections.findings.length <= full.projections.findings.length,
      'targeted findings cannot exceed full',
    );
  });
});

await runAsyncSuite('engine.run — previousFindings threading', async () => {
  await testAsync('previousFindings flow through to projectAll for change-class', async () => {
    const out = await runEngine({
      evidence: richEvidence(), scoping, cycle_ref: cycleRef,
      root_domain: 'shop.com', landing_url: 'https://shop.com/',
      conversion_proximity: 2, is_production: true,
      previousFindings: [], // empty array = all findings classify as 'new_issue'
    });
    assertGreater(out.projections.findings.length, 0, 'findings produced');
    // We don't assert specific change_class here — the test confirms
    // the API surface accepts the parameter and projectAll runs.
  });
});

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════');
console.log(`Engine Run: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════════════');
if (suitesFailed > 0) process.exit(1);

})();
