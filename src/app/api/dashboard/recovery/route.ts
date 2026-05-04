import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { PrismaSnapshotStore } from "../../../../../packages/change-detection";
import {
	computeMultiCycleRecovery,
	type ResolvedFindingInput,
} from "../../../../../packages/integrations";

// ──────────────────────────────────────────────
// GET /api/dashboard/recovery
//
// Wave 7.2: Revenue Recovery Tracker.
//
// Cross-correlates resolved findings with per-cycle revenue
// data from integration snapshots. Returns per-action
// recovery estimates with confidence scoring.
//
// Query params:
//   lookback — number of cycles (3-20, default 10)
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

		// Load snapshots with revenue data
		const latestSnapshot = await prisma.cycleSnapshot.findFirst({
			where: { environmentRef: environment.id },
			orderBy: { createdAt: "desc" },
			select: { workspaceRef: true },
		});
		if (!latestSnapshot) {
			return NextResponse.json({
				estimates: [],
				total_estimated_recovery_monthly: 0,
				by_confidence: {
					strong: { count: 0, total_cents: 0 },
					correlated: { count: 0, total_cents: 0 },
					inconclusive: { count: 0, total_cents: 0 },
				},
				data_source: "none",
			});
		}

		const snapshotStore = new PrismaSnapshotStore(prisma);
		const snapshots = await snapshotStore.asyncList(
			latestSnapshot.workspaceRef,
			environment.id,
			lookback,
		);

		// Load resolved UserActions with impact data (join Finding for inferenceKey)
		const resolvedActions = await prisma.userAction.findMany({
			where: {
				environmentId: environment.id,
				status: "done",
				baselineImpactMidpoint: { not: null },
			},
			select: {
				findingId: true,
				baselineCycleRef: true,
				baselineImpactMin: true,
				baselineImpactMax: true,
				verifiedResolvedAt: true,
				verificationCycleRef: true,
			},
		});

		// Resolve inferenceKeys from Finding table
		const findingIds = resolvedActions.map(a => a.findingId).filter(Boolean);
		const findings = findingIds.length > 0
			? await prisma.finding.findMany({
				where: { id: { in: findingIds } },
				select: { id: true, inferenceKey: true },
			})
			: [];
		const inferenceKeyByFindingId = new Map(findings.map(f => [f.id, f.inferenceKey]));

		// Build resolved findings input
		const resolvedFindings: ResolvedFindingInput[] = resolvedActions
			.filter(a => a.baselineCycleRef && inferenceKeyByFindingId.has(a.findingId))
			.map(a => ({
				key: inferenceKeyByFindingId.get(a.findingId)!,
				cycle_ref: (a.verificationCycleRef ?? a.baselineCycleRef) as string,
				impact_range: {
					min: a.baselineImpactMin ?? 0,
					max: a.baselineImpactMax ?? 0,
				},
			}));

		const recovery = computeMultiCycleRecovery(snapshots, resolvedFindings);

		return NextResponse.json(recovery);
	},
	{ endpoint: "/api/dashboard/recovery", method: "GET" },
);
