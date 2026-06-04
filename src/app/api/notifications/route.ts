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
			// Resolve a click destination per event. NotificationLog has no
			// target_id column today, so we route by event class to the
			// section most likely to carry the relevant context. Null when
			// there's nowhere meaningful to send the user (magic links,
			// system messages).
			href: resolveHrefForEvent(log.event),
		}));

		return NextResponse.json({ notifications });
	} catch {
		return NextResponse.json({ notifications: [] });
	}
}

function resolveHrefForEvent(event: string | null | undefined): string | null {
	if (!event) return null;
	switch (event) {
		// Finding-shaped events — dashboard is the right landing because
		// it shows the change report + KPI tiles that surface regressions /
		// improvements / resolutions. Once NotificationLog learns to store
		// a finding/action ref, we can deep-link straight to the drawer.
		case "regression":
		case "improvement":
		case "resolved":
		case "verified_resolved":
		case "digest":
			return "/app/pulse";
		case "page_down":
			return "/app/inventory";
		case "incident":
			return "/app/actions";
		// Newsletter / magic_link / system don't have an in-app landing.
		default:
			return null;
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
