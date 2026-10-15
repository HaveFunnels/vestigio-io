// ──────────────────────────────────────────────
// Who may be paused for not logging in.
//
// The inactivity pause exists so an abandoned environment stops
// burning cycles. It sets continuousPaused, and BOTH the audit
// scheduler and the probe cron filter on that flag, so a paused
// environment goes completely dark: no cold, warm, hot or targeted
// cycles at all.
//
// That is correct for an abandoned trial. It is wrong for someone
// paying, and it silently happened: Casa Montelle, orgType=customer,
// plan=max, status=active, produced 160 targeted cycles on 2026-10-09
// and then absolutely nothing until 2026-10-14, when the owner opened
// /app and env-activity auto-resumed it. Four days of no analysis for
// a paying customer whose entire reason for paying is that we watch
// the site so they do not have to. Nothing alerted; the gap is only
// visible by grouping cycles per day per environment.
//
// So: a paying org that is active is never paused for being quiet.
// Trials still are, and so is a customer org that has not started
// paying (pending) or has been cut off (suspended).
//
// Statuses are listed explicitly rather than written as
// `status: { not: "active" }`. Prisma's `not` matches null rows, and
// Organization.status defaults to "pending" but legacy rows can be
// null, so the negated form would quietly make them pauseable. The
// same trap already bit the orgType filter here once (Wave 5 Fase 2
// fix #11).
// ──────────────────────────────────────────────

/** Organization statuses whose environments may be paused for
 *  inactivity. "active" is deliberately absent. */
export const PAUSEABLE_CUSTOMER_STATUSES = ["pending", "suspended"] as const;

/**
 * Prisma `where.organization` fragment for inactivity-pause
 * candidates.
 *
 * Demo orgs are excluded by not appearing at all: they are stopped
 * with operator_disabled, which is a deliberate call and must not be
 * confused with going quiet.
 */
export const INACTIVITY_PAUSEABLE_ORG_FILTER = {
	OR: [
		{ orgType: "trial" },
		{ orgType: "customer", status: { in: [...PAUSEABLE_CUSTOMER_STATUSES] } },
	],
};

/** The same rule as a predicate, so it can be asserted directly. */
export function isPauseableForInactivity(org: {
	orgType?: string | null;
	status?: string | null;
}): boolean {
	if (org.orgType === "trial") return true;
	if (org.orgType !== "customer") return false;
	return (PAUSEABLE_CUSTOMER_STATUSES as readonly string[]).includes(org.status ?? "");
}
