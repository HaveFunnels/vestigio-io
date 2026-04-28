import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { notifyOrganization, renderBrandedEmail } from "@/libs/notifications";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Cancel Flow API — survey, save offers, confirm
//
// Three actions routed via `action` field in POST body:
//   - survey        — submit exit survey, get save offer
//   - accept-offer  — accept the save offer
//   - confirm       — confirm cancellation
// ──────────────────────────────────────────────

const SAVE_OFFER_MAP: Record<string, { primary: string; fallback: string }> = {
	too_expensive: { primary: "discount", fallback: "downgrade" },
	not_using: { primary: "pause", fallback: "support" },
	missing_feature: { primary: "roadmap", fallback: "none" },
	switching: { primary: "discount", fallback: "none" },
	technical: { primary: "support", fallback: "none" },
	temporary: { primary: "pause", fallback: "none" },
	other: { primary: "discount", fallback: "none" },
};

function getSaveOffer(reason: string) {
	return SAVE_OFFER_MAP[reason] || { primary: "none", fallback: "none" };
}

// ── Paddle API helpers (fetch-based, no SDK dependency) ──

const paddleBaseUrl = () =>
	process.env.NEXT_PUBLIC_PADDLE_API_URL || "https://api.paddle.com";

const paddleHeaders = () => ({
	"Content-Type": "application/json",
	Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
});

async function paddlePauseSubscription(
	subscriptionId: string,
	pauseMonths: number,
) {
	const resumeAt = new Date();
	resumeAt.setMonth(resumeAt.getMonth() + pauseMonths);

	const res = await fetch(
		`${paddleBaseUrl()}/subscriptions/${subscriptionId}/pause`,
		{
			method: "POST",
			headers: paddleHeaders(),
			body: JSON.stringify({
				effective_from: "next_billing_period",
				resume_at: resumeAt.toISOString(),
			}),
		},
	);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Paddle pause failed: ${res.status} ${text}`);
	}
	return res.json();
}

async function paddleCancelSubscription(subscriptionId: string) {
	const res = await fetch(
		`${paddleBaseUrl()}/subscriptions/${subscriptionId}/cancel`,
		{
			method: "POST",
			headers: paddleHeaders(),
			body: JSON.stringify({
				effective_from: "next_billing_period",
			}),
		},
	);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Paddle cancel failed: ${res.status} ${text}`);
	}
	return res.json();
}

