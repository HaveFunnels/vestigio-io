import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Drop the payload of Evidence rows nothing can still read.
//
// Evidence is the largest table in the database. The rows themselves
// are cheap; the `payload` column is not. Measured 2026-10-15:
// 617,320 rows carrying 452 MB of payload, of which 399 MB sits in
// rows outside every window that still reads them.
//
// Who actually reads a payload after its cycle ends:
//
//   - carryEvidenceForward, which copies rows from previousCycleRef
//     into a new cycle when the content hash says the page did not
//     change. This is the only cross-cycle reader, and it only ever
//     looks at the immediately preceding cycle.
//
//   - nothing else. Every other consumer of content_enrichment,
//     page_content and friends reads the evidence array in memory
//     during the cycle that produced it.
//
// So the bound is not an age. It is "not one of the recent cycles",
// with an age floor on top. An environment that runs a cycle an hour
// and one that runs a cycle a month are both safe, which a pure age
// cutoff cannot promise: at 30-day retention a monthly-cadence
// customer's previous cycle is always near the edge.
//
// The payload is replaced rather than emptied. It is declared
// `String @db.Text` and readers do JSON.parse on it, so "" would
// throw where a dropped payload should simply read as absent. The
// sentinel parses, and says what happened.
// ──────────────────────────────────────────────

/** Replaces a dropped payload. Valid JSON, and self-describing. */
export const PRUNED_PAYLOAD = '{"_pruned":true}';

/** Age floor. Nothing newer than this is touched, whatever cycle it
 *  belongs to. */
export const PAYLOAD_PRUNE_DAYS = 7;

/**
 * Cycles per environment whose payloads are never dropped.
 *
 * carryEvidenceForward needs one: the cycle before the running one.
 * While a cycle is in flight it is itself the most recent, so the one
 * it reads is the second. Five is that requirement with room for a
 * retry or a crashed cycle in between.
 */
export const KEEP_RECENT_CYCLES = 5;

/** Rows per statement. Keeps each transaction short on a table this
 *  size rather than locking 500k rows at once. */
const BATCH = 5000;

export interface PrunePayloadsResult {
	scanned: number;
	pruned: number;
	batches: number;
}

export async function pruneEvidencePayloads(
	prisma: PrismaClient,
	opts: {
		olderThanDays?: number;
		keepRecentCyclesPerEnv?: number;
		/** Count what would be dropped, change nothing. */
		dryRun?: boolean;
		now?: Date;
	} = {},
): Promise<PrunePayloadsResult> {
	const days = opts.olderThanDays ?? PAYLOAD_PRUNE_DAYS;
	const keep = opts.keepRecentCyclesPerEnv ?? KEEP_RECENT_CYCLES;
	const now = opts.now ?? new Date();
	const cutoff = new Date(now.getTime() - days * 86400_000);
	const result: PrunePayloadsResult = { scanned: 0, pruned: 0, batches: 0 };

	// An Evidence row with a null auditCycleId belongs to no cycle, so
	// no carry-forward can reach it. It is covered by the age floor
	// alone.
	const exemptSql = `
		SELECT id FROM (
			SELECT id, row_number() OVER (
				PARTITION BY "environmentId" ORDER BY "createdAt" DESC
			) AS rn
			FROM "AuditCycle"
		) t WHERE rn <= $1`;

	if (opts.dryRun) {
		const rows = await prisma.$queryRawUnsafe<{ count: bigint; bytes: bigint }[]>(
			`WITH exempt AS (${exemptSql})
			 SELECT count(*)::bigint AS count,
			        coalesce(sum(pg_column_size(payload)),0)::bigint AS bytes
			 FROM "Evidence" e
			 WHERE e."createdAt" < $2
			   AND e.payload <> $3
			   AND (e."auditCycleId" IS NULL
			        OR e."auditCycleId" NOT IN (SELECT id FROM exempt))`,
			keep,
			cutoff,
			PRUNED_PAYLOAD,
		);
		result.scanned = Number(rows[0]?.count ?? 0);
		return result;
	}

	for (;;) {
		const affected = await prisma.$executeRawUnsafe(
			`WITH exempt AS (${exemptSql}),
			      victims AS (
			        SELECT e.id FROM "Evidence" e
			        WHERE e."createdAt" < $2
			          AND e.payload <> $3
			          AND (e."auditCycleId" IS NULL
			               OR e."auditCycleId" NOT IN (SELECT id FROM exempt))
			        LIMIT ${BATCH}
			      )
			 UPDATE "Evidence" SET payload = $3
			 WHERE id IN (SELECT id FROM victims)`,
			keep,
			cutoff,
			PRUNED_PAYLOAD,
		);
		result.batches++;
		result.pruned += affected;
		if (affected === 0) break;
		// A runaway loop here would hammer the database, so stop at a
		// bound well past any plausible backlog and let the next pass
		// continue.
		if (result.batches > 500) break;
	}

	return result;
}
