import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// GET  /api/user/notification-prefs — read current prefs
// POST /api/user/notification-prefs — upsert prefs
// ──────────────────────────────────────────────

const prefsSchema = z.object({
	emailEnabled: z.boolean().optional(),
	smsEnabled: z.boolean().optional(),
	whatsappEnabled: z.boolean().optional(),
	alertOnPageDown: z.boolean().optional(),
	alertOnIncident: z.boolean().optional(),
	alertOnRegression: z.boolean().optional(),
	alertOnImprovement: z.boolean().optional(),
	newsletterSubscribed: z.boolean().optional(),
	productUpdates: z.boolean().optional(),
	alertOnVerifiedResolved: z.boolean().optional(),
	alertOnDigest: z.boolean().optional(),
});

const DEFAULT_PREFS = {
	emailEnabled: true,
	smsEnabled: false,
	whatsappEnabled: false,
	alertOnPageDown: true,
	alertOnIncident: true,
	alertOnRegression: true,
	alertOnImprovement: false,
	newsletterSubscribed: true,
	productUpdates: true,
	alertOnVerifiedResolved: true,
	alertOnDigest: true,
};

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const userId = (session.user as any).id;
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { phone: true, notificationPrefs: true },
	});

	return NextResponse.json({
		phone: user?.phone || null,
		prefs: user?.notificationPrefs || DEFAULT_PREFS,
	});
}

export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await req.json();
	const parsed = prefsSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ message: "Invalid payload", errors: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const userId = (session.user as any).id;

	const updated = await prisma.notificationPreference.upsert({
		where: { userId },
		create: { userId, ...DEFAULT_PREFS, ...parsed.data },
		update: parsed.data,
	});

	return NextResponse.json({ prefs: updated });
}
