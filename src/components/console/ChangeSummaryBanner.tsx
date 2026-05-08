"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import type { ChangeReportProjection } from "../../../packages/projections";

const trendConfig: Record<
	string,
	{ arrow: string; color: string; textColor: string }
> = {
	degrading: {
		arrow: "\u2191",
		color: "border-red-500/40 bg-red-500/[0.06] shadow-[0_8px_24px_-14px_rgba(239,68,68,0.22)]",
		textColor: "text-red-600 dark:text-red-400",
	},
	improving: {
		arrow: "\u2193",
		color: "border-emerald-500/40 bg-emerald-500/[0.06] shadow-[0_8px_24px_-14px_rgba(16,185,129,0.22)]",
		textColor: "text-emerald-600 dark:text-emerald-400",
	},
	stable: {
		arrow: "\u2014",
		color: "border-edge bg-surface-card",
		textColor: "text-content-muted",
	},
	mixed: {
		arrow: "\u2195",
		color: "border-amber-500/40 bg-amber-500/[0.06] shadow-[0_8px_24px_-14px_rgba(245,158,11,0.22)]",
		textColor: "text-amber-600 dark:text-amber-400",
	},
};

interface Props {
	report: ChangeReportProjection;
	/** i18n namespace for changeBanner keys (default: console.actions) */
	translationNamespace?: string;
}

export default function ChangeSummaryBanner({ report, translationNamespace = "console.actions" }: Props) {
	const t = useTranslations(translationNamespace);
	const [expanded, setExpanded] = useState(false);

	const trend = trendConfig[report.overall_trend] || trendConfig.stable;
	const allChanges = [
		...report.regressions,
		...report.improvements,
		...report.new_issues,
		...report.resolved,
	];
	const hasChanges =
		report.regression_count > 0 ||
		report.improvement_count > 0 ||
		report.new_issue_count > 0 ||
		report.resolved_count > 0;

	if (!hasChanges) return null;

	return (
		<div className={`rounded-lg border ${trend.color} transition-all`}>
			<button
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
					<div className="flex items-center gap-2">
						<span className={`text-lg font-bold ${trend.textColor}`}>
							{trend.arrow}
						</span>
						<span className="text-sm text-content-secondary">
							{[
								report.regression_count > 0 && `${report.regression_count} ${t("changeBanner.regression", { count: report.regression_count })}`,
								report.improvement_count > 0 && `${report.improvement_count} ${t("changeBanner.improvement", { count: report.improvement_count })}`,
								report.new_issue_count > 0 && `${report.new_issue_count} ${t("changeBanner.new")}`,
								report.resolved_count > 0 && `${report.resolved_count} ${t("changeBanner.resolved")}`,
							].filter(Boolean).join(", ")}
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
						{report.regression_count > 0 && (
							<span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
								{report.regression_count} {t("changeBanner.regression", { count: report.regression_count })}
							</span>
						)}
						{report.improvement_count > 0 && (
							<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
								{report.improvement_count} {t("changeBanner.improvement", { count: report.improvement_count })}
							</span>
						)}
						{report.resolved_count > 0 && (
							<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
								{report.resolved_count} {t("changeBanner.resolved")}
							</span>
						)}
						{report.new_issue_count > 0 && (
							<span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
								{report.new_issue_count} {t("changeBanner.new")}
							</span>
						)}
					</div>
				</div>

				<svg
					className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${expanded ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{expanded && allChanges.length > 0 && (
				<div className="border-t border-edge px-4 py-4">
					<ChangeTimeline changes={allChanges} maxItems={10} />
				</div>
			)}
		</div>
	);
}
