// ──────────────────────────────────────────────
// Exposure cap — the ceiling on any aggregate R$ claim.
//
// **Why this exists:** every finding's R$ impact is a severity
// percentage applied to declared monthly revenue (baselines.ts), and
// until 2026-09 those estimates were summed with no ceiling anywhere.
// The September plan for a store with R$ 198k of measured revenue
// announced R$ 305k/month of "receita em risco" — a potential loss 1.5x
// the entire business, presented as fact. The customer's own analytics
// team caught it and was right to: overlapping findings describe
// overlapping slices of the same revenue, so their percentages do not
// add. A visitor lost to a slow page and a visitor lost to a missing
// trust seal are frequently the same visitor.
//
// The cap is 40% of monthly revenue. Reasoning, so the number can be
// revisited deliberately rather than tuned by vibe: the single largest
// baseline range tops out at 35% of revenue (checkout_integrity, high).
// An aggregate claim just above the worst single scenario says "many
// things are wrong and they overlap"; an aggregate at 150% of revenue
// says the arithmetic is broken. 40% keeps the loss-frame messaging
// (deliberate, see the anxiety-conversion direction) while staying
// inside what a reader who knows their own revenue can believe.
//
// This is a display-layer cap, applied where aggregates are formed
// (plan sections, hero metrics) — individual findings keep their
// per-finding estimates, which are legitimate in isolation.
// ──────────────────────────────────────────────

/** Fraction of declared monthly revenue an aggregate claim may reach. */
export const EXPOSURE_CAP_FRACTION = 0.4;

/** Fallback when no revenue was declared — mirrors FALLBACK_INPUTS in
 *  engine.ts. An unknown-revenue aggregate is doubly an estimate, and
 *  callers receive `revenueDeclared: false` so copy can hedge. */
export const FALLBACK_MONTHLY_REVENUE = 50_000;

export interface CappedExposure {
	/** The value to display. */
	total: number;
	/** The raw, uncapped sum — kept for internal diagnostics only. */
	uncapped: number;
	wasCapped: boolean;
	/** Revenue the cap was computed against. */
	revenueBasis: number;
	/** False when the basis is the SMB fallback, not a declared figure. */
	revenueDeclared: boolean;
}

export function capExposure(
	uncappedTotal: number,
	declaredMonthlyRevenue: number | null | undefined,
): CappedExposure {
	const revenueDeclared =
		typeof declaredMonthlyRevenue === "number" && declaredMonthlyRevenue > 0;
	const revenueBasis = revenueDeclared
		? (declaredMonthlyRevenue as number)
		: FALLBACK_MONTHLY_REVENUE;
	const ceiling = Math.round(revenueBasis * EXPOSURE_CAP_FRACTION);
	const total = Math.min(Math.max(0, Math.round(uncappedTotal)), ceiling);
	return {
		total,
		uncapped: Math.round(uncappedTotal),
		wasCapped: uncappedTotal > ceiling,
		revenueBasis,
		revenueDeclared,
	};
}
