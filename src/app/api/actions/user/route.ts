import { NextResponse } from "next/server";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// GET /api/actions/user
//
// Lists the caller's UserActions — the persisted remediation items
// created via the chat Verify flow. Scoped to the active
// environment (resolved via the active_env cookie, matching
// /api/cycles/latest).
//
// Response shape:
//   { items: UserActionView[] }
//
// Ordered: status (pending → in_progress → done → dismissed), then
// createdAt desc.
// ──────────────────────────────────────────────

export async function GET(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ items: [] }, { status: 401 });
	}

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

	const actions = await prisma.userAction.findMany({
		where: {
			organizationId,
			...(environmentId ? { environmentId } : {}),
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
			createdAt: true,
			updatedAt: true,
		},
	});

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
		items: sorted.map((a) => ({
			id: a.id,
			title: a.title,
			description: a.description,
			remediation_steps: a.remediationSteps ? JSON.parse(a.remediationSteps) : null,
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
			created_at: a.createdAt.toISOString(),
			updated_at: a.updatedAt.toISOString(),
		})),
	});
}
