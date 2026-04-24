import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { sendActivationEmail } from "@/libs/notification-triggers";

// ──────────────────────────────────────────────
// POST /api/admin/organizations/resend-activation
//
// Regenerates the activation token (7-day TTL) and re-sends
// the activation email. Admin-only.
//
// Body: { userId: string, domain?: string }
// ──────────────────────────────────────────────

export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const body = await request.json();
	const { userId, domain } = body;

	if (!userId) {
		return NextResponse.json({ message: "userId is required" }, { status: 400 });
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, email: true, activatedAt: true },
	});

	if (!user) {
		return NextResponse.json({ message: "User not found" }, { status: 404 });
	}

	if (user.activatedAt) {
		return NextResponse.json({ message: "User already activated" }, { status: 409 });
	}

	// Generate new token (7-day TTL)
	const token = randomBytes(32).toString("hex");
	const tokenTTL = 7 * 24 * 60 * 60 * 1000;

	await prisma.user.update({
		where: { id: userId },
		data: {
			activationToken: token,
			activationTokenExpiresAt: new Date(Date.now() + tokenTTL),
		},
	});

	// Send activation email
	try {
		await sendActivationEmail(user.email!, token, domain || "Vestigio");
	} catch (err) {
		console.error("[admin.resend-activation] email failed:", err);
		return NextResponse.json(
			{ message: "Token regenerated but email failed to send", tokenRegenerated: true },
			{ status: 207 },
		);
	}

	return NextResponse.json({ message: "Activation email sent", email: user.email });
}
