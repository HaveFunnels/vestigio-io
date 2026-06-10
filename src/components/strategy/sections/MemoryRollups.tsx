"use client";

import { motion } from "framer-motion";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import type { MemoryRollups as MemoryRollupsType, MemoryWindow } from "../types";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";

/*
 * Memory Rollups — "Memória de meses anteriores"
 *
 * 2x2 grid (responsive to 1 column on mobile). Each card surfaces a
 * different window: 1m / 3m / 6m / 12m. The pattern is intentionally
 * NOT a flat chronological list — rollups compress more information
 * into the same screen real estate while still letting the operator
 * drill in.
 *
 * The 12m card has a percentile-vs-category callout that's stubbed in
 * "available in N months" state while the cross-customer benchmark
 * pipeline is still warming up (Wave 30+).
 */

interface Props {
	rollups: MemoryRollupsType;
}

function formatMonthShort(yearMonth: string): string {
	const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
	const [, mm] = yearMonth.split("-");
	const idx = parseInt(mm, 10) - 1;
	return months[idx] ?? mm;
}

// Inner chart — receives explicit width from the ParentSize wrapper
// so the bars stretch the full card content area regardless of grid
// breakpoint. Height stays fixed because vertical rhythm in the card
// is more important than a perfectly square aspect ratio.
function MiniBarChartInner({
	values,
	width,
	height = 56,
}: {
	values: Array<{ month: string; value: number }>;
	width: number;
	height?: number;
}) {
	if (values.length === 0 || width <= 0) return null;
	const xScale = scaleBand({
		domain: values.map((d) => d.month),
		range: [0, width],
		padding: 0.25,
	});
	const yScale = scaleLinear({
		domain: [0, Math.max(...values.map((d) => d.value)) || 1],
		range: [height, 0],
	});

	return (
		<svg width={width} height={height} className="overflow-visible">
			<Group>
				{values.map((d, i) => {
					const barWidth = xScale.bandwidth();
					const barHeight = height - yScale(d.value);
					const barX = xScale(d.month) ?? 0;
					const barY = height - barHeight;
					// Animate y + height directly (not scaleY): SVG transform-origin
					// is unreliable across browsers and Safari ignores CSS
					// transform-origin on <rect>. Starting from y=height with
					// height=0 makes the bar grow from the baseline reliably.
					return (
						<motion.rect
							key={d.month}
							x={barX}
							width={barWidth}
							initial={{ y: height, height: 0 }}
							whileInView={{ y: barY, height: barHeight }}
							viewport={{ once: true }}
							transition={{
								delay: 0.05 * i,
								duration: 0.55,
								ease: [0.22, 1, 0.36, 1],
							}}
							fill="rgb(var(--text-tertiary))"
							rx={1.5}
						/>
					);
				})}
				{values.length <= 6 &&
					values.map((d) => (
						<text
							key={d.month + "-label"}
							x={(xScale(d.month) ?? 0) + xScale.bandwidth() / 2}
							y={height + 11}
							textAnchor="middle"
							className="fill-content-faint font-mono"
							fontSize={9}
						>
							{formatMonthShort(d.month)}
						</text>
					))}
			</Group>
		</svg>
	);
}

// Public chart — uses ParentSize from visx to track the actual width
// of its parent box. Falls back to 0 on first paint; the inner chart
// short-circuits on width=0 to avoid scaling against an undefined
// range while ParentSize measures.
function MiniBarChart({
	values,
}: {
	values: Array<{ month: string; value: number }>;
}) {
	return (
		<div className="w-full" style={{ height: 70 }}>
			<ParentSize debounceTime={20}>
				{({ width }) => <MiniBarChartInner values={values} width={width} />}
			</ParentSize>
		</div>
	);
}

