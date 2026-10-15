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
import { disambiguateLabels, pageEntityLabel } from "../page-label";

export interface FrictionPageStats {
	path: string;
	/** ONDA 4.1 — the entity name the customer knows this page by
	 *  (cleaned crawl <title>; de-slugged path as fallback). */
	label: string;
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

export interface TimelineRowInput {
	timeline: string;
	urls: string;
}

const SAMPLE_CAP = 4000;
const MIN_SESSIONS_PER_PAGE = 30;
const MAX_PAGES = 6;
export const MIN_EVENTS_INTERACTIVE = 3;

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

export interface FrictionAcc {
	sessions: Set<number>;
	frictionSessions: Set<number>;
	deadClicks: number;
	hesitationsNearCta: number;
	inputAbandons: number;
	backtracks: number;
	formRetries: number;
}

/**
 * Pure scan over compact timelines, accumulated per path.
 *
 * Exported because friction-rollup.ts writes the daily buckets from
 * the SAME scan. If the rollup reimplemented these rules, especially
 * the near_cta filter on hesitations and the distinct-session sets —
 * the two would drift and the plan's numbers would quietly change
 * depending on which path produced them.
 */
export function scanTimelinesByPath(rows: TimelineRowInput[]): Map<string, FrictionAcc> {
	type Acc = FrictionAcc;
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

	return byPath;
}

/** Pure scan over compact timelines — tested. */
export function computeMeasuredFriction(
	rows: TimelineRowInput[],
	windowStart: Date,
	windowEnd: Date,
): MeasuredFrictionOutput | null {
	if (rows.length === 0) return null;
	const byPath = scanTimelinesByPath(rows);

	const counted = [...byPath.entries()].map(([path, a]) => ({
		path,
		sessions: a.sessions.size,
		sessionsWithFriction: a.frictionSessions.size,
		deadClicks: a.deadClicks,
		hesitationsNearCta: a.hesitationsNearCta,
		inputAbandons: a.inputAbandons,
		backtracks: a.backtracks,
		formRetries: a.formRetries,
	}));

	const pages = rankFrictionPages(counted);
	if (pages.length === 0) return null;

	return {
		basis: "pixel_measured",
		windowStart: windowStart.toISOString().slice(0, 10),
		windowEnd: windowEnd.toISOString().slice(0, 10),
		sampleSessions: rows.length,
		pages,
	};
}

/** Per-path counts, however they were obtained. */
export interface CountedPage {
	path: string;
	sessions: number;
	sessionsWithFriction: number;
	deadClicks: number;
	hesitationsNearCta: number;
	inputAbandons: number;
	backtracks: number;
	formRetries: number;
}

/**
 * Honesty gates and ranking, shared by the live scan and the rollup
 * reader so a page qualifies by the same rules whichever path counted
 * it: a floor on visiting sessions (percentages over a trickle are
 * noise), no page without at least one friction event, ranked by
 * sessions affected rather than raw event volume.
 */
export function rankFrictionPages(counted: CountedPage[]): FrictionPageStats[] {
	const pages: FrictionPageStats[] = [];
	for (const c of counted) {
		if (c.sessions < MIN_SESSIONS_PER_PAGE) continue;
		const frictionTotal =
			c.deadClicks + c.hesitationsNearCta + c.inputAbandons + c.backtracks + c.formRetries;
		if (frictionTotal === 0) continue;
		pages.push({
			label: pageEntityLabel(null, c.path),
			path: c.path,
			sessions: c.sessions,
			deadClicks: c.deadClicks,
			hesitationsNearCta: c.hesitationsNearCta,
			inputAbandons: c.inputAbandons,
			backtracks: c.backtracks,
			formRetries: c.formRetries,
			sessionsWithFriction: c.sessionsWithFriction,
			frictionRatePct: Math.round((1000 * c.sessionsWithFriction) / c.sessions) / 10,
		});
	}
	// Rank by sessions affected (where the most buyers hit friction).
	pages.sort((x, y) => y.sessionsWithFriction - x.sessionsWithFriction);
	return pages.slice(0, MAX_PAGES);
}

export async function generateMeasuredFriction(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<MeasuredFrictionOutput | null> {
	// Day-aligned, because the rollup buckets by UTC calendar day. A
	// rolling "now minus 30 days" boundary would ask for a partial day
	// the buckets cannot express, and every count would come back
	// quietly short.
	const now = new Date();
	const windowEnd = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 86400_000,
	);
	const windowStart = new Date(windowEnd.getTime() - 30 * 86400_000);

	let out = await fromRollup(prisma, ctx.environmentId, windowStart, windowEnd);

	// Fall back to scanning raw timelines when the rollup has nothing
	// for this window: an environment whose first plan lands before the
	// first nightly rollup, or a rollup that failed. The fallback is
	// only available while timelines are still retained, which is why
	// shortening that retention has to wait until the rollup path is
	// confirmed in use.
	if (!out) {
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
		out = computeMeasuredFriction(rows, windowStart, windowEnd);
	}
	if (!out) return null;

	// The window is half-open and ends at midnight tonight, so the raw
	// boundary formats as tomorrow's date. The plan states a period the
	// customer reads, so report the last day actually included.
	out.windowEnd = new Date(windowEnd.getTime() - 86400_000).toISOString().slice(0, 10);

	// ONDA 4.1, resolve entity names from crawled titles so every
	// downstream surface (friction block, synth step, prompts,
	// verification) speaks in the customer's things, not in paths.
	try {
		const items = await prisma.pageInventoryItem.findMany({
			where: { environmentRef: ctx.environmentId, removedAt: null },
			select: { path: true, title: true },
			take: 500,
		});
		const titleByPath = new Map<string, string | null>();
		for (const it of items) {
			const p2 = it.path && it.path.length > 1 ? it.path.replace(/\/+$/, "") : it.path || "/";
			if (!titleByPath.has(p2)) titleByPath.set(p2, it.title);
		}
		for (const pg of out.pages) {
			pg.label = pageEntityLabel(titleByPath.get(pg.path) ?? null, pg.path, ctx.envDomain);
		}
		// Titles are not unique. Three URLs serving one product with one
		// <title> would otherwise print as the same entity three times
		// with three different numbers, reading as an error in the
		// document rather than a fact about the store.
		disambiguateLabels(out.pages);
	} catch {
		// labels keep the de-slugged fallback
	}
	return out;
}

/**
 * Read the pre-counted buckets instead of scanning raw timelines.
 *
 * Returns null when the window has no buckets at all, which the caller
 * treats as "rollup not available here" rather than "no friction".
 */
async function fromRollup(
	prisma: PrismaClient,
	environmentId: string,
	windowStart: Date,
	windowEnd: Date,
): Promise<MeasuredFrictionOutput | null> {
	let rows: {
		day: Date;
		path: string;
		sessions: number;
		sessionsWithFriction: number;
		deadClicks: number;
		hesitationsNearCta: number;
		inputAbandons: number;
		backtracks: number;
		formRetries: number;
		envSessions: number;
	}[];
	try {
		rows = await prisma.frictionDailyRollup.findMany({
			where: { envId: environmentId, day: { gte: windowStart, lt: windowEnd } },
			select: {
				day: true,
				path: true,
				sessions: true,
				sessionsWithFriction: true,
				deadClicks: true,
				hesitationsNearCta: true,
				inputAbandons: true,
				backtracks: true,
				formRetries: true,
				envSessions: true,
			},
		});
	} catch {
		return null;
	}
	if (rows.length === 0) return null;

	const byPath = new Map<string, CountedPage>();
	// Per day, not summed across paths: one session that visited three
	// pages contributes three path rows but one session to the total.
	const envSessionsByDay = new Map<string, number>();

	for (const r of rows) {
		const dayKey = r.day.toISOString().slice(0, 10);
		// Same value on every row of a day; max is just a safe read in
		// case a day was written by two different versions of the writer.
		envSessionsByDay.set(dayKey, Math.max(envSessionsByDay.get(dayKey) ?? 0, r.envSessions));

		const acc = byPath.get(r.path) ?? {
			path: r.path,
			sessions: 0,
			sessionsWithFriction: 0,
			deadClicks: 0,
			hesitationsNearCta: 0,
			inputAbandons: 0,
			backtracks: 0,
			formRetries: 0,
		};
		acc.sessions += r.sessions;
		acc.sessionsWithFriction += r.sessionsWithFriction;
		acc.deadClicks += r.deadClicks;
		acc.hesitationsNearCta += r.hesitationsNearCta;
		acc.inputAbandons += r.inputAbandons;
		acc.backtracks += r.backtracks;
		acc.formRetries += r.formRetries;
		byPath.set(r.path, acc);
	}

	const pages = rankFrictionPages([...byPath.values()]);
	if (pages.length === 0) return null;

	let total = 0;
	for (const n of envSessionsByDay.values()) total += n;

	return {
		basis: "pixel_measured",
		windowStart: windowStart.toISOString().slice(0, 10),
		windowEnd: windowEnd.toISOString().slice(0, 10),
		sampleSessions: total,
		pages,
	};
}
