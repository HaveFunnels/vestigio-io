"use client";

import { motion } from "framer-motion";
import BasisChip from "../BasisChip";

/*
 * ONDA 2.3 — "O que mudou no site" (probe-measured, longitudinal)
 *
 * The month-2 retention engine: the first question a returning reader
 * asks — "o que mudou desde o último plano?" — answered from daily
 * probes (status transitions confirmed twice, content-hash diffs,
 * latency medians). A quiet window still renders: "X páginas
 * monitoradas, nenhuma mudança estrutural" is the always-on proof,
 * not an empty state.
 */

export interface WhatChangedRowUI {
	kind: "went_down" | "came_back" | "content_changed" | "slower";
	path: string;
	detail: string;
	observedAt: string;
}

export interface WhatChangedUI {
	basis: "probe_measured";
	windowStart: string;
	windowEnd: string;
	probedPages: number;
	rows: WhatChangedRowUI[];
}

interface Props {
	whatChanged: WhatChangedUI | null | undefined;
}

const KIND_STYLE: Record<WhatChangedRowUI["kind"], { dot: string; label: string }> = {
	went_down: { dot: "bg-rose-400", label: "Caiu" },
	slower: { dot: "bg-amber-400", label: "Mais lenta" },
	came_back: { dot: "bg-emerald-400", label: "Voltou" },
	content_changed: { dot: "bg-sky-400", label: "Conteúdo mudou" },
};

export default function WhatChanged({ whatChanged }: Props) {
	if (!whatChanged) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-10"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que mudou no site
				</h2>
				<div className="flex items-center gap-2 text-[11px] text-content-faint">
					<BasisChip basis="measured" />
					<span>Verificações diárias · {whatChanged.windowStart} a {whatChanged.windowEnd}</span>
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
				{whatChanged.rows.length === 0 ? (
					<p className="text-[13px] leading-relaxed text-content-secondary">
						<span className="font-medium text-content">
							{whatChanged.probedPages}{" "}
							{whatChanged.probedPages === 1 ? "página monitorada" : "páginas monitoradas"}
						</span>{" "}
						diariamente no período — nenhuma queda, mudança de conteúdo ou degradação de
						velocidade detectada. Estabilidade também é informação.
					</p>
				) : (
					<ul className="space-y-3">
						{whatChanged.rows.map((r, i) => {
							const st = KIND_STYLE[r.kind];
							return (
								<li key={`${r.kind}-${r.path}-${i}`} className="flex items-start gap-3">
									<span
										aria-hidden
										className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`}
									/>
									<div className="min-w-0">
										<div className="flex flex-wrap items-baseline gap-x-2">
											<span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
												{st.label}
											</span>
											<span className="font-mono text-[12px] text-content">{r.path}</span>
										</div>
										<p className="mt-0.5 text-[13px] leading-relaxed text-content-secondary">
											{r.detail}
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				)}
				<p className="mt-4 border-t border-edge/50 pt-3 text-[11px] leading-relaxed text-content-faint">
					Medido por verificação direta das páginas (status, conteúdo e tempo de resposta).
					Uma queda só é reportada quando confirmada em duas verificações seguidas.
				</p>
			</div>
		</motion.section>
	);
}
