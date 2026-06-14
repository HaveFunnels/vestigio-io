"use client";

import { useEffect, useState } from "react";
import { DrawerSection } from "@/components/console/DrawerSection";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";

// ──────────────────────────────────────────────
// Bundle C — Causal Timeline (finding drawer section)
//
// Customer abre o drawer de um finding e vê a "história forense":
// quando apareceu, há quanto tempo, qual o custo acumulado, e que
// mudanças aconteceram na janela. Self-hide quando o backend não
// consegue reconstruir uma cadeia (primeira observação, dado curto).
//
// Estado loading discreto (1 linha). Empty state explícito quando não
// há cadeia detectada — sem inventar narrativa.
// ──────────────────────────────────────────────

interface TimelineEvent {
	at: string;
	kind:
		| "finding_created"
		| "cycle_completed"
		| "neighbor_finding"
		| "status_transition"
		| "regression_detected"
		| "tech_added"
		| "tech_removed";
	title: string;
	detail: string | null;
}

interface TimelineResponse {
	finding_id: string;
	finding_first_observed_at: string;
	finding_window_days: number;
	estimated_cost_accumulated_brl: number;
	prior_state: {
		label: "healthy" | "not_observed" | "first_env_cycle" | "unknown";
		human_label: string;
		cycle_ref: string | null;
		cycle_date: string | null;
	};
	events: TimelineEvent[];
	has_causal_chain: boolean;
}

interface Props {
	findingId: string;
	/** Optional — when omitted, lê do active_env cookie / URL param.
	 *  Self-hide quando não consegue resolver (sem rede de drawer ad-hoc). */
	envId?: string;
}

/** Mirror do pattern de CompetitorRadar.tsx. Quando nenhuma das fontes
 *  resolve, retorna null (component irá se auto-hide). */
function getEnvironmentId(explicit?: string): string | null {
	if (explicit) return explicit;
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	const fromUrl = params.get("env");
	if (fromUrl) return fromUrl;
	const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
	if (match?.[1]) return match[1];
	return null;
}

function formatDate(iso: string): string {
	try {
		const d = new Date(iso);
		// TZ local do visitante (não UTC). Span renderizador usa
		// suppressHydrationWarning pra silenciar mismatch de SSR.
		const day = String(d.getDate()).padStart(2, "0");
		const months = [
			"Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
		];
		const year = d.getFullYear();
		const currentYear = new Date().getFullYear();
		const monthLabel = months[d.getMonth()];
		// Omit year quando é o ano corrente (concisão)
		return year === currentYear ? `${day}/${monthLabel}` : `${day}/${monthLabel}/${year}`;
	} catch {
		return iso;
	}
}

function formatWindow(days: number): string {
	if (days < 1) return "menos de 1 dia";
	if (days === 1) return "1 dia";
	if (days < 30) return `${days} dias`;
	if (days < 60) return "~1 mês";
	const months = Math.round((days / 30.44) * 10) / 10;
	return `${months} meses`;
}

const KIND_STYLE: Record<TimelineEvent["kind"], { dot: string; ringColor: string }> = {
	finding_created: { dot: "bg-rose-400", ringColor: "ring-rose-500/30" },
	cycle_completed: { dot: "bg-emerald-400", ringColor: "ring-emerald-500/30" },
	neighbor_finding: { dot: "bg-amber-400", ringColor: "ring-amber-500/30" },
	status_transition: { dot: "bg-blue-400", ringColor: "ring-blue-500/30" },
	regression_detected: { dot: "bg-rose-400", ringColor: "ring-rose-500/30" },
	// Tech mudanças — violet pra ficar distinto dos outros eventos.
	// Mesmo tom de add e remove (a diferenciação acontece no título).
	tech_added: { dot: "bg-violet-400", ringColor: "ring-violet-500/30" },
	tech_removed: { dot: "bg-violet-400", ringColor: "ring-violet-500/30" },
};

