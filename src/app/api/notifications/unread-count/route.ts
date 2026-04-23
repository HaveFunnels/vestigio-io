import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";

/**
 * GET /api/notifications/unread-count — quick unread count for badge polling.
 */
export async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ count: 0 });
	}

	const userId = (user as any).id;

	try {
		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();

		const count = await prisma.notificationLog.count({
			where: {
				userId,
				status: "sent", // "sent" = delivered but not yet read
			},
		});

		await prisma.$disconnect();
		return NextResponse.json({ count });
	} catch {
		return NextResponse.json({ count: 0 });
	}
}
