import type { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────
// Dynamic-content suppression
//
// The probe fires a targeted audit cycle whenever a URL's content hash
// differs from the previous probe. That is the right signal for a page
// that changes when someone ships something. It is noise for a page
// that changes on every request.
//
// casamontelle.com: 6,792 probes of the homepage in 30 days, 6,792
// flagged as changed — a 100% change rate, from a Shopify storefront
// with a rotating banner. That produced ~8,400 targeted cycles in a
// month, by far the largest compute sink in the system.
//
// The galling part is that the engine already KNEW. The plan's own
// whatChanged section told the customer:
//
//   "/ tem conteúdo dinâmico (muda na maior parte das verificações —
//    banners/vitrine rotativos). Mudanças estruturais nesta página não
//    são distinguíveis por comparação de conteúdo."
//
// It diagnosed the page as undiffable and kept diffing it. This module
// closes that loop: a URL whose hash changes essentially every time is
// not emitting a signal, and we stop paying for a cycle per probe.
//
// Suppression is scoped to the TARGETED dispatch only. The scheduled
// cold/full cycle still covers the page on its normal cadence, so the
// page is never dropped from analysis — we just stop treating banner
// rotation as a deploy.
// ──────────────────────────────────────────────

/** Change rate above which a URL is considered dynamic rather than
 *  meaningfully changing. Deliberately high: a page that genuinely
 *  ships several times a day still sits far below this. */
export const VOLATILE_CHANGE_RATE = 0.8;

/** Minimum probes in the window before we are willing to call a URL
 *  volatile. Guards against suppressing on a handful of samples. */
export const VOLATILITY_MIN_OBSERVATIONS = 20;

/** How far back to measure. Long enough to smooth a deploy-heavy day,
 *  short enough that a page which stops rotating recovers within a
 *  few days. */
export const VOLATILITY_WINDOW_HOURS = 72;

export interface VolatilityAssessment {
	volatile: boolean;
	observations: number;
	changed: number;
	changeRate: number;
}

/**
 * Measure how often a URL's content hash changes.
 *
 * Returns volatile=false whenever there is not enough history to
 * judge, so a brand-new URL always gets its targeted cycles.
 */
export async function assessUrlVolatility(
	prisma: PrismaClient,
	environmentId: string,
	url: string,
	now: Date = new Date(),
): Promise<VolatilityAssessment> {
	const since = new Date(now.getTime() - VOLATILITY_WINDOW_HOURS * 60 * 60 * 1000);
	const rows = await prisma.pageProbe.findMany({
		where: {
			environmentId,
			url,
			observedAt: { gte: since, lte: now },
			// Only probes that actually produced a comparison. The first
			// probe of a URL has changedFromPrior = null and would
			// otherwise drag the rate down.
			changedFromPrior: { not: null },
		},
		select: { changedFromPrior: true },
	});

	const observations = rows.length;
	const changed = rows.filter((r) => r.changedFromPrior === true).length;
	const changeRate = observations > 0 ? changed / observations : 0;

	return {
		volatile:
			observations >= VOLATILITY_MIN_OBSERVATIONS && changeRate >= VOLATILE_CHANGE_RATE,
		observations,
		changed,
		changeRate,
	};
}
