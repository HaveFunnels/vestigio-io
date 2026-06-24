// ──────────────────────────────────────────────
// Peer-cohort prevalence — gates "missing pattern" inferences.
//
// Problem this module solves (2026-06-24):
//
// The inference layer fires several "missing X" findings when a
// site doesn't exhibit a pattern that US/EU CRO literature treats
// as standard — countdown timers, fake scarcity ("apenas X
// restam"), cookie banners, live viewing counters. These were
// imported as defaults without per-market calibration. The
// 18-site BR D2C cohort scan (src/data/vestigio-index/cohorts/
// ecommerce-2026-06.ts) showed those patterns are RARE in
// Brazilian ecommerce mainstream:
//
//   countdown timer:    2/18 (11%)
//   fake scarcity:      2/18 (11%)
//   viewing counter:    0/18 (0%)
//   cookie banner:      1/18 (6%)
//
// Firing "no_urgency_indicators" on a BR D2C site tells the
// founder "you're missing urgency cues" when 89% of peers don't
// use them either. The absence is market norm, not opportunity.
// That's noise displacing real findings in the monthly Plano.
//
// This module exposes a gate: shouldSuppressMissingPattern(
// inferenceKey, vertical, locale). When the peer cohort's
// prevalence of the underlying pattern is below the per-inference
// threshold, suppress the finding. When prevalence is high enough,
// the inference fires as before.
//
// As more cohort datasets land (saas-b2b, cursos, agencias), they
// register here and the same gate covers all of them with no
// per-detector code change.
//
// DESIGN PRINCIPLE
// Never ship a "missing X" detector without checking whether peer
// cohort prevalence of X is high enough to make absence
// informative. See VestigioIndexBucket entry in
// llm-purpose-registry for the related cost-side rule.
// ──────────────────────────────────────────────

import { COHORT_ECOMMERCE_2026_06 } from "../../src/data/vestigio-index/cohorts/ecommerce-2026-06";
import type { CohortAggregate } from "../../src/data/vestigio-index/cohort-types";

/** All persisted cohorts, keyed by `<vertical>:<locale>`. Today
 *  only ecommerce/pt-BR is filled. New cohort files (saas-b2b,
 *  cursos, agencias) get added as the seeding script runs against
 *  each vertical. */
const PEER_COHORTS: Record<string, CohortAggregate> = {
	"ecommerce:pt-BR": COHORT_ECOMMERCE_2026_06,
};

/** Pattern keys we track on the cohort. Mirrors the field names in
 *  CohortAggregate.prevalence — kept as a union so callers get
 *  compile-time safety when registering a new gated inference. */
export type PatternKey =
	| "countdownTimer"
	| "fakeScarcity"
	| "viewingCounter"
	| "cookieBanner"
	| "chatWidget"
	| "autoplayVideo"
	| "visibleH1"
	| "pixMention"
	| "whatsappContact";

/** "Missing pattern" inferences — the inference key + the cohort
 *  pattern whose prevalence justifies (or doesn't) the finding +
 *  the minimum cohort prevalence below which the inference is
 *  market noise. */
interface MissingPatternRule {
	patternKey: PatternKey;
	/** If peer cohort prevalence < this, suppress the inference.
	 *  Rule of thumb: 0.40 = "if fewer than 40% of peers do X, then
	 *  the absence of X isn't a meaningful finding". Tuned per
	 *  pattern — some are 0.20 (e.g. cookie banner — even less
	 *  common, but informative when missing in a GDPR-heavy
	 *  vertical). */
	minPrevalenceToFire: number;
	/** Human-readable note that lands in the gate's `reason` field
	 *  for logging / debugging. Never displayed to the customer. */
	note: string;
}

const MISSING_PATTERN_RULES: Record<string, MissingPatternRule> = {
	// 2026-06-24 launch: only this one is gated. As we extend the
	// catalog (no_fake_scarcity, no_cookie_banner_advanced, etc.),
	// add entries here and the gate covers them automatically.
	no_urgency_indicators: {
		patternKey: "countdownTimer",
		minPrevalenceToFire: 0.40,
		note:
			"Countdown timer / urgency cues. Below 40% peer prevalence the absence reads as market norm, not finding.",
	},
};

/** Look up the peer cohort for (vertical, locale). Returns null when
 *  no cohort is registered — caller treats null as "no data, don't
 *  gate" (degrade-safe). */
export function getPeerCohort(
	vertical: string | null | undefined,
	locale: string | null | undefined,
): CohortAggregate | null {
	if (!vertical || !locale) return null;
	const key = `${vertical}:${locale}`;
	return PEER_COHORTS[key] ?? null;
}

/** Peer prevalence (0..1) for a specific pattern in the cohort
 *  matching (vertical, locale). Returns null when the cohort doesn't
 *  exist or the pattern isn't tracked. */
export function getPeerPrevalence(
	vertical: string | null | undefined,
	locale: string | null | undefined,
	pattern: PatternKey,
): number | null {
	const cohort = getPeerCohort(vertical, locale);
	if (!cohort) return null;
	const value = cohort.prevalence[pattern];
	return typeof value === "number" ? value : null;
}

export interface SuppressionDecision {
	suppress: boolean;
	/** Only useful for logs/tests. Never reach the customer. */
	reason: string;
}

/** Should this "missing pattern" inference fire given the org's
 *  vertical and locale?
 *
 *   - inferenceKey not registered in MISSING_PATTERN_RULES → don't
 *     gate (the inference is market-agnostic, e.g. a generic
 *     web-hygiene finding).
 *   - vertical/locale null OR no cohort data → don't gate (degrade-
 *     safe; better to fire than to silently miss).
 *   - peer prevalence >= rule.minPrevalenceToFire → don't gate
 *     (pattern is common enough that absence is meaningful).
 *   - peer prevalence < rule.minPrevalenceToFire → SUPPRESS, with a
 *     reason for the audit log.
 *
 * Callers thread the returned decision into their detector's early
 * return (see inferNoUrgencyIndicators in packages/inference/
 * vertical-inference.ts for the call pattern). */
export function shouldSuppressMissingPattern(
	inferenceKey: string,
	vertical: string | null | undefined,
	locale: string | null | undefined,
): SuppressionDecision {
	const rule = MISSING_PATTERN_RULES[inferenceKey];
	if (!rule) return { suppress: false, reason: "not gated" };
	const prevalence = getPeerPrevalence(vertical, locale, rule.patternKey);
	if (prevalence === null) {
		return {
			suppress: false,
			reason: "no peer cohort for vertical/locale — degrade-safe pass-through",
		};
	}
	if (prevalence >= rule.minPrevalenceToFire) {
		return {
			suppress: false,
			reason: `peer prevalence ${(prevalence * 100).toFixed(0)}% >= ${(rule.minPrevalenceToFire * 100).toFixed(0)}% threshold`,
		};
	}
	return {
		suppress: true,
		reason: `peer prevalence ${(prevalence * 100).toFixed(0)}% < ${(rule.minPrevalenceToFire * 100).toFixed(0)}% — ${rule.note}`,
	};
}
