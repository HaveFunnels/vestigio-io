"use client";

/**
 * CostOfInaction — Wave 11.7c.
 *
 * Aggregates the "$ already lost" across a workspace's open findings.
 *
 * For each negative finding with loss-role impact, we approximate
 * elapsed time as `trend_streak * cycle_interval_days`. Multi-cycle
 * trend tracking (Wave 7.1) populates trend_streak with the number
 * of consecutive cycles the finding has held its current pattern;
 * we treat that as the lower bound on "open for N days". Findings
 * without a streak default to 1 day (current cycle only).
 *
 * Pure 🟢 — uses existing FindingProjection fields, no LLM.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrency } from "@/lib/format-currency";
import type { FindingProjection } from "../../../../packages/projections/types";

interface Props {
	findings: FindingProjection[];
}

// Approximate cycle interval. Vestigio runs daily-ish; treating each
// trend_streak unit as ~1 day understates rather than overstates the
// loss, which is the safer error direction for trust.
const CYCLE_INTERVAL_DAYS = 1;

// When trend_streak is null the finding may be brand-new in this cycle
// OR genuinely never trended (cycle 1 of the env). Defaulting to 1 day
// trivially understates loss for findings that have been hurting
// silently for weeks. 7 days is the standard "since last business
// week" anchor and is the lower bound the UI hints at via
// "Open for ~N days".
const FALLBACK_DAYS_OPEN = 7;

interface FindingLoss {
	id: string;
	title: string;
	dailyBurn: number;
	daysOpen: number;
	totalLost: number;
}

export default function CostOfInaction({ findings }: Props) {
	const t = useTranslations("console.workspaces.detail.cost_of_inaction");
	const mcpData = useMcpData();

	const losses = useMemo<FindingLoss[]>(() => {
		const out: FindingLoss[] = [];
		for (const f of findings) {
			if (f.polarity !== "negative") continue;
			if (f.impact.role !== "loss") continue;
			if (f.impact.midpoint <= 0) continue;
			const daysOpen =
				f.trend_streak != null && f.trend_streak > 0
					? f.trend_streak * CYCLE_INTERVAL_DAYS
					: FALLBACK_DAYS_OPEN;
			const dailyBurn = f.impact.midpoint / 30;
			out.push({
				id: f.id,
				title: f.title,
				dailyBurn,
				daysOpen,
				totalLost: dailyBurn * daysOpen,
			});
		}
		out.sort((a, b) => b.totalLost - a.totalLost);
		return out;
	}, [findings]);

	if (losses.length === 0) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("empty")}</p>
			</section>
		);
	}

	const totalLost = losses.reduce((s, l) => s + l.totalLost, 0);
	const totalDailyBurn = losses.reduce((s, l) => s + l.dailyBurn, 0);
	const top3 = losses.slice(0, 3);

	return (
		<section className="relative overflow-hidden rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/[0.06] via-transparent to-transparent" />
			<div className="relative">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
					<span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
						{t("label")}
					</span>
				</div>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>

				<div className="mt-3 flex flex-wrap items-baseline gap-4">
					<div>
						<div className="font-mono text-2xl font-medium tabular-nums leading-none text-red-500 dark:text-red-400">
							−{fmtCurrency(totalLost, mcpData.currency)}
						</div>
						<div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-content-faint">
							{t("total_lost")}
						</div>
					</div>
					<div>
						<div className="font-mono text-sm font-medium tabular-nums text-red-500 dark:text-red-400">
							−{fmtCurrency(totalDailyBurn, mcpData.currency)}
							<span className="text-[11px] text-content-faint">{t("daily_burn")}</span>
						</div>
					</div>
				</div>

				{top3.length > 0 && (
					<div className="relative mt-4">
						<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
							{t("top_burners")}
						</h3>
						<div className="space-y-1.5">
							{top3.map((loss) => (
								<div
									key={loss.id}
									className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface-card/60 px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12px] font-medium text-content">
											{loss.title}
										</div>
										<div className="mt-0.5 text-[10px] text-content-faint">
											{t("days_open", { days: loss.daysOpen })}
										</div>
									</div>
									<div className="shrink-0 font-mono text-[11px] tabular-nums text-red-500 dark:text-red-400">
										{t("per_finding_lost", {
											amount: fmtCurrency(loss.totalLost, mcpData.currency),
										})}
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
