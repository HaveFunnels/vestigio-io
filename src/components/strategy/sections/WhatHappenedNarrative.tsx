"use client";

import { motion } from "framer-motion";
import React from "react";

/*
 * Narrative — "O que aconteceu em [mês]"
 *
 * Single editorial column. Fraunces 17px / line-height 1.7 / max-w
 * ~640px. The narrative is markdown-ish (bold, paragraph breaks,
 * inline code). We render four constructs the LLM is allowed to emit:
 *   **bold**, *italic*, backtick-code, and \n\n paragraph break.
 * Sonnet 4.6 will be constrained by prompt to only emit those.
 */

interface PackSlice {
	pack: string;
	label: string;
	count: number;
	sharePct: number;
}

interface Props {
	narrative: string;
	monthLabel: string;
	/** Reta-final: pack distribution visual rendered above the narrative
	 *  body. Hidden when empty (no open findings). */
	packDistribution?: PackSlice[];
}

// Deterministic color palette so the same pack always renders the same
// hue across plans + months. Picked for accessible contrast on the dark
// shell + visual gradient (warm -> cool) so the "biggest = warmest" reads
// even without labels.
const PACK_COLORS: Record<string, string> = {
	copy_alignment: "rgb(248 113 113)", // rose-400
	scale_readiness: "rgb(251 146 60)", // orange-400
	trust: "rgb(250 204 21)", // yellow-400
	revenue: "rgb(74 222 128)", // green-400
	saas: "rgb(56 189 248)", // sky-400
	behavioral: "rgb(167 139 250)", // violet-400
	chargeback: "rgb(244 114 182)", // pink-400
};

function colorForPack(pack: string): string {
	const k = pack.replace(/_pack$/, "");
	return PACK_COLORS[k] ?? "rgb(161 161 170)"; // zinc-400 fallback
}

function renderInline(text: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	const matches = Array.from(text.matchAll(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g));
	let lastIndex = 0;
	let key = 0;
	for (const m of matches) {
		const idx = m.index ?? 0;
		if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
		const token = m[0];
		if (token.startsWith("**")) {
			parts.push(
				<strong key={key++} className="font-semibold text-content">
					{token.slice(2, -2)}
				</strong>,
			);
		} else if (token.startsWith("*")) {
			parts.push(
				<em key={key++} className="italic">
					{token.slice(1, -1)}
				</em>,
			);
		} else if (token.startsWith("`")) {
			parts.push(
				<code
					key={key++}
					className="rounded bg-surface-inset px-1 py-0.5 font-mono text-[0.92em] text-content"
				>
					{token.slice(1, -1)}
				</code>,
			);
		}
		lastIndex = idx + token.length;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

export default function WhatHappenedNarrative({ narrative, monthLabel, packDistribution }: Props) {
	const paragraphs = narrative.split(/\n{2,}/).filter((p) => p.trim().length > 0);
	const hasPackBar = Array.isArray(packDistribution) && packDistribution.length > 0;
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
			className="mb-12"
		>
			<div className="mx-auto max-w-[680px]">
				<div className="mb-3 flex items-center gap-3">
					<div className="h-px flex-1 bg-edge/60" />
					<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
						Pulse · narrativa do mês
					</div>
					<div className="h-px flex-1 bg-edge/60" />
				</div>

				<h2 className="mb-6 text-center font-serif text-[28px] font-medium leading-tight tracking-tight text-content sm:text-[32px]">
					O que aconteceu em {monthLabel}
				</h2>

				{/* Reta-final: pack distribution visual. Replaces the prose
				    "tema dominante: copy 44%" which buried the structural
				    insight in a paragraph. A 6px stacked bar carries the
				    same info in 1 second of scanning. Hidden when no open
				    findings exist (single segment with 100% reads as
				    "Vestigio is empty" — empty state belongs elsewhere). */}
				{hasPackBar && (
					<div className="mb-7" data-vsgp-pack-bar>
						<div className="mb-2 flex items-baseline justify-between text-[11px] text-content-faint">
							<span className="font-semibold uppercase tracking-[0.14em]">Distribuição por tema</span>
							<span>
								{packDistribution!.reduce((a, b) => a + b.count, 0)} vazamentos abertos
							</span>
						</div>
						<div className="flex h-2 w-full overflow-hidden rounded-full border border-edge/40 bg-surface-inset/40">
							{packDistribution!.map((slice) => (
								<div
									key={slice.pack}
									style={{
										width: `${slice.sharePct}%`,
										backgroundColor: colorForPack(slice.pack),
									}}
									title={`${slice.label} · ${slice.sharePct}% · ${slice.count} vazamentos`}
								/>
							))}
						</div>
						<div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-content-secondary">
							{packDistribution!.slice(0, 5).map((slice) => (
								<span key={slice.pack} className="inline-flex items-center gap-1.5">
									<span
										className="h-2 w-2 shrink-0 rounded-[2px]"
										style={{ backgroundColor: colorForPack(slice.pack) }}
									/>
									<span>{slice.label}</span>
									<span className="text-content-faint">{slice.sharePct}%</span>
								</span>
							))}
						</div>
					</div>
				)}

				<div
					data-vsgp-narrative
					className="font-serif text-[17px] leading-[1.7] text-content-secondary"
				>
					{paragraphs.map((para, i) => (
						<p key={i} className={i > 0 ? "mt-5" : ""}>
							{renderInline(para)}
						</p>
					))}
				</div>
			</div>
		</motion.section>
	);
}
