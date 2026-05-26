"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { HeroMetric } from "../types";

/*
 * Hero metrics tile row
 *
 * Four tiles: retained, captured, criticals open, in-progress. Each
 * has a tabular-nums Mono number, a Satoshi uppercase label, a delta
 * pill (+12% MoM style), and a 6-point sparkline trail rendered as a
 * single SVG path. The pattern is intentionally identical to the
 * Console SummaryCards so the Plan feels at-home but typographically
 * elevated (Fraunces is reserved for narrative — numbers stay Mono).
 */

interface Props {
	hero: HeroMetric;
	monthLabel: string;
}

function formatBRL(value: number): string {
	if (value >= 1000) return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

function formatDelta(delta: number): string {
	const pct = Math.abs(Math.round(delta * 100));
	const arrow = delta > 0 ? "↗" : delta < 0 ? "↘" : "→";
	return `${arrow} ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${pct}% MoM`;
}

function deltaTone(delta: number, invert = false): string {
	const positive = invert ? delta < 0 : delta > 0;
	const negative = invert ? delta > 0 : delta < 0;
	if (positive) return "text-emerald-400";
	if (negative) return "text-rose-400";
	return "text-content-muted";
}

function Sparkline({ values, tone }: { values: number[]; tone: "up" | "down" | "flat" }) {
	if (values.length < 2) return null;
	const w = 84;
	const h = 28;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const stepX = w / (values.length - 1);
	// Path uses M…L… commands instead of <polyline points>; framer-motion's
	// pathLength animation depends on getTotalLength() which is reliable on
	// <path> but spotty on <polyline> across browsers/SSR.
	const d = values
		.map((v, i) => {
			const x = (i * stepX).toFixed(1);
			const y = (h - ((v - min) / range) * h).toFixed(1);
			return `${i === 0 ? "M" : "L"}${x},${y}`;
		})
		.join(" ");
	const stroke =
		tone === "up" ? "#34d399" : tone === "down" ? "#fb7185" : "currentColor";
	return (
		<svg width={w} height={h} className="overflow-visible">
			<motion.path
				d={d}
				fill="none"
				stroke={stroke}
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={{ pathLength: 0, opacity: 0 }}
				animate={{ pathLength: 1, opacity: 0.9 }}
				transition={{ duration: 0.8, delay: 0.25, ease: "easeOut" }}
			/>
			<circle
				cx={w}
				cy={h - ((values[values.length - 1] - min) / range) * h}
				r={2.2}
				fill={stroke}
			/>
		</svg>
	);
}

function CountUp({ to, format }: { to: number; format: (n: number) => string }) {
	const [value, setValue] = useState(0);
	useEffect(() => {
		const start = performance.now();
		const duration = 900;
		let rafId = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			// easeOutCubic
			const eased = 1 - Math.pow(1 - t, 3);
			setValue(to * eased);
			if (t < 1) rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [to]);
	return <>{format(value)}</>;
}

type TileProps = {
	label: string;
	value: string;
	formatted?: string;
	rawNumber: number;
	delta: number;
	invertDelta?: boolean;
	spark?: number[];
	formatFn?: (n: number) => string;
};

function Tile({
	label,
	rawNumber,
	delta,
	invertDelta = false,
	spark,
	formatFn = (n) => Math.round(n).toLocaleString("pt-BR"),
}: Omit<TileProps, "value" | "formatted">) {
	const sparkTone: "up" | "down" | "flat" = invertDelta
		? delta < 0
			? "up"
			: delta > 0
				? "down"
				: "flat"
		: delta > 0
			? "up"
			: delta < 0
				? "down"
				: "flat";

	return (
		<div
			data-strategy-card
			className="group relative flex min-h-[160px] flex-col justify-between rounded-2xl border border-edge bg-surface-card p-6 transition-all hover:border-edge-focus hover:bg-surface-card-hover"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
					{label}
				</div>
				{spark && spark.length > 1 && (
					<div className="text-content-tertiary">
						<Sparkline values={spark} tone={sparkTone} />
					</div>
				)}
			</div>

			<div className="mt-3 flex items-baseline gap-2">
				<div className="font-mono text-[30px] font-semibold tracking-tight text-content tabular-nums">
					<CountUp to={rawNumber} format={formatFn} />
				</div>
			</div>

			<div className={`mt-2 font-mono text-[11px] tabular-nums ${deltaTone(delta, invertDelta)}`}>
				{formatDelta(delta)}
			</div>
		</div>
	);
}

export default function HeroMetrics({ hero, monthLabel }: Props) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Onde você está em {monthLabel}
				</h2>
				<div className="text-[11px] text-content-faint">
					4 métricas · delta vs mês anterior
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Tile
					label="Retido / mês"
					rawNumber={hero.retainedMid}
					delta={hero.retainedDeltaMoM}
					spark={hero.retainedSpark}
					formatFn={formatBRL}
				/>
				<Tile
					label="Capturado / mês"
					rawNumber={hero.capturedMid}
					delta={hero.capturedDeltaMoM}
					spark={hero.capturedSpark}
					formatFn={formatBRL}
				/>
				<Tile
					label="Críticos abertos"
					rawNumber={hero.criticalCount}
					delta={hero.criticalDeltaMoM}
					invertDelta
				/>
				<Tile
					label="Em progresso"
					rawNumber={hero.inProgressCount}
					delta={hero.inProgressDeltaMoM}
				/>
			</div>
		</motion.section>
	);
}
