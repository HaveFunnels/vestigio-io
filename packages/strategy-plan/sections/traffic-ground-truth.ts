import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Stitching the measured column to the one only the operator can fill.
//
// The dentist offered the trade himself: "eu preencho duas células por
// semana se vocês me devolverem a costura. Agendados e compareceram. O
// resto vocês medem."
//
// What the stitch buys is the only sentence in the product that
// connects the site to the business: the mute rate went up and the
// bookings went down in the same weeks. A pixel cannot say that, and
// neither can his notebook.
//
// The danger here is not technical, it is rhetorical. Eight weeks of
// two series is nowhere near enough to claim a relationship, and every
// instinct in an analytics product is to print a correlation anyway
// because a coefficient looks like science. So this module refuses:
// it counts how many weeks moved together, states the count as a
// count, and says out loud that it is not a cause.
//
// The accountant set that bar earlier and it applies exactly here:
// "número sem definição para de ser auditável no instante em que sai
// daqui."
// ──────────────────────────────────────────────

/** Below this, the agreement count is a coin flip with extra steps and
 *  the product says nothing. Five paired weeks of movement is already
 *  generous for what we are willing to claim from it, which is only
 *  that the two columns moved together, never why. */
/**
 * Monday of the week a date falls in, in UTC.
 *
 * This is the join key, and it has to agree with date_trunc('week')
 * in Postgres exactly. If it does not, every row the operator types
 * lands on a week the series cannot find and the stitch is silently
 * always empty: no error, no warning, just a feature that never
 * works and a customer who stops filling it in.
 *
 * Verified against the production server across year boundaries and
 * a Sunday, and pinned by a test, because the one thing it must never
 * do is drift.
 */
export function mondayOf(iso: string): Date | null {
	const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
	if (Number.isNaN(d.getTime())) return null;
	// getUTCDay is 0 on Sunday, so Sunday belongs to the week that
	// started six days earlier, which is what Postgres does too.
	const shift = (d.getUTCDay() + 6) % 7;
	return new Date(d.getTime() - shift * 86400000);
}

export const MIN_PAIRED_WEEKS = 5;

/** Week-over-week movement smaller than this is noise in both columns.
 *  The rate floor matches the materiality the rest of the product
 *  uses; the outcome floor is proportional because a dentist going
 *  from 40 to 41 bookings has not moved. */
export const RATE_NOISE_POINTS = 3;
export const OUTCOME_NOISE_SHARE = 0.1;

export interface GroundTruthWeek {
	week: string;
	booked: number | null;
	showed: number | null;
	revenueBrl: number | null;
	note: string | null;
}

export interface MeasuredWeek {
	week: string;
	blindPct: number;
	sessions: number;
}

export interface StitchedWeek {
	week: string;
	blindPct: number;
	/** Whichever outcome column this business actually fills. */
	outcome: number | null;
	outcomeKind: "showed" | "booked" | "revenue" | null;
	note: string | null;
	/** Changes the operator logged inside this week. */
	changes: string[];
}

export interface Stitch {
	weeks: StitchedWeek[];
	/** Weeks where both columns moved enough to be worth comparing. */
	paired: number;
	/** Of those, how many moved in opposite directions: waste up while
	 *  the outcome fell, or waste down while it rose. */
	together: number;
	/** How many moved the same way, which is evidence against the
	 *  simple story and is reported with the same prominence. */
	against: number;
	/** True only when there is enough to say anything at all. */
	sayable: boolean;
	/** Which column the business is actually filling. Null when the
	 *  operator has filled nothing we can use. */
	outcomeKind: "showed" | "booked" | "revenue" | null;
	filledWeeks: number;
}

/** Which of the three columns this operator actually keeps. Preference
 *  order is by how close the number sits to money: someone who turned
 *  up beats someone who booked, and both beat a revenue figure typed
 *  from memory. */
export function pickOutcomeKind(
	rows: GroundTruthWeek[],
): "showed" | "booked" | "revenue" | null {
	const filled = (f: (r: GroundTruthWeek) => number | null) =>
		rows.filter((r) => f(r) !== null).length;
	if (filled((r) => r.showed) >= 2) return "showed";
	if (filled((r) => r.booked) >= 2) return "booked";
	if (filled((r) => r.revenueBrl) >= 2) return "revenue";
	return null;
}

