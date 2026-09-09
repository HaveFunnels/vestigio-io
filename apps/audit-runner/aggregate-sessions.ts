// ──────────────────────────────────────────────
// Session aggregation — turns the raw event table into staging.
//
// **Why:** RawBehavioralEvent was measured at 61,099 rows/day for a
// single environment, ~85 MB/day, against a 4.6 GB volume. The 90-day
// product window that implies (7.6 GB for one customer) does not fit,
// and no retention setting makes it fit — the shape was wrong, not the
// window. Meanwhile every audit cycle re-reduced the last 30 days of
// those rows, so the same events were read and aggregated ~96 times a
// day to produce a result that was never stored.
//
// This runs the reduction once, when the session is over, and keeps the
// result. 61,099 events/day become 4,353 sessions/day. Once the readers
// move over, the raw rows have nothing left to say and can be deleted,
// which is what lets their retention drop from 90 days to roughly an
// hour — see AggregateSessionsOptions.deleteRawAfterAggregate, which is
// off until that migration is done.
//
// **Why it reuses aggregateSession() rather than computing counters at
// ingest:** several fields in SessionAggregate are only knowable once
// the whole session is visible — time_to_first_commercial_action_ms,
// oscillation_pairs, journey_type. Computing them incrementally from
// 50-event batches would mean reimplementing that logic in a second
// place and letting the two drift. Waiting for the session to go idle
// costs a short staging window and keeps exactly one definition of what
// a session means.
//
// Sessions are considered over after SESSION_IDLE_MS with no new event,
// matching the snippet's own 30-minute session timeout plus a margin
// for late-arriving beacons.
// ──────────────────────────────────────────────

import { prisma } from "@/libs/prismaDb";
import { buildSessionRow } from "../../packages/behavioral/session-row-builder";

/** Snippet's SESSION_TIMEOUT is 30 min; the margin covers beacons sent on unload. */
const SESSION_IDLE_MS = 35 * 60 * 1000;

/**
 * Sessions per pass.
 *
 * Bounds memory, not query count: the pass issues a handful of queries
 * per environment regardless of how many sessions it handles. At ~12
 * events per session this reads ~24k rows, a few MB.
 *
 * Sized to drain a backlog in hours rather than days — the first run
 * against production had 46k un-aggregated sessions, which at the
 * original 500 would have taken 15 hours of ten-minute passes.
 */
const MAX_SESSIONS_PER_RUN = 2000;

export interface AggregateSessionsResult {
	sessionsAggregated: number;
	sessionsSkipped: number;
	rawRowsDeleted: number;
	errors: number;
}

export interface AggregateSessionsOptions {
	/**
	 * Whether to delete a session's raw rows once its aggregate is
	 * written. Defaults to false, and that default is the whole
	 * migration strategy.
	 *
	 * process-behavioral.ts still reads RawBehavioralEvent over a 30-day
	 * window, as do the journey map and monthly journeys. Deleting the
	 * raw rows before those readers move over would silently empty the
	 * behavioural evidence pipeline — findings would simply stop being
	 * emitted, with nothing in the logs to say why.
	 *
	 * So this runs in shadow first: aggregates are written and can be
	 * compared against the raw rows they came from, while the raw rows
	 * keep serving every existing reader. Only once the readers are
	 * migrated and the comparison holds does BEHAVIORAL_AGGREGATE_PRUNE
	 * get set, and only then does the raw table's retention drop from 90
	 * days to hours.
	 */
	deleteRawAfterAggregate?: boolean;
}

/**
 * Aggregate every session that has gone idle, then drop its raw rows.
 *
 * Idempotent by construction: the upsert is keyed on (envId, sessionId),
 * and raw rows are only deleted after the aggregate for that session has
 * been written. A crash between the two leaves rows that the next pass
 * re-aggregates to the same result.
 */
