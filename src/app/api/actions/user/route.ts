import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// GET /api/actions/user?scope=mine|all
//
// Lists UserActions in the active environment. The optional `scope`
// query param controls assignee filtering:
//
//   - scope=mine  → assignedToUserId = caller (or, for legacy rows
//                   created before Wave-22.6 review fix UC4 where
//                   assignedToUserId is NULL, createdByUserId = caller).
//   - scope=all   → no assignee filter (default; backwards compat with
//                   the pre-fix behaviour where /app/actions showed
//                   everyone's actions).
//
// Response shape: { items: UserActionView[], scope }
// Ordered: status (pending → in_progress → done → dismissed), then
// createdAt desc.
// ──────────────────────────────────────────────

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ items: [] }, { status: 401 });
	}

	const url = new URL(request.url);
	const scope = url.searchParams.get("scope") === "mine" ? "mine" : "all";

	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;

	let organizationId: string | null = null;
	let environmentId: string | null = null;

	if (activeEnvId) {
		const env = await prisma.environment.findUnique({
			where: { id: activeEnvId },
			select: { id: true, organizationId: true },
		});
		if (env) {
			const m = await prisma.membership.findFirst({
				where: { userId: user.id, organizationId: env.organizationId },
				select: { organizationId: true },
			});
			if (m) {
				organizationId = env.organizationId;
				environmentId = env.id;
			}
		}
	}

	if (!organizationId) {
		const m = await prisma.membership.findFirst({
			where: { userId: user.id },
			select: { organizationId: true },
			orderBy: { createdAt: "desc" },
		});
		if (!m) return NextResponse.json({ items: [] });
		organizationId = m.organizationId;
	}

	const mineFilter =
		scope === "mine"
			? {
					OR: [
						{ assignedToUserId: user.id },
						// Backfill: legacy rows pre-Wave-22.6 review fix may
						// have assignedToUserId=NULL even though the migration
						// backfilled createdByUserId — keep this OR for safety
						// against rows created by a path that bypassed the
						// migration backfill.
						{ assignedToUserId: null, createdByUserId: user.id },
					],
				}
			: {};

	const actions = await prisma.userAction.findMany({
		where: {
			organizationId,
			...(environmentId ? { environmentId } : {}),
			...mineFilter,
		},
		orderBy: [{ createdAt: "desc" }],
		select: {
			id: true,
			title: true,
			description: true,
			remediationSteps: true,
			estimatedEffortHours: true,
			status: true,
			findingId: true,
			verifiedViaConversationId: true,
			verifiedAt: true,
			doneAt: true,
			notes: true,
			baselineImpactMidpoint: true,
			baselineImpactMin: true,
			baselineImpactMax: true,
			baselineCycleRef: true,
			verifiedResolvedAt: true,
			verificationCycleRef: true,
			createdByUserId: true,
			assignedToUserId: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	// Resolve assignee + creator display info in one round-trip.
	const userIds = new Set<string>();
	for (const a of actions) {
		userIds.add(a.createdByUserId);
		if (a.assignedToUserId) userIds.add(a.assignedToUserId);
	}
	const users = userIds.size
		? await prisma.user.findMany({
				where: { id: { in: [...userIds] } },
				select: { id: true, name: true, email: true },
			})
		: [];
	const userById = new Map(users.map((u) => [u.id, u]));

	// Client-side-friendly ordering: status priority, then recency.
	const statusOrder: Record<string, number> = {
		pending: 0,
		in_progress: 1,
		done: 2,
		dismissed: 3,
	};
	const sorted = [...actions].sort((a, b) => {
		const sa = statusOrder[a.status] ?? 9;
		const sb = statusOrder[b.status] ?? 9;
		if (sa !== sb) return sa - sb;
		return b.createdAt.getTime() - a.createdAt.getTime();
	});

	return NextResponse.json({
		scope,
		items: sorted.map((a) => {
			const creator = userById.get(a.createdByUserId) ?? null;
			const assignee = a.assignedToUserId
				? userById.get(a.assignedToUserId) ?? null
				: null;
			return {
				id: a.id,
				title: a.title,
				description: a.description,
				remediation_steps: a.remediationSteps
					? JSON.parse(a.remediationSteps)
					: null,
				estimated_effort_hours: a.estimatedEffortHours,
				status: a.status,
				finding_id: a.findingId,
				verified_via_conversation_id: a.verifiedViaConversationId,
				verified_at: a.verifiedAt?.toISOString() ?? null,
				done_at: a.doneAt?.toISOString() ?? null,
				notes: a.notes,
				baseline_impact_midpoint: a.baselineImpactMidpoint,
				baseline_impact_min: a.baselineImpactMin,
				baseline_impact_max: a.baselineImpactMax,
				baseline_cycle_ref: a.baselineCycleRef,
				verified_resolved_at: a.verifiedResolvedAt?.toISOString() ?? null,
				verification_cycle_ref: a.verificationCycleRef,
				// Wave-22.6 review fix: surface assignee + creator so the
				// UI can render "Mine"/"Theirs" affordances and the
				// assignee dropdown.
				created_by: creator
					? { id: creator.id, name: creator.name, email: creator.email }
					: null,
				assigned_to: assignee
					? { id: assignee.id, name: assignee.name, email: assignee.email }
					: null,
				created_at: a.createdAt.toISOString(),
				updated_at: a.updatedAt.toISOString(),
			};
		}),
	});
}
