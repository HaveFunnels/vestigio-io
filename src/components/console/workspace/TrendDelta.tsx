"use client";

/**
 * TrendDelta — Wave 11.7b.
 *
 * Inline pill placed beside a count metric (issue count, finding
 * total, etc.) showing the net cycle-over-cycle delta. Subtle but
 * creates strong sense-of-movement — the existing WorkspaceChange-
 * Trend renders a separate paragraph; this is the per-number
 * annotation that lives at the metric.
 *
 * Net count change is derived from the existing change_summary:
 *   net_change = improvement_count + resolved_count − regression_count
 *
 * Positive → fewer open issues this cycle (green, prefixed "−").
 * Negative → more open issues this cycle (red, prefixed "+").
 * Zero → renders nothing.
 *
 * Loss-magnitude deltas (% change in dollar exposure) would require
 * loading the previous cycle's WorkspaceProjection summary, which
 * isn't in the current projection layer. Out of scope for V1.
 */

import type { WorkspaceProjection } from "../../../../packages/projections/types";

interface Props {
	summary: WorkspaceProjection["change_summary"];
	/** When true, dims the pill (used inside hover/secondary contexts). */
	muted?: boolean;
}

export default function TrendDelta({ summary, muted = false }: Props) {
	if (!summary) return null;
	const net =
		(summary.improvement_count ?? 0) + (summary.resolved_count ?? 0) -
		(summary.regression_count ?? 0);
	if (net === 0) return null;

	const isImprovement = net > 0;
	const sign = isImprovement ? "−" : "+";
	const abs = Math.abs(net);
	const colorClass = isImprovement
		? `text-emerald-600 dark:text-emerald-400 ${muted ? "" : "bg-emerald-500/10"}`
		: `text-red-500 dark:text-red-400 ${muted ? "" : "bg-red-500/10"}`;

	return (
		<span
			className={`inline-flex items-center gap-0.5 ${muted ? "" : "rounded-full px-1.5 py-0.5"} font-mono text-[10px] font-medium tabular-nums ${colorClass}`}
			title={
				isImprovement
					? `${abs} fewer open issues vs last cycle`
					: `${abs} more open issues vs last cycle`
			}
		>
			{sign}
			{abs}
		</span>
	);
}
