import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// GET /api/admin/metrics/audit-runner  (Wave 5 Fase 1B)
//
// Single-call observability snapshot for the audit-runner subsystem.
// Used by an admin dashboard tile (and ad-hoc curling) to answer
// questions like:
//
//   - Is the queue backlogged? (queueDepth)
//   - Are cycles failing? (cyclesByStatusLast24h, dlq)
//   - Which orgs are burning the most compute this period? (topOrgs)
//   - How long are cycles taking? (avgDurationMs / p95DurationMs)
//
// Designed to be cheap: every query is bounded (LIMIT, GROUP BY a
// single small key, only the current period). Safe to poll on a 30s
// dashboard refresh.
//
// Worker stats (in-flight cycles, chromium pool utilization) live in
// the worker process — the admin dashboard reads them from each
// worker's /healthz endpoint, not from here. This endpoint covers the
// shared/Postgres-side state.
// ──────────────────────────────────────────────

function currentPeriod(): string {
	return new Date().toISOString().slice(0, 7);
}

export const GET = withErrorTracking(
	async function GET() {
		const session = await getServerSession(authOptions);
		if (!session?.user || (session.user as any).role !== "ADMIN") {
			return NextResponse.json({ message: "Forbidden" }, { status: 403 });
		}

		const period = currentPeriod();
		const last24hCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

		// Fire all the independent queries in parallel — none of them
		// depend on each other.
		const [queueDepth, cyclesByStatus, recentFailures, topOrgs] =
			await Promise.all([
				import("../../../../../../apps/platform/audit-cycle-queue").then(
					(m) => m.getQueueDepth(),
				),
				prisma.auditCycle.groupBy({
					by: ["status"],
					where: { createdAt: { gte: last24hCutoff } },
					_count: { _all: true },
				}),
				prisma.auditCycle.findMany({
					where: {
						status: "failed",
						completedAt: { gte: last24hCutoff },
					},
					select: {
						id: true,
						organizationId: true,
						environmentId: true,
						completedAt: true,
						cycleType: true,
					},
					orderBy: { completedAt: "desc" },
					take: 20,
				}),
				import("@/libs/usage-meter").then((m) => m.getTopUsageOrgs(10, period)),
			]);

		// Duration percentiles from completed cycles in last 24h. Cheap
		// because we cap to the last 24h and read only what we need.
		const recentCompleted = await prisma.auditCycle.findMany({
			where: {
				status: "complete",
				completedAt: { gte: last24hCutoff },
			},
			select: { createdAt: true, completedAt: true },
			take: 500,
		});
		const durations = recentCompleted
			.map((c) =>
				c.completedAt ? c.completedAt.getTime() - c.createdAt.getTime() : 0,
			)
			.filter((d) => d > 0)
			.sort((a, b) => a - b);
		const avgDurationMs =
			durations.length > 0
				? Math.round(
						durations.reduce((s, d) => s + d, 0) / durations.length,
					)
				: 0;
		const p50DurationMs =
			durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
		const p95DurationMs =
			durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;

		// DLQ peek for inspection. Cap to 50 ids.
		const dlqIds = await import(
			"../../../../../../apps/platform/audit-cycle-queue"
		).then((m) => m.peekDlq(50));

		const cyclesByStatusMap: Record<string, number> = {};
		for (const r of cyclesByStatus) {
			cyclesByStatusMap[r.status] = r._count._all;
		}

		return NextResponse.json({
			period,
			queue: queueDepth,
			cycles: {
				last24h: {
					byStatus: cyclesByStatusMap,
					completedSampleSize: durations.length,
					avgDurationMs,
					p50DurationMs,
					p95DurationMs,
				},
				dlqIds,
				recentFailures: recentFailures.map((f) => ({
					cycleId: f.id,
					organizationId: f.organizationId,
					environmentId: f.environmentId,
					cycleType: f.cycleType,
					completedAt: f.completedAt?.toISOString() ?? null,
				})),
			},
			topOrgs,
			generatedAt: new Date().toISOString(),
		});
	},
	{ endpoint: "/api/admin/metrics/audit-runner", method: "GET" },
);