export async function aggregateIdleSessions(
	options: AggregateSessionsOptions = {},
): Promise<AggregateSessionsResult> {
	const deleteRaw = options.deleteRawAfterAggregate ?? false;
	const result: AggregateSessionsResult = {
		sessionsAggregated: 0,
		sessionsSkipped: 0,
		rawRowsDeleted: 0,
		errors: 0,
	};
	const idleBefore = new Date(Date.now() - SESSION_IDLE_MS);

	// Which sessions are finished AND not yet aggregated. The exclusion
	// has to live in the scan itself: the batched version paged with
	// `orderBy sessionId ASC, take N`, so in shadow mode (raw rows kept)
	// every pass re-fetched the same first N already-aggregated sessions,
	// skipped them all, logged nothing (the log line fires on progress or
	// errors, and this was neither), and the backlog sat at 2k of 47k for
	// a day looking like a quiet worker instead of a wedged one. Prune
	// mode never hits this — deleted rows leave the window — which is
	// exactly why shadow mode needed its own scan.
	let idle: Array<{ envId: string; sessionId: string }>;
	try {
		idle = await prisma.$queryRaw<Array<{ envId: string; sessionId: string }>>`
			SELECT r."envId", r."sessionId"
			FROM "RawBehavioralEvent" r
			LEFT JOIN "BehavioralSessionAggregate" a
				ON a."envId" = r."envId" AND a."sessionId" = r."sessionId"
			WHERE a.id IS NULL
			GROUP BY r."envId", r."sessionId"
			HAVING max(r."receivedAt") < ${idleBefore}
			ORDER BY r."sessionId" ASC
			LIMIT ${MAX_SESSIONS_PER_RUN}
		`;
	} catch (err) {
		console.error("[aggregate-sessions] idle-session scan failed:", err);
		return { ...result, errors: 1 };
	}

	if (idle.length === 0) return result;

	// Everything below is batched per environment rather than per session.
	// The first version issued three round-trips per session (existence
	// check, event fetch, upsert), which at 500 sessions a pass meant
	// ~1,500 queries and made draining a 46k-session backlog a 15-hour
	// job. Since this keeps running after the cutover, the shape matters.
	const byEnv = new Map<string, string[]>();
	for (const { envId, sessionId } of idle) {
		const list = byEnv.get(envId);
		if (list) list.push(sessionId);
		else byEnv.set(envId, [sessionId]);
	}

	for (const [envId, allSessionIds] of byEnv) {
		let sessionIds = allSessionIds;

		try {
			// Which of these are already done. One query instead of one per
			// session. Safe to skip on existence alone: the session is idle,
			// so its events cannot change any more.
			const existing = await prisma.behavioralSessionAggregate.findMany({
				where: { envId, sessionId: { in: sessionIds } },
				select: { sessionId: true },
			});
			if (existing.length > 0) {
				const done = new Set(existing.map((e) => e.sessionId));
				const before = sessionIds.length;
				sessionIds = sessionIds.filter((id) => !done.has(id));
				result.sessionsSkipped += before - sessionIds.length;

				// In prune mode an already-aggregated session reappearing means
				// a straggler beacon arrived after its rows were deleted.
				// Re-aggregating would rebuild the session from only those late
				// events and overwrite a correct aggregate with a fragment, so
				// the stragglers are dropped and the aggregate is left alone.
				if (deleteRaw) {
					const del = await prisma.rawBehavioralEvent.deleteMany({
						where: { envId, sessionId: { in: [...done] } },
					});
					result.rawRowsDeleted += del.count;
					if (del.count > 0) {
						console.warn(
							`[aggregate-sessions] dropped ${del.count} late row(s) for ${done.size} already-aggregated session(s) in env ${envId}`,
						);
					}
				}
			}
			if (sessionIds.length === 0) continue;

			// All events for the remaining sessions, in one ordered read.
			const rows = await prisma.rawBehavioralEvent.findMany({
				where: { envId, sessionId: { in: sessionIds } },
				orderBy: [{ sessionId: "asc" }, { occurredAt: "asc" }],
			});
			if (rows.length === 0) continue;

			const grouped = new Map<string, typeof rows>();
			for (const row of rows) {
				const bucket = grouped.get(row.sessionId);
				if (bucket) bucket.push(row);
				else grouped.set(row.sessionId, [row]);
			}

			const toCreate: Array<{
				envId: string;
				sessionId: string;
				startedAt: Date;
				endedAt: Date;
				eventCount: number;
				aggregate: string;
				timeline: string;
				urls: string;
				timelineTruncated: boolean;
			}> = [];
			const emptySessionIds: string[] = [];

			for (const [sessionId, sessionRows] of grouped) {
				try {
					const built = buildSessionRow(envId, sessionId, sessionRows);
					if (built) toCreate.push(built);
					else emptySessionIds.push(sessionId);
				} catch (err) {
					result.errors++;
					console.error(
						`[aggregate-sessions] session ${sessionId} (env ${envId}) failed:`,
						err instanceof Error ? err.message : err,
					);
				}
			}

			// Sessions whose every row was malformed have nothing to
			// aggregate. Drop them regardless of mode, or they are rescanned
			// on every pass forever.
			if (emptySessionIds.length > 0) {
				const del = await prisma.rawBehavioralEvent.deleteMany({
					where: { envId, sessionId: { in: emptySessionIds } },
				});
				result.rawRowsDeleted += del.count;
			}

			// createMany, not upsert: everything here was filtered against
			// existing rows above. skipDuplicates covers the race where two
			// replicas somehow both got past the leader lock.
			const CHUNK = 200;
			const written: string[] = [];
			for (let i = 0; i < toCreate.length; i += CHUNK) {
				const chunk = toCreate.slice(i, i + CHUNK);
				await prisma.behavioralSessionAggregate.createMany({
					data: chunk,
					skipDuplicates: true,
				});
				written.push(...chunk.map((c) => c.sessionId));
				result.sessionsAggregated += chunk.length;
			}

			// Source rows go only after their aggregate is committed. The
			// reverse order would lose sessions to a crash in between.
			if (deleteRaw && written.length > 0) {
				for (let i = 0; i < written.length; i += CHUNK) {
					const del = await prisma.rawBehavioralEvent.deleteMany({
						where: { envId, sessionId: { in: written.slice(i, i + CHUNK) } },
					});
					result.rawRowsDeleted += del.count;
				}
			}
		} catch (err) {
			// One environment failing must not stop the others.
			result.errors++;
			console.error(
				`[aggregate-sessions] env ${envId} failed:`,
				err instanceof Error ? err.message : err,
			);
		}
	}

	return result;
}
