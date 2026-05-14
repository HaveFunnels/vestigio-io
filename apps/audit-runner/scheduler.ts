import { prisma } from "../../src/libs/prismaDb";
import { getCadenceForPlan } from "../../src/libs/plan-config";
import { enqueueAuditCycle } from "../platform/audit-cycle-queue";
import type { CycleMode } from "./cycle-modes";

// ──────────────────────────────────────────────
// Audit scheduler  (Wave 5 Fase 3)
//
// Walks every activated, non-paused environment on every tick and
// decides which cycleType(s) are due according to the plan's cadence.
// Creates the AuditCycle row + enqueues it on the priority queue; the
// worker-loop drains the queue.
//
// Runs once per hour. An hour-grained scheduler is good enough for
// daily/weekly cadences; Max-tier 15min-hot cycles are over-covered
// (hourly ticks sample 4x per hot window) but that just means Max orgs
// get a hot cycle within ~1h of due time, which is fine. Running the
// scheduler more often would cost more DB reads than the win is worth.
//
// Leader election: called from instrumentation-node.ts under
// withLeadership("audit-scheduler", ...) so multi-replica deploys
// don't fan out duplicate cycles.
//
// Why separate from heal cron: heal's job is recovery (fix stuck
// cycles). Scheduler's job is creation (emit new cycles). Different
// cadences (60s vs 1h), different failure modes, different audit
// concerns. Keeping them in the same loop would couple them and make
// reasoning about emergent behavior harder.
// ──────────────────────────────────────────────

// Fase 3 fix #17: CycleMode is defined in cycle-modes.ts — re-exported
// here so callers that only import from scheduler.ts still get the type,
// but there's a single source of truth.
export type { CycleMode };

/**
 * Decide which cycleType is due for an environment given the cadence
 * and the time of the last completed cycle of each type.
 *
 * Priority when multiple tiers are due: cold > warm > hot. Rationale:
 * if both cold and hot are overdue, we prefer to emit a cold (baseline
 * reset) this tick and let the next tick emit hot. Emitting both at
 * once would DOUBLE the worker's immediate load for no gain (a fresh
 * cold run gives newer data than a hot + cold combined).
 *
 * Returns null when nothing is due. Also returns null when a cycle is
 * already running (so we don't pile up queued rows while the current
 * one is still working).
 */
export async function resolveDueCycleType(
	environmentId: string,
	planKey: string,
): Promise<CycleMode | null> {
	const cadence = getCadenceForPlan(planKey);
	const now = Date.now();

	// Skip envs with an in-flight cycle. Enqueueing another while one
	// is running would pile the queue; the per-env lock in the queue
	// would reject dispatch anyway, but better to not emit at all.
	const inFlight = await prisma.auditCycle.findFirst({
		where: {
			environmentId,
			status: { in: ["pending", "running"] },
		},
		select: { id: true },
	});
	if (inFlight) return null;

	// Fetch the most recent completed cycle of each type in one round-trip
	// using groupBy. (Falls back to findFirst-per-type if the specific
	// Prisma version doesn't support _max on completedAt groupBy.)
	const lastByType = new Map<string, number>();
	try {
		const rows = await prisma.auditCycle.groupBy({
			by: ["cycleType"],
			where: {
				environmentId,
				status: "complete",
			},
			_max: { completedAt: true },
		});
		for (const r of rows) {
			if (r._max.completedAt) {
				lastByType.set(r.cycleType, r._max.completedAt.getTime());
			}
		}
	} catch {
		// Fallback path — slower but definitely works on older Prisma.
		for (const t of ["hot", "warm", "cold", "full"] as const) {
			const row = await prisma.auditCycle.findFirst({
				where: { environmentId, status: "complete", cycleType: t },
				select: { completedAt: true },
				orderBy: { completedAt: "desc" },
			});
			if (row?.completedAt) lastByType.set(t, row.completedAt.getTime());
		}
	}

	// Legacy cycles were recorded with cycleType="full" — treat those as
	// satisfying the cold-freshness requirement so Starter customers
	// don't get a duplicate cold run the hour this feature ships.
	const lastCold = Math.max(
		lastByType.get("cold") ?? 0,
		lastByType.get("full") ?? 0,
	);
	const lastWarm = lastByType.get("warm") ?? 0;
	const lastHot = lastByType.get("hot") ?? 0;

	const coldDue = cadence.coldMs > 0 && now - lastCold >= cadence.coldMs;
	const warmDue = cadence.warmMs > 0 && now - lastWarm >= cadence.warmMs;
	const hotDue = cadence.hotMs > 0 && now - lastHot >= cadence.hotMs;

	if (coldDue) return "cold";
	if (warmDue) return "warm";
	if (hotDue) return "hot";
	return null;
}

