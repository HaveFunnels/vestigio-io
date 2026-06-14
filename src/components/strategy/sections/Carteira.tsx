"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Competitor from "./Competitor";
import Impersonators from "./Impersonators";
import type { CompetitorSection, ImpersonatorsSection } from "../types";

/*
 * Carteira — duas preocupações distintas num strip único
 *
 * Versão anterior (Wave 22.8) clusterizava Competitor + Impersonators
 * num Collapsible compartilhado pra reduzir noise dos meses quietos.
 * Customer feedback: as duas preocupações são totalmente diferentes
 * (concorrentes = posicionamento estratégico; clonadores = segurança/
 * legal) e o agrupamento diluía a urgência de cada uma + confundia
 * leitura ("sem cópia detectada" lia também como "sem clones").
 *
 * Nova forma: tab strip dividido em 2.
 *   - Fechado: ambos os summaries lado a lado (strip compacto).
 *   - Click numa aba: expande SÓ aquele lado.
 *   - Click novamente: colapsa.
 *   - Click no outro lado: switch entre eles (exclusivo).
 *
 * Clonadores VEM PRIMEIRO porque é a preocupação mais urgente —
 * golpistas com captura de pagamento/credencial são problema legal/
 * financeiro imediato, não estratégico de longo prazo.
 *
 * Default-open: abre automaticamente na aba que tem sinal urgente.
 *   - Se há impersonadores ativos → abre Clonadores
 *   - Senão, se há sinais de concorrente → abre Concorrentes
 *   - Senão, fechado.
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

type TabId = "clonadores" | "concorrentes";

export default function Carteira({ competitor, impersonators }: Props) {
	const hasCompetitor = !!competitor;
	const hasImpersonators = !!impersonators;
	if (!hasCompetitor && !hasImpersonators) return null;

	const impActive = hasImpersonators ? impersonators!.activeCount : 0;
	const impHighConf = hasImpersonators ? impersonators!.highConfidenceCount : 0;
	const impScanned = hasImpersonators ? impersonators!.totalScannedEver : 0;
	const compSignals = competitorSignalCount(competitor);
	const compMonitored = hasCompetitor ? competitor!.totalMonitored : 0;

	// Default tab: prioriza urgência. Clones ativos > sinais de
	// concorrente > fechado.
	const initialTab: TabId | null =
		impActive > 0
			? "clonadores"
			: compSignals > 0
				? "concorrentes"
				: null;

	const [activeTab, setActiveTab] = useState<TabId | null>(initialTab);

	const toggle = (tab: TabId) => {
		setActiveTab((current) => (current === tab ? null : tab));
	};

	const bothPresent = hasImpersonators && hasCompetitor;

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
					Clonadores e concorrentes
				</div>
			</div>

			<div
				data-vsgp-card
				className="overflow-hidden rounded-2xl border border-edge bg-surface-card"
			>
				{/* Strip de 2 abas. Clonadores à esquerda (urgência > concorrência). */}
				<div className={`grid ${bothPresent ? "grid-cols-2 divide-x divide-edge" : "grid-cols-1"}`}>
					{hasImpersonators && (
						<TabButton
							active={activeTab === "clonadores"}
							urgent={impHighConf > 0}
							label="Clonadores"
							primaryValue={impActive}
							primaryLabel={impActive === 1 ? "ativo este ciclo" : "ativos este ciclo"}
							secondary={`${impScanned} ${impScanned === 1 ? "domínio analisado" : "domínios analisados"}`}
							onClick={() => toggle("clonadores")}
						/>
					)}
					{hasCompetitor && (
						<TabButton
							active={activeTab === "concorrentes"}
							urgent={false}
							label="Concorrentes"
							primaryValue={compMonitored}
							primaryLabel={compMonitored === 1 ? "monitorado" : "monitorados"}
							secondary={
								compSignals === 0
									? "sem sinais este ciclo"
									: `${compSignals} ${compSignals === 1 ? "sinal" : "sinais"} este ciclo`
							}
							onClick={() => toggle("concorrentes")}
						/>
					)}
				</div>

				<AnimatePresence initial={false}>
					{activeTab === "clonadores" && hasImpersonators && (
						<motion.div
							key="clonadores-expanded"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
							className="overflow-hidden border-t border-edge"
						>
							<div className="px-5 py-5">
								<Impersonators impersonators={impersonators ?? null} embedded />
							</div>
						</motion.div>
					)}
					{activeTab === "concorrentes" && hasCompetitor && (
						<motion.div
							key="concorrentes-expanded"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
							className="overflow-hidden border-t border-edge"
						>
							<div className="px-5 py-5">
								<Competitor competitor={competitor ?? null} embedded />
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.section>
	);
}

function TabButton({
	active,
	urgent,
	label,
	primaryValue,
	primaryLabel,
	secondary,
	onClick,
}: {
	active: boolean;
	urgent: boolean;
	label: string;
	primaryValue: number;
	primaryLabel: string;
	secondary: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={`flex flex-col items-start gap-1.5 p-5 text-left transition-colors ${
				active ? "bg-surface-card-hover" : "hover:bg-surface-card-hover/70"
			}`}
		>
			<div className="flex items-center gap-2">
				<span
					className={`text-[12.5px] font-semibold uppercase tracking-[0.08em] ${
						active ? "text-content" : "text-content-secondary"
					}`}
				>
					{label}
				</span>
				{urgent && (
					<span
						className="inline-flex h-1.5 w-1.5 rounded-full bg-rose-400"
						aria-label="Sinais urgentes"
					/>
				)}
			</div>
			<div className="flex items-baseline gap-1.5">
				<span
					className={`font-mono text-[22px] font-semibold tabular-nums ${
						urgent && primaryValue > 0 ? "text-rose-300" : "text-content"
					}`}
				>
					{primaryValue}
				</span>
				<span className="text-[12px] text-content-faint">{primaryLabel}</span>
			</div>
			<div className="text-[11px] text-content-muted">{secondary}</div>
		</button>
	);
}
