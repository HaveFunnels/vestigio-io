import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Dead-site detection
//
// A customer can take their site down (domain expired, store closed,
// migration gone wrong) without telling us. Nothing in the pipeline
// noticed: the scheduler kept dispatching cycles, the crawler kept
// fetching nothing, and the storage kept growing — on a site that no
// longer exists.
//
// The probe runner already writes a PageProbe row for EVERY probe,
// including network failures (statusCode 0). That history is the
// signal: a week of the landing URL never once answering as a live
// page means the site is gone, and we should stop spending cycles on
// it until a human says otherwise.
//
// Deliberately conservative — a false pause costs a paying customer
// their monitoring, so every ambiguous signal is treated as "not
// dead":
//
//   alive      2xx / 3xx            → site is there (a 301 is a move,
//                                     not a death)
//   dead       0 / 404 / 410        → no connection, or the origin
//                                     says the page is gone
//   ambiguous  401 / 403 / 429 / 5xx→ bot wall, rate limit, or the
//                                     origin having a bad week. Counts
//                                     for neither side.
//
// A `dead` verdict needs all three: zero alive observations in the
// window, at least MIN_DEAD_OBSERVATIONS dead ones, and a dead streak
// that actually spans the full window (so a burst of 7 failures in an
// hour can't trip it).
// ──────────────────────────────────────────────

export const DEAD_SITE_WINDOW_DAYS = 7;

/** Floor on sample size. At the slowest plan cadence (hourly) a week
 *  yields ~168 probes; this only guards against a window where the
 *  cron barely ran, in which case we have no business concluding
 *  anything. */
export const MIN_DEAD_OBSERVATIONS = 7;

export type LivenessVerdict = "alive" | "dead" | "insufficient_data";

export interface LivenessAssessment {
	verdict: LivenessVerdict;
	/** Timestamp of the earliest dead observation in the current
	 *  unbroken streak. Null unless verdict is "dead". */
	deadSince: Date | null;
	observations: number;
	deadCount: number;
	aliveCount: number;
	ambiguousCount: number;
	/** Human-readable one-liner for the pause log + admin surfaces. */
	summary: string;
}

function classify(statusCode: number): "alive" | "dead" | "ambiguous" {
	if (statusCode >= 200 && statusCode < 400) return "alive";
	if (statusCode === 0 || statusCode === 404 || statusCode === 410) return "dead";
	return "ambiguous";
}

/**
 * Read the probe history for an environment's landing URL and decide
 * whether the site still exists.
 *
 * Scoped to the landing URL specifically: a deep page 404ing is a
 * content problem (and a legitimate finding), while the landing URL
 * never answering is the site being gone.
 */
export async function assessSiteLiveness(
	prisma: PrismaClient,
	environmentId: string,
	landingUrl: string,
	now: Date = new Date(),
): Promise<LivenessAssessment> {
	const windowStart = new Date(
		now.getTime() - DEAD_SITE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	);

	const probes = await prisma.pageProbe.findMany({
		where: {
			environmentId,
			url: landingUrl,
			observedAt: { gte: windowStart, lte: now },
		},
		orderBy: { observedAt: "asc" },
		select: { statusCode: true, observedAt: true },
	});

	let deadCount = 0;
	let aliveCount = 0;
	let ambiguousCount = 0;
	// Start of the current unbroken dead streak — reset by any alive hit.
	let streakStart: Date | null = null;
	let streakEnd: Date | null = null;

	for (const p of probes) {
		const kind = classify(p.statusCode);
		if (kind === "alive") {
			aliveCount++;
			streakStart = null;
			streakEnd = null;
		} else if (kind === "dead") {
			deadCount++;
			if (!streakStart) streakStart = p.observedAt;
			streakEnd = p.observedAt;
		} else {
			ambiguousCount++;
		}
	}

	const observations = probes.length;
	const base = {
		observations,
		deadCount,
		aliveCount,
		ambiguousCount,
	};

	if (observations < MIN_DEAD_OBSERVATIONS) {
		return {
			...base,
			verdict: "insufficient_data",
			deadSince: null,
			summary: `only ${observations} probe(s) in the last ${DEAD_SITE_WINDOW_DAYS}d — not enough to judge`,
		};
	}

	if (aliveCount > 0) {
		return {
			...base,
			verdict: "alive",
			deadSince: null,
			summary: `${aliveCount}/${observations} probes answered in the last ${DEAD_SITE_WINDOW_DAYS}d`,
		};
	}

	// No alive hits at all. Require the dead streak to actually span the
	// window — otherwise the cron simply hasn't been running long enough
	// for this env and we'd be pausing on a few minutes of downtime.
	const spanMs =
		streakStart && streakEnd ? streakEnd.getTime() - streakStart.getTime() : 0;
	const requiredSpanMs = DEAD_SITE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
	// Allow a small tolerance: probes can't land exactly on the boundary.
	const spansWindow = spanMs >= requiredSpanMs * 0.9;

	if (deadCount >= MIN_DEAD_OBSERVATIONS && spansWindow) {
		return {
			...base,
			verdict: "dead",
			deadSince: streakStart,
			summary: `landing URL failed every one of ${deadCount} probes across ${Math.round(spanMs / 86_400_000)}d`,
		};
	}

	return {
		...base,
		verdict: "insufficient_data",
		deadSince: null,
		summary: `${deadCount} dead / ${ambiguousCount} ambiguous over ${Math.round(spanMs / 86_400_000)}d — streak does not span ${DEAD_SITE_WINDOW_DAYS}d yet`,
	};
}

/**
 * Pause an environment whose site is gone.
 *
 * Uses the existing `continuousPaused` flag so every downstream
 * consumer (audit scheduler, probe cron, targeted-cycle dispatch)
 * stops without needing to learn a new concept — they all already
 * filter on it. `pausedReason` records WHY so the inactivity-resume
 * path and the admin UI can tell a dead site apart from a customer
 * who simply hasn't logged in.
 *
 * Idempotent: re-pausing an already-dead env is a no-op that leaves
 * the original `siteDeadSinceAt` intact.
 */
export async function pauseForDeadSite(
	prisma: PrismaClient,
	environmentId: string,
	assessment: LivenessAssessment,
): Promise<boolean> {
	if (assessment.verdict !== "dead") return false;
	const claimed = await prisma.environment.updateMany({
		where: { id: environmentId, continuousPaused: false },
		data: {
			continuousPaused: true,
			pausedReason: "site_dead",
			siteDeadSinceAt: assessment.deadSince,
		},
	});
	return claimed.count > 0;
}
