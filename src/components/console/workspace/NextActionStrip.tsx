"use client";

/**
 * NextActionStrip — Wave 11.7a.
 *
 * Persistent top-of-workspace strip that surfaces the ONE highest-
 * priority action linked to findings in this workspace. Uses the
 * existing Wave 3.12 ActionProjection.priority_score ranking; this
 * widget only changes how it surfaces (header strip, not buried in
 * a tab). Click routes to /app/actions for full context.
 *
 * Pure 🟢 — reads existing projection data, no LLM, no new integration.
 */

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrency } from "@/lib/format-currency";
import type { ActionProjection, FindingProjection } from "../../../../packages/projections/types";

interface Props {
	findings: FindingProjection[];
}

// Effort tier → i18n. Same shape used by MoneyOnTheTable.
function formatEffort(
	hours: number | null,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	t: (key: any, args?: any) => string,
): string {
	if (hours == null) return t("effort_unknown");
	if (hours < 8) return t("effort_hours", { hours: Math.max(1, Math.round(hours)) });
	if (hours < 72) return t("effort_days", { days: Math.max(1, Math.round(hours / 8)) });
	return t("effort_weeks", { weeks: Math.max(1, Math.round(hours / 40)) });
}

// Statuses we treat as "done" — strip filters them out so we don't
// keep recommending shipped actions.
const RESOLVED_STATUSES = new Set([
	"resolved",
	"completed",
	"done",
	"shipped",
	"closed",
]);

export default function NextActionStrip({ findings }: Props) {
	const t = useTranslations("console.workspaces.detail.next_action");
	const mcpData = useMcpData();

	const topAction = useMemo<ActionProjection | null>(() => {
		if (mcpData.actions.status !== "ready") return null;
		const allActions = mcpData.actions.data;

		// Collect action ids referenced by this workspace's findings.
		const referencedIds = new Set<string>();
		for (const f of findings) {
			for (const ref of f.action_refs ?? []) {
				referencedIds.add(ref.id);
			}
		}
		if (referencedIds.size === 0) return null;

		const candidates = allActions.filter((a) => {
			if (!referencedIds.has(a.id)) return false;
			if (a.decision_status && RESOLVED_STATUSES.has(a.decision_status.toLowerCase())) {
				return false;
			}
			if (a.operational_status && RESOLVED_STATUSES.has(a.operational_status.toLowerCase())) {
				return false;
			}
			return true;
		});
		if (candidates.length === 0) return null;
		candidates.sort((a, b) => b.priority_score - a.priority_score);
		return candidates[0];
	}, [findings, mcpData.actions]);

	if (!topAction) {
		return (
			<section className="relative overflow-hidden rounded-2xl border border-edge bg-surface-card p-4 shadow-lg">
				<div className="flex items-center gap-3">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
					<span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
						{t("label")}
					</span>
				</div>
				<p className="mt-2 text-[13px] font-medium text-content">{t("empty_title")}</p>
				<p className="mt-0.5 text-[12px] text-content-muted">{t("empty_description")}</p>
			</section>
		);
	}

	const impactMidpoint = topAction.impact?.midpoint ?? 0;

	return (
		<section className="relative overflow-hidden rounded-2xl border border-edge bg-surface-card p-4 shadow-lg">
			{/* Subtle emerald gradient — "do this next" framing */}
			<div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent" />

			<div className="relative flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
						<span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
							{t("label")}
						</span>
						<span className="text-[10px] text-content-faint">·</span>
						<span className="text-[10px] text-content-faint">{t("subtitle")}</span>
					</div>
					<h3 className="mt-2 text-[14px] font-semibold leading-snug text-content">
						{topAction.title}
					</h3>
					{topAction.description && (
						<p className="mt-1 line-clamp-2 text-[12px] leading-snug text-content-muted">
							{topAction.description}
						</p>
					)}
					<div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
						{impactMidpoint > 0 && (
							<span className="font-mono font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
								{t("impact_label")} {fmtCurrency(impactMidpoint, mcpData.currency)}/mo
							</span>
						)}
						<span className="font-mono tabular-nums text-content-muted">
							{formatEffort(topAction.estimated_effort_hours, t)}
						</span>
					</div>
				</div>
				<Link
					href={`/app/actions?action=${encodeURIComponent(topAction.id)}`}
					className="shrink-0 self-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
				>
					{t("view_action")} →
				</Link>
			</div>
		</section>
	);
}
