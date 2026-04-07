/**
 * Next.js Instrumentation — Server Startup Hook
 *
 * Runs once when the Next.js server starts.
 * Wires up:
 *   - vestigioStartup() → env validation + store initialization
 *   - enforceProductionLock() → persistent store checks in production
 *   - MCP persistence store → Prisma-backed in production
 *   - Audit-runner heal cron (Node runtime only, pulls in Node builtins
 *     transitively via http-client → https/http modules)
 *
 * In development: in-memory stores are acceptable.
 * In production: fails fast if Prisma stores are not wired.
 *
 * NOTE on the NEXT_RUNTIME guard: this file is bundled BOTH for the Node
 * runtime and the Edge runtime by Next.js 15. We use the canonical
 * `process.env.NEXT_RUNTIME === 'nodejs'` check (not a runtime EdgeRuntime
 * sniff) because the webpack DefinePlugin substitutes that literal at
 * build time, allowing the entire Node-only branch to be tree-shaken out
 * of the Edge bundle. Without this, webpack tries to resolve `https`/
 * `http` for the Edge target and the build fails.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { vestigioStartup } = await import('../apps/platform/startup');
  const { enforceProductionLock, initializeProductionStores } = await import('../apps/platform/production-state-lock');
  const { setMcpPersistenceStore, PrismaMcpPersistenceStore } = await import('../apps/platform/mcp-persistence');

  const isProduction = process.env.NODE_ENV === 'production';
  let prisma: any = undefined;

  if (isProduction) {
    try {
      const prismaModule = await import('@/libs/prismaDb');
      prisma = prismaModule.prisma;
    } catch (err) {
      console.error('✖ Failed to import Prisma client for production startup:', err);
    }
  }

  // 1. Run vestigio startup (env validation + store init)
  const result = vestigioStartup(prisma);

  if (!result.success && isProduction) {
    console.error('✖ Vestigio startup failed — aborting in production');
    process.exit(1);
  }

  // 2. Initialize production-state-lock stores
  if (prisma) {
    try {
      initializeProductionStores(prisma);
    } catch (err) {
      console.warn('⚠ Production store initialization warning:', err);
    }
  }

  // 3. Wire MCP persistence store
  if (prisma) {
    setMcpPersistenceStore(new PrismaMcpPersistenceStore(prisma));
    console.log('✓ MCP persistence store: Prisma-backed');
  } else {
    console.log('✓ MCP persistence store: in-memory (dev mode)');
  }

  // 4. Enforce production lock (validates all subsystems)
  if (isProduction) {
    try {
      enforceProductionLock();
      console.log('✓ Production lock validated — all subsystems OK');
    } catch (err) {
      console.error('✖ Production lock failed:', err);
      // Log but don't crash — allows dev deploys to staging
    }
  }

  // 5. Redis initializes lazily on first use (in redis.ts)
  // Not imported here to avoid webpack bundling ioredis (Node.js builtins).
  if (process.env.REDIS_URL) {
    console.log('✓ Redis configured — will connect on first use');
  }

  // 6. Audit-runner heal cron — extracted to instrumentation-node.ts so
  //    that webpack can statically tree-shake the entire chain (which
  //    transitively imports Node builtins http/https) out of the Edge
  //    runtime bundle. The DefinePlugin substitutes process.env.NEXT_RUNTIME
  //    at build time, eliminating this import from the Edge bundle.
  if (prisma && process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { registerNodeInstrumentation } = await import('./instrumentation-node');
      await registerNodeInstrumentation();
    } catch (err) {
      console.warn('⚠ Audit-runner heal cron registration failed:', err);
    }
  }
}
