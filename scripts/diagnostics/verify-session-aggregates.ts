#!/usr/bin/env tsx
/**
 * verify-session-aggregates — proves the shadow aggregates can replace
 * the raw rows before anything starts deleting them.
 *
 * Shadow mode writes BehavioralSessionAggregate while leaving
 * RawBehavioralEvent intact, so for a window both exist and can be
 * compared. This script is the gate on turning
 * BEHAVIORAL_AGGREGATE_PRUNE on: run it, get zero mismatches, then flip.
 *
 * Three checks, in increasing strictness:
 *
 *   1. Coverage — every idle session in the raw table has an aggregate.
 *      Catches the worker silently skipping sessions.
 *
 *   2. Aggregate fidelity — re-running aggregateSession() over the raw
 *      rows reproduces the stored aggregate exactly. Catches a bug in
 *      how the worker assembles the batch (ordering, attribution
 *      selection, malformed-row handling).
 *
 *   3. Timeline reconstruction — rebuilding RawBehavioralEvent objects
 *      from the compact timeline reproduces the original parsed events.
 *      This is the check that matters most, because the compact format
 *      is the one piece of this design that is not reusing existing
 *      code. buildTimeline() reads only type, data, ts and url from each
 *      event, so if the reconstructed events match the originals its
 *      output matches by construction — which is a stronger statement
 *      than comparing two timelines and is testable without exporting
 *      the private function.
 *
 * Usage: npx tsx scripts/diagnostics/verify-session-aggregates.ts [limit]
 */

import { PrismaClient } from "@prisma/client";
import { aggregateSession } from "../../packages/behavioral";
import {
	rebuildEventsFromTimeline,
	MAX_TIMELINE_ENTRIES,
	type CompactEntry,
} from "../../packages/behavioral/session-row-builder";
import type {
	AttributionContext,
	RawBehavioralEvent as RawEventShape,
} from "../../packages/behavioral/types";

const prisma = new PrismaClient();
const SESSION_IDLE_MS = 35 * 60 * 1000;

