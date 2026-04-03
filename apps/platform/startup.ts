import { enforceEnv, isProduction, validateEnv } from './env-validation';
import { initializeStores, validateStoreConfiguration, resetStoreEnforcement } from './store-enforcement';

// Redis check without importing redis.ts (which pulls in ioredis → Node.js builtins)
function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

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

  // 3. Redis status (initialization is async, done in instrumentation.ts)
  if (isRedisConfigured()) {
    checks.push({
      name: 'Redis',
      passed: true,
      message: 'REDIS_URL configured — Redis will connect asynchronously',
    });
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
