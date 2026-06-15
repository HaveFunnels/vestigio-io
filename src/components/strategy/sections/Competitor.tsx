"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
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
	/** Quando true, renderiza sem o h2/subtítulo + sem motion section +
	 *  sem outer card chrome — pra rodar dentro de Carteira onde o tab
	 *  strip já provê todo esse contexto. */
	embedded?: boolean;
}

const SEVERITY_TONE: Record<string, { fg: string; bg: string; ring: string; label: string }> = {
	high: { fg: "text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-500/20", label: "Alto" },
	medium: { fg: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/20", label: "Médio" },
	low: { fg: "text-sky-300", bg: "bg-sky-500/10", ring: "ring-sky-500/20", label: "Baixo" },
};

const KIND_LABEL: Record<string, string> = {
	copy_mirror: "Copy espelhada",
	serp_encroachment: "Avanço em pesquisas de marca",
	// Wave 23.1 — trend signals computados na plan-section cross-cycle
	price_increase: "Subiu preço",
	dropped_free_tier: "Removeu tier grátis",
	content_acceleration: "Acelerou conteúdo",
	content_silence: "Silêncio em conteúdo",
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

export default function Competitor({ competitor, embedded = false }: Props) {
	if (!competitor) return null;

	const monitoringOnly =
		competitor.withSignalsCount === 0 &&
		!competitor.trustPostureLag &&
		!competitor.serpOverlap;

	const sectionContent = (
		<>
			<div data-vsgp-card className={embedded ? "" : "rounded-2xl border border-edge bg-surface-card p-5 sm:p-6"}>
				{/* Top-line summary. monitoring-only mode reframes o empty
				    state como sinal positivo + desarma "vocês estão checando
				    mesmo?" listando concretamente o que foi comparado +
				    promete vigilância contínua antes do problema. */}
				<div className="mb-5 border-b border-edge/40 pb-5">
					{monitoringOnly ? (
						<>
							<div className="flex items-baseline justify-between gap-3">
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Marca intacta
								</div>
								<span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
									Sem cópia detectada
								</span>
							</div>
							<div className="mt-2 font-serif text-[18px] leading-snug text-content">
								Nada mexeu na sua posição este ciclo.
							</div>
							<p className="mt-1.5 text-[12.5px] leading-snug text-content-secondary">
								Nenhum dos {competitor.totalMonitored}{" "}
								{competitor.totalMonitored === 1 ? "concorrente monitorado" : "concorrentes monitorados"} imitou sua copy comercial, subiu nas pesquisas pelo nome da sua marca, nem encurtou a distância entre o que você promete e o que eles prometem.
							</p>
							<p className="mt-2 text-[12.5px] leading-snug text-content-muted">
								Continuamos checando. Se algum concorrente começar a mexer, mostramos aqui antes de virar problema.
							</p>
						</>
					) : (
						<>
							<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
								Sinais este ciclo
							</div>
							<div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-content">
								{competitor.withSignalsCount +
									(competitor.trustPostureLag ? 1 : 0) +
									(competitor.serpOverlap ? 1 : 0)}
							</div>
							<div className="mt-0.5 text-[11px] text-content-muted">
								{competitor.withSignalsCount}{" "}
								{competitor.withSignalsCount === 1
									? "concorrente com sinal"
									: "concorrentes com sinais"}{" "}
								atribuídos.
							</div>
						</>
					)}
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
						<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Em monitoramento
						</div>
						{/* Reta-final: explicit "what we compare" line so the
						    customer sees the surface area we cover even when no
						    competitor produced a signal. Previously the rows
						    just said "sem sinal este ciclo" and the customer
						    had no idea what was being checked.
						    Wave-23 polish: termos técnicos ("SERP", "trust
						    posture") traduzidos pra pt-BR + segundo parágrafo
						    de "por que esses concorrentes" preempta a dúvida
						    "vocês acharam errado" reposicionando como sinal
						    de mercado (não de qualidade da análise). */}
						<p className="mb-2 text-[11.5px] text-content-muted">
							Vestigio compara <span className="text-content-secondary">copy de páginas comerciais</span>,{" "}
							<span className="text-content-secondary">posicionamento de pesquisas de marca</span> e{" "}
							<span className="text-content-secondary">postura de confiança</span> de cada concorrente contra o seu site, a cada ciclo.
						</p>
						<p className="mb-2 text-[11.5px] text-content-muted">
							Os concorrentes abaixo são as marcas que o seu cliente encontra quando busca por ofertas como a sua. Se não são os que você esperava, isso é uma descoberta: seu posicionamento está te colocando num espaço diferente do mercado que você tem em mente.
						</p>
						<p className="mb-3 text-[11.5px] text-content-muted">
							Em{" "}
							<span className="font-medium text-content-secondary">Gerenciar concorrentes</span>,
							{" "}adicione os concorrentes esperados e vamos comparar esperados × reais a cada ciclo.
						</p>
						<ul className="space-y-2">
							{competitor.entries.map((e) => {
								const hasSignals = e.signals.length > 0;
								const deep = e.deepSnapshot;
								// Wave 23 P0.2 + P1.2 — formata pricing tiers + blog
								// cadence pra exibir abaixo do nome do concorrente.
								// Só renderiza quando há pelo menos um dos dois sinais
								// detectados; sem isso, fica vazio (pristino).
								const hasDeepData =
									deep && (deep.tierCount > 0 || deep.blogPostCount != null);
								const pricingHint = (() => {
									if (!deep || deep.tierCount === 0) return null;
									const lowest = deep.pricingTiers
										.filter((t) => t.amount != null)
										.sort((a, b) => (a.amount! - b.amount!))[0];
									if (!lowest || lowest.amount == null) {
										return `${deep.tierCount} ${deep.tierCount === 1 ? "tier" : "tiers"}`;
									}
									const currencySymbol =
										lowest.currency === "BRL" ? "R$" :
										lowest.currency === "EUR" ? "€" :
										lowest.currency === "GBP" ? "£" : "$";
									const intervalLabel =
										lowest.interval === "month" ? "/mês" :
										lowest.interval === "year" ? "/ano" :
										lowest.interval === "one_time" ? "" : "";
									const freeBadge = deep.hasFreeTier ? "Free · " : "";
									return `${deep.tierCount} ${deep.tierCount === 1 ? "tier" : "tiers"} · ${freeBadge}a partir de ${currencySymbol} ${Math.round(lowest.amount)}${intervalLabel}`;
								})();
								const blogHint = (() => {
									if (!deep || deep.blogPostCount == null) return null;
									const dateStr = deep.blogLatestPostDate
										? (() => {
											try {
												const d = new Date(deep.blogLatestPostDate);
												const dd = String(d.getDate()).padStart(2, "0");
												const mmName = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][d.getMonth()];
												return ` (último: ${dd} ${mmName})`;
											} catch {
												return "";
											}
										})()
										: "";
									return `Blog: ${deep.blogPostCount} ${deep.blogPostCount === 1 ? "post" : "posts"}${dateStr}`;
								})();
								return (
									<li
										key={e.domain}
										className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/20 p-3"
									>
										<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
											<div className="flex flex-1 items-baseline gap-2">
												<Radio
													className={`h-3 w-3 shrink-0 ${hasSignals ? "text-rose-300" : "text-emerald-400/70"}`}
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
												<span className="inline-flex items-center gap-1 self-start rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-emerald-300 ring-1 ring-inset ring-emerald-500/20 sm:self-center">
													Sem ameaça
												</span>
											)}
										</div>
										{/* Wave 23 P0.2 + P1.2 — deep snapshot row. Surface
										    pricing tiers + blog cadence detectados pelo
										    deep-fetch pass. Sem isso, os dados ficavam coletados
										    mas invisíveis ao customer. */}
										{hasDeepData && (
											<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge/30 pt-2 text-[11px] text-content-muted">
												{pricingHint && (
													<span className="inline-flex items-baseline gap-1">
														<span className="text-content-faint">Pricing:</span>
														{deep!.pricingUrl ? (
															<a
																href={deep!.pricingUrl}
																target="_blank"
																rel="noopener noreferrer"
																className="text-content-secondary hover:text-content hover:underline"
															>
																{pricingHint}
															</a>
														) : (
															<span className="text-content-secondary">{pricingHint}</span>
														)}
													</span>
												)}
												{blogHint && (
													<span className="inline-flex items-baseline gap-1">
														{deep!.blogUrl ? (
															<a
																href={deep!.blogUrl}
																target="_blank"
																rel="noopener noreferrer"
																className="text-content-secondary hover:text-content hover:underline"
															>
																{blogHint}
															</a>
														) : (
															<span className="text-content-secondary">{blogHint}</span>
														)}
													</span>
												)}
											</div>
										)}
									</li>
								);
							})}
						</ul>
					</>
				) : (
					<div className="rounded-xl border border-dashed border-edge bg-surface-inset/30 p-4 text-center text-[12.5px] text-content-muted">
						Nenhum concorrente curado. Adicione domínios em Áreas monitoradas para
						ativar comparações de copy, trust e SERP.
					</div>
				)}

				<div className="mt-5 border-t border-edge/40 pt-3 text-right">
					<Link
						href="/app/workspaces#concorrentes"
						className="inline-flex items-center gap-1 text-[12px] font-medium text-content-secondary underline-offset-4 transition-colors hover:text-content hover:underline"
					>
						Gerenciar concorrentes
						<ArrowRight className="h-3 w-3" />
					</Link>
				</div>
			</div>
		</>
	);

	// Embedded mode: render só o conteúdo, sem motion.section + sem
	// header próprio. O Carteira parent já provê todo esse chrome via
	// tab strip. Em standalone mode, mantém o layout completo.
	if (embedded) return sectionContent;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Concorrência neste ciclo
				</h2>
				<div className="text-[11px] text-content-faint">
					{competitor.totalActive} de {competitor.totalMonitored} ativos
				</div>
			</div>
			{sectionContent}
		</motion.section>
	);
}
