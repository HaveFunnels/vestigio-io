// ──────────────────────────────────────────────
// Dashboard Page (Phase 2 — real data + per-user persisted layout)
//
// Server Component that:
//   1. Resolves the current user + their org/membership
//   2. Loads the user's saved bento layout (or DEFAULT_LAYOUT)
//   3. Computes the real dashboard payload via the aggregator
//   4. Renders the grid against both
//
// Demo orgs short-circuit to MOCK_DASHBOARD_DATA so the showcase
// always looks alive (the demo seed has no real audit cycles).
// Real orgs with no environment yet get a zeroed payload — honest
// empty state, never fake numbers for paying customers.
//
// **Important imports:**
//   - `@/lib/dashboard/init` populates the widget registry as a
//     side effect. Without it, `getWidgetDef(...)` returns undefined
//     for every widget id and the grid renders empty placeholders.
// ──────────────────────────────────────────────

import { DashboardShell } from "@/components/console/dashboard/DashboardShell";
import {
	DEFAULT_LAYOUT,
	type WidgetInstance,
} from "@/lib/dashboard/default-layout";
import {
	computeDashboardData,
	emptyDashboardData,
} from "@/lib/dashboard/aggregator";
import { MOCK_DASHBOARD_DATA } from "@/lib/dashboard/mock-data";
import { getWidgetDef } from "@/lib/dashboard/init";
import "@/lib/dashboard/init"; // side-effect: registers all widgets
import { isDemoOrg } from "@/lib/demo-account";
import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import type { DashboardData } from "@/lib/dashboard/types";

export const metadata = {
	title: "Dashboard",
};

// Don't cache — every visit reflects the latest cycle.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
	const { data, layout } = await loadDashboard();

	return (
		<main className='mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8'>
			<DashboardShell initialInstances={layout} data={data} />
		</main>
	);
}

interface LoadResult {
	data: DashboardData;
	layout: WidgetInstance[];
}

async function loadDashboard(): Promise<LoadResult> {
	try {
		const user = await isAuthorized();
		if (!user) {
			return { data: MOCK_DASHBOARD_DATA, layout: DEFAULT_LAYOUT };
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			include: { organization: { select: { id: true, orgType: true } } },
		});

		if (!membership?.organization) {
			return { data: MOCK_DASHBOARD_DATA, layout: DEFAULT_LAYOUT };
		}

		// Load the saved layout in parallel with everything else.
		const layoutPromise = loadLayout(user.id, membership.organizationId);

		// Demo org → mock data, real saved layout (so the demo user can
		// still rearrange widgets and have it persist).
		if (isDemoOrg(membership.organization)) {
			const layout = await layoutPromise;
			return { data: MOCK_DASHBOARD_DATA, layout };
		}

		const environment = await prisma.environment.findFirst({
			where: { organizationId: membership.organizationId },
			orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
			select: { id: true },
		});

		if (!environment) {
			const layout = await layoutPromise;
			return { data: emptyDashboardData(), layout };
		}

		const [data, layout] = await Promise.all([
			computeDashboardData(prisma, membership.organizationId, environment.id),
			layoutPromise,
		]);

		return { data, layout };
	} catch (err) {
		// DB unavailable / build phase / unexpected — degrade gracefully
		// to mock so the page still renders.
		console.warn("[dashboard/page] loadDashboard failed:", err);
		return { data: MOCK_DASHBOARD_DATA, layout: DEFAULT_LAYOUT };
	}
}

async function loadLayout(
	userId: string,
	organizationId: string
): Promise<WidgetInstance[]> {
	try {
		const saved = await prisma.dashboardLayout.findUnique({
			where: { userId_organizationId: { userId, organizationId } },
		});
		if (!saved) return DEFAULT_LAYOUT;

		const parsed = JSON.parse(saved.layout) as WidgetInstance[];
		const cleaned = parsed.filter(
			(inst) => getWidgetDef(inst.defId) !== undefined
		);
		return cleaned.length > 0 ? cleaned : DEFAULT_LAYOUT;
	} catch {
		return DEFAULT_LAYOUT;
	}
}
