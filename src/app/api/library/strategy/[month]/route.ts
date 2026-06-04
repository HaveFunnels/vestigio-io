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
	const { month } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	// Wave 22.6 Step 10 — accept an HMAC export token as alternative
	// auth so the headless chromium that generates the PDF can fetch
	// the plan without a session cookie. Token is bound to the planId
	// (resolved below) so it only works for the plan that minted it.
	//
	// Pre-check the token shape + expiry BEFORE touching the DB so a
	// malformed token can't be used to probe (envId, month) existence
	// via 200/404 timing. HMAC verification still happens after the
	// plan is loaded — both gates must pass.
	const exportToken = url.searchParams.get("export_token");
	if (exportToken) {
		const { isExportTokenWellFormed } = await import("@/libs/strategy-export-token");
		if (!isExportTokenWellFormed(exportToken)) {
			return NextResponse.json({ message: "Invalid export token" }, { status: 401 });
		}
	}

	let user: { id: string; role?: string } | null = null;
	if (!exportToken) {
		const authed = await isAuthorized();
		if (!authed) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		user = authed as any;
	}

	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			domain: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true, role: true } },
				},
			},
		},
	});
	if (!env) return NextResponse.json({ message: "Environment not found" }, { status: 404 });

	let isOwner = false;
	let myMembership: { userId: string; role: string } | undefined;
	let isOrgAdmin = false;
	let isSiteAdmin = false;
	if (user) {
		isOwner = env.organization?.ownerId === user.id;
		myMembership = env.organization?.memberships?.find((m) => m.userId === user!.id);
		const isMember = !!myMembership;
		if (!isOwner && !isMember) {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}
		isOrgAdmin =
			isOwner || myMembership?.role === "admin" || myMembership?.role === "owner";
		isSiteAdmin = (user as any).role === "ADMIN";
	}
	const canApprove = isOrgAdmin || isSiteAdmin;

	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { environmentId_month: { environmentId: envId, month } },
		include: { nextSteps: { orderBy: { order: "asc" } } },
	});
	if (!plan) {
		return NextResponse.json({ message: "Plan not generated for this month" }, { status: 404 });
	}
	// Token path needs the planId to verify — done now that we have it.
	if (exportToken) {
		const { verifyExportToken } = await import("@/libs/strategy-export-token");
		if (!verifyExportToken(exportToken, plan.id)) {
			return NextResponse.json({ message: "Invalid export token" }, { status: 401 });
		}
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

	// Wave 22.6 Step 9 — pending MCP edits + comments (full rows,
	// not just counts) so the UI can render the inline propose
	// banner + comment threads without a second round trip. Author
	// names resolve in a single batched lookup.
	const [pendingEditsRaw, commentsRaw] = await Promise.all([
		prisma.planEdit.findMany({
			where: {
				planId: plan.id,
				approvedAt: null,
				rejectedAt: null,
			},
			orderBy: { proposedAt: "asc" },
			select: {
				id: true,
				sectionId: true,
				editorKind: true,
				editorUserId: true,
				beforeText: true,
				afterText: true,
				reason: true,
				proposedAt: true,
			},
		}),
		// Wave 22.6 follow-up — cap comments at 200 most-recent.
		// A plan that's been in the library for months with heavy
		// @vestigio usage could otherwise return thousands of rows
		// in a single response. We fetch DESC + reverse so the UI
		// still gets ascending order (oldest first) for thread
		// rendering. hasMoreComments lets the client know to
		// surface a "Load earlier" affordance.
		prisma.planComment.findMany({
			where: { planId: plan.id, deletedAt: null },
			orderBy: { createdAt: "desc" },
			take: 201, // 200 + 1 sentinel to detect overflow
			select: {
				id: true,
				sectionId: true,
				authorId: true,
				authorKind: true,
				body: true,
				createdAt: true,
				editedAt: true,
			},
		}),
	]);
	const authorIds = Array.from(
		new Set(
			[...commentsRaw.map((c) => c.authorId), ...pendingEditsRaw.map((e) => e.editorUserId)].filter(
				(id): id is string => !!id,
			),
		),
	);
	const authors = authorIds.length
		? await prisma.user.findMany({
			where: { id: { in: authorIds } },
			select: { id: true, name: true, email: true },
		})
		: [];
	const authorById = new Map(authors.map((u) => [u.id, u]));

	const pendingEdits = pendingEditsRaw.map((e) => ({
		id: e.id,
		sectionId: e.sectionId,
		editorKind: e.editorKind,
		editorName: e.editorUserId
			? authorById.get(e.editorUserId)?.name ?? "Membro"
			: "Vestigio",
		beforeText: e.beforeText,
		afterText: e.afterText,
		reason: e.reason,
		proposedAt: e.proposedAt.toISOString(),
	}));
	// Detect overflow + slice back to 200, then reverse to ASC
	// order for the UI (oldest first).
	const hasMoreComments = commentsRaw.length > 200;
	const commentsCapped = hasMoreComments ? commentsRaw.slice(0, 200) : commentsRaw;
	commentsCapped.reverse();
	const comments = commentsCapped.map((c) => ({
		id: c.id,
		sectionId: c.sectionId,
		authorKind: c.authorKind,
		authorName: c.authorId
			? authorById.get(c.authorId)?.name ?? "Membro"
			: "Vestigio",
		body: c.body,
		createdAt: c.createdAt.toISOString(),
		editedAt: c.editedAt?.toISOString() ?? null,
	}));

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
		// Wave 22.6 Step 9 — collaboration state. UI consumers (the
		// inline PlanEditBanner + PlanCommentThread) read this directly
		// so they don't need a second round-trip.
		pendingEdits,
		comments,
		hasMoreComments,
		viewerCanApprove: canApprove,
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
