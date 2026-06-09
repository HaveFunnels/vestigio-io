"use client";

import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { CompetitorSection } from "../types";

/*
 * Wave 22.8.2 — Competitor Radar section
 *
 * Surfaces this cycle's competitive intelligence:
 *  - Header: how many competitors are monitored + how many have signal
 *    activity this cycle.
 *  - Peer-set rows: trust_posture_lag and serp_overlap_detected, when
 *    they fired. These are not attached to a specific competitor; they
 *    summarise where the env stands vs the whole curated peer set.
 *  - Per-competitor rows: domain + active/auto badge + per-kind signal
 *    chips. Entries without signals still render so the customer sees
 *    who is being tracked.
 *
 * Self-hides only when both totalMonitored is 0 AND no signals are
 * present. Monitoring-only mode (curated competitors, no signals yet)
 * renders the list with a "no activity this cycle" callout so the
 * customer never wonders whether tracking is even on.
 */

interface Props {
	competitor: CompetitorSection | null | undefined;
}

const SEVERITY_TONE: Record<string, { fg: string; bg: string; ring: string; label: string }> = {
	high: { fg: "text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-500/20", label: "Alto" },
	medium: { fg: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/20", label: "Médio" },
	low: { fg: "text-sky-300", bg: "bg-sky-500/10", ring: "ring-sky-500/20", label: "Baixo" },
};

const KIND_LABEL: Record<string, string> = {
	copy_mirror: "Copy espelhada",
	serp_encroachment: "Avanço em SERP de marca",
};

function SeverityChip({ severity, children }: { severity: "low" | "medium" | "high"; children?: React.ReactNode }) {
	const tone = SEVERITY_TONE[severity];
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${tone.bg} ${tone.fg} ${tone.ring}`}
		>
			{children ?? tone.label}
		</span>
	);
}

export default function Competitor({ competitor }: Props) {
	if (!competitor) return null;

	const monitoringOnly =
		competitor.withSignalsCount === 0 &&
		!competitor.trustPostureLag &&
		!competitor.serpOverlap;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Concorrência neste ciclo
				</h2>
				<div className="text-[11px] text-content-faint">
					{competitor.totalActive} de {competitor.totalMonitored} ativos
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				{/* Top-line summary. Reads slightly different in monitoring-
				    only mode so the customer never sees a contradiction
				    between "we're watching" and "nothing happened". */}
				<div className="mb-5 border-b border-edge/40 pb-5">
					<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Sinais este ciclo
					</div>
					<div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-content">
						{competitor.withSignalsCount +
							(competitor.trustPostureLag ? 1 : 0) +
							(competitor.serpOverlap ? 1 : 0)}
					</div>
					<div className="mt-0.5 text-[11px] text-content-muted">
						{monitoringOnly
							? "Nenhum sinal competitivo material este ciclo. Continuamos monitorando."
							: `${competitor.withSignalsCount} ${competitor.withSignalsCount === 1 ? "concorrente com sinal" : "concorrentes com sinais"} atribuídos.`}
					</div>
				</div>

				{/* Peer-set-wide signals. Trust posture lag = how your
				    headers + DMARC + SPF stack up against the median of
				    the peer set. Serp overlap = how often your peers
				    co-occur with you for category queries. */}
				{(competitor.trustPostureLag || competitor.serpOverlap) && (
					<div className="mb-5 space-y-3 border-b border-edge/40 pb-5">
						{competitor.trustPostureLag && (
							<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
								<div className="flex items-baseline justify-between gap-2">
									<div className="flex items-baseline gap-2">
										<span className="text-[13px] font-semibold text-content">
											Trust posture vs. peer set
										</span>
										<SeverityChip severity={competitor.trustPostureLag.severity} />
									</div>
									<span className="text-[10px] text-content-faint">peer-set</span>
								</div>
								<p className="mt-2 text-[12.5px] leading-snug text-content-secondary">
									{competitor.trustPostureLag.summary}
								</p>
							</div>
						)}
						{competitor.serpOverlap && (
							<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
								<div className="flex items-baseline justify-between gap-2">
									<div className="flex items-baseline gap-2">
										<span className="text-[13px] font-semibold text-content">
											Overlap em SERP de categoria
										</span>
										<SeverityChip severity={competitor.serpOverlap.severity} />
									</div>
									<span className="text-[10px] text-content-faint">peer-set</span>
								</div>
								<p className="mt-2 text-[12.5px] leading-snug text-content-secondary">
									{competitor.serpOverlap.summary}
								</p>
							</div>
						)}
					</div>
				)}

				{/* Per-competitor rows. */}
				{competitor.entries.length > 0 ? (
					<>
						<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Em monitoramento
						</div>
						<ul className="space-y-2">
							{competitor.entries.map((e) => {
								const hasSignals = e.signals.length > 0;
								return (
									<li
										key={e.domain}
										className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/20 p-3 sm:flex-row sm:items-center sm:gap-4"
									>
										<div className="flex flex-1 items-baseline gap-2">
											<Radio
												className={`h-3 w-3 shrink-0 ${hasSignals ? "text-rose-300" : "text-content-faint"}`}
												aria-hidden
											/>
											<div className="min-w-0">
												<div className="truncate font-mono text-[13px] text-content">
													{e.domain}
												</div>
												{e.label && e.label !== e.domain && (
													<div className="truncate text-[11px] text-content-muted">
														{e.label}
													</div>
												)}
											</div>
											<span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-content-faint">
												{e.discoveryMethod}
											</span>
										</div>
										{hasSignals ? (
											<div className="flex flex-wrap gap-1.5 sm:justify-end">
												{e.signals.map((s, i) => {
													const tone = SEVERITY_TONE[s.severity];
													return (
														<span
															key={`${e.domain}-${s.kind}-${i}`}
															className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] ring-1 ring-inset ${tone.bg} ${tone.ring}`}
															title={s.detail}
														>
															<span className={`font-semibold ${tone.fg}`}>{tone.label}</span>
															<span className="text-content-secondary">·</span>
															<span className="text-content-secondary">{KIND_LABEL[s.kind] ?? s.kind}</span>
														</span>
													);
												})}
											</div>
										) : (
											<span className="self-start text-[10.5px] italic text-content-faint sm:self-center">
												sem sinal este ciclo
											</span>
										)}
									</li>
								);
							})}
						</ul>
					</>
				) : (
					<div className="rounded-xl border border-dashed border-edge bg-surface-inset/30 p-4 text-center text-[12.5px] text-content-muted">
						Nenhum concorrente curado. Em breve será possível adicionar domínios
						pela tela de configuração para ativar comparações de copy, trust e SERP.
					</div>
				)}

				{/* Footer link de gestão removido até existir a tela real
				    de curadoria de concorrentes (depende do IA reform que
				    promove Workspaces a hub de configuração). Linkar para
				    /app/workspaces hoje redireciona para findings?lens=
				    revenue, sem relação com o que o cliente espera. */}
			</div>
		</motion.section>
	);
}
