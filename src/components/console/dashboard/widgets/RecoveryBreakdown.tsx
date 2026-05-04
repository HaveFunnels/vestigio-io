"use client";

// ──────────────────────────────────────────────
// RecoveryBreakdown — Wave 7.2
//
// Per-action revenue recovery attribution. Shows which resolved
// findings correlate with actual revenue improvements, with
// confidence scoring (strong / correlation / inconclusive).
//
// Companion to MoneyRecoveredTicker: the ticker shows the total,
// this widget shows the evidence behind it.
//
// Fetches from /api/dashboard/recovery independently.
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
	CheckCircle as CheckIcon,
	ArrowRight as ArrowIcon,
	Question as QuestionIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

interface RecoveryEstimate {
	finding_key: string;
	revenue_delta_next_cycle: number | null;
	confidence: "strong_correlation" | "correlation" | "inconclusive";
	narrative: string;
	estimated_impact_at_resolution: { min: number; max: number };
}

interface RecoveryData {
	estimates: RecoveryEstimate[];
	total_estimated_recovery_monthly: number;
	by_confidence: {
		strong: { count: number; total_cents: number };
		correlated: { count: number; total_cents: number };
		inconclusive: { count: number; total_cents: number };
	};
	data_source: string;
}

const CONFIDENCE_CONFIG = {
	strong_correlation: {
		icon: CheckIcon,
		style: "text-emerald-400",
		bgStyle: "bg-emerald-500/10 border-emerald-500/20",
		labelKey: "strong",
	},
	correlation: {
		icon: ArrowIcon,
		style: "text-amber-400",
		bgStyle: "bg-amber-500/10 border-amber-500/20",
		labelKey: "correlated",
	},
	inconclusive: {
		icon: QuestionIcon,
		style: "text-zinc-500",
		bgStyle: "bg-zinc-500/10 border-zinc-500/20",
		labelKey: "inconclusive",
	},
} as const;

function formatCents(cents: number): string {
	const dollars = Math.abs(cents) / 100;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(dollars);
}

function RecoveryBreakdownComponent({ data: _data }: WidgetProps) {
	const t = useTranslations("console.dashboard.widgets.recovery_breakdown");
	const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const res = await fetch("/api/dashboard/recovery?lookback=10");
				if (res.ok && !cancelled) {
					setRecoveryData(await res.json());
				}
			} catch {
				// Non-fatal
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => { cancelled = true; };
	}, []);

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
			</div>
		);
	}

	if (!recoveryData || recoveryData.estimates.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
				<CheckIcon size={28} className="text-zinc-500" />
				<p className="text-sm text-zinc-400">{t("no_data")}</p>
				<p className="text-xs text-zinc-500">{t("no_data_hint")}</p>
			</div>
		);
	}

	const { estimates, by_confidence } = recoveryData;
	const actionable = estimates.filter(e => e.confidence !== "inconclusive");
	const topEstimates = actionable.slice(0, 5);

	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden">
			{/* Header with confidence tier summary */}
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
					{t("eyebrow")}
				</span>
				<div className="flex gap-2">
					{by_confidence.strong.count > 0 && (
						<span className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
							{by_confidence.strong.count} {t("strong")}
						</span>
					)}
					{by_confidence.correlated.count > 0 && (
						<span className="flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
							{by_confidence.correlated.count} {t("correlated")}
						</span>
					)}
				</div>
			</div>

			{/* Per-action recovery list */}
			<div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
				{topEstimates.map((est) => {
					const conf = CONFIDENCE_CONFIG[est.confidence];
					const Icon = conf.icon;
					const estImpact = (est.estimated_impact_at_resolution.min + est.estimated_impact_at_resolution.max) / 2;

					return (
						<div
							key={est.finding_key}
							className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
						>
							<span className={`flex shrink-0 items-center justify-center rounded-md border p-1.5 ${conf.bgStyle}`}>
								<Icon size={14} weight="bold" className={conf.style} />
							</span>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-xs font-medium text-zinc-200">
									{est.finding_key.replace(/_/g, " ")}
								</span>
								<div className="flex items-center gap-1 text-[10px] text-zinc-500">
									<span>{formatCents(estImpact)}</span>
									<span className="text-zinc-600">→</span>
									<span className={est.revenue_delta_next_cycle && est.revenue_delta_next_cycle > 0 ? "text-emerald-400" : "text-zinc-500"}>
										{est.revenue_delta_next_cycle
											? `+${formatCents(est.revenue_delta_next_cycle)}`
											: t("pending")}
									</span>
								</div>
							</div>
							<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${conf.bgStyle} ${conf.style}`}>
								{t(conf.labelKey)}
							</span>
						</div>
					);
				})}
			</div>

			{by_confidence.inconclusive.count > 0 && (
				<p className="text-center text-[10px] text-zinc-500">
					{t("inconclusive_count", { count: by_confidence.inconclusive.count })}
				</p>
			)}
		</div>
	);
}

registerWidget({
	id: "recovery_breakdown",
	version: 1,
	nameKey: "console.dashboard.widgets.recovery_breakdown.name",
	descriptionKey: "console.dashboard.widgets.recovery_breakdown.description",
	category: "kpi",
	icon: "chart-line-up",
	defaultSize: { w: 6, h: 4 },
	minSize: { w: 4, h: 3 },
	maxSize: { w: 12, h: 6 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["moneyRecovered"],
	Component: RecoveryBreakdownComponent,
});
