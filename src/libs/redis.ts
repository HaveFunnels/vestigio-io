// ──────────────────────────────────────────────
// Redis Client Singleton
//
// Uses dynamic import to avoid bundling ioredis
// (which depends on Node.js builtins: stream, crypto, dns, net)
// into the client-side webpack bundle.
//
// Graceful: returns null if REDIS_URL is not set
// or if the connection fails. Callers must always
// handle the null case and fall back to in-memory.
//
// Never throws. Never crashes the app.
// ──────────────────────────────────────────────

let redis: any = null;
let connectionFailed = false;
let initPromise: Promise<any> | null = null;

async function createRedisClient(): Promise<any> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      reconnectOnError(err: Error) {
        const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    client.on("error", (err: Error) => {
      console.warn(`[Redis] Connection error: ${err.message}`);
    });

    client.on("connect", () => {
      console.log("[Redis] Connected");
      connectionFailed = false;
    });

    client.on("close", () => {
      console.warn("[Redis] Connection closed");
    });

    await client.connect().catch((err: Error) => {
      console.warn(`[Redis] Failed to connect: ${err.message}`);
      connectionFailed = true;
      client.disconnect();
      return null;
    });

    if (connectionFailed) return null;
    return client;
  } catch (err) {
    console.warn(
      `[Redis] Initialization error: ${err instanceof Error ? err.message : "unknown"}`,
    );
    connectionFailed = true;
    return null;
  }
}

/**
 * Get Redis client. Returns null if unavailable.
 * First call initializes the connection asynchronously.
 */
export async function getRedisAsync(): Promise<any> {
  if (redis) return redis;
  if (connectionFailed) return null;

  if (!initPromise) {
    initPromise = createRedisClient().then((client) => {
      redis = client;
      return client;
    });
  }
  return initPromise;
}

/**
 * Get Redis client synchronously. Returns null if not yet connected.
 * Use getRedisAsync() when possible.
 */
export function getRedis(): any {
  return redis;
}

/**
 * Initialize Redis (call once at startup).
 */
export async function initRedis(): Promise<void> {
  await getRedisAsync();
}

/**
 * Check if Redis is available and connected.
 */
export function isRedisAvailable(): boolean {
  if (!redis) return false;
  return redis.status === "ready" || redis.status === "connect";
}

/**
 * Check if REDIS_URL is configured (even if not yet connected).
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Safely execute a Redis command. Returns null on any error.
 */
export async function safeRedisCall<T>(
  fn: (client: any) => Promise<T>,
): Promise<T | null> {
  const client = await getRedisAsync();
  if (!client) return null;
  try {
    return await fn(client);
  } catch (err) {
    console.warn(
      `[Redis] Command failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

/**
 * Disconnect Redis client.
 */
export function disconnectRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
  initPromise = null;
  connectionFailed = false;
}

export function resetRedisState(): void {
  disconnectRedis();
}
