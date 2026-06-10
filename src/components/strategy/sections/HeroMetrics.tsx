"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { HeroMetric } from "../types";
import { AggregateMethodologyPopover } from "@/components/console/MethodologyPopover";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";

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

// Factory returning a format fn locked to one mode — passed into the
// CountUp tween so mid-animation values share a layout with the
// final rendered string (no "R$ 900" → "R$ 1,0k" mid-tween jump).
function makeCurrencyFormatter(target: number, currency: string): (n: number) => string {
	const mode: "k" | "full" = target >= 1000 ? "k" : "full";
	return (n: number) => fmtCurrencyUnits(n, currency, { mode });
}

function formatDelta(delta: number): string {
	const pct = Math.abs(Math.round(delta * 100));
	const arrow = delta > 0 ? "↗" : delta < 0 ? "↘" : "→";
	// "vs mês anterior" instead of "MoM" — same meaning, in the
	// reader's language. The MoM abbreviation read as a translation
	// leak on the pt-BR surface.
	return `${arrow} ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${pct}% vs mês anterior`;
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
	// Wave-22.6 review fix UC1 — optional methodology surfacing on hero
	// tiles. When provided, an "ⓘ" trigger renders next to the label
	// that opens the aggregate-methodology popover (description, drill
	// link, optional aggregate range/count).
	methodologyDescription?: string;
	methodologyDrillHref?: string;
	// Empty state — replaces the "R$ 0" number with a guidance line when
	// the metric hasn't accumulated value yet. The delta/spark are also
	// suppressed so the tile reads as a prompt, not as a flat-zero
	// regression.
	emptyState?: string | null;
	// Static loss/win tone — forces the value + caption color regardless
	// of delta. Used for snapshot metrics like "Capturado pelo vazamento"
	// where there's no time series; the customer needs to read "this is a
	// leak" visually even at delta=0. When set, replaces the delta line
	// with `captionWhenStatic`.
	staticTone?: "loss" | "win" | null;
	captionWhenStatic?: string;
};

