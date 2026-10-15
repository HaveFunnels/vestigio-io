import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import {
	MIN_EVENTS_INTERACTIVE,
	scanTimelinesByPath,
	type TimelineRowInput,
} from "./measured-friction";

// ──────────────────────────────────────────────
// Daily friction rollup writer
//
// Why this exists, in order of what it actually buys:
//
// 1. Correctness. The live scan capped at the most recent 4,000
//    interactive sessions and presented the result as the page's
//    behavior. On Casa Montelle that cap is 5% of a 30-day window.
//    Measured against the full 77,804: the homepage's friction rate
//    is 12.9%, not the 23.1% the sample reported, and a page with
//    11,004 sessions was missing from the list entirely.
//
// 2. Query cost. Every plan generation pulled ~53 MB of timelines
//    across the wire and parsed them. The rollup reads ~4,145 small
//    rows instead.
//
// 3. Storage, modestly. The scan was the only thing needing the
//    timeline column over a long window, so once nothing reads it
//    past the journey window it can be blanked on age. Measured
//    2026-10-15 that is ~31 MB, not the headline saving: the
//    database's real weight is Evidence at 56%, with
//    BehavioralSessionAggregate at 20%.
//
// The counting rules are not reimplemented here: this calls the same
// exported scan measured-friction uses, so the two cannot drift.
//
// Why daily buckets are sound: a session has one startedAt, so it
// lands in exactly one bucket. Distinct-session counts (sessions,
// sessionsWithFriction) therefore sum across days without
// double-counting, which is the property that lets a 30-day read be
// a SUM over 30 rows instead of a scan over 58,000 sessions.
//
// Idempotent by (envId, day, path). A day that is still open gets
// recomputed on each run and settles once it is past.
// ──────────────────────────────────────────────

/** Days back from today that get recomputed on each run. Today is
 *  still accumulating, and late-arriving beacons can land against
 *  yesterday, so both are always redone. */
export const ROLLUP_RECOMPUTE_DAYS = 2;

function dayKey(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface RollupResult {
	daysProcessed: number;
	rowsWritten: number;
	sessionsScanned: number;
}

/**
 * Recompute friction buckets for an environment.
 *
 * `daysBack` controls how far to recompute. The cycle path passes the
 * default (today + yesterday); the backfill passes the full retention
 * window once.
 */
export async function rollUpFriction(
	prisma: PrismaClient,
	environmentId: string,
	daysBack: number = ROLLUP_RECOMPUTE_DAYS,
	now: Date = new Date(),
): Promise<RollupResult> {
	const result: RollupResult = { daysProcessed: 0, rowsWritten: 0, sessionsScanned: 0 };

	for (let i = 0; i < daysBack; i++) {
		const dayStart = dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
		const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

		// No SAMPLE_CAP here, deliberately. The live scan sampled the
		// most recent 4,000 interactive sessions across a 30-day window;
		// one day's sessions are a small enough set to count in full, so
		// the rollup is a census rather than a sample. That is the point
		//, it also closes the "counted in a 4% sample, reported as the
		// whole" gap the October plan shipped with.
		const rows = (await prisma.behavioralSessionAggregate.findMany({
			where: {
				envId: environmentId,
				startedAt: { gte: dayStart, lt: dayEnd },
				// Same interactivity gate the live loader applies. Without
				// it the rollup would count bounces in the denominator and
				// quietly deflate every friction rate.
				eventCount: { gte: MIN_EVENTS_INTERACTIVE },
			},
			select: { timeline: true, urls: true },
		})) as TimelineRowInput[];

		result.daysProcessed++;
		result.sessionsScanned += rows.length;
		if (rows.length === 0) continue;

		const byPath = scanTimelinesByPath(rows);
		if (byPath.size === 0) continue;

		// One statement per day, not one per path. A busy day produces
		// ~100 paths, and at ~250ms per round trip over the pooler that
		// turned a 30-day backfill into something that could not finish
		// inside ten minutes. Batched, a day is one round trip.
		//
		// Upsert rather than delete-then-insert, so a concurrent reader
		// never observes the day missing.
		const dayIso = dayStart.toISOString().slice(0, 10);
		const entries = [...byPath.entries()];

		// Postgres caps a statement at 65535 bind parameters; 12 per row
		// leaves plenty of headroom at 500 rows per chunk.
		for (let off = 0; off < entries.length; off += 500) {
			const chunk = entries.slice(off, off + 500);
			const values: unknown[] = [];
			const tuples: string[] = [];

			chunk.forEach(([path, a], i) => {
				const b = i * 12;
				tuples.push(
					`($${b + 1},$${b + 2},$${b + 3}::date,$${b + 4},$${b + 5},$${b + 6},` +
						`$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`,
				);
				values.push(
					// Deterministic id over the same triple as the unique
					// index, so a re-run updates its own row instead of
					// burning a fresh cuid on every recompute. Hashed
					// rather than truncated: two long paths sharing a
					// prefix would otherwise collide on the primary key,
					// which ON CONFLICT (envId,day,path) does not catch.
					`frd_${createHash("sha1")
						.update(`${environmentId}\u0000${dayIso}\u0000${path}`)
						.digest("hex")}`,
					environmentId,
					dayIso,
					path,
					a.sessions.size,
					a.frictionSessions.size,
					a.deadClicks,
					a.hesitationsNearCta,
					a.inputAbandons,
					a.backtracks,
					a.formRetries,
					// Same value on every path row for this day. See the
					// schema note: the per-path counts cannot be summed into
					// a session total without double-counting.
					rows.length,
				);
			});

			await prisma.$executeRawUnsafe(
				`INSERT INTO "FrictionDailyRollup"
				 ("id","envId","day","path","sessions","sessionsWithFriction",
				  "deadClicks","hesitationsNearCta","inputAbandons","backtracks","formRetries",
				  "envSessions")
				 VALUES ${tuples.join(",")}
				 ON CONFLICT ("envId","day","path") DO UPDATE SET
				   "sessions" = EXCLUDED."sessions",
				   "sessionsWithFriction" = EXCLUDED."sessionsWithFriction",
				   "deadClicks" = EXCLUDED."deadClicks",
				   "hesitationsNearCta" = EXCLUDED."hesitationsNearCta",
				   "inputAbandons" = EXCLUDED."inputAbandons",
				   "backtracks" = EXCLUDED."backtracks",
				   "formRetries" = EXCLUDED."formRetries",
				   "envSessions" = EXCLUDED."envSessions",
				   "computedAt" = now()`,
				...values,
			);
			result.rowsWritten += chunk.length;
		}
	}

	return result;
}
