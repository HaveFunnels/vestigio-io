import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/admin/metrics/product-analytics  (3.16)
//
// Product engagement dashboard for admin. Answers:
//   - How many users are active daily?
//   - Which features are being adopted?
//   - Which pages get the most traffic?
//   - Which environments are at risk of churning?
//   - What's the engagement score distribution?
//
// All queries are bounded and indexed. Safe to poll on 30s refresh.
// ──────────────────────────────────────────────

export const GET = withErrorTracking(
	async function GET(req: NextRequest) {
		const gate = await requireAdmin();
		if (gate.denied) return gate.denied;

		const period = req.nextUrl.searchParams.get("period") || "30d";
		const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
		const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

		const [
			dau,
			totalEvents,
			featureAdoption,
			topPages,
			engagementDistribution,
			atRiskEnvs,
			eventsByType,
		] = await Promise.all([
			// Daily active users (distinct userId with events today)
			prisma.productEvent.groupBy({
				by: ["userId"],
				where: {
					createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
				},
				_count: true,
			}).then((rows) => rows.length),

			// Total events in period
			prisma.productEvent.count({
				where: { createdAt: { gte: cutoff } },
			}),

			// Feature adoption funnel — count users who have each flag set
			Promise.all([
				prisma.user.count({ where: { activatedAt: { not: null } } }),
				prisma.user.count({ where: { firstChatAt: { not: null } } }),
				prisma.user.count({ where: { firstActionAt: { not: null } } }),
				prisma.user.count({ where: { firstVerifyAt: { not: null } } }),
				prisma.user.count({ where: { firstWorkspaceDrillAt: { not: null } } }),
			]).then(([activated, chat, action, verify, workspace]) => ({
				activated,
				first_chat: chat,
				first_action: action,
				first_verify: verify,
				first_workspace_drill: workspace,
			})),

			// Top pages by view count
			prisma.productEvent.groupBy({
				by: ["pathname"],
				where: { event: "page_view", createdAt: { gte: cutoff } },
				_count: true,
				orderBy: { _count: { pathname: "desc" } },
				take: 20,
			}).then((rows) =>
				rows.map((r) => ({ pathname: r.pathname, count: r._count })),
			),

			// Engagement score distribution (5 buckets)
			prisma.environment
				.findMany({
					where: { activated: true },
					select: { engagementScore: true },
				})
				.then((envs) => {
					const buckets = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
					for (const env of envs) {
						const idx = Math.min(
							4,
							Math.floor(env.engagementScore / 20),
						);
						buckets[idx]++;
					}
					return {
						labels: ["0-20", "21-40", "41-60", "61-80", "81-100"],
						counts: buckets,
						total: envs.length,
					};
				}),

			// At-risk environments (score < 20, last accessed > 7 days ago)
			prisma.environment.findMany({
				where: {
					activated: true,
					engagementScore: { lt: 20 },
					lastAccessedAt: {
						lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
					},
				},
				select: {
					id: true,
					domain: true,
					engagementScore: true,
					lastAccessedAt: true,
					organization: {
						select: { name: true, plan: true },
					},
				},
				orderBy: { engagementScore: "asc" },
				take: 50,
			}),

			// Events by type in period
			prisma.productEvent.groupBy({
				by: ["event"],
				where: { createdAt: { gte: cutoff } },
				_count: true,
				orderBy: { _count: { event: "desc" } },
			}).then((rows) =>
				rows.map((r) => ({ event: r.event, count: r._count })),
			),
		]);

		// Avg engagement score
		const avgEngagement = await prisma.environment.aggregate({
			where: { activated: true },
			_avg: { engagementScore: true },
		});

		// ── Launch metrics (Wave 22.8 reta-final) ──
		// Defined by the conselho-das-4-lentes deliberation. These two
		// numbers are how we know if the launch worked:
		//   Activation: % of new customers who opened Plan >=2x in
		//               their first 7 days.
		//   Retention:  % of customers activated 30-60d ago who opened
		//               Plan >=1x in the past 30 days.
		// Both are intentionally simple: open the Plan is the ONLY
		// activation gesture we measure (the Plan IS the product).
		const launchMetrics = await computeLaunchMetrics();

		// ── Chat dynamics ─────────────────────────────────────
		// Computes TTFT percentiles, tool-call distribution, error rate,
		// and conversation depth for the MCP copilot. Anything in the
		// `properties` JSON is opportunistic — we tolerate nulls.
		const chatDynamics = await computeChatDynamics(cutoff);

		return NextResponse.json({
			period,
			generated_at: new Date().toISOString(),
			dau,
			total_events: totalEvents,
			avg_engagement_score: Math.round(
				avgEngagement._avg.engagementScore ?? 0,
			),
			feature_adoption: featureAdoption,
			top_pages: topPages,
			engagement_distribution: engagementDistribution,
			at_risk_environments: atRiskEnvs,
			events_by_type: eventsByType,
			chat_dynamics: chatDynamics,
			launch_metrics: launchMetrics,
		});
	},
	{ endpoint: "/api/admin/metrics/product-analytics", method: "GET" },
);

