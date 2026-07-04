import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { sendActivationEmail } from "@/libs/notification-triggers";
import { checkRateLimit } from "@/libs/limiter";

// Per-lead caps: at most this many activation-email sends within the
// window. Enforced against the NotificationLog table (event=
// "activation_link", recipient=user.email) so counts survive restart
// and cross-replica. The prior comment on this route claimed "max 3
// resends per lead" but zero code implemented it — an attacker with
// any known lead id could POST unbounded, flooding the user's inbox
// and burning Brevo quota. See M6 CRITICAL C3.
const MAX_RESENDS_PER_LEAD = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/lead/[id]/resend-activation
 *
 * Resends the activation email for a converted lead. Used from the
 * thank-you page when the original email didn't arrive.
 *
 * Two rate limits:
 *   - Per-IP (via checkRateLimit) — 5 requests / 60s. Blocks bulk
 *     abuse from a single origin. Meaningful now that P0.5 fixed
 *     getIp() to read cf-connecting-ip instead of client-spoofable
 *     x-forwarded-for.
 *   - Per-lead (via NotificationLog count) — MAX_RESENDS_PER_LEAD
 *     inside RESEND_WINDOW_MS. Blocks rotation-across-IPs abuse
 *     from resolvers, botnets, and residential proxies.
 *
 * Only works for leads in 'converted' status with a linked user
 * that has a non-expired activation token.
 */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

	const perIpLimited = await checkRateLimit(5, 60_000);
	if (perIpLimited) return perIpLimited;

	const lead = await prisma.anonymousLead.findUnique({
		where: { id },
		select: { status: true, promotedToUserId: true, domain: true },
	});

	if (!lead || lead.status !== "converted" || !lead.promotedToUserId) {
		return NextResponse.json({ message: "Not available" }, { status: 404 });
	}

	const user = await prisma.user.findUnique({
		where: { id: lead.promotedToUserId },
		select: { email: true, activationToken: true, activationTokenExpiresAt: true, activatedAt: true },
	});

	if (!user) {
		return NextResponse.json({ message: "User not found" }, { status: 404 });
	}

	// Already activated — no need to resend
	if (user.activatedAt) {
		return NextResponse.json({ message: "Already activated", alreadyActivated: true });
	}

	// No valid token
	if (!user.activationToken || !user.activationTokenExpiresAt || user.activationTokenExpiresAt < new Date()) {
		return NextResponse.json({ message: "Activation link expired. Contact support." }, { status: 410 });
	}

	// Per-lead cap — count recent activation_link emails for this user.
	// The count is on `event`+`recipient` (email) rather than userId so
	// the check still works if the user row has drifted before the
	// count query fires.
	if (user.email) {
		const recentSends = await prisma.notificationLog.count({
			where: {
				event: "activation_link",
				recipient: user.email,
				createdAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) },
			},
		});
		if (recentSends >= MAX_RESENDS_PER_LEAD) {
			return NextResponse.json(
				{
					message: "Too many resend attempts. Try again later or contact support.",
				},
				{ status: 429 },
			);
		}
	}

	try {
		const domain = lead.domain?.replace(/^https?:\/\//, "").replace(/\/+$/, "") || "";
		await sendActivationEmail(user.email!, user.activationToken!, domain);
		return NextResponse.json({ sent: true });
	} catch (err) {
		console.error(`[resend-activation] failed for lead ${id}:`, err);
		return NextResponse.json({ message: "Failed to send. Try again." }, { status: 500 });
	}
}
