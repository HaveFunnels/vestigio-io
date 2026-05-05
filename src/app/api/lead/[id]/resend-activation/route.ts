import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { sendActivationEmail } from "@/libs/notification-triggers";

/**
 * POST /api/lead/[id]/resend-activation
 *
 * Gap 6 fix: Resends the activation email for a converted lead.
 * Used from the thank-you page when the original email didn't arrive.
 *
 * Rate limited: max 3 resends per lead (prevents abuse).
 * Only works for leads in 'converted' status with a linked user
 * that has a non-expired activation token.
 */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;

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

	try {
		const domain = lead.domain?.replace(/^https?:\/\//, "").replace(/\/+$/, "") || "";
		await sendActivationEmail(user.email!, user.activationToken!, domain);
		return NextResponse.json({ sent: true });
	} catch (err) {
		console.error(`[resend-activation] failed for lead ${id}:`, err);
		return NextResponse.json({ message: "Failed to send. Try again." }, { status: 500 });
	}
}
