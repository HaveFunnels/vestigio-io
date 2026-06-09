"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, KeyRound, Lock, CreditCard, Megaphone } from "lucide-react";

/*
 * Workspaces hub — Fontes de dados section.
 *
 * Cards "pré-visualização" das integrações disponíveis com link para a
 * tela de configuração detalhada existente (/app/settings/data-sources)
 * que ainda usa visual antigo. Esta seção dá o sumário no padrão visual
 * do Plano e deixa o detalhamento para a tela legada até refactor.
 */

interface SourceCard {
	id: string;
	label: string;
	purpose: string;
	icon: React.ComponentType<{ className?: string }>;
	available: boolean;
}

const SOURCES: SourceCard[] = [
	{
		id: "saas_access",
		label: "Acesso autenticado ao seu produto",
		purpose: "Permite que Vestigio analise páginas atrás de login (SaaS verticals).",
		icon: KeyRound,
		available: true,
	},
	{
		id: "stripe",
		label: "Stripe",
		purpose: "Atribuição de receita real para findings (M3+ no roadmap).",
		icon: CreditCard,
		available: false,
	},
	{
		id: "ga4",
		label: "Google Analytics 4",
		purpose: "Comportamento agregado para enriquecer cálculo de impacto.",
		icon: Megaphone,
		available: false,
	},
	{
		id: "behavioral",
		label: "Pixel comportamental Vestigio",
		purpose: "Sinais de sessão em tempo real para a camada behavioral.",
		icon: Lock,
		available: false,
	},
];

export default function DataSourcesSection() {
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
					Fontes de dados
				</h2>
				<div className="text-[11px] text-content-faint">
					{SOURCES.filter((s) => s.available).length} disponíveis
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				<p className="mb-5 border-b border-edge/40 pb-5 text-[13px] leading-snug text-content-secondary">
					Integrações que alimentam ou enriquecem as análises de Vestigio.
					Quanto mais fontes conectadas, mais o engine sai de estimativa para
					atribuição medida ao longo dos próximos ciclos.
				</p>

				<ul className="space-y-2">
					{SOURCES.map((s) => {
						const Icon = s.icon;
						return (
							<li
								key={s.id}
								className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/20 p-3 sm:flex-row sm:items-center sm:gap-4"
							>
								<div className="flex flex-1 items-start gap-3">
									<Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-faint" aria-hidden />
									<div className="min-w-0">
										<div className="truncate text-[13px] font-semibold text-content">
											{s.label}
										</div>
										<div className="mt-0.5 text-[11.5px] leading-snug text-content-muted">
											{s.purpose}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-2 sm:justify-end">
									{s.available ? (
										<Link
											href="/app/settings/data-sources"
											className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface-inset/60 px-2.5 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
										>
											Configurar
											<ArrowRight className="h-3 w-3" />
										</Link>
									) : (
										<span className="rounded-md bg-surface-inset/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-content-faint">
											em breve
										</span>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			</div>
		</motion.section>
	);
}
