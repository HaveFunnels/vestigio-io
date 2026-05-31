import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// POST /api/library/strategy/[month]/comments
//
// Create a user-authored comment on a plan section. Member-or-owner
// can post; the comment is team-visible (Notion-style, no per-user
// privacy). MCP-authored comments come through the MCP write tool
// (apps/mcp/server.ts add_plan_comment), not this endpoint.
//
// Body: { envId, sectionId, body }
//
// sectionId vocabulary:
//   header, hero-metrics, buyer-segments, narrative-what-happened,
//   value-preview, memory, next-step:<step-id>
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const { month } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
	}

	const envId = body?.envId;
	const sectionId = body?.sectionId;
	const commentBody = body?.body;
	if (typeof envId !== "string" || typeof sectionId !== "string") {
		return NextResponse.json(
			{ message: "envId and sectionId are required" },
			{ status: 400 },
		);
	}
	if (typeof commentBody !== "string" || commentBody.trim().length === 0) {
		return NextResponse.json({ message: "body is required" }, { status: 400 });
	}
	if (commentBody.length > 4000) {
		return NextResponse.json({ message: "body too long (max 4000 chars)" }, { status: 400 });
	}

	// Access check — owner-or-member of the env's org.
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	const isOwner = env.organization?.ownerId === user.id;
	const isMember = env.organization?.memberships?.some((m) => m.userId === user.id) ?? false;
	if (!isOwner && !isMember && (user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { environmentId_month: { environmentId: envId, month } },
		select: { id: true, status: true },
	});
	if (!plan) return NextResponse.json({ message: "Plan not found" }, { status: 404 });
	if (plan.status === "archived") {
		return NextResponse.json({ message: "Plan is archived" }, { status: 409 });
	}

	const comment = await prisma.planComment.create({
		data: {
			planId: plan.id,
			sectionId,
			authorId: user.id,
			authorKind: "user",
			body: commentBody.trim(),
		},
		select: { id: true, sectionId: true, createdAt: true },
	});

	return NextResponse.json({
		ok: true,
		id: comment.id,
		sectionId: comment.sectionId,
		createdAt: comment.createdAt.toISOString(),
	});
}
