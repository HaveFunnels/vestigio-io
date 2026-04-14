import { getRedis } from "../../src/libs/redis";

// ──────────────────────────────────────────────
// Audit Cycle Queue  (Wave 5 Fase 1A)
//
// Redis-backed priority queue for AuditCycle dispatch. Unlike the
// existing apps/platform/redis-job-queue.ts (which queues AnalysisJob
// for the Stage 0.1 wave intelligence path), this queue is purpose-built
// for continuous audit cycles with priority, per-env locking, DLQ, and
// attempt counting.
//
// Priority model:
//   - "hot"  → revenue-critical sweeps (Max: 1x/hour). Drained first.
//   - "warm" → rotating-sample sweeps (Pro: 1x/4h, Max: 1x/hour).
//              Drained only when hot is empty.
//   - "cold" → full weekly audits. Drained only when hot + warm empty.
//
// The queue itself doesn't schedule — callers (webhooks, scheduler
// cron, activation endpoint) enqueue and the worker-loop drains. The
// priority tier is just a routing hint; the cycle row itself carries
// `cycleType` which the engine reads.
//
// Key schema (all prefixed `vestigio:auditq:`):
//   priority:{tier}          List<cycleId>    — FIFO queue per tier
//   envlock:{envId}          String           — SET NX EX; prevents two
//                                               concurrent runs per env
//   attempts:{cycleId}       String<number>   — incremented on dispatch;
//                                               gate for DLQ
//   dlq                      List<cycleId>    — terminal-failed cycles
//   meta:{cycleId}           Hash             — compact snapshot for
//                                               observability (org, tier,
//                                               enqueuedAt)
//
// Falls back gracefully when Redis is not configured (local dev): the
// queue becomes a no-op and callers should treat enqueue failure as a
// signal to dispatch in-process via the legacy path. Returning false
// (instead of throwing) keeps fallback branches clean.
// ──────────────────────────────────────────────

export type CyclePriority = "hot" | "warm" | "cold";

const PREFIX = "vestigio:auditq";
const PRIORITY_TIERS: CyclePriority[] = ["hot", "warm", "cold"];

// Locks expire after a generous ceiling so a crashed worker doesn't
// permanently block the env. The heal cron catches anything that
// slips through.
const ENV_LOCK_TTL_SEC = 15 * 60; // 15 minutes
// A cycle that has failed 3 times (initial + 2 retries) goes to DLQ.
const MAX_ATTEMPTS = 3;

function priorityKey(tier: CyclePriority): string {
	return `${PREFIX}:priority:${tier}`;
}
function envLockKey(envId: string): string {
	return `${PREFIX}:envlock:${envId}`;
}
function attemptsKey(cycleId: string): string {
	return `${PREFIX}:attempts:${cycleId}`;
}
function metaKey(cycleId: string): string {
	return `${PREFIX}:meta:${cycleId}`;
}
const DLQ_KEY = `${PREFIX}:dlq`;

export interface EnqueueInput {
	cycleId: string;
	environmentId: string;
	organizationId: string;
	priority?: CyclePriority;
}

export interface DequeueResult {
	cycleId: string;
	priority: CyclePriority;
	attempt: number;
	environmentId: string | null;
	organizationId: string | null;
}

function isRedisAvailable(): boolean {
	return !!getRedis();
}

// ──────────────────────────────────────────────
// Enqueue
// ──────────────────────────────────────────────

/**
 * Enqueue a cycle for worker dispatch. Returns `true` if the enqueue
 * actually landed in Redis; returns `false` if Redis is unavailable so
 * the caller can fall back to in-process dispatch without silently
 * losing the cycle.
 */
