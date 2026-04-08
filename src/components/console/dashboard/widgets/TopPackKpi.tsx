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

import { Crosshair } from "@phosphor-icons/react/dist/ssr";
import { captionForTopPack } from "@/lib/dashboard/captions";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function packLabel(pack: string): string {
	const cleaned = pack.replaceAll("_", " ");
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function TopPackKpiComponent({ data }: WidgetProps) {
	const top = data.exposure.byPack[0];
	const caption = top
		? captionForTopPack(top.pack, top.cents)
		: captionForTopPack("", 0);

	return (
		<div className='relative flex h-full flex-col justify-between overflow-hidden p-5'>
			{/* Liquid glass backdrop */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.04] via-transparent to-transparent backdrop-blur-md'
				aria-hidden
			/>
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]'
				aria-hidden
			/>

			<div className='relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<Crosshair size={11} weight='bold' className='text-emerald-400' />
				<span>Top exposure pack</span>
			</div>

			<div className='relative flex flex-col gap-0.5'>
				<span className='truncate text-base font-semibold leading-tight text-content'>
					{top ? packLabel(top.pack) : "—"}
				</span>
				{top && top.cents > 0 && (
					<span className='font-mono text-[11px] tabular-nums text-content-muted'>
						${(top.cents / 100_000).toFixed(1)}k/mo
					</span>
				)}
			</div>

			<p className='relative line-clamp-2 text-[11px] leading-snug text-content-muted'>
				{caption}
			</p>
		</div>
	);
}

registerWidget({
	id: "top_pack_kpi",
	version: 1,
	nameKey: "console.dashboard.widgets.top_pack.name",
	descriptionKey: "console.dashboard.widgets.top_pack.description",
	category: "kpi",
	icon: "crosshair",
	defaultSize: { w: 3, h: 2 },
	minSize: { w: 2, h: 2 },
	maxSize: { w: 4, h: 3 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["exposure"],
	Component: TopPackKpiComponent,
});
