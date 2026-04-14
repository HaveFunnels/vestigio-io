import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { withErrorTracking } from "@/libs/error-tracker";
import {
	computeDashboardData,
	emptyDashboardData,
} from "@/lib/dashboard/aggregator";
import { buildMockDashboardData } from "@/lib/dashboard/mock-data";
import { isDemoOrg } from "@/lib/demo-account";

// ──────────────────────────────────────────────
// GET /api/dashboard/overview
//
// Returns the full `DashboardData` payload for the current user's
// active environment. Three branches:
//
//   1. Demo org → return MOCK_DASHBOARD_DATA so the demo always
//      looks alive (no real audit cycles in the demo seed).
//   2. Real org with no env yet → return a fully zeroed payload so
//      the dashboard renders an honest empty state instead of mock
//      numbers (which would mislead a paying customer).
//   3. Real org with an env → run computeDashboardData() against
//      the most recent cycles.
//
// The aggregator handles per-slice failures internally — a single
// broken slice cannot 500 the whole endpoint.
// ──────────────────────────────────────────────

export const GET = withErrorTracking(
	async function GET() {
		const user = await isAuthorized();
		if (!user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			include: { organization: { select: { id: true, orgType: true } } },
		});

		// Mock dashboard text routes through the user's locale so the
		// placeholder copy doesn't render in English when the rest of
		// the app is in pt-BR / es / de.
		const tMock = await getTranslations("console.dashboard.mock_data");

		if (!membership?.organization) {
			return NextResponse.json(buildMockDashboardData(tMock));
		}

		// Demo org gets the mock fixture so the dashboard tells a
		// coherent story even though the seed has no audit cycles.
		if (isDemoOrg(membership.organization)) {
			return NextResponse.json(buildMockDashboardData(tMock));
		}

		const environment = await prisma.environment.findFirst({
			where: { organizationId: membership.organizationId },
			orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
			select: { id: true },
		});

		if (!environment) {
			return NextResponse.json(emptyDashboardData());
		}

		const data = await computeDashboardData(
			prisma,
			membership.organizationId,
			environment.id
		);
		return NextResponse.json(data);
	},
	{ endpoint: "/api/dashboard/overview", method: "GET" }
);
