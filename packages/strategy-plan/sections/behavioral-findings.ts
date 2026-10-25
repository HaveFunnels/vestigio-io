// ──────────────────────────────────────────────
// Measured friction as structured findings.
//
// The measurement pipeline was the one analytic path that bypassed
// Finding entirely: behavioral-measurement.ts has zero references to
// it and renders straight into the plan. The consequence was that the
// only genuinely differentiated content in the product had no
// lifecycle — no new/persistent/resolved, no place in
// /app/findings, and no way to be prioritised against crawler
// findings.
//
// This converts eligible measurements into FindingProjections so they
// join the lifecycle that already exists. It does NOT change what any
// measurement means.
//
// Three rules govern what gets through, because "a detector fired" is
// not the same as "there is a problem":
//
//   1. SUFFICIENCY. A rate over a trickle is noise. A page needs a
//      real session count before a percentage about it is allowed to
//      exist, and the count travels with the finding.
//
//   2. NOT A DEFECT. claim_type is always 'behavioral' and severity is
//      capped below 'critical'. A high friction rate is a measurement
//      whose CAUSE is unknown: Casa Montelle loses 94.4% between
//      product and cart and nothing in the system can say why.
//      Promoting that to a critical defect would be inventing a
//      diagnosis.
//
//   3. NO INVENTED MONEY. impact is zero, which here means "not
//      modelled", not "no impact". These are counts, and the audit's
//      own rule is that the plan may not attach fabricated revenue to
//      them.
//
// Emission is gated by a flag and defaults OFF, because hero-metrics
// aggregates Finding rows: emitting these would silently move the
// numbers in the existing plan. Phase 1 is about having the source of
// truth, not about changing the deliverable.
// ──────────────────────────────────────────────

import type { FindingProjection } from "../../projections/types";
import type { FrictionPageStats, MeasuredFrictionOutput } from "./measured-friction";

/**
 * Off unless explicitly enabled. The plan must behave exactly as
 * before in Phase 1, and that is only provable if nothing is written.
 */
export function areBehavioralFindingsEnabled(): boolean {
	return process.env.BEHAVIORAL_FINDINGS_ENABLED === "true";
}

/**
 * Sessions a page needs before a friction percentage about it may
 * become a finding.
 *
 * Higher than the plan's display floor (30) on purpose. Appearing in
 * a ranked list is a weaker claim than being a tracked finding with a
 * lifecycle, so the bar to become one is higher.
 */
export const MIN_SESSIONS_FOR_FINDING = 200;

/** Distinct sessions that must show the friction, so one rage-clicking
 *  visitor cannot create a finding on their own. */
export const MIN_AFFECTED_SESSIONS = 25;

/** Below this rate the measurement is real but unremarkable. */
export const MIN_FRICTION_RATE_PCT = 5;

/**
 * Occurrences a single friction KIND needs on its own.
 *
 * The page-level gates above qualify the page, not each kind on it. A
 * dry run against Casa Montelle emitted "1 input abandoned" and "5
 * form retries" on a page with 4,179 sessions, because the page itself
 * cleared every floor. A finding with a count of 1 is noise wearing a
 * lifecycle.
 */
export const MIN_COUNT_PER_KIND = 20;

/** One stable key per friction kind. Identity for the lifecycle is
 *  (environmentId, inferenceKey, surface), so the key must not encode
 *  the page or the counts. */
export const FRICTION_INFERENCE_KEYS = {
	deadClicks: "measured_dead_clicks",
	hesitationsNearCta: "measured_hesitation_near_cta",
	inputAbandons: "measured_input_abandon",
	formRetries: "measured_form_retry",
	backtracks: "measured_immediate_backtrack",
} as const;

type FrictionKind = keyof typeof FRICTION_INFERENCE_KEYS;

export interface BehavioralFindingInput {
	friction: MeasuredFrictionOutput | null | undefined;
	windowStart: string;
	windowEnd: string;
}

/** Why a page produced no finding — returned so a dry run can explain
 *  itself instead of just showing an empty list. */
export interface Rejection {
	path: string;
	reason: string;
}

export interface BehavioralFindingsResult {
	findings: FindingProjection[];
	rejections: Rejection[];
}

/**
 * Severity from magnitude, capped.
 *
 * Never 'critical': that tier is for a state of the site, and this is
 * a count whose cause is unknown. 'high' requires both a large
 * affected population and a high rate, so a small page with a scary
 * percentage cannot reach it.
 */
function severityFor(ratePct: number, affected: number): "high" | "medium" | "low" {
	if (ratePct >= 25 && affected >= 500) return "high";
	if (ratePct >= 10) return "medium";
	return "low";
}

/**
 * Confidence from sample size, not from how bad the number looks.
 *
 * A 40% rate over 210 sessions is less trustworthy than a 12% rate
 * over 30,000, and confidence is the field that should carry that.
 */
function confidenceFor(sessions: number): number {
	if (sessions >= 10_000) return 90;
	if (sessions >= 2_000) return 80;
	if (sessions >= 500) return 70;
	return 60;
}

