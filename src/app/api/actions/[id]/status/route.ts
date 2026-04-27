import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { blockIfImpersonating } from "@/libs/impersonation-guard";

// ──────────────────────────────────────────────
// PATCH /api/actions/[id]/status
//
// Persist opportunity status transitions. The [id] param is
// the actionKey (matches ActionProjection.id / opportunity_key).
//
// Body: { status: OpportunityStatus, environmentId: string }
//
// Valid transitions:
//   identified/sized → accepted, archived
//   accepted → implemented, sized (back)
//   implemented → verified (auto or manual)
//   verified → accepted (reopen)
//   archived → identified (reopen)
// ──────────────────────────────────────────────

const VALID_STATUSES = new Set([
	"identified",
	"sized",
	"accepted",
	"implemented",
	"verified",
	"archived",
]);

const VALID_TRANSITIONS: Record<string, string[]> = {
	identified: ["accepted", "archived"],
	sized: ["accepted", "archived"],
	accepted: ["implemented", "sized"],
	implemented: ["verified"],
	verified: ["accepted"],
	archived: ["identified"],
};

export const PATCH = withErrorTracking(
	async function PATCH(
		request: Request,
		{ params }: { params: Promise<{ id: string }> },
	) {
		const impersonationBlock = await blockIfImpersonating();
		if (impersonationBlock) return impersonationBlock;

		const session = await getServerSession(authOptions);
		const userId = (session?.user as any)?.id;
		if (!session?.user || !userId) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const { id: actionKey } = await params;
		if (!actionKey) {
			return NextResponse.json(
				{ message: "Missing action ID" },
				{ status: 400 },
			);
		}

		let body: { status?: string; environmentId?: string };
		try {
			body = await request.json();
		} catch {
			return NextResponse.json(
				{ message: "Invalid body" },
				{ status: 400 },
			);
		}

		const targetStatus = body.status;
		const environmentId = body.environmentId;

		if (!targetStatus || !VALID_STATUSES.has(targetStatus)) {
			return NextResponse.json(
				{ message: `Invalid status: ${targetStatus}` },
				{ status: 400 },
			);
		}

		if (!environmentId) {
			return NextResponse.json(
				{ message: "environmentId is required" },
				{ status: 400 },
			);
		}

		// Verify user has access to this environment
		const env = await prisma.environment.findUnique({
			where: { id: environmentId },
			select: { organizationId: true },
		});
		if (!env) {
			return NextResponse.json(
				{ message: "Environment not found" },
				{ status: 404 },
			);
		}

		const membership = await prisma.membership.findFirst({
			where: { userId, organizationId: env.organizationId },
			select: { id: true },
		});
		if (!membership) {
			return NextResponse.json(
				{ message: "Forbidden" },
				{ status: 403 },
			);
		}

		// Check current status for transition validation
		const existing = await prisma.opportunityTracking.findUnique({
			where: {
				actionKey_environmentId: { actionKey, environmentId },
			},
		});

		const currentStatus = existing?.status || "identified";
		const allowedNext = VALID_TRANSITIONS[currentStatus] || [];

		if (!allowedNext.includes(targetStatus)) {
			return NextResponse.json(
				{
					message: `Cannot transition from '${currentStatus}' to '${targetStatus}'`,
					allowed: allowedNext,
				},
				{ status: 422 },
			);
		}

		// Upsert the tracking record
		const tracking = await prisma.opportunityTracking.upsert({
			where: {
				actionKey_environmentId: { actionKey, environmentId },
			},
			update: {
				status: targetStatus,
				updatedBy: userId,
			},
			create: {
				actionKey,
				environmentId,
				status: targetStatus,
				updatedBy: userId,
			},
		});

		return NextResponse.json({
			actionKey: tracking.actionKey,
			status: tracking.status,
			updatedAt: tracking.updatedAt.toISOString(),
		});
	},
	{ endpoint: "/api/actions/[id]/status", method: "PATCH" },
);
