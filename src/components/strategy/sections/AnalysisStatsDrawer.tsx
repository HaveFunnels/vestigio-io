"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ──────────────────────────────────────────────
// UX-1 — "O que foi analisado" sidedrawer (brag-mode)
//
// Customer feedback: "o objetivo é overwhelm o user com numeros e
// detalhes, pra ele falar 'caramba, foi coisa pra caralho!!'".
//
// Drawer renderiza contagens em 5 seções (Cobertura / Coleta /
// Análise / Operação / Knowledge). Cada bloco tem 3-6 números
// big-mono pra leitura veloz + label compacto. Footer compromete
// com a transparência: "atualizado em X, baseado no ciclo Y".
//
// Trigger é um botão no sticky header do plano. Drawer abre da
// direita matching o SideDrawer console (largura 50vw max-w-[720px]).
// ──────────────────────────────────────────────

export interface AnalysisStatsResponse {
	coverage: {
		pages_analyzed: number;
		authenticated_attempts: number;
		competitors_monitored: number;
	};
	collection: {
		evidence_total: number;
		evidence_by_type: Array<{ type: string; count: number }>;
		behavioral_sessions: number;
		network_requests_captured: number;
	};
	analysis: {
		findings_created_this_month: number;
		findings_resolved_this_month: number;
		findings_open: number;
		actions_emitted_this_month: number;
		user_actions_done_this_month: number;
	};
	operations: {
		cycles_this_month: number;
		avg_cycle_seconds: number;
		last_cycle_type: string | null;
		last_cycle_completed_at: string | null;
	};
	knowledge: {
		foundation_articles_total: number;
		packs_active: number;
		inference_keys_total: number;
	};
}

interface Props {
	open: boolean;
	onClose: () => void;
	envId: string;
	month: string;
	monthLabel: string;
}