export async function enqueueAuditCycle(
	input: EnqueueInput,
): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return false;

	const priority: CyclePriority = input.priority ?? "cold";
	if (!PRIORITY_TIERS.includes(priority)) {
		throw new Error(`Invalid priority tier: ${priority}`);
	}

	try {
		const pipe = redis.pipeline();
		pipe.rpush(priorityKey(priority), input.cycleId);
		pipe.hmset(metaKey(input.cycleId), {
			cycleId: input.cycleId,
			environmentId: input.environmentId,
			organizationId: input.organizationId,
			priority,
			enqueuedAt: new Date().toISOString(),
		});
		// Meta row TTL as safety net (24h) — it's deleted on completion.
		pipe.expire(metaKey(input.cycleId), 24 * 60 * 60);
		await pipe.exec();
		return true;
	} catch (err) {
		console.warn(
			`[audit-cycle-queue] enqueue failed cycle=${input.cycleId}:`,
			err,
		);
		return false;
	}
}

// ──────────────────────────────────────────────
// Dequeue (worker side)
// ──────────────────────────────────────────────

/**
 * Attempt to acquire the env lock before dispatch. Returns `true` if
 * the lock was acquired — caller must hold the lock for the duration
 * of the cycle and release it on completion/failure.
 */
export async function acquireEnvLock(envId: string): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return true; // no-op when Redis unavailable; worker is singleton anyway
	try {
		const ok = await redis.set(envLockKey(envId), "1", "EX", ENV_LOCK_TTL_SEC, "NX");
		return ok === "OK";
	} catch {
		return false;
	}
}

export async function releaseEnvLock(envId: string): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	try {
		await redis.del(envLockKey(envId));
	} catch {
		// lock will TTL out eventually
	}
}

/**
 * Pop the next cycle to process, honoring priority tiers. Returns null
 * when every tier is empty. If the popped cycle can't acquire its env
 * lock (another worker already running it), the worker is expected to
 * call requeueForEnvContention() — the queue itself doesn't touch DB
 * to check lock state.
 *
 * Wave 5 Fase 1A fix (C3): the `attempt` field returned here is the
 * CURRENT counter value WITHOUT incrementing. The counter only bumps
 * when the worker confirms it actually started doing work via
 * markDispatchAttempted() — env-contention requeues don't burn the
 * retry budget, and crashes between LPOP and lock-acquire don't leave
 * a counter prematurely incremented.
 *
 * Wave 5 Fase 1A fix (M1): if the meta hash has been evicted (Redis
 * memory pressure with `allkeys-lru`), `envId` would be null and the
 * worker would skip the env lock entirely → two workers could run the
 * same env concurrently. The worker fallback is to look up envId from
 * the AuditCycle row in Postgres before dispatch — see worker-loop.ts.
 */
export async function dequeueAuditCycle(): Promise<DequeueResult | null> {
	const redis = getRedis();
	if (!redis) return null;

	for (const tier of PRIORITY_TIERS) {
		try {
			const cycleId = await redis.lpop(priorityKey(tier));
			if (!cycleId) continue;

			const meta = await redis.hgetall(metaKey(cycleId));
			const envId = meta?.environmentId ?? null;
			const orgId = meta?.organizationId ?? null;

			// Fix C3: read counter without modifying. Default to 0 (first
			// attempt) when no counter exists yet.
			const raw = await redis.get(attemptsKey(cycleId));
			const attempt = raw ? parseInt(raw, 10) : 0;

			return {
				cycleId,
				priority: tier,
				attempt,
				environmentId: envId,
				organizationId: orgId,
			};
		} catch (err) {
			console.warn(`[audit-cycle-queue] dequeue ${tier} failed:`, err);
			continue;
		}
	}
	return null;
}

/**
 * Mark that the worker has acquired the env lock and is about to call
 * runAuditCycle. This is the canonical "attempt incremented" point —
 * called only after lock acquisition succeeds. Returns the post-INCR
 * attempt number for the worker to log + decide retry/DLQ.
 *
 * Wave 5 Fase 1A fix (C3): separating the increment from dequeue means
 * env-contention requeues (no lock acquired) cost nothing against the
 * retry budget, and a worker crash between dequeue and dispatch leaves
 * the counter untouched.
 */
