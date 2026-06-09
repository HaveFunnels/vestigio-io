"use client";

import { motion } from "framer-motion";
import { Shield, AlertTriangle, KeyRound, CreditCard, Globe2 } from "lucide-react";
import type { ImpersonatorsSection, ImpersonatorThreatType } from "../types";

/*
 * Wave 22.8.3 — Brand Impersonators section
 *
 * Three vertical bands rendered when the brand scan has ever run for
 * the env (self-hide when totalScannedEver === 0):
 *  1. Top stats: high/medium/low confidence + active/commerce/payment/
 *     credential counts. Read as the "security posture this cycle".
 *  2. Peer-set Findings from the brand_integrity pack with severity
 *     chips + first 280 chars of the engine's reasoning.
 *  3. Top-N matches: domain + threat-type chip + confidence + capability
 *     icons (commerce, credential, payment, sensitive path). The
 *     capability icons are the hot signal — they convert
 *     "X domains exist" into "X domains are actually capturing things
 *     from your customers".
 */

interface Props {
	impersonators: ImpersonatorsSection | null | undefined;
}

const SEVERITY_TONE: Record<string, { fg: string; bg: string; ring: string; label: string }> = {
	high: { fg: "text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-500/20", label: "Alto" },
	medium: { fg: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/20", label: "Médio" },
	low: { fg: "text-sky-300", bg: "bg-sky-500/10", ring: "ring-sky-500/20", label: "Baixo" },
};

const THREAT_LABEL_PT: Record<ImpersonatorThreatType, string> = {
	typosquat: "Typosquat",
	commercial_keyword: "Palavra-chave comercial",
	tld_variation: "Variação de TLD",
	brand_interception: "Interceptação de marca",
	phishing_pattern: "Padrão de phishing",
};

function SeverityChip({ severity }: { severity: "low" | "medium" | "high" }) {
	const tone = SEVERITY_TONE[severity];
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${tone.bg} ${tone.fg} ${tone.ring}`}
		>
			{tone.label}
		</span>
	);
}

function StatTile({
	label,
	value,
	tone,
	subline,
}: {
	label: string;
	value: number;
	tone?: "rose" | "amber" | "sky" | "neutral";
	subline?: string;
}) {
	const fg =
		tone === "rose"
			? "text-rose-300"
			: tone === "amber"
				? "text-amber-300"
				: tone === "sky"
					? "text-sky-300"
					: "text-content";
	return (
		<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
			<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
				{label}
			</div>
			<div className={`mt-1 font-mono text-[20px] font-semibold tabular-nums ${fg}`}>
				{value}
			</div>
			{subline && (
				<div className="mt-0.5 text-[10.5px] text-content-muted">{subline}</div>
			)}
		</div>
	);
}

export default function Impersonators({ impersonators }: Props) {
	if (!impersonators) return null;

	const hasMatches = impersonators.totalMatchesThisCycle > 0;
	const hasFindings = impersonators.findings.length > 0;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.14 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Impersonação de marca
				</h2>
				<div className="text-[11px] text-content-faint">
					{impersonators.totalScannedEver} domínios analisados desde o primeiro ciclo
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				{/* Top stats grid. */}
				<div className="mb-5 grid grid-cols-2 gap-3 border-b border-edge/40 pb-5 sm:grid-cols-4">
					<StatTile
						label="Detectados este ciclo"
						value={impersonators.totalMatchesThisCycle}
						subline={`${impersonators.activeCount} ativos`}
						tone="neutral"
					/>
					<StatTile
						label="Alta confiança"
						value={impersonators.highConfidenceCount}
						subline={`${impersonators.mediumConfidenceCount} médios · ${impersonators.lowConfidenceCount} baixos`}
						tone={impersonators.highConfidenceCount > 0 ? "rose" : "neutral"}
					/>
					<StatTile
						label="Com sinal de comércio"
						value={impersonators.withCommerceCount}
						tone={impersonators.withCommerceCount > 0 ? "amber" : "neutral"}
					/>
					<StatTile
						label="Captura sensível"
						value={impersonators.withPaymentCount + impersonators.withCredentialCount}
						subline={`${impersonators.withPaymentCount} pagamento · ${impersonators.withCredentialCount} credencial`}
						tone={impersonators.withPaymentCount + impersonators.withCredentialCount > 0 ? "rose" : "neutral"}
					/>
				</div>

				{/* Peer-set Findings (brand_integrity pack). */}
				{hasFindings && (
					<div className="mb-5 space-y-3 border-b border-edge/40 pb-5">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Sinais da carteira deste mês
						</div>
						{impersonators.findings.map((f) => (
							<div
								key={f.inferenceKey}
								className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3"
							>
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-[13px] font-semibold text-content">
										{f.label}
									</span>
									<SeverityChip severity={f.severity} />
								</div>
								<p className="mt-2 text-[12.5px] leading-snug text-content-secondary">
									{f.summary}
								</p>
							</div>
						))}
					</div>
				)}

				{/* Top matches. */}
				{hasMatches ? (
					<>
						<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Top {impersonators.topEntries.length} domínios este ciclo
						</div>
						<ul className="space-y-2">
							{impersonators.topEntries.map((m) => {
								const tone = SEVERITY_TONE[m.confidence];
								return (
									<li
										key={m.domain}
										className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/20 p-3 sm:flex-row sm:items-center sm:gap-3"
									>
										<div className="flex flex-1 items-baseline gap-2">
											{m.isActive ? (
												<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden />
											) : (
												<Shield className="h-3.5 w-3.5 shrink-0 text-content-faint" aria-hidden />
											)}
											<div className="min-w-0">
												<div className="truncate font-mono text-[13px] text-content">
													{m.domain}
												</div>
												<div className="truncate text-[10.5px] text-content-muted">
													{THREAT_LABEL_PT[m.threatType]} · {m.isActive ? "ativo" : "inativo"}
												</div>
											</div>
										</div>

										{/* Capability icons — only render when set. These
										    convert "domain exists" to "domain is actually
										    doing something dangerous". */}
										<div className="flex flex-wrap items-center gap-1.5">
											{m.hasCommerceSignals && (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 ring-1 ring-inset ring-amber-500/20"
													title="Tem sinal de comércio (carrinho, checkout, pricing)"
												>
													<Globe2 className="h-3 w-3" /> comércio
												</span>
											)}
											{m.hasPaymentCapture && (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200 ring-1 ring-inset ring-rose-500/20"
													title="Captura dados de pagamento"
												>
													<CreditCard className="h-3 w-3" /> pagamento
												</span>
											)}
											{m.hasCredentialCapture && (
												<span
													className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200 ring-1 ring-inset ring-rose-500/20"
													title="Captura credenciais (login, senha)"
												>
													<KeyRound className="h-3 w-3" /> credencial
												</span>
											)}
											<span
												className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums ring-1 ring-inset ${tone.bg} ${tone.ring}`}
												title={`Score de confiança ${m.confidenceScore}/100`}
											>
												<span className={`font-semibold ${tone.fg}`}>{m.confidenceScore}</span>
											</span>
										</div>
									</li>
								);
							})}
						</ul>
					</>
				) : (
					<div className="rounded-xl border border-dashed border-edge bg-surface-inset/30 p-4 text-center text-[12.5px] text-content-muted">
						Nenhuma correspondência ativa este ciclo. Vestigio continua
						escaneando domínios candidatos a cada audit.
					</div>
				)}
			</div>
		</motion.section>
	);
}
