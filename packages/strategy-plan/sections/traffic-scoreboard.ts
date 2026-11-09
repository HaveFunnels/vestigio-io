import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { RULER_VERSION, type TrafficStatement } from "./traffic-statement";

// ──────────────────────────────────────────────
// The scoreboard of our own recommendations.
//
// Six of nine reviewers asked for this under six names. The clearest
// statement of why came from the one who sells judgement for a living:
// "se não fecha o laço, não é julgamento, é opinião. Julgamento é
// opinião com consequência."
//
// Three properties make it the right thing to build rather than one
// more detector.
//
// It is the only category the free competitors cannot enter, and the
// barrier is incentive. A generative product cannot publish its own
// error rate when its own documentation apologises in advance, and a
// reporting product has nothing to score because it issues no
// judgement. "Dificuldade técnica a Microsoft resolve com dois
// engenheiros, incentivo contrário ela não resolve nunca."
//
// It fixes the month-two problem by itself, because a scoreboard
// changes every week even when the customer's site does not: it is
// measuring us.
//
// And it is what turns our silence from an absence into an assertion.
// Saying nothing is only worth money if there is a record proving that
// when there was something to say, we said it.
//
// The discipline that makes it honest: the claim is FROZEN at issue
// time. We copy the rate, the margin, the cost and the ruler into the
// row rather than recomputing them later, because a scoreboard that
// can rewrite its own predictions is a worse artefact than no
// scoreboard at all.
// ──────────────────────────────────────────────

/** Only verdicts that ask for an action get scored. Scoring
 *  "entregando" would pad the hit rate with predictions nobody acted
 *  on, which is the oldest trick in performance reporting. */
const SCORED: ReadonlySet<string> = new Set([
	"cortar",
	"corrigir",
	"medicao_suspeita",
	// The page verdict that says the page converts and the ads are
	// wrong. Scored like the others, because it is just as much a claim
	// about what will happen.
	"anuncio_errado",
]);

/** How long before a verdict can be judged. Shorter than this and we
 *  are measuring noise; the operator has not had time to act. */
export const DAYS_BEFORE_SCORING = 21;

/** Movement smaller than this is "igual". Matches the materiality
 *  floor the weekly alert already uses, so the scoreboard and the
 *  alert cannot disagree about what counts as a change. */
export const OUTCOME_MATERIAL_POINTS = 5;

/** Sessions falling below this share of the original is how we detect
 *  that the operator paused it, without asking them to tick a box. */
const PAUSED_SHARE = 0.2;

export type Outcome = "melhorou" | "piorou" | "igual" | "sumiu" | "indefinido";

/**
 * Record what we just said, once per statement generation.
 *
 * Idempotent on (env, dimension, key, day): regenerating a statement
 * on the same day updates the row rather than minting a second
 * prediction, so an operator refreshing the page does not inflate the
 * denominator.
 */
