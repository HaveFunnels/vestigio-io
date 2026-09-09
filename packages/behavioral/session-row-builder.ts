// ──────────────────────────────────────────────
// Session row builder — reduces one session's raw rows into the single
// row that replaces them.
//
// Lives here rather than in the audit-runner worker because it is pure:
// no Prisma, no clock, no IO. That is deliberate. This is the only part
// of the session-aggregation design that is not reusing existing code —
// aggregateSession() was already the definition of what a session means,
// but the compact timeline format is new — so it is the part most worth
// being able to test directly.
//
// The timeline format exists because journey replay needs the event
// sequence and SessionAggregate does not carry it. buildTimeline() in
// src/lib/journey-replays.ts reads only `type`, `data`, `ts` and `url`
// from each event, so those four are what a timeline entry has to be
// able to reproduce:
//
//     [msSinceSessionStart, eventType, urlIndex]           // no data
//     [msSinceSessionStart, eventType, urlIndex, data]     // with data
//
// URLs are deduped into a side array and referenced by index because a
// session revisits the same handful of pages, and the URL was the second
// largest column on the raw table.
// ──────────────────────────────────────────────

import { aggregateSession } from "./session-aggregator";
import type { AttributionContext, RawBehavioralEvent as RawEventShape } from "./types";

/**
 * Timeline entries kept per session. A ~12-event session is typical, so
 * this only bites on pathological ones (bots, a tab left open for
 * hours). Aggregation still consumes every event; only replay detail is
 * capped, and `timelineTruncated` records that it happened so a reader
 * can say so rather than present a clipped journey as complete.
 */
export const MAX_TIMELINE_ENTRIES = 400;

export type CompactEntry = [number, string, number] | [number, string, number, unknown];

/** The subset of a raw event row this needs. Kept structural so the
 *  function stays free of Prisma types. */
export interface RawSessionRow {
	url: string;
	eventType: string;
	occurredAt: Date;
	payload: string;
	attribution: string | null;
}

export interface BuiltSessionRow {
	envId: string;
	sessionId: string;
	startedAt: Date;
	endedAt: Date;
	eventCount: number;
	aggregate: string;
	timeline: string;
	urls: string;
	timelineTruncated: boolean;
}

/**
 * Returns null when every row was malformed — the caller treats that as
 * "nothing to keep, delete the source" rather than writing an empty
 * aggregate that would look like a real but featureless session.
 *
 * Rows MUST be ordered by occurredAt ascending. The timeline offsets and
 * the startedAt/endedAt bounds all depend on it.
 */
export function buildSessionRow(
	envId: string,
	sessionId: string,
	rows: RawSessionRow[],
): BuiltSessionRow | null {
	if (rows.length === 0) return null;

	const events: RawEventShape[] = [];
	const timeline: CompactEntry[] = [];
	const urls: string[] = [];
	const urlIndex = new Map<string, number>();
	let attribution: AttributionContext | null = null;
	let truncated = false;

	const startMs = rows[0].occurredAt.getTime();

	for (const row of rows) {
		// First-touch: the chronologically first non-null attribution wins,
		// matching what process-behavioral.ts did when it read raw rows.
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
			continue; // malformed row — skipped, same as the old reader did
		}
		if (!parsed) continue;

		// Normalise `data` before it reaches aggregateSession, which reads
		// `event.data.label` unguarded and would throw on a payload without
		// it. The ingest sanitizer already coerces data to {} so production
		// rows always have it — but a throw here is caught per-session by
		// the worker, meaning such a row would silently drop a whole
		// session instead of failing loudly. It also keeps the round-trip
		// exact: rebuildEventsFromTimeline yields {} for a missing data
		// slot, so the source has to agree.
		if (!parsed.data || typeof parsed.data !== "object") {
			parsed = { ...parsed, data: {} };
		}
		events.push(parsed);

		if (timeline.length >= MAX_TIMELINE_ENTRIES) {
			truncated = true;
			continue; // keep aggregating; only replay detail is capped
		}

		let idx = urlIndex.get(row.url);
		if (idx === undefined) {
			idx = urls.length;
			urls.push(row.url);
			urlIndex.set(row.url, idx);
		}

		// Offsets from the server-side occurredAt, not the payload's client
		// clock: the client clock can be skewed, and buildTimeline only ever
		// uses the difference from the session start.
		const base: [number, string, number] = [
			row.occurredAt.getTime() - startMs,
			row.eventType,
			idx,
		];
		const data = (parsed as { data?: unknown }).data;
		const hasData =
			data !== null && typeof data === "object" && Object.keys(data as object).length > 0;
		timeline.push(hasData ? [...base, data] : base);
	}

	if (events.length === 0) return null;

	const aggregate = aggregateSession({
		events,
		attribution: attribution ?? ({} as AttributionContext),
		session_id: sessionId,
		env_id: envId,
	});

	return {
		envId,
		sessionId,
		startedAt: rows[0].occurredAt,
		endedAt: rows[rows.length - 1].occurredAt,
		eventCount: events.length,
		aggregate: JSON.stringify(aggregate),
		timeline: JSON.stringify(timeline),
		urls: JSON.stringify(urls),
		timelineTruncated: truncated,
	};
}

/**
 * Rebuild the events a timeline came from.
 *
 * This is what makes the compact format safe to rely on: replay reads
 * events, so the format is only correct if it round-trips. Used by the
 * journey-replay reader and by
 * scripts/diagnostics/verify-session-aggregates.ts, which compares the
 * output against the original rows before pruning is ever enabled.
 */
export function rebuildEventsFromTimeline(args: {
	envId: string;
	sessionId: string;
	startedAt: Date;
	timeline: CompactEntry[];
	urls: string[];
}): RawEventShape[] {
	const startMs = args.startedAt.getTime();
	return args.timeline.map((entry) => ({
		type: entry[1] as RawEventShape["type"],
		ts: startMs + entry[0],
		session_id: args.sessionId,
		env_id: args.envId,
		url: args.urls[entry[2]] ?? "",
		data: (entry.length > 3 ? entry[3] : {}) as Record<string, unknown>,
	}));
}
