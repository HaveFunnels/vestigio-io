"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import "@/styles/strategy.css";
import type { StrategyPlan } from "./types";
import HeroMetrics from "./sections/HeroMetrics";
import BuyerSegments from "./sections/BuyerSegments";
import WhatHappenedNarrative from "./sections/WhatHappenedNarrative";
import NextSteps from "./sections/NextSteps";
import ValuePreview from "./sections/ValuePreview";
import MemoryRollups from "./sections/MemoryRollups";
import MonthlyThesis from "./sections/MonthlyThesis";
import Continuity from "./sections/Continuity";
import CrossCustomerPattern from "./sections/CrossCustomerPattern";
// Wave 22.8 review — Copy Lens and Maps were moved out of the main
// plan to standalone pages (/library/strategy/[month]/copy-lens and
// /library/strategy/[month]/maps). Deep links live in the
// BuyerSegments Copy and Liderança cards. Competitor + Impersonators
// were clustered into Carteira so the customer triages one card
// instead of two sections that are mostly empty.
import Carteira from "./sections/Carteira";
import PlanTOCRail, { type TocItem } from "./PlanTOCRail";
import MonthPicker from "./MonthPicker";

/*
 * StrategyPlanPanel — top-level composition of the 6 plan sections
 *
 * Renders both interactive and print modes. Print mode is toggled
 * via the URL query `?print=true`; the same render path is used by
 * the headless chromium exporter in Step 10. Sections are composed in
 * fixed order to make the print export reproducible.
 *
 * The panel deliberately does NOT manage its own URL state or modal
 * lifecycle — those concerns live in the parent route (or the
 * /app/actions strip that opens it as a Radix Dialog).
 */

interface Props {
	plan: StrategyPlan;
	/** When true, the panel exposes a sticky export/share header. */
	showStickyHeader?: boolean;
	/** When provided, the close button in the sticky header calls this
	    instead of navigating to /app/library. Used by the Dialog
	    overlay variant that opens from the /app/actions strip — there,
	    closing should dismiss the dialog and return the user to the
	    underlying actions queue without a page transition. */
	onClose?: () => void;
}

const MONTH_NAMES_PT_BR: Record<string, string> = {
	"01": "Janeiro",
	"02": "Fevereiro",
	"03": "Março",
	"04": "Abril",
	"05": "Maio",
	"06": "Junho",
	"07": "Julho",
	"08": "Agosto",
	"09": "Setembro",
	"10": "Outubro",
	"11": "Novembro",
	"12": "Dezembro",
};

function formatMonthLabel(monthIso: string): string {
	const [year, mm] = monthIso.split("-");
	return `${MONTH_NAMES_PT_BR[mm] ?? mm} ${year}`;
}

function formatTimestamp(date: Date): string {
	// UTC formatting: the server renders in Node's TZ (UTC) and the
	// browser would otherwise render local time, producing a hydration
	// mismatch on the same Date object. Locking to UTC keeps both
	// surfaces consistent. The product chose to surface UTC timestamps
	// explicitly — the operator's locale shows up elsewhere via Intl.
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const mmName = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][date.getUTCMonth()];
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const min = String(date.getUTCMinutes()).padStart(2, "0");
	return `${dd} ${mmName} · ${hh}:${min} UTC`;
}

export type PlanViewMode = "completo" | "resumo";

