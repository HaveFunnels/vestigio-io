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

import Link from "next/link";
import { resolveOrgContext } from "@/libs/resolve-org";
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

	// Phase 1 UX overhaul — Plan strip at the top of Pulse. The Plan is
	// now the home (see /app/page.tsx redirect), and when the user
	// closes the plan they land here. The strip gives them a single-
	// click path back. Mirrors the strip pattern that already lives on
	// /app/actions, but as a Link (not a Dialog) since Plan is its own
	// route in the Phase 1 IA, not a modal overlay.
	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	const monthLabel = (() => {
		const months = [
			"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
			"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
		];
		return `${months[now.getMonth()]} ${now.getFullYear()}`;
	})();
	const orgCtx = await resolveOrgContext().catch(() => null);
	const hasResolvedEnv =
		orgCtx?.envId && orgCtx.envId !== "default" && orgCtx.envId !== "default_env";
	const planHref = hasResolvedEnv
		? `/app/library/strategy/${month}?env=${encodeURIComponent(orgCtx!.envId)}`
		: `/app/library/strategy/${month}`;

	return (
		<main className='mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8'>
			<Link
				href={planHref}
				className='group mb-4 flex w-full items-center justify-between gap-4 rounded-xl border border-edge bg-gradient-to-r from-surface-card via-surface-card to-accent-subtle-bg px-5 py-4 text-left transition-all hover:border-edge-focus hover:from-surface-card-hover'
			>
				<div className='flex items-center gap-4'>
					<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-inset font-serif text-[16px] font-semibold text-content'>
						{/* Document glyph matches the "Plano" pictogram in the
						    sidebar, so the strip reads as a portal to the
						    same surface. */}
						<svg className='h-4 w-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.6}>
							<path strokeLinecap='round' strokeLinejoin='round' d='M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm-1.5 6h6m-6 3h6m-6 3h3.75' />
						</svg>
					</div>
					<div>
						<div className='mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint'>
							Plano de Estratégia
						</div>
						<div className='text-[14px] font-medium text-content'>
							{monthLabel}
						</div>
					</div>
				</div>
				<span className='shrink-0 rounded-md border border-edge bg-surface px-3 py-1.5 text-[12px] font-medium text-content transition-colors group-hover:border-edge-focus'>
					Abrir Plano →
				</span>
			</Link>

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
