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

	// Pre-fetch for 404 + UI-friendly error; the authoritative
	// decision happens atomically inside the transaction below.
	const edit = await prisma.planEdit.findUnique({
		where: { id: editId },
		select: { id: true, planId: true, sectionId: true, afterText: true },
	});
	if (!edit || edit.planId !== plan.id) {
		return NextResponse.json({ message: "Edit not found for this plan" }, { status: 404 });
	}

	// Two concurrency hazards collapse into the same atomic transaction:
	//
	//   (a) Approve / reject race: two admins decide the same edit
	//       at once. Pre-check + tx-write isn't enough (Read Committed)
	//       — we use an UPDATE-WHERE-pending pattern so only one
	//       transaction claims the edit; the loser's updateMany returns
	//       count=0 and we throw EDIT_ALREADY_DECIDED → 409.
	//
	//   (b) versionNum race: two approves on different edits of the
	//       same plan can both compute versionNum = N+1 because COUNT
	//       isn't gap-locking. The @@unique([planId, versionNum])
	//       constraint blocks the duplicate at COMMIT time. We catch
	//       the unique-violation (P2002), throw VERSION_RACE, and the
	//       outer retry loop re-enters the tx with a fresh max+1.
	//       The claim of (a) is rolled back on retry, so it doesn't
	//       lock us out.
	//
	// Retries capped at 3 — race resolution converges in 1-2 in
	// practice, and we'd rather surface 500 than hot-loop.
	const MAX_TX_RETRIES = 3;
	let result: { versionNum: number } | null = null;
	let lastError: unknown = null;
	for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt++) {
		try {
			result = await prisma.$transaction(async (tx: any) => {
				// 1. Atomic claim. UPDATE WHERE id = X AND approvedAt
				//    IS NULL AND rejectedAt IS NULL → returns count 1
				//    on success, 0 if someone else already decided.
				const claim = await tx.planEdit.updateMany({
					where: {
						id: edit.id,
						planId: plan.id,
						approvedAt: null,
						rejectedAt: null,
					},
					data: {
						approvedAt: new Date(),
						approvedByUserId: user.id,
					},
				});
				if (claim.count === 0) {
					throw new Error("EDIT_ALREADY_DECIDED");
				}

				// 2. Compute versionNum from current max — survives
				//    concurrent inserts via the unique constraint
				//    catch below.
				const maxV = await tx.planVersion.aggregate({
					where: { planId: plan.id },
					_max: { versionNum: true },
				});
				const nextVersion = (maxV._max.versionNum ?? 0) + 1;

				// 3. Snapshot the plan. Throws P2002 (unique constraint)
				//    when another approver wins the versionNum race.
				await tx.planVersion.create({
					data: {
						planId: plan.id,
						versionNum: nextVersion,
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

				// 4. Apply edit. Only narrative columns have explicit
				//    writers today (Wave 22.6 follow-up: section-
				//    specific JSON writers).
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

				return { versionNum: nextVersion };
			});
			break;
		} catch (err) {
			lastError = err;
			const msg = err instanceof Error ? err.message : String(err);
			if (msg === "EDIT_ALREADY_DECIDED") {
				return NextResponse.json(
					{ message: "Edit already decided" },
					{ status: 409 },
				);
			}
			// Prisma P2002 surfaces as a message containing this substring;
			// also match the raw SQLSTATE for older driver versions.
			const isVersionRace =
				msg.includes("Unique constraint") ||
				msg.includes("PlanVersion_planId_versionNum") ||
				msg.includes("23505");
			if (isVersionRace && attempt < MAX_TX_RETRIES - 1) {
				continue;
			}
			break;
		}
	}

	if (!result) {
		console.error(
			`[approve edit ${editId}] failed after ${MAX_TX_RETRIES} attempts:`,
			lastError,
		);
		const msg = lastError instanceof Error ? lastError.message : String(lastError);
		if (msg.includes("Unique constraint")) {
			return NextResponse.json(
				{ message: "Concurrent approval detected, please retry" },
				{ status: 409 },
			);
		}
		return NextResponse.json(
			{ message: "Failed to approve edit" },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		ok: true,
		editId,
		versionNum: result.versionNum,
		appliedTo: edit.sectionId,
	});
}
