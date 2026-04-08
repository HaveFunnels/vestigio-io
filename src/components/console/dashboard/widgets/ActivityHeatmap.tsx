"use client";

// ──────────────────────────────────────────────
// ActivityHeatmap — GitHub-style 90-day grid of cycles + actions
//
// Each square = one day, intensity by combined activity count.
// Days with no activity stay surface-card; busier days fade up the
// emerald scale. Bottom corner shows the current consecutive-day
// streak — light touch, no Duolingo alarm.
//
// **Why it matters (the viciante mechanic):** GitHub's contribution
// graph is the proof that visualization-of-consistency creates
// emotional pressure to maintain a streak WITHOUT ever saying the
// word "streak". Operators see a row of dim squares and the gut
// reaction is "I should run a cycle today". That gut reaction IS
// the dopamine hook.
// ──────────────────────────────────────────────

import { Calendar } from "@phosphor-icons/react/dist/ssr";
import { registerWidget, type WidgetProps } from "@/lib/dashboard/widget-registry";
import type { ActivityHeatmapDay } from "@/lib/dashboard/types";

// Map a count to a 5-step intensity scale. Tuned so a single cycle
// shows clearly above the empty state, and a "good day" of 3+
// activities saturates near full intensity.
function intensityClass(count: number): string {
	if (count === 0) return "bg-surface-inset";
	if (count === 1) return "bg-emerald-900/60";
	if (count === 2) return "bg-emerald-700/70";
	if (count <= 4) return "bg-emerald-600/80";
	return "bg-emerald-500";
}

function DayCell({ day }: { day: ActivityHeatmapDay }) {
	const tooltip = `${day.date} · ${day.cycles} cycle${day.cycles === 1 ? "" : "s"} · ${day.actionsResolved} action${day.actionsResolved === 1 ? "" : "s"} resolved`;
	return (
		<div
			className={`h-2.5 w-2.5 rounded-[2px] ${intensityClass(day.count)} transition-colors hover:ring-1 hover:ring-emerald-400/50`}
			title={tooltip}
		/>
	);
}

function ActivityHeatmapComponent({ data }: WidgetProps) {
	const { days, currentStreak } = data.activityHeatmap;

	// Group days into weeks (columns of 7) so the grid renders
	// week-by-week left to right, oldest to newest. The first
	// "column" might be partial if the start date isn't a Sunday;
	// we pad the start so each column is exactly 7 cells.
	const totalWeeks = Math.ceil(days.length / 7);
	const weeks: ActivityHeatmapDay[][] = [];
	let pointer = 0;
	for (let w = 0; w < totalWeeks; w++) {
		const slice = days.slice(pointer, pointer + 7);
		weeks.push(slice);
		pointer += 7;
	}

	return (
		<div className="flex h-full flex-col p-6">
			{/* Eyebrow */}
			<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
				<Calendar size={12} weight="bold" className="text-emerald-400" />
				<span>Activity</span>
			</div>

			{/* Streak readout — sits subtly below the eyebrow, no exclamation */}
			<div className="mt-2 flex items-baseline gap-2">
				<span className="font-mono text-3xl font-medium leading-none tracking-tight text-content tabular-nums">
					{currentStreak}
				</span>
				<span className="text-[11px] uppercase tracking-wider text-content-muted">
					day streak
				</span>
			</div>

			{/* The grid itself — flex of vertical week columns */}
			<div className="mt-4 flex flex-1 items-end gap-1 overflow-hidden">
				{weeks.map((week, wi) => (
					<div key={wi} className="flex flex-col gap-1">
						{week.map((day) => (
							<DayCell key={day.date} day={day} />
						))}
					</div>
				))}
			</div>

			{/* Legend — minimal, three swatches showing the intensity scale */}
			<div className="mt-3 flex items-center gap-2 border-t border-edge/40 pt-2 text-[10px] text-content-faint">
				<span>less</span>
				<div className="flex gap-1">
					<div className="h-2 w-2 rounded-[2px] bg-surface-inset" />
					<div className="h-2 w-2 rounded-[2px] bg-emerald-900/60" />
					<div className="h-2 w-2 rounded-[2px] bg-emerald-700/70" />
					<div className="h-2 w-2 rounded-[2px] bg-emerald-600/80" />
					<div className="h-2 w-2 rounded-[2px] bg-emerald-500" />
				</div>
				<span>more</span>
				<span className="ml-auto">90 days</span>
			</div>
		</div>
	);
}

registerWidget({
	id: "activity_heatmap",
	version: 1,
	nameKey: "console.dashboard.widgets.activity_heatmap.name",
	descriptionKey: "console.dashboard.widgets.activity_heatmap.description",
	category: "activity",
	icon: "calendar",
	defaultSize: { w: 4, h: 3 },
	minSize: { w: 4, h: 3 },
	maxSize: { w: 8, h: 4 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["activityHeatmap"],
	Component: ActivityHeatmapComponent,
});
