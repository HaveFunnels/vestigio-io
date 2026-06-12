"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";

// ──────────────────────────────────────────────
// Bundle D — Journey Replays section
//
// Renderiza 3 jornadas representativas de problemas (abandonos /
// drop-offs / desvios) em formato visual: persona header + timeline
// + narrativa estruturada por LLM. Self-hide nunca — quando não há
// dado, mostra hero forte de instalação do pixel.
// ──────────────────────────────────────────────

interface TimelineEvent {
	t_seconds: number;
	kind:
		| "page_enter"
		| "page_dwell"
		| "cta_click"
		| "form_focus"
		| "form_error"
		| "form_retry"
		| "scroll_milestone"
		| "hesitation"
		| "backtrack"
		| "exit";
	label: string;
	path: string | null;
}

interface Journey {
	persona: {
		descriptor: string;
		device: "mobile" | "desktop" | "unknown";
		source_label: string;
		campaign_label: string | null;
		visitor_type: "first_time" | "returning" | "unknown";
	};
	metrics: {
		duration_ms: number;
		surface_count: number;
		exit_path: string | null;
		intent_label: string;
		highest_milestone: string | null;
	};
	pattern: {
		kind: string;
		short_label: string;
	};
	estimated_lost_brl_cents: number;
	timeline: TimelineEvent[];
	session_hash: string;
	narrative: {
		headline: string;
		diagnosis: string;
		pattern_attribution: string;
	};
}

interface ApiResponse {
	pixel_required: boolean;
	session_count_this_month: number;
	min_required?: number;
	env_id?: string;
	journeys: Journey[];
}

interface Props {
	envId: string;
	month: string;
}

const KIND_STYLE: Record<TimelineEvent["kind"], { dot: string; icon: string }> = {
	page_enter: { dot: "bg-sky-400", icon: "▼" },
	page_dwell: { dot: "bg-content-faint", icon: "•" },
	cta_click: { dot: "bg-emerald-400", icon: "●" },
	form_focus: { dot: "bg-content-faint", icon: "●" },
	form_error: { dot: "bg-amber-400", icon: "⚠" },
	form_retry: { dot: "bg-amber-400", icon: "↻" },
	scroll_milestone: { dot: "bg-content-faint", icon: "▾" },
	hesitation: { dot: "bg-amber-400", icon: "⏸" },
	backtrack: { dot: "bg-amber-400", icon: "↩" },
	exit: { dot: "bg-rose-400", icon: "✕" },
};

export default function JourneyReplays({ envId, month }: Props) {
	const [data, setData] = useState<ApiResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const { currency } = useMcpData();

	useEffect(() => {
		setLoading(true);
		fetch(
			`/api/library/strategy/${encodeURIComponent(month)}/journeys?envId=${encodeURIComponent(envId)}`,
			{ cache: "no-store" },
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => setData(d))
			.catch(() => setData(null))
			.finally(() => setLoading(false));
	}, [envId, month]);

	if (loading) {
		return (
			<section className="mb-12">
				<div className="mb-4 h-5 w-64 animate-pulse rounded bg-surface-card" />
				<div className="rounded-2xl border border-edge bg-surface-card p-6 sm:p-8">
					<div className="h-3 w-32 animate-pulse rounded bg-surface-inset" />
				</div>
			</section>
		);
	}

	if (!data) return null;

	if (data.pixel_required) {
		return <PixelInstallHero envId={envId} sessionCount={data.session_count_this_month} />;
	}

	if (data.journeys.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Jornadas que custaram dinheiro este mês
				</h2>
				<div className="text-[11px] text-content-faint">
					{data.journeys.length} sessões reais reconstituídas · de {data.session_count_this_month} no total
				</div>
			</div>

			<div className="space-y-4">
				{data.journeys.map((j) => (
					<JourneyCard key={j.session_hash} journey={j} currency={currency} />
				))}
			</div>
		</motion.section>
	);
}

// ──────────────────────────────────────────────
// Journey card
// ──────────────────────────────────────────────

