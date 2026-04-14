/**
 * Audit-runner worker loop  (Wave 5 Fase 1A)
 *
 * Standalone process that drains the audit-cycle Redis queue, dispatches
 * runAuditCycle for each, and handles env locking, retry, and DLQ. Runs
 * forever until SIGTERM, at which point it completes the in-flight
 * cycle (if any), releases locks, and exits cleanly.
 *
 * Intended deployment: separate Railway service with
 * `Custom Start Command: npm run start:worker`, sharing REDIS_URL +
 * DATABASE_URL with the web service. Multiple replicas are safe — the
 * queue is LPOP-atomic so each cycle is claimed by exactly one worker,
 * and the env-lock prevents two workers from audits the same domain
 * concurrently.
 *
 * When REDIS_URL is not set (local dev, single-box deploy), the worker
 * still boots but logs a warning and exits — the old in-process
 * Promise.then() fallback in the webhook/activate endpoints handles
 * dispatch in that mode.
 */

import * as http from "node:http";
import { prisma } from "../../src/libs/prismaDb";
import { getRedis } from "../../src/libs/redis";
import {
	dequeueAuditCycle,
	acquireEnvLock,
	releaseEnvLock,
	requeueForEnvContention,
	requeueOrDlq,
	clearCycleState,
	getQueueDepth,
	MAX_ATTEMPTS,
	type CyclePriority,
} from "../platform/audit-cycle-queue";
import { getPoolStats } from "../../workers/verification/chromium-pool";
import { createLogger, generateWorkerId } from "../../src/libs/structured-log";
import { runAuditCycle } from "./run-cycle";

// Idle poll delay when all tiers are empty. Short enough that a freshly
// enqueued hot cycle starts within a second; long enough that a
// completely empty queue doesn't hammer Redis.
const IDLE_POLL_MS = 1000;
// Delay before a contention-requeue is tried again. Spreads out env-
// blocked cycles so we don't spin.
const CONTENTION_COOLDOWN_MS = 2000;
// Exponential backoff base + cap for retries after dispatch failure.
const RETRY_BACKOFF_BASE_MS = 5_000;
const RETRY_BACKOFF_CAP_MS = 60_000;
// Max per-worker concurrency. Limits how many cycles one worker process
// runs in parallel — each Chromium launch eats ~300MB so this is a
// RAM ceiling guardrail, not a throughput dial.
const MAX_CONCURRENT_PER_WORKER = Number(
	process.env.AUDIT_WORKER_CONCURRENCY || "2",
);

const workerId = generateWorkerId();
const rootLog = createLogger({ workerId });

let shutdownRequested = false;
let inFlight = 0;

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt: number): number {
	// attempt 1 → base (already consumed), subsequent retries grow:
	// 2 → 5s, 3 → 10s, 4 → 20s, capped at 60s.
	const expo = RETRY_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempt - 2));
	return Math.min(expo, RETRY_BACKOFF_CAP_MS);
}

/**
 * Dispatch a single cycle end-to-end: acquire env lock, call the
 * pipeline, handle success/failure, release resources.
 */
async function processCycle(
	cycleId: string,
	priority: CyclePriority,
	envId: string | null,
	orgId: string | null,
	attempt: number,
): Promise<void> {
	const log = rootLog.child({
		cycleId,
		envId: envId ?? undefined,
		orgId: orgId ?? undefined,
		priority,
		attempt,
	});

	// Env id may be null if metadata went missing (Redis eviction, TTL
	// expiry). In that case we can still try to run — the pipeline reads
	// the env from the AuditCycle row in Postgres. We just skip the lock.
	const lockOk = envId ? await acquireEnvLock(envId) : true;
	if (envId && !lockOk) {
		log.info("env locked by another worker, requeueing");
		await requeueForEnvContention(cycleId, priority);
		// Small cooldown before the next candidate to avoid spin-requeue
		// when many cycles target the same busy env.
		await sleep(CONTENTION_COOLDOWN_MS);
		return;
	}

	log.info("dispatching cycle");
	const started = Date.now();
	try {
		await runAuditCycle(cycleId);
		await clearCycleState(cycleId);
		log.info("cycle dispatched successfully", {
			durationMs: Date.now() - started,
		});
	} catch (err: any) {
		const message = err?.message || "unknown";
		log.error("cycle dispatch threw", {
			durationMs: Date.now() - started,
			err: message,
		});

		// Persist failure on the DB row so the UI doesn't think it's
		// still running. runAuditCycle normally handles this internally,
		// but if it threw before reaching the write, we backstop here.
		try {
			await prisma.auditCycle.update({
				where: { id: cycleId },
				data: { status: "failed", completedAt: new Date() },
			});
		} catch (writeErr) {
			log.warn("failed to mark cycle failed in DB", {
				err: (writeErr as Error)?.message,
			});
		}

		const outcome = await requeueOrDlq(cycleId, priority);
		if (outcome.outcome === "dlq") {
			log.error("cycle sent to DLQ", { attempt: outcome.attempt });
		} else {
			const backoff = computeBackoffMs(outcome.attempt);
			log.warn("cycle requeued for retry", {
				attempt: outcome.attempt,
				maxAttempts: MAX_ATTEMPTS,
				backoffMs: backoff,
			});
			// The requeue already happened in requeueOrDlq; the backoff
			// here just keeps this worker busy so it doesn't immediately
			// claim the same cycle from the front of the queue. Other
			// workers with idle capacity can still pick it up.
			await sleep(backoff);
		}
	} finally {
		if (envId) await releaseEnvLock(envId);
	}
}

