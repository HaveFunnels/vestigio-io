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
import { aggregateSession } from "../../packages/behavioral";
import type {
	AttributionContext,
	RawBehavioralEvent as RawEventShape,
} from "../../packages/behavioral/types";

/** Snippet's SESSION_TIMEOUT is 30 min; the margin covers beacons sent on unload. */
const SESSION_IDLE_MS = 35 * 60 * 1000;

/** Sessions per pass. Bounds one run's memory and transaction size. */
const MAX_SESSIONS_PER_RUN = 500;

/**
 * Timeline entries kept per session. A 14-event session is typical; the
 * cap only bites on pathological ones (bots, a tab left open for hours).
 * Truncation is recorded on the row so a reader can say so rather than
 * present a clipped journey as a complete one.
 */
const MAX_TIMELINE_ENTRIES = 400;

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

/** One timeline entry: [msSinceSessionStart, eventType, urlIndex, data?]. */
type CompactEntry = [number, string, number] | [number, string, number, unknown];

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

	// Which sessions are finished. Grouping in the database avoids
	// pulling events for sessions that are still being written to.
	let idle: Array<{ envId: string; sessionId: string }>;
	try {
		const groups = await prisma.rawBehavioralEvent.groupBy({
			by: ["envId", "sessionId"],
			_max: { receivedAt: true },
			having: { receivedAt: { _max: { lt: idleBefore } } },
			orderBy: { sessionId: "asc" },
			take: MAX_SESSIONS_PER_RUN,
		});
		idle = groups.map((g) => ({ envId: g.envId, sessionId: g.sessionId }));
	} catch (err) {
		console.error("[aggregate-sessions] idle-session scan failed:", err);
		return { ...result, errors: 1 };
	}

	if (idle.length === 0) return result;

	for (const { envId, sessionId } of idle) {
		try {
			// In shadow mode the raw rows survive, so without this every
			// pass would re-aggregate the same finished sessions forever.
			// Safe to skip on existence alone: the session is idle, so its
			// events cannot change any more.
			if (!deleteRaw) {
				const existing = await prisma.behavioralSessionAggregate.findUnique({
					where: { envId_sessionId: { envId, sessionId } },
					select: { id: true },
				});
				if (existing) {
					result.sessionsSkipped++;
					continue;
				}
			}

			const rows = await prisma.rawBehavioralEvent.findMany({
				where: { envId, sessionId },
				orderBy: { occurredAt: "asc" },
			});
			if (rows.length === 0) continue;

			const events: RawEventShape[] = [];
			const timeline: CompactEntry[] = [];
			const urls: string[] = [];
			const urlIndex = new Map<string, number>();
			let attribution: AttributionContext | null = null;
			let truncated = false;

			const startMs = rows[0].occurredAt.getTime();

			for (const row of rows) {
				if (!attribution && row.attribution) {
					try {
						attribution = JSON.parse(row.attribution) as AttributionContext;
					} catch {
						/* malformed attribution — first-touch stays null */
					}
				}

				let parsed: RawEventShape | null = null;
				try {
					parsed = JSON.parse(row.payload) as RawEventShape;
				} catch {
					continue; // malformed row — same handling as process-behavioral
				}
				if (!parsed) continue;
				events.push(parsed);

				if (timeline.length >= MAX_TIMELINE_ENTRIES) {
					truncated = true;
					continue; // keep aggregating; only the replay detail is capped
				}
				let idx = urlIndex.get(row.url);
				if (idx === undefined) {
					idx = urls.length;
					urls.push(row.url);
					urlIndex.set(row.url, idx);
				}
				// Offset rather than absolute timestamp: buildTimeline works in
				// seconds since session start, and offsets compress far better.
				const base: [number, string, number] = [
					row.occurredAt.getTime() - startMs,
					row.eventType,
					idx,
				];
				const data = (parsed as { data?: unknown }).data;
				const hasData =
					data !== null &&
					typeof data === "object" &&
					Object.keys(data as object).length > 0;
				timeline.push(hasData ? [...base, data] : base);
			}

			if (events.length === 0) {
				// Every row was malformed. Nothing to aggregate, so drop them
				// rather than rescanning this session on every pass forever.
				// Done regardless of shadow mode: there is no aggregate these
				// rows could still be needed to verify.
				const del = await prisma.rawBehavioralEvent.deleteMany({
					where: { envId, sessionId },
				});
				result.rawRowsDeleted += del.count;
				continue;
			}

			const aggregate = aggregateSession({
				events,
				attribution: attribution ?? ({} as AttributionContext),
				session_id: sessionId,
				env_id: envId,
			});

			const startedAt = rows[0].occurredAt;
			const endedAt = rows[rows.length - 1].occurredAt;
			const payload = {
				startedAt,
				endedAt,
				eventCount: events.length,
				aggregate: JSON.stringify(aggregate),
				timeline: JSON.stringify(timeline),
				urls: JSON.stringify(urls),
				timelineTruncated: truncated,
			};

			// Write the aggregate first, delete the source second. The
			// reverse order would lose a session to a crash in between.
			await prisma.behavioralSessionAggregate.upsert({
				where: { envId_sessionId: { envId, sessionId } },
				create: { envId, sessionId, ...payload },
				update: payload,
			});

			if (deleteRaw) {
				const deleted = await prisma.rawBehavioralEvent.deleteMany({
					where: { envId, sessionId },
				});
				result.rawRowsDeleted += deleted.count;
			}

			result.sessionsAggregated++;
		} catch (err) {
			// One bad session must not stop the pass; the rest still drain.
			result.errors++;
			console.error(
				`[aggregate-sessions] session ${sessionId} (env ${envId}) failed:`,
				err instanceof Error ? err.message : err,
			);
		}
	}

	return result;
}
