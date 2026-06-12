"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";

// ──────────────────────────────────────────────
// Bundle E — Predictive Layer
//
// Renderiza 3 vetores:
//   1. Breach alerts no topo (quando forecast cruza crítico) — vermelhos
//   2. Trends por pack com sparkline mini + forecast 6 sem
//   3. Achados crônicos (open > 4 sem em severity alta)
//
// Empty state: env com < 4 semanas de histórico → hero pedindo
// paciência.
// ──────────────────────────────────────────────

interface TrendPoint {
	week_starting: string;
	count: number;
	midpoint_brl_cents: number;
}

interface PackTrend {
	pack: string;
	display_label: string;
	data_points: TrendPoint[];
	trend_direction: "up" | "down" | "flat";
	slope_per_week: number;
	current_count: number;
	current_midpoint_brl_cents: number;
	forecast_3_weeks: { count: number; midpoint_brl_cents: number };
	forecast_6_weeks: { count: number; midpoint_brl_cents: number };
	forecast_12_weeks: { count: number; midpoint_brl_cents: number };
	will_breach_critical: boolean;
	breach_label: string | null;
}

interface ChronicFinding {
	id: string;
	inference_key: string;
	humanized_title: string;
	surface: string;
	severity: string;
	pack: string;
	weeks_open: number;
	impact_midpoint_brl_cents: number;
}

interface BreachAlert {
	pack: string;
	display_label: string;
	kind: "count" | "exposure";
	weeks_until_breach: number;
	threshold_label: string;
	current_value: number;
}

interface ApiResponse {
	state: "ready" | "needs_more_data";
	weeks_of_history: number;
	trends: PackTrend[];
	chronic_findings: ChronicFinding[];
	breach_alerts: BreachAlert[];
}

interface Props {
	envId: string;
	month: string;
}

export default function PredictiveLayer({ envId, month }: Props) {
	const [data, setData] = useState<ApiResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const { currency } = useMcpData();

	useEffect(() => {
		setLoading(true);
		fetch(
			`/api/library/strategy/${encodeURIComponent(month)}/predictive?envId=${encodeURIComponent(envId)}`,
			{ cache: "no-store" },
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => setData(d))
			.catch(() => setData(null))
			.finally(() => setLoading(false));
	}, [envId, month]);

	if (loading || !data) return null;

	if (data.state === "needs_more_data") {
		// Self-hide silencioso pra env novo. Aparece a partir de ~4 ciclos
		// completos.
		return null;
	}

	const hasContent =
		data.trends.length > 0 ||
		data.chronic_findings.length > 0 ||
		data.breach_alerts.length > 0;
	if (!hasContent) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que vem por aí
				</h2>
				<div className="text-[11px] text-content-faint">
					Tendências + previsões com {data.weeks_of_history} semanas de histórico
				</div>
			</div>

			{/* Breach alerts no topo */}
			{data.breach_alerts.length > 0 && (
				<div className="mb-4 space-y-2">
					{data.breach_alerts.map((a) => (
						<BreachAlertBanner key={`${a.pack}-${a.kind}`} alert={a} />
					))}
				</div>
			)}

			{/* Trends */}
			{data.trends.length > 0 && (
				<div data-vsgp-card className="mb-4 rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
					<div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Tendências por pack
					</div>
					<div className="space-y-3">
						{data.trends.map((t) => (
							<TrendRow key={t.pack} trend={t} currency={currency} />
						))}
					</div>
				</div>
			)}

			{/* Chronic findings */}
			{data.chronic_findings.length > 0 && (
				<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
					<div className="mb-4 flex items-baseline justify-between">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Achados crônicos
						</div>
						<div className="text-[11px] text-content-muted">
							Abertos há mais de 4 semanas, severidade alta
						</div>
					</div>
					<div className="space-y-2">
						{data.chronic_findings.map((c) => (
							<ChronicRow key={c.id} chronic={c} currency={currency} />
						))}
					</div>
				</div>
			)}
		</motion.section>
	);
}

// ──────────────────────────────────────────────
// Breach alert
// ──────────────────────────────────────────────