export interface SchedulerResult {
	envsEvaluated: number;
	cyclesEnqueued: number;
	enqueuedByType: Record<CycleMode, number>;
}

/**
 * Main scheduler pass — enumerate eligible envs, decide what's due,
 * emit cycles. Returns counts for observability.
 *
 * Eligibility = activated AND NOT continuousPaused AND org NOT
 * suspended. Demo orgs ARE included (they should stay live for sales)
 * so Starter cadence (weekly cold) will keep the demo account
 * refreshed even without any real user access.
 */
export async function runSchedulerPass(): Promise<SchedulerResult> {
	const result: SchedulerResult = {
		envsEvaluated: 0,
		cyclesEnqueued: 0,
		enqueuedByType: { hot: 0, warm: 0, cold: 0 },
	};

	// Cursor pagination — process every eligible environment in batches
	// without an arbitrary upper bound. Previous version capped at 500
	// envs/tick which would have starved the long tail past ~1500
	// customers × 5 envs (10h before the scheduler revisited an env).
	//
	// SCHEDULER_BATCH_SIZE bounds the per-batch DB load (default 200);
	// SCHEDULER_MAX_ENVS_PER_TICK is a runaway safety net (default 10_000)
	// so a one-off bad query plan can't loop forever. Real load should
	// never approach this.
	const BATCH_SIZE = Number(process.env.SCHEDULER_BATCH_SIZE || "200");
	const MAX_PER_TICK = Number(process.env.SCHEDULER_MAX_ENVS_PER_TICK || "10000");
	let cursor: string | undefined;
	let allEnvs: Array<{
		id: string;
		organizationId: string;
		organization: { plan: string | null; status: string | null } | null;
	}> = [];
	try {
		while (allEnvs.length < MAX_PER_TICK) {
			const batch = await prisma.environment.findMany({
				where: {
					activated: true,
					continuousPaused: false,
					organization: {
						status: { not: "suspended" },
					},
				},
				select: {
					id: true,
					organizationId: true,
					organization: {
						select: { plan: true, status: true },
					},
				},
				orderBy: { id: "asc" },
				take: BATCH_SIZE,
				...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
			});
			if (batch.length === 0) break;
			allEnvs = allEnvs.concat(batch);
			cursor = batch[batch.length - 1].id;
			if (batch.length < BATCH_SIZE) break; // last page
		}
	} catch (err) {
		console.error("[audit-scheduler] env enumeration failed:", err);
		return result;
	}
	const envs = allEnvs;

	result.envsEvaluated = envs.length;

	for (const env of envs) {
		try {
			const planKey = env.organization?.plan || "vestigio";
			const due = await resolveDueCycleType(env.id, planKey);
			if (!due) continue;

			const cycle = await prisma.auditCycle.create({
				data: {
					organizationId: env.organizationId,
					environmentId: env.id,
					status: "pending",
					cycleType: due,
				},
				select: { id: true },
			});

			// Priority tier: hot/warm/cold — the queue drains in that
			// order so a hot cycle on a Max org never waits behind a
			// cold baseline for a Starter org.
			const enqueued = await enqueueAuditCycle({
				cycleId: cycle.id,
				environmentId: env.id,
				organizationId: env.organizationId,
				priority: due,
			});
			if (!enqueued) {
				// Redis not configured — fall back to the legacy in-process
				// dispatch so the cycle still runs. Without REDIS_URL the
				// worker service isn't drained either; this is the same
				// fallback used by webhooks.
				import("./run-cycle")
					.then((m) => m.runAuditCycle(cycle.id))
					.catch((err) => {
						console.error(
							`[audit-scheduler] in-process dispatch failed cycle=${cycle.id}:`,
							err,
						);
					});
			}

			result.cyclesEnqueued += 1;
			result.enqueuedByType[due] += 1;
			console.log(
				`[audit-scheduler] enqueued ${due} cycle=${cycle.id} env=${env.id} plan=${planKey}`,
			);
		} catch (err) {
			console.error(
				`[audit-scheduler] failed to schedule env=${env.id}:`,
				err,
			);
		}
	}

	return result;
}
