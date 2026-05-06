import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { computeAllCrossSignals } from "@/lib/dashboard/aggregator";
import { isDemoOrg } from "@/lib/demo-account";
import { currencyFromLocale } from "../../../../packages/impact";

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
			include: { organization: { select: { id: true, orgType: true, currency: true, ownerId: true } } },
		});

		if (!membership?.organization) {
			return NextResponse.json({ chains: [], currency: "USD" });
		}

		// Resolve currency: org override > owner locale > default USD
		let resolvedCurrency = "USD";
		const org = membership.organization;
		if ((org as any).currency) {
			resolvedCurrency = (org as any).currency;
		} else {
			const owner = await prisma.user.findUnique({
				where: { id: (org as any).ownerId },
				select: { locale: true },
			});
			resolvedCurrency = currencyFromLocale(owner?.locale);
		}

		// Demo org gets mock data
		if (isDemoOrg(membership.organization)) {
			// Import mock data lazily to avoid bundling it in prod
			const { buildMockCrossSignals } = await import("@/lib/dashboard/mock-data");
			return NextResponse.json({ chains: buildMockCrossSignals(), currency: resolvedCurrency });
		}

		const environment = await prisma.environment.findFirst({
			where: { organizationId: membership.organizationId },
			orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
			select: { id: true },
		});

		if (!environment) {
			return NextResponse.json({ chains: [], currency: resolvedCurrency });
		}

		const chains = await computeAllCrossSignals(prisma, environment.id);
		return NextResponse.json({ chains, currency: resolvedCurrency });
	},
	{ endpoint: "/api/cross-signals", method: "GET" },
);
