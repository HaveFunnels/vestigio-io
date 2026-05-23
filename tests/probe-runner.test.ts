/**
 * Wave 21.2 — probe runner tests
 *
 * Hermetic: the production module hits the network via httpFetch and
 * writes via prisma.pageProbe. Tests mock both surfaces — no DB
 * connection, no real fetches.
 *
 * Run: npx tsx tests/probe-runner.test.ts
 */

import {
  test, assert, assertEqual,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  computeProbeHash,
  resolveProbeUrls,
  cadenceForPlan,
  PLAN_CADENCE,
  DEFAULT_CADENCE,
} from '../apps/probe-runner';

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

// ──────────────────────────────────────────────
// computeProbeHash — normalization + stability
// ──────────────────────────────────────────────

runSuite('computeProbeHash', () => {
  test('hash is stable for identical input', () => {
    const a = computeProbeHash('<html><body>Hello</body></html>');
    const b = computeProbeHash('<html><body>Hello</body></html>');
    assertEqual(a, b, 'same input produces same hash');
  });

  test('hash differs for material content change', () => {
    const a = computeProbeHash('<html><body>Free shipping on orders over $50</body></html>');
    const b = computeProbeHash('<html><body>Free shipping on orders over $75</body></html>');
    assert(a !== b, 'price threshold change must change the hash');
  });

  test('hash ignores HTML comments (build IDs, prerender markers)', () => {
    const noComment = '<html><body>Buy now</body></html>';
    const withComment = '<html><!-- build:abc123 --><body>Buy now</body></html>';
    assertEqual(computeProbeHash(noComment), computeProbeHash(withComment),
      'HTML comments are stripped before hashing');
  });

  test('hash ignores csrf / nonce attributes', () => {
    const a = '<html><body><form><input csrf="abc123"/></form></body></html>';
    const b = '<html><body><form><input csrf="xyz999"/></form></body></html>';
    assertEqual(computeProbeHash(a), computeProbeHash(b),
      'csrf attribute rotates per request — must not drive hash');
  });

  test('hash ignores Next.js chunk hashes', () => {
    const a = '<script src="/_next/static/abc123def/chunks/main.js"></script>';
    const b = '<script src="/_next/static/xyz999uvw/chunks/main.js"></script>';
    assertEqual(computeProbeHash(a), computeProbeHash(b),
      'Next chunk hash rotates per deploy — must not drive hash');
  });

  test('hash ignores between-tag whitespace (minifier vs pretty-print)', () => {
    const pretty = '<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>';
    const minified = '<html><body><h1>Hello</h1></body></html>';
    assertEqual(computeProbeHash(pretty), computeProbeHash(minified),
      'HTML reformatting between tags should not fire a probe');
  });

  test('hash differs for truly different content', () => {
    const a = computeProbeHash('<html><body>Original copy</body></html>');
    const b = computeProbeHash('<html><body>Completely different copy</body></html>');
    assert(a !== b, 'distinct content produces distinct hash');
  });
});

// ──────────────────────────────────────────────
// resolveProbeUrls — fallback chain
// ──────────────────────────────────────────────

runSuite('resolveProbeUrls', () => {
  test('uses probeUrlsJson when valid array', () => {
    const urls = resolveProbeUrls({
      landingUrl: 'https://example.com/',
      probeUrlsJson: ['https://example.com/pricing', 'https://example.com/checkout'],
    });
    assertEqual(urls.length, 2);
    assertEqual(urls[0], 'https://example.com/pricing');
    assertEqual(urls[1], 'https://example.com/checkout');
  });

  test('falls back to landingUrl when probeUrlsJson is null', () => {
    const urls = resolveProbeUrls({
      landingUrl: 'https://example.com/',
      probeUrlsJson: null,
    });
    assertEqual(urls.length, 1);
    assertEqual(urls[0], 'https://example.com/');
  });

  test('falls back to landingUrl when probeUrlsJson is empty array', () => {
    const urls = resolveProbeUrls({
      landingUrl: 'https://example.com/',
      probeUrlsJson: [],
    });
    assertEqual(urls.length, 1, 'empty list = fall back to landing');
    assertEqual(urls[0], 'https://example.com/');
  });

  test('filters non-string entries from probeUrlsJson', () => {
    const urls = resolveProbeUrls({
      landingUrl: 'https://example.com/',
      probeUrlsJson: ['https://example.com/a', 123, null, 'https://example.com/b'],
    });
    assertEqual(urls.length, 2);
    assertEqual(urls[0], 'https://example.com/a');
    assertEqual(urls[1], 'https://example.com/b');
  });

  test('caps at MAX_URLS_PER_ENV (5)', () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://example.com/page${i}`);
    const urls = resolveProbeUrls({
      landingUrl: 'https://example.com/',
      probeUrlsJson: many,
    });
    assertEqual(urls.length, 5, 'capped at 5 URLs to bound cost');
  });

  test('returns empty when landingUrl is empty and no probeUrlsJson', () => {
    const urls = resolveProbeUrls({
      landingUrl: '',
      probeUrlsJson: null,
    });
    assertEqual(urls.length, 0);
  });
});

