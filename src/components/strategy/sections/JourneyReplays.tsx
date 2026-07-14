"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";
import SideDrawer from "@/components/console/SideDrawer";
import { humanizePath } from "@/lib/humanize-path";

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
	// Wave 22.9 · Onda 1 — enriched context. Rendered on hover so
	// the customer can drill from the summary label into the specific
	// CTA text / near_cta / cluster range without leaving the card.
	cta_label?: string;
	ecommerce_signal?: string;
	pause_ms?: number;
	near_cta?: boolean;
	scroll_depth_pct?: number;
	scroll_depth_min_pct?: number;
	render_delay_ms?: number;
	from_path?: string;
	cluster_count?: number;
	cluster_span_seconds?: number;
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
	// Wave 22.9 · Onda 2 — 4-block narrative + confidence tier.
	// The old 3-block shape (headline/diagnosis/pattern_attribution)
	// is defense-in-depth for cached plans — UI falls back if the
	// legacy fields are all we have.
	narrative: {
		tier?: "padrao_claro" | "hipotese_consistente" | "sinal_isolado";
		padrao?: string;
		momento_critico?: string;
		comprador_provavelmente?: string;
		o_que_testar?: string;
		// Legacy compat
		headline?: string;
		diagnosis?: string;
		pattern_attribution?: string;
	};
}

const TIER_HUMAN_LABEL: Record<NonNullable<Journey["narrative"]["tier"]>, string> = {
	padrao_claro: "Padrão claro",
	hipotese_consistente: "Hipótese consistente",
	sinal_isolado: "Sinal isolado",
};

const TIER_CHIP_STYLE: Record<NonNullable<Journey["narrative"]["tier"]>, string> = {
	padrao_claro: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
	hipotese_consistente: "border-sky-500/30 bg-sky-500/10 text-sky-300",
	sinal_isolado: "border-content-faint/40 bg-content-faint/10 text-content-muted",
};

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