/**
 * Pair the two columns week by week and count how often they moved
 * against each other.
 *
 * Pure, so the claim can be tested without a database and read without
 * a query. The output is a count and a refusal, never a coefficient.
 */
export function stitch(
	measured: MeasuredWeek[],
	truth: GroundTruthWeek[],
	changes: { happenedOn: string; what: string }[] = [],
): Stitch {
	const kind = pickOutcomeKind(truth);
	const byWeek = new Map(truth.map((t) => [t.week, t]));

	const valueOf = (t: GroundTruthWeek | undefined): number | null => {
		if (!t || !kind) return null;
		if (kind === "showed") return t.showed;
		if (kind === "booked") return t.booked;
		return t.revenueBrl;
	};

	const weeks: StitchedWeek[] = measured.map((m) => {
		const t = byWeek.get(m.week);
		// A change is attributed to the week it falls inside, using the
		// same Monday key as the series. Seven days is coarse and
		// honest; pretending to know the day a photo swap started
		// affecting conversion would not be.
		const weekStart = new Date(`${m.week}T00:00:00.000Z`).getTime();
		const weekEnd = weekStart + 7 * 86400000;
		return {
			week: m.week,
			blindPct: m.blindPct,
			outcome: valueOf(t),
			outcomeKind: kind,
			note: t?.note ?? null,
			changes: changes
				.filter((c) => {
					const at = new Date(`${c.happenedOn.slice(0, 10)}T00:00:00.000Z`).getTime();
					return at >= weekStart && at < weekEnd;
				})
				.map((c) => c.what),
		};
	});

	let paired = 0;
	let together = 0;
	let against = 0;
	for (let i = 1; i < weeks.length; i++) {
		const a = weeks[i - 1];
		const b = weeks[i];
		if (a.outcome === null || b.outcome === null || a.outcome === 0) continue;

		const rateMove = b.blindPct - a.blindPct;
		const outcomeMove = (b.outcome - a.outcome) / a.outcome;
		// Both columns have to have actually moved. Comparing the
		// direction of two numbers that barely changed is how a
		// dashboard manufactures a pattern out of rounding.
		if (Math.abs(rateMove) < RATE_NOISE_POINTS) continue;
		if (Math.abs(outcomeMove) < OUTCOME_NOISE_SHARE) continue;

		paired++;
		// Opposite signs: waste up and outcome down, or the reverse.
		if (rateMove * outcomeMove < 0) together++;
		else against++;
	}

	return {
		weeks,
		paired,
		together,
		against,
		sayable: paired >= MIN_PAIRED_WEEKS,
		outcomeKind: kind,
		filledWeeks: weeks.filter((w) => w.outcome !== null).length,
	};
}

/** Read both human columns and stitch them onto the measured series. */
export async function readStitch(
	prisma: PrismaClient,
	environmentId: string,
	measured: MeasuredWeek[],
): Promise<Stitch> {
	const truthRows = await prisma.$queryRawUnsafe<
		{
			week: Date;
			booked: number | null;
			showed: number | null;
			revenueBrl: number | null;
			note: string | null;
		}[]
	>(
		`SELECT "week","booked","showed","revenueBrl","note"
		 FROM "TrafficGroundTruth"
		 WHERE "envId" = $1
		 ORDER BY "week" ASC`,
		environmentId,
	);
	const changeRows = await prisma.$queryRawUnsafe<{ happenedOn: Date; what: string }[]>(
		`SELECT "happenedOn","what"
		 FROM "TrafficChange"
		 WHERE "envId" = $1
		 ORDER BY "happenedOn" ASC
		 LIMIT 200`,
		environmentId,
	);

	return stitch(
		measured,
		truthRows.map((r) => ({
			week: r.week.toISOString().slice(0, 10),
			booked: r.booked,
			showed: r.showed,
			revenueBrl: r.revenueBrl,
			note: r.note,
		})),
		changeRows.map((c) => ({
			happenedOn: c.happenedOn.toISOString(),
			what: c.what,
		})),
	);
}