// ──────────────────────────────────────────────
// Chat dynamics — MCP copilot observability
//
// Reads from the same ProductEvent stream that everything else uses,
// filtered to the chat_* event family. Aggregates:
//   - chat_opened / chat_send counts (funnel: open → send → first_token → done)
//   - TTFT p50 / p95 from chat_first_token.ttft_ms
//   - top tools called + average duration
//   - error rate
// ──────────────────────────────────────────────

interface ChatDynamicsView {
	opens: number;
	sends: number;
	first_tokens: number;
	errors: number;
	ttft_p50_ms: number | null;
	ttft_p95_ms: number | null;
	error_rate_pct: number;
	top_tools: { tool: string; calls: number; avg_duration_ms: number | null }[];
	avg_message_length: number | null;
	// Anthropic prompt caching: how much input is being read from cache
	// vs re-billed at full input rate. Higher = lower cost. Cached reads
	// bill at 10% of full input rate.
	cache_hit_ratio_pct: number | null;
	cache_read_input_tokens: number;
	cache_creation_input_tokens: number;
	uncached_input_tokens: number;
	// Per-request tool result cache (orthogonal to Anthropic prompt
	// cache). Measures how often repeated tool calls within the 8-round
	// loop were served from the in-memory map instead of re-executed.
	tool_cache_hit_rate_pct: number | null;
	tool_calls_total: number;
	tool_calls_cached: number;
	// Sync tools that breached the slow threshold (sub-ms expected;
	// >500ms is a signal of engine regression).
	slow_tool_events: number;
	// Times the server signaled "still working" past the threshold —
	// these turns felt slow to the user even when they ultimately
	// succeeded. High value here = the chat feels sluggish.
	still_working_events: number;
	// Per-tool failure: count of chat_tool_call events with
	// properties.error === true, and the ratio vs total ended calls.
	tool_errors_total: number;
	tool_error_rate_pct: number | null;
	// Top tools by errors (descending). Useful for triaging which MCP
	// tool keeps failing.
	top_tool_errors: { tool: string; errors: number }[];
}

