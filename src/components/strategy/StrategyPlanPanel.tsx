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
import CopyLens from "./sections/CopyLens";
import Competitor from "./sections/Competitor";
import Impersonators from "./sections/Impersonators";
import Maps from "./sections/Maps";
import PlanTOCRail, { type TocItem } from "./PlanTOCRail";

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

function StickyHeader({ plan, onClose }: { plan: StrategyPlan; onClose?: () => void }) {
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
					{/* Separator + close. Visually distinct from the action
					    buttons so it reads as a navigation/dismiss control,
					    not another action. Two variants:
					    - If onClose is provided (Dialog overlay from
					      /app/actions): close calls the parent's dismiss.
					    - Otherwise (standalone route): Phase 1 IA — the
					      close button routes back to /app/pulse (the
					      check-in dashboard) instead of /app/library.
					      Pulse will carry a Plan strip at the top so the
					      buyer can return to the plan in one click. */}
					<span className="mx-1 h-5 w-px bg-edge" aria-hidden />
					{onClose ? (
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
					) : (
						<Link
							href="/app/pulse"
							aria-label="Fechar plano"
							title="Fechar"
							className="group/close inline-flex h-8 w-8 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="transition-transform group-hover/close:scale-110">
								<path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
							</svg>
						</Link>
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
				<span>Vestigio Pulse</span>
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

export default function StrategyPlanPanel({ plan, showStickyHeader = true, onClose }: Props) {
	const searchParams = useSearchParams();
	const isPrint = searchParams?.get("print") === "true";
	const monthLabel = formatMonthLabel(plan.month);
	const isPt = plan.locale === "pt-BR";

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
			{!isPrint && showStickyHeader && <StickyHeader plan={plan} onClose={onClose} />}

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
								visible: !!plan.crossCustomerPattern,
							},
							{ id: "segments", label: isPt ? "Times" : "By team", visible: true },
							{
								id: "competitor",
								label: isPt ? "Concorrência" : "Competitors",
								visible: !!plan.competitor && (plan.competitor.entries?.length ?? 0) > 0,
							},
							{
								id: "impersonators",
								label: isPt ? "Impersonação" : "Impersonators",
								visible: !!plan.impersonators && (plan.impersonators.topEntries?.length ?? 0) > 0,
							},
							{ id: "narrative", label: isPt ? "O que aconteceu" : "What happened", visible: !!plan.narrativeWhatHappened },
							{ id: "next-steps", label: isPt ? "Próximos passos" : "Next steps", visible: true },
							{
								id: "copy-lens",
								label: isPt ? "Lente de copy" : "Copy lens",
								visible: !!plan.copyLens && (plan.copyLens.frameworks?.length ?? 0) > 0,
							},
							{
								id: "maps",
								label: isPt ? "Mapas" : "Maps",
								visible: !!plan.maps,
							},
							{ id: "value-preview", label: isPt ? "O que ganha" : "Value preview", visible: true },
							{ id: "memory", label: isPt ? "Memória" : "Memory", visible: true },
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
				{/* E3 — continuity from the prior month's plan. Sits between
				    hero and buyer segments so the customer first sees where
				    they are NOW (hero), then where they came from (continuity),
				    then who owns the work (segments). Self-hides for month-1
				    envs where no prior plan exists. */}
				<div data-toc-id="continuity">
					<Continuity continuity={plan.continuity} />
				</div>
				{/* E4 — peer pattern callout. Sits before buyer segments
				    so the "your segment shows X" frame anchors the by-team
				    decomposition that follows. Self-hides on null when the
				    peer sample is too small for statistically honest
				    framing. */}
				<div data-toc-id="cross-customer">
					<CrossCustomerPattern pattern={plan.crossCustomerPattern} />
				</div>
				<div data-toc-id="segments">
					<BuyerSegments segments={plan.buyerSegments} month={plan.month} />
				</div>
				{/* Wave 22.8 — Competitor radar. Self-hides for envs with
				    zero monitored competitors or no detected changes
				    this cycle. */}
				<div data-toc-id="competitor">
					<Competitor competitor={plan.competitor} />
				</div>
				{/* Wave 22.8 — Brand impersonators. Self-hides when no
				    lookalike domains were detected this cycle. */}
				<div data-toc-id="impersonators">
					<Impersonators impersonators={plan.impersonators} />
				</div>
				<div data-toc-id="narrative">
					<WhatHappenedNarrative
						narrative={plan.narrativeWhatHappened}
						monthLabel={monthLabel}
					/>
				</div>
				<div data-toc-id="next-steps">
					<NextSteps
						steps={plan.nextSteps}
						comments={plan.comments ?? []}
						pendingEdits={plan.pendingEdits ?? []}
						canApprove={plan.viewerCanApprove ?? false}
						envId={plan.environmentId}
						month={plan.month}
						planId={plan.id}
					/>
				</div>
				{/* Wave 22.8 — Copy Lens Framework. Self-hides when no
				    CopyFrameworkAudit rows exist for the cycle. */}
				<div data-toc-id="copy-lens">
					<CopyLens copyLens={plan.copyLens} />
				</div>
				{/* Wave 22.8 — Maps. Self-hides when no auto-map data
				    exists for the cycle. */}
				<div data-toc-id="maps">
					<Maps maps={plan.maps} />
				</div>
				<div data-toc-id="value-preview">
					<ValuePreview
						preview={plan.valuePreview}
						narrative={plan.valuePreviewNarrative}
					/>
				</div>
				<div data-toc-id="memory">
					<MemoryRollups rollups={plan.memoryRollups} />
				</div>

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
