import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// PATCH /api/library/strategy/[month]/steps/[stepId]
//
// Phase 3 — inline edit for the user-managed fields of a
// PlanNextStep. Distinct from /edits/* (which queues PlanEdit
// proposals + needs approval) because these fields are direct
// state, not rewrites of LLM-generated prose:
//
//   - status         — todo | in_progress | in_review | done | blocked
//   - title          — short label, owner can fix typos / rephrase
//   - assigneeUserId — null = unassigned, else a member of the env's org
//   - dueAt          — ISO string | null
//
// Reasoning, procedureSteps, researchRefs are NOT writable here —
// those still go through the PlanEdit (admin-approval) pipeline so
// the prose chain stays controlled.
//
// Auth: any owner / member of the env's org. (Admin gating only
// applies to the PlanEdit prose flow; assigning a step or marking
// it done is everyday team work.)
//
// Body: { envId, status?, title?, assigneeUserId?, dueAt? }
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string; stepId: string }>;
}

const VALID_STATUSES = new Set([
	"todo",
	"in_progress",
	"in_review",
	"done",
	"blocked",
]);

export async function PATCH(request: Request, { params }: RouteParams) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const { month, stepId } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	let body: any = {};
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
	}

	const envId = body?.envId;
	if (typeof envId !== "string") {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// Validate the patch shape — only the four user-managed fields
	// are allowed; anything else is rejected so prose edits don't
	// slip through this endpoint.
	const patch: {
		status?: string;
		title?: string;
		assigneeUserId?: string | null;
		dueAt?: Date | null;
		doneAt?: Date | null;
	} = {};
	if (typeof body.status === "string") {
		if (!VALID_STATUSES.has(body.status)) {
			return NextResponse.json(
				{ message: `status must be one of ${[...VALID_STATUSES].join(", ")}` },
				{ status: 400 },
			);
		}
		patch.status = body.status;
		// Stamp doneAt on the same write so the UI can use it as a
		// reliable transition timestamp; clearing on un-done.
		patch.doneAt = body.status === "done" ? new Date() : null;
	}
	if (typeof body.title === "string") {
		const trimmed = body.title.trim();
		if (trimmed.length === 0 || trimmed.length > 240) {
			return NextResponse.json(
				{ message: "title must be 1-240 chars" },
				{ status: 400 },
			);
		}
		patch.title = trimmed;
	}
	if (body.assigneeUserId === null || typeof body.assigneeUserId === "string") {
		patch.assigneeUserId = body.assigneeUserId;
	}
	if (body.dueAt === null) {
		patch.dueAt = null;
	} else if (typeof body.dueAt === "string") {
		const d = new Date(body.dueAt);
		if (Number.isNaN(d.getTime())) {
			return NextResponse.json({ message: "dueAt must be ISO date" }, { status: 400 });
		}
		patch.dueAt = d;
	}
	if (Object.keys(patch).length === 0) {
		return NextResponse.json({ message: "No editable fields in body" }, { status: 400 });
	}

	// Resolve env → org → membership in one round-trip.
	const step = await prisma.planNextStep.findUnique({
		where: { id: stepId },
		select: {
			id: true,
			planId: true,
			plan: {
				select: {
					id: true,
					month: true,
					environmentId: true,
					environment: {
						select: {
							id: true,
							organization: {
								select: {
									ownerId: true,
									memberships: { select: { userId: true } },
								},
							},
						},
					},
				},
			},
		},
	});
	if (!step) {
		return NextResponse.json({ message: "Step not found" }, { status: 404 });
	}
	if (step.plan.environmentId !== envId) {
		// envId mismatch — refuse rather than silently use the step's
		// env, so a request that lies about its env doesn't succeed.
		return NextResponse.json({ message: "envId mismatch" }, { status: 400 });
	}
	if (step.plan.month !== month) {
		return NextResponse.json({ message: "month mismatch" }, { status: 400 });
	}
	const org = step.plan.environment?.organization;
	const userId = (user as any).id as string;
	const isOwner = org?.ownerId === userId;
	const isMember = !!org?.memberships?.find((m) => m.userId === userId);
	if (!isOwner && !isMember) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	// If assigning, the target user must also be a member of the org.
	if (patch.assigneeUserId) {
		const targetIsMember =
			org?.ownerId === patch.assigneeUserId ||
			!!org?.memberships?.find((m) => m.userId === patch.assigneeUserId);
		if (!targetIsMember) {
			return NextResponse.json(
				{ message: "Assignee must be a member of the org" },
				{ status: 400 },
			);
		}
	}

	const updated = await prisma.planNextStep.update({
		where: { id: stepId },
		data: patch,
		select: {
			id: true,
			status: true,
			title: true,
			assigneeUserId: true,
			dueAt: true,
			doneAt: true,
		},
	});

	return NextResponse.json({
		id: updated.id,
		status: updated.status,
		title: updated.title,
		assigneeUserId: updated.assigneeUserId,
		dueAt: updated.dueAt?.toISOString() ?? null,
		doneAt: updated.doneAt?.toISOString() ?? null,
	});
}
