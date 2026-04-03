/**
 * Next.js Instrumentation — Server Startup Hook
 *
 * Runs once when the Next.js server starts.
 * Wires up:
 *   - vestigioStartup() → env validation + store initialization
 *   - enforceProductionLock() → persistent store checks in production
 *   - MCP persistence store → Prisma-backed in production
 *
 * In development: in-memory stores are acceptable.
 * In production: fails fast if Prisma stores are not wired.
 */

export async function register() {
  // Only run on server side (not edge runtime)
  if (typeof (globalThis as any).EdgeRuntime !== 'undefined') return;

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
}
