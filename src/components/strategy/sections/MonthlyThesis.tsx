"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/*
 * E1 + E5 — Monthly Thesis pull-quote
 *
 * Single-sentence pull-quote at the top of the plan. Frames the
 * reading angle for everything below ("Este mês, o gargalo é X")
 * and carries an explicit Vestigio attribution so the plan reads
 * as analyst output, not engine output.
 *
 * Render contract:
 *   - Hidden when thesis is null/empty (legacy plans).
 *   - Bold-aware: ** markdown bolds the central term so the eye
 *     locks on the apostable noun.
 *   - Attribution line: "— Vestigio · análise do ciclo".
 */

interface Props {
	thesis: string | null | undefined;
	monthLabel: string;
}

function renderBold(text: string): ReactNode[] {
	const parts: ReactNode[] = [];
	const matches = Array.from(text.matchAll(/(\*\*[^*]+\*\*)/g));
	let lastIndex = 0;
	let key = 0;
	for (const m of matches) {
		const idx = m.index ?? 0;
		if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
		parts.push(
			<strong key={key++} className="font-semibold text-content">
				{m[0].slice(2, -2)}
			</strong>,
		);
		lastIndex = idx + m[0].length;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

export default function MonthlyThesis({ thesis, monthLabel }: Props) {
	if (!thesis || thesis.trim().length === 0) return null;
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-10"
		>
			<div
				data-vsgp-card
				className="relative overflow-hidden rounded-2xl border border-edge bg-gradient-to-br from-surface-card via-surface-card to-surface-inset/30 p-7 sm:p-9"
			>
				{/* Decorative quote glyph — pure ornament, anchored top-left. */}
				<div
					aria-hidden
					className="pointer-events-none absolute -left-2 -top-4 select-none font-serif text-[110px] leading-none text-content-faint/15"
				>
					“
				</div>

				<div className="relative">
					<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
						Tese de {monthLabel}
					</div>
					<p className="font-serif text-[20px] leading-[1.4] text-content-secondary sm:text-[22px]">
						{renderBold(thesis)}
					</p>
					<div className="mt-5 flex items-center gap-2 text-[11px] text-content-faint">
						<span className="h-px w-6 bg-content-faint/40" />
						<span className="font-medium uppercase tracking-[0.14em]">Vestigio · análise do ciclo</span>
					</div>
				</div>
			</div>
		</motion.section>
	);
}
