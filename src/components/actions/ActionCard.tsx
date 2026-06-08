"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { ActionProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// ActionCard — Phase 2 cards-default rendering for /app/actions.
//
// Mirrors FindingCard's visual language (severity dot, expansion,
// inline CTAs) but uses category icons + effort hints since actions
// live in an operational queue, not a triage list. Single primary
// CTA per card so the owner doesn't have to pick between 4 tab
// dropdowns on every row.
// ──────────────────────────────────────────────

const SEVERITY_DOT: Record<string, string> = {
	critical: "bg-rose-500",
	high: "bg-rose-400",
	medium: "bg-amber-500",
	low: "bg-content-faint",
	none: "bg-content-faint",
};

const SEVERITY_BORDER: Record<string, string> = {
	critical: "border-rose-500/30",
	high: "border-rose-400/25",
	medium: "border-amber-500/25",
	low: "border-edge",
	none: "border-edge",
};

const CATEGORY_LABEL: Record<string, string> = {
	incident: "Incidente",
	opportunity: "Oportunidade",
	verification: "Verificação",
	observation: "Observação",
};

const CATEGORY_TINT: Record<string, string> = {
	incident: "text-rose-600 dark:text-rose-300",
	opportunity: "text-emerald-600 dark:text-emerald-300",
	verification: "text-amber-600 dark:text-amber-300",
	observation: "text-content-muted",
};

const EFFORT_LABEL: Record<string, string> = {
	trivial: "esforço trivial",
	low: "esforço baixo",
	medium: "esforço médio",
	high: "esforço alto",
	very_high: "esforço muito alto",
};

interface Props {
	action: ActionProjection;
	onOpen: (action: ActionProjection) => void;
	onDiscuss?: (action: ActionProjection) => void;
	defaultExpanded?: boolean;
}

export default function ActionCard({
	action,
	onOpen,
	onDiscuss,
	defaultExpanded = false,
}: Props) {
	const [open, setOpen] = useState(defaultExpanded);
	const { currency } = useMcpData();

	const sev = action.severity || "low";
	const dotClass = SEVERITY_DOT[sev] ?? SEVERITY_DOT.low;
	const borderClass = SEVERITY_BORDER[sev] ?? SEVERITY_BORDER.low;

	const min = action.impact?.monthly_range?.min ?? 0;
	const max = action.impact?.monthly_range?.max ?? 0;
	const impactLabel = max > 0
		? `${fmtCurrencyUnits(min, currency, { zeroAsDash: true })} – ${fmtCurrencyUnits(max, currency, { zeroAsDash: true })}/mês`
		: null;

	const categoryLabel = CATEGORY_LABEL[action.category] ?? action.category;
	const categoryTint = CATEGORY_TINT[action.category] ?? "text-content-muted";
	const effortLabel = action.effort_hint
		? (EFFORT_LABEL[action.effort_hint] ?? action.effort_hint)
		: null;

	const remediation = action.remediation_steps;
	const hasExpandableBody = !!(action.description || action.root_cause || (remediation && remediation.length > 0));

	return (
		<div
			className={`overflow-hidden rounded-2xl border bg-surface-card transition-colors ${borderClass} ${open ? "shadow-sm" : ""}`}
		>
			<button
				type="button"
				onClick={() => hasExpandableBody && setOpen((v) => !v)}
				className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-card-hover sm:gap-4"
				aria-expanded={open}
				disabled={!hasExpandableBody}
			>
				<span
					className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
					aria-label={sev}
				/>

				<div className="min-w-0 flex-1">
					<div className="text-[14px] font-semibold leading-tight text-content sm:text-[15px]">
						{action.title}
					</div>
					<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-content-muted">
						<span className={`font-medium ${categoryTint}`}>{categoryLabel}</span>
						{effortLabel && (
							<>
								<span className="text-content-faint">·</span>
								<span>{effortLabel}</span>
							</>
						)}
					</div>
					{impactLabel && (
						<div className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-rose-600 dark:text-rose-300">
							{impactLabel}
						</div>
					)}
				</div>

				{hasExpandableBody && (
					<svg
						className={`mt-1 h-4 w-4 shrink-0 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.6}
						aria-hidden
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M3.5 6l4.5 4.5L12.5 6" />
					</svg>
				)}
			</button>

			<AnimatePresence initial={false}>
				{open && hasExpandableBody && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							height: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
							opacity: { duration: 0.14, ease: "easeOut" },
						}}
						className="overflow-hidden"
					>
						<div className="border-t border-edge px-5 pb-5 pt-4">
							{action.description && (
								<p className="mb-4 text-[13px] leading-relaxed text-content-secondary">
									{action.description}
								</p>
							)}

							{remediation && remediation.length > 0 && (
								<div className="mb-4">
									<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
										Como executar
									</div>
									<ol className="space-y-1.5">
										{remediation.slice(0, 5).map((step, i) => (
											<li
												key={i}
												className="flex gap-2.5 text-[13px] leading-relaxed text-content-secondary"
											>
												<span className="shrink-0 font-mono text-[11px] tabular-nums text-content-faint">
													{i + 1}.
												</span>
												<span>{step}</span>
											</li>
										))}
									</ol>
								</div>
							)}

							<div className="flex flex-wrap items-center gap-2 pt-1">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onOpen(action);
									}}
									className="rounded-md bg-content px-3 py-1.5 text-[12px] font-medium text-surface-card transition-colors hover:bg-content-secondary"
								>
									Abrir
								</button>
								{onDiscuss && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onDiscuss(action);
										}}
										className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
									>
										Discutir com Vestigio AI
									</button>
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
