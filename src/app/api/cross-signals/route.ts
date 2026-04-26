import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { computeAllCrossSignals } from "@/lib/dashboard/aggregator";
import { isDemoOrg } from "@/lib/demo-account";

// ──────────────────────────────────────────────
// GET /api/cross-signals
//
// Returns ALL cross-signal chains (up to 50) for the
// dedicated Cross-Signals page. Heavier than the dashboard
// endpoint which only returns top 5.
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

		if (!membership?.organization) {
			return NextResponse.json({ chains: [] });
		}

		// Demo org gets mock data
		if (isDemoOrg(membership.organization)) {
			// Import mock data lazily to avoid bundling it in prod
			const { buildMockCrossSignals } = await import("@/lib/dashboard/mock-data");
			return NextResponse.json({ chains: buildMockCrossSignals() });
		}

		const environment = await prisma.environment.findFirst({
			where: { organizationId: membership.organizationId },
			orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
			select: { id: true },
		});

		if (!environment) {
			return NextResponse.json({ chains: [] });
		}

		const chains = await computeAllCrossSignals(prisma, environment.id);
		return NextResponse.json({ chains });
	},
	{ endpoint: "/api/cross-signals", method: "GET" },
);
