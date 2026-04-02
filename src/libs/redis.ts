import Redis from "ioredis";

// ──────────────────────────────────────────────
// Redis Client Singleton
//
// Graceful: returns null if REDIS_URL is not set
// or if the connection fails. Callers must always
// handle the null case and fall back to in-memory.
//
// Never throws. Never crashes the app.
// ──────────────────────────────────────────────

let redis: Redis | null = null;
let connectionFailed = false;

export function getRedis(): Redis | null {
  if (redis) return redis;
  if (connectionFailed) return null;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) {
          // Stop retrying after 5 attempts
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError(err) {
        // Only reconnect on specific recoverable errors
        const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    redis.on("error", (err) => {
      console.warn(`[Redis] Connection error: ${err.message}`);
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected");
      connectionFailed = false;
    });

    redis.on("close", () => {
      console.warn("[Redis] Connection closed");
    });

    redis.connect().catch((err) => {
      console.warn(`[Redis] Failed to connect: ${err.message}`);
      connectionFailed = true;
      redis?.disconnect();
      redis = null;
    });

    return redis;
  } catch (err) {
    console.warn(
      `[Redis] Initialization error: ${err instanceof Error ? err.message : "unknown"}`,
    );
    connectionFailed = false;
    redis = null;
    return null;
  }
}

/**
 * Check if Redis is available and connected.
 */
export function isRedisAvailable(): boolean {
  const client = getRedis();
  if (!client) return false;
  return client.status === "ready" || client.status === "connect";
}

/**
 * Check if REDIS_URL is configured (even if not yet connected).
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Safely execute a Redis command. Returns null on any error.
 * Use this for non-critical operations where failure is acceptable.
 */
export async function safeRedisCall<T>(
  fn: (client: Redis) => Promise<T>,
): Promise<T | null> {
  const client = getRedis();
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
 * Disconnect Redis client. Call during graceful shutdown.
 */
export function disconnectRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
  connectionFailed = false;
}

// For testing: reset all state
export function resetRedisState(): void {
  disconnectRedis();
  connectionFailed = false;
}
