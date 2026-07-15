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
					// Peer-line source: businessModel drives cohort selection
					// (ecommerce | saas → saas-b2b | infoproduct → infoprodutos).
					// Null-safe: no profile → no peer lines.
					businessProfile: { select: { businessModel: true } },
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

	// Resolve linked Action FULL records server-side. Plan API now
	// returns embedded action objects so the drawer doesn't need to
	// cross-reference MCP's current-cycle snapshot (which excludes
	// older-cycle IDs the plan still links to). Action rows persist
	// across cycle rotations — querying directly by id always works.
	//
	// Previous bug: ActionListBody filtered useMcpData().actions by id,
	// and MCP only carries the current cycle. Plan generated in cycle N
	// referenced Action rows whose IDs were from that cycle; by cycle
	// N+1, drawer showed "Nenhuma ação encontrada" even though the rows
	// were still in the DB.
	const allActionIds = plan.nextSteps.flatMap(
		(s) => (s.linkedActionRefsJson as string[]) ?? [],
	);
	const linkedActionRows = allActionIds.length
		? await prisma.action.findMany({
			where: { id: { in: allActionIds } },
			select: {
				id: true,
				severity: true,
				category: true,
				impactMin: true,
				impactMax: true,
				impactMidpoint: true,
				decisionKey: true,
				projection: true,
			},
		})
		: [];
	type LinkedAction = {
		id: string;
		title: string;
		description: string;
		severity: string;
		category: string;
		impactMin: number;
		impactMax: number;
		impactMidpoint: number;
	};
	const linkedActionsById = new Map<string, LinkedAction>();
	for (const row of linkedActionRows) {
		let title = "(ação ligada ao passo)";
		let description = "";
		try {
			const parsed = JSON.parse(row.projection);
			if (typeof parsed?.title === "string") title = parsed.title;
			if (typeof parsed?.description === "string") description = parsed.description;
		} catch { /* keep defaults */ }
		linkedActionsById.set(row.id, {
			id: row.id,
			title,
			description,
			severity: row.severity,
			category: row.category,
			impactMin: row.impactMin ?? 0,
			impactMax: row.impactMax ?? 0,
			impactMidpoint: row.impactMidpoint ?? 0,
		});
	}
	const impactById = linkedActionsById; // alias used below

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
	const findingRows = allFindingKeys.length
		? await prisma.finding.findMany({
			where: {
				environmentId: plan.environmentId,
				inferenceKey: { in: allFindingKeys },
				status: { in: ["created", "confirmed"] },
			},
			select: { inferenceKey: true, confidence: true, surface: true },
			orderBy: { createdAt: "desc" },
		})
		: [];
	const findingConfidences = findingRows; // alias for back-compat below

	// Reta-final "Por página" lens: each step's affectedSurfaces is the
	// distinct list of surfaces across its linked findings, sorted by
	// count desc so the primary surface (the one this step is "about")
	// is first and secondaries become "afeta também: ..." badges.
	const surfacesByKey = new Map<string, Map<string, number>>();
	for (const f of findingRows) {
		if (!f.surface) continue;
		const inner = surfacesByKey.get(f.inferenceKey) ?? new Map<string, number>();
		inner.set(f.surface, (inner.get(f.surface) ?? 0) + 1);
		surfacesByKey.set(f.inferenceKey, inner);
	}
	function affectedSurfacesForStep(keys: string[]): Array<{ surface: string; findingCount: number }> {
		const totals = new Map<string, number>();
		for (const k of keys) {
			const inner = surfacesByKey.get(k);
			if (!inner) continue;
			for (const [surface, count] of inner) {
				totals.set(surface, (totals.get(surface) ?? 0) + count);
			}
		}
		return Array.from(totals.entries())
			.map(([surface, findingCount]) => ({ surface, findingCount }))
			.sort((a, b) => b.findingCount - a.findingCount);
	}

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
	// Customer-facing labels for every pack. Mirrors dictionary/pt-BR.json
	// pack_labels.* but is duplicated here because this API route is hit by
	// the locale-aware Plan renderer pre-hydration. Keep in sync with the
	// dictionary — when a new pack ships, add it here too.
	const PACK_LABEL_PTBR: Record<string, string> = {
		copy_alignment: "Consistência da mensagem",
		scale_readiness: "Preparo para escala",
		trust: "Sinais de confiança",
		revenue: "Captura de receita",
		chargeback: "Risco de chargeback",
		saas: "Ciclo SaaS",
		behavioral: "Comportamento do visitante",
		revenue_integrity: "Integridade da receita",
		chargeback_resilience: "Resiliência a chargeback",
		money_moment_exposure: "Exposição no momento da compra",
		saas_growth_readiness: "Preparo para crescer SaaS",
		channel_integrity: "Integridade do canal",
		discoverability: "Descoberta",
		brand_integrity: "Integridade da marca",
		funnel_journey: "Jornada de compra",
		funnel_integrity: "Integridade do funil",
		first_impression_revenue: "Primeira impressão",
		action_value_map: "Mapa de valor da ação",
		acquisition_integrity: "Integridade da aquisição",
		mobile_revenue_exposure: "Receita exposta no mobile",
		friction_tax: "Imposto de fricção",
		trust_revenue_gap: "Lacuna de confiança na receita",
		path_efficiency: "Eficiência do caminho",
		payment_health: "Saúde dos pagamentos",
		content_freshness: "Frescor do conteúdo",
		vertical_specific: "Especifico do setor",
		cross_signal: "Sinal cruzado",
		email_deliverability: "Entrega de email",
		competitive_lens: "Lente competitiva",
		behavioral_heuristics: "Comportamento do visitante",
	};
	const packDistribution = packTotal > 0
		? packRows
			.slice(0, 6) // top 6 — beyond that the bar slices vanish
			.map((r) => {
				const k = r.pack.replace(/_pack$/, "");
				return {
					pack: r.pack,
					label:
						PACK_LABEL_PTBR[k] ??
						// Defensive fallback: humanize raw pack key in Title Case
						// (capitalize first letter of each word). Prevents
						// "money moment exposure" lowercase-leaks when a new
						// pack ships before the map is updated.
						k
							.replace(/_/g, " ")
							.replace(/\b\w/g, (c) => c.toUpperCase()),
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

	// PV.9b - resolve a captured screenshot per next-step: match the step's surface
	// path to a SurfaceScreenshot (latest per path), presign matched keys so the UI
	// shows the customer's ACTUAL page next to the finding. Degrade-safe: no rows /
	// no R2 -> screenshotUrl stays null and the UI renders text-only as before.
	const normPath = (p: string) => { const x = String(p || "").trim(); return x.length > 1 ? x.replace(/\/+$/, "") : (x || "/"); };
	const screenshotKeyByPath = new Map<string, string>();
	try {
		const shots = await prisma.surfaceScreenshot.findMany({
			where: { environmentId: plan.environmentId },
			orderBy: { capturedAt: "desc" },
			select: { path: true, r2Key: true },
		});
		for (const sh of shots) {
			const pp = normPath(sh.path);
			if (!screenshotKeyByPath.has(pp)) screenshotKeyByPath.set(pp, sh.r2Key);
		}
	} catch { /* no screenshots yet - text-only Plano */ }
	function screenshotKeyForStep(keys: string[]): string | null {
		for (const { surface } of affectedSurfacesForStep(keys)) {
			for (const tok of String(surface).split(/[,\s]+/)) {
				if (!tok.startsWith("/")) continue;
				const k = screenshotKeyByPath.get(normPath(tok));
				if (k) return k;
			}
		}
		return null;
	}
	const matchedKeyByStepId = new Map<string, string>();
	for (const s of plan.nextSteps) {
		const k = screenshotKeyForStep(((s as any).linkedFindingRefsJson as string[]) ?? []);
		if (k) matchedKeyByStepId.set(s.id, k);
	}
	const screenshotUrlByKey = new Map<string, string>();
	// Presign every distinct r2Key in the env — small set (≤ ~20 rows),
	// single-digit signing calls, no network round-trip. Powers both the
	// per-step NextSteps figure AND the new per-finding figure inside the
	// PlanSideDrawer (visual proof beside each finding card). Degrade-safe:
	// R2 unset → empty map → UI stays text-only.
	const allKeys = new Set<string>([
		...matchedKeyByStepId.values(),
		...screenshotKeyByPath.values(),
	]);
	if (allKeys.size > 0) {
		try {
			const { r2Configured, getScreenshotUrl } = await import("@/libs/r2-screenshots");
			if (r2Configured()) {
				await Promise.all(Array.from(allKeys).map(async (k) => {
					try { screenshotUrlByKey.set(k, await getScreenshotUrl(k)); } catch { /* skip */ }
				}));
			}
		} catch { /* R2 helper unavailable - text-only */ }
	}
	// Reta-final: expose the full path→URL map so the FindingCard drawer
	// can render a figure per finding based on its source_url. Same TTL
	// semantics as the per-step screenshots (1h presigned; response cached
	// implicitly by the plan payload's short-lived nature).
	const screenshotUrlByPath: Record<string, string> = {};
	for (const [path, key] of screenshotKeyByPath.entries()) {
		const url = screenshotUrlByKey.get(key);
		if (url) screenshotUrlByPath[path] = url;
	}

	// Reta-final · peer prevalence: for each whitelisted inference key
	// backed by a Vestigio Index cohort, resolve the customer's peer
	// contrast line and attach it to the plan payload. Client renders
	// under the finding's root cause. Only lines resolvable server-side
	// ship — no cohort data on client, keeps the /app bundle small.
	const peerLineByInferenceKey: Record<
		string,
		{ prevalence: number; cohortSampleSize: number; cohortPeriod: string; vertical: string; patternLabel: string; direction: string }
	> = {};
	try {
		const { getPeerLine, PEER_LINE_INFERENCE_KEYS } = await import(
			"../../../../../../packages/signals/peer-line"
		);
		const businessModel = env.organization?.businessProfile?.businessModel ?? null;
		const locale = plan.locale;
		// Whitelist ships from packages/signals/peer-line.ts so a new
		// rule reaches the API without a second edit here.
		for (const key of PEER_LINE_INFERENCE_KEYS) {
			const line = getPeerLine(key, businessModel, locale);
			if (line) peerLineByInferenceKey[key] = line;
		}
	} catch (err) {
		// Peer-line helper missing or cohort data broken — degrade to
		// text-only findings. Log so we notice regressions.
		console.warn("[strategy] peer-line resolution failed:", err instanceof Error ? err.message : err);
	}

	const hero = plan.heroMetricsJson as any;
	const buyerSegments = plan.buyerSegmentsJson as any;
	const memoryRollups = plan.memoryRollupsJson as any;
	const valuePreview = plan.valuePreviewJson as any;

	// #7 Action Attribution Timeline — UserActions marcadas como done
	// E verifiedResolvedAt confirmado pelo ciclo seguinte, dentro da
	// janela do plano. Cada row carrega o nome do humano que fechou
	// (assignedTo), o título da Action, o baselineImpact, e a data de
	// verificação. UI renderiza "seu time recuperou R$ X porque
	// Marcus fechou Y em 24/Nov". Usa baselineImpactMidpoint (snapshot
	// no momento da criação da Action) — não o midpoint atual da
	// finding já resolvida (que é zero).
	const attributionRowsRaw = await prisma.userAction.findMany({
		where: {
			environmentId: envId,
			status: "done",
			verifiedResolvedAt: {
				gte: monthStartForPlan,
				lt: monthEndForPlan,
				not: null,
			},
		},
		select: {
			id: true,
			title: true,
			verifiedResolvedAt: true,
			baselineImpactMidpoint: true,
			doneAt: true,
			assignedTo: { select: { name: true, email: true } },
		},
		orderBy: { verifiedResolvedAt: "desc" },
		take: 20,
	});
	const attributionTimeline = attributionRowsRaw.map((row) => ({
		id: row.id,
		title: row.title,
		// Nome humano-amigável; cai pro email local-part quando name
		// não está setado. Se nem isso, "alguém do time".
		ownerLabel:
			row.assignedTo?.name ??
			row.assignedTo?.email?.split("@")[0] ??
			"alguém do time",
		verifiedResolvedAt: row.verifiedResolvedAt?.toISOString() ?? null,
		doneAt: row.doneAt?.toISOString() ?? null,
		baselineImpactMidpoint: row.baselineImpactMidpoint ?? 0,
	}));
	const attributionTotal = attributionTimeline.reduce(
		(a, r) => a + (r.baselineImpactMidpoint ?? 0),
		0,
	);

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
		attributionTimeline,
		attributionTotal,
		screenshotUrlByPath,
		peerLineByInferenceKey,
		narrativeWhatHappened: plan.narrativeWhatHappened,
		valuePreviewNarrative: plan.valuePreviewNarrative,
		valuePreview,
		memoryRollups,
		nextSteps: plan.nextSteps.map((s) => {
			const refs = (s.linkedActionRefsJson as string[]) ?? [];
			const linkedActions = refs
				.map((id) => impactById.get(id))
				.filter((a): a is LinkedAction => !!a);
			let impactMin = 0;
			let impactMax = 0;
			let impactMidpoint = 0;
			for (const a of linkedActions) {
				impactMin += a.impactMin;
				impactMax += a.impactMax;
				impactMidpoint += a.impactMidpoint;
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
				/** Reta-final: resolved Action objects so the drawer doesn't
				 *  have to look them up via MCP (which only carries the
				 *  current cycle and misses older Action IDs the plan
				 *  references). Empty array when no rows resolved. */
				linkedActions,
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
				/** Reta-final "Por página": surfaces touched by this step's
				 *  linked findings, sorted by count desc. First entry is the
				 *  primary surface; rest are "afeta também: ..." badges in
				 *  the per-page lens. Empty array → step renders in the
				 *  "Cross-site" group at the top of that lens. */
				affectedSurfaces: affectedSurfacesForStep(findingRefs),
				/** Reta-final: verification criteria pulled from the
				 *  catalog ("Como saber que está fixed?"). Null when no
				 *  catalog entry matched (rare — most live keys do). */
				verification: verificationForStep(findingRefs),
				status: s.status,
				assigneeUserId: s.assigneeUserId,
				assigneeName: null,
				dueAt: s.dueAt?.toISOString() ?? null,
				commentsCount: commentsByStepId.get(s.id) ?? 0,
				screenshotUrl: screenshotUrlByKey.get(matchedKeyByStepId.get(s.id) ?? "") ?? null,
			};
		}),
	});
}
