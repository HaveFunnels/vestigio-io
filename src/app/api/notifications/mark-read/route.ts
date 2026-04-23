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
			// Mark single notification
			await prisma.notificationLog.updateMany({
				where: { id: body.id, userId },
				data: { status: "read" },
			});
		} else {
			// Mark all as read
			await prisma.notificationLog.updateMany({
				where: { userId, status: "sent" },
				data: { status: "read" },
			});
		}

		await prisma.$disconnect();
		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json({ ok: false });
	}
}
