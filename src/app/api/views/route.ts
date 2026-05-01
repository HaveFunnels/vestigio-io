import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// GET /api/views — list saved views for current user
// POST /api/views — create a new saved view
//
// If the user has 0 views for the active environment,
// seed the 4 default views on first GET.
//
// Query params:
//   ?pinned=true — returns only pinned views (for sidebar)
// ──────────────────────────────────────────────

const DEFAULT_VIEWS = [
	{
		name: "on_fire",
		icon: "Flame",
		color: "#ef4444",
		filters: { severity: ["critical", "high"], polarity: "negative", change: ["new_issue", "regression"] },
		sortBy: "impact_desc",
		groupBy: null,
		order: 0,
	},
	{
		name: "awaiting_verification",
		icon: "SealCheck",
		color: "#3b82f6",
		filters: { severity: ["critical", "high", "medium"], polarity: "negative", verification: ["static_evidence"], impact: "gt1000" },
		sortBy: "impact_desc",
		groupBy: null,
		order: 1,
	},
	{
		name: "by_domain",
		icon: "SquaresFour",
		color: "#a855f7",
		filters: { polarity: "negative" },
		sortBy: "impact_desc",
		groupBy: "pack",
		order: 2,
	},
	{
		name: "winning",
		icon: "ShieldCheck",
		color: "#10b981",
		filters: { polarity: "positive" },
		sortBy: "impact_desc",
		groupBy: null,
		order: 3,
	},
];

async function resolveEnvironment(userId: string) {
	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;

	if (activeEnvId) {
		const env = await prisma.environment.findUnique({
			where: { id: activeEnvId },
			select: { id: true, organizationId: true },
		});
		if (env) {
			const membership = await prisma.membership.findFirst({
				where: { userId, organizationId: env.organizationId },
			});
			if (membership) return env.id;
		}
	}

	// Fallback: first environment the user has access to
	const membership = await prisma.membership.findFirst({
		where: { userId },
		select: { organizationId: true },
		orderBy: { createdAt: "desc" },
	});
	if (!membership) return null;

	const env = await prisma.environment.findFirst({
		where: { organizationId: membership.organizationId },
		select: { id: true },
	});
	return env?.id || null;
}

export async function GET(request: Request) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!userId) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const environmentId = await resolveEnvironment(userId);
	if (!environmentId) {
		return NextResponse.json({ views: [] });
	}

	// Parse query params
	const url = new URL(request.url);
	const pinnedOnly = url.searchParams.get("pinned") === "true";

	if (pinnedOnly) {
		// Return only pinned views for this user
		const pinned = await prisma.savedView.findMany({
			where: {
				userId,
				environmentId,
				isPinned: true,
			},
			orderBy: { order: "asc" },
			select: {
				id: true,
				name: true,
				color: true,
				icon: true,
				isPinned: true,
				userId: true,
			},
		});
		return NextResponse.json({ views: pinned });
	}

	// Check if user has views
	let views = await prisma.savedView.findMany({
		where: {
			OR: [
				{ userId, environmentId },
				{ environmentId, isShared: true },
			],
		},
		orderBy: { order: "asc" },
	});

	// Seed defaults if user has no views for this env
	if (views.length === 0) {
		const creates = DEFAULT_VIEWS.map((dv) =>
			prisma.savedView.create({
				data: {
					userId,
					environmentId,
					name: dv.name,
					icon: dv.icon,
					color: dv.color,
					filters: dv.filters,
					sortBy: dv.sortBy,
					groupBy: dv.groupBy,
					layout: "table",
					isDefault: true,
					isShared: false,
					isPinned: false,
					order: dv.order,
				},
			})
		);
		views = await Promise.all(creates);
	}

	return NextResponse.json({ views, currentUserId: userId });
}

export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!userId) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const environmentId = await resolveEnvironment(userId);
	if (!environmentId) {
		return NextResponse.json({ message: "No environment" }, { status: 400 });
	}

	let body: {
		name?: string;
		icon?: string;
		color?: string;
		filters?: Record<string, unknown>;
		groupBy?: string;
		sortBy?: string;
		layout?: string;
	};

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid body" }, { status: 400 });
	}

	if (!body.name || body.name.trim().length === 0) {
		return NextResponse.json({ message: "Name is required" }, { status: 400 });
	}

	// Get next order
	const lastView = await prisma.savedView.findFirst({
		where: { userId, environmentId },
		orderBy: { order: "desc" },
		select: { order: true },
	});
	const nextOrder = (lastView?.order ?? -1) + 1;

	const view = await prisma.savedView.create({
		data: {
			userId,
			environmentId,
			name: body.name.trim(),
			icon: body.icon || null,
			color: body.color || null,
			filters: (body.filters || {}) as any,
			groupBy: body.groupBy || null,
			sortBy: body.sortBy || "impact_desc",
			layout: body.layout || "table",
			isDefault: false,
			isShared: false,
			isPinned: false,
			order: nextOrder,
		},
	});

	return NextResponse.json({ view }, { status: 201 });
}
