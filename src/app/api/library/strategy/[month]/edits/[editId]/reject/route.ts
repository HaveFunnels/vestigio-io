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

	// Pre-fetch for 404 + UI-friendly error. The authoritative
	// decision happens atomically below via UPDATE WHERE pending.
	const edit = await prisma.planEdit.findUnique({
		where: { id: editId },
		select: { id: true, planId: true },
	});
	if (!edit || edit.planId !== plan.id) {
		return NextResponse.json({ message: "Edit not found for this plan" }, { status: 404 });
	}

	// Atomic claim — same pattern as approve. Two concurrent
	// approve/reject requests can both pass a non-tx pre-check at
	// Read Committed; only one updateMany with WHERE-pending succeeds.
	const claimResult = await prisma.$transaction(async (tx: any) => {
		const claim = await tx.planEdit.updateMany({
			where: {
				id: edit.id,
				planId: plan.id,
				approvedAt: null,
				rejectedAt: null,
			},
			data: {
				rejectedAt: new Date(),
				rejectedByUserId: user.id,
			},
		});
		if (claim.count === 0) {
			throw new Error("EDIT_ALREADY_DECIDED");
		}
		await tx.monthlyStrategyPlan.update({
			where: { id: plan.id },
			data: { editLockedByMcpUntil: null },
		});
		return { claimed: true };
	}).catch((err: unknown) => {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg === "EDIT_ALREADY_DECIDED") return { claimed: false } as const;
		throw err;
	});

	if (!claimResult.claimed) {
		return NextResponse.json(
			{ message: "Edit already decided" },
			{ status: 409 },
		);
	}

	return NextResponse.json({ ok: true, editId });
}
