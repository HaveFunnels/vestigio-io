import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// POST /api/library/strategy/[month]/edits/[editId]/reject
//
// Reject a pending PlanEdit. Admin-only. Marks the edit rejected
// (with the rejecting admin's userId for audit) and clears the
// MCP edit lock so another proposal can land. No PlanVersion is
// created — rejection doesn't change plan content.
//
// Body: { envId }
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string; editId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const { month, editId } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	let body: any = {};
	try {
		body = await request.json().catch(() => ({}));
	} catch {
		// empty body acceptable
	}
	const envId = body?.envId;
	if (typeof envId !== "string") {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true, role: true } },
				},
			},
		},
	});
	if (!env) return NextResponse.json({ message: "Environment not found" }, { status: 404 });

	const isOwner = env.organization?.ownerId === user.id;
	const myMembership = env.organization?.memberships?.find((m) => m.userId === user.id);
	const isOrgAdmin =
		isOwner || myMembership?.role === "admin" || myMembership?.role === "owner";
	const isSiteAdmin = (user as any).role === "ADMIN";
	if (!isOrgAdmin && !isSiteAdmin) {
		return NextResponse.json({ message: "Admin only" }, { status: 403 });
	}

	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { environmentId_month: { environmentId: envId, month } },
		select: { id: true },
	});
	if (!plan) return NextResponse.json({ message: "Plan not found" }, { status: 404 });

	const edit = await prisma.planEdit.findUnique({
		where: { id: editId },
		select: { id: true, planId: true, approvedAt: true, rejectedAt: true },
	});
	if (!edit || edit.planId !== plan.id) {
		return NextResponse.json({ message: "Edit not found for this plan" }, { status: 404 });
	}
	if (edit.approvedAt || edit.rejectedAt) {
		return NextResponse.json({ message: "Edit already decided" }, { status: 409 });
	}

	await prisma.$transaction([
		prisma.planEdit.update({
			where: { id: edit.id },
			data: {
				rejectedAt: new Date(),
				rejectedByUserId: user.id,
			},
		}),
		prisma.monthlyStrategyPlan.update({
			where: { id: plan.id },
			data: { editLockedByMcpUntil: null },
		}),
	]);

	return NextResponse.json({ ok: true, editId });
}
