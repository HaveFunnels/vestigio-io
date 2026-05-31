import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// POST /api/library/strategy/[month]/edits/[editId]/approve
//
// Apply a pending PlanEdit to the plan. Admin-only (owner OR org
// admin OR site admin). On success:
//   1. The section's content is replaced with the edit's afterText
//      (currently supports narrative-what-happened + value-preview;
//      other sections noop for now — JSON columns need section-
//      specific writers).
//   2. A PlanVersion snapshot is created so the edit is rollback-
//      able from the audit log.
//   3. The PlanEdit is marked approvedAt + approvedByUserId.
//   4. editLockedByMcpUntil is cleared so the next proposal isn't
//      blocked.
// All inside a single transaction.
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
		// empty body is acceptable
	}
	const envId = body?.envId;
	if (typeof envId !== "string") {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// Resolve plan + admin gate.
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
		select: { id: true, status: true, narrativeWhatHappened: true, valuePreviewNarrative: true, heroMetricsJson: true, buyerSegmentsJson: true, memoryRollupsJson: true, valuePreviewJson: true },
	});
	if (!plan) return NextResponse.json({ message: "Plan not found" }, { status: 404 });

	const edit = await prisma.planEdit.findUnique({
		where: { id: editId },
		select: {
			id: true,
			planId: true,
			sectionId: true,
			afterText: true,
			approvedAt: true,
			rejectedAt: true,
		},
	});
	if (!edit || edit.planId !== plan.id) {
		return NextResponse.json({ message: "Edit not found for this plan" }, { status: 404 });
	}
	if (edit.approvedAt || edit.rejectedAt) {
		return NextResponse.json({ message: "Edit already decided" }, { status: 409 });
	}

	const result = await prisma.$transaction(async (tx: any) => {
		// 1. Snapshot the plan before mutation — rollback-safe audit
		//    log. versionNum auto-increments via a count + 1.
		const versionCount = await tx.planVersion.count({ where: { planId: plan.id } });
		await tx.planVersion.create({
			data: {
				planId: plan.id,
				versionNum: versionCount + 1,
				snapshotJson: {
					narrativeWhatHappened: plan.narrativeWhatHappened,
					valuePreviewNarrative: plan.valuePreviewNarrative,
					heroMetricsJson: plan.heroMetricsJson,
					buyerSegmentsJson: plan.buyerSegmentsJson,
					memoryRollupsJson: plan.memoryRollupsJson,
					valuePreviewJson: plan.valuePreviewJson,
				},
				createdByKind: "user_approval",
			},
		});

		// 2. Apply edit. Only narrative columns have explicit
		//    writers; other sections noop for now (Wave 22.6
		//    follow-up: section-specific JSON writers).
		const planUpdate: any = { editLockedByMcpUntil: null };
		if (edit.sectionId === "narrative-what-happened") {
			planUpdate.narrativeWhatHappened = edit.afterText;
		} else if (edit.sectionId === "value-preview") {
			planUpdate.valuePreviewNarrative = edit.afterText;
		}
		await tx.monthlyStrategyPlan.update({
			where: { id: plan.id },
			data: planUpdate,
		});

		// 3. Mark edit approved.
		await tx.planEdit.update({
			where: { id: edit.id },
			data: {
				approvedAt: new Date(),
				approvedByUserId: user.id,
			},
		});

		return { versionNum: versionCount + 1 };
	});

	return NextResponse.json({
		ok: true,
		editId,
		versionNum: result.versionNum,
		appliedTo: edit.sectionId,
	});
}
