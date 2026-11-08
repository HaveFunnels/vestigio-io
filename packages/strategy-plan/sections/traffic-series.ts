import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Reading the memory.
//
// The rollup has been storing since the backfill and nothing has read
// it, which is the half-built shape this repo already has a name for:
// collection shipped without consumption. On the instrumented account
// it holds 90 days and already proves something the 30-day screen
// cannot say, that one product page went from 1.1% to 39.7% over
// thirteen weeks.
//
// Why that matters more than it sounds. Most of those weekly steps are
// 4 to 6 points, under the alert's materiality floor, so a threshold
// monitor stays silent through all of it. The dentist on the council
// described exactly this and nobody else saw it: "o meu CPL dobrou em
// seis meses e nunca cruzou nenhum limite. O padrão é que apodreceu."
// A series is the only instrument that catches a rot made of steps
// too small to trip anything.
//
// Shaped as a sparkline rather than a chapter, because the market
// convention is that trend is a property of a metric and not a
// section. Search Console draws the line next to the number.
// ──────────────────────────────────────────────

export interface SeriesPoint {
	/** ISO date of the week's Monday. */
	week: string;
	sessions: number;
	blind: number;
	blindPct: number;
}

export interface TrafficSeries {
	/** The account as a whole, by week, oldest first. */
	account: SeriesPoint[];
	/** Per landing path, for the sparkline inside each row. */
	byPage: Record<string, SeriesPoint[]>;
	/** How far back the memory actually goes. Null when empty. */
	since: string | null;
	/**
	 * Points the account rate moved from the first stored week to the
	 * last. Positive is worse. Null when there is not enough history to
	 * say anything, which is most accounts in their first month and has
	 * to read as "not yet" rather than "no change".
	 */
	driftPoints: number | null;
}

/** Below this the weekly rate is noise and the line would mislead. */
const MIN_WEEK_SESSIONS = 50;

/** Fewer weeks than this and a drift number is a straight line through
 *  two dots. */
const MIN_WEEKS_FOR_DRIFT = 4;

export async function readTrafficSeries(
	prisma: PrismaClient,
	environmentId: string,
	weeks = 26,
): Promise<TrafficSeries> {
	const rows = await prisma.$queryRawUnsafe<
		{ dimension: string; key: string; week: Date; sessions: bigint; blind: bigint }[]
	>(
		`SELECT "dimension", "key",
		        date_trunc('week', "day")::date AS week,
		        SUM("sessions")::bigint AS sessions,
		        SUM("blind")::bigint AS blind
		 FROM "TrafficDailyRollup"
		 WHERE "envId" = $1
		   AND "dimension" IN ('account', 'page')
		   AND "day" >= (CURRENT_DATE - ($2::int * 7))
		 GROUP BY 1, 2, 3
		 ORDER BY 3 ASC`,
		environmentId,
		weeks,
	);

	const account: SeriesPoint[] = [];
	const byPage: Record<string, SeriesPoint[]> = {};

	for (const r of rows) {
		const sessions = Number(r.sessions);
		const blind = Number(r.blind);
		// A week nobody visited is not a zero, it is an absence, and
		// drawing it as a dip would invent a recovery that never
		// happened.
		if (sessions < MIN_WEEK_SESSIONS) continue;
		const point: SeriesPoint = {
			week: r.week.toISOString().slice(0, 10),
			sessions,
			blind,
			blindPct: Math.round((1000 * blind) / sessions) / 10,
		};
		if (r.dimension === "account") account.push(point);
		else (byPage[r.key] ??= []).push(point);
	}

	const driftPoints =
		account.length >= MIN_WEEKS_FOR_DRIFT
			? Math.round((account[account.length - 1].blindPct - account[0].blindPct) * 10) / 10
			: null;

	return {
		account,
		byPage,
		since: account[0]?.week ?? null,
		driftPoints,
	};
}
