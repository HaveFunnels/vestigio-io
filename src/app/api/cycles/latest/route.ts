import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/cycles/latest  (Wave 5 Fase 2)
//
// Discovery endpoint used by CycleProgressBanner when the page loads
// without a `?cycle=<id>` query param (reload, tab switch, direct URL).
// Returns the most recent AuditCycle for the caller's org matching any
// of the statuses in `?status=` (CSV, defaults to running,pending).
// ──────────────────────────────────────────────

const ALLOWED_STATUSES = new Set([
	"pending",
	"running",
	"complete",
	"failed",
]);

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const statusParam = url.searchParams.get("status") || "running,pending";
	const statuses = statusParam
		.split(",")
		.map((s) => s.trim())
		.filter((s) => ALLOWED_STATUSES.has(s));

	if (statuses.length === 0) {
		return NextResponse.json(
			{ message: "status param must contain at least one of running|pending|complete|failed" },
			{ status: 400 },
		);
	}

	// Wave 5 Fase 2 fix (#9): a user belonging to multiple orgs (e.g. via
	// invites) shouldn't see cycles from the wrong tenant. We resolve the
	// org via the same path resolveOrgContext uses on the server layout,
	// honoring the active_env cookie when present.
	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;

	let membershipOrgId: string | null = null;
	if (activeEnvId) {
		// Look up the org via the active env's membership relation. Belt-
		// and-suspenders: also re-verify the membership exists.
		const env = await prisma.environment.findUnique({
			where: { id: activeEnvId },
			select: { organizationId: true },
		});
		if (env) {
			const m = await prisma.membership.findFirst({
				where: { userId: user.id, organizationId: env.organizationId },
				select: { organizationId: true },
			});
			if (m) membershipOrgId = m.organizationId;
		}
	}
	if (!membershipOrgId) {
		// Fallback: most-recently-joined membership (matches resolveOrgContext
		// behavior when no active_env cookie is present).
		const m = await prisma.membership.findFirst({
			where: { userId: user.id },
			select: { organizationId: true },
			orderBy: { createdAt: "desc" },
		});
		if (!m) return NextResponse.json({ cycle: null });
		membershipOrgId = m.organizationId;
	}

	const cycle = await prisma.auditCycle.findFirst({
		where: {
			organizationId: membershipOrgId,
			status: { in: statuses },
			...(activeEnvId ? { environmentId: activeEnvId } : {}),
		},
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			status: true,
			cycleType: true,
			createdAt: true,
			completedAt: true,
			environmentId: true,
		},
	});

	return NextResponse.json({
		cycle: cycle
			? {
					id: cycle.id,
					status: cycle.status,
					cycleType: cycle.cycleType,
					environmentId: cycle.environmentId,
					createdAt: cycle.createdAt.toISOString(),
					completedAt: cycle.completedAt?.toISOString() ?? null,
				}
			: null,
	});
}