/** Stable stringify so key order never causes a false mismatch. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_k, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
		}
		return v;
	});
}

async function main() {
	const limit = Number(process.argv[2] || 200);
	const idleBefore = new Date(Date.now() - SESSION_IDLE_MS);

	const groups = await prisma.rawBehavioralEvent.groupBy({
		by: ["envId", "sessionId"],
		_max: { receivedAt: true },
		having: { receivedAt: { _max: { lt: idleBefore } } },
		orderBy: { sessionId: "asc" },
		take: limit,
	});

	console.log(`idle sessions still present in raw: ${groups.length} (limit ${limit})`);
	if (groups.length === 0) {
		console.log(
			"\nNothing to compare. Either the worker has not run yet, or it is already " +
				"pruning (in which case raw rows are gone and this check no longer applies).",
		);
		return;
	}

	let missing = 0;
	let pending = 0;
	let aggMismatch = 0;
	let timelineMismatch = 0;
	let truncatedSkipped = 0;
	let checked = 0;
	const examples: string[] = [];
	// A session that crossed the idle threshold moments before this run
	// may not have been aggregated by the 10-minute worker yet. Below this
	// age it is "pending", not "missing".
	const AGG_GRACE_MS = 20 * 60 * 1000;

	for (const g of groups) {
		const { envId, sessionId } = g;
		const stored = await prisma.behavioralSessionAggregate.findUnique({
			where: { envId_sessionId: { envId, sessionId } },
		});
		const rows = await prisma.rawBehavioralEvent.findMany({
			where: { envId, sessionId },
			orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
		});
		if (!stored) {
			const lastEvent = rows.length > 0 ? rows[rows.length - 1].receivedAt.getTime() : 0;
			if (Date.now() - lastEvent < AGG_GRACE_MS) {
				pending++; // just went idle; worker has not caught up yet
			} else {
				missing++;
				if (examples.length < 5) examples.push(`missing aggregate: ${sessionId}`);
			}
			continue;
		}
		if (rows.length === 0) continue;

		// Rebuild the batch exactly as the worker does.
		const events: RawEventShape[] = [];
		let attribution: AttributionContext | null = null;
		for (const row of rows) {
			if (!attribution && row.attribution) {
				try {
					attribution = JSON.parse(row.attribution) as AttributionContext;
				} catch {
					/* same tolerance as the worker */
				}
			}
			try {
				events.push(JSON.parse(row.payload) as RawEventShape);
			} catch {
				/* malformed — worker skips these too */
			}
		}
		if (events.length === 0) continue;
		checked++;

		// ── 2. Aggregate fidelity ──
		const recomputed = aggregateSession({
			events,
			attribution: attribution ?? ({} as AttributionContext),
			session_id: sessionId,
			env_id: envId,
		});
		if (canonical(recomputed) !== canonical(JSON.parse(stored.aggregate))) {
			aggMismatch++;
			if (examples.length < 5) examples.push(`aggregate differs: ${sessionId}`);
		}

		// ── 3. Timeline reconstruction ──
		// A truncated timeline is expected to be shorter; comparing it to
		// the full event list would report a false mismatch.
		if (stored.timelineTruncated || events.length > MAX_TIMELINE_ENTRIES) {
			truncatedSkipped++;
			continue;
		}
		const timeline = JSON.parse(stored.timeline) as CompactEntry[];
		const urls = JSON.parse(stored.urls) as string[];
		const startMs = stored.startedAt.getTime();
		// Deliberately the production function, not a copy of it. A local
		// reimplementation here would only prove that two copies of my own
		// reasoning agree with each other.
		const rebuilt: RawEventShape[] = rebuildEventsFromTimeline({
			envId,
			sessionId,
			startedAt: stored.startedAt,
			timeline,
			urls,
		});

		// Compare only the fields buildTimeline and mapEventToTimeline
		// actually read. ts is compared as the offset the timeline stores,
		// because the raw row's occurredAt is the server-side column while
		// the payload carries the client clock — the worker builds offsets
		// from the former by design.
		// Sort by (offset, canonical) before comparing. Events sharing a
		// millisecond have no meaningful order, and the DB does not return
		// ties in a stable order, so a raw-vs-aggregate compare that fixed
		// the tie order would flag false mismatches. Order ACROSS offsets is
		// still respected (offset is the primary sort key).
		const originalProjection = rows
			.map((row, i) => {
				const ev = events[i];
				if (!ev) return null;
				const offset = row.occurredAt.getTime() - startMs;
				return `${offset}:${canonical({ type: ev.type, data: ev.data ?? {}, url: row.url })}`;
			})
			.filter((x): x is string => x !== null)
			.sort()
			.join("|");
		const rebuiltProjection = rebuilt
			.map((ev) => `${ev.ts - startMs}:${canonical({ type: ev.type, data: ev.data ?? {}, url: ev.url })}`)
			.sort()
			.join("|");

		if (originalProjection !== rebuiltProjection) {
			timelineMismatch++;
			if (examples.length < 5) examples.push(`timeline differs: ${sessionId}`);
		}
	}

	console.log(`\n── results ──`);
	console.log(`sessions compared      : ${checked}`);
	console.log(`missing aggregate      : ${missing}`);
	console.log(`pending (just idle)    : ${pending}`);
	console.log(`aggregate mismatches   : ${aggMismatch}`);
	console.log(`timeline mismatches    : ${timelineMismatch}`);
	console.log(`truncated (skipped #3) : ${truncatedSkipped}`);
	if (examples.length > 0) console.log(`\nexamples:\n  ${examples.join("\n  ")}`);

	const failed = missing + aggMismatch + timelineMismatch;
	console.log(
		failed === 0
			? `\nPASS — aggregates reproduce the raw rows. Safe to enable BEHAVIORAL_AGGREGATE_PRUNE.`
			: `\nFAIL — ${failed} discrepancies. Do NOT enable pruning; the raw rows are still the only correct copy.`,
	);
	process.exitCode = failed === 0 ? 0 : 1;
}

main()
	.catch((err) => {
		console.error("verify failed:", err);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
