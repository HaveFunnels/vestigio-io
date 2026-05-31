// ──────────────────────────────────────────────
// Wave 22.6 Step 9 — Plan RBAC helpers
//
// Owner-or-member can read, comment, toggle checkbox, assign.
// Admin (owner OR role='admin') can approve MCP edits, manually
// edit narrative, archive the plan.
//
// Source of truth: the Membership.role field on the plan's
// organization. Site-wide admins (User.role='ADMIN') get implicit
// admin on every plan they can see — the only path that hits this
// surface in prod is impersonation, where ops needs to debug
// without spinning up a fake org membership.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";

export interface PlanAccess {
	canRead: boolean;
	canComment: boolean;
	canApprove: boolean;
	canArchive: boolean;
	/** Distinguishes between "member" and "admin" for UI affordances
	    (banners, action buttons). Null when the user has no access. */
	role: "owner" | "admin" | "member" | "site_admin" | null;
}

const NO_ACCESS: PlanAccess = {
	canRead: false,
	canComment: false,
	canApprove: false,
	canArchive: false,
	role: null,
};

/**
 * Resolve a user's access to a specific plan. Resolves the plan's
 * org first, then checks Membership.role. Site admins (User.role =
 * 'ADMIN') bypass to canApprove + canArchive.
 */
export async function resolvePlanAccess(
	prisma: PrismaClient,
	planId: string,
	userId: string,
	userRole: string | null,
): Promise<PlanAccess> {
	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { id: planId },
		select: {
			environment: {
				select: {
					organizationId: true,
					organization: { select: { ownerId: true } },
				},
			},
		},
	});
	if (!plan?.environment) return NO_ACCESS;

	if (userRole === "ADMIN") {
		return {
			canRead: true,
			canComment: true,
			canApprove: true,
			canArchive: true,
			role: "site_admin",
		};
	}

	if (plan.environment.organization?.ownerId === userId) {
		return {
			canRead: true,
			canComment: true,
			canApprove: true,
			canArchive: true,
			role: "owner",
		};
	}

	const membership = await prisma.membership.findFirst({
		where: { userId, organizationId: plan.environment.organizationId },
		select: { role: true },
	});
	if (!membership) return NO_ACCESS;

	const role = membership.role;
	if (role === "admin") {
		return {
			canRead: true,
			canComment: true,
			canApprove: true,
			canArchive: false, // archive reserved for owner + site_admin
			role: "admin",
		};
	}
	if (role === "member") {
		return {
			canRead: true,
			canComment: true,
			canApprove: false,
			canArchive: false,
			role: "member",
		};
	}
	return NO_ACCESS;
}
