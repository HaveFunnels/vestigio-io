"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/console/PageHeader";

// ──────────────────────────────────────────────
// Library — Wave 22.6
//
// The gallery of long-form artifacts the env has accumulated. Replaces
// the "Maps" sidenav item: a single navigational home for Maps + the
// monthly Strategy Plans + any future docs (M&A reports, regulatory
// submissions, etc).
//
// Composition:
//   1. "Planos de Estratégia" section — monthly plans (Wave 22.6 design)
//   2. "Mapas" section — existing maps gallery (unchanged behavior;
//      cards continue to deep-link into /app/maps/[mapId] for the
//      detail view since that route already works)
//
// See docs/PLAN_MONTHLY_STRATEGY.md for the full design context.
// ──────────────────────────────────────────────

interface StrategyPlanSummary {
	id: string;
	month: string; // 'YYYY-MM'
	status: string; // 'generating' | 'ready' | 'editing' | 'archived'
	generatedAt: string;
	heroMetrics: {
		retainedMid: number;
		capturedMid: number;
		criticalCount: number;
		inProgressCount: number;
	};
}

function getEnvironmentId(): string {
	if (typeof window !== "undefined") {
		const params = new URLSearchParams(window.location.search);
		const fromUrl = params.get("env");
		if (fromUrl) return fromUrl;
		const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
		if (match?.[1]) return match[1];
	}
	return "default_env";
}

const MONTH_NAMES_PT_BR: Record<string, string> = {
	"01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
	"05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
	"09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

function formatMonth(monthIso: string): string {
	const [year, mm] = monthIso.split("-");
	const name = MONTH_NAMES_PT_BR[mm] ?? monthIso;
	return `${name} ${year}`;
}

export default function LibraryPage() {
	const tc = useTranslations("console.common");
	const envId = getEnvironmentId();
	const [plans, setPlans] = useState<StrategyPlanSummary[]>([]);
	const [plansLoading, setPlansLoading] = useState(true);

	useEffect(() => {
		fetch(`/api/library/strategy?envId=${envId}`)
			.then((r) => (r.ok ? r.json() : { plans: [] }))
			.then((data) => setPlans(data.plans ?? []))
			.catch(() => setPlans([]))
			.finally(() => setPlansLoading(false));
	}, [envId]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-edge px-6 py-4">
				<div className="[&>div]:mb-0">
					<PageHeader
						title="Biblioteca"
						tooltip="Galeria de artefatos longos do Vestigio: Planos de Estratégia mensais, Mapas causais e futuros relatórios (M&A, compliance, etc)."
					/>
				</div>
			</div>

			<div className="flex-1 overflow-auto px-6 py-6">
				{/* ── Strategy Plans section ── */}
				<section className="mb-10">
					<div className="mb-3 flex items-baseline justify-between">
						<h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
							Planos de Estratégia
						</h2>
						<span className="text-[11px] text-content-faint">
							Gerado mensalmente. Próximo: dia 1º
						</span>
					</div>

					{plansLoading ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{[0, 1, 2].map((i) => (
								<div
									key={i}
									className="h-40 rounded-xl border border-edge bg-surface-card animate-pulse"
								/>
							))}
						</div>
					) : plans.length === 0 ? (
						<div className="rounded-xl border border-edge border-dashed bg-surface-card/40 p-8 text-center">
							<div className="mb-2 text-[13px] font-medium text-content">
								Seu primeiro Plano será gerado ao final do próximo audit completo.
							</div>
							<div className="text-[12px] text-content-muted max-w-md mx-auto">
								O Plano de Estratégia condensa suas findings, ações e contexto cumulativo em
								um documento mensal acionável — onde começar, em qual ordem, e o que esperar
								continuando com Vestigio.
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{plans.map((p) => (
								<Link
									key={p.id}
									href={`/app/library/strategy/${p.month}`}
									className="group rounded-xl border border-edge bg-surface-card p-5 transition-colors hover:bg-surface-card-hover"
								>
									<div className="mb-1 text-[11px] font-mono uppercase tracking-wider text-content-faint">
										Plano de Estratégia
									</div>
									<div className="mb-3 text-[18px] font-semibold text-content group-hover:text-accent-text transition-colors">
										{formatMonth(p.month)}
									</div>
									<div className="grid grid-cols-2 gap-2 text-[12px]">
										<div>
											<div className="text-content-faint">Retido</div>
											<div className="font-mono text-content tabular-nums">
												R$ {Math.round(p.heroMetrics.retainedMid).toLocaleString("pt-BR")}
											</div>
										</div>
										<div>
											<div className="text-content-faint">Capturado</div>
											<div className="font-mono text-content tabular-nums">
												R$ {Math.round(p.heroMetrics.capturedMid).toLocaleString("pt-BR")}
											</div>
										</div>
										<div>
											<div className="text-content-faint">Críticos</div>
											<div className="font-mono text-content tabular-nums">
												{p.heroMetrics.criticalCount}
											</div>
										</div>
										<div>
											<div className="text-content-faint">Em progresso</div>
											<div className="font-mono text-content tabular-nums">
												{p.heroMetrics.inProgressCount}
											</div>
										</div>
									</div>
								</Link>
							))}
						</div>
					)}
				</section>

				{/* ── Maps section ── */}
				<section>
					<div className="mb-3 flex items-baseline justify-between">
						<h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
							Mapas
						</h2>
						<Link
							href="/app/maps"
							className="text-[12px] text-content-secondary hover:text-content underline"
						>
							Ver todos os mapas →
						</Link>
					</div>
					<div className="rounded-xl border border-edge bg-surface-card p-6">
						<p className="text-[13px] text-content-muted">
							Mapas causais que ligam findings, root causes e ações em
							visualizações navegáveis. Acesse a galeria completa de mapas
							em <Link href="/app/maps" className="underline text-content">/app/maps</Link>.
						</p>
					</div>
				</section>
			</div>
		</div>
	);
}