export default function AnalysisStatsDrawer({ open, onClose, envId, month, monthLabel }: Props) {
	const [stats, setStats] = useState<AnalysisStatsResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open || stats) return;
		setLoading(true);
		setError(null);
		fetch(`/api/library/strategy/${month}/analysis-stats?envId=${encodeURIComponent(envId)}`, {
			cache: "no-store",
		})
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data) => setStats(data))
			.catch((e) => setError(e.message ?? "Falha ao carregar"))
			.finally(() => setLoading(false));
	}, [open, envId, month, stats]);

	// ESC fecha; backdrop click fecha. Standard drawer interactions.
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-40 bg-surface-overlay/50"
						onClick={onClose}
					/>
					<motion.div
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
						className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-edge bg-surface shadow-2xl sm:w-[50vw] sm:max-w-[720px]"
					>
						<div className="flex items-center justify-between border-b border-edge px-6 py-5">
							<div>
								<h2 className="font-serif text-[18px] font-medium leading-tight text-content">
									O que foi analisado
								</h2>
								<p className="mt-0.5 text-[11px] text-content-faint">
									Cobertura e profundidade do trabalho da Vestigio em {monthLabel}
								</p>
							</div>
							<button
								onClick={onClose}
								className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
								aria-label="Fechar"
							>
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>

						<div className="flex-1 overflow-y-auto px-6 py-5">
							{loading && <LoadingSkeleton />}
							{error && (
								<div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-[13px] text-rose-300">
									Falha ao carregar estatísticas: {error}
								</div>
							)}
							{stats && <StatsBody stats={stats} />}
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			{[1, 2, 3, 4].map((i) => (
				<div key={i} className="rounded-2xl border border-edge bg-surface-card p-5">
					<div className="mb-3 h-3 w-32 animate-pulse rounded bg-surface-inset" />
					<div className="grid grid-cols-2 gap-3">
						{[1, 2, 3, 4].map((j) => (
							<div key={j} className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
								<div className="h-6 w-16 animate-pulse rounded bg-surface-inset" />
								<div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-surface-inset" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function StatsBody({ stats }: { stats: AnalysisStatsResponse }) {
	return (
		<div className="space-y-5">
			{/* COBERTURA */}
			<Section title="Cobertura de superfície" subtitle="Quais superfícies a Vestigio cobre">
				<Tile label="Páginas no inventário" value={stats.coverage.pages_analyzed} />
				<Tile
					label="Sessões autenticadas"
					value={stats.coverage.authenticated_attempts}
					sub={stats.coverage.authenticated_attempts === 0 ? "Configure SaaS access" : null}
				/>
				<Tile label="Concorrentes monitorados" value={stats.coverage.competitors_monitored} />
			</Section>

			{/* COLETA */}
			<Section title="Coleta de evidências" subtitle="O que foi observado no último ciclo">
				<Tile label="Evidências capturadas" value={stats.collection.evidence_total} />
				<Tile
					label="Requests de rede"
					value={stats.collection.network_requests_captured}
				/>
				<Tile
					label="Sessões behaviorais"
					value={stats.collection.behavioral_sessions}
					sub={stats.collection.behavioral_sessions === 0 ? "Instale o pixel" : null}
				/>
			</Section>

			{/* Breakdown por evidência type — só renderiza se tem dado */}
			{stats.collection.evidence_by_type.length > 0 && (
				<details className="rounded-2xl border border-edge bg-surface-card p-5">
					<summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.14em] text-content-faint hover:text-content-secondary">
						Detalhamento por tipo de evidência ({stats.collection.evidence_by_type.length} tipos)
					</summary>
					<div className="mt-3 space-y-1.5">
						{stats.collection.evidence_by_type.slice(0, 15).map((row) => (
							<div key={row.type} className="flex items-baseline justify-between gap-3 text-[12px]">
								<span className="truncate font-mono text-content-muted">
									{row.type}
								</span>
								<span className="font-mono font-semibold tabular-nums text-content">
									{row.count.toLocaleString("pt-BR")}
								</span>
							</div>
						))}
						{stats.collection.evidence_by_type.length > 15 && (
							<div className="border-t border-edge/40 pt-1.5 text-[11px] text-content-faint">
								+ {stats.collection.evidence_by_type.length - 15} outros tipos
							</div>
						)}
					</div>
				</details>
			)}

			{/* ANÁLISE */}
			<Section title="Análise" subtitle="O que a engine extraiu do dado">
				<Tile label="Achados criados no mês" value={stats.analysis.findings_created_this_month} />
				<Tile
					label="Achados resolvidos no mês"
					value={stats.analysis.findings_resolved_this_month}
					tone="success"
				/>
				<Tile label="Achados abertos agora" value={stats.analysis.findings_open} />
				<Tile label="Ações emitidas no mês" value={stats.analysis.actions_emitted_this_month} />
				<Tile
					label="Ações fechadas pelo time"
					value={stats.analysis.user_actions_done_this_month}
					tone="success"
				/>
			</Section>

			{/* OPERAÇÃO */}
			<Section title="Operação" subtitle="Como a Vestigio rodou este mês">
				<Tile label="Ciclos completos" value={stats.operations.cycles_this_month} />
				<Tile
					label="Duração média do ciclo"
					value={stats.operations.avg_cycle_seconds}
					formatter={(v) => (v > 60 ? `${Math.round(v / 60)} min` : `${v}s`)}
				/>
			</Section>

			{/* KNOWLEDGE */}
			<Section title="Camada de conhecimento" subtitle="A base de inteligência por trás de cada análise">
				<Tile label="Artigos de fundação" value={stats.knowledge.foundation_articles_total} />
				<Tile label="Packs analíticos ativos" value={stats.knowledge.packs_active} />
				<Tile label="Chaves de inferência" value={stats.knowledge.inference_keys_total} />
			</Section>
		</div>
	);
}

function Section({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
			<div className="mb-4">
				<h3 className="font-serif text-[16px] font-medium tracking-tight text-content">
					{title}
				</h3>
				{subtitle && (
					<p className="mt-0.5 text-[11px] text-content-faint">{subtitle}</p>
				)}
			</div>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
		</div>
	);
}

function Tile({
	label,
	value,
	sub,
	tone,
	formatter,
}: {
	label: string;
	value: number;
	sub?: string | null;
	tone?: "success" | "loss";
	formatter?: (v: number) => string;
}) {
	const display = formatter ? formatter(value) : value.toLocaleString("pt-BR");
	const toneColor =
		tone === "success" ? "text-emerald-400" : tone === "loss" ? "text-rose-400" : "text-content";
	return (
		<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
			<div className={`font-mono text-[22px] font-semibold tabular-nums leading-none ${toneColor}`}>
				{display}
			</div>
			<div className="mt-1.5 text-[11px] leading-snug text-content-muted">{label}</div>
			{sub && <div className="mt-1 text-[10px] text-content-faint">{sub}</div>}
		</div>
	);
}
