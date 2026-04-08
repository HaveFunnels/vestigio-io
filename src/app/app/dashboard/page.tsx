// ──────────────────────────────────────────────
// Dashboard Page (Phase 1 — view-only with mock data)
//
// The new top-level landing page for returning users. Renders the
// curated default layout from `DEFAULT_LAYOUT` against mock data
// from `MOCK_DASHBOARD_DATA`. Phase 2 swaps mock for the real
// `/api/dashboard/overview` endpoint, Phase 3 adds edit mode +
// catalog drawer.
//
// **Important imports:**
//   - `@/lib/dashboard/init` populates the widget registry as a
//     side effect. Without it, `getWidgetDef(...)` returns
//     undefined for every widget id and the grid renders empty
//     placeholders.
// ──────────────────────────────────────────────

import { DashboardGrid } from "@/components/console/dashboard/DashboardGrid";
import { DashboardHeader } from "@/components/console/dashboard/DashboardHeader";
import { DEFAULT_LAYOUT } from "@/lib/dashboard/default-layout";
import "@/lib/dashboard/init"; // side-effect: registers all widgets
import { MOCK_DASHBOARD_DATA } from "@/lib/dashboard/mock-data";

export const metadata = {
	title: "Dashboard",
};

export default function DashboardPage() {
	return (
		<main className="mx-auto max-w-[1400px] px-6 py-8">
			<DashboardHeader />
			<DashboardGrid instances={DEFAULT_LAYOUT} data={MOCK_DASHBOARD_DATA} />
		</main>
	);
}
