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
	/** The drift split into behaviour and mix. Null when there is not
	 *  enough campaign history to split it. */
	drift: DriftDecomposition | null;
}

/** Below this the weekly rate is noise and the line would mislead. */
const MIN_WEEK_SESSIONS = 50;

/** Fewer weeks than this and a drift number is a straight line through
 *  two dots. */
const MIN_WEEKS_FOR_DRIFT = 4;

/** Weeks averaged at each end of the series. */
export const DRIFT_EDGE_WEEKS = 3;

export interface DriftDecomposition {
	/** Total movement explained, in points. */
	totalPoints: number;
	/**
	 * The part that came from campaigns getting worse at what they do,
	 * holding the mix of spend constant. This is the one that means the
	 * site or the audience degraded.
	 */
	behaviourPoints: number;
	/**
	 * The part that came from buying a different mix, holding each
	 * campaign's own rate constant. This is the one that means nothing
	 * degraded: the operator changed what they were buying.
	 */
	mixPoints: number;
	/** Campaigns compared at both ends. */
	campaigns: number;
	/** Null when there is not enough campaign history to split. */
	usable: boolean;
}

/**
 * Split a drift into "things got worse" and "we bought different
 * things".
 *
 * The council's statistician was blunt about why this matters: a drift
 * of +32,5 points over eleven weeks can be 100% mix. If the operator
 * scaled a cold, broad campaign from 5% to 40% of the traffic, the
 * pooled rate climbs a long way with NO campaign getting worse. The
 * product would say "your page is degrading" when the truth is "you
 * changed what you are buying", and those call for opposite actions.
 *
 * Standard shift-share, with first-period weights as the base:
 *
 *   behaviour = sum over i of w_i_first * (p_i_last - p_i_first)
 *   mix       = sum over i of p_i_first * (w_i_last - w_i_first)
 *               plus the interaction, which is assigned to mix
 *
 * The interaction goes to mix rather than being reported as a third
 * term, because a campaign that both grew and worsened is mostly a
 * decision about what to buy, and because three numbers where two will
 * do is how a screen stops being read. Campaigns present at only one
 * end are pure mix by construction, which is the honest treatment: on
 * the instrumented account most campaigns exist at only one end.
 *
 * Averaged over DRIFT_EDGE_WEEKS at each end rather than single weeks.
 * Single-week endpoints were the other half of the same criticism: the
 * variance of a difference of two one-week estimates is the sum of two
 * large variances, so a drift could be entirely the first week having
 * been unusual.
 */
export function decomposeDrift(
	account: SeriesPoint[],
	byCampaignWeek: Map<string, Map<string, { sessions: number; blind: number }>>,
): DriftDecomposition | null {
	if (account.length < MIN_WEEKS_FOR_DRIFT) return null;

	const edge = Math.min(DRIFT_EDGE_WEEKS, Math.floor(account.length / 2));
	const firstWeeks = account.slice(0, edge).map((p) => p.week);
	const lastWeeks = account.slice(-edge).map((p) => p.week);

	/** Pooled sessions and blind per campaign across a set of weeks. */
	const pool = (weeks: string[]) => {
		const out = new Map<string, { sessions: number; blind: number }>();
		for (const wk of weeks) {
			for (const [key, v] of byCampaignWeek.get(wk) ?? []) {
				const cur = out.get(key) ?? { sessions: 0, blind: 0 };
				cur.sessions += v.sessions;
				cur.blind += v.blind;
				out.set(key, cur);
			}
		}
		return out;
	};

	const a = pool(firstWeeks);
	const b = pool(lastWeeks);
	const totalA = [...a.values()].reduce((n, v) => n + v.sessions, 0);
	const totalB = [...b.values()].reduce((n, v) => n + v.sessions, 0);
	if (totalA === 0 || totalB === 0) return null;

	const keys = new Set([...a.keys(), ...b.keys()]);
	let behaviour = 0;
	let mix = 0;
	let both = 0;

	for (const k of keys) {
		const va = a.get(k);
		const vb = b.get(k);
		const wA = va ? va.sessions / totalA : 0;
		const wB = vb ? vb.sessions / totalB : 0;
		const pA = va && va.sessions > 0 ? (100 * va.blind) / va.sessions : 0;
		const pB = vb && vb.sessions > 0 ? (100 * vb.blind) / vb.sessions : 0;
		if (va && vb) {
			both++;
			behaviour += wA * (pB - pA);
			// p_i_first * delta_w, plus the interaction delta_w * delta_p.
			mix += pA * (wB - wA) + (wB - wA) * (pB - pA);
		} else {
			// Present at one end only: pure mix. An entering campaign
			// adds its whole weighted rate, a leaving one removes it.
			mix += vb ? wB * pB : -wA * pA;
		}
	}

	const r1 = (x: number) => Math.round(x * 10) / 10;
	return {
		totalPoints: r1(behaviour + mix),
		behaviourPoints: r1(behaviour),
		mixPoints: r1(mix),
		campaigns: both,
		// One campaign at both ends cannot carry a decomposition.
		usable: both >= 3,
	};
}

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
		   AND "dimension" IN ('account', 'page', 'campaign')
		   AND "day" >= (CURRENT_DATE - ($2::int * 7))
		 GROUP BY 1, 2, 3
		 ORDER BY 3 ASC`,
		environmentId,
		weeks,
	);

	const account: SeriesPoint[] = [];
	const byPage: Record<string, SeriesPoint[]> = {};
	/** Weekly campaign rows, kept only to decompose the drift. */
	const byCampaignWeek = new Map<string, Map<string, { sessions: number; blind: number }>>();

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
		else if (r.dimension === "page") (byPage[r.key] ??= []).push(point);
	}

	// Campaign rows are collected without the MIN_WEEK_SESSIONS gate
	// that the drawn lines need. The gate exists so a thin week is not
	// drawn as a dip, but for the decomposition every session has to be
	// accounted for or the two terms will not add up to the total.
	for (const r of rows) {
		if (r.dimension !== "campaign") continue;
		const wk = r.week.toISOString().slice(0, 10);
		const m = byCampaignWeek.get(wk) ?? new Map();
		m.set(r.key, { sessions: Number(r.sessions), blind: Number(r.blind) });
		byCampaignWeek.set(wk, m);
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
		drift: decomposeDrift(account, byCampaignWeek),
	};
}
