import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// GET /api/onboarding/progress
//
// Computes the 4-step welcome checklist from existing DB state — no
// new tables, no new event logging. Each item is a small targeted
// query so the whole endpoint resolves in one round-trip via
// Promise.all.
//
// Items (ordered by leverage, most-impactful first):
//   1. audit_complete      — any AuditCycle with status=complete
//   2. first_action        — any UserAction with status in [in_progress, done]
//   3. invite_teammate     — any OrgInvite for the org
//   4. alerts_configured   — NotificationPreference row exists for the user
//
// Returns { items, completed, total } so the client can render
// progress + decide whether to auto-dismiss on 100%.
// ──────────────────────────────────────────────

export const GET = withErrorTracking(async function GET() {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 404 });
	}

	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;
	const environment = activeEnvId
		? await prisma.environment.findFirst({
				where: { id: activeEnvId, organizationId: membership.organizationId },
				select: { id: true },
			})
		: await prisma.environment.findFirst({
				where: { organizationId: membership.organizationId },
				orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
				select: { id: true },
			});
	if (!environment) {
		return NextResponse.json({ message: "No environment" }, { status: 404 });
	}

	const [auditCycle, actionTouched, invite, prefs] = await Promise.all([
		prisma.auditCycle.findFirst({
			where: { environmentId: environment.id, status: "complete" },
			select: { id: true },
		}),
		prisma.userAction.findFirst({
			where: {
				environmentId: environment.id,
				status: { in: ["in_progress", "done"] },
			},
			select: { id: true },
		}),
		prisma.orgInvite.findFirst({
			where: { organizationId: membership.organizationId },
			select: { id: true },
		}),
		prisma.notificationPreference.findUnique({
			where: { userId: user.id },
			select: { id: true },
		}),
	]);

	const items = [
		{ id: "audit_complete", completed: !!auditCycle },
		{ id: "first_action", completed: !!actionTouched },
		{ id: "invite_teammate", completed: !!invite },
		{ id: "alerts_configured", completed: !!prefs },
	];
	const completed = items.filter((i) => i.completed).length;

	return NextResponse.json({ items, completed, total: items.length });
}, { endpoint: "/api/onboarding/progress", method: "GET" });
