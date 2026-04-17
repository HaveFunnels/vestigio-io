"use client";

// ──────────────────────────────────────────────
// Ad Spend KPI — paid acquisition budget overview
//
// Shows total monthly ad spend across connected platforms with a
// per-platform breakdown (max 4 rows, sorted by spend desc).
// When no ads integration is connected, the card renders as a
// soft CTA to connect in Data Sources.
//
// Data flows from: IntegrationConnection (meta_ads / google_ads) →
// audit cycle → CommerceContext.ad_spend_by_platform → aggregator →
// DashboardData.adSpend.
// ──────────────────────────────────────────────

import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

const PLATFORM_COLORS: Record<string, { dot: string; text: string }> = {
	meta_ads: { dot: "bg-blue-500", text: "text-blue-400" },
	google_ads: { dot: "bg-emerald-500", text: "text-emerald-400" },
};

function fmt(value: number, currency: string): string {
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
	return `$${Math.round(value)}`;
}

function AdSpendKpiComponent({ data }: WidgetProps) {
	const { byPlatform, hasData, caption } = data.adSpend;

	if (!hasData) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-4 text-center">
				<svg className="mb-2 h-5 w-5 text-content-faint opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p className="text-[11px] text-content-faint">
					Connect Meta Ads or Google Ads in{" "}
					<a href="/app/settings/data-sources" className="text-indigo-400 hover:underline">
						Data Sources
					</a>{" "}
					to see ad spend here.
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col p-5">
			{/* Header */}
			<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
				Ad Spend
			</div>

			{/* Per-platform status */}
			<div className="flex-1 space-y-2.5">
				{byPlatform.map((p) => {
					const colors = PLATFORM_COLORS[p.platform] || { dot: "bg-zinc-500", text: "text-zinc-400" };
					return (
						<div key={p.platform} className="flex items-center gap-2.5">
							<div className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
							<span className={`text-[13px] font-medium ${colors.text}`}>{p.label}</span>
						</div>
					);
				})}
			</div>

			{/* Caption + link */}
			{caption && (
				<div className="mt-auto border-t border-edge/40 pt-2.5">
					<p className="text-[10px] leading-relaxed text-content-faint">{caption}</p>
					<a
						href="/app/workspaces/perspective/revenue"
						className="mt-1.5 inline-block text-[10px] text-indigo-400 hover:underline"
					>
						View spend findings in Revenue →
					</a>
				</div>
			)}
		</div>
	);
}

registerWidget({
	id: "ad_spend_kpi",
	version: 1,
	nameKey: "console.dashboard.widgets.ad_spend.name",
	descriptionKey: "console.dashboard.widgets.ad_spend.description",
	category: "kpi",
	icon: "currency",
	defaultSize: { w: 4, h: 3 },
	minSize: { w: 3, h: 3 },
	maxSize: { w: 6, h: 4 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["adSpend"],
	Component: AdSpendKpiComponent,
});