function countFor(pg: FrictionPageStats, kind: FrictionKind): number {
	switch (kind) {
		case "deadClicks":
			return pg.deadClicks;
		case "hesitationsNearCta":
			return pg.hesitationsNearCta;
		case "inputAbandons":
			return pg.inputAbandons;
		case "formRetries":
			return pg.formRetries;
		case "backtracks":
			return pg.backtracks;
	}
}

/**
 * Build findings from measured friction.
 *
 * Deduplication: one finding per friction KIND, not per (kind, page).
 *
 * That is forced by storage, and I had it wrong first. Finding is
 * unique on (cycleId, inferenceKey) — surface is NOT part of the
 * constraint — so three pages sharing a kind collapsed into one row
 * whose surface became the comma-joined string
 * "/c/NX-…, /products/vedaplus-kit, /". Nine projections became five
 * rows with corrupted identity, which also breaks the lifecycle, whose
 * identity is (environmentId, inferenceKey, surface).
 *
 * Encoding the page into the inference key would restore per-page
 * granularity, but it makes key cardinality unbounded and
 * INFERENCE_TO_PACK cannot enumerate them, which an invariant checks.
 * Widening the unique index is a migration on the largest related
 * table and is not a Phase 1 change.
 *
 * So: one finding per kind, surface = the page carrying the most of
 * it, and every page's numbers preserved in the evidence array. The
 * per-page detail survives; only the ability to resolve one page
 * independently of another is deferred.
 */
export function buildBehavioralFindings(
	input: BehavioralFindingInput,
): BehavioralFindingsResult {
	const out: BehavioralFindingsResult = { findings: [], rejections: [] };
	const pages = input.friction?.pages ?? [];
	const qualified: FrictionPageStats[] = [];

	for (const pg of pages) {
		if (pg.sessions < MIN_SESSIONS_FOR_FINDING) {
			out.rejections.push({
				path: pg.path,
				reason: `${pg.sessions} sessions < ${MIN_SESSIONS_FOR_FINDING} floor`,
			});
			continue;
		}
		if (pg.sessionsWithFriction < MIN_AFFECTED_SESSIONS) {
			out.rejections.push({
				path: pg.path,
				reason: `${pg.sessionsWithFriction} affected sessions < ${MIN_AFFECTED_SESSIONS}`,
			});
			continue;
		}
		if (pg.frictionRatePct < MIN_FRICTION_RATE_PCT) {
			out.rejections.push({
				path: pg.path,
				reason: `${pg.frictionRatePct}% rate < ${MIN_FRICTION_RATE_PCT}%`,
			});
			continue;
		}

		qualified.push(pg);
	}

	// Group by kind across the qualified pages.
	const kinds = Object.keys(FRICTION_INFERENCE_KEYS) as FrictionKind[];
	for (const kind of kinds) {
		const counted = qualified.map((pg) => ({ pg, count: countFor(pg, kind) }));
		// Record why a page's contribution was dropped, so the dry run
		// can explain itself rather than showing a silently shorter list.
		for (const x of counted) {
			if (x.count > 0 && x.count < MIN_COUNT_PER_KIND) {
				out.rejections.push({
					path: x.pg.path,
					reason: `${kind}=${x.count} < ${MIN_COUNT_PER_KIND} occurrences`,
				});
			}
		}
		const contributing = counted
			.filter((x) => x.count >= MIN_COUNT_PER_KIND)
			.sort((a, b) => b.count - a.count);
		if (contributing.length === 0) continue;

		// Surface is the page carrying the most of this friction. It is
		// the lifecycle identity, so it has to be deterministic.
		const lead = contributing[0];
		const totalSessions = contributing.reduce((n, x) => n + x.pg.sessions, 0);

		out.findings.push({
			inference_key: FRICTION_INFERENCE_KEYS[kind],
			pack: "behavioral",
			severity: severityFor(lead.pg.frictionRatePct, lead.pg.sessionsWithFriction),
			polarity: "negative",
			confidence: confidenceFor(totalSessions),
			// Zero means NOT MODELLED. These are counts, and the plan is
			// not allowed to attach fabricated revenue to them.
			impact: { monthly_range: { min: 0, max: 0 }, midpoint: 0 },
			surface: lead.pg.path,
			surface_kind: "public",
			origin: "pixel",
			claim_type: "behavioral",
			root_cause: null,
			change_class: null,
			verification_maturity: "verified",
			// Every contributing page keeps its own numbers, so the
			// per-page detail is not lost by grouping.
			evidence: contributing.map((x) => ({
				kind: "measured_count",
				path: x.pg.path,
				label: x.pg.label,
				friction_kind: kind,
				count: x.count,
				sessions: x.pg.sessions,
				sessions_with_friction: x.pg.sessionsWithFriction,
				friction_rate_pct: x.pg.frictionRatePct,
				window_start: input.windowStart,
				window_end: input.windowEnd,
			})),
		} as unknown as FindingProjection);
	}

	return out;
}
