"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import Competitor from "./Competitor";
import Impersonators from "./Impersonators";
import type { CompetitorSection, ImpersonatorsSection } from "../types";

/*
 * Wave 22.8 review move 1 — Carteira cluster
 *
 * Replaces two standalone sections (Competitor Radar + Brand
 * Impersonators) with a single expandable card. The customer sees one
 * compact summary line and decides whether to dive in. This addresses
 * the churn-prevention finding that "todo mês a mesma coisa" (no
 * signal) was making each section read as noise.
 *
 * Self-hide rule: when BOTH competitor and impersonators are null/empty,
 * the cluster returns null. Otherwise renders even if only one half has
 * data (the other half just doesn't render inside the collapsible).
 *
 * Collapsed by default. Opens in place; no drawer, no navigation —
 * stays inline so the customer's reading flow is preserved.
 */

interface Props {
	competitor: CompetitorSection | null | undefined;
	impersonators: ImpersonatorsSection | null | undefined;
}

function competitorSignalCount(c: CompetitorSection | null | undefined): number {
	if (!c) return 0;
	return (
		c.withSignalsCount +
		(c.trustPostureLag ? 1 : 0) +
		(c.serpOverlap ? 1 : 0)
	);
}

function impersonatorsSignalCount(
	i: ImpersonatorsSection | null | undefined,
): number {
	if (!i) return 0;
	// "Has signal" means active matches OR findings exist this cycle.
	return i.activeCount + i.findings.length;
}

export default function Carteira({ competitor, impersonators }: Props) {
	const hasCompetitor = !!competitor;
	const hasImpersonators = !!impersonators;
	if (!hasCompetitor && !hasImpersonators) return null;

	const compSignals = competitorSignalCount(competitor);
	const impSignals = impersonatorsSignalCount(impersonators);
	const totalSignals = compSignals + impSignals;

	// Counts shown directly in the header (not "0 sinais este ciclo"
	// which lia como ausência genérica). The customer wants concrete
	// numbers: quantos concorrentes estão sob monitoramento + quantos
	// impersonadores foram detectados ativos. Ambos podem ser 0 — esse
	// é o estado saudável.
	const competitorCount = hasCompetitor ? competitor!.totalMonitored : 0;
	const impersonatorCount = hasImpersonators ? impersonators!.activeCount : 0;

	// Default open when there is material activity. Otherwise collapse
	// so the customer doesn't have to scroll past a quiet card every
	// month.
	const [open, setOpen] = useState(totalSignals > 0);

	const competitorLine = hasCompetitor
		? `${competitor!.totalActive} ativos · ${compSignals} ${compSignals === 1 ? "sinal" : "sinais"} este ciclo`
		: null;
	const impersonatorsLine = hasImpersonators
		? `${impersonators!.totalScannedEver} domínios analisados`
		: null;

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
					Sinais da marca
				</h2>
				<div className="text-[11px] text-content-faint">
					Concorrência e impersonadores
				</div>
			</div>

			<div data-vsgp-card className="overflow-hidden rounded-2xl border border-edge bg-surface-card">
				<Collapsible.Root open={open} onOpenChange={setOpen}>
					<Collapsible.Trigger asChild>
						<button
							type="button"
							className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-5 text-left transition-colors hover:bg-surface-card-hover"
						>
							<div className="min-w-0 space-y-2">
								{/* Numbers customer wants to see at a glance:
								    concorrentes sob monitoramento + impersonadores
								    detectados. Antes era "X sinais" agregado que lia
								    como métrica inventada. */}
								<div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
									{hasCompetitor && (
										<div>
											<span className="font-mono text-[20px] font-semibold tabular-nums text-content">
												{competitorCount}
											</span>
											<span className="ml-1.5 text-[12px] font-normal text-content-faint">
												{competitorCount === 1 ? "concorrente monitorado" : "concorrentes monitorados"}
											</span>
										</div>
									)}
									{hasImpersonators && (
										<div>
											<span className="font-mono text-[20px] font-semibold tabular-nums text-content">
												{impersonatorCount}
											</span>
											<span className="ml-1.5 text-[12px] font-normal text-content-faint">
												{impersonatorCount === 1 ? "impersonador ativo" : "impersonadores ativos"}
											</span>
										</div>
									)}
								</div>
								<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-content-muted">
									{competitorLine && (
										<span>
											<span className="font-semibold text-content-secondary">Concorrência</span>
											{" · "}
											{competitorLine}
										</span>
									)}
									{competitorLine && impersonatorsLine && (
										<span className="text-content-faint">·</span>
									)}
									{impersonatorsLine && (
										<span>
											<span className="font-semibold text-content-secondary">Impersonação</span>
											{" · "}
											{impersonatorsLine}
										</span>
									)}
								</div>
							</div>
							<ChevronDown
								className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${open ? "rotate-180" : ""}`}
							/>
						</button>
					</Collapsible.Trigger>

					<AnimatePresence>
						{open && (
							<Collapsible.Content asChild forceMount>
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
									className="overflow-hidden border-t border-edge"
								>
									{/* Nested sub-sections. Each is self-hide-aware
									    via the same null-check it already had, so
									    if only one is populated the other won't
									    add empty whitespace. */}
									<div className="-mt-12 px-5 pt-5">
										<Competitor competitor={competitor ?? null} />
									</div>
									<div className="-mt-12 px-5 pb-5">
										<Impersonators impersonators={impersonators ?? null} />
									</div>
								</motion.div>
							</Collapsible.Content>
						)}
					</AnimatePresence>
				</Collapsible.Root>
			</div>
		</motion.section>
	);
}