async function computeChatDynamics(cutoff: Date): Promise<ChatDynamicsView> {
	const [
		opens,
		sends,
		firstTokenEvents,
		toolEvents,
		errors,
		cacheAgg,
		slowToolEvents,
		stillWorkingEvents,
	] = await Promise.all([
		prisma.productEvent.count({
			where: { event: "chat_opened", createdAt: { gte: cutoff } },
		}),
		prisma.productEvent.findMany({
			where: { event: "chat_send", createdAt: { gte: cutoff } },
			select: { properties: true },
		}),
		prisma.productEvent.findMany({
			where: { event: "chat_first_token", createdAt: { gte: cutoff } },
			select: { properties: true },
		}),
		prisma.productEvent.findMany({
			where: { event: "chat_tool_call", createdAt: { gte: cutoff } },
			select: { properties: true },
		}),
		prisma.productEvent.count({
			where: { event: "chat_error", createdAt: { gte: cutoff } },
		}),
		prisma.tokenCostLedger.aggregate({
			where: { purpose: "core_chat", createdAt: { gte: cutoff } },
			_sum: {
				inputTokens: true,
				cacheCreationInputTokens: true,
				cacheReadInputTokens: true,
			},
		}),
		prisma.productEvent.count({
			where: { event: "chat_tool_slow", createdAt: { gte: cutoff } },
		}),
		prisma.productEvent.count({
			where: { event: "chat_still_working", createdAt: { gte: cutoff } },
		}),
	]);

	// TTFT percentiles
	const ttfts: number[] = [];
	for (const row of firstTokenEvents) {
		const ttft = (row.properties as any)?.ttft_ms;
		if (typeof ttft === "number" && ttft >= 0 && ttft < 300_000) {
			ttfts.push(ttft);
		}
	}
	ttfts.sort((a, b) => a - b);
	const p50 = ttfts.length > 0 ? ttfts[Math.floor(ttfts.length * 0.5)] : null;
	const p95 = ttfts.length > 0 ? ttfts[Math.floor(ttfts.length * 0.95)] : null;

	// Avg message length
	let totalLen = 0;
	let lenCount = 0;
	for (const row of sends) {
		const len = (row.properties as any)?.message_length;
		if (typeof len === "number" && len > 0) {
			totalLen += len;
			lenCount++;
		}
	}

	// Top tools (end-phase only, since duration is on end)
	const toolStats = new Map<
		string,
		{ calls: number; totalDuration: number; durationSamples: number; errors: number }
	>();
	let toolCallsTotal = 0;
	let toolCallsCached = 0;
	let toolErrorsTotal = 0;
	for (const row of toolEvents) {
		const props = row.properties as any;
		const tool = typeof props?.tool === "string" ? props.tool : null;
		if (!tool) continue;
		const phase = props?.phase;
		const existing = toolStats.get(tool) ?? {
			calls: 0,
			totalDuration: 0,
			durationSamples: 0,
			errors: 0,
		};
		if (phase === "end") {
			existing.calls++;
			toolCallsTotal++;
			if (props?.cached === true) toolCallsCached++;
			if (props?.error === true) {
				existing.errors++;
				toolErrorsTotal++;
			}
			const dur = props?.duration_ms;
			if (typeof dur === "number" && dur >= 0 && dur < 300_000) {
				existing.totalDuration += dur;
				existing.durationSamples++;
			}
		}
		toolStats.set(tool, existing);
	}
	const topTools = Array.from(toolStats.entries())
		.map(([tool, s]) => ({
			tool,
			calls: s.calls,
			avg_duration_ms:
				s.durationSamples > 0
					? Math.round(s.totalDuration / s.durationSamples)
					: null,
		}))
		.sort((a, b) => b.calls - a.calls)
		.slice(0, 10);

	const errorRate = sends.length > 0 ? (errors / sends.length) * 100 : 0;

	// Cache hit ratio: cache_read / (input + cache_read + cache_creation)
	// input_tokens in the Anthropic response excludes cached reads, so we
	// add cache_read back to get total tokens delivered to the model.
	const uncached = cacheAgg._sum.inputTokens ?? 0;
	const cacheCreation = cacheAgg._sum.cacheCreationInputTokens ?? 0;
	const cacheRead = cacheAgg._sum.cacheReadInputTokens ?? 0;
	const totalInput = uncached + cacheCreation + cacheRead;
	const cacheHitRatio =
		totalInput > 0 ? Math.round((cacheRead / totalInput) * 1000) / 10 : null;

	return {
		opens,
		sends: sends.length,
		first_tokens: firstTokenEvents.length,
		errors,
		ttft_p50_ms: p50,
		ttft_p95_ms: p95,
		error_rate_pct: Math.round(errorRate * 10) / 10,
		top_tools: topTools,
		avg_message_length:
			lenCount > 0 ? Math.round(totalLen / lenCount) : null,
		cache_hit_ratio_pct: cacheHitRatio,
		cache_read_input_tokens: cacheRead,
		cache_creation_input_tokens: cacheCreation,
		uncached_input_tokens: uncached,
		tool_cache_hit_rate_pct:
			toolCallsTotal > 0
				? Math.round((toolCallsCached / toolCallsTotal) * 1000) / 10
				: null,
		tool_calls_total: toolCallsTotal,
		tool_calls_cached: toolCallsCached,
		slow_tool_events: slowToolEvents,
		still_working_events: stillWorkingEvents,
		tool_errors_total: toolErrorsTotal,
		tool_error_rate_pct:
			toolCallsTotal > 0
				? Math.round((toolErrorsTotal / toolCallsTotal) * 1000) / 10
				: null,
		top_tool_errors: Array.from(toolStats.entries())
			.filter(([, s]) => s.errors > 0)
			.map(([tool, s]) => ({ tool, errors: s.errors }))
			.sort((a, b) => b.errors - a.errors)
			.slice(0, 5),
	};
}

