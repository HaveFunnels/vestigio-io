// ──────────────────────────────────────────────
// Measured friction by page (ONDA 3.2 — "findings comportamentais")
//
// The founder's verdict on the honest-but-shallow plan: "os findings
// ainda nascem do crawler, não das 22 mil sessões". This module turns
// the stored session timelines into COUNTED friction per page —
// "214 cliques sem resposta em /products/x, medidos" — which then
// feeds three surfaces: the measured block in the plan, the step
// prompts (so recommendations cite the store's own behavior), and the
// per-step measured verification baseline.
//
// Sources: BehavioralSessionAggregate.timeline (compact entries
// [offsetMs, type, urlIdx, data?]) + .urls — the same at-rest form the
// journeys rebuild from, scanned directly without full rebuild.
//
// Honesty contract:
//   - Counts are per SAMPLE, and the sample is declared (most recent
//     N interactive sessions in the window) — never presented as the
//     universe.
//   - A page enters the list only with a minimum of visiting sessions
//     (percentages over a trickle are noise).
//   - Friction kinds are the pixel's semantic events, named in the
//     customer's language at render time.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";

export interface FrictionPageStats {
	path: string;
	/** Sample sessions that touched this page. */
	sessions: number;
	deadClicks: number;
	hesitationsNearCta: number;
	inputAbandons: number;
	backtracks: number;
	formRetries: number;
	/** Distinct sample sessions with >= 1 friction event on this page. */
	sessionsWithFriction: number;
	/** sessionsWithFriction / sessions, one decimal (e.g. 23.4). */
	frictionRatePct: number;
}

export interface MeasuredFrictionOutput {
	basis: "pixel_measured";
	windowStart: string;
	windowEnd: string;
	/** Declared sample: most recent interactive sessions scanned. */
	sampleSessions: number;
	pages: FrictionPageStats[];
}

interface TimelineRowInput {
	timeline: string;
	urls: string;
}

const SAMPLE_CAP = 4000;
const MIN_SESSIONS_PER_PAGE = 30;
const MAX_PAGES = 6;
const MIN_EVENTS_INTERACTIVE = 3;

const FRICTION_TYPES = new Set([
	"dead_click",
	"hesitation_pause",
	"input_focus_abandon",
	"rapid_backtrack",
	"form_retry",
]);

function pathOf(url: string): string {
	try {
		return new URL(url).pathname || "/";
	} catch {
		return url.startsWith("/") ? url : "/";
	}
}

/** Pure scan over compact timelines — tested. */
export function computeMeasuredFriction(
	rows: TimelineRowInput[],
	windowStart: Date,
	windowEnd: Date,
): MeasuredFrictionOutput | null {
	if (rows.length === 0) return null;

	interface Acc {
		sessions: Set<number>;
		frictionSessions: Set<number>;
		deadClicks: number;
		hesitationsNearCta: number;
		inputAbandons: number;
		backtracks: number;
		formRetries: number;
	}
	const byPath = new Map<string, Acc>();
	const acc = (p: string): Acc => {
		let a = byPath.get(p);
		if (!a) {
			a = {
				sessions: new Set(),
				frictionSessions: new Set(),
				deadClicks: 0,
				hesitationsNearCta: 0,
				inputAbandons: 0,
				backtracks: 0,
				formRetries: 0,
			};
			byPath.set(p, a);
		}
		return a;
	};

	rows.forEach((row, sessionIdx) => {
		let timeline: Array<[number, string, number, Record<string, unknown>?]>;
		let urls: string[];
		try {
			timeline = JSON.parse(row.timeline);
			urls = JSON.parse(row.urls);
		} catch {
			return; // malformed row — skip, never crash the plan
		}
		if (!Array.isArray(timeline) || !Array.isArray(urls)) return;

		const touched = new Set<string>();
		for (const entry of timeline) {
			const type = entry[1];
			const path = pathOf(urls[entry[2]] ?? "");
			if (!touched.has(path)) {
				touched.add(path);
				acc(path).sessions.add(sessionIdx);
			}
			if (!FRICTION_TYPES.has(type)) continue;
			const a = acc(path);
			const data = (entry.length > 3 ? entry[3] : {}) as Record<string, unknown>;
			switch (type) {
				case "dead_click":
					a.deadClicks++;
					break;
				case "hesitation_pause":
					// Only CTA-adjacent pauses count as friction — a reader
					// pausing mid-article is engagement, not a problem.
					if (data.near_cta === true) a.hesitationsNearCta++;
					else continue;
					break;
				case "input_focus_abandon":
					a.inputAbandons++;
					break;
				case "rapid_backtrack":
					a.backtracks++;
					break;
				case "form_retry":
					a.formRetries++;
					break;
			}
			a.frictionSessions.add(sessionIdx);
		}
	});

	const pages: FrictionPageStats[] = [];
	for (const [path, a] of byPath.entries()) {
		const sessions = a.sessions.size;
		if (sessions < MIN_SESSIONS_PER_PAGE) continue;
		const frictionTotal =
			a.deadClicks + a.hesitationsNearCta + a.inputAbandons + a.backtracks + a.formRetries;
		if (frictionTotal === 0) continue;
		pages.push({
			path,
			sessions,
			deadClicks: a.deadClicks,
			hesitationsNearCta: a.hesitationsNearCta,
			inputAbandons: a.inputAbandons,
			backtracks: a.backtracks,
			formRetries: a.formRetries,
			sessionsWithFriction: a.frictionSessions.size,
			frictionRatePct: Math.round((1000 * a.frictionSessions.size) / sessions) / 10,
		});
	}

	if (pages.length === 0) return null;
	// Rank by sessions affected (where the most buyers hit friction).
	pages.sort((x, y) => y.sessionsWithFriction - x.sessionsWithFriction);

	return {
		basis: "pixel_measured",
		windowStart: windowStart.toISOString().slice(0, 10),
		windowEnd: windowEnd.toISOString().slice(0, 10),
		sampleSessions: rows.length,
		pages: pages.slice(0, MAX_PAGES),
	};
}

export async function generateMeasuredFriction(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<MeasuredFrictionOutput | null> {
	const windowEnd = new Date();
	const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
	let rows: TimelineRowInput[] = [];
	try {
		rows = await prisma.behavioralSessionAggregate.findMany({
			where: {
				envId: ctx.environmentId,
				startedAt: { gte: windowStart, lt: windowEnd },
				eventCount: { gte: MIN_EVENTS_INTERACTIVE },
			},
			orderBy: { startedAt: "desc" },
			take: SAMPLE_CAP,
			select: { timeline: true, urls: true },
		});
	} catch {
		return null;
	}
	return computeMeasuredFriction(rows, windowStart, windowEnd);
}
