import { IMPACT_BASELINES } from "./baselines";

// ──────────────────────────────────────────────
// Mini-Audit Impact Estimator
//
// Lightweight variant of packages/impact/engine.ts intended for the
// /lp funnel. Full engine requires `Inference[]` (emitted by the
// signals/inference pipeline) — mini-audit doesn't go that deep, so
// this helper accepts the same (inference_key, severity) pair the
// engine would and computes a BRL range directly from the baseline
// percentages + the lead's self-declared business inputs.
//
// Currency is BRL because the /lp funnel is Brazil-first. The full
// engine defaults to USD, which is correct there. If the /lp funnel
// ever expands beyond Brazil, add a currency parameter.
//
// Output is in CENTS (integer) so downstream rendering can format
// without float drift ("R$ 12.000" from 1_200_000 cents is safer
// than from 12000.0).
// ──────────────────────────────────────────────

export type MiniImpactSeverity = "high" | "medium" | "low";

export interface MiniBusinessInputs {
	/** Monthly revenue in R$ (not cents). From the /lp form step 3. */
	monthly_revenue: number | null;
	/** Average order value in R$. From the /lp form step 3. */
	average_ticket: number | null;
}

export interface MiniImpact {
	/** Lower bound of expected monthly revenue loss, in BRL cents. */
	min_brl_cents: number;
	/** Upper bound of expected monthly revenue loss, in BRL cents. */
	max_brl_cents: number;
	/** Midpoint for single-number displays. */
	mid_brl_cents: number;
	/**
	 * How grounded this estimate is:
	 *   heuristic — form had no revenue data, we used fallback SMB number
	 *   mixed     — form had at least revenue; AOV may be guessed
	 *   estimated — full lead inputs present
	 */
	basis: "heuristic" | "mixed" | "estimated";
}

// Same fallback the full engine uses, restated here so the import
// surface stays small (don't pull in FALLBACK_INPUTS from engine.ts
// because that carries USD assumptions). Conservative SMB Brazilian
// e-commerce numbers.
const FALLBACK_MONTHLY_REVENUE_BRL = 60_000;
const FALLBACK_AVERAGE_TICKET_BRL = 180;

/**
 * Compute an impact range for a mini-audit finding.
 *
 * The `inferenceKey` MUST exist in IMPACT_BASELINES — pick the key
 * whose cause/effect narrative best fits the detector. If you invent
 * a new detector whose semantics don't map to any existing baseline,
 * add the baseline first rather than inventing a loose synonym.
 *
 * Severity maps MiniFinding severities as follows:
 *   critical  → "high"   (widest baseline range)
 *   high      → "high"
 *   medium    → "medium"
 *   positive  → returns null (positives don't have a loss)
 */
export function estimateMiniImpact(
	inferenceKey: string,
	severity: MiniImpactSeverity,
	inputs: MiniBusinessInputs,
): MiniImpact | null {
	const baseline = IMPACT_BASELINES[inferenceKey];
	if (!baseline) {
		// Fail closed — if a caller passes an unknown key we'd rather
		// render no money number than a fake one. Log loudly once during
		// dev so new detectors get wired to a real baseline.
		console.warn(
			`[mini-impact] no baseline for inference_key="${inferenceKey}" — impact suppressed`,
		);
		return null;
	}

	const revenueBRL = inputs.monthly_revenue ?? FALLBACK_MONTHLY_REVENUE_BRL;
	const isFallbackRevenue = inputs.monthly_revenue == null;
	const ticketBRL = inputs.average_ticket ?? FALLBACK_AVERAGE_TICKET_BRL;

	const pct = baseline[severity];
	// Most baselines are % of revenue. A few (chargeback_rate,
	// conversion_rate) are rate-based — for those we still multiply
	// against revenue because "% of what you could have kept" is what
	// a cold /lp visitor can interpret. The full engine handles the
	// distinction properly; we intentionally collapse it here.
	const basisMetric = baseline.base_metric;
	let baseValue: number;
	if (basisMetric === "transactions") {
		// transactions baseline needs both AOV and transaction count —
		// /lp form doesn't collect transactions, so approximate as
		// revenue / AOV.
		const monthlyTransactions = Math.max(1, Math.round(revenueBRL / ticketBRL));
		baseValue = monthlyTransactions * ticketBRL;
	} else {
		baseValue = revenueBRL;
	}

	// Heuristic inputs → widen the range to signal uncertainty. Same
	// 50% widening the full engine uses for fallback mode.
	const widen = isFallbackRevenue ? 1.5 : 1.0;
	const minDelta = (baseValue * pct.min) / widen;
	const maxDelta = baseValue * pct.max * widen;

	const minCents = Math.max(0, Math.round(minDelta * 100));
	const maxCents = Math.round(maxDelta * 100);
	const midCents = Math.round((minCents + maxCents) / 2);

	let basis: MiniImpact["basis"];
	if (isFallbackRevenue) {
		basis = "heuristic";
	} else if (inputs.average_ticket == null) {
		basis = "mixed";
	} else {
		basis = "estimated";
	}

	return {
		min_brl_cents: minCents,
		max_brl_cents: maxCents,
		mid_brl_cents: midCents,
		basis,
	};
}

/**
 * Aggregate mini-finding impacts into a single monthly-exposure range.
 * Used by the result page's cost summary banner
 * ("X problemas custando até R$Y/mês").
 *
 * Sums are additive — the /lp teaser over-counts a tiny bit because
 * multiple findings can overlap on the same user flow. Intentional:
 * the "up to" language in the banner already hedges the sum, and a
 * conservative pass would require cross-finding attribution logic
 * that doesn't belong in a 2-minute cold-funnel teaser.
 */
export function summarizeMiniImpact(
	impacts: (MiniImpact | null | undefined)[],
): { min_brl_cents: number; max_brl_cents: number; count: number } | null {
	let min = 0;
	let max = 0;
	let count = 0;
	for (const i of impacts) {
		if (!i) continue;
		min += i.min_brl_cents;
		max += i.max_brl_cents;
		count += 1;
	}
	if (count === 0) return null;
	return { min_brl_cents: min, max_brl_cents: max, count };
}

/**
 * Format a BRL cent value as a short display string suitable for
 * findings cards ("R$ 42.000" not "R$ 42.000,00"). Rounds to nearest
 * 100 when >= R$1k so the display doesn't suggest false precision on
 * an already fuzzy heuristic.
 */
export function formatBRL(cents: number): string {
	const reais = cents / 100;
	if (reais >= 1_000_000) {
		return `R$ ${(reais / 1_000_000).toFixed(1)}M`;
	}
	if (reais >= 10_000) {
		// Round to nearest 100 — "R$ 42.000" reads cleaner than "R$ 41.873"
		const rounded = Math.round(reais / 100) * 100;
		return `R$ ${rounded.toLocaleString("pt-BR")}`;
	}
	return `R$ ${Math.round(reais).toLocaleString("pt-BR")}`;
}
