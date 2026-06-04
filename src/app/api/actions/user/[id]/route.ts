import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// PATCH /api/actions/user/[id]
//
// Lifecycle + assignment transitions for UserAction. Validates that
// the caller is a member of the action's org. Status transitions are
// open (any → any; client drives the UX). Reassignment requires the
// new assignee to also be a member of the same org.
//
// Body:
//   { status?: 'pending'|'in_progress'|'done'|'dismissed',
//     notes?: string (max 5000),
//     assigned_to_user_id?: string | null  // Wave-22.6 review fix UC4 }
// ──────────────────────────────────────────────

const ALLOWED_STATUSES = new Set([
	"pending",
	"in_progress",
	"done",
	"dismissed",
]);

const MAX_NOTES = 5_000;

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await getServerSession(authOptions);
	const userId = (session?.user as any)?.id;
	if (!session?.user || !userId) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { id: actionId } = await params;
	if (!actionId) {
		return NextResponse.json({ message: "id is required" }, { status: 400 });
	}

	let body: { status?: string; notes?: string; assigned_to_user_id?: string | null };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid body" }, { status: 400 });
	}

	const action = await prisma.userAction.findUnique({
		where: { id: actionId },
		select: {
			id: true,
			organizationId: true,
			environmentId: true,
			findingId: true,
			status: true,
			// Wave 22.6 Step 6 — needed to detect the "critical resolve"
			// re-narrative trigger after status flips to 'done'.
			baselineImpactMidpoint: true,
		},
	});
	if (!action) {
		return NextResponse.json({ message: "Not found" }, { status: 404 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId, organizationId: action.organizationId },
		select: { id: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const updateData: Record<string, unknown> = {};

	if (typeof body.status === "string") {
		if (!ALLOWED_STATUSES.has(body.status)) {
			return NextResponse.json(
				{ message: `Invalid status: ${body.status}` },
				{ status: 400 },
			);
		}
		updateData.status = body.status;
		if (body.status === "done" && action.status !== "done") {
			updateData.doneAt = new Date();
		}
	}

	if (typeof body.notes === "string") {
		updateData.notes = body.notes.slice(0, MAX_NOTES);
	}

	// Reassignment — null clears the assignee, a string assigns. Both
	// require the assignee to be a member of the action's org (no
	// cross-org leak via a guessed user id).
	if (body.assigned_to_user_id !== undefined) {
		if (body.assigned_to_user_id === null) {
			updateData.assignedToUserId = null;
		} else if (typeof body.assigned_to_user_id === "string") {
			const target = body.assigned_to_user_id;
			const targetMembership = await prisma.membership.findFirst({
				where: { userId: target, organizationId: action.organizationId },
				select: { id: true },
			});
			if (!targetMembership) {
				return NextResponse.json(
					{ message: "Assignee is not a member of this organization" },
					{ status: 400 },
				);
			}
			updateData.assignedToUserId = target;
		} else {
			return NextResponse.json(
				{ message: "Invalid assigned_to_user_id" },
				{ status: 400 },
			);
		}
	}

	if (Object.keys(updateData).length === 0) {
		return NextResponse.json(
			{ message: "Nothing to update" },
			{ status: 400 },
		);
	}

	const updated = await prisma.userAction.update({
		where: { id: actionId },
		data: updateData,
		select: {
			id: true,
			status: true,
			doneAt: true,
			notes: true,
			assignedToUserId: true,
			updatedAt: true,
		},
	});

	// Wave 22.6 Step 6 — fire re-narrative trigger when a critical
	// high-impact action flips to 'done'. Best-effort + async fire-
	// and-forget so the HTTP response isn't blocked by the regen.
	// Threshold: severity=critical AND baselineImpactMidpoint > 5000
	// (R$ 5k/mo per spec §5 trigger table).
	if (
		body.status === "done" &&
		action.status !== "done" &&
		action.environmentId &&
		(action.baselineImpactMidpoint ?? 0) > 5000
	) {
		// Resolve the linked Finding's severity to gate on "critical".
		void (async () => {
			try {
				const finding = await prisma.finding.findFirst({
					where: { id: action.findingId },
					select: { severity: true },
				});
				if (finding?.severity !== "critical") return;
				const { maybeTriggerRenarrative } = await import(
					"../../../../../../packages/strategy-plan"
				);
				await maybeTriggerRenarrative({
					prisma,
					trigger: "critical_resolve",
					environmentId: action.environmentId!,
				});
			} catch (err) {
				console.warn(
					"[api/actions/user/PATCH] re-narrative trigger failed:",
					err instanceof Error ? err.message : err,
				);
			}
		})();
	}

	return NextResponse.json({
		id: updated.id,
		status: updated.status,
		done_at: updated.doneAt?.toISOString() ?? null,
		notes: updated.notes,
		assigned_to_user_id: updated.assignedToUserId,
		updated_at: updated.updatedAt.toISOString(),
	});
}
