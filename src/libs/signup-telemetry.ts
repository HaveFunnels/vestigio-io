import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Every way a signup can end, recorded.
//
// /api/user/register has six exits and only one of them left a trace:
// success called evaluateAlerts("new_signup"), which consults the
// AlertRule table, which has no rows in production, so it did
// nothing. Rate limiting, a schema rejection, a failed captcha, a
// duplicate email and a database error all returned and vanished.
//
// That is the blind spot that let signup stay broken for three
// months. Turnstile started rejecting 100% of attempts on 2026-07-05
// and the only evidence was an absence: no new User rows. An absence
// is indistinguishable from "nobody tried", which is exactly how it
// got read.
//
// Written to ProductEvent because that table was built for this:
// userId/orgId nullable for anonymous funnel events, a properties
// blob, and a 90-day retention window already declared.
//
// No email, ever. The outcome is the diagnostic; the identity is not,
// and a table of failed signup emails is a liability with no use.
// ──────────────────────────────────────────────

export type SignupOutcome =
	| "created"
	| "rate_limited"
	| "invalid_payload"
	| "captcha_failed"
	| "already_registered"
	| "error";

export interface SignupAttemptInput {
	outcome: SignupOutcome;
	/** Per-tab visit id from the marketing tracker, when the form sent
	 *  one. Lets a signup attempt be joined to the session's pageviews
	 *  and to the campaign that produced it. */
	sessionId?: string | null;
	/** First-touch attribution as stored by @/libs/marketing-session. */
	firstTouch?: Record<string, unknown> | null;
	/** Set on success. This is the join between the pre-auth funnel,
	 *  keyed on the marketing session id, and everything the person
	 *  does inside the product, keyed on userId. The in-app tracker
	 *  deliberately keeps its own session id, so without this the
	 *  chain would stop at the signup. */
	userId?: string | null;
	/** Extra context for the outcome, e.g. the captcha's reason. Never
	 *  anything that identifies a person. */
	detail?: string | null;
}

/**
 * Fire-and-forget. A failure to record telemetry must never change
 * the outcome of a signup, so this swallows everything and only
 * complains to the log.
 */
export function recordSignupAttempt(input: SignupAttemptInput): void {
	void prisma.productEvent
		.create({
			data: {
				event: "signup.attempt",
				userId: input.userId ?? null,
				pathname: "/api/user/register",
				// ProductEvent.sessionId is non-nullable. A server-side
				// attempt with no client session is "server", which is
				// also the signal that the request did not come through
				// the instrumented form.
				sessionId: input.sessionId?.slice(0, 120) || "server",
				properties: JSON.parse(
					JSON.stringify({
						outcome: input.outcome,
						detail: input.detail ?? undefined,
						firstTouch: input.firstTouch ?? undefined,
					}),
				),
			},
		})
		.catch((err) => {
			console.warn(
				`[signup-telemetry] failed to record ${input.outcome}:`,
				err instanceof Error ? err.message : err,
			);
		});
}