function BreachAlertBanner({ alert }: { alert: BreachAlert }) {
	const weeksLabel =
		alert.weeks_until_breach <= 1
			? "menos de 1 semana"
			: `${alert.weeks_until_breach} semanas`;
	return (
		<div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3">
			<svg
				className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fillRule="evenodd"
					d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
					clipRule="evenodd"
				/>
			</svg>
			<div className="flex-1 text-[12.5px] leading-snug text-rose-100">
				<span className="font-medium">{alert.display_label}</span> deve cruzar{" "}
				<span className="font-medium">{alert.threshold_label}</span> em{" "}
				<span className="font-semibold">~{weeksLabel}</span> mantido o ritmo
				atual.
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Trend row com sparkline
// ──────────────────────────────────────────────

function TrendRow({ trend, currency }: { trend: PackTrend; currency: string }) {
	const counts = trend.data_points.map((d) => d.count);
	const exposureBrl = Math.round(trend.current_midpoint_brl_cents / 100);
	const forecast6Brl = Math.round(trend.forecast_6_weeks.midpoint_brl_cents / 100);
	const directionColor =
		trend.trend_direction === "up"
			? "text-rose-300"
			: trend.trend_direction === "down"
				? "text-emerald-300"
				: "text-content-muted";
	const arrow =
		trend.trend_direction === "up"
			? "↗"
			: trend.trend_direction === "down"
				? "↘"
				: "→";

	return (
		<div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-edge/40 bg-surface-inset/30 px-3 py-2.5">
			<div className="min-w-0">
				<div className="truncate text-[12.5px] font-medium text-content">
					{trend.display_label}
				</div>
				<div className="mt-0.5 text-[10.5px] text-content-muted">
					Agora: <span className="text-content-secondary">{trend.current_count}</span> · {fmtCurrencyUnits(exposureBrl, currency)}
				</div>
			</div>
			<MiniSparkline values={counts} />
			<div className={`text-right text-[11px] ${directionColor}`}>
				<div className="font-mono tabular-nums">
					{arrow} 6sem: {trend.forecast_6_weeks.count}
				</div>
				<div className="font-mono text-[10px] tabular-nums opacity-80">
					{fmtCurrencyUnits(forecast6Brl, currency)}
				</div>
			</div>
		</div>
	);
}

function MiniSparkline({ values }: { values: number[] }) {
	if (values.length < 2) return <div className="h-6 w-16" />;
	const w = 64;
	const h = 24;
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 1);
	const range = Math.max(1, max - min);
	const step = w / (values.length - 1);
	const d = values
		.map((v, i) => {
			const x = (i * step).toFixed(1);
			const y = (h - ((v - min) / range) * h).toFixed(1);
			return `${i === 0 ? "M" : "L"}${x},${y}`;
		})
		.join(" ");
	const isUp = values[values.length - 1] > values[0];
	return (
		<svg width={w} height={h} className="shrink-0 text-content-tertiary">
			<path
				d={d}
				fill="none"
				stroke={isUp ? "#fb7185" : "#34d399"}
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity="0.9"
			/>
		</svg>
	);
}

// ──────────────────────────────────────────────
// Chronic row
// ──────────────────────────────────────────────

function ChronicRow({ chronic, currency }: { chronic: ChronicFinding; currency: string }) {
	const brl = Math.round(chronic.impact_midpoint_brl_cents / 100);
	return (
		<div className="flex items-baseline justify-between gap-3 rounded-xl border border-edge/40 bg-surface-inset/30 px-3 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="truncate text-[12.5px] font-medium text-content">
					{chronic.humanized_title}
				</div>
				<div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] text-content-muted">
					<span className="font-mono">{chronic.surface}</span>
					<span className="text-content-faint">·</span>
					<span>Aberto há {chronic.weeks_open} semanas</span>
					<span className="text-content-faint">·</span>
					<span className="uppercase tracking-wide">{chronic.severity}</span>
				</div>
			</div>
			<div className="shrink-0 text-right">
				<div className="font-mono text-[12px] font-semibold tabular-nums text-rose-300">
					{fmtCurrencyUnits(brl, currency)}/mês
				</div>
			</div>
		</div>
	);
}
