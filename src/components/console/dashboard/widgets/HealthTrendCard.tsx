"use client";

// ──────────────────────────────────────────────
// HealthTrendCard — composite health score + 30-day trend
//
// The single-number summary of "how is the environment doing right
// now" plus the 30-day shape so the user can see whether things are
// improving, stagnating, or regressing. Big mono number on the
// left, sparkline on the right, sub-score breakdown at the bottom.
//
// **Why it matters (the viciante mechanic):** Health Score is the
// MRR-equivalent of operational health — one number that operators
// check obsessively because it's instantly comparable to last
// week. The 30-day trend gives shape to the obsession: are we
// trending up, did we just flatline, did the last cycle drop us?
// ──────────────────────────────────────────────

import { Pulse } from "@phosphor-icons/react/dist/ssr";
import { registerWidget, type WidgetProps } from "@/lib/dashboard/widget-registry";

function scoreToColorClass(score: number): string {
	if (score >= 80) return "text-emerald-400";
	if (score >= 60) return "text-amber-400";
	return "text-red-400";
}

function scoreToStrokeClass(score: number): string {
	if (score >= 80) return "stroke-emerald-400";
	if (score >= 60) return "stroke-amber-400";
	return "stroke-red-400";
}

// Sparkline as inline SVG — no chart lib needed for a 30-point line
// (and one less dependency to load on a hero card). Path data is
// computed from the trend array, scaled to fit the viewBox.
function Sparkline({ data, colorClass }: { data: number[]; colorClass: string }) {
	const w = 240;
	const h = 60;
	const padding = 4;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = Math.max(1, max - min);
	const points = data.map((v, i) => {
		const x = padding + (i / (data.length - 1)) * (w - padding * 2);
		const y = padding + (1 - (v - min) / range) * (h - padding * 2);
		return `${x},${y}`;
	});
	const pathD = `M ${points.join(" L ")}`;
	// Area fill under the line for visual weight, with a subtle gradient
	const areaD = `${pathD} L ${w - padding},${h - padding} L ${padding},${h - padding} Z`;
	const gradId = `spark-grad-${colorClass}`;
	return (
		<svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" className={colorClass.replace("stroke", "stop")} stopOpacity="0.25" />
					<stop offset="100%" className={colorClass.replace("stroke", "stop")} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={areaD} fill={`url(#${gradId})`} />
			<path d={pathD} fill="none" className={colorClass} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function HealthTrendCardComponent({ data }: WidgetProps) {
	const { current, deltaVsLastCycle, trend30d, components } = data.healthScore;
	const colorClass = scoreToColorClass(current);
	const strokeClass = scoreToStrokeClass(current);
	const deltaPositive = deltaVsLastCycle > 0;
	const deltaSign = deltaPositive ? "+" : deltaVsLastCycle < 0 ? "−" : "±";
	const deltaAbs = Math.abs(deltaVsLastCycle);

	return (
		<div className="flex h-full flex-col p-6">
			{/* Eyebrow */}
			<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
				<Pulse size={12} weight="bold" className="text-emerald-400" />
				<span>Health score</span>
			</div>

			{/* Hero row: big number + delta + sparkline */}
			<div className="mt-3 flex items-end justify-between gap-6">
				<div className="flex items-baseline gap-3">
					<span className={`font-mono text-6xl font-medium leading-none tracking-tight tabular-nums ${colorClass}`}>
						{current}
					</span>
					<span className="font-mono text-xs text-content-faint">/ 100</span>
				</div>
				<div className="flex flex-col items-end gap-1">
					<span
						className={`font-mono text-sm tabular-nums ${
							deltaPositive ? "text-emerald-400" : deltaVsLastCycle < 0 ? "text-red-400" : "text-content-muted"
						}`}
					>
						{deltaSign}
						{deltaAbs} vs last cycle
					</span>
					<span className="text-[10px] text-content-faint">last 30 days</span>
				</div>
			</div>

			{/* Sparkline — fills the available width */}
			<div className="mt-3 flex-1">
				<Sparkline data={trend30d} colorClass={strokeClass} />
			</div>

			{/* Sub-score strip — three components feeding the composite */}
			<div className="mt-3 grid grid-cols-3 divide-x divide-edge/40 border-t border-edge/40 pt-3">
				<div className="flex flex-col gap-0.5 pr-3">
					<span className="text-[10px] uppercase tracking-wider text-content-faint">
						Structural
					</span>
					<span className="font-mono text-sm tabular-nums text-content-secondary">
						{components.structural}
					</span>
				</div>
				<div className="flex flex-col gap-0.5 px-3">
					<span className="text-[10px] uppercase tracking-wider text-content-faint">
						Action quality
					</span>
					<span className="font-mono text-sm tabular-nums text-content-secondary">
						{components.actionQuality}
					</span>
				</div>
				<div className="flex flex-col gap-0.5 pl-3">
					<span className="text-[10px] uppercase tracking-wider text-content-faint">
						Verification
					</span>
					<span className="font-mono text-sm tabular-nums text-content-secondary">
						{components.verification}
					</span>
				</div>
			</div>
		</div>
	);
}

registerWidget({
	id: "health_trend",
	version: 1,
	nameKey: "console.dashboard.widgets.health_trend.name",
	descriptionKey: "console.dashboard.widgets.health_trend.description",
	category: "trends",
	icon: "pulse",
	defaultSize: { w: 8, h: 3 },
	minSize: { w: 6, h: 3 },
	maxSize: { w: 12, h: 4 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["healthScore"],
	Component: HealthTrendCardComponent,
});
