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
 * the flow narrows organically, filled with a vivid gradient drawn
 * from the plan's own theme palette (sky arrival → violet decision →
 * green paid), a lit top rim as signature, and the sharpest narrowing
 * annotated at the choke. Inline SVG, viewBox-responsive, no lib.
 */

const W = 720;
const H = 228;
const PAD_X = 44;
const TOP = 74; // funnel top — leaves a wide gap under the value labels
const BOT = 186; // funnel bottom; stage names sit well below it
const MID = (TOP + BOT) / 2;
const BODY = BOT - TOP; // 112 — a shorter, calmer funnel
const MIN_THREAD = 3; // px — a 0-ish stage stays a visible thread
const LABEL_VALUE_Y = 26; // sessions count (absolute, up near the top)
const LABEL_PCT_Y = 42; // percentage under it — 32px of air to the funnel
const LABEL_NAME_DY = 26; // stage-name gap below the funnel bottom

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
	// Perceptual (sqrt) height: a 96% cliff to a 1% tail would render as
	// a hairline under strict proportion, so the small stages get visual
	// weight while the ORDER and the drama stay intact. The numbers and
	// percentages in the labels are the real measured values — only the
	// shape's proportion is eased (standard funnel-viz encoding).
	const vh = (pct: number) => Math.sqrt(Math.max(pct, 0) / 100) * BODY;
	const half = (pct: number) => Math.max(vh(pct), MIN_THREAD) / 2;

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
				{/* The journey as a gradient, drawn FROM the plan's own
				    "Distribuição por tema" palette (WhatHappenedNarrative
				    PACK_COLORS): sky-400 arrival → violet-400 consideration
				    → green-400 paid (green is literally the `revenue` pack
				    color — money at the tip). Vivid opacity, not the washed
				    0.3 it was. */}
				<linearGradient id={`fg-${gid}`} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" className="[stop-color:rgb(56_189_248)]" stopOpacity="0.9" />
					<stop offset="48%" className="[stop-color:rgb(167_139_250)]" stopOpacity="0.85" />
					<stop offset="100%" className="[stop-color:rgb(74_222_128)]" stopOpacity="0.95" />
				</linearGradient>
				{/* Lit top rim — the one signature flourish. */}
				<linearGradient id={`fr-${gid}`} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" className="[stop-color:rgb(125_211_252)]" />
					<stop offset="100%" className="[stop-color:rgb(134_239_172)]" />
				</linearGradient>
				{/* Vertical gloss: lit-from-above sheen that gives the
				    funnel-graph-js glossy 3D depth. White at the top edge,
				    gone by the middle, a whisper of shadow at the base. */}
				<linearGradient id={`fgl-${gid}`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
					<stop offset="42%" stopColor="#ffffff" stopOpacity="0.03" />
					<stop offset="60%" stopColor="#000000" stopOpacity="0" />
					<stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
				</linearGradient>
			</defs>

			{/* Journey color, then the gloss sheen over it. */}
			<path d={bodyPath} fill={`url(#fg-${gid})`} stroke="none" />
			<path d={bodyPath} fill={`url(#fgl-${gid})`} stroke="none" />
			{/* Lit top edge: a bright rim tracing the taper, the signature. */}
			<path d={smooth(topPts)} fill="none" stroke={`url(#fr-${gid})`} strokeWidth={1.75} strokeOpacity={0.9} strokeLinecap="round" />

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
							className={isPaid ? "stroke-green-300/70" : "stroke-white/20"}
							strokeWidth={1}
						/>
						{/* value above */}
						<text x={cx} y={LABEL_VALUE_Y} textAnchor="middle" fontSize={13} className="fill-content tabular-nums font-medium">
							{s.sessions.toLocaleString("pt-BR")}
						</text>
						<text x={cx} y={LABEL_PCT_Y} textAnchor="middle" fontSize={11} className="fill-content-faint tabular-nums">
							{fmtPct(s.pctOfArrived)}
						</text>
						{/* stage name below */}
						<text
							x={cx}
							y={BOT + LABEL_NAME_DY}
							textAnchor="middle"
							fontSize={10.5}
							className={isPaid ? "fill-green-300" : "fill-content-secondary"}
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
						className="stroke-rose-400"
						strokeWidth={1}
					/>
					<text
						x={(x(dropIdx - 1) + x(dropIdx)) / 2}
						y={MID - half(stages[dropIdx - 1].pctOfArrived) - 20}
						textAnchor="middle"
						fontSize={11}
						className="fill-rose-400 font-medium"
					>
						−{dropLost.toLocaleString("pt-BR")} sessões aqui
					</text>
				</g>
			)}
		</svg>
	);
}
