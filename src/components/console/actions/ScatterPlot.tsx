"use client";

import { useMemo, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrency } from "@/lib/format-currency";
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
	const tc = useTranslations("console.common");
	const { currency } = useMcpData();
	const [hovered, setHovered] = useState<{ action: ActionProjection; x: number; y: number } | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);

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

	// Map actions to dot positions — default effort to 'medium' when missing
	const dots = useMemo(() => {
		return actions
			.filter((a) => a.impact?.midpoint != null)
			.map((a) => {
				const x = EFFORT_X[a.effort_hint ?? 'medium'] ?? 0.5;
				const y = Math.max(0.02, a.impact!.midpoint / maxImpact);
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

	const handleDotHover = (action: ActionProjection, e: React.MouseEvent) => {
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const scaleX = rect.width / W;
		const scaleY = rect.height / H;
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		setHovered({ action, x, y });
	};

	return (
		<div className="relative w-full overflow-x-auto rounded-lg border border-edge bg-surface-card/40 p-4">
			<svg
				ref={svgRef}
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				style={{ minWidth: 500, maxHeight: 420 }}
				onMouseLeave={() => setHovered(null)}
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
						r={hovered?.action.id === dot.action.id ? dot.r + 2 : dot.r}
						fill={dot.fill}
						opacity={hovered?.action.id === dot.action.id ? 1 : dot.opacity}
						className="cursor-pointer transition-all"
						strokeWidth={hovered?.action.id === dot.action.id ? 2 : 1}
						stroke={dot.fill}
						strokeOpacity={hovered?.action.id === dot.action.id ? 0.8 : 0.3}
						onClick={() => onSelect(dot.action)}
						onMouseEnter={(e) => handleDotHover(dot.action, e)}
						onMouseMove={(e) => handleDotHover(dot.action, e)}
						onMouseLeave={() => setHovered(null)}
					/>
				))}
			</svg>

			{/* Hover popover */}
			{hovered && (
				<div
					className="pointer-events-none absolute z-50 w-64 rounded-lg border border-edge bg-surface-card px-3.5 py-2.5 shadow-xl"
					style={{ left: Math.min(hovered.x + 12, (svgRef.current?.getBoundingClientRect().width ?? 500) - 280), top: hovered.y - 8 }}
				>
					<p className="text-sm font-medium text-content">{hovered.action.title}</p>
					<div className="mt-1.5 flex items-center gap-3 text-[11px]">
						<span className="flex items-center gap-1">
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: getColor(hovered.action.category) }}
							/>
							<span className="capitalize text-content-muted">{hovered.action.category}</span>
						</span>
						<span className="font-mono text-content-secondary">
							{fmtCurrency(hovered.action.impact?.midpoint ?? 0, currency)}{tc("per_month_short")}
						</span>
					</div>
					{hovered.action.severity && (
						<div className="mt-1 text-[10px] text-content-faint">
							{tc(`severity.${hovered.action.severity}`)} · {hovered.action.effort_hint ?? 'medium'} effort
						</div>
					)}
				</div>
			)}

			{/* Legend */}
			<div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-content-faint">
				<span className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-red-500" />
					{t("legend_incident")}
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
					{t("legend_opportunity")}
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
					{t("legend_verification")}
				</span>
			</div>
		</div>
	);
}