function Tile({
	label,
	rawNumber,
	delta,
	invertDelta = false,
	spark,
	formatFn = (n) => Math.round(n).toLocaleString("pt-BR"),
	methodologyDescription,
	methodologyDrillHref,
	emptyState,
	staticTone,
	captionWhenStatic,
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

	// Empty state fires when the metric is exactly 0 AND a guidance copy
	// was provided. Used by "Recuperado / mês" to nudge first-time
	// customers toward the plan instead of staring at R$ 0.
	const isEmpty = emptyState != null && rawNumber === 0;

	return (
		<div
			data-vsgp-card
			className="group relative flex min-h-[160px] flex-col justify-between rounded-2xl border border-edge bg-surface-card p-6 transition-all hover:border-edge-focus hover:bg-surface-card-hover"
		>
			{/* Methodology trigger pinned to top-right of EVERY tile so the
			    ⓘ sits in the same screen position across all 4 cards. Before
			    it floated next to the label, drifting based on label width. */}
			{methodologyDescription && (
				<div className="absolute right-3 top-3 z-10 text-content-faint">
					<AggregateMethodologyPopover
						title={label}
						description={methodologyDescription}
						drillHref={methodologyDrillHref ?? null}
						placement="below"
					/>
				</div>
			)}

			<div className="flex items-start justify-between gap-3 pr-7">
				<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
					{label}
				</div>
				{!isEmpty && spark && spark.length > 1 && (
					<div className="text-content-tertiary">
						<Sparkline values={spark} tone={sparkTone} />
					</div>
				)}
			</div>

			{isEmpty ? (
				<div className="mt-3 text-[14px] leading-snug text-content-secondary">
					{emptyState}
				</div>
			) : (
				<div className="mt-3 flex items-baseline gap-2">
					<div
						className={`font-mono text-[30px] font-semibold tracking-tight tabular-nums ${
							staticTone === "loss"
								? "text-rose-400"
								: staticTone === "win"
									? "text-emerald-400"
									: "text-content"
						}`}
					>
						<CountUp to={rawNumber} format={formatFn} />
					</div>
				</div>
			)}

			{!isEmpty && staticTone ? (
				<div
					className={`mt-2 font-mono text-[11px] ${
						staticTone === "loss" ? "text-rose-400" : "text-emerald-400"
					}`}
				>
					{captionWhenStatic ?? (staticTone === "loss" ? "em exposição agora" : "preservado agora")}
				</div>
			) : !isEmpty ? (
				<div className={`mt-2 font-mono text-[11px] tabular-nums ${deltaTone(delta, invertDelta)}`}>
					{formatDelta(delta)}
				</div>
			) : null}
		</div>
	);
}

// Builds the methodology description line shown inside the hero
// tile's AggregateMethodologyPopover. The receipt prefix ("R$ 18-32k
// de 14 findings") is only added when the generator populated the
// range + count fields — older serialized plans fall back to the
// pure descriptive text.
function withReceipt(
	base: string,
	min: number | undefined,
	max: number | undefined,
	count: number | undefined,
	currency: string,
): string {
	if (min === undefined || max === undefined || count === undefined || count === 0) {
		return base;
	}
	const range = `${fmtCurrencyUnits(min, currency)}–${fmtCurrencyUnits(max, currency)}`;
	const noun = count === 1 ? "finding" : "findings";
	return `Faixa real este mês: ${range} de ${count} ${noun}. ${base}`;
}

export default function HeroMetrics({ hero, monthLabel }: Props) {
	const { currency } = useMcpData();
	// T1/RetaFinal — the old "exposureMode" toggle (single tile flipping
	// between Capturado/Em risco) was replaced by two dedicated tiles:
	// "Recuperado / mês" (capturedMid, with empty state) and "Capturado
	// pelo vazamento / mês" (exposureMid, sempre red). The customer reads
	// the win and the loss side-by-side now, no implicit branching.
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Onde você está em {monthLabel}
				</h2>
				<div className="text-[11px] text-content-faint">
					4 métricas · delta vs mês anterior
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{/* "Recuperado / mês" — antes "Retido". Customer feedback:
				    "Retido" lia como passiva e confundia com cobrança bancária.
				    "Recuperado" deixa explícito que é o ganho ATIVO trazido
				    pelas ações marcadas como done. Dado mudou de retainedMid
				    para capturedMid pelo mesmo motivo — "Recuperado" só faz
				    sentido com a métrica de recuperação ativa, não com a
				    preservação passiva do estado saudável. */}
				<Tile
					label="Recuperado / mês"
					rawNumber={hero.capturedMid}
					delta={hero.capturedDeltaMoM}
					spark={hero.capturedSpark}
					formatFn={makeCurrencyFormatter(hero.capturedMid, currency)}
					emptyState="Siga o plano para ver o faturamento recuperado."
					methodologyDescription={withReceipt(
						"Soma dos midpoints de receita mensal recuperada por ações marcadas como done e verificadas no ciclo seguinte. Distintos de 'marcado como done': só conta quando o ciclo seguinte confirma que a finding linkada não aparece mais.",
						hero.capturedMin,
						hero.capturedMax,
						hero.capturedFindingCount,
						currency,
					)}
					methodologyDrillHref="/app/actions?status=done"
				/>
				{/* "Capturado pelo vazamento / mês" — antes "Capturado /
				    mês" com valor de recuperação (cinzento). Customer feedback
				    leu como "capturado pelo problema" = perda, e queria red
				    graphics. Dado movido pra exposureMid (o vazamento atual);
				    invertDelta deixa "mais vazamento = mais vermelho". */}
				<Tile
					label="Capturado pelo vazamento / mês"
					rawNumber={hero.exposureMid ?? 0}
					delta={0}
					formatFn={makeCurrencyFormatter(hero.exposureMid ?? 0, currency)}
					staticTone="loss"
					captionWhenStatic="em vazamento agora"
					methodologyDescription={withReceipt(
						"Exposição estimada: soma dos midpoints mensais de findings em aberto que representam perda de receita ou risco operacional. Esse número converge pra 'Recuperado/mês' à medida que ações são marcadas como done e verificadas no ciclo seguinte.",
						hero.exposureMin,
						hero.exposureMax,
						hero.exposureFindingCount,
						currency,
					)}
					methodologyDrillHref="/app/findings?polarity=negative"
				/>
				{/* Was "Críticos abertos" — in practice the engine rarely
				    emits severity=critical for envs without serious
				    chargeback / security findings, so the tile read
				    permanently zero. Replaced with "Findings em
				    monitoramento" sourced from retainedFindingCount,
				    which counts every open finding the engine is keeping
				    eye on. Buyer-meaningful + uses data we already
				    persist. */}
				<Tile
					label="Findings em monitoramento"
					rawNumber={hero.retainedFindingCount ?? hero.criticalCount}
					delta={hero.criticalDeltaMoM}
					invertDelta
					methodologyDescription="Total de findings em estado aberto neste ciclo — incluindo low/medium/high. Vestigio mantém esse número em monitoramento contínuo entre ciclos. Apenas findings com confiança >= medium aparecem aqui."
					methodologyDrillHref="/app/findings"
				/>
				<Tile
					label="Em progresso"
					rawNumber={hero.inProgressCount}
					delta={hero.inProgressDeltaMoM}
					methodologyDescription="Quantidade de ações com status=in_progress atribuídas ao seu env. Reflete trabalho em curso da equipe."
					methodologyDrillHref="/app/actions?status=in_progress"
				/>
			</div>
		</motion.section>
	);
}
