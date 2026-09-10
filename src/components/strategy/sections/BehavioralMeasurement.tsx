"use client";

import { motion } from "framer-motion";
import { sourceIdentity } from "../../../../packages/behavioral/source-identity";
import BasisChip from "../BasisChip";
import MeasuredFunnelViz from "./MeasuredFunnelViz";

/*
 * O que o pixel MEDIU — a seção de chão-de-fábrica do plano.
 *
 * Todo o resto do documento é inferência sobre crawl ou estimativa por
 * severidade; esta seção são contagens sobre sessões reais dos
 * visitantes do cliente, e é a única autorizada a usar "medido".
 * Existe porque o cross-exam da Casa Montelle terminou com: "o plano
 * trocou o que o pixel mediu por aquilo que o crawler infere" — o
 * alerta de tráfego sem intenção do TikTok vivia num documento interno
 * enquanto o PDF pago rodava em heurística.
 *
 * Render contract:
 *   - Self-hide quando behavioral é null (sem pixel) ou sem fontes
 *     acima do mínimo de sessões. Seção medida vazia seria afirmar
 *     ausência — o erro que o resto do ciclo corrigiu.
 *   - Alertas em destaque acima da tabela: são a razão de existir.
 *   - Rodapé declara janela, filtro de bot e a semântica do scroll,
 *     porque estes números vão ser cross-examinados de novo.
 */

export interface BehavioralSourceStatsUI {
	source: string;
	sessions: number;
	sharePct: number;
	medianDurationS: number;
	pctNoScroll: number;
	pctFormStarted: number;
}

export interface BehavioralAlertUI {
	kind: string;
	source: string;
	text: string;
}

export interface MeasuredFunnelStageUI {
	key: string;
	label: string;
	sessions: number;
	pctOfArrived: number;
	dropPctFromPrev: number | null;
}

export interface MeasuredFunnelUI {
	basis: "pixel_measured";
	instrumentedSince?: string | null;
	sessionsConsidered?: number;
	note?: string | null;
	stages: MeasuredFunnelStageUI[];
	biggestDrop: {
		fromLabel: string;
		toLabel: string;
		lostSessions: number;
		dropPct: number;
	} | null;
}

export interface FrictionPageUI {
	path: string;
	label?: string;
	sessions: number;
	deadClicks: number;
	hesitationsNearCta: number;
	inputAbandons: number;
	backtracks: number;
	formRetries: number;
	sessionsWithFriction: number;
	frictionRatePct: number;
}

export interface MeasuredFrictionUI {
	basis: "pixel_measured";
	windowStart: string;
	windowEnd: string;
	sampleSessions: number;
	pages: FrictionPageUI[];
}

export interface BehavioralSectionUI {
	basis: "pixel_measured";
	windowStart: string;
	windowEnd: string;
	windowDays: number;
	sessionsTotal: number;
	sessionsFiltered: number;
	sessionsExcluded: number;
	scrollNote: string;
	sources: BehavioralSourceStatsUI[];
	alerts: BehavioralAlertUI[];
	funnel?: MeasuredFunnelUI | null;
	friction?: MeasuredFrictionUI | null;
}

interface Props {
	behavioral: BehavioralSectionUI | null | undefined;
}