// ──────────────────────────────────────────────
// cadenceForPlan — plan tier mapping
// ──────────────────────────────────────────────

runSuite('cadenceForPlan', () => {
  test('max plan probes every 5 min', () => {
    assertEqual(cadenceForPlan('max').intervalMinutes, 5);
  });

  test('pro plan probes every 15 min', () => {
    assertEqual(cadenceForPlan('pro').intervalMinutes, 15);
  });

  test('vestigio plan probes every 60 min', () => {
    assertEqual(cadenceForPlan('vestigio').intervalMinutes, 60);
  });

  test('plan name is case-insensitive', () => {
    assertEqual(cadenceForPlan('MAX').intervalMinutes, 5);
    assertEqual(cadenceForPlan('Pro').intervalMinutes, 15);
  });

  test('unknown plan falls back to DEFAULT_CADENCE', () => {
    assertEqual(cadenceForPlan('enterprise').intervalMinutes, DEFAULT_CADENCE.intervalMinutes);
    assertEqual(cadenceForPlan(null).intervalMinutes, DEFAULT_CADENCE.intervalMinutes);
    assertEqual(cadenceForPlan(undefined).intervalMinutes, DEFAULT_CADENCE.intervalMinutes);
  });

  test('all known plans have a positive interval', () => {
    for (const [plan, cadence] of Object.entries(PLAN_CADENCE)) {
      assert(cadence.intervalMinutes > 0, `${plan} interval must be positive`);
    }
  });
});

// ──────────────────────────────────────────────
// runProbePassForEnv — gate logic
//
// These tests bypass the real httpFetch by stubbing the prisma layer.
// We don't import probeOneUrl directly because it issues a real network
// fetch via httpFetch; the gate logic in runProbePassForEnv is what
// we care about here (when does it short-circuit, when does it call
// through). The full integration is exercised by tests/all.test.ts in
// the staging environment.
// ──────────────────────────────────────────────

(async () => {

resetCounters();

await test('runProbePassForEnv returns null when probeEnabled=false', async () => {
  const { runProbePassForEnv } = await import('../apps/probe-runner');
  const result = await runProbePassForEnv(
    {} as any,
    {
      id: 'env_a',
      landingUrl: 'https://x.com',
      probeUrlsJson: null,
      probeEnabled: false,
      probeLastRunAt: null,
      activated: true,
      continuousPaused: false,
    },
    {},
  );
  assertEqual(result, null);
});

await test('runProbePassForEnv returns null when activated=false', async () => {
  const { runProbePassForEnv } = await import('../apps/probe-runner');
  const result = await runProbePassForEnv(
    {} as any,
    {
      id: 'env_a',
      landingUrl: 'https://x.com',
      probeUrlsJson: null,
      probeEnabled: true,
      probeLastRunAt: null,
      activated: false,
      continuousPaused: false,
    },
    {},
  );
  assertEqual(result, null);
});

await test('runProbePassForEnv returns null when continuousPaused=true', async () => {
  const { runProbePassForEnv } = await import('../apps/probe-runner');
  const result = await runProbePassForEnv(
    {} as any,
    {
      id: 'env_a',
      landingUrl: 'https://x.com',
      probeUrlsJson: null,
      probeEnabled: true,
      probeLastRunAt: null,
      activated: true,
      continuousPaused: true,
    },
    {},
  );
  assertEqual(result, null);
});

await test('runProbePassForEnv respects per-env debounce window', async () => {
  const { runProbePassForEnv } = await import('../apps/probe-runner');
  const now = new Date('2026-05-23T12:30:00Z');
  // Last run was 3 minutes ago; max-plan cadence is 5min — should skip.
  const lastRun = new Date(now.getTime() - 3 * 60 * 1000);
  const result = await runProbePassForEnv(
    {} as any,
    {
      id: 'env_a',
      landingUrl: 'https://x.com',
      probeUrlsJson: null,
      probeEnabled: true,
      probeLastRunAt: lastRun,
      activated: true,
      continuousPaused: false,
    },
    { minIntervalMinutes: 5, now },
  );
  assertEqual(result, null, 'debounce skips when within window');
});

await test('runProbePassForEnv returns null when no URLs resolve', async () => {
  const { runProbePassForEnv } = await import('../apps/probe-runner');
  const result = await runProbePassForEnv(
    {} as any,
    {
      id: 'env_a',
      landingUrl: '',
      probeUrlsJson: [],
      probeEnabled: true,
      probeLastRunAt: null,
      activated: true,
      continuousPaused: false,
    },
    {},
  );
  assertEqual(result, null, 'no URLs = nothing to probe');
});

printResults('runProbePassForEnv gates');
const r = getResults();
if (r.failed > 0) suitesFailed++;
else suitesPassed++;

console.log('\n═══════════════════════════════════════════════');
console.log(`Probe Runner: ${suitesPassed} suites passed, ${suitesFailed} failed`);
console.log('═══════════════════════════════════════════════');
if (suitesFailed > 0) process.exit(1);

})();
