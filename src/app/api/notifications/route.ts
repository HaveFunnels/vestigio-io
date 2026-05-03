import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";

/**
 * GET /api/notifications — list recent notifications for the current user.
 * Stub: returns from NotificationLog table (most recent 20).
 */
export async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const userId = (user as any).id;

	try {
		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();

		const logs = await prisma.notificationLog.findMany({
			where: {
				userId,
				status: { in: ["sent", "delivered"] },
			},
			orderBy: { createdAt: "desc" },
			take: 20,
			select: {
				id: true,
				event: true,
				subject: true,
				channel: true,
				status: true,
				readAt: true,
				createdAt: true,
			},
		});

		await prisma.$disconnect();

		const notifications = logs.map((log) => ({
			id: log.id,
			type: log.event || "system",
			title: log.subject || "Notification",
			body: "",
			timestamp: formatRelative(log.createdAt),
			unread: log.readAt === null, // readAt null = unread; independent of delivery status
		}));

		return NextResponse.json({ notifications });
	} catch {
		return NextResponse.json({ notifications: [] });
	}
}

function formatRelative(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString();
}
