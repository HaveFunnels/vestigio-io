"use client";

import { motion } from "framer-motion";
import type { BuyerSegment } from "../types";

/*
 * Buyer Segments — "O que sua audit revelou este mês"
 *
 * Decomposed by who-owns-the-fix (copy / eng / leadership). Each
 * card shows count + impact midpoint + 1-2 sample finding titles.
 * This is the section where the operator decides who in their team
 * to brief; the segments come from a deterministic mapping of
 * inference key → ownership (see PLAN_MONTHLY_STRATEGY.md §3).
 */

interface Props {
	segments: BuyerSegment[];
}

const BUYER_ACCENT: Record<string, { dot: string; bg: string; chip: string }> = {
	copy: {
		dot: "bg-amber-400",
		bg: "from-amber-500/[0.06] to-transparent",
		chip: "bg-amber-500/10 text-amber-200/90 ring-amber-500/20",
	},
	eng: {
		dot: "bg-sky-400",
		bg: "from-sky-500/[0.06] to-transparent",
		chip: "bg-sky-500/10 text-sky-200/90 ring-sky-500/20",
	},
	leadership: {
		dot: "bg-violet-400",
		bg: "from-violet-500/[0.06] to-transparent",
		chip: "bg-violet-500/10 text-violet-200/90 ring-violet-500/20",
	},
};

function formatBRL(value: number): string {
	if (value >= 1000) return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

export default function BuyerSegments({ segments }: Props) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que sua audit revelou este mês
				</h2>
				<div className="text-[11px] text-content-faint">
					decomposto por quem resolve
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{segments.map((s, idx) => {
					const accent = BUYER_ACCENT[s.buyer] ?? BUYER_ACCENT.eng;
					return (
						<motion.div
							key={s.buyer}
							data-vsgp-card
							initial={{ opacity: 0, y: 12 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.45, delay: 0.1 + idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
							whileHover={{ y: -2 }}
							className={`group relative flex min-h-[200px] flex-col overflow-hidden rounded-2xl border border-edge bg-gradient-to-b ${accent.bg} bg-surface-card p-6 transition-colors hover:border-edge-focus`}
						>
							<div className="mb-1 flex items-center gap-2">
								<span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									{s.buyer === "copy" ? "Copy" : s.buyer === "eng" ? "Engenharia" : "Liderança"}
								</div>
							</div>

							<div className="text-[15px] font-semibold text-content">
								{s.buyerLabel}
							</div>
							<div className="mt-0.5 text-[12px] text-content-muted">
								{s.count} {s.count === 1 ? "finding" : "findings"}
							</div>

							<div className="mt-4 font-mono text-[22px] font-semibold tabular-nums text-content">
								{formatBRL(s.impactMidpoint)}
								<span className="ml-1 text-[12px] font-normal text-content-faint">
									/ mês
								</span>
							</div>
							<div className="mt-0.5 font-mono text-[10px] tabular-nums text-content-faint">
								faixa {formatBRL(s.impactMin)} — {formatBRL(s.impactMax)}
							</div>

							<div className="mt-4 flex-1 space-y-1.5 border-t border-edge/40 pt-3">
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Exemplos
								</div>
								{s.sampleFindingTitles.slice(0, 2).map((title, i) => (
									<div
										key={i}
										className="text-[13px] leading-snug text-content-secondary"
									>
										· {title}
									</div>
								))}
							</div>
						</motion.div>
					);
				})}
			</div>
		</motion.section>
	);
}