function StickyHeader({
	plan,
	onClose,
	viewMode,
	onViewModeChange,
}: {
	plan: StrategyPlan;
	onClose?: () => void;
	viewMode: PlanViewMode;
	onViewModeChange: (mode: PlanViewMode) => void;
}) {
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");

	// Wave-22.6-review fix: previously a dead button (no onClick). For a
	// CFO-sharing use case this was the single most-clicked control in
	// the surface — and it did nothing. V1 ships "copy permalink to
	// clipboard" (works today with the existing /app/library/strategy/
	// [month] route + envId param). A full signed-link / external-share
	// modal lands in a follow-up wave (Wave 28+).
	const handleShare = async () => {
		try {
			const url = `${window.location.origin}/app/library/strategy/${encodeURIComponent(
				plan.month,
			)}?envId=${encodeURIComponent(plan.environmentId)}`;
			await navigator.clipboard.writeText(url);
			setShareState("copied");
			setTimeout(() => setShareState("idle"), 2500);
		} catch {
			setShareState("error");
			setTimeout(() => setShareState("idle"), 4000);
		}
	};

	const handleExport = async () => {
		setExporting(true);
		setExportError(null);
		try {
			const res = await fetch(
				`/api/library/strategy/${encodeURIComponent(plan.month)}/export?envId=${encodeURIComponent(plan.environmentId)}`,
				{ method: "POST" },
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setExportError(data?.message ?? `Falhou (HTTP ${res.status})`);
				setTimeout(() => setExportError(null), 5000);
				return;
			}
			// Download the PDF blob via an anchor click.
			const blob = await res.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = `vestigio-plano-${plan.month}.pdf`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : "Erro de rede");
			setTimeout(() => setExportError(null), 5000);
		} finally {
			setExporting(false);
		}
	};

	return (
		<div
			data-vsgp-sticky-header
			className="sticky top-0 z-30 border-b border-edge bg-surface/85 backdrop-blur-md"
		>
			<div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-3">
				<div className="flex items-center gap-3 text-[12px] text-content-muted">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
					<span>Plano publicado · {formatTimestamp(plan.generatedAt)}</span>
					{exportError && (
						<span className="ml-2 text-rose-300/90">· {exportError}</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					{/* Wave 22.8 IA reform — Executive Summary view toggle.
					    Defaults to "Completo"; "Resumo" mostra apenas Tese,
					    Hero, Continuidade condensada e top 3 Next Steps
					    (sem reasoning expandida). Persistencia via
					    localStorage + URL param ?view=resumo, geridos pelo
					    parent StrategyPlanPanel. */}
					<div
						role="radiogroup"
						aria-label="Modo de leitura do plano"
						className="inline-flex items-center rounded-md border border-edge bg-surface-card p-0.5"
					>
						{(["resumo", "completo"] as const).map((m) => (
							<button
								key={m}
								type="button"
								role="radio"
								aria-checked={viewMode === m}
								onClick={() => onViewModeChange(m)}
								className={`rounded-[5px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
									viewMode === m
										? "bg-surface-inset/80 text-content"
										: "text-content-muted hover:text-content-secondary"
								}`}
							>
								{m === "resumo" ? "Resumo" : "Completo"}
							</button>
						))}
					</div>
					<button
						type="button"
						onClick={handleShare}
						className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
					>
						{shareState === "copied"
							? "Link copiado"
							: shareState === "error"
								? "Falha ao copiar"
								: "Compartilhar"}
					</button>
					<button
						type="button"
						onClick={handleExport}
						disabled={exporting}
						className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
					>
						{exporting ? "Exportando…" : "Exportar PDF"}
					</button>
					{/* Wave 22.8 IA reform — close button só renderiza quando
					    onClose vem do parent (Dialog overlay de /app/actions).
					    No modo standalone, Plan é a home — não tem "fechar",
					    o cliente sai pela sidenav. */}
					{onClose && (
						<>
							<span className="mx-1 h-5 w-px bg-edge" aria-hidden />
							<button
								type="button"
								onClick={onClose}
								aria-label="Fechar plano"
								title="Fechar"
								className="group/close inline-flex h-8 w-8 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
							>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="transition-transform group-hover/close:scale-110">
									<path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
								</svg>
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function PlanHeader({ plan }: { plan: StrategyPlan }) {
	const monthLabel = formatMonthLabel(plan.month);

	return (
		<motion.header
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
			className="mb-14 border-b border-edge pb-10"
		>
			<div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-faint">
				<span>Vestigio</span>
				<span className="text-edge">/</span>
				<span>Plano de Estratégia</span>
				<span className="text-edge">/</span>
				<span>Ciclo #{plan.cycleNumber}</span>
			</div>

			<h1 className="mb-3 font-serif text-[44px] font-medium leading-[1.05] tracking-tight text-content sm:text-[56px]">
				Plano de Estratégia
				<br />
				<span className="text-content-secondary">· {monthLabel}</span>
			</h1>

			<div className="flex flex-wrap items-center gap-3 text-[12px] text-content-muted">
				{/* Wave 22.8 IA reform — Month picker substitutes the
				    standalone /app/library Plans gallery tab. Customer
				    navega entre meses sem sair do plano. */}
				<MonthPicker envId={plan.environmentId} currentMonth={plan.month} />
				<span className="text-edge">·</span>
				<span className="font-mono">{plan.envDomain}</span>
				<span className="text-edge">·</span>
				<span>Gerado {formatTimestamp(plan.generatedAt)}</span>
				{plan.lastRegenerated.getTime() !== plan.generatedAt.getTime() && (
					<>
						<span className="text-edge">·</span>
						<span>Revisão semanal {formatTimestamp(plan.lastRegenerated)}</span>
					</>
				)}
			</div>
		</motion.header>
	);
}

const VIEW_MODE_STORAGE_KEY = "vestigio.plan_view_mode";

function resolveInitialViewMode(searchParams: ReturnType<typeof useSearchParams>): PlanViewMode {
	// URL > localStorage > default. URL wins so a colleague can be
	// shared an exec-summary link (?view=resumo) regardless of their
	// own saved preference.
	const fromUrl = searchParams?.get("view");
	if (fromUrl === "resumo" || fromUrl === "completo") return fromUrl;
	if (typeof window !== "undefined") {
		try {
			const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
			if (stored === "resumo" || stored === "completo") return stored;
		} catch {
			/* localStorage blocked (private mode) — fall through */
		}
	}
	return "completo";
}

export default function StrategyPlanPanel({ plan, showStickyHeader = true, onClose }: Props) {
	const searchParams = useSearchParams();
	const isPrint = searchParams?.get("print") === "true";
	const monthLabel = formatMonthLabel(plan.month);
	const isPt = plan.locale === "pt-BR";

	// Wave 22.8 — Executive Summary view toggle. State persists in
	// localStorage so the customer's preference sticks across plan
	// visits; URL ?view= param overrides for share-link scenarios.
	// Print export always uses "completo" so PDFs carry the full plan.
	const [viewMode, setViewMode] = useState<PlanViewMode>(() =>
		isPrint ? "completo" : resolveInitialViewMode(searchParams),
	);
	function handleViewModeChange(next: PlanViewMode) {
		setViewMode(next);
		try {
			window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
		} catch {
			/* private mode — no-op */
		}
	}
	const isResumo = viewMode === "resumo" && !isPrint;

	return (
		<div
			data-vsgp-plan
			data-vsgp-print={isPrint ? "true" : "false"}
			className="relative min-h-screen bg-surface"
		>
			{/* Notion/Miro-style canvas background: subtle dotted grid
			    fixed behind the content. Uses radial-gradient dots at
			    26px spacing with very low opacity so it reads as
			    "this is a canvas", not "this is a graph". Fixed to the
			    viewport so the dots don't scroll with the content. The
			    fade-to-edge mask keeps the focus on the central reading
			    column without an abrupt hard edge.

			    Color uses --text-faint as the dot pigment so the
			    pattern reads correctly in both dark and light themes
			    (was hardcoded to white, which became invisible if the
			    app ever ran in light mode). Hidden in print via the
			    data-vsgp-print-hide attribute (see strategy.css). */}
			<div
				data-vsgp-print-hide
				aria-hidden
				className="pointer-events-none fixed inset-0 z-0"
				style={{
					backgroundImage:
						"radial-gradient(circle at center, rgb(var(--text-faint) / 0.22) 1px, transparent 1.2px)",
					backgroundSize: "26px 26px",
					maskImage:
						"radial-gradient(ellipse 80% 70% at 50% 40%, black 40%, transparent 95%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 80% 70% at 50% 40%, black 40%, transparent 95%)",
				}}
			/>

			{/* All real content sits above the grid layer */}
			<div className="relative z-10">
			{!isPrint && showStickyHeader && (
				<StickyHeader
					plan={plan}
					onClose={onClose}
					viewMode={viewMode}
					onViewModeChange={handleViewModeChange}
				/>
			)}

			<div className="mx-auto max-w-[1100px] px-6 py-10 sm:py-14">
				{/* Mobile-only hint — the plan is readable on phones but
				    the export/share/comment loop is built for a wider
				    canvas. Telling the user explicitly avoids "this feels
				    half-broken" anxiety on first read. */}
				<div className="mb-4 rounded-xl border border-edge bg-surface-inset/50 px-3 py-2 text-[11px] text-content-faint sm:hidden">
					{isPt
						? "Esta visão funciona melhor em uma tela maior."
						: "This view reads best on a larger screen."}
				</div>
				<PlanHeader plan={plan} />

				{/* Right-rail TOC. Items computed from current plan state
				    so hidden sections (continuity on first plan, etc.)
				    don't surface as orphan dots. Render outside the section
				    grid so position:fixed lifts cleanly. */}
				<PlanTOCRail
					items={(() => {
						const items: TocItem[] = [
							{ id: "thesis", label: isPt ? "Tese" : "Thesis", visible: !!plan.thesisOfMonth },
							{ id: "hero", label: isPt ? "Onde está" : "Where you are", visible: true },
							{
								id: "continuity",
								label: isPt ? "Continuidade" : "Continuity",
								visible: !!plan.continuity?.previousMonth,
							},
							{
								id: "cross-customer",
								label: isPt ? "Padrão carteira" : "Peer pattern",
								visible: !isResumo && !!plan.crossCustomerPattern,
							},
							{ id: "segments", label: isPt ? "Times" : "By team", visible: !isResumo },
							{
								id: "carteira",
								label: isPt ? "Carteira" : "Market signals",
								visible: !isResumo && (!!plan.competitor || !!plan.impersonators),
							},
							{
								id: "narrative",
								label: isPt ? "O que aconteceu" : "What happened",
								visible: !isResumo && !!plan.narrativeWhatHappened,
							},
							{ id: "next-steps", label: isPt ? "Próximos passos" : "Next steps", visible: true },
							{ id: "value-preview", label: isPt ? "O que ganha" : "Value preview", visible: !isResumo },
							{ id: "memory", label: isPt ? "Memória" : "Memory", visible: !isResumo },
						];
						return items;
					})()}
				/>

				{/* E1 — single-sentence thesis above the hero. Frames the
				    reading angle for the rest of the plan and signs as
				    Vestigio so the doc reads as authored analysis, not
				    auto-generated. Hidden on legacy plans without the
				    field. */}
				<div data-toc-id="thesis">
					<MonthlyThesis thesis={plan.thesisOfMonth} monthLabel={monthLabel} />
				</div>

				<div data-toc-id="hero">
					<HeroMetrics hero={plan.heroMetrics} monthLabel={monthLabel} />
				</div>
				{/* E3 — continuity. Em modo Resumo renderiza compact
				    (so o headline delta). Self-hide em mes-1. */}
				<div data-toc-id="continuity">
					<Continuity continuity={plan.continuity} compact={isResumo} />
				</div>
				{/* Wave 22.8 — Resumo mode esconde seções de contexto e
				    decomposição. Mantém só Tese, Hero, Continuidade, Top
				    3 Next Steps. */}
				{!isResumo && (
					<>
						<div data-toc-id="cross-customer">
							<CrossCustomerPattern pattern={plan.crossCustomerPattern} />
						</div>
						<div data-toc-id="segments">
							<BuyerSegments
								segments={plan.buyerSegments}
								month={plan.month}
								hasCopyLensData={
									!!plan.copyLens && (plan.copyLens.frameworks?.length ?? 0) > 0
								}
								hasMapsData={!!plan.maps}
							/>
						</div>
						<div data-toc-id="carteira">
							<Carteira
								competitor={plan.competitor}
								impersonators={plan.impersonators}
							/>
						</div>
						<div data-toc-id="narrative">
							<WhatHappenedNarrative
								narrative={plan.narrativeWhatHappened}
								monthLabel={monthLabel}
							/>
						</div>
					</>
				)}
				<div data-toc-id="next-steps">
					<NextSteps
						steps={plan.nextSteps}
						comments={plan.comments ?? []}
						pendingEdits={plan.pendingEdits ?? []}
						canApprove={plan.viewerCanApprove ?? false}
						envId={plan.environmentId}
						month={plan.month}
						planId={plan.id}
						compact={isResumo}
					/>
				</div>
				{!isResumo && (
					<>
						<div data-toc-id="value-preview">
							<ValuePreview
								preview={plan.valuePreview}
								narrative={plan.valuePreviewNarrative}
							/>
						</div>
						<div data-toc-id="memory">
							<MemoryRollups rollups={plan.memoryRollups} />
						</div>
					</>
				)}

				{/* Footer — Wave-22.6-review fix: removed internal LLM
				    cost telemetry ("$0.08") and engineer-style version
				    slug; this surface is exec-shareable and shouldn't
				    leak internal metrics. Generation date in the user's
				    locale replaces both. */}
			</div>
			</div>
		</div>
	);
}
