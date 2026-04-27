"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ActionProjection } from "../../../../packages/projections/types";

// ──────────────────────────────────────────────
// ScatterPlot — Effort × Impact 2D visualization
//
// SVG-based, no charting library. Each dot = one action.
// X-axis: effort_hint (5 discrete positions)
// Y-axis: impact.midpoint (continuous, $ scale)
// Color: incidents (red), opportunities (emerald)
// Quadrants: Quick wins, Big bets, Fill-ins, Strategic
//
// Click a dot → opens the action drawer via onSelect callback.
// ──────────────────────────────────────────────

interface Props {
	actions: ActionProjection[];
	onSelect: (action: ActionProjection) => void;
}

const EFFORT_X: Record<string, number> = {
	trivial: 0.1,
	low: 0.25,
	medium: 0.5,
	high: 0.75,
	very_high: 0.9,
};

const EFFORT_LABELS = ["Trivial", "Low", "Medium", "High", "Very High"];

function getColor(category: string): string {
	if (category === "incident") return "#ef4444"; // red-500
	if (category === "opportunity") return "#10b981"; // emerald-500
	if (category === "verification") return "#3b82f6"; // blue-500
	return "#71717a"; // zinc-500
}

function getOpacity(status: string | null): number {
	if (!status) return 1;
	if (status === "verified" || status === "resolved") return 0.4;
	if (status === "accepted" || status === "implemented") return 0.7;
	return 1;
}

function getRadius(confidence: number): number {
	if (confidence >= 70) return 8;
	if (confidence >= 40) return 6;
	return 4;
}

export default function ScatterPlot({ actions, onSelect }: Props) {
	const t = useTranslations("console.actions.scatter");

	// SVG dimensions
	const W = 700;
	const H = 400;
	const PAD = { top: 30, right: 30, bottom: 40, left: 60 };
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;

	// Compute max impact for Y-axis scaling
	const maxImpact = useMemo(() => {
		const max = Math.max(...actions.map((a) => a.impact?.midpoint || 0), 100);
		return Math.ceil(max / 100) * 100; // round up to nearest $100
	}, [actions]);

	// Map actions to dot positions
	const dots = useMemo(() => {
		return actions
			.filter((a) => a.effort_hint && a.impact?.midpoint)
			.map((a) => {
				const x = EFFORT_X[a.effort_hint!] ?? 0.5;
				const y = (a.impact!.midpoint / maxImpact);
				return {
					action: a,
					cx: PAD.left + x * plotW,
					cy: PAD.top + (1 - y) * plotH, // invert Y (top = high $)
					r: getRadius(a.confidence),
					fill: getColor(a.category),
					opacity: getOpacity(a.operational_status),
				};
			});
	}, [actions, maxImpact, plotW, plotH]);

	// Quadrant midpoints
	const midX = PAD.left + plotW * 0.5;
	const midY = PAD.top + plotH * 0.5;

	return (
		<div className="w-full overflow-x-auto rounded-lg border border-edge bg-surface-card/40 p-4">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				style={{ minWidth: 500, maxHeight: 420 }}
			>
				{/* Quadrant lines (dashed) */}
				<line
					x1={midX} y1={PAD.top} x2={midX} y2={PAD.top + plotH}
					stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 4"
				/>
				<line
					x1={PAD.left} y1={midY} x2={PAD.left + plotW} y2={midY}
					stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 4"
				/>

				{/* Quadrant labels */}
				<text x={PAD.left + plotW * 0.15} y={PAD.top + 16} fontSize={10} fill="currentColor" opacity={0.3} textAnchor="middle">
					{t("quick_wins")}
				</text>
				<text x={PAD.left + plotW * 0.85} y={PAD.top + 16} fontSize={10} fill="currentColor" opacity={0.3} textAnchor="middle">
					{t("big_bets")}
				</text>
				<text x={PAD.left + plotW * 0.15} y={PAD.top + plotH - 8} fontSize={10} fill="currentColor" opacity={0.3} textAnchor="middle">
					{t("fill_ins")}
				</text>
				<text x={PAD.left + plotW * 0.85} y={PAD.top + plotH - 8} fontSize={10} fill="currentColor" opacity={0.3} textAnchor="middle">
					{t("strategic")}
				</text>

				{/* Y-axis labels */}
				<text x={PAD.left - 8} y={PAD.top + 4} fontSize={9} fill="currentColor" opacity={0.5} textAnchor="end">
					${maxImpact >= 1000 ? `${(maxImpact / 1000).toFixed(0)}k` : maxImpact}
				</text>
				<text x={PAD.left - 8} y={midY + 3} fontSize={9} fill="currentColor" opacity={0.5} textAnchor="end">
					${maxImpact >= 2000 ? `${(maxImpact / 2000).toFixed(0)}k` : Math.round(maxImpact / 2)}
				</text>
				<text x={PAD.left - 8} y={PAD.top + plotH + 4} fontSize={9} fill="currentColor" opacity={0.5} textAnchor="end">
					$0
				</text>

				{/* X-axis labels */}
				{EFFORT_LABELS.map((label, i) => (
					<text
						key={label}
						x={PAD.left + (i / 4) * plotW}
						y={PAD.top + plotH + 24}
						fontSize={9}
						fill="currentColor"
						opacity={0.5}
						textAnchor="middle"
					>
						{label}
					</text>
				))}

				{/* Axis labels */}
				<text x={PAD.left + plotW / 2} y={H - 4} fontSize={10} fill="currentColor" opacity={0.4} textAnchor="middle">
					{t("effort_axis")}
				</text>
				<text
					x={12} y={PAD.top + plotH / 2}
					fontSize={10} fill="currentColor" opacity={0.4}
					textAnchor="middle"
					transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
				>
					{t("impact_axis")}
				</text>

				{/* Dots */}
				{dots.map((dot, i) => (
					<circle
						key={i}
						cx={dot.cx}
						cy={dot.cy}
						r={dot.r}
						fill={dot.fill}
						opacity={dot.opacity}
						className="cursor-pointer transition-all hover:opacity-100"
						strokeWidth={1}
						stroke={dot.fill}
						strokeOpacity={0.3}
						onClick={() => onSelect(dot.action)}
					>
						<title>
							{dot.action.title} ({dot.action.category}) — ${dot.action.impact?.midpoint}/mo, {dot.action.effort_hint} effort
						</title>
					</circle>
				))}
			</svg>

			{/* Legend */}
			<div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-content-faint">
				<span className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-red-500" />
					Incident
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
					Opportunity
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
					Verification
				</span>
			</div>
		</div>
	);
}