function JourneyCard({ journey, currency }: { journey: Journey; currency: string }) {
	const lostBrl = Math.round(journey.estimated_lost_brl_cents / 100);
	const minutes = Math.round((journey.metrics.duration_ms / 60000) * 10) / 10;

	return (
		<div data-vsgp-card className="overflow-hidden rounded-2xl border border-edge bg-surface-card">
			{/* Persona header */}
			<div className="border-b border-edge/60 bg-surface-inset/30 px-5 py-4 sm:px-6">
				<div className="flex flex-wrap items-baseline justify-between gap-3">
					<div>
						<div className="text-[13.5px] font-medium text-content">
							{journey.persona.descriptor}
						</div>
						<div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-content-muted">
							<span>{minutes} min de sessão</span>
							<span className="text-content-faint">·</span>
							<span>{journey.metrics.surface_count} páginas visitadas</span>
							<span className="text-content-faint">·</span>
							<span>{journey.metrics.intent_label}</span>
						</div>
					</div>
					<div className="text-right">
						<div className="font-mono text-[14px] font-semibold tabular-nums text-rose-400">
							{fmtCurrencyUnits(lostBrl, currency)}
						</div>
						<div className="text-[10px] text-content-faint">não convertidos</div>
					</div>
				</div>
			</div>

			{/* Visual timeline + narrative */}
			<div className="grid grid-cols-1 sm:grid-cols-[1fr_1.2fr]">
				{/* Timeline */}
				<div className="relative border-b border-edge/40 p-5 sm:border-b-0 sm:border-r sm:p-6">
					<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Linha do tempo
					</div>
					<div className="relative space-y-2 pl-3">
						<div
							className="pointer-events-none absolute bottom-1 left-[3px] top-1 w-px bg-edge/40"
							aria-hidden
						/>
						{journey.timeline.slice(0, 12).map((ev, i) => {
							const style = KIND_STYLE[ev.kind];
							return (
								<div key={i} className="relative">
									<div
										className={`absolute -left-3 top-1.5 h-1.5 w-1.5 rounded-full ${style.dot}`}
										aria-hidden
									/>
									<div className="ml-2 flex items-baseline justify-between gap-2">
										<div className="min-w-0 flex-1">
											<div className="truncate text-[11.5px] leading-snug text-content-secondary">
												{ev.label}
											</div>
										</div>
										<div className="shrink-0 font-mono text-[10px] tabular-nums text-content-faint">
											{formatTimestamp(ev.t_seconds)}
										</div>
									</div>
								</div>
							);
						})}
						{journey.timeline.length > 12 && (
							<div className="ml-2 pt-1 text-[10px] text-content-faint">
								+ {journey.timeline.length - 12} eventos
							</div>
						)}
					</div>
				</div>

				{/* Narrative */}
				<div className="p-5 sm:p-6">
					<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Diagnóstico Vestigio
					</div>
					<div className="space-y-3 text-[13px] leading-relaxed text-content-secondary">
						<p className="font-medium text-content">{journey.narrative.headline}</p>
						<p>{journey.narrative.diagnosis}</p>
						<p className="text-[12px] text-content-muted">
							{journey.narrative.pattern_attribution}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function formatTimestamp(seconds: number): string {
	if (seconds < 60) return `00:${String(seconds).padStart(2, "0")}`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ──────────────────────────────────────────────
// Pixel install hero — empty state forte
// ──────────────────────────────────────────────

function PixelInstallHero({ envId, sessionCount }: { envId: string; sessionCount: number }) {
	const [copied, setCopied] = useState(false);
	// Snippet sem SRI por design: vestigio.js é um pixel versionado em
	// app.vestigio.io que evolui sem que o cliente possa rehashear o
	// hash a cada deploy nosso. Mesmo formato usado em
	// /app/settings/data-sources e no audit-runner. SRI faria sentido
	// se a Vestigio dependesse de CDN terceiro — não é o caso.
	const snippet = `<script async src="https://app.vestigio.io/snippet/vestigio.js" data-env="${envId}"></script>`;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(snippet);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// silent
		}
	};

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
			className="mb-12"
		>
			<div className="mb-4">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Jornadas que custaram dinheiro este mês
				</h2>
			</div>
			<div
				data-vsgp-card
				className="overflow-hidden rounded-2xl border border-edge bg-gradient-to-br from-rose-500/[0.06] via-surface-card to-surface-card p-6 sm:p-8"
			>
				<div className="mb-4 flex items-start gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
						<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
					</div>
					<div className="flex-1">
						<h3 className="font-serif text-[18px] font-medium leading-tight text-content">
							Veja onde a receita escapa em tempo real
						</h3>
						<p className="mt-1.5 text-[13px] leading-relaxed text-content-secondary">
							Esta seção precisa do pixel Vestigio instalado. Cole o snippet abaixo nas páginas comerciais e o próximo plano vai mostrar as 3 jornadas mais críticas do mês — sessões reais de buyers perdendo dinheiro, com timeline e diagnóstico.
						</p>
						{sessionCount > 0 && (
							<p className="mt-2 text-[11.5px] text-content-muted">
								{sessionCount} {sessionCount === 1 ? "sessão coletada" : "sessões coletadas"} este mês · mínimo 5 para destravar análise.
							</p>
						)}
					</div>
				</div>

				<div className="mt-5 rounded-xl border border-edge bg-surface-inset/40 p-3">
					<code className="block overflow-x-auto whitespace-nowrap font-mono text-[11.5px] leading-relaxed text-content-secondary">
						{snippet}
					</code>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={handleCopy}
						className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
							copied
								? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
								: "border-edge bg-surface-card text-content-secondary hover:border-edge-focus hover:text-content"
						}`}
					>
						{copied ? "Snippet copiado ✓" : "Copiar snippet"}
					</button>
					<a
						href="/app/settings/data-sources"
						className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
					>
						Instruções de instalação →
					</a>
				</div>
			</div>
		</motion.section>
	);
}
