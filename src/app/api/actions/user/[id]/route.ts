import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// PATCH /api/actions/user/[id]
//
// Lifecycle transitions for UserAction. Validates that the caller
// owns the action (via membership in the action's org). Status
// transitions allowed: any → any (client drives the UX, server
// stamps transition timestamps).
//
// Body:
//   { status?: 'pending'|'in_progress'|'done'|'dismissed',
//     notes?: string (max 5000) }
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

	let body: { status?: string; notes?: string };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid body" }, { status: 400 });
	}

	const action = await prisma.userAction.findUnique({
		where: { id: actionId },
		select: { id: true, organizationId: true, status: true },
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
			updatedAt: true,
		},
	});

	return NextResponse.json({
		id: updated.id,
		status: updated.status,
		done_at: updated.doneAt?.toISOString() ?? null,
		notes: updated.notes,
		updated_at: updated.updatedAt.toISOString(),
	});
}
