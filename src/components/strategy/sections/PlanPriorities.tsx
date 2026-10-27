"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Sep from "../Sep";

// ──────────────────────────────────────────────
// The adaptive plan: four parts, at the top of the document.
//
// Answers four of the founder's ordering complaints at once, which is
// why it is a header and not a replacement:
//
//   "'O que sua audit revelou' deveria estar em cima do funil"
//   "'onde focar esse mês' é das informações mais importantes e está
//    lá embaixo"
//   "'O que ficou de Setembro' aparece sem prioridade nem
//    criticalidade, e não dá pra fazer nada com essa informação"
//   "faltam pills que levam para páginas hoje esquecidas"
//
// It renders ABOVE the existing sections rather than instead of them.
// buildAdaptivePlan reads only Finding rows, so swapping the document
// wholesale would have dropped copyLens (the one section present in
// 14 of 14 plans), the narrative, the hero metrics and what-changed.
// Above-and-additive fixes the order without losing anything, and
// lets the two be compared side by side.
// ──────────────────────────────────────────────

type Claim = "defect" | "anomaly" | "behavioral" | "inference";

interface Priority {
	rank: number;
	claim: Claim;
	headline: string;
	surface: string;
	sourceUrl: string | null;
	why: string | null;
	confidence: number;
	confidenceTier: string;
	severity: string;
	estimatedMonthlyLossBrl: { min: number; mid: number; max: number } | null;
	measured: Record<string, unknown>[] | null;
	lifecycle: "new" | "persistent" | "returned";
	cyclesSeen: number;
}

export interface AdaptivePlanUI {
	executive: {
		priorityCount: number;
		measuredCount: number;
		inferredCount: number;
		estimatedExposureBrl: number | null;
		summary: string;
	};
	priorities: Priority[];
	actions: { rank: number; what: string; howToVerify: string }[];
	evolution: {
		newCount: number;
		persistentCount: number;
		resolvedCount: number;
		inconclusiveCount: number;
		resolved: { headline: string; surface: string }[];
	};
}

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/** Claim class as a word, never as colour alone. */
const CLAIM: Record<Claim, { label: string; cls: string; help: string }> = {
	defect: {
		label: "DEFEITO",
		cls: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
		help: "Comportamento incorreto reproduzível.",
	},
	anomaly: {
		label: "ANOMALIA",
		cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
		help: "Situação incomum que pede verificação.",
	},
	behavioral: {
		label: "MEDIDO",
		cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
		help: "Contagem real das sessões da sua loja. Mostra onde, não por quê.",
	},
	inference: {
		label: "INDÍCIO",
		cls: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
		help: "Hipótese sustentada por evidência, com perda estimada.",
	},
};

const LIFECYCLE: Record<Priority["lifecycle"], string> = {
	new: "novo neste plano",
	persistent: "persiste",
	returned: "voltou",
};