/**
 * Main loop. Exits when shutdownRequested=true AND inFlight=0.
 */
async function mainLoop(): Promise<void> {
	rootLog.info("worker-loop starting", {
		maxConcurrent: MAX_CONCURRENT_PER_WORKER,
		hasRedis: !!getRedis(),
	});

	if (!getRedis()) {
		rootLog.warn(
			"REDIS_URL not configured — worker loop has nothing to do. Existing in-process dispatch still runs via webhooks.",
		);
		// Keep the process alive so Railway doesn't flap on deploy; the
		// shutdown signal is honored immediately.
		while (!shutdownRequested) {
			await sleep(5_000);
		}
		rootLog.info("worker-loop exiting (no Redis)");
		return;
	}

	while (!shutdownRequested) {
		// Backpressure: if this worker is at per-worker concurrency cap,
		// wait for in-flight cycles to free a slot before dequeuing.
		if (inFlight >= MAX_CONCURRENT_PER_WORKER) {
			await sleep(200);
			continue;
		}

		const next = await dequeueAuditCycle();
		if (!next) {
			await sleep(IDLE_POLL_MS);
			continue;
		}

		inFlight += 1;
		// Fire-and-track: we don't await individual cycles so this worker
		// can drain concurrent dispatch up to MAX_CONCURRENT_PER_WORKER.
		// Errors inside processCycle are already handled via requeueOrDlq;
		// the .finally() guarantees inFlight decrements.
		processCycle(
			next.cycleId,
			next.priority,
			next.environmentId,
			next.organizationId,
			next.attempt,
		)
			.catch((err) => {
				rootLog.error("processCycle unhandled error", {
					cycleId: next.cycleId,
					err: (err as Error)?.message,
				});
			})
			.finally(() => {
				inFlight -= 1;
			});
	}

	// Graceful drain: wait for in-flight cycles to complete before exit.
	rootLog.info("shutdown requested, draining in-flight cycles", {
		inFlight,
	});
	const drainStart = Date.now();
	const DRAIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max
	while (inFlight > 0 && Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
		await sleep(500);
	}
	if (inFlight > 0) {
		rootLog.warn("drain timed out, exiting with cycles still in flight", {
			inFlight,
		});
	} else {
		rootLog.info("drain complete");
	}
}

function installSignalHandlers(): void {
	const onSignal = (sig: string) => {
		if (shutdownRequested) return;
		rootLog.info(`signal received: ${sig}`);
		shutdownRequested = true;
	};
	process.on("SIGTERM", () => onSignal("SIGTERM"));
	process.on("SIGINT", () => onSignal("SIGINT"));
	// Railway sometimes sends SIGUSR2 during deploys for graceful
	// reload; treat it the same as SIGTERM.
	process.on("SIGUSR2", () => onSignal("SIGUSR2"));

	// Surface uncaught errors with correlation so logs aren't orphaned.
	process.on("uncaughtException", (err) => {
		rootLog.error("uncaughtException", { err: err?.message });
	});
	process.on("unhandledRejection", (reason) => {
		rootLog.error("unhandledRejection", {
			err: (reason as Error)?.message ?? String(reason),
		});
	});
}

/**
 * Tiny HTTP server for Railway health checks. The worker process has
 * no HTTP responsibilities otherwise — this exists solely so Railway
 * can probe `GET /healthz` and not flag the service as unhealthy.
 *
 * Returns 200 with a JSON snapshot when the loop hasn't been asked to
 * shut down; returns 503 once shutdown is requested so the load
 * balancer (if any) stops sending traffic.
 */
function startHealthServer(): http.Server {
	const port = Number(process.env.WORKER_HEALTH_PORT || process.env.PORT || "3001");
	const server = http.createServer(async (req, res) => {
		if (req.url !== "/healthz" && req.url !== "/" && req.url !== "/health") {
			res.writeHead(404).end();
			return;
		}
		const status = shutdownRequested ? 503 : 200;
		const depth = await getQueueDepth().catch(() => null);
		const pool = getPoolStats();
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				ok: !shutdownRequested,
				workerId,
				inFlight,
				maxConcurrent: MAX_CONCURRENT_PER_WORKER,
				chromiumPool: pool,
				queueDepth: depth,
				redis: !!getRedis(),
				ts: new Date().toISOString(),
			}),
		);
	});
	server.listen(port, () => {
		rootLog.info("worker health server listening", { port });
	});
	return server;
}

async function main(): Promise<void> {
	installSignalHandlers();
	const healthServer = startHealthServer();
	try {
		await mainLoop();
	} finally {
		// Stop accepting new health probes; Railway may already be
		// draining traffic at this point.
		healthServer.close();
		try {
			await prisma.$disconnect();
		} catch {
			// noop
		}
	}
	process.exit(0);
}

// Only run when executed directly. Importable for tests without side
// effects.
if (require.main === module) {
	main().catch((err) => {
		rootLog.error("worker-loop fatal", { err: err?.message });
		process.exit(1);
	});
}

export { mainLoop, processCycle };