async function paddleApplyDiscount(
	subscriptionId: string,
	discountId: string,
) {
	const res = await fetch(
		`${paddleBaseUrl()}/subscriptions/${subscriptionId}`,
		{
			method: "PATCH",
			headers: paddleHeaders(),
			body: JSON.stringify({
				discount: {
					id: discountId,
					effective_from: "next_billing_period",
				},
			}),
		},
	);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Paddle discount failed: ${res.status} ${text}`);
	}
	return res.json();
}

// ── Resolve the org for the current user ──

async function resolveOrg(userId: string) {
	const membership = await prisma.membership.findFirst({
		where: { userId, role: { in: ["owner", "admin"] } },
		include: { organization: true },
	});
	return membership?.organization ?? null;
}

// ── POST handler ──

const VALID_REASONS = [
	"too_expensive",
	"not_using",
	"missing_feature",
	"switching",
	"technical",
	"temporary",
	"other",
];

export const POST = withErrorTracking(
	async function POST(req: NextRequest) {
		const session = await getServerSession(authOptions);
		if (!session?.user?.id) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const body = await req.json();
		const { action } = body;

		if (!action || !["survey", "accept-offer", "confirm"].includes(action)) {
			return NextResponse.json(
				{ message: "Invalid action. Must be: survey, accept-offer, or confirm" },
				{ status: 400 },
			);
		}

		const org = await resolveOrg(session.user.id);
		if (!org) {
			return NextResponse.json(
				{ message: "No organization found" },
				{ status: 404 },
			);
		}

		// ── Action: survey ──────────────────────────
		if (action === "survey") {
			const { reason, freeText } = body;

			if (!reason || !VALID_REASONS.includes(reason)) {
				return NextResponse.json(
					{ message: "Invalid reason", validReasons: VALID_REASONS },
					{ status: 400 },
				);
			}

			const offer = getSaveOffer(reason);

			const survey = await prisma.cancelSurvey.create({
				data: {
					organizationId: org.id,
					reason,
					freeText: freeText || null,
					offeredSave: offer.primary,
				},
			});

			return NextResponse.json({
				surveyId: survey.id,
				offer: {
					primary: offer.primary,
					fallback: offer.fallback,
				},
			});
		}

		// ── Action: accept-offer ────────────────────
		if (action === "accept-offer") {
			const { surveyId, offerType, pauseMonths } = body;

			if (!surveyId || !offerType) {
				return NextResponse.json(
					{ message: "surveyId and offerType are required" },
					{ status: 400 },
				);
			}

			const survey = await prisma.cancelSurvey.findUnique({
				where: { id: surveyId },
			});

			if (!survey || survey.organizationId !== org.id) {
				return NextResponse.json(
					{ message: "Survey not found" },
					{ status: 404 },
				);
			}

			try {
				if (
					offerType === "pause" &&
					session.user.subscriptionId
				) {
					const months = Math.min(Math.max(pauseMonths || 1, 1), 3);
					await paddlePauseSubscription(
						session.user.subscriptionId,
						months,
					);
				} else if (
					offerType === "discount" &&
					session.user.subscriptionId
				) {
					// Use the PADDLE_SAVE_DISCOUNT_ID env var for the 25%-off-3-months coupon
					const discountId = process.env.PADDLE_SAVE_DISCOUNT_ID;
					if (discountId) {
						await paddleApplyDiscount(
							session.user.subscriptionId,
							discountId,
						);
					}
				}
				// For "support", "roadmap", "downgrade" — no Paddle action needed,
				// just mark the survey as accepted so the UI shows the right state.
			} catch (err: any) {
				console.error("[cancel/accept-offer] Paddle error:", err?.message);
				// Don't fail — still mark as accepted in DB
			}

			await prisma.cancelSurvey.update({
				where: { id: surveyId },
				data: { acceptedSave: true, offeredSave: offerType },
			});

			return NextResponse.json({ success: true, offerType });
		}

		// ── Action: confirm ─────────────────────────
		if (action === "confirm") {
			const { surveyId } = body;

			if (!surveyId) {
				return NextResponse.json(
					{ message: "surveyId is required" },
					{ status: 400 },
				);
			}

			const survey = await prisma.cancelSurvey.findUnique({
				where: { id: surveyId },
			});

			if (!survey || survey.organizationId !== org.id) {
				return NextResponse.json(
					{ message: "Survey not found" },
					{ status: 404 },
				);
			}

			// Cancel via Paddle
			if (session.user.subscriptionId) {
				try {
					await paddleCancelSubscription(session.user.subscriptionId);
				} catch (err: any) {
					console.error("[cancel/confirm] Paddle error:", err?.message);
					return NextResponse.json(
						{ message: "Failed to cancel subscription. Please try again or contact support." },
						{ status: 500 },
					);
				}
			}

			await prisma.cancelSurvey.update({
				where: { id: surveyId },
				data: { cancelledAt: new Date() },
			});

			// ── Post-cancel win-back email (immediate) ──
			try {
				await notifyOrganization(org.id, {
					event: "billing",
					subject: "We're sorry to see you go",
					bodyHtml: renderBrandedEmail({
						headline: "We're sorry to see you go",
						intro:
							"Your subscription has been cancelled and will end at the close of your current billing period. " +
							"All your data will be preserved for 30 days. You can reactivate anytime from your settings.",
						ctaLabel: "Reactivate my account",
						ctaUrl: "https://vestigio.io/app/settings",
						footerNote:
							"If you have any questions, reply to this email or reach out to support.",
					}),
					bodyText:
						"Your Vestigio subscription has been cancelled. Reactivate anytime at vestigio.io/app/settings.",
					tag: "cancel_winback",
				});
			} catch {
				// Best-effort — don't fail the cancel on email error
			}

			// TODO: Day 7 follow-up — "Here's what you missed this week" (needs job scheduler)
			// TODO: Day 30 follow-up — "Your data will be deleted in 7 days" (needs job scheduler)

			return NextResponse.json({
				success: true,
				cancelledAt: new Date().toISOString(),
			});
		}

		return NextResponse.json({ message: "Unknown action" }, { status: 400 });
	},
	{ endpoint: "/api/billing/cancel", method: "POST" },
);
