"use client";

// ──────────────────────────────────────────────
// TopPackKpi — compact KPI tile (liquid glass)
//
// Surfaces the single pack carrying the most monthly exposure right
// now. Reads the first entry of `data.exposure.byPack` (which the
// aggregator already sorts descending), so this widget is just a
// promotion of the top item from the segmented bar to a standalone
// tile.
//
// **Why it matters:** when the user only has 30 seconds to scan the
// dashboard, the answer to "which pack do I open first" should be
// staring at them. The segmented bar in ExposureKpiCard tells you
// the SHAPE of exposure, this tells you the WINNER.
// ──────────────────────────────────────────────

import { CrosshairIcon as Crosshair } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function packLabel(pack: string): string {
	const cleaned = pack.replaceAll("_", " ");
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function TopPackKpiComponent({ data }: WidgetProps) {
	const t = useTranslations("console.dashboard.widgets.top_pack_card");
	const tc = useTranslations("console.common");
	const top = data.exposure.byPack[0];
	const caption =
		top && top.cents > 0
			? t("caption", {
					amount: `$${(top.cents / 100_000).toFixed(1)}k`,
					perMonth: tc("per_month_short"),
				})
			: t("empty_caption");

	return (
		<div className='relative flex h-full flex-col p-4'>
			{/* Liquid glass backdrop */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/[0.05] via-transparent to-transparent backdrop-blur-md'
				aria-hidden
			/>
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]'
				aria-hidden
			/>

			<div className='relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<Crosshair size={11} weight='bold' className='text-emerald-400' />
				<span>{t("label")}</span>
			</div>

			<div className='relative mt-2 flex flex-col gap-0.5'>
				<span className='truncate text-sm font-semibold leading-tight text-content'>
					{top ? packLabel(top.pack) : "—"}
				</span>
				{top && top.cents > 0 && (
					<span className='font-mono text-[11px] tabular-nums text-red-400'>
						−${(top.cents / 100_000).toFixed(1)}k{tc("per_month_short")}
					</span>
				)}
			</div>

			<p className='relative mt-auto line-clamp-2 pt-2 text-[11px] leading-snug text-content-secondary'>
				{caption}
			</p>
		</div>
	);
}

registerWidget({
	id: "top_pack_kpi",
	version: 2,
	nameKey: "console.dashboard.widgets.top_pack.name",
	descriptionKey: "console.dashboard.widgets.top_pack.description",
	category: "kpi",
	icon: "crosshair",
	defaultSize: { w: 2, h: 3 },
	minSize: { w: 2, h: 2 },
	maxSize: { w: 4, h: 3 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["exposure"],
	Component: TopPackKpiComponent,
});