export async function recordVerdicts(
	prisma: PrismaClient,
	environmentId: string,
	statement: Pick<TrafficStatement, "campaigns" | "landingPages">,
	now: Date = new Date(),
): Promise<number> {
	// Both dimensions, because the decision card now draws from both and
	// a scoreboard that only scores half the recommendations is a
	// scoreboard that can be gamed by which half we record.
	//
	// A page verdict has no pause cost: there is nothing to pause, so
	// the magnitude is the share of the account's waste the page holds.
	// It rides in the same column with its own unit rather than getting
	// a second column that is null for every campaign.
	type Row = {
		dimension: "campaign" | "page";
		key: string;
		label: string | null;
		verdict: string;
		blindPct: number;
		blindPctLow: number;
		marginPoints: number;
		sessions: number;
		cost: number;
		costUnit: string;
	};
	const rows: Row[] = [
		...statement.campaigns
			.filter((c) => SCORED.has(c.verdict))
			.map((c) => ({
				dimension: "campaign" as const,
				key: c.platformId ?? c.name,
				label: c.displayName,
				verdict: c.verdict,
				blindPct: c.arrivedBlindPct,
				blindPctLow: c.blindPctLow,
				marginPoints: c.marginPoints,
				sessions: c.sessions,
				cost: c.pauseCost,
				costUnit: c.pauseCostUnit,
			})),
		...statement.landingPages
			.filter((g) => SCORED.has(g.verdict))
			.map((g) => ({
				dimension: "page" as const,
				key: g.path,
				label: g.path,
				verdict: g.verdict,
				blindPct: g.arrivedBlindPct,
				blindPctLow: g.blindPctLow,
				marginPoints: g.marginPoints,
				sessions: g.sessions,
				cost: Math.round(g.wasteShare),
				costUnit: "pct_do_desperdicio",
			})),
	];
	if (rows.length === 0) return 0;

	const day = now.toISOString().slice(0, 10);
	let written = 0;

	for (const c of rows) {
		const key = c.key;
		const id = `tvd_${createHash("sha1")
			.update(`${environmentId} ${day} ${c.dimension} ${key}`)
			.digest("hex")}`;
		await prisma.$executeRawUnsafe(
			`INSERT INTO "TrafficVerdict"
			 ("id","envId","dimension","key","label","verdict","issuedAt",
			  "blindPct","blindPctLow","marginPoints","sessions",
			  "pauseCost","pauseCostUnit","rulerVersion")
			 VALUES ($1,$2,$14,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			 ON CONFLICT ("envId","dimension","key","issuedAt") DO UPDATE SET
			   "label" = EXCLUDED."label",
			   "verdict" = EXCLUDED."verdict",
			   "blindPct" = EXCLUDED."blindPct",
			   "blindPctLow" = EXCLUDED."blindPctLow",
			   "marginPoints" = EXCLUDED."marginPoints",
			   "sessions" = EXCLUDED."sessions",
			   "pauseCost" = EXCLUDED."pauseCost",
			   "pauseCostUnit" = EXCLUDED."pauseCostUnit",
			   "rulerVersion" = EXCLUDED."rulerVersion"`,
			id,
			environmentId,
			key,
			c.label,
			c.verdict,
			new Date(`${day}T00:00:00.000Z`),
			c.blindPct,
			c.blindPctLow,
			c.marginPoints,
			c.sessions,
			c.cost,
			c.costUnit,
			RULER_VERSION,
			c.dimension,
		);
		written++;
	}
	return written;
}

/**
 * Decide what happened to one verdict.
 *
 * Pure, so the rule is testable without a database and visible without
 * reading a query.
 */
export function judge(args: {
	claimedPct: number;
	laterPct: number | null;
	laterSessions: number;
	originalSessions: number;
	rulerThen: number;
	rulerNow: number;
}): { outcome: Outcome; acted: boolean } {
	// A verdict measured under one definition cannot be scored against
	// an outcome measured under another. Saying "indefinido" is the
	// honest answer and it is rare, since the ruler only moves when we
	// change what we count.
	if (args.rulerThen !== args.rulerNow) return { outcome: "indefinido", acted: false };

	// The traffic is gone. For a campaign that is almost always a
	// pause, which is itself the action we recommended. For a page it
	// means the operator stopped sending traffic there, which is a
	// different response to "this page wastes what you send it" but is
	// still a response. Either way it is a recommendation acted on, not
	// a recommendation missing.
	const share = args.originalSessions > 0 ? args.laterSessions / args.originalSessions : 0;
	if (args.laterPct === null || share < PAUSED_SHARE) {
		return { outcome: "sumiu", acted: true };
	}

	const delta = args.laterPct - args.claimedPct;
	if (Math.abs(delta) < OUTCOME_MATERIAL_POINTS) return { outcome: "igual", acted: false };
	return { outcome: delta < 0 ? "melhorou" : "piorou", acted: false };
}

export interface ScoreboardRow {
	/** campaign | page. The row says which, because "corrigir" means a
	 *  different action on each and the reader needs to know which one
	 *  we were judged on. */
	dimension: string;
	key: string;
	label: string | null;
	verdict: string;
	issuedAt: string;
	claimedPct: number;
	pauseCost: number;
	pauseCostUnit: string;
	outcome: Outcome | null;
	outcomeBlindPct: number | null;
	outcomeDays: number | null;
	acted: boolean | null;
}

export interface Scoreboard {
	rows: ScoreboardRow[];
	/** Verdicts old enough to have an outcome. */
	judged: number;
	melhorou: number;
	piorou: number;
	igual: number;
	sumiu: number;
	/** Still inside the waiting period. Shown as pending, never as a
	 *  miss: a prediction nobody has had time to act on is not wrong. */
	pending: number;
}

/**
 * Score the verdicts whose waiting period has passed, then read the
 * board back.
 */
