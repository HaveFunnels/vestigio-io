/**
 * Wave 21.5 — value-caught tests
 *
 * The core function takes a PrismaClient + envId + window and returns
 * a ValueCaughtSummary. We mock prisma.finding.findMany so the test
 * stays hermetic (no DB connection) and validates the aggregation +
 * window math.
 *
 * Run: npx tsx tests/value-caught.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  computeValueCaught,
  computeValueCaughtForPriorMonth,
  computeValueCaughtForCurrentMonth,
} from '../packages/value-caught';

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

async function runAsyncSuite(name: string, fn: () => Promise<void>): Promise<void> {
  resetCounters();
  await fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

// ──────────────────────────────────────────────
// Mock prisma — only implements the slice the value-caught query needs.
// ──────────────────────────────────────────────

interface MockFinding {
  inferenceKey: string;
  surface: string;
  pack: string;
  impactMin: number;
  impactMax: number;
  impactMidpoint: number;
  statusChangedAt: Date;
  status: string;
  environmentId: string;
  polarity?: string; // Wave 20.6 — distinguishes retention from loss findings
}

function makePrisma(findings: MockFinding[]): any {
  return {
    finding: {
      findMany: async (args: any) => {
        const w = args.where;
        // Two query shapes coexist:
        //   (a) Caught: status='resolved' AND statusChangedAt window
        //   (b) Retention snapshot: polarity='positive' AND status IN ['created','confirmed']
        const matchesStatus = (s: string) => {
          if (typeof w.status === 'string') return s === w.status;
          if (w.status?.in) return (w.status.in as string[]).includes(s);
          return true;
        };
        const matchesWindow = (d: Date) => {
          if (!w.statusChangedAt) return true;
          return d >= w.statusChangedAt.gte && d < w.statusChangedAt.lt;
        };
        const matchesPolarity = (p: string | undefined) => {
          if (!w.polarity) return true;
          return p === w.polarity;
        };
        return findings
          .filter(f =>
            f.environmentId === w.environmentId &&
            matchesStatus(f.status) &&
            matchesWindow(f.statusChangedAt) &&
            matchesPolarity(f.polarity),
          )
          .sort((a, b) => b.impactMidpoint - a.impactMidpoint)
          .map(f => ({
            inferenceKey: f.inferenceKey,
            surface: f.surface,
            pack: f.pack,
            impactMin: f.impactMin,
            impactMax: f.impactMax,
            impactMidpoint: f.impactMidpoint,
            statusChangedAt: f.statusChangedAt,
          }));
      },
    },
  };
}

(async () => {

await runAsyncSuite('computeValueCaught — basic aggregation', async () => {
  await (async () => {
    const tCase = (name: string, fn: () => Promise<void>) =>
      test(name, fn as any);

    await tCase('sums impactMidpoint across all resolved findings in window', async () => {
      const start = new Date(2026, 4, 1); // May 1
      const end = new Date(2026, 5, 1);   // Jun 1
      const prisma = makePrisma([
        { environmentId: 'env_a', status: 'resolved', inferenceKey: 'k1', surface: '/cart', pack: 'revenue_integrity', impactMin: 100, impactMax: 300, impactMidpoint: 200, statusChangedAt: new Date(2026, 4, 5) },
        { environmentId: 'env_a', status: 'resolved', inferenceKey: 'k2', surface: '/checkout', pack: 'revenue_integrity', impactMin: 50, impactMax: 150, impactMidpoint: 100, statusChangedAt: new Date(2026, 4, 20) },
        // Out of window
        { environmentId: 'env_a', status: 'resolved', inferenceKey: 'k3', surface: '/', pack: 'scale_readiness', impactMin: 10, impactMax: 30, impactMidpoint: 20, statusChangedAt: new Date(2026, 3, 28) },
        // Wrong env
        { environmentId: 'env_b', status: 'resolved', inferenceKey: 'k4', surface: '/', pack: 'scale_readiness', impactMin: 1000, impactMax: 3000, impactMidpoint: 2000, statusChangedAt: new Date(2026, 4, 10) },
        // Not resolved
        { environmentId: 'env_a', status: 'confirmed', inferenceKey: 'k5', surface: '/', pack: 'scale_readiness', impactMin: 999, impactMax: 999, impactMidpoint: 999, statusChangedAt: new Date(2026, 4, 10) },
      ]);

      const result = await computeValueCaught(prisma as any, 'env_a', start, end);
      assertEqual(result.resolvedCount, 2, 'only 2 resolved-in-window findings counted');
      assertEqual(result.totalCaughtMidpoint, 300, 'midpoint sum = 200 + 100');
      assertEqual(result.totalCaughtMin, 150, 'min sum = 100 + 50');
      assertEqual(result.totalCaughtMax, 450, 'max sum = 300 + 150');
    });

    await tCase('returns zero summary when no resolved findings', async () => {
      const prisma = makePrisma([]);
      const result = await computeValueCaught(prisma as any, 'env_a', new Date(), new Date());
      assertEqual(result.resolvedCount, 0, 'no findings');
      assertEqual(result.totalCaughtMidpoint, 0, 'zero caught');
      assertEqual(result.topResolved.length, 0, 'empty top list');
    });

    await tCase('topResolved is sorted by impactMidpoint descending', async () => {
      const start = new Date(2026, 4, 1);
      const end = new Date(2026, 5, 1);
      const prisma = makePrisma([
        { environmentId: 'env_a', status: 'resolved', inferenceKey: 'small', surface: '/a', pack: 'p', impactMin: 1, impactMax: 3, impactMidpoint: 2, statusChangedAt: new Date(2026, 4, 5) },
        { environmentId: 'env_a', status: 'resolved', inferenceKey: 'big', surface: '/b', pack: 'p', impactMin: 100, impactMax: 300, impactMidpoint: 200, statusChangedAt: new Date(2026, 4, 5) },
        { environmentId: 'env_a', status: 'resolved', inferenceKey: 'mid', surface: '/c', pack: 'p', impactMin: 10, impactMax: 30, impactMidpoint: 20, statusChangedAt: new Date(2026, 4, 5) },
      ]);
      const result = await computeValueCaught(prisma as any, 'env_a', start, end);
      assertEqual(result.topResolved[0].inferenceKey, 'big', 'biggest first');
      assertEqual(result.topResolved[1].inferenceKey, 'mid', 'mid second');
      assertEqual(result.topResolved[2].inferenceKey, 'small', 'smallest last');
    });

    await tCase('topResolved capped at 5 entries', async () => {
      const start = new Date(2026, 4, 1);
      const end = new Date(2026, 5, 1);
      const findings: MockFinding[] = [];
      for (let i = 0; i < 10; i++) {
        findings.push({
          environmentId: 'env_a', status: 'resolved',
          inferenceKey: `k${i}`, surface: '/', pack: 'p',
          impactMin: i, impactMax: i * 3, impactMidpoint: i * 2,
          statusChangedAt: new Date(2026, 4, 5),
        });
      }
      const result = await computeValueCaught(makePrisma(findings) as any, 'env_a', start, end);
      assertEqual(result.resolvedCount, 10, 'all 10 counted');
      assertEqual(result.topResolved.length, 5, 'topResolved truncated to 5');
    });
  })();
});

await runAsyncSuite('window helpers', async () => {
  await (async () => {
    const tCase = (name: string, fn: () => Promise<void>) =>
      test(name, fn as any);

    await tCase('computeValueCaughtForPriorMonth covers the prior calendar month', async () => {
      // Anchor: 2026-06-15. Prior month = May 1 to Jun 1.
      let capturedStart: Date | undefined;
      let capturedEnd: Date | undefined;
      const fakePrisma: any = {
        finding: {
          findMany: async (args: any) => {
            // Wave 20.6 — computeValueCaught now issues TWO queries in
            // parallel: the caught query (with statusChangedAt) and the
            // retention snapshot (without). Only the caught query
            // populates the window — ignore the retention call.
            if (args.where.statusChangedAt) {
              capturedStart = args.where.statusChangedAt.gte;
              capturedEnd = args.where.statusChangedAt.lt;
            }
            return [];
          },
        },
      };
      await computeValueCaughtForPriorMonth(fakePrisma, 'env_a', new Date(2026, 5, 15));
      assertEqual(capturedStart?.getFullYear(), 2026);
      assertEqual(capturedStart?.getMonth(), 4, 'May (index 4)');
      assertEqual(capturedStart?.getDate(), 1);
      assertEqual(capturedEnd?.getMonth(), 5, 'June 1 (index 5)');
      assertEqual(capturedEnd?.getDate(), 1);
    });

    await tCase('computeValueCaughtForCurrentMonth covers the current calendar month', async () => {
      let capturedStart: Date | undefined;
      let capturedEnd: Date | undefined;
      const fakePrisma: any = {
        finding: {
          findMany: async (args: any) => {
            // Wave 20.6 — computeValueCaught now issues TWO queries in
            // parallel: the caught query (with statusChangedAt) and the
            // retention snapshot (without). Only the caught query
            // populates the window — ignore the retention call.
            if (args.where.statusChangedAt) {
              capturedStart = args.where.statusChangedAt.gte;
              capturedEnd = args.where.statusChangedAt.lt;
            }
            return [];
          },
        },
      };
      await computeValueCaughtForCurrentMonth(fakePrisma, 'env_a', new Date(2026, 5, 15));
      assertEqual(capturedStart?.getMonth(), 5, 'June 1');
      assertEqual(capturedEnd?.getMonth(), 6, 'July 1');
    });

    await tCase('December → January year rollover', async () => {
      let capturedStart: Date | undefined;
      const fakePrisma: any = {
        finding: {
          findMany: async (args: any) => {
            if (args.where.statusChangedAt) {
              capturedStart = args.where.statusChangedAt.gte;
            }
            return [];
          },
        },
      };
      await computeValueCaughtForPriorMonth(fakePrisma, 'env_a', new Date(2026, 0, 5));
      assertEqual(capturedStart?.getFullYear(), 2025, 'prior month of Jan is Dec of last year');
      assertEqual(capturedStart?.getMonth(), 11, 'December (index 11)');
    });
  })();
});

// Wave 20.6 — retention snapshot reads polarity='positive' AND status
// IN ('created','confirmed') across all of time (no window filter). This
// is the "what controls are working today, holding R$ Y/mo safe" frame
// that complements the window-bounded "we caught R$ X this month".
await runAsyncSuite('retention snapshot', async () => {
  await (async () => {
    const tCase = (name: string, fn: () => Promise<void>) =>
      test(name, fn as any);

    await tCase('sums active positive findings regardless of cycle date', async () => {
      const start = new Date(2026, 4, 1);
      const end = new Date(2026, 5, 1);
      const prisma = makePrisma([
        // Active positive findings — should land in retention snapshot
        { environmentId: 'env_a', status: 'confirmed', polarity: 'positive', inferenceKey: 'r1', surface: '/', pack: 'p', impactMin: 200, impactMax: 600, impactMidpoint: 400, statusChangedAt: new Date(2025, 11, 5) },
        { environmentId: 'env_a', status: 'created', polarity: 'positive', inferenceKey: 'r2', surface: '/', pack: 'p', impactMin: 100, impactMax: 300, impactMidpoint: 200, statusChangedAt: new Date(2026, 4, 5) },
        // Resolved positive — gone, not currently retaining anything
        { environmentId: 'env_a', status: 'resolved', polarity: 'positive', inferenceKey: 'r3', surface: '/', pack: 'p', impactMin: 999, impactMax: 999, impactMidpoint: 999, statusChangedAt: new Date(2026, 4, 5) },
        // Active negative — NOT a retention case
        { environmentId: 'env_a', status: 'confirmed', polarity: 'negative', inferenceKey: 'n1', surface: '/', pack: 'p', impactMin: 50, impactMax: 50, impactMidpoint: 50, statusChangedAt: new Date(2026, 4, 5) },
        // Other env
        { environmentId: 'env_b', status: 'confirmed', polarity: 'positive', inferenceKey: 'r4', surface: '/', pack: 'p', impactMin: 9999, impactMax: 9999, impactMidpoint: 9999, statusChangedAt: new Date(2026, 4, 5) },
      ]);
      const result = await computeValueCaught(prisma as any, 'env_a', start, end);
      assertEqual(result.retentionInForceCount, 2, 'only 2 active positive findings');
      assertEqual(result.retentionInForceMidpoint, 600, '400 + 200');
      assertEqual(result.retentionInForceMin, 300, '200 + 100');
      assertEqual(result.retentionInForceMax, 900, '600 + 300');
    });

    await tCase('returns zero retention when no positive findings exist', async () => {
      const prisma = makePrisma([
        { environmentId: 'env_a', status: 'confirmed', polarity: 'negative', inferenceKey: 'n1', surface: '/', pack: 'p', impactMin: 50, impactMax: 50, impactMidpoint: 50, statusChangedAt: new Date() },
      ]);
      const result = await computeValueCaught(prisma as any, 'env_a', new Date(), new Date());
      assertEqual(result.retentionInForceCount, 0);
      assertEqual(result.retentionInForceMidpoint, 0);
    });
  })();
});

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════');
console.log(`Value Caught: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════════════');
if (suitesFailed > 0) process.exit(1);

})();
