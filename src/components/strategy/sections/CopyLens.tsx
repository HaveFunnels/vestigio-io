"use client";

import { motion } from "framer-motion";
import type { CopyLensSection } from "../types";

/*
 * Wave 22.8 — Copy Lens Framework section
 *
 * Surfaces this cycle's CopyFrameworkAudit work for the customer:
 *  - One row per framework (AIDA, PAS, 4Ps, BAB, ...) with average score
 *  - Per-row chips showing the audited pages + per-page score
 *  - Worst-rated criterion preview for the lowest-scored page
 *  - Deep link to /app/workspaces for the full audit
 *
 * Self-hides on null OR on empty frameworks (no audits this cycle).
 *
 * Strategic role: this is one of the four cross-feature sections that
 * pulls work Vestigio did into the Plan so the customer sees the full
 * intelligence picture, not just the findings/actions loop.
 */

interface Props {
	copyLens: CopyLensSection | null | undefined;
}

const PAGE_SLOT_LABEL: Record<string, string> = {
	home: "Home",
	pricing: "Pricing",
	features: "Features",
	about: "Sobre",
	other: "Outras",
};

function scoreTone(pct: number): { fg: string; bg: string; ring: string } {
	if (pct >= 80) return {
		fg: "text-emerald-300",
		bg: "bg-emerald-500/10",
		ring: "ring-emerald-500/20",
	};
	if (pct >= 60) return {
		fg: "text-amber-300",
		bg: "bg-amber-500/10",
		ring: "ring-amber-500/20",
	};
	return {
		fg: "text-rose-300",
		bg: "bg-rose-500/10",
		ring: "ring-rose-500/20",
	};
}

export default function CopyLens({ copyLens }: Props) {
	if (!copyLens || copyLens.frameworks.length === 0) return null;

	const worstFramework = copyLens.weakestFramework;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Lente de Framework de Copy
				</h2>
				<div className="text-[11px] text-content-faint">
					{copyLens.frameworks.length}{" "}
					{copyLens.frameworks.length === 1 ? "framework aplicado" : "frameworks aplicados"}
					{" · "}
					{copyLens.totalAudits} {copyLens.totalAudits === 1 ? "página" : "páginas"}
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				{/* Header summary — weakest vs strongest framework. Lets
				    the reader spot the headline gap before scanning the
				    rows below. */}
				{worstFramework && (
					<div className="mb-5 grid grid-cols-1 gap-3 border-b border-edge/40 pb-5 sm:grid-cols-2">
						<div>
							<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
								Maior gap
							</div>
							<div className="mt-1 flex items-baseline gap-2">
								<span className="font-serif text-[18px] font-semibold text-content">
									{worstFramework.label}
								</span>
								<span className={`font-mono text-[15px] tabular-nums ${scoreTone(worstFramework.avgScorePct).fg}`}>
									{worstFramework.avgScorePct}/100
								</span>
							</div>
						</div>
						{copyLens.strongestFramework && copyLens.strongestFramework.id !== worstFramework.id && (
							<div>
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Mais forte
								</div>
								<div className="mt-1 flex items-baseline gap-2">
									<span className="font-serif text-[18px] font-semibold text-content">
										{copyLens.strongestFramework.label}
									</span>
									<span className={`font-mono text-[15px] tabular-nums ${scoreTone(copyLens.strongestFramework.avgScorePct).fg}`}>
										{copyLens.strongestFramework.avgScorePct}/100
									</span>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Per-framework rows — sorted worst-first by avgScorePct. */}
				<ul className="space-y-4">
					{copyLens.frameworks.map((f) => {
						const tone = scoreTone(f.avgScorePct);
						const worstPage = f.audits[0]; // already sorted worst-first
						return (
							<li
								key={f.frameworkId}
								className="rounded-xl border border-edge/40 bg-surface-inset/30 p-4"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<div className="flex items-baseline gap-3">
										<span className="font-serif text-[16px] font-semibold text-content">
											{f.frameworkLabel}
										</span>
										<span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ring-1 ring-inset ${tone.bg} ${tone.fg} ${tone.ring}`}>
											{f.avgScorePct}/100
										</span>
									</div>
									<div className="text-[10.5px] text-content-faint">
										média de {f.audits.length} {f.audits.length === 1 ? "página" : "páginas"}
									</div>
								</div>

								{/* Per-page scores — compact chip row. */}
								<div className="mt-3 flex flex-wrap gap-1.5">
									{f.audits.map((a) => {
										const pTone = scoreTone(a.scorePct);
										const slotLabel = PAGE_SLOT_LABEL[a.pageSlot] ?? a.pageSlot;
										return (
											<span
												key={`${a.pageSlot}-${a.pageUrl}`}
												className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset ${pTone.bg} ${pTone.ring}`}
												title={a.pageUrl}
											>
												<span className="font-medium text-content-secondary">{slotLabel}</span>
												<span className={`font-mono tabular-nums ${pTone.fg}`}>{a.scorePct}</span>
											</span>
										);
									})}
								</div>

								{/* Worst page's top gap, surfaced as evidence. */}
								{worstPage?.topGap && (
									<div className="mt-3 border-t border-edge/40 pt-3">
										<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
											Maior gap em{" "}
											<span className="font-mono normal-case text-content-muted">
												{worstPage.pageUrl.replace(/^https?:\/\/[^/]+/, "") || "/"}
											</span>
										</div>
										<div className="mt-1 text-[13px] text-content-secondary">
											<span className="font-semibold text-content">
												{worstPage.topGap.criterionLabel}
											</span>
											{worstPage.topGap.evidence && (
												<>
													:{" "}
													<span className="text-content-muted">{worstPage.topGap.evidence}</span>
												</>
											)}
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ul>

				{/* Footer link removido: a página standalone já apresenta o
				    audit completo. O link para Workspaces redirecionava
				    para /app/findings?lens=revenue, sem relação com
				    framework de copy. Quando workspaces voltar como hub
				    de configuração real (IA reform), reintroduzimos. */}
			</div>
		</motion.section>
	);
}
