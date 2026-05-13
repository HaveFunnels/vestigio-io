"use client";

/**
 * TrendDelta — Wave 11.7b.
 *
 * Inline pill placed beside a count metric (issue count, finding
 * total, etc.) showing the net cycle-over-cycle delta in OPEN
 * ISSUE COUNT. Subtle but creates strong sense-of-movement — the
 * existing WorkspaceChangeTrend renders a separate paragraph; this
 * is the per-number annotation that lives next to the count.
 *
 * Net count change is derived from change_summary:
 *
 *   net = resolved_count − regression_count
 *
 * Important: `improvement_count` is NOT included here. An
 * "improvement" means a finding's severity went down — the finding
 * is still open, so the issue count doesn't change. Only
 * `resolved_count` (findings that no longer fire) reduces the open
 * count, and only `regression_count` (new or re-fired findings)
 * increases it.
 *
 * Positive → fewer open issues this cycle (green, prefixed "−").
 * Negative → more open issues this cycle (red, prefixed "+").
 * Zero → renders nothing.
 */

import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../../packages/projections/types";

interface Props {
	summary: WorkspaceProjection["change_summary"];
	/** When true, dims the pill (used inside hover/secondary contexts). */
	muted?: boolean;
}

export default function TrendDelta({ summary, muted = false }: Props) {
	const t = useTranslations("console.workspaces.detail.trend_delta");
	if (!summary) return null;
	const net = (summary.resolved_count ?? 0) - (summary.regression_count ?? 0);
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
			title={isImprovement ? t("fewer", { count: abs }) : t("more", { count: abs })}
		>
			{sign}
			{abs}
		</span>
	);
}
