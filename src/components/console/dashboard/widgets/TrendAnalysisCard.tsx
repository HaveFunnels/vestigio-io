"use client";

// ──────────────────────────────────────────────
// TrendAnalysisCard — Wave 7.1
//
// Multi-cycle trend analysis widget. Shows findings with
// actionable patterns (consecutive regressions, sudden spikes,
// gradual degradation) alongside N-cycle sparklines.
//
// Fetches from /api/dashboard/trends independently since
// loading N snapshots is heavier than the main dashboard
// aggregation. Uses SWR for caching + revalidation.
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
	TrendUp as TrendUpIcon,
	TrendDown as TrendDownIcon,
	Warning as WarningIcon,
	Lightning as LightningIcon,
	ArrowsClockwise as OscillateIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";

interface FindingTrendItem {
	decision_key: string;
	question_key: string;
	pattern: string;
	streak_length: number;
	risk_scores: (number | null)[];
	total_delta: number;
	narrative: string;
}

interface TrendData {
	lookback_cycles: number;
	cycle_refs: string[];
	workspace_trend: {
		direction: string;
		volatility: number;
		regression_velocity: number;
		improvement_velocity: number;
	};
	alerts: FindingTrendItem[];
}

const PATTERN_CONFIG: Record<string, {
	icon: typeof WarningIcon;
	style: string;
	labelKey: string;
}> = {
	consecutive_regressions: {
		icon: TrendUpIcon,
		style: "text-red-400 bg-red-500/10 border-red-500/20",
		labelKey: "consecutive_regressions",
	},
	sudden_spike: {
		icon: LightningIcon,
		style: "text-amber-400 bg-amber-500/10 border-amber-500/20",
		labelKey: "sudden_spike",
	},
	gradual_degradation: {
		icon: TrendDownIcon,
		style: "text-orange-400 bg-orange-500/10 border-orange-500/20",
		labelKey: "gradual_degradation",
	},
	oscillating: {
		icon: OscillateIcon,
		style: "text-violet-400 bg-violet-500/10 border-violet-500/20",
		labelKey: "oscillating",
	},
};

// Mini sparkline specifically for trend risk scores
function TrendMiniSparkline({ scores }: { scores: (number | null)[] }) {
	const validScores = scores.filter((s): s is number => s !== null);
	if (validScores.length < 2) return null;

	const w = 64;
	const h = 20;
	const pad = 2;
	const min = Math.min(...validScores);
	const max = Math.max(...validScores);
	const range = Math.max(1, max - min);

	const points = validScores.map((v, i) => {
		const x = pad + (i / (validScores.length - 1)) * (w - pad * 2);
		const y = pad + (1 - (v - min) / range) * (h - pad * 2);
		return `${x},${y}`;
	});

	// Color: red if trending up (risk increasing), emerald if down
	const delta = validScores[validScores.length - 1] - validScores[0];
	const strokeColor = delta > 5 ? "#ef4444" : delta < -5 ? "#22c55e" : "#a1a1aa";
	const fillColor = delta > 5 ? "rgba(239,68,68,0.1)" : delta < -5 ? "rgba(34,197,94,0.1)" : "rgba(161,161,170,0.05)";

	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
			<polygon
				points={`${pad},${h - pad} ${points.join(" ")} ${w - pad},${h - pad}`}
				fill={fillColor}
			/>
			<polyline
				points={points.join(" ")}
				fill="none"
				stroke={strokeColor}
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function TrendAnalysisCardComponent({ data: _data }: WidgetProps) {
	const t = useTranslations("console.dashboard.widgets.trend_analysis");
	const [trendData, setTrendData] = useState<TrendData | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const res = await fetch("/api/dashboard/trends?lookback=10");
				if (res.ok && !cancelled) {
					const data = await res.json();
					setTrendData(data);
				}
			} catch {
				// Non-fatal — widget shows empty state
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

	if (!trendData || trendData.alerts.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
				<TrendUpIcon size={28} className="text-zinc-500" />
				<p className="text-sm text-zinc-400">{t("no_alerts")}</p>
				<p className="text-xs text-zinc-500">
					{trendData
						? t("cycles_analyzed", { count: trendData.lookback_cycles })
						: t("needs_cycles")}
				</p>
			</div>
		);
	}

	const { alerts, workspace_trend, lookback_cycles } = trendData;
	const topAlerts = alerts.slice(0, 5);

	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
						{t("eyebrow")}
					</span>
					<span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
						{t("cycles_count", { count: lookback_cycles })}
					</span>
				</div>
				<DirectionBadge direction={workspace_trend.direction} />
			</div>

			{/* Alert list */}
			<div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
				{topAlerts.map((alert) => {
					const conf = PATTERN_CONFIG[alert.pattern];
					if (!conf) return null;
					const Icon = conf.icon;

					return (
						<div
							key={alert.decision_key}
							className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
						>
							<span className={`flex shrink-0 items-center justify-center rounded-md border p-1.5 ${conf.style}`}>
								<Icon size={14} weight="bold" />
							</span>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-xs font-medium text-zinc-200">
									{alert.decision_key.replace(/_/g, " ")}
								</span>
								<span className="truncate text-[10px] text-zinc-500">
									{t(conf.labelKey, { streak: alert.streak_length })}
								</span>
							</div>
							<TrendMiniSparkline scores={alert.risk_scores} />
						</div>
					);
				})}
			</div>

			{alerts.length > 5 && (
				<p className="text-center text-[10px] text-zinc-500">
					{t("more_alerts", { count: alerts.length - 5 })}
				</p>
			)}
		</div>
	);
}

function DirectionBadge({ direction }: { direction: string }) {
	const t = useTranslations("console.dashboard.widgets.trend_analysis");
	const styles: Record<string, string> = {
		improving: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
		degrading: "text-red-400 bg-red-500/10 border-red-500/20",
		stable: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
		mixed: "text-amber-400 bg-amber-500/10 border-amber-500/20",
	};

	return (
		<span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${styles[direction] || styles.stable}`}>
			{t(`direction_${direction}`)}
		</span>
	);
}

// ── Register ──
registerWidget({
	id: "trend_analysis",
	version: 1,
	nameKey: "console.dashboard.widgets.trend_analysis.name",
	descriptionKey: "console.dashboard.widgets.trend_analysis.description",
	category: "trends",
	icon: "trend-up",
	defaultSize: { w: 6, h: 4 },
	minSize: { w: 4, h: 3 },
	maxSize: { w: 12, h: 6 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["changeReport"],
	Component: TrendAnalysisCardComponent,
});
