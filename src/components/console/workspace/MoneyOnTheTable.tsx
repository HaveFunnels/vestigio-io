"use client";

/**
 * MoneyOnTheTable — Revenue workspace hero widget (Wave 11.1a).
 *
 * Single-screen synthesis of monthly $ being lost RIGHT NOW, decomposed
 * by root cause, with the top 3 fixes ranked by impact and explicit
 * effort estimates. Replaces the "abstract finding list" feel with a
 * money-first headline.
 *
 * Pure 🟢 widget — populated by Vestigio findings + impact baselines.
 * No integration dependency.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrency } from "@/lib/format-currency";
import { translateEngineCopy } from "@/lib/engine-i18n";
import SeverityBadge from "@/components/console/SeverityBadge";
import type { FindingProjection } from "../../../../packages/projections/types";

interface Props {
	findings: FindingProjection[];
	onFindingClick?: (finding: FindingProjection) => void;
}

interface CauseBucket {
	key: string;
	label: string;
	total: number;
	count: number;
}

// Effort tier → i18n key + formatted argument.
// estimated_effort_hours can be null when the engine hasn't calibrated
// the action template yet; render a TBD label in that case.
// Type `t` loosely because next-intl's narrow key typing fights with
// generic helpers — the call sites still validate against the namespace.
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

export default function MoneyOnTheTable({ findings, onFindingClick }: Props) {
	const t = useTranslations("console.workspaces.detail.money_on_table");
	const tc = useTranslations("console.common");
	const tEngine = useTranslations("engine");
	const { currency } = useMcpData();

	// Filter: only negative findings with loss role contribute. Retention
	// (money the business is keeping due to a working control) is NOT
	// money on the table — it's money already saved.
	const losses = useMemo(
		() =>
			findings.filter(
				(f) => f.polarity === "negative" && f.impact.role === "loss" && f.impact.midpoint > 0,
			),
		[findings],
	);

	const totalLoss = useMemo(
		() => losses.reduce((s, f) => s + f.impact.midpoint, 0),
		[losses],
	);

	// Decomposition: group by root_cause, sort by aggregate impact.
	// We surface top 4 explicit buckets + an "others" bucket so the bar
	// chart stays readable even when the workspace has many causes.
	const buckets = useMemo<CauseBucket[]>(() => {
		const map = new Map<string, CauseBucket>();
		const uncategorizedLabel = t("uncategorized");
		for (const f of losses) {
			const key = f.root_cause ?? "__uncategorized__";
			const existing = map.get(key);
			if (existing) {
				existing.total += f.impact.midpoint;
				existing.count += 1;
			} else {
				// Bucket label: prefer the locale-translated inference title
				// over the raw English `root_cause` text baked into the
				// projection by the engine. Falls back to "uncategorized"
				// when both are missing.
				const translated = f.inference_key
					? translateEngineCopy(f.inference_key, f.root_cause, tEngine)
					: f.root_cause;
				const label = translated && translated.trim().length > 0 ? translated : uncategorizedLabel;
				map.set(key, {
					key,
					label,
					total: f.impact.midpoint,
					count: 1,
				});
			}
		}
		const sorted = Array.from(map.values()).sort((a, b) => b.total - a.total);
		if (sorted.length <= 5) return sorted;
		const top = sorted.slice(0, 4);
		const rest = sorted.slice(4);
		const restTotal = rest.reduce((s, b) => s + b.total, 0);
		const restCount = rest.reduce((s, b) => s + b.count, 0);
		top.push({
			key: "__others__",
			label: t("others_label", { count: rest.length }),
			total: restTotal,
			count: restCount,
		});
		return top;
	}, [losses, t]);

	// Top 3 fixes: individual findings with the highest impact midpoint.
	// We prefer specific findings (over root-cause aggregates) here so the
	// user can drill straight into the source evidence with one click.
	const top3 = useMemo(
		() => [...losses].sort((a, b) => b.impact.midpoint - a.impact.midpoint).slice(0, 3),
		[losses],
	);

	if (losses.length === 0 || totalLoss <= 0) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="text-[13px] text-content-muted">{t("empty")}</p>
			</section>
		);
	}

	const maxBucket = buckets[0]?.total ?? 1;

	return (
		<section className="relative overflow-hidden rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			{/* Subtle red gradient — loss framing without screaming */}
			<div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/[0.06] via-transparent to-transparent" />

			{/* Hero zone */}
			<div className="relative">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
					<span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
						{t("label")}
					</span>
				</div>
				<div className="mt-2 flex items-baseline gap-2">
					<span className="font-mono text-3xl font-medium tabular-nums leading-none text-red-500 dark:text-red-400">
						−{fmtCurrency(totalLoss, currency)}
					</span>
					<span className="text-[11px] text-content-muted">{tc("per_month_short")}</span>
				</div>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
			</div>

			{/* Decomposition */}
			{buckets.length > 0 && (
				<div className="relative mt-5">
					<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
						{t("breakdown_heading")}
					</h3>
					<div className="space-y-1.5">
						{buckets.map((b) => {
							const widthPct = Math.max(4, Math.round((b.total / maxBucket) * 100));
							return (
								<div key={b.key} className="flex items-center gap-3">
									<div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-inset/60">
										<div
											className="h-full rounded-md bg-gradient-to-r from-red-500/30 via-red-500/20 to-red-500/10"
											style={{ width: `${widthPct}%` }}
										/>
										<div className="absolute inset-0 flex items-center px-2">
											<span className="truncate text-[11px] text-content-secondary">
												{b.label}
											</span>
										</div>
									</div>
									<span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-red-500 dark:text-red-400">
										{fmtCurrency(b.total, currency)}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Top 3 fixes */}
			{top3.length > 0 && (
				<div className="relative mt-5">
					<h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
						{t("top_fixes_heading")}
					</h3>
					<div className="space-y-2">
						{top3.map((f) => (
							<button
								key={f.id}
								type="button"
								onClick={() => onFindingClick?.(f)}
								className="group flex w-full items-start gap-3 rounded-xl border border-edge bg-surface-card/60 px-3 py-2.5 text-left transition-colors hover:border-content-faint hover:bg-surface-card-hover"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-start gap-2">
										<SeverityBadge value={f.severity} />
										<span className="text-[13px] font-medium text-content">
											{f.title}
										</span>
									</div>
									<div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
										<span className="font-mono font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
											{t("recover_estimate", {
												amount: fmtCurrency(f.impact.midpoint, currency),
											})}
										</span>
										<span className="text-content-faint">·</span>
										<span className="font-mono tabular-nums text-content-muted">
											{formatEffort(f.estimated_effort_hours, t)}
										</span>
									</div>
								</div>
								<span className="mt-0.5 shrink-0 text-content-faint opacity-0 transition-opacity group-hover:opacity-100">
									<svg
										className="h-3.5 w-3.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M8.25 4.5l7.5 7.5-7.5 7.5"
										/>
									</svg>
								</span>
							</button>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