export async function markDispatchAttempted(cycleId: string): Promise<number> {
	const redis = getRedis();
	if (!redis) return 1;
	try {
		const attempt = await redis.incr(attemptsKey(cycleId));
		await redis.expire(attemptsKey(cycleId), 24 * 60 * 60);
		return attempt;
	} catch {
		return 1;
	}
}

/**
 * Requeue a cycle that couldn't acquire its env lock. Pushes it to the
 * back of its tier so other cycles get a chance first. Does not touch
 * the attempt counter — env contention isn't a failure (post-C3 fix the
 * counter wasn't bumped during dequeue anyway).
 */
export async function requeueForEnvContention(
	cycleId: string,
	priority: CyclePriority,
): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	try {
		await redis.rpush(priorityKey(priority), cycleId);
	} catch {
		// best-effort
	}
}

// ──────────────────────────────────────────────
// Retry + DLQ
// ──────────────────────────────────────────────

export interface RequeueOrDlqResult {
	outcome: "requeued" | "dlq";
	attempt: number;
}

/**
 * Called by the worker after a cycle dispatch fails. If under the
 * attempt ceiling, push to back of its priority tier for a retry; if
 * at/over, send to DLQ.
 *
 * The caller is responsible for persisting the failure status on the
 * AuditCycle row in Postgres — this function only manages the queue.
 */
export async function requeueOrDlq(
	cycleId: string,
	priority: CyclePriority,
): Promise<RequeueOrDlqResult> {
	const redis = getRedis();
	if (!redis) return { outcome: "dlq", attempt: MAX_ATTEMPTS };

	try {
		const raw = await redis.get(attemptsKey(cycleId));
		const attempt = raw ? parseInt(raw, 10) : 1;
		if (attempt >= MAX_ATTEMPTS) {
			await redis.rpush(DLQ_KEY, cycleId);
			return { outcome: "dlq", attempt };
		}
		await redis.rpush(priorityKey(priority), cycleId);
		return { outcome: "requeued", attempt };
	} catch (err) {
		console.warn(`[audit-cycle-queue] requeueOrDlq failed cycle=${cycleId}:`, err);
		return { outcome: "dlq", attempt: MAX_ATTEMPTS };
	}
}

/**
 * Remove attempt/meta keys after successful completion. Cheap and
 * idempotent — safe to call in finally blocks.
 */
export async function clearCycleState(cycleId: string): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	try {
		const pipe = redis.pipeline();
		pipe.del(attemptsKey(cycleId));
		pipe.del(metaKey(cycleId));
		await pipe.exec();
	} catch {
		// TTLs will clean up anyway
	}
}

// ──────────────────────────────────────────────
// Observability
// ──────────────────────────────────────────────

export interface QueueDepthSnapshot {
	hot: number;
	warm: number;
	cold: number;
	dlq: number;
	total: number;
}

export async function getQueueDepth(): Promise<QueueDepthSnapshot> {
	const redis = getRedis();
	if (!redis) {
		return { hot: 0, warm: 0, cold: 0, dlq: 0, total: 0 };
	}
	try {
		const [hot, warm, cold, dlq] = await Promise.all([
			redis.llen(priorityKey("hot")),
			redis.llen(priorityKey("warm")),
			redis.llen(priorityKey("cold")),
			redis.llen(DLQ_KEY),
		]);
		return {
			hot,
			warm,
			cold,
			dlq,
			total: hot + warm + cold,
		};
	} catch {
		return { hot: 0, warm: 0, cold: 0, dlq: 0, total: 0 };
	}
}

export async function peekDlq(limit: number = 50): Promise<string[]> {
	const redis = getRedis();
	if (!redis) return [];
	try {
		return (await redis.lrange(DLQ_KEY, 0, limit - 1)) || [];
	} catch {
		return [];
	}
}

export async function clearFromDlq(cycleId: string): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	try {
		await redis.lrem(DLQ_KEY, 0, cycleId);
	} catch {
		// noop
	}
}

export { MAX_ATTEMPTS, ENV_LOCK_TTL_SEC };