export default function PlanPriorities({
	adaptive,
	month,
}: {
	adaptive: AdaptivePlanUI | null | undefined;
	month: string;
}) {
	if (!adaptive) return null;
	const { executive, priorities, actions, evolution } = adaptive;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="mb-14"
			data-toc-id="prioridades"
		>
			{/* ── A. Resumo ── */}
			<div className="mb-6">
				<h2 className="mb-2 font-serif text-[22px] font-medium tracking-tight text-content">
					O que merece sua atenção
				</h2>
				<p className="max-w-[62ch] text-[14.5px] leading-[1.6] text-content-secondary">
					{executive.summary}
				</p>
				{executive.estimatedExposureBrl !== null && (
					<p className="mt-2 text-[12.5px] text-content-muted">
						Perda estimada somada nos indícios: {brl(executive.estimatedExposureBrl)} por mês.
						As observações medidas não recebem valor, porque são contagem e não estimativa.
					</p>
				)}
			</div>

			{/* Pills to the pages the plan never pointed at. */}
			<div className="mb-8 flex flex-wrap items-center gap-2">
				<PillLink href="/app/findings" label="Todos os achados" />
				<PillLink href={`/app/library/strategy/${month}/copy-lens`} label="Lente de copy" />
				<PillLink href={`/app/maps/user_journey?from=plan&month=${month}`} label="Jornada do visitante" />
				<PillLink href="/app/inventory" label="Páginas da loja" />
			</div>

			{/* ── B + C. Prioridades, cada uma com sua ação ── */}
			{priorities.length === 0 ? (
				<div className="rounded-2xl border border-edge bg-surface-card px-5 py-6 text-[14px] leading-relaxed text-content-secondary">
					Nada de severidade alta apareceu neste período. Isso é um resultado, não uma
					lacuna: a varredura rodou e não encontrou nada que justifique mexer no site
					agora.
				</div>
			) : (
				<ol className="space-y-4">
					{priorities.map((p) => {
						const action = actions.find((a) => a.rank === p.rank);
						const c = CLAIM[p.claim] ?? CLAIM.inference;
						const ev = p.measured?.[0] as Record<string, unknown> | undefined;
						return (
							<li
								key={`${p.rank}-${p.surface}`}
								className="overflow-hidden rounded-2xl border border-edge bg-surface-card"
							>
								<div className="border-b border-edge px-5 py-4">
									<div className="mb-2 flex flex-wrap items-center gap-2">
										<span className="font-mono text-[11px] tabular-nums text-content-faint">
											{String(p.rank).padStart(2, "0")}
										</span>
										<span
											title={c.help}
											className={`inline-flex cursor-default select-none items-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.1em] ${c.cls}`}
										>
											{c.label}
										</span>
										<Sep />
										<span className="text-[11px] text-content-muted">
											confiança {p.confidence}
										</span>
										<Sep />
										<span className="text-[11px] text-content-muted">
											{LIFECYCLE[p.lifecycle]}
											{p.cyclesSeen > 1 ? ` por ${p.cyclesSeen} ciclos` : ""}
										</span>
									</div>
									<h3 className="mb-1 font-serif text-[18px] font-medium leading-snug tracking-tight text-content">
										{p.headline}
									</h3>
									<div className="font-mono text-[11.5px] text-content-faint">{p.surface}</div>
								</div>

								<div className="space-y-3 px-5 py-4">
									{/* Measured findings lead with the count. It is the
									    strongest thing the product has to say. */}
									{ev && (
										<p className="text-[13.5px] leading-[1.55] text-content-secondary">
											<span className="font-mono tabular-nums text-content">
												{String(ev.count)}
											</span>{" "}
											ocorrências em{" "}
											<span className="font-mono tabular-nums text-content">
												{Number(ev.sessions).toLocaleString("pt-BR")}
											</span>{" "}
											sessões medidas.
										</p>
									)}
									{p.estimatedMonthlyLossBrl && (
										<p className="text-[13.5px] leading-[1.55] text-content-secondary">
											Perda estimada de{" "}
											<span className="font-mono tabular-nums text-content">
												{brl(p.estimatedMonthlyLossBrl.mid)}
											</span>{" "}
											por mês, numa faixa de {brl(p.estimatedMonthlyLossBrl.min)} a{" "}
											{brl(p.estimatedMonthlyLossBrl.max)}. É estimativa, não medição.
										</p>
									)}
									{p.why && (
										<p className="text-[13.5px] leading-[1.55] text-content-secondary">
											{p.why}
										</p>
									)}

									{action && (
										<div className="rounded-xl border border-edge border-l-2 border-l-emerald-600/40 bg-surface-inset/40 px-4 py-3 dark:border-l-emerald-400/40">
											<div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
												O que fazer
											</div>
											<p className="mb-2 text-[13.5px] leading-[1.55] text-content-secondary">
												{action.what}
											</p>
											<div className="text-[11.5px] text-content-muted">
												{action.howToVerify}
											</div>
										</div>
									)}

									{p.sourceUrl && (
										<a
											href={p.sourceUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-[12px] text-content-muted underline decoration-edge underline-offset-2 transition-colors hover:text-content-secondary"
										>
											Abrir a página
										</a>
									)}
								</div>
							</li>
						);
					})}
				</ol>
			)}

			{/* ── D. Evolução ── */}
			<div className="mt-8 rounded-2xl border border-edge bg-surface-inset/30 px-5 py-4">
				<div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
					O que mudou desde o plano anterior
				</div>
				<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-content-secondary">
					<Stat n={evolution.newCount} label="novos" />
					<Stat n={evolution.persistentCount} label="persistem" />
					<Stat n={evolution.resolvedCount} label="resolvidos" />
					{evolution.inconclusiveCount > 0 && (
						<Stat n={evolution.inconclusiveCount} label="inconclusivos" />
					)}
				</div>
				{evolution.resolved.length > 0 && (
					<ul className="mt-3 space-y-1">
						{evolution.resolved.map((r) => (
							<li key={`${r.headline}-${r.surface}`} className="text-[12.5px] text-content-muted">
								{r.headline}{" "}
								<span className="font-mono text-[11px] text-content-faint">{r.surface}</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</motion.section>
	);
}

function Stat({ n, label }: { n: number; label: string }) {
	return (
		<span className="inline-flex items-baseline gap-1.5">
			<span className="font-mono text-[16px] font-semibold tabular-nums text-content">{n}</span>
			<span className="text-[12px] text-content-muted">{label}</span>
		</span>
	);
}

/** The forgotten pages, reachable from the one page people read. */
function PillLink({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			className="inline-flex items-center rounded-full border border-edge bg-surface-card px-3 py-1 text-[12px] text-content-secondary transition-colors hover:border-edge-strong hover:text-content"
		>
			{label}
		</Link>
	);
}
