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

interface Props {
	narrative: string;
	monthLabel: string;
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

export default function WhatHappenedNarrative({ narrative, monthLabel }: Props) {
	const paragraphs = narrative.split(/\n{2,}/).filter((p) => p.trim().length > 0);
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
