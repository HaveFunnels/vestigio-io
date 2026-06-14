"use client";

import { motion } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";

// ──────────────────────────────────────────────
// #7 — Action Attribution Timeline
//
// Customer feedback: "Recuperado / mês" mostrava o número agregado mas
// não atribuía o trabalho. O cliente sente que pagou R$ X mas não vê
// que o TIME DELE ganhou esse dinheiro. Este componente converte o
// número em placar do time:
//
//   "Este mês seu time recuperou R$ 18k:
//    - Marcus fechou 'Checkout off-domain' em 24/Nov · R$ 12k
//    - Marketing fechou 'CTA unclear' em 28/Nov · R$ 6k"
//
// Self-hide quando attributionTimeline está vazio (mês sem
// recuperação confirmada). Empty state explícito quando R$ 0 + plano
// existente: nudge pra fechar ações no próximo ciclo.
//
// Data: UserAction com status=done + verifiedResolvedAt confirmado
// pelo ciclo seguinte. baselineImpactMidpoint é o snapshot do impact
// no momento da criação da Action (não o midpoint atual da finding,
// que já é zero após resolved).
// ──────────────────────────────────────────────

interface Props {
	timeline?: Array<{
		id: string;
		title: string;
		ownerLabel: string;
		verifiedResolvedAt: string | null;
		doneAt: string | null;
		baselineImpactMidpoint: number;
	}>;
	total?: number;
	monthLabel: string;
}

function fmtDateShort(iso: string | null): string {
	if (!iso) return "";
	try {
		const d = new Date(iso);
		// Formato curto: 24/Nov fixo pt-BR. Usa TZ local do visitante —
		// customer prefere ver o dia "real" do relógio dele em vez de UTC
		// (alinhado com formatTimestamp em StrategyPlanPanel). Quando uma
		// timestamp cai perto da meia-noite UTC, o dia exibido pode
		// variar ±1 entre server-side render (Node UTC) e client. O span
		// renderizador usa suppressHydrationWarning pra silenciar.
		const day = String(d.getDate()).padStart(2, "0");
		const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
		return `${day}/${months[d.getMonth()]}`;
	} catch {
		return "";
	}
}

export default function AttributionTimeline({ timeline, total, monthLabel }: Props) {
	const { currency } = useMcpData();
	const rows = timeline ?? [];
	const totalValue = total ?? rows.reduce((a, r) => a + (r.baselineImpactMidpoint ?? 0), 0);

	// Self-hide quando o plano não regenerou ainda com o novo cálculo
	// — `timeline === undefined` significa shape antigo. Render só
	// quando há rows OU explicit empty (timeline=[] mas total=0).
	if (!timeline) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que seu time recuperou em {monthLabel}
				</h2>
				<div className="text-[11px] text-content-faint">
					Recuperações já confirmadas
				</div>
			</div>

			{rows.length === 0 ? (
				// Empty state — encoraja o cliente a fechar ações no
				// próximo ciclo sem soar como punição.
				// Copy refactor: substitui jargão técnico ("atribuída",
				// "marcada como done", "ciclo seguinte", "movimento
				// principal") por linguagem plana. O usuário médio
				// entende "fechar ação" + "próxima análise confirma".
				<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
					<div className="mb-2 text-[14px] font-medium text-content-secondary">
						Seu time ainda não recuperou nada este mês.
					</div>
					<p className="text-[13px] leading-relaxed text-content-muted">
						Quando seu time fecha uma ação e a próxima análise confirma que o problema sumiu, ela aparece aqui com quem fechou, quando e quanto seu site recuperou. Comece pela primeira ação dos próximos passos.
					</p>
				</div>
			) : (
				<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
					{/* Headline summary — "seu time recuperou R$ X em N ações" */}
					<div className="mb-5 border-b border-edge/60 pb-4">
						<div className="text-[11px] text-content-faint">Total recuperado este mês</div>
						<div className="mt-1 flex items-baseline gap-2">
							<span className="font-mono text-[28px] font-semibold tabular-nums text-emerald-400">
								{fmtCurrencyUnits(totalValue, currency)}
							</span>
							<span className="text-[12px] text-content-muted">
								em {rows.length} {rows.length === 1 ? "ação fechada" : "ações fechadas"}
							</span>
						</div>
					</div>

					{/* Per-row attribution list */}
					<div className="space-y-3">
						{rows.map((r) => {
							const date = fmtDateShort(r.verifiedResolvedAt ?? r.doneAt);
							return (
								<div
									key={r.id}
									className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/30 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
								>
									<div className="min-w-0 flex-1">
										<div className="text-[13.5px] font-medium leading-snug text-content">
											{r.title}
										</div>
										<div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px] text-content-muted">
											<span>
												<span className="text-content-faint">Fechado por:</span>{" "}
												<span className="font-medium text-content-secondary">
													{r.ownerLabel}
												</span>
											</span>
											{date && (
												<>
													<span className="text-content-faint">·</span>
													<span>
														<span className="text-content-faint">Confirmado em:</span>{" "}
														<span className="font-medium text-content-secondary" suppressHydrationWarning>{date}</span>
													</span>
												</>
											)}
										</div>
									</div>
									<div className="shrink-0 text-right">
										<div className="font-mono text-[15px] font-semibold tabular-nums text-emerald-400">
											{fmtCurrencyUnits(r.baselineImpactMidpoint, currency)}
										</div>
										<div className="text-[10px] text-content-faint">recuperado</div>
									</div>
								</div>
							);
						})}
					</div>

				</div>
			)}
		</motion.section>
	);
}
