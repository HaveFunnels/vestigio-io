import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/library/strategy/[month]?envId=<id>
//
// Returns the persisted Strategy Plan for the given env + month.
// Shape matches src/components/strategy/types.ts (the UI contract)
// so StrategyPlanPanel renders it unchanged.
//
// 404 when the plan hasn't been generated yet. 423 (locked) when
// the plan is still in `status='generating'` — the route can show
// a loading state and poll. 200 when ready.
//
// Auth: owner-or-member of the env's org.
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const { month } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// Auth check — same pattern as the index endpoint.
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			domain: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	const isOwner = env.organization?.ownerId === user.id;
	const isMember = env.organization?.memberships?.some((m) => m.userId === user.id) ?? false;
	if (!isOwner && !isMember) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { environmentId_month: { environmentId: envId, month } },
		include: { nextSteps: { orderBy: { order: "asc" } } },
	});
	if (!plan) {
		return NextResponse.json({ message: "Plan not generated for this month" }, { status: 404 });
	}
	if (plan.status === "generating") {
		return NextResponse.json(
			{ message: "Plan still generating", status: "generating" },
			{ status: 423 },
		);
	}

	// Derive cycleNumber + combinedImpact from related rows. These
	// aren't persisted on the plan (intentional — schema stays lean,
	// derivable fields go through joins) so re-pricing/re-ordering of
	// actions in the queue reflects in the next page load without
	// regen of the whole plan.
	const monthEnd = new Date(
		Date.UTC(
			parseInt(month.split("-")[0], 10),
			parseInt(month.split("-")[1], 10),
			1,
		),
	);
	const cycleNumber = await prisma.auditCycle.count({
		where: {
			environmentId: envId,
			status: "complete",
			createdAt: { lt: monthEnd },
		},
	});

	// Resolve linked Action impacts in a single round-trip rather
	// than N queries inside the map below.
	const allActionIds = plan.nextSteps.flatMap(
		(s) => (s.linkedActionRefsJson as string[]) ?? [],
	);
	const actionImpacts = allActionIds.length
		? await prisma.action.findMany({
			where: { id: { in: allActionIds } },
			select: { id: true, impactMin: true, impactMax: true, impactMidpoint: true },
		})
		: [];
	const impactById = new Map(
		actionImpacts.map((a) => [a.id, a]),
	);

	// Comment counts in one query (group by step section).
	const commentRows = await prisma.planComment.groupBy({
		by: ["sectionId"],
		where: { planId: plan.id, deletedAt: null },
		_count: { id: true },
	});
	const commentsByStepId = new Map<string, number>();
	for (const row of commentRows) {
		const m = row.sectionId.match(/^next-step:(.+)$/);
		if (m) commentsByStepId.set(m[1], row._count.id);
	}

	const hero = plan.heroMetricsJson as any;
	const buyerSegments = plan.buyerSegmentsJson as any;
	const memoryRollups = plan.memoryRollupsJson as any;
	const valuePreview = plan.valuePreviewJson as any;

	return NextResponse.json({
		id: plan.id,
		environmentId: plan.environmentId,
		envDomain: env.domain,
		month: plan.month,
		locale: plan.locale,
		generatedAt: plan.generatedAt.toISOString(),
		lastRegenerated: plan.lastRegenerated.toISOString(),
		status: plan.status,
		cycleNumber,
		heroMetrics: hero,
		buyerSegments,
		narrativeWhatHappened: plan.narrativeWhatHappened,
		valuePreviewNarrative: plan.valuePreviewNarrative,
		valuePreview,
		memoryRollups,
		nextSteps: plan.nextSteps.map((s) => {
			const refs = (s.linkedActionRefsJson as string[]) ?? [];
			let impactMin = 0;
			let impactMax = 0;
			let impactMidpoint = 0;
			for (const id of refs) {
				const a = impactById.get(id);
				if (!a) continue;
				impactMin += a.impactMin ?? 0;
				impactMax += a.impactMax ?? 0;
				impactMidpoint += a.impactMidpoint ?? 0;
			}
			return {
				id: s.id,
				order: s.order,
				title: s.title,
				reasoning: s.reasoning,
				procedureSteps: (s.procedureStepsJson as string[]) ?? [],
				researchRefs: (s.researchRefsJson as Array<{ title: string; url?: string }>) ?? [],
				estimatedEffort: s.estimatedEffort,
				suggestedOwner: s.suggestedOwner,
				linkedActionRefs: refs,
				combinedImpact: {
					min: Math.round(impactMin),
					max: Math.round(impactMax),
					midpoint: Math.round(impactMidpoint),
				},
				status: s.status,
				assigneeUserId: s.assigneeUserId,
				assigneeName: null,
				dueAt: s.dueAt?.toISOString() ?? null,
				commentsCount: commentsByStepId.get(s.id) ?? 0,
			};
		}),
	});
}
