import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";

/**
 * POST /api/notifications/mark-read — mark one or all notifications as read.
 * Body: { id?: string } — if id provided, mark that one; otherwise mark all.
 */
export async function POST(req: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const userId = (user as any).id;
	const body = await req.json().catch(() => ({}));

	try {
		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();

		if (body.id) {
			// Mark single notification as read — set readAt timestamp
			// instead of changing delivery status
			await prisma.notificationLog.updateMany({
				where: { id: body.id, userId, readAt: null },
				data: { readAt: new Date() },
			});
		} else {
			// Mark all as read
			await prisma.notificationLog.updateMany({
				where: { userId, readAt: null, status: { in: ["sent", "delivered"] } },
				data: { readAt: new Date() },
			});
		}

		await prisma.$disconnect();
		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json({ ok: false });
	}
}
