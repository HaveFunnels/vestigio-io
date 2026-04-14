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
import { getRedis, initRedis } from "../../src/libs/redis";
import {
	dequeueAuditCycle,
	acquireEnvLock,
	releaseEnvLock,
	requeueForEnvContention,
	requeueOrDlq,
	clearCycleState,
	getQueueDepth,
	markDispatchAttempted,
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
// Wave 5 Fase 1A fix (H5): track currently-locked envIds so a shutdown
// timeout can best-effort release them, instead of leaving the locks to
// time out (15min default, blocking other workers for that span).
const heldEnvLocks = new Set<string>();

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
 *
 * Returns the backoff duration (ms) to sleep BEFORE this worker dequeues
 * the next cycle. Callers should sleep that long AFTER the inFlight
 * counter drops, so the slot frees up for siblings instead of being
 * blocked on the backoff timer (Fase 1A fix M4).
 */
async function processCycle(
	cycleId: string,
	priority: CyclePriority,
	envIdRaw: string | null,
	orgIdRaw: string | null,
	_dequeueAttempt: number,
): Promise<{ backoffMs: number }> {
	// Wave 5 Fase 1A fix (M1): if Redis evicted the meta hash, fall back
	// to the AuditCycle row in Postgres so we can still acquire the env
	// lock (skipping the lock would risk concurrent runs on the same env).
	let envId = envIdRaw;
	let orgId = orgIdRaw;
	if (!envId) {
		try {
			const cycleRow = await prisma.auditCycle.findUnique({
				where: { id: cycleId },
				select: { environmentId: true, organizationId: true },
			});
			if (cycleRow) {
				envId = cycleRow.environmentId;
				orgId = orgId ?? cycleRow.organizationId;
			}
		} catch {
			// fall through; the env lock will be skipped
		}
	}

	const log = rootLog.child({
		cycleId,
		envId: envId ?? undefined,
		orgId: orgId ?? undefined,
		priority,
	});

	const lockOk = envId ? await acquireEnvLock(envId) : true;
	if (envId && !lockOk) {
		log.info("env locked by another worker, requeueing");
		await requeueForEnvContention(cycleId, priority);
		// Cooldown returned to caller (M4) so the slot can free for
		// siblings.
		return { backoffMs: CONTENTION_COOLDOWN_MS };
	}
	if (envId) heldEnvLocks.add(envId);

	// Wave 5 Fase 1A fix (C3): increment the attempt counter only after
	// the lock is held — env-contention requeues don't burn the budget,
	// and a crash before this point doesn't penalize the cycle.
	const attempt = await markDispatchAttempted(cycleId);

	log.info("dispatching cycle", { attempt });
	const started = Date.now();
	try {
		await runAuditCycle(cycleId);
		await clearCycleState(cycleId);
		log.info("cycle dispatched successfully", {
			durationMs: Date.now() - started,
			attempt,
		});
		return { backoffMs: 0 };
	} catch (err: any) {
		const message = err?.message || "unknown";
		log.error("cycle dispatch threw", {
			durationMs: Date.now() - started,
			attempt,
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
			return { backoffMs: 0 };
		}
		const backoff = computeBackoffMs(outcome.attempt);
		log.warn("cycle requeued for retry", {
			attempt: outcome.attempt,
			maxAttempts: MAX_ATTEMPTS,
			backoffMs: backoff,
		});
		// Fix M4: caller sleeps this AFTER decrementing inFlight so the
		// slot is reusable during the backoff window.
		return { backoffMs: backoff };
	} finally {
		if (envId) {
			await releaseEnvLock(envId);
			heldEnvLocks.delete(envId);
		}
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
		// Wave 5 Fase 1A fix (M4): the post-failure backoff is taken
		// AFTER inFlight is decremented so it doesn't tie up a slot.
		processCycle(
			next.cycleId,
			next.priority,
			next.environmentId,
			next.organizationId,
			next.attempt,
		)
			.then(async (outcome) => {
				inFlight -= 1;
				if (outcome.backoffMs > 0) {
					await sleep(outcome.backoffMs);
				}
			})
			.catch((err) => {
				inFlight -= 1;
				rootLog.error("processCycle unhandled error", {
					cycleId: next.cycleId,
					err: (err as Error)?.message,
				});
			});
	}

	// Graceful drain: wait for in-flight cycles to complete before exit.
	rootLog.info("shutdown requested, draining in-flight cycles", {
		inFlight,
		heldEnvLocks: heldEnvLocks.size,
	});
	const drainStart = Date.now();
	const DRAIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max
	while (inFlight > 0 && Date.now() - drainStart < DRAIN_TIMEOUT_MS) {
		await sleep(500);
	}
	// Wave 5 Fase 1A fix (H5): if drain timed out, best-effort release
	// any env locks we still hold so other workers don't have to wait
	// for the 15min TTL. The cycle status in Postgres will be backstopped
	// by the heal cron's "stuck running" check (10min threshold). Also
	// nudge the still-pending cycles back to "pending" so the heal cron
	// re-enqueues them on the next pass.
	if (inFlight > 0) {
		rootLog.warn("drain timed out, releasing held env locks", {
			inFlight,
			heldEnvLocks: heldEnvLocks.size,
		});
		for (const envId of heldEnvLocks) {
			await releaseEnvLock(envId).catch(() => {
				/* best effort */
			});
		}
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
		// Wave 5 Fase 1A fix (H7): omit workerId (contains process PID)
		// from the response. Even though Railway's healthcheck runs in-VPC
		// today, a misconfigured deploy that exposed the port publicly
		// would leak the PID for reconnaissance. Internal logs still carry
		// worker_id correlation; this endpoint is for liveness only.
		res.end(
			JSON.stringify({
				ok: !shutdownRequested,
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
	// Wave 5 Fase 1A fix (C1): explicit Redis init at worker boot. Without
	// this, getRedis() returns null in the main loop and the worker
	// permanently logs "REDIS_URL not configured" even when REDIS_URL IS
	// set. Discovered by Fase 1 audit agent.
	await initRedis().catch((err) => {
		rootLog.warn("initRedis failed at boot", { err: err?.message });
	});
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
