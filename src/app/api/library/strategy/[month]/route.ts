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
	// Per-request diagnostic id so client failures can be correlated
	// to the server log line via the `requestId` field that's echoed
	// in every error response from this handler.
	const requestId = Math.random().toString(36).slice(2, 10);
	const tStart = Date.now();
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM", requestId }, { status: 400 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required", requestId }, { status: 400 });
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
			return NextResponse.json({ message: "Invalid export token", requestId }, { status: 401 });
		}
	}

	let user: { id: string; role?: string } | null = null;
	if (!exportToken) {
		const tAuthStart = Date.now();
		const authed = await isAuthorized();
		const authMs = Date.now() - tAuthStart;
		if (!authed) {
			// Diagnostic: capture whether the session was missing entirely vs
			// returned a user without an id, plus how long isAuthorized took
			// (so we can see if next-auth/JWT was warm or cold).
			console.warn(
				`[strategy-deny] ${requestId} reason=unauthorized envId=${envId} month=${month} authedShape=${
					authed === null ? "null" : authed === undefined ? "undefined" : typeof authed
				} authMs=${authMs}`,
			);
			return NextResponse.json({ message: "Unauthorized", requestId }, { status: 401 });
		}
		user = authed as any;
	}

	const tEnvStart = Date.now();
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
	const envMs = Date.now() - tEnvStart;
	if (!env) {
		console.warn(
			`[strategy-deny] ${requestId} reason=env-not-found envId=${envId} month=${month} userId=${user?.id ?? "n/a"} envMs=${envMs}`,
		);
		return NextResponse.json({ message: "Environment not found", requestId }, { status: 404 });
	}

	let isOwner = false;
	let myMembership: { userId: string; role: string } | undefined;
	let isOrgAdmin = false;
	let isSiteAdmin = false;
	if (user) {
		isOwner = env.organization?.ownerId === user.id;
		myMembership = env.organization?.memberships?.find((m) => m.userId === user!.id);
		const isMember = !!myMembership;
		if (!isOwner && !isMember) {
			// Full membership-decision dump. Lets us tell apart the three
			// realistic causes of an intermittent 403:
			//   (a) wrong envId — userId is sent but no membership in this
			//       env's org (cookie/URL race producing a foreign env).
			//   (b) stale session — user.id resolves to a value that doesn't
			//       match ownerId nor any membership (NextAuth JWT race).
			//   (c) orphan env — env.organization is null (DB inconsistency).
			console.warn(
				`[strategy-deny] ${requestId} reason=membership-failed envId=${envId} envDomain=${env.domain} month=${month} userId=${user.id} ownerId=${env.organization?.ownerId ?? "null"} hasOrg=${!!env.organization} memberCount=${env.organization?.memberships?.length ?? 0} memberIds=${JSON.stringify(env.organization?.memberships?.map((m) => m.userId) ?? [])} envMs=${envMs} totalMs=${Date.now() - tStart}`,
			);
			return NextResponse.json({ message: "Forbidden", requestId }, { status: 403 });
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
		// Reta-final fix: differentiate "no plan yet because first cycle
		// hasn't finished" from "no plan for this past month". The first
		// case is the brand-new-customer experience and deserves an
		// onboarding-friendly copy ("we are analyzing your site now");
		// the second is benign and shows the standard "not generated" UI.
		//
		// Cheap check: env has no MonthlyStrategyPlan rows at all = first
		// cycle still pending or running. Once they get their first plan,
		// subsequent missing-month requests fall through to the standard
		// 404 since plansEverGenerated > 0.
		const plansEverGenerated = await prisma.monthlyStrategyPlan.count({
			where: { environmentId: envId },
		});
		const status = plansEverGenerated === 0 ? "awaiting_first_cycle" : "missing";
		return NextResponse.json(
			{ message: "Plan not generated for this month", status },
			{ status: 404 },
		);
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

	// Reta-final: per-step confidence aggregation. Resolved from the
	// linked Finding rows' inferenceKey (each Finding carries the
	// engine-side confidence 0-100). Bucketed as low/medium/high so
	// the UI shows a "calibração X" badge only when not high — the
	// goal is to flag low-trust steps, not annotate the obvious.
	//
	// Lookup is by inferenceKey because that's what PlanNextStep
	// persists (Finding.id rotates per cycle but inferenceKey is stable
	// across cycles). For each step, we pick the latest open Finding
	// rows matching its keys + this environment, then average their
	// confidence values.
	const allFindingKeys = Array.from(
		new Set(
			plan.nextSteps.flatMap(
				(s) => ((s as any).linkedFindingRefsJson as string[]) ?? [],
			),
		),
	);
	const findingConfidences = allFindingKeys.length
		? await prisma.finding.findMany({
			where: {
				environmentId: plan.environmentId,
				inferenceKey: { in: allFindingKeys },
				status: { in: ["created", "confirmed"] },
			},
			select: { inferenceKey: true, confidence: true },
			orderBy: { createdAt: "desc" },
		})
		: [];
	const confidenceByKey = new Map<string, number[]>();
	for (const f of findingConfidences) {
		const arr = confidenceByKey.get(f.inferenceKey) ?? [];
		arr.push(f.confidence);
		confidenceByKey.set(f.inferenceKey, arr);
	}
	// Reta-final: verification criteria. REMEDIATION_CATALOG carries
	// customer-facing `verification_notes` + ETA per inferenceKey, but
	// they were only surfaced via the MCP. The Plan view now exposes
	// them so the customer reads "Como saber que está fixed?" right
	// where they decide to act. Lookup is per-step (use the first
	// linkedFinding inferenceKey that catalog knows about).
	const { REMEDIATION_CATALOG, getDynamicRemediation } = await import(
		"../../../../../../packages/projections/remediation-catalog"
	);
	function verificationForStep(keys: string[]): {
		notes: string;
		etaSeconds: number | null;
		strategy: string;
	} | null {
		for (const k of keys) {
			const entry = REMEDIATION_CATALOG[k] ?? getDynamicRemediation(k);
			if (entry?.verification_notes) {
				return {
					notes: entry.verification_notes,
					etaSeconds: entry.verification_eta_seconds,
					strategy: entry.verification_strategy,
				};
			}
		}
		return null;
	}

	function confidenceTierForStep(keys: string[]): "low" | "medium" | "high" | null {
		const samples: number[] = [];
		for (const k of keys) {
			const arr = confidenceByKey.get(k) ?? [];
			// Use the latest row's confidence per key — most-recent cycle
			// is the customer-relevant signal.
			if (arr.length > 0) samples.push(arr[0]);
		}
		if (samples.length === 0) return null;
		const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
		if (avg >= 70) return "high";
		if (avg >= 50) return "medium";
		return "low";
	}

	// Reta-final: pack distribution visual. Narrative previously stated
	// "tema dominante: consistência da mensagem, 44%" buried in prose.
	// Customer reads slower than they scan a 6px bar. This block surfaces
	// the same insight visually next to the narrative.
	const monthStartForPlan = new Date(`${plan.month}-01T00:00:00Z`);
	const monthEndForPlan = new Date(
		Date.UTC(monthStartForPlan.getUTCFullYear(), monthStartForPlan.getUTCMonth() + 1, 1),
	);
	const packRowsRaw = await prisma.finding
		.groupBy({
			by: ["pack"],
			where: {
				environmentId: plan.environmentId,
				polarity: { in: ["negative", "neutral"] },
				status: { in: ["created", "confirmed"] },
				statusChangedAt: { lt: monthEndForPlan },
			},
			_count: { id: true },
			orderBy: { _count: { id: "desc" } },
		})
		.catch(() => null);
	const packRows: Array<{ pack: string; count: number }> = Array.isArray(packRowsRaw)
		? packRowsRaw.map((r) => ({ pack: r.pack, count: r._count.id }))
		: [];
	const packTotal = packRows.reduce((a, r) => a + r.count, 0);
	const PACK_LABEL_PTBR: Record<string, string> = {
		copy_alignment: "consistência da mensagem",
		scale_readiness: "preparo para escala",
		trust: "sinais de confiança",
		revenue: "captura de receita",
		chargeback: "risco de chargeback",
		saas: "ciclo SaaS",
		behavioral: "comportamento do visitante",
	};
	const packDistribution = packTotal > 0
		? packRows
			.slice(0, 6) // top 6 — beyond that the bar slices vanish
			.map((r) => {
				const k = r.pack.replace(/_pack$/, "");
				return {
					pack: r.pack,
					label: PACK_LABEL_PTBR[k] ?? k.replace(/_/g, " "),
					count: r.count,
					sharePct: Math.round((r.count / packTotal) * 1000) / 10,
				};
			})
		: [];

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
		thesisOfMonth: (plan as any).thesisOfMonth ?? null,
		continuity: (plan as any).continuityJson ?? null,
		crossCustomerPattern: (plan as any).crossCustomerPatternJson ?? null,
		copyLens: (plan as any).copyLensJson ?? null,
		competitor: (plan as any).competitorJson ?? null,
		impersonators: (plan as any).impersonatorsJson ?? null,
		maps: (plan as any).mapsJson ?? null,
		packDistribution,
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
			const findingRefs =
				((s as any).linkedFindingRefsJson as string[]) ?? [];
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
				linkedFindingRefs: findingRefs,
				combinedImpact: {
					min: Math.round(impactMin),
					max: Math.round(impactMax),
					midpoint: Math.round(impactMidpoint),
				},
				/** Reta-final: aggregated confidence tier across the linked
				 *  findings. Null when no findings could be resolved.
				 *  UI renders a badge only when "low" or "medium" — high
				 *  is the default expectation and doesn't need annotation. */
				confidenceTier: confidenceTierForStep(findingRefs),
				/** Reta-final: verification criteria pulled from the
				 *  catalog ("Como saber que está fixed?"). Null when no
				 *  catalog entry matched (rare — most live keys do). */
				verification: verificationForStep(findingRefs),
				status: s.status,
				assigneeUserId: s.assigneeUserId,
				assigneeName: null,
				dueAt: s.dueAt?.toISOString() ?? null,
				commentsCount: commentsByStepId.get(s.id) ?? 0,
			};
		}),
	});
}
