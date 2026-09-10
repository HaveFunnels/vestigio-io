"use client";

import { useId } from "react";
import type { MeasuredFunnelUI } from "./BehavioralMeasurement";

/*
 * ONDA 4.5 (rev 2) — the funnel as a real funnel.
 *
 * Rebuilt in the funnel-graph-js idiom the founder asked for: one
 * continuous horizontal shape that tapers left→right, each stage a
 * cross-section whose HEIGHT is its measured share of arrived
 * sessions, the top and bottom edges joined by smooth cubic curves so
 * the flow narrows organically, filled with a horizontal gradient. The
 * paid stage tints emerald; the sharpest narrowing is annotated where
 * it happens. Inline SVG, viewBox-responsive, theme tokens, no lib.
 */

const W = 720;
const H = 250;
const PAD_X = 44;
const TOP = 58; // room for per-stage value labels
const BOT = 210; // funnel bottom; below it, stage names
const MID = (TOP + BOT) / 2;
const BODY = BOT - TOP;
const MIN_THREAD = 3; // px — a 0-ish stage stays a visible thread

function fmtPct(n: number): string {
	return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Smooth cubic path through points, control points at horizontal
 *  midpoints (the classic funnel-graph S-curve). */
function smooth(points: Array<[number, number]>): string {
	if (points.length === 0) return "";
	let d = `M ${points[0][0]},${points[0][1]}`;
	for (let i = 1; i < points.length; i++) {
		const [x0, y0] = points[i - 1];
		const [x1, y1] = points[i];
		const cx = (x0 + x1) / 2;
		d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
	}
	return d;
}

export default function MeasuredFunnelViz({ funnel }: { funnel: MeasuredFunnelUI }) {
	const stages = funnel.stages;
	const gid = useId().replace(/[:]/g, "");
	if (stages.length < 2) return null;

	const n = stages.length;
	const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (n - 1);
	const half = (pct: number) => Math.max((pct / 100) * BODY, MIN_THREAD) / 2;

	const topPts: Array<[number, number]> = stages.map((s, i) => [x(i), MID - half(s.pctOfArrived)]);
	const botPts: Array<[number, number]> = stages.map((s, i) => [x(i), MID + half(s.pctOfArrived)]);

	// Closed funnel body: top edge L→R, down the right, bottom edge R→L.
	const bodyPath =
		smooth(topPts) +
		` L ${botPts[n - 1][0]},${botPts[n - 1][1]}` +
		smooth([...botPts].reverse()).replace(/^M [^C]*/, " ") +
		" Z";

	// Biggest narrowing by absolute lost sessions.
	let dropIdx = -1;
	let dropLost = 0;
	for (let i = 1; i < n; i++) {
		const lost = stages[i - 1].sessions - stages[i].sessions;
		if (lost > dropLost) {
			dropLost = lost;
			dropIdx = i;
		}
	}

	return (
		<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Funil medido, do primeiro acesso à compra" className="w-full">
			<defs>
				<linearGradient id={`fg-${gid}`} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" className="[stop-color:rgb(56_189_248)]" stopOpacity="0.45" />
					<stop offset="70%" className="[stop-color:rgb(56_189_248)]" stopOpacity="0.28" />
					<stop offset="100%" className="[stop-color:rgb(52_211_153)]" stopOpacity="0.5" />
				</linearGradient>
			</defs>

			{/* The funnel body. */}
			<path d={bodyPath} fill={`url(#fg-${gid})`} className="stroke-sky-400/25" strokeWidth={1} />

			{/* Stage dividers + per-stage labels. */}
			{stages.map((s, i) => {
				const cx = x(i);
				const isPaid = s.key === "paid";
				return (
					<g key={s.key}>
						<line
							x1={cx}
							y1={topPts[i][1]}
							x2={cx}
							y2={botPts[i][1]}
							className={isPaid ? "stroke-emerald-300/60" : "stroke-sky-200/30"}
							strokeWidth={1}
						/>
						{/* value above */}
						<text x={cx} y={TOP - 26} textAnchor="middle" fontSize={13} className="fill-content tabular-nums font-medium">
							{s.sessions.toLocaleString("pt-BR")}
						</text>
						<text x={cx} y={TOP - 12} textAnchor="middle" fontSize={11} className="fill-content-faint tabular-nums">
							{fmtPct(s.pctOfArrived)}
						</text>
						{/* stage name below */}
						<text
							x={cx}
							y={BOT + 20}
							textAnchor="middle"
							fontSize={10.5}
							className={isPaid ? "fill-emerald-300" : "fill-content-secondary"}
						>
							{s.label}
						</text>
					</g>
				);
			})}

			{/* Biggest narrowing, annotated at the choke point. */}
			{dropIdx > 0 && dropLost > 0 && (
				<g>
					<line
						x1={(x(dropIdx - 1) + x(dropIdx)) / 2}
						y1={MID - half(stages[dropIdx - 1].pctOfArrived) - 4}
						x2={(x(dropIdx - 1) + x(dropIdx)) / 2}
						y2={MID - half(stages[dropIdx - 1].pctOfArrived) - 16}
						className="stroke-rose-400/70"
						strokeWidth={1}
					/>
					<text
						x={(x(dropIdx - 1) + x(dropIdx)) / 2}
						y={MID - half(stages[dropIdx - 1].pctOfArrived) - 20}
						textAnchor="middle"
						fontSize={11}
						className="fill-rose-400"
					>
						−{dropLost.toLocaleString("pt-BR")} sessões aqui
					</text>
				</g>
			)}
		</svg>
	);
}
