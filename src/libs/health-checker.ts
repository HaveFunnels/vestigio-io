import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Health Checker — Real service pings
//
// Pings: Database, Redis, MCP, API
// Writes results to UptimeCheck table
// Called by cron endpoint or self-scheduling timer
// ──────────────────────────────────────────────

export interface HealthResult {
  service: string;
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  message: string | null;
}

/** Ping PostgreSQL with a simple query */
async function checkDatabase(): Promise<HealthResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      service: "database",
      status: "ok",
      latencyMs: Date.now() - start,
      message: null,
    };
  } catch (err: any) {
    return {
      service: "database",
      status: "down",
      latencyMs: Date.now() - start,
      message: err.message?.slice(0, 200) || "Database unreachable",
    };
  }
}

/** Ping Redis with PING command */
async function checkRedis(): Promise<HealthResult> {
  const start = Date.now();
  try {
    const { getRedisAsync, isRedisConfigured } = await import("@/libs/redis");

    if (!isRedisConfigured()) {
      return {
        service: "redis",
        status: "ok",
        latencyMs: 0,
        message: "Not configured (using in-memory fallback)",
      };
    }

    const client = await getRedisAsync();
    if (!client) {
      return {
        service: "redis",
        status: "down",
        latencyMs: Date.now() - start,
        message: "Redis configured but connection failed",
      };
    }

    const pong = await client.ping();
    const latency = Date.now() - start;

    return {
      service: "redis",
      status: pong === "PONG" ? (latency > 500 ? "degraded" : "ok") : "down",
      latencyMs: latency,
      message: latency > 500 ? `High latency: ${latency}ms` : null,
    };
  } catch (err: any) {
    return {
      service: "redis",
      status: "down",
      latencyMs: Date.now() - start,
      message: err.message?.slice(0, 200) || "Redis unreachable",
    };
  }
}

/** Check MCP server singleton has loaded context */
async function checkMcp(): Promise<HealthResult> {
  const start = Date.now();
  try {
    const { getMcpServer } = await import("@/lib/mcp-client");
    const server = getMcpServer();
    const ctx = server.getContext();

    if (!ctx) {
      return {
        service: "mcp",
        status: "degraded",
        latencyMs: Date.now() - start,
        message: "MCP server running but no context loaded",
      };
    }

    return {
      service: "mcp",
      status: "ok",
      latencyMs: Date.now() - start,
      message: null,
    };
  } catch (err: any) {
    return {
      service: "mcp",
      status: "down",
      latencyMs: Date.now() - start,
      message: err.message?.slice(0, 200) || "MCP unavailable",
    };
  }
}

/** Self-check API responsiveness */
async function checkApi(): Promise<HealthResult> {
  const start = Date.now();
  try {
    // Simple self-check: can we query the DB for a count?
    const count = await prisma.organization.count();
    const latency = Date.now() - start;

    return {
      service: "api",
      status: latency > 2000 ? "degraded" : "ok",
      latencyMs: latency,
      message: latency > 2000 ? `Slow response: ${latency}ms` : `${count} orgs`,
    };
  } catch (err: any) {
    return {
      service: "api",
      status: "down",
      latencyMs: Date.now() - start,
      message: err.message?.slice(0, 200) || "API error",
    };
  }
}

/** Run all health checks and return results */
export async function runHealthChecks(): Promise<HealthResult[]> {
  const results = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkMcp(),
    checkApi(),
  ]);

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          service: "unknown",
          status: "down" as const,
          latencyMs: 0,
          message: (r.reason as Error)?.message || "Check failed",
        },
  );
}

/** Run checks and persist to UptimeCheck table */
export async function runAndPersistHealthChecks(): Promise<HealthResult[]> {
  const results = await runHealthChecks();

  // Write to UptimeCheck table
  try {
    await prisma.uptimeCheck.createMany({
      data: results.map((r) => ({
        service: r.service,
        status: r.status,
        latencyMs: r.latencyMs,
        message: r.message,
      })),
    });
  } catch (err) {
    console.error("[Health Checker] Failed to persist uptime checks:", err);
  }

  return results;
}

// ──────────────────────────────────────────────
// Self-scheduling timer (runs in the Node.js process)
// Starts on first import in production.
// ──────────────────────────────────────────────

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let timerStarted = false;

export function startHealthCheckTimer() {
  if (timerStarted) return;
  if (typeof globalThis !== "undefined" && (globalThis as any).__healthTimerStarted) return;

  timerStarted = true;
  (globalThis as any).__healthTimerStarted = true;

  console.log("[Health Checker] Starting periodic checks (every 5 min)");

  // Run first check after 30 seconds (let the server finish starting)
  setTimeout(async () => {
    try {
      const results = await runAndPersistHealthChecks();
      const summary = results.map((r) => `${r.service}:${r.status}`).join(", ");
      console.log(`[Health Checker] Initial check: ${summary}`);
    } catch (err) {
      console.error("[Health Checker] Initial check failed:", err);
    }

    // Then run every 5 minutes
    setInterval(async () => {
      try {
        await runAndPersistHealthChecks();
      } catch (err) {
        console.error("[Health Checker] Periodic check failed:", err);
      }
    }, INTERVAL_MS);
  }, 30_000);
}