// ──────────────────────────────────────────────
// Launch metrics — defined by the conselho-das-4-lentes deliberation.
//
// Two numbers that tell us if launch worked:
//
//   activation_rate_pct: of new customers who activated in the past
//                       7-30 days, what % opened the Plan >=2x in
//                       their first 7 days?
//                       Numerator: distinct userIds with >=2 plan.visit
//                                  events, all in their first 7d
//                       Denominator: distinct activated users in window
//
//   retention_rate_pct:  of customers who activated 30-60 days ago,
//                       what % opened the Plan >=1x in the past 30 days?
//                       Numerator: distinct userIds with >=1 plan.visit
//                                  in past 30d
//                       Denominator: distinct activated users in 30-60d
//                                    activation window
//
// Both intentionally avoid feature-adoption (chat, action, verify) —
// the Plan IS the product, so 'open the Plan' is the activation gesture.
// Returns null per-side when the denominator is too small to be meaningful.
// ──────────────────────────────────────────────
interface LaunchMetricsView {
	activation_rate_pct: number | null;
	activation_cohort_size: number;
	activation_qualified_count: number;
	retention_rate_pct: number | null;
	retention_cohort_size: number;
	retention_qualified_count: number;
}

async function computeLaunchMetrics(): Promise<LaunchMetricsView> {
	const now = Date.now();
	const day = 24 * 60 * 60 * 1000;

	// Activation cohort: activated between 7 and 30 days ago. We need at
	// least 7d after activation to evaluate ">=2 visits in first 7d".
	// Upper bound at 30d so the cohort is recent.
	const activationCohortStart = new Date(now - 30 * day);
	const activationCohortEnd = new Date(now - 7 * day);
	const activationCohort = await prisma.user.findMany({
		where: {
			activatedAt: { gte: activationCohortStart, lte: activationCohortEnd },
		},
		select: { id: true, activatedAt: true },
	});

	let activationQualified = 0;
	for (const u of activationCohort) {
		if (!u.activatedAt) continue;
		const sevenDaysAfterActivation = new Date(
			u.activatedAt.getTime() + 7 * day,
		);
		const visits = await prisma.productEvent.count({
			where: {
				userId: u.id,
				event: "plan.visit",
				createdAt: {
					gte: u.activatedAt,
					lt: sevenDaysAfterActivation,
				},
			},
		});
		if (visits >= 2) activationQualified += 1;
	}

	// Retention cohort: activated between 30 and 60 days ago. Anyone
	// newer hasn't had "month 2" yet; anyone older drifts into a
	// different cohort that needs its own retention curve.
	const retentionCohortStart = new Date(now - 60 * day);
	const retentionCohortEnd = new Date(now - 30 * day);
	const retentionCohort = await prisma.user.findMany({
		where: {
			activatedAt: { gte: retentionCohortStart, lte: retentionCohortEnd },
		},
		select: { id: true },
	});

	const thirtyDaysAgo = new Date(now - 30 * day);
	let retentionQualified = 0;
	for (const u of retentionCohort) {
		const visits = await prisma.productEvent.count({
			where: {
				userId: u.id,
				event: "plan.visit",
				createdAt: { gte: thirtyDaysAgo },
			},
		});
		if (visits >= 1) retentionQualified += 1;
	}

	// Bail with null when cohort too small to be informative.
	// Threshold 3 = at least 3 customers — anything less is anecdote.
	const MIN_COHORT = 3;
	return {
		activation_rate_pct:
			activationCohort.length >= MIN_COHORT
				? Math.round(
					(activationQualified / activationCohort.length) * 1000,
				) / 10
				: null,
		activation_cohort_size: activationCohort.length,
		activation_qualified_count: activationQualified,
		retention_rate_pct:
			retentionCohort.length >= MIN_COHORT
				? Math.round(
					(retentionQualified / retentionCohort.length) * 1000,
				) / 10
				: null,
		retention_cohort_size: retentionCohort.length,
		retention_qualified_count: retentionQualified,
	};
}
