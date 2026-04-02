import { enforceEnv, isProduction, validateEnv } from './env-validation';
import { initializeStores, validateStoreConfiguration, resetStoreEnforcement } from './store-enforcement';
import { isRedisConfigured, getRedis } from '../../src/libs/redis';

// ──────────────────────────────────────────────
// Platform Startup — single entry point
//
// Call vestigioStartup() once on app init.
// Validates env, initializes stores, logs status.
// Fails fast if anything is misconfigured.
// ──────────────────────────────────────────────

export interface StartupResult {
  success: boolean;
  environment: string;
  checks: { name: string; passed: boolean; message: string }[];
}

export function vestigioStartup(prisma?: any): StartupResult {
  const checks: StartupResult['checks'] = [];
  const env = isProduction() ? 'production' : (process.env.NODE_ENV || 'development');

  console.log(`\n┌──────────────────────────────────────────┐`);
  console.log(`│  VESTIGIO — Starting (${env})              │`);
  console.log(`└──────────────────────────────────────────┘\n`);

  // 1. Validate environment
  const envResult = validateEnv();
  checks.push({
    name: 'Environment variables',
    passed: envResult.valid,
    message: envResult.valid ? 'All required vars present' : `Missing: ${envResult.missing.join(', ')}`,
  });

  if (!envResult.valid && isProduction()) {
    console.error('✖ Startup aborted: missing env vars');
    return { success: false, environment: env, checks };
  }

  // 2. Initialize stores
  try {
    initializeStores(prisma);
    const storeCheck = validateStoreConfiguration();
    checks.push({
      name: 'Store configuration',
      passed: storeCheck.valid,
      message: storeCheck.message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    checks.push({ name: 'Store configuration', passed: false, message: msg });
    if (isProduction()) {
      console.error(`✖ Startup aborted: ${msg}`);
      return { success: false, environment: env, checks };
    }
  }

  // 3. Initialize Redis (if configured)
  if (isRedisConfigured()) {
    try {
      const redis = getRedis();
      checks.push({
        name: 'Redis',
        passed: !!redis,
        message: redis
          ? 'Redis client initialized (job queue + rate limiting)'
          : 'Redis configured but failed to connect — falling back to in-memory',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      checks.push({ name: 'Redis', passed: false, message: `Redis init failed: ${msg} — falling back to in-memory` });
      // Never block startup for Redis — it's a graceful enhancement
    }
  } else {
    checks.push({
      name: 'Redis',
      passed: true,
      message: 'REDIS_URL not set — using in-memory job queue and rate limiter',
    });
  }

  // 4. Log startup summary
  const allPassed = checks.every(c => c.passed);
  for (const c of checks) {
    const icon = c.passed ? '✓' : '✖';
    console.log(`  ${icon} ${c.name}: ${c.message}`);
  }

  if (allPassed) {
    console.log('\n✓ Vestigio ready\n');
  } else {
    console.warn('\n⚠ Vestigio started with warnings\n');
  }

  return { success: allPassed, environment: env, checks };
}

// For testing
export function resetStartup(): void {
  resetStoreEnforcement();
}
