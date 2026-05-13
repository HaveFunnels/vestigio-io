import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
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
		const session = await getServerSession(authOptions);
		if (!session?.user || (session.user as any).role !== "ADMIN") {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

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
}

async function computeChatDynamics(cutoff: Date): Promise<ChatDynamicsView> {
	const [opens, sends, firstTokenEvents, toolEvents, errors, cacheAgg] =
		await Promise.all([
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
		{ calls: number; totalDuration: number; durationSamples: number }
	>();
	for (const row of toolEvents) {
		const props = row.properties as any;
		const tool = typeof props?.tool === "string" ? props.tool : null;
		if (!tool) continue;
		const phase = props?.phase;
		const existing = toolStats.get(tool) ?? {
			calls: 0,
			totalDuration: 0,
			durationSamples: 0,
		};
		if (phase === "end") {
			existing.calls++;
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
	};
}