function fmtPct(n: number): string {
	// 0.1 → "0,1%", 99.7 → "99,7%", 12 → "12%". Nunca 0% para algo que
	// aconteceu, nunca 100% para algo que não foi total.
	return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function fmtDuration(s: number): string {
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

export default function BehavioralMeasurement({ behavioral }: Props) {
	if (!behavioral || behavioral.sources.length === 0) return null;

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
				className="rounded-2xl border border-edge bg-surface-card p-6 sm:p-7"
			>
				<div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-content-faint">
					<span>Medido pelo pixel</span>
					<BasisChip basis="measured" />
				</div>
				<h2 className="mb-4 font-serif text-[19px] font-medium text-content">
					O que seus visitantes fizeram, por origem
				</h2>

				{behavioral.alerts.map((alert) => (
					<div
						key={`${alert.kind}-${alert.source}`}
						className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-content"
					>
						{alert.text}
					</div>
				))}

				{/* ONDA 2.1 — o funil MEDIDO da loja: chegou → pagou, com
				    contagem direta de sessões por degrau. A pergunta nº 1 de
				    quem opera loja, respondida sem estimativa. */}
				{behavioral.funnel && behavioral.funnel.stages.length > 0 && (
					<div className="mb-6">
						<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Seu funil, medido — sessões que chegaram em cada etapa
						</div>
						{/* ONDA 4.5 — o funil como desenho: fluxo afunilando de
						    verdade, maior estreitamento anotado no traço. */}
						<MeasuredFunnelViz funnel={behavioral.funnel} />
						{behavioral.funnel.note && (
							<p className="mt-2 text-[11px] leading-relaxed text-content-faint">
								{behavioral.funnel.note}
							</p>
						)}
						{behavioral.funnel.biggestDrop && (
							<div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2 text-[12px] leading-relaxed text-content-secondary">
								Maior perda de gente:{" "}
								<span className="font-medium text-content">
									{behavioral.funnel.biggestDrop.fromLabel} → {behavioral.funnel.biggestDrop.toLabel}
								</span>
								{" — "}
								<span className="font-mono tabular-nums text-rose-300">
									{behavioral.funnel.biggestDrop.lostSessions.toLocaleString("pt-BR")} sessões
								</span>{" "}
								({fmtPct(behavioral.funnel.biggestDrop.dropPct)}) não seguem adiante.
							</div>
						)}
					</div>
				)}

				{/* ONDA 3.2 — onde a fricção acontece, por página, contado. */}
				{behavioral.friction && behavioral.friction.pages.length > 0 && (
					<div className="mb-6">
						<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Onde a fricção acontece — amostra de {behavioral.friction.sampleSessions.toLocaleString("pt-BR")} sessões
						</div>
						<div className="space-y-2">
							{behavioral.friction.pages.map((pg) => {
								const bits: string[] = [];
								if (pg.deadClicks > 0) bits.push(`${pg.deadClicks} cliques sem resposta`);
								if (pg.hesitationsNearCta > 0) bits.push(`${pg.hesitationsNearCta} hesitações perto do botão`);
								if (pg.inputAbandons > 0) bits.push(`${pg.inputAbandons} campos abandonados`);
								if (pg.formRetries > 0) bits.push(`${pg.formRetries} tentativas de formulário`);
								if (pg.backtracks > 0) bits.push(`${pg.backtracks} voltas imediatas`);
								return (
									<div
										key={pg.path}
										className="flex flex-col gap-1 rounded-lg border border-edge/60 bg-surface-inset/30 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between"
									>
										<div className="min-w-0">
											{/* ONDA 4.1 — a ENTIDADE, não o path: o nome que o
											    cliente usa, com o path como referência técnica. */}
											<span className="text-[13px] font-medium text-content">{pg.label ?? pg.path}</span>
											{pg.label && (
												<span className="ml-2 font-mono text-[10.5px] text-content-faint">{pg.path}</span>
											)}
											<span className="mt-0.5 block text-[12px] text-content-secondary">{bits.join(" · ")}</span>
										</div>
										<div className="shrink-0 font-mono text-[11.5px] tabular-nums text-content-muted">
											{pg.sessionsWithFriction.toLocaleString("pt-BR")} de {pg.sessions.toLocaleString("pt-BR")} sessões ·{" "}
											<span className={pg.frictionRatePct >= 20 ? "text-amber-300" : ""}>
												{pg.frictionRatePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				<div className="overflow-x-auto">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="border-b border-edge text-left text-content-faint">
								<th className="py-2 pr-4 font-medium">Origem</th>
								<th className="py-2 pr-4 font-medium">Sessões</th>
								<th className="py-2 pr-4 font-medium">Permanência (mediana)</th>
								<th className="py-2 pr-4 font-medium">Sai sem rolar</th>
								<th className="py-2 font-medium">Interage com formulário</th>
							</tr>
						</thead>
						<tbody>
							{behavioral.sources.map((s) => {
								// EXAME A2 — shared identity: proper label + brand
								// dot instead of the raw lowercase utm token.
								const id = sourceIdentity(s.source);
								return (
								<tr key={s.source} className="border-b border-edge/50 text-content">
									<td className="py-2.5 pr-4 font-medium">
										<span className="inline-flex items-center gap-2">
											<span
												aria-hidden
												className="inline-block h-2 w-2 shrink-0 rounded-full"
												style={{ backgroundColor: id.color }}
											/>
											{id.label}
										</span>
									</td>
									<td className="py-2.5 pr-4 tabular-nums">
										{s.sessions.toLocaleString("pt-BR")}
										<span className="text-content-faint"> · {s.sharePct}%</span>
									</td>
									<td className="py-2.5 pr-4 tabular-nums">{fmtDuration(s.medianDurationS)}</td>
									<td className="py-2.5 pr-4 tabular-nums">{s.pctNoScroll}%</td>
									<td className="py-2.5 tabular-nums">{s.pctFormStarted}%</td>
								</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				<p className="mt-4 text-[11px] leading-relaxed text-content-faint">
					Janela: {behavioral.windowStart} a {behavioral.windowEnd} ·{" "}
					{behavioral.sessionsFiltered.toLocaleString("pt-BR")} sessões após excluir{" "}
					{behavioral.sessionsExcluded.toLocaleString("pt-BR")} sem comportamento (filtro de
					bot mínimo). {behavioral.scrollNote} Diferente do restante do plano, estes números
					não são estimativa: são contagem direta das sessões do seu site.
				</p>
			</div>
		</motion.section>
	);
}
