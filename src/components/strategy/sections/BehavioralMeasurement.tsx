"use client";

import { motion } from "framer-motion";

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
}

interface Props {
	behavioral: BehavioralSectionUI | null | undefined;
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
				<div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-content-faint">
					Medido pelo pixel
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
							{behavioral.sources.map((s) => (
								<tr key={s.source} className="border-b border-edge/50 text-content">
									<td className="py-2.5 pr-4 font-medium">{s.source}</td>
									<td className="py-2.5 pr-4 tabular-nums">
										{s.sessions.toLocaleString("pt-BR")}
										<span className="text-content-faint"> · {s.sharePct}%</span>
									</td>
									<td className="py-2.5 pr-4 tabular-nums">{fmtDuration(s.medianDurationS)}</td>
									<td className="py-2.5 pr-4 tabular-nums">{s.pctNoScroll}%</td>
									<td className="py-2.5 tabular-nums">{s.pctFormStarted}%</td>
								</tr>
							))}
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
