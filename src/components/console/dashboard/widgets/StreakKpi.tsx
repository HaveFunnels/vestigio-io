"use client";

// ──────────────────────────────────────────────
// StreakKpi — compact KPI tile (liquid glass)
//
// The current consecutive-day activity streak. Reads from
// `data.activityHeatmap.currentStreak` so it shares the streak
// logic with the heatmap widget — no risk of the two showing
// different numbers.
//
// **Why a separate tile from the heatmap:** the heatmap is dense
// visualization — the eye sees the GRID first. The streak number
// itself is buried in the corner. Promoting it to its own tile
// makes the streak explicitly part of the bento, where it
// becomes a cheap reward to scan ("oh I'm at 14 days, nice").
// ──────────────────────────────────────────────

import { FlameIcon as Flame } from "@phosphor-icons/react/dist/ssr";
import { captionForActivityHeatmap } from "@/lib/dashboard/captions";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

function StreakKpiComponent({ data }: WidgetProps) {
	const { currentStreak } = data.activityHeatmap;
	const caption = captionForActivityHeatmap(data.activityHeatmap);
	const isActive = currentStreak > 0;
	const numberClass = isActive ? "text-amber-400" : "text-content-faint";

	return (
		<div className='relative flex h-full flex-col p-4'>
			{/* Liquid glass backdrop */}
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-300/[0.06] via-transparent to-transparent backdrop-blur-md'
				aria-hidden
			/>
			<div
				className='pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]'
				aria-hidden
			/>

			<div className='relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted'>
				<Flame size={11} weight='bold' className='text-amber-400' />
				<span>Streak</span>
			</div>

			<div className='relative mt-2 flex items-baseline gap-1'>
				<span
					className={`font-mono text-4xl font-medium tabular-nums leading-none ${numberClass}`}
				>
					{currentStreak}
				</span>
				<span className='text-[10px] uppercase tracking-wider text-content-faint'>
					{currentStreak === 1 ? "day" : "days"}
				</span>
			</div>

			<p className='relative mt-auto line-clamp-2 pt-2 text-[11px] leading-snug text-content-secondary'>
				{caption}
			</p>
		</div>
	);
}

registerWidget({
	id: "streak_kpi",
	version: 2,
	nameKey: "console.dashboard.widgets.streak.name",
	descriptionKey: "console.dashboard.widgets.streak.description",
	category: "milestones",
	icon: "flame",
	defaultSize: { w: 2, h: 3 },
	minSize: { w: 2, h: 2 },
	maxSize: { w: 4, h: 3 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["activityHeatmap"],
	Component: StreakKpiComponent,
});