function RollupCard({
	window,
	idx,
	tone,
	emphasizeBenchmark,
}: {
	window: MemoryWindow;
	idx: number;
	tone: "now" | "near" | "mid" | "year";
	emphasizeBenchmark?: boolean;
}) {
	const { currency } = useMcpData();
	return (
		<motion.div
			data-vsgp-card
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.45, delay: idx * 0.07, ease: [0.22, 1, 0.36, 1] }}
			whileHover={{ y: -2 }}
			className="group flex min-h-[220px] flex-col rounded-2xl border border-edge bg-surface-card p-6 transition-colors hover:border-edge-focus"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<div className="text-[15px] font-semibold text-content">{window.label}</div>
				<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
					{tone === "year" ? "12m" : tone === "mid" ? "6m" : tone === "near" ? "3m" : "1m"}
				</div>
			</div>

			{/* Sprint 3.4 — primary metric flipped to "Vestigio detectou".
			    The card always shows continuous work this way, even when
			    nothing's been resolved yet. Secondary line surfaces
			    what the customer has done so the protective/active
			    pairing reads as a partnership, not a blame chart. */}
			<div className="mb-4">
				<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
					Vestigio detectou
				</div>
				<div className="mt-1 font-mono text-[28px] font-semibold tabular-nums leading-none text-content">
					{window.findingsDetected ?? 0}
					<span className="ml-1 text-[12px] font-normal text-content-faint">
						{(window.findingsDetected ?? 0) === 1 ? "vazamento" : "vazamentos"}
					</span>
				</div>
				{/* T2 — secondary line. When the customer has resolved
				    nothing yet (common on month 1), the "0 já resolvidos
				    · 0 recuperados" pair reads as a flat zero card and
				    quietly nudges churn. Swap to a CTA-style prompt so
				    the empty state asks for an action instead of
				    announcing emptiness. */}
				<div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-edge/40 pt-2 text-[11px] text-content-muted">
					{window.actionsResolved === 0 && window.capturedTotal === 0 ? (
						<span className="italic">
							Você ainda não marcou nada como resolvido. Comece pelo Próximo Passo 1 deste plano.
						</span>
					) : (
						<>
							<span>
								<span className="font-mono tabular-nums text-content">{window.actionsResolved}</span>
								{" "}já resolvidos
							</span>
							{window.capturedTotal > 0 && (
								<>
									<span className="text-content-faint">·</span>
									<span>
										<span className="font-mono tabular-nums text-content">
											{fmtCurrencyUnits(window.capturedTotal, currency)}
										</span>
										{" "}recuperados
									</span>
								</>
							)}
						</>
					)}
				</div>
			</div>

			{/* T2 — bar chart suppressed when every bucket is 0. 12 bars
			    of zeros painted in a row gave the card a falsely-empty
			    look; better to render nothing than a flat zero series. */}
			{window.monthlyValues.length > 1 &&
				window.monthlyValues.some((v) => v.value > 0) && (
					<div className="mt-auto pb-1">
						<MiniBarChart values={window.monthlyValues} />
					</div>
				)}

			{window.biggestWin && (
				<div className="mt-4 border-t border-edge/60 pt-3">
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Maior win
					</div>
					<div className="text-[13px] font-medium leading-snug text-content">
						{window.biggestWin.title}
					</div>
					<div className="mt-0.5 font-mono text-[11px] tabular-nums text-content-muted">
						{fmtCurrencyUnits(window.biggestWin.capturedAmount, currency)} · {window.biggestWin.resolvedAt}
					</div>
				</div>
			)}

			{emphasizeBenchmark && window.benchmarkAvailability && (
				<div className="mt-3 rounded-md border border-dashed border-edge bg-surface-inset/40 p-2 text-[11px] text-content-muted">
					{window.benchmarkAvailability === "available"
						? "Benchmark vs categoria disponível"
						: window.benchmarkAvailability === "available_in_4_months"
							? "Benchmark vs categoria, disponível em 4 meses"
							: "Benchmark indisponível"}
				</div>
			)}
		</motion.div>
	);
}

export default function MemoryRollups({ rollups }: Props) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Memória dos meses anteriores
				</h2>
				<div className="text-[11px] text-content-faint">
					rollups acumulados
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<RollupCard window={rollups["1m"]} idx={0} tone="now" />
				<RollupCard window={rollups["3m"]} idx={1} tone="near" />
				<RollupCard window={rollups["6m"]} idx={2} tone="mid" />
				<RollupCard window={rollups["12m"]} idx={3} tone="year" emphasizeBenchmark />
			</div>
		</motion.section>
	);
}
