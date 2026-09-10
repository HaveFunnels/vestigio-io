"use client";

import type { MeasuredFunnelUI } from "./BehavioralMeasurement";

/*
 * ONDA 4.5 — the funnel as a drawing, not a table.
 *
 * The design doc's bar ("nível Miro/Figma, custom SVG") finally
 * honored: a true tapered flow — centered bands whose widths are the
 * measured share of arrived sessions, connected by flowing trapezoids,
 * with the biggest drop annotated INSIDE the drawing where the flow
 * visibly narrows. Inline SVG, theme tokens via Tailwind fill/stroke
 * classes, no chart lib (house rule).
 */

const W = 640;
const BAND_H = 34;
const CONN_H = 30;
const PAD_X = 8;

function fmtPct(n: number): string {
	return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export default function MeasuredFunnelViz({ funnel }: { funnel: MeasuredFunnelUI }) {
	const stages = funnel.stages;
	if (stages.length === 0) return null;

	const totalH = stages.length * BAND_H + (stages.length - 1) * CONN_H + 8;
	// Width scale: 100% of arrived = drawable width; floor keeps tiny
	// stages visible as a thread, never invisible.
	const drawable = W - PAD_X * 2 - 180; // reserve label/number gutters
	const bandW = (pct: number) => Math.max((pct / 100) * drawable, 10);
	const bandX = (pct: number) => PAD_X + 150 + (drawable - bandW(pct)) / 2;
	const bandY = (i: number) => 4 + i * (BAND_H + CONN_H);

	// Where does the flow narrow the most (absolute sessions)?
	let biggestIdx = -1;
	let biggestLost = 0;
	for (let i = 1; i < stages.length; i++) {
		const lost = stages[i - 1].sessions - stages[i].sessions;
		if (lost > biggestLost) {
			biggestLost = lost;
			biggestIdx = i;
		}
	}

	return (
		<svg
			viewBox={`0 0 ${W} ${totalH}`}
			role="img"
			aria-label="Funil medido, do primeiro acesso à compra"
			className="w-full"
		>
			{stages.map((st, i) => {
				const y = bandY(i);
				const w = bandW(st.pctOfArrived);
				const x = bandX(st.pctOfArrived);
				const isPaid = st.key === "paid";
				const isBiggestTarget = i === biggestIdx;

				return (
					<g key={st.key}>
						{/* Connector from the previous band — the flow itself. */}
						{i > 0 && (
							<polygon
								points={`${bandX(stages[i - 1].pctOfArrived)},${y - CONN_H} ${
									bandX(stages[i - 1].pctOfArrived) + bandW(stages[i - 1].pctOfArrived)
								},${y - CONN_H} ${x + w},${y} ${x},${y}`}
								className={
									isBiggestTarget ? "fill-rose-500/[0.13]" : "fill-sky-500/[0.08]"
								}
							/>
						)}
						{/* The band. */}
						<rect
							x={x}
							y={y}
							width={w}
							height={BAND_H}
							rx={6}
							className={isPaid ? "fill-emerald-500/50" : "fill-sky-500/30"}
						/>
						<rect
							x={x}
							y={y}
							width={w}
							height={BAND_H}
							rx={6}
							fill="none"
							className={isPaid ? "stroke-emerald-400/60" : "stroke-sky-400/30"}
							strokeWidth={1}
						/>
						{/* Label gutter (left). */}
						<text
							x={PAD_X}
							y={y + BAND_H / 2 + 4}
							className="fill-content-secondary"
							fontSize={12.5}
						>
							{st.label}
						</text>
						{/* Numbers gutter (right). */}
						<text
							x={W - PAD_X}
							y={y + BAND_H / 2 + 4}
							textAnchor="end"
							fontSize={12}
							className="fill-content tabular-nums"
						>
							{st.sessions.toLocaleString("pt-BR")}
							<tspan className="fill-content-faint" dx={4}>
								{fmtPct(st.pctOfArrived)}
							</tspan>
						</text>
						{/* The biggest narrowing, annotated where it happens. */}
						{isBiggestTarget && biggestLost > 0 && (
							<text
								x={W / 2 + 75}
								y={y - CONN_H / 2 + 4}
								textAnchor="middle"
								fontSize={11}
								className="fill-rose-400"
							>
								−{biggestLost.toLocaleString("pt-BR")} sessões aqui
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}
