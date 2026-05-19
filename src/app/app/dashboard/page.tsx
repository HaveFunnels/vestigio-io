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
import { resolveCurrentLocale } from "@/i18n/resolve-locale";
import { loadCaptionTranslations } from "@/lib/dashboard/load-caption-translations";
import type { DashboardData } from "@/lib/dashboard/types";

export const metadata = {
	title: "Dashboard",
};

// Don't cache — every visit reflects the latest cycle.
export const dynamic = "force-dynamic";

// Cross-Signal widget grows with content (only when on default layout —
// custom layouts respect user's sizing). 1 chain → 3 rows, 2-3 → 4 rows,
// 4+ → 5 rows. Other widgets shift down accordingly via grid compaction.
function adaptLayoutToContent(
	layout: WidgetInstance[],
	data: DashboardData,
	isDefaultLayout: boolean,
): WidgetInstance[] {
	if (!isDefaultLayout) return layout;
	const chainCount = data.crossSignal?.chains.length ?? 0;
	const newH = chainCount <= 1 ? 3 : chainCount <= 3 ? 4 : 5;
	const csIdx = layout.findIndex((w) => w.defId === "cross_signal_hero");
	if (csIdx === -1 || layout[csIdx].h === newH) return layout;
	const delta = newH - layout[csIdx].h;
	return layout.map((w, i) => {
		if (i === csIdx) return { ...w, h: newH };
		// Shift down anything below the cross-signal widget
		if (w.y >= layout[csIdx].y + layout[csIdx].h) return { ...w, y: w.y + delta };
		return w;
	});
}

export default async function DashboardPage() {
	const { data, layout, isDefaultLayout } = await loadDashboard();
	const finalLayout = adaptLayoutToContent(layout, data, isDefaultLayout);

	return (
		<main className='mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8'>
			<DashboardShell initialInstances={finalLayout} data={data} />
		</main>
	);
}

interface LoadResult {
	data: DashboardData;
	layout: WidgetInstance[];
	isDefaultLayout: boolean;
}

async function loadDashboard(): Promise<LoadResult> {
	try {
		const user = await isAuthorized();
		if (!user) {
			return { data: MOCK_DASHBOARD_DATA, layout: DEFAULT_LAYOUT, isDefaultLayout: true };
		}

		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			include: {
				// Pull `currency` so the resolver below can pick BRL/EUR/…
				// without falling back to USD. Without this field in the
				// select, every pt-BR org rendered "$60.6k" because the
				// undefined currency fell through to the USD default.
				organization: { select: { id: true, orgType: true, currency: true } },
			},
		});

		if (!membership?.organization) {
			return { data: MOCK_DASHBOARD_DATA, layout: DEFAULT_LAYOUT, isDefaultLayout: true };
		}

		// Load the saved layout in parallel with everything else.
		const layoutPromise = loadLayout(user.id, membership.organizationId);

		// Demo org → mock data, real saved layout (so the demo user can
		// still rearrange widgets and have it persist).
		if (isDemoOrg(membership.organization)) {
			const { layout, isDefault } = await layoutPromise;
			return { data: MOCK_DASHBOARD_DATA, layout, isDefaultLayout: isDefault };
		}

		const environment = await prisma.environment.findFirst({
			where: { organizationId: membership.organizationId },
			orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
			select: { id: true },
		});

		// Load locale-aware caption translations. Use the same priority
		// chain as next-intl (DB > cookie) so the captions match the
		// shell — otherwise a logged-in pt-BR user with a stale "en"
		// cookie sees Portuguese widget shells with English captions.
		const locale = await resolveCurrentLocale();
		const captionT = loadCaptionTranslations(locale);

		if (!environment) {
			const { layout, isDefault } = await layoutPromise;
			return { data: emptyDashboardData(undefined, captionT), layout, isDefaultLayout: isDefault };
		}

		// Resolve currency: org override > owner locale > USD
		let resolvedCurrency = "USD";
		const orgRecord = membership.organization as any;
		if (orgRecord.currency) {
			resolvedCurrency = orgRecord.currency;
		} else {
			const owner = await prisma.user.findFirst({
				where: { memberships: { some: { organizationId: membership.organizationId, role: "OWNER" } } },
				select: { locale: true },
			});
			if (owner?.locale?.startsWith("pt")) resolvedCurrency = "BRL";
			else if (owner?.locale?.startsWith("de")) resolvedCurrency = "EUR";
		}

		const [data, { layout, isDefault }] = await Promise.all([
			computeDashboardData(prisma, membership.organizationId, environment.id, resolvedCurrency, captionT),
			layoutPromise,
		]);

		return { data, layout, isDefaultLayout: isDefault };
	} catch (err) {
		// DB unavailable / build phase / unexpected — degrade gracefully
		// to mock so the page still renders.
		console.warn("[dashboard/page] loadDashboard failed:", err);
		return { data: MOCK_DASHBOARD_DATA, layout: DEFAULT_LAYOUT, isDefaultLayout: true };
	}
}

async function loadLayout(
	userId: string,
	organizationId: string
): Promise<{ layout: WidgetInstance[]; isDefault: boolean }> {
	try {
		const saved = await prisma.dashboardLayout.findUnique({
			where: { userId_organizationId: { userId, organizationId } },
		});
		if (!saved) return { layout: DEFAULT_LAYOUT, isDefault: true };

		const parsed = JSON.parse(saved.layout) as WidgetInstance[];
		const cleaned = parsed.filter(
			(inst) => getWidgetDef(inst.defId) !== undefined
		);
		if (cleaned.length === 0) return { layout: DEFAULT_LAYOUT, isDefault: true };
		return { layout: cleaned, isDefault: false };
	} catch {
		return { layout: DEFAULT_LAYOUT, isDefault: true };
	}
}