// Wave 22.9 · Onda 1 — dropped the emoji-adjacent `icon` field
// (council flagged: unicode glyphs violate the "no emojis" brand
// rule). Dot color alone carries the signal now — quiet events stay
// muted, money-relevant events warm up (amber = friction, rose = exit).
const KIND_DOT_STYLE: Record<TimelineEvent["kind"], string> = {
	page_enter: "bg-sky-400/70",
	page_dwell: "bg-content-faint",
	cta_click: "bg-emerald-400",
	form_focus: "bg-content-faint",
	form_error: "bg-amber-400",
	form_retry: "bg-amber-400",
	scroll_milestone: "bg-content-faint",
	hesitation: "bg-amber-400",
	backtrack: "bg-amber-400",
	exit: "bg-rose-400",
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
				<div className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
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
	// Wave 22.9 · Onda 1 — replaces the truncation-at-12 + "+N eventos"
	// UI that broke the customer's analysis chain. Now the customer
	// sees the FULL sequence on demand via a card-local expand toggle.
	const INITIAL_VISIBLE = 12;
	const [expanded, setExpanded] = useState(false);
	const visible = expanded
		? journey.timeline
		: journey.timeline.slice(0, INITIAL_VISIBLE);
	const hiddenCount = journey.timeline.length - INITIAL_VISIBLE;

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
					<div className="mb-3 flex items-baseline justify-between gap-2">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Linha do tempo
						</div>
						<div className="text-[10px] font-mono tabular-nums text-content-faint">
							{journey.timeline.length} eventos
						</div>
					</div>
					<div className="relative space-y-1 pl-3">
						<div
							className="pointer-events-none absolute bottom-1 left-[3px] top-1 w-px bg-edge/40"
							aria-hidden
						/>
						{visible.map((ev, i) => (
							<TimelineRow key={i} ev={ev} />
						))}
						{hiddenCount > 0 && (
							<button
								type="button"
								onClick={() => setExpanded((v) => !v)}
								className="ml-1 mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-content-muted underline-offset-2 hover:text-content hover:underline"
							>
								{expanded ? "Mostrar menos" : `Ver todos ${journey.timeline.length} eventos`}
							</button>
						)}
					</div>
				</div>

				{/* Narrative — 4-block structure per Wave 22.9 · Onda 2.
				    Legacy 3-block plans fall through to compatibility
				    render at the bottom of this branch. */}
				<div className="p-5 sm:p-6">
					<div className="mb-3 flex items-baseline justify-between gap-2">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Diagnóstico Vestigio
						</div>
						{journey.narrative.tier && (
							<span
								className={`rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] ${TIER_CHIP_STYLE[journey.narrative.tier]}`}
							>
								{TIER_HUMAN_LABEL[journey.narrative.tier]}
							</span>
						)}
					</div>
					{journey.narrative.padrao ||
					journey.narrative.momento_critico ||
					journey.narrative.comprador_provavelmente ||
					journey.narrative.o_que_testar ? (
						<div className="space-y-4 text-[13px] leading-relaxed text-content-secondary">
							{journey.narrative.padrao && (
								<div>
									<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
										Padrão
									</div>
									<p className="font-medium text-content">
										{journey.narrative.padrao}
									</p>
								</div>
							)}
							{journey.narrative.momento_critico && (
								<div>
									<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
										Momento crítico
									</div>
									<p>{journey.narrative.momento_critico}</p>
								</div>
							)}
							{journey.narrative.comprador_provavelmente && (
								<div>
									<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
										Este comprador provavelmente
									</div>
									<p>{journey.narrative.comprador_provavelmente}</p>
								</div>
							)}
							{journey.narrative.o_que_testar && (
								<div className="rounded-lg border border-edge/50 bg-surface-inset/40 px-3 py-2.5">
									<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
										O que testar
									</div>
									<p className="text-[12.5px] text-content">
										{journey.narrative.o_que_testar}
									</p>
								</div>
							)}
						</div>
					) : (
						// Legacy 3-block fallback — kept so cached plans
						// generated pre-Onda 2 keep rendering. New plans
						// always hit the branch above.
						<div className="space-y-3 text-[13px] leading-relaxed text-content-secondary">
							{journey.narrative.headline && (
								<p className="font-medium text-content">
									{journey.narrative.headline}
								</p>
							)}
							{journey.narrative.diagnosis && (
								<p>{journey.narrative.diagnosis}</p>
							)}
							{journey.narrative.pattern_attribution && (
								<p className="text-[12px] text-content-muted">
									{journey.narrative.pattern_attribution}
								</p>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// TimelineRow — Wave 22.9 · Onda 1
//
// Progressive disclosure per row. Primary label always visible; a
// secondary line with the enriched context (CTA text, pause duration,
// near_cta, cluster range, backtrack from-path) reveals on hover
// (desktop) or tap-toggle (mobile) via a grid-rows animation that
// causes ZERO layout jump. No framer-motion per row — CSS handles it.
// ──────────────────────────────────────────────

function TimelineRow({ ev }: { ev: TimelineEvent }) {
	const [open, setOpen] = useState(false);
	const dot = KIND_DOT_STYLE[ev.kind];
	const meta = buildSecondaryMeta(ev);
	const hasMeta = meta.length > 0;

	return (
		<div
			className="group relative cursor-default select-none"
			data-open={open ? "" : undefined}
			onClick={() => hasMeta && setOpen((v) => !v)}
		>
			<div
				className={`absolute -left-3 top-1.5 h-1.5 w-1.5 rounded-full ${dot}`}
				aria-hidden
			/>
			<div className="ml-2 flex items-baseline justify-between gap-2 rounded-md px-1 py-0.5 transition-colors group-hover:bg-surface-inset/40">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[11.5px] leading-snug text-content-secondary group-hover:text-content">
						{ev.label}
					</div>
				</div>
				<div className="shrink-0 font-mono text-[10px] tabular-nums text-content-faint">
					{formatTimestamp(ev.t_seconds)}
				</div>
			</div>
			{hasMeta && (
				<div
					className="ml-2 grid grid-rows-[0fr] transition-[grid-template-rows] duration-150 ease-out group-hover:grid-rows-[1fr] group-data-[open]:grid-rows-[1fr]"
				>
					<div className="overflow-hidden">
						<div className="px-1 pt-0.5 text-[10px] leading-tight text-content-faint">
							{meta.map((chunk, i) => (
								<span key={i}>
									{i > 0 && <span className="mx-1.5 text-content-faint/60">·</span>}
									{chunk}
								</span>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function buildSecondaryMeta(ev: TimelineEvent): string[] {
	const chunks: string[] = [];
	if (ev.path && !ev.label.includes(humanizePath(ev.path))) {
		chunks.push(humanizePath(ev.path));
	}
	if (ev.cta_label && !ev.label.includes(`"${ev.cta_label}"`)) {
		chunks.push(`botão: "${ev.cta_label}"`);
	}
	if (ev.near_cta && !ev.label.includes("perto do CTA")) {
		chunks.push("perto do CTA");
	}
	if (ev.render_delay_ms && !ev.label.includes("depois")) {
		chunks.push(`atraso de ${Math.round(ev.render_delay_ms / 1000)}s`);
	}
	if (ev.from_path && !ev.label.includes("Voltou de")) {
		chunks.push(`veio de ${humanizePath(ev.from_path)}`);
	}
	if (
		ev.cluster_count &&
		ev.cluster_count > 1 &&
		ev.kind === "scroll_milestone" &&
		ev.scroll_depth_min_pct &&
		ev.scroll_depth_pct
	) {
		chunks.push(`${ev.scroll_depth_min_pct}% → ${ev.scroll_depth_pct}%`);
	}
	if (ev.cluster_count && ev.cluster_count > 1 && ev.cluster_span_seconds) {
		chunks.push(`${ev.cluster_span_seconds}s no total`);
	}
	return chunks;
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
	const [drawerOpen, setDrawerOpen] = useState(false);
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
				className="overflow-hidden rounded-2xl border border-edge bg-gradient-to-br from-rose-500/[0.06] via-surface-card to-surface-card p-5 sm:p-6"
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
							Esta seção precisa do pixel Vestigio instalado. Cole o snippet abaixo nas páginas comerciais e o próximo plano vai mostrar as 3 jornadas mais críticas do mês: sessões reais de buyers perdendo dinheiro, com timeline e diagnóstico.
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
					<button
						type="button"
						onClick={() => setDrawerOpen(true)}
						className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
					>
						Instruções de instalação →
					</button>
				</div>
			</div>
			<PixelInstructionsDrawer
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
				envId={envId}
			/>
		</motion.section>
	);
}

// ──────────────────────────────────────────────
// Pixel install instructions drawer
//
// Conteúdo focado em "como instalar de verdade" — não só o snippet.
// Cobre as 4 plataformas mais comuns + como verificar via DevTools.
// Reusa o SideDrawer console já alinhado com o visual do plan.
// ──────────────────────────────────────────────

function PixelInstructionsDrawer({
	open,
	onClose,
	envId,
}: {
	open: boolean;
	onClose: () => void;
	envId: string;
}) {
	const [copied, setCopied] = useState(false);
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
		<SideDrawer open={open} onClose={onClose} title="Instruções do pixel Vestigio">
			<div className="space-y-6">
				{/* Intro */}
				<div className="text-[13px] leading-relaxed text-content-secondary">
					O pixel é um snippet JavaScript de ~12KB que coleta eventos comportamentais nas suas páginas comerciais (page views, cliques em CTA, friction patterns) e envia anonimizado pra Vestigio. Sem cookies de tracking, sem PII.
				</div>

				{/* Snippet */}
				<DrawerStep number={1} title="Copie o snippet">
					<div className="rounded-xl border border-edge bg-surface-inset/40 p-3">
						<code className="block overflow-x-auto whitespace-nowrap font-mono text-[11.5px] leading-relaxed text-content-secondary">
							{snippet}
						</code>
					</div>
					<button
						type="button"
						onClick={handleCopy}
						className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
							copied
								? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
								: "border-edge bg-surface-card text-content-secondary hover:border-edge-focus hover:text-content"
						}`}
					>
						{copied ? "Copiado ✓" : "Copiar snippet"}
					</button>
				</DrawerStep>

				{/* Onde instalar */}
				<DrawerStep number={2} title="Cole antes do </head>">
					<div className="space-y-3 text-[12.5px] leading-relaxed text-content-secondary">
						<p>
							O pixel precisa carregar em <span className="font-medium text-content">todas as páginas comerciais</span> (homepage, produto, carrinho, checkout, thank-you). Quanto mais cobertura, mais jornadas a Vestigio reconstrói.
						</p>
						<div className="space-y-2">
							<PlatformHint
								name="Shopify"
								steps={[
									"Online Store → Themes → Edit code",
									"Encontre theme.liquid",
									"Cole o snippet logo antes de </head>",
								]}
							/>
							<PlatformHint
								name="WordPress"
								steps={[
									"Instale plugin Insert Headers and Footers (WPCode)",
									"Cole o snippet no campo Header",
									"Salve",
								]}
							/>
							<PlatformHint
								name="Webflow"
								steps={[
									"Project Settings → Custom Code",
									"Cole o snippet em Head Code",
									"Publique o site",
								]}
							/>
							<PlatformHint
								name="HTML custom / Next.js / outros"
								steps={[
									"Cole o snippet no <head> de cada template",
									"Em Next.js: app/layout.tsx via <Script strategy=\"afterInteractive\">",
								]}
							/>
						</div>
					</div>
				</DrawerStep>

				{/* Verificar */}
				<DrawerStep number={3} title="Verifique que está rodando">
					<div className="space-y-3 text-[12.5px] leading-relaxed text-content-secondary">
						<p>Abra qualquer página comercial sua e:</p>
						<ol className="ml-4 list-decimal space-y-1.5">
							<li>Abra DevTools (F12) → aba <span className="font-mono font-medium text-content">Network</span></li>
							<li>Filtre por <span className="font-mono font-medium text-content">vestigio.js</span></li>
							<li>Recarregue a página</li>
							<li>Deve aparecer 1 request com status <span className="font-mono font-medium text-emerald-300">200</span></li>
						</ol>
						<p className="rounded-lg border border-edge/40 bg-surface-inset/30 p-3 text-[11.5px]">
							<span className="font-medium text-content">Próximo passo:</span> depois de 5 sessões coletadas, a seção <span className="italic">Jornadas que custaram dinheiro</span> ativa automaticamente no próximo plano mensal.
						</p>
					</div>
				</DrawerStep>

				{/* Privacy */}
				<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-4">
					<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Privacidade
					</div>
					<p className="text-[11.5px] leading-relaxed text-content-muted">
						Sem cookies de tracking persistentes. Session ID rotaciona a cada visita. IP é hasheado com salt diário no servidor (não reversível). Sem captura de campos sensíveis (CPF, cartão, senha). Só metadata estrutural. Compatível com LGPD e GDPR sob legítimo interesse.
					</p>
				</div>
			</div>
		</SideDrawer>
	);
}

function DrawerStep({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="mb-3 flex items-baseline gap-2">
				<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-inset font-serif text-[11px] font-semibold text-content">
					{number}
				</span>
				<h3 className="font-serif text-[15px] font-medium tracking-tight text-content">
					{title}
				</h3>
			</div>
			<div className="ml-7">{children}</div>
		</div>
	);
}

function PlatformHint({ name, steps }: { name: string; steps: string[] }) {
	return (
		<details className="rounded-lg border border-edge/40 bg-surface-inset/20">
			<summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-content-secondary hover:text-content">
				{name}
			</summary>
			<ol className="ml-7 list-decimal space-y-1 px-3 pb-3 pt-1 text-[11.5px] text-content-muted">
				{steps.map((s, i) => (
					<li key={i}>{s}</li>
				))}
			</ol>
		</details>
	);
}
