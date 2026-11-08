import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { RULER_VERSION, type CampaignRow } from "./traffic-statement";

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
const SCORED: ReadonlySet<string> = new Set(["cortar", "corrigir", "medicao_suspeita"]);

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
	campaigns: CampaignRow[],
	now: Date = new Date(),
): Promise<number> {
	const rows = campaigns.filter((c) => SCORED.has(c.verdict));
	if (rows.length === 0) return 0;

	const day = now.toISOString().slice(0, 10);
	let written = 0;

	for (const c of rows) {
		const key = c.platformId ?? c.name;
		const id = `tvd_${createHash("sha1")
			.update(`${environmentId} ${day} campaign ${key}`)
			.digest("hex")}`;
		await prisma.$executeRawUnsafe(
			`INSERT INTO "TrafficVerdict"
			 ("id","envId","dimension","key","label","verdict","issuedAt",
			  "blindPct","blindPctLow","marginPoints","sessions",
			  "pauseCost","pauseCostUnit","rulerVersion")
			 VALUES ($1,$2,'campaign',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
			c.displayName,
			c.verdict,
			new Date(`${day}T00:00:00.000Z`),
			c.arrivedBlindPct,
			c.blindPctLow,
			c.marginPoints,
			c.sessions,
			c.pauseCost,
			c.pauseCostUnit,
			RULER_VERSION,
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

	// The traffic is gone. Almost always because the operator paused
	// it, which is itself the action we recommended, so this is a
	// followed recommendation rather than a missing one.
	const share = args.originalSessions > 0 ? args.laterSessions / args.originalSessions : 0;
	if (args.laterPct === null || share < PAUSED_SHARE) {
		return { outcome: "sumiu", acted: true };
	}

	const delta = args.laterPct - args.claimedPct;
	if (Math.abs(delta) < OUTCOME_MATERIAL_POINTS) return { outcome: "igual", acted: false };
	return { outcome: delta < 0 ? "melhorou" : "piorou", acted: false };
}

export interface ScoreboardRow {
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
			key: string;
			issuedAt: Date;
			blindPct: number;
			sessions: number;
			rulerVersion: number;
		}[]
	>(
		`SELECT "id","key","issuedAt","blindPct","sessions","rulerVersion"
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
			// The key is platformId ?? name on both sides, which is how
			// the rollup groups campaigns, so a verdict can always find
			// its own history.
			`SELECT COALESCE(SUM("sessions"),0)::bigint AS sessions,
			        COALESCE(SUM("blind"),0)::bigint AS blind
			 FROM "TrafficDailyRollup"
			 WHERE "envId" = $1 AND "dimension" = 'campaign' AND "key" = $2
			   AND "day" > $3::date AND "rulerVersion" = $4`,
			environmentId,
			v.key,
			v.issuedAt,
			v.rulerVersion,
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
		`SELECT "key","label","verdict","issuedAt","blindPct","pauseCost",
		        "pauseCostUnit","outcome","outcomeBlindPct","outcomeDays","acted"
		 FROM "TrafficVerdict"
		 WHERE "envId" = $1
		 ORDER BY "issuedAt" DESC
		 LIMIT 60`,
		environmentId,
	);

	const rows: ScoreboardRow[] = all.map((r) => ({
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
