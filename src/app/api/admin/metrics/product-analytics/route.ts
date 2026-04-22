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
		});
	},
	{ endpoint: "/api/admin/metrics/product-analytics", method: "GET" },
);