export async function scoreVerdicts(
	prisma: PrismaClient,
	environmentId: string,
	now: Date = new Date(),
): Promise<Scoreboard> {
	const cutoff = new Date(now.getTime() - DAYS_BEFORE_SCORING * 86400000);

	const open = await prisma.$queryRawUnsafe<
		{
			id: string;
			dimension: string;
			key: string;
			issuedAt: Date;
			blindPct: number;
			sessions: number;
			rulerVersion: number;
		}[]
	>(
		// The dimension comes out of the row. It used to be hardcoded to
		// 'campaign' in the query below, which was correct while only
		// campaigns were recorded and became a silent bug the moment
		// page verdicts started being written: every page verdict would
		// have looked for its history in the campaign rollups, found
		// nothing, and scored itself "sumiu" forever.
		`SELECT "id","dimension","key","issuedAt","blindPct","sessions","rulerVersion"
		 FROM "TrafficVerdict"
		 WHERE "envId" = $1 AND "outcome" IS NULL AND "issuedAt" <= $2`,
		environmentId,
		cutoff,
	);

	for (const v of open) {
		// How the thing behaved AFTER we spoke, never including the
		// window we judged on. Reading the same days back would score
		// the claim against itself.
		const after = await prisma.$queryRawUnsafe<{ sessions: bigint; blind: bigint }[]>(
			// The ruler is pinned in the query rather than only checked
			// in judge(). The chain that makes the unfiltered version
			// safe is real but it lives in another file, and a
			// guarantee you have to reason about across two modules is
			// a guarantee someone eventually breaks.
			//
			// The key matches on both sides by dimension: platformId ??
			// name for a campaign, the landing path for a page, which is
			// exactly how the rollup groups each, so a verdict can always
			// find its own history.
			`SELECT COALESCE(SUM("sessions"),0)::bigint AS sessions,
			        COALESCE(SUM("blind"),0)::bigint AS blind
			 FROM "TrafficDailyRollup"
			 WHERE "envId" = $1 AND "dimension" = $5 AND "key" = $2
			   AND "day" > $3::date AND "rulerVersion" = $4`,
			environmentId,
			v.key,
			v.issuedAt,
			v.rulerVersion,
			v.dimension,
		);
		const laterSessions = Number(after[0]?.sessions ?? 0);
		const laterBlind = Number(after[0]?.blind ?? 0);
		const laterPct =
			laterSessions > 0 ? Math.round((1000 * laterBlind) / laterSessions) / 10 : null;

		const { outcome, acted } = judge({
			claimedPct: v.blindPct,
			laterPct,
			laterSessions,
			originalSessions: v.sessions,
			rulerThen: v.rulerVersion,
			rulerNow: RULER_VERSION,
		});
		const days = Math.round((now.getTime() - v.issuedAt.getTime()) / 86400000);

		await prisma.$executeRawUnsafe(
			`UPDATE "TrafficVerdict"
			 SET "outcome" = $2, "outcomeAt" = now(), "outcomeBlindPct" = $3,
			     "outcomeDays" = $4, "acted" = $5
			 WHERE "id" = $1`,
			v.id,
			outcome,
			laterPct,
			days,
			acted,
		);
	}

	const all = await prisma.$queryRawUnsafe<
		{
			dimension: string;
			key: string;
			label: string | null;
			verdict: string;
			issuedAt: Date;
			blindPct: number;
			pauseCost: number;
			pauseCostUnit: string;
			outcome: string | null;
			outcomeBlindPct: number | null;
			outcomeDays: number | null;
			acted: boolean | null;
		}[]
	>(
		`SELECT "dimension","key","label","verdict","issuedAt","blindPct","pauseCost",
		        "pauseCostUnit","outcome","outcomeBlindPct","outcomeDays","acted"
		 FROM "TrafficVerdict"
		 WHERE "envId" = $1
		 ORDER BY "issuedAt" DESC
		 LIMIT 60`,
		environmentId,
	);

	const rows: ScoreboardRow[] = all.map((r) => ({
		dimension: r.dimension,
		key: r.key,
		label: r.label,
		verdict: r.verdict,
		issuedAt: r.issuedAt.toISOString().slice(0, 10),
		claimedPct: r.blindPct,
		pauseCost: r.pauseCost,
		pauseCostUnit: r.pauseCostUnit,
		outcome: (r.outcome as Outcome | null) ?? null,
		outcomeBlindPct: r.outcomeBlindPct,
		outcomeDays: r.outcomeDays,
		acted: r.acted,
	}));

	const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
	return {
		rows,
		judged: rows.filter((r) => r.outcome !== null && r.outcome !== "indefinido").length,
		melhorou: count("melhorou"),
		piorou: count("piorou"),
		igual: count("igual"),
		sumiu: count("sumiu"),
		pending: rows.filter((r) => r.outcome === null).length,
	};
}
