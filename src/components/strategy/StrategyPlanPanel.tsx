"use client";

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

function StickyHeader({ plan }: { plan: StrategyPlan }) {
	return (
		<div
			data-vsgp-sticky-header
			className="sticky top-0 z-30 border-b border-edge bg-surface/85 backdrop-blur-md"
		>
			<div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-3">
				<div className="flex items-center gap-3 text-[12px] text-content-muted">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
					<span>Plano publicado · {formatTimestamp(plan.generatedAt)}</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
					>
						Compartilhar
					</button>
					<button
						type="button"
						className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
					>
						Exportar PDF
					</button>
					{/* Separator + close. Visually distinct from the action
					    buttons so it reads as a navigation/dismiss control,
					    not another action. Returns to the Library gallery
					    where the user opened the plan from. */}
					<span className="mx-1 h-5 w-px bg-edge" aria-hidden />
					<Link
						href="/app/library"
						aria-label="Fechar plano"
						title="Fechar"
						className="group/close inline-flex h-8 w-8 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							className="transition-transform group-hover/close:scale-110"
						>
							<path
								d="M3 3L11 11M11 3L3 11"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
							/>
						</svg>
					</Link>
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

export default function StrategyPlanPanel({ plan, showStickyHeader = true }: Props) {
	const searchParams = useSearchParams();
	const isPrint = searchParams?.get("print") === "true";
	const monthLabel = formatMonthLabel(plan.month);

	return (
		<div
			data-vsgp-plan
			data-vsgp-print={isPrint ? "true" : "false"}
			className="relative min-h-screen bg-surface"
		>
			{/* Notion/Miro-style canvas background: subtle dotted grid
			    fixed behind the content. Uses radial-gradient dots at
			    24px spacing with very low opacity so it reads as
			    "this is a canvas", not "this is a graph". Fixed to the
			    viewport so the dots don't scroll with the content. The
			    fade-to-edge mask keeps the focus on the central reading
			    column without an abrupt hard edge. Hidden in print via
			    the data-vsgp-print attribute (see strategy.css). */}
			<div
				data-vsgp-print-hide
				aria-hidden
				className="pointer-events-none fixed inset-0 z-0"
				style={{
					backgroundImage:
						"radial-gradient(circle at center, rgb(255 255 255 / 0.045) 1px, transparent 1.2px)",
					backgroundSize: "26px 26px",
					maskImage:
						"radial-gradient(ellipse 80% 70% at 50% 40%, black 40%, transparent 95%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 80% 70% at 50% 40%, black 40%, transparent 95%)",
				}}
			/>

			{/* All real content sits above the grid layer */}
			<div className="relative z-10">
			{!isPrint && showStickyHeader && <StickyHeader plan={plan} />}

			<div className="mx-auto max-w-[1100px] px-6 py-10 sm:py-14">
				<PlanHeader plan={plan} />

				<HeroMetrics hero={plan.heroMetrics} monthLabel={monthLabel} />
				<BuyerSegments segments={plan.buyerSegments} />
				<WhatHappenedNarrative
					narrative={plan.narrativeWhatHappened}
					monthLabel={monthLabel}
				/>
				<NextSteps steps={plan.nextSteps} />
				<ValuePreview
					preview={plan.valuePreview}
					narrative={plan.valuePreviewNarrative}
				/>
				<MemoryRollups rollups={plan.memoryRollups} />

				{/* Footer */}
				<footer className="mt-16 border-t border-edge pt-6 text-[11px] text-content-faint">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							Gerado por <span className="font-medium">Vestigio Pulse</span> · custo do mês{" "}
							<span className="font-mono">$0.08</span>
						</div>
						<div className="font-mono">v{plan.id.slice(-8)}</div>
					</div>
				</footer>
			</div>
			</div>
		</div>
	);
}