export default function CausalTimeline({ findingId, envId: explicitEnvId }: Props) {
	const [data, setData] = useState<TimelineResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { currency } = useMcpData();
	const envId = getEnvironmentId(explicitEnvId);

	useEffect(() => {
		if (!envId) {
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		fetch(
			`/api/findings/${encodeURIComponent(findingId)}/causal-timeline?envId=${encodeURIComponent(envId)}`,
			{ cache: "no-store" },
		)
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((d) => setData(d))
			.catch((e) => setError(e.message ?? "Falha"))
			.finally(() => setLoading(false));
	}, [findingId, envId]);

	// Sem envId disponível, não renderiza nada — evita 400 inútil.
	if (!envId) return null;

	if (loading) {
		return (
			<DrawerSection title="Linha do tempo da causa">
				<div className="h-4 w-40 animate-pulse rounded bg-surface-inset" />
			</DrawerSection>
		);
	}

	if (error || !data) {
		// Silent fail — não distrai o cliente com erro técnico no drawer
		return null;
	}

	const windowLabel = formatWindow(data.finding_window_days);
	const showCost = data.estimated_cost_accumulated_brl > 0;

	return (
		<DrawerSection title="Linha do tempo da causa">
			{/* Headline — sempre renderiza */}
			<div className="mb-4 rounded-xl border border-edge/40 bg-surface-inset/30 p-4">
				<div className="text-[12px] text-content-muted">
					Vestigio identificou este problema há{" "}
					<span className="font-semibold text-content-secondary">{windowLabel}</span>.
				</div>
				{showCost && (
					<div className="mt-1.5 font-mono text-[13px] tabular-nums text-content">
						<span className="text-content-faint">Custo acumulado estimado:</span>{" "}
						<span className="font-semibold text-rose-300">
							{fmtCurrencyUnits(data.estimated_cost_accumulated_brl, currency)}
						</span>
					</div>
				)}
			</div>

			{/* Empty state quando não tem cadeia causal */}
			{!data.has_causal_chain ? (
				<div className="rounded-xl border border-dashed border-edge bg-surface-inset/20 p-4 text-[12px] leading-relaxed text-content-muted">
					{data.prior_state.label === "first_env_cycle" ? (
						<>
							Este é o primeiro ciclo deste ambiente — não há janela anterior pra comparar. A finding pode ser pré-existente do site ou ter sido criada junto com o setup.
						</>
					) : data.prior_state.label === "unknown" ? (
						<>
							Vestigio não conseguiu identificar uma mudança correlacionada à criação desta finding. Causa provável: <span className="font-medium text-content-secondary">condição pré-existente do site</span> (estado normal, não uma regressão recente).
						</>
					) : (
						<>
							Sem cadeia causal detectada nesta janela.
						</>
					)}
				</div>
			) : (
				<>
					{/* Timeline */}
					<div className="relative space-y-3 pl-4">
						{/* Vertical line */}
						<div
							className="pointer-events-none absolute bottom-2 left-[5px] top-2 w-px bg-edge/40"
							aria-hidden
						/>
						{data.events.map((ev, i) => {
							const style = KIND_STYLE[ev.kind];
							return (
								<div key={i} className="relative">
									{/* Dot */}
									<div
										className={`absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full ${style.dot} ring-2 ${style.ringColor}`}
										aria-hidden
									/>
									<div className="ml-2">
										<div className="flex items-baseline justify-between gap-3">
											<div className="text-[12.5px] font-medium leading-snug text-content">
												{ev.title}
											</div>
											<div className="shrink-0 font-mono text-[11px] tabular-nums text-content-faint" suppressHydrationWarning>
												{formatDate(ev.at)}
											</div>
										</div>
										{ev.detail && (
											<div className="mt-0.5 text-[11.5px] leading-snug text-content-muted">
												{ev.detail}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}
		</DrawerSection>
	);
}
