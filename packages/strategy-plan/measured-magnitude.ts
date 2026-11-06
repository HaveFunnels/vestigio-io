// ──────────────────────────────────────────────
// Money derived from the measurement, not from a percentage.
//
// Every R$ in the plan today is `monthlyRevenue × a hardcoded severity
// percentage`. Measured on 2026-11-05 it is worse than that: the
// percentage is applied to FALLBACK_INPUTS.monthly_revenue = 50_000,
// a constant, because the only path that supplies real business inputs
// is reconcileIntegrations(integration_snapshots) and
// IntegrationConnection has zero rows. Proven against the customer's
// own plan: guarantee_invisible_at_decision is severity high, baseline
// 10-20%, midpoint 15%, and 50_000 × 0.15 = 7_500, the exact figure
// published. Their declared revenue is 198_000, which would have given
// 29_700.
//
// So all 20 reviewers were right that the money felt arbitrary. It is.
//
// What this module does NOT do, deliberately:
//
//   It does not raise the percentage base to the real revenue. Alone,
//   that change makes things worse: the 15 open findings would sum to
//   ~R$ 221k, the 40%-of-revenue cap would clamp to R$ 79_200, and the
//   headline would become exactly 40% of revenue for every customer
//   forever. That trades an arbitrary number for a detectable one.
//
//   It does not feed an exposure total. openLossExposure sums
//   impactMidpoint, so writing this into impact.midpoint would mix a
//   measured magnitude into a heuristic sum and double-count revenue
//   that overlapping findings describe twice.
//
// What it does: give a measured finding a magnitude the customer can
// check, from one declared number and two counts they can verify.
// ──────────────────────────────────────────────

/** Revenue carried by a single measured session. */
export function revenuePerSession(
	monthlyRevenue: number | null | undefined,
	measuredSessions: number | null | undefined,
): number | null {
	if (!monthlyRevenue || monthlyRevenue <= 0) return null;
	if (!measuredSessions || measuredSessions <= 0) return null;
	return monthlyRevenue / measuredSessions;
}

/**
 * Revenue flowing THROUGH a measured population of sessions.
 *
 * Named "at stake", never "lost", and the distinction is the whole
 * point. On the customer's cycle the duplicate-URL finding touches
 * 37,590 of 65,190 sessions, which is 57.7% of the store: calling that
 * a loss would be the same overclaim the percentage model made, in a
 * new coat. What is true is that this much revenue passes through the
 * sessions in question, and that is a magnitude a reader can act on
 * without being misled.
 */
export function revenueAtStake(
	affectedSessions: number | null | undefined,
	perSession: number | null,
): number | null {
	if (perSession === null) return null;
	if (!affectedSessions || affectedSessions <= 0) return null;
	return Math.round(affectedSessions * perSession);
}

/** The share of all measured sessions a finding touches, 0 to 1. */
export function sessionShare(
	affectedSessions: number | null | undefined,
	measuredSessions: number | null | undefined,
): number | null {
	if (!affectedSessions || affectedSessions <= 0) return null;
	if (!measuredSessions || measuredSessions <= 0) return null;
	return Math.min(1, affectedSessions / measuredSessions);
}

export interface MeasuredMagnitude {
	/** Revenue flowing through the affected sessions. Never a loss, and
	 *  for per-kind friction an upper bound: the aggregates give
	 *  occurrences per kind and friction sessions per page, never
	 *  sessions per kind, so the affected count is bounded by both. */
	revenueAtStakeBrl: number;
	affectedSessions: number;
	measuredSessions: number;
	/** 0 to 1. */
	share: number;
	/** The declared figure this rests on, so the reader can audit it. */
	monthlyRevenueBrl: number;
}

/**
 * The whole computation, or null when any input is missing.
 *
 * Returning null rather than a fallback is the point: a magnitude
 * built on a constant is what this module exists to replace.
 */
export function measuredMagnitude(
	affectedSessions: number | null | undefined,
	measuredSessions: number | null | undefined,
	monthlyRevenue: number | null | undefined,
): MeasuredMagnitude | null {
	const perSession = revenuePerSession(monthlyRevenue, measuredSessions);
	const atStake = revenueAtStake(affectedSessions, perSession);
	const share = sessionShare(affectedSessions, measuredSessions);
	if (atStake === null || share === null) return null;
	return {
		revenueAtStakeBrl: atStake,
		affectedSessions: affectedSessions as number,
		measuredSessions: measuredSessions as number,
		share,
		monthlyRevenueBrl: monthlyRevenue as number,
	};
}

/** One line the customer can check, in their own numbers. */
export function explainMagnitude(m: MeasuredMagnitude, locale = "pt-BR"): string {
	const brl = (n: number) =>
		n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
	const pct = (m.share * 100).toFixed(1).replace(".", ",");
	if (locale !== "pt-BR") {
		return (
			`${m.affectedSessions.toLocaleString("en-US")} of ${m.measuredSessions.toLocaleString("en-US")} ` +
			`measured sessions (${pct}%), carrying ${brl(m.revenueAtStakeBrl)} of the ` +
			`${brl(m.monthlyRevenueBrl)} you declared. Revenue passing through, not revenue lost.`
		);
	}
	return (
		`${m.affectedSessions.toLocaleString("pt-BR")} das ${m.measuredSessions.toLocaleString("pt-BR")} ` +
		`sessões medidas (${pct}%), por onde passa ${brl(m.revenueAtStakeBrl)} do ` +
		`${brl(m.monthlyRevenueBrl)} que você declarou. É receita que passa por aqui, não receita perdida.`
	);
}
