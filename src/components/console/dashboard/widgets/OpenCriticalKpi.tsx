"use client";

// ──────────────────────────────────────────────
// OpenCriticalKpi — compact KPI tile (liquid glass)
//
// One number: how many open critical findings the user has right
// now, plus the cycle-over-cycle delta. Designed to live in the
// narrow right column of the bento layout, h=2 w=3.
//
// **Liquid glass treatment:** the tile uses a frosted background
// (`bg-white/[0.03]` + `backdrop-blur-md`) with a subtle inner
// highlight border so it reads as a "light surface" floating above
// the heavier solid cards. Subtle, not Apple-loud — enough to
// differentiate the compact tiles from the main cards without
// shouting.
//
// **Why critical-only:** users obsess over this number. It's the
// "what could lose me money TODAY" gauge. Showing it as its own
// tile makes it impossible to miss when scanning the dashboard.
// ──────────────────────────────────────────────

import { SkullIcon as Skull } from "@phosphor-icons/react/dist/ssr";
import { captionForOpenCritical } from "@/lib/dashboard/captions";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function OpenCriticalKpiComponent({ data }: WidgetProps) {
	const { criticalOpenCount, criticalDeltaVsLastCycle } = data.exposure;
	const caption = captionForOpenCritical(
		criticalOpenCount,
		criticalDeltaVsLastCycle
	);
	const isClean = criticalOpenCount === 0;
	const numberClass = isClean ? "text-emerald-400" : "text-red-400";
	const deltaPositive = criticalDeltaVsLastCycle > 0;
	const deltaNegative = criticalDeltaVsLastCycle < 0;

	return (
		<div className='relative flex h-full flex-col p-5'>
			{/* Liquid glass backdrop */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/[0.06] via-transparent to-transparent backdrop-blur-md'
				aria-hidden
			/>
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]'
				aria-hidden
			/>

			{/* Eyebrow */}
			<div className='relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<Skull
					size={11}
					weight='bold'
					className={isClean ? "text-emerald-400" : "text-red-400"}
				/>
				<span>Open critical</span>
			</div>

			{/* Hero number + delta */}
			<div className='relative mt-2 flex items-baseline gap-3'>
				<span
					className={`font-mono text-5xl font-medium tabular-nums leading-none ${numberClass}`}
				>
					{criticalOpenCount}
				</span>
				{criticalDeltaVsLastCycle !== 0 && (
					<span
						className={`font-mono text-xs tabular-nums ${
							deltaPositive
								? "text-red-400"
								: deltaNegative
									? "text-emerald-400"
									: "text-content-muted"
						}`}
					>
						{deltaPositive ? "+" : ""}
						{criticalDeltaVsLastCycle} cycle
					</span>
				)}
			</div>

			{/* Caption — pushed to the bottom */}
			<p className='relative mt-auto line-clamp-2 pt-2 text-[11px] leading-snug text-content-secondary'>
				{caption}
			</p>
		</div>
	);
}

registerWidget({
	id: "open_critical_kpi",
	version: 2,
	nameKey: "console.dashboard.widgets.open_critical.name",
	descriptionKey: "console.dashboard.widgets.open_critical.description",
	category: "kpi",
	icon: "skull",
	defaultSize: { w: 3, h: 3 },
	minSize: { w: 2, h: 2 },
	maxSize: { w: 4, h: 3 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["exposure"],
	Component: OpenCriticalKpiComponent,
});
