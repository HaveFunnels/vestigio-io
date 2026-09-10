"use client";

import { motion } from "framer-motion";
import { usePlanScreenshotForUrl } from "../PlanScreenshotContext";
import { useState, type ReactNode } from "react";

/*
 * ONDA 4.2 — the editorial opening.
 *
 * "Uninspired" diagnosis: the plan opened with a quote card and a wall
 * of metric tiles — a dashboard clearing its throat. A document with
 * authorship opens like a cover: the month's ONE discovery as a
 * designed headline, the customer's own site standing beside it as
 * the protagonist. Works for any vertical — the visual is the
 * customer's real page, whatever they sell.
 */

interface Props {
	thesis: string | null;
	monthLabel: string;
	envDomain: string;
}

/** Bold-only inline renderer for the thesis markdown (** **). */
function renderBold(text: string): ReactNode[] {
	const parts: ReactNode[] = [];
	let last = 0;
	let key = 0;
	for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
		const idx = m.index ?? 0;
		if (idx > last) parts.push(text.slice(last, idx));
		parts.push(
			<span key={key++} className="font-semibold text-content">
				{m[1]}
			</span>,
		);
		last = idx + m[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}

export default function EditorialOpening({ thesis, monthLabel, envDomain }: Props) {
	// The site itself as the cover art — the homepage capture exists for
	// every instrumented customer, store or not.
	const cover = usePlanScreenshotForUrl("/");
	const [coverFailed, setCoverFailed] = useState(false);
	if (!thesis) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
			className="mb-16"
		>
			<div className="grid items-center gap-8 lg:grid-cols-[1.35fr_1fr]">
				<div>
					<div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-faint">
						A descoberta de {monthLabel}
					</div>
					<h2 className="font-serif text-[28px] font-medium leading-[1.25] tracking-tight text-content-secondary sm:text-[34px] sm:leading-[1.22]">
						{renderBold(thesis)}
					</h2>
					<div className="mt-5 flex items-center gap-2 text-[11px] text-content-faint">
						<span className="h-px w-8 bg-edge" aria-hidden />
						<span>
							Vestigio · análise contínua de {envDomain}
						</span>
					</div>
				</div>

				{cover && !coverFailed && (
					<figure className="relative hidden overflow-hidden rounded-2xl border border-edge shadow-2xl shadow-black/30 lg:block">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={cover.url}
							alt={`Página inicial de ${envDomain}`}
							loading="eager"
							onError={() => setCoverFailed(true)}
							className="block max-h-[300px] w-full object-cover object-top"
						/>
						<figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2.5 pt-8 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
							Seu site, visto pela Vestigio
						</figcaption>
					</figure>
				)}
			</div>
		</motion.section>
	);
}
