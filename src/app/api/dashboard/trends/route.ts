import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { PrismaSnapshotStore } from "../../../../../packages/change-detection";
import { analyzeTrends, type TrendPattern } from "../../../../../packages/projections";

// ──────────────────────────────────────────────
// GET /api/dashboard/trends
//
// Wave 7.1: Multi-cycle trend analysis.
//
// Query params:
//   lookback — number of cycles to analyze (3-20, default 10)
//   pattern  — optional filter: only return findings with this pattern
//
// Returns TrendAnalysis for the user's active environment.
// ──────────────────────────────────────────────

export const GET = withErrorTracking(
	async function GET(request: Request) {
		const user = await isAuthorized();
		if (!user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			include: { organization: { select: { id: true } } },
		});
		if (!membership?.organization) {
			return NextResponse.json({ message: "No organization" }, { status: 404 });
		}

		const environment = await prisma.environment.findFirst({
			where: { organizationId: membership.organizationId },
			orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
			select: { id: true },
		});
		if (!environment) {
			return NextResponse.json({ message: "No environment" }, { status: 404 });
		}

		// Parse query params
		const url = new URL(request.url);
		const lookback = Math.min(20, Math.max(3, parseInt(url.searchParams.get("lookback") ?? "10", 10)));
		const patternFilter = url.searchParams.get("pattern") as TrendPattern | null;

		// Load the workspace ref from the most recent snapshot
		const latestSnapshot = await prisma.cycleSnapshot.findFirst({
			where: { environmentRef: environment.id },
			orderBy: { createdAt: "desc" },
			select: { workspaceRef: true },
		});
		if (!latestSnapshot) {
			return NextResponse.json({
				lookback_cycles: 0,
				cycle_refs: [],
				finding_trends: [],
				workspace_trend: { direction: "stable", cycle_summaries: [], volatility: 0, regression_velocity: 0, improvement_velocity: 0 },
				alerts: [],
			});
		}

		const snapshotStore = new PrismaSnapshotStore(prisma);
		const snapshots = await snapshotStore.asyncList(
			latestSnapshot.workspaceRef,
			environment.id,
			lookback,
		);

		if (snapshots.length < 2) {
			return NextResponse.json({
				lookback_cycles: snapshots.length,
				cycle_refs: snapshots.map(s => s.cycle_ref),
				finding_trends: [],
				workspace_trend: { direction: "stable", cycle_summaries: [], volatility: 0, regression_velocity: 0, improvement_velocity: 0 },
				alerts: [],
			});
		}

		const analysis = analyzeTrends(snapshots, patternFilter ?? undefined);

		return NextResponse.json(analysis);
	},
	{ endpoint: "/api/dashboard/trends", method: "GET" },
);
