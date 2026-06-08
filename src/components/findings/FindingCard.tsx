"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { FindingProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// FindingCard — Phase 2 cards-default rendering
//
// Replaces the 8-column table row as the default Findings view.
// Designed for the owner-decisor persona (the mini-audit / plan
// language), not the analyst (the table). Visible at-a-glance:
//   - severity dot
//   - title (line-clamp 2)
//   - buyer-friendly pack label
//   - R$ exposure
//   - one primary CTA ("Criar ação") + expand affordance
// Click anywhere on the row toggles expansion (root cause +
// remediation steps appear inline below). No modal, no horizontal
// scroll, no column toggles.
// ──────────────────────────────────────────────

const SEVERITY_DOT: Record<string, string> = {
	critical: "bg-rose-500",
	high: "bg-rose-400",
	medium: "bg-amber-500",
	low: "bg-content-faint",
	none: "bg-content-faint",
	positive: "bg-emerald-500",
};

const SEVERITY_BORDER: Record<string, string> = {
	critical: "border-rose-500/30",
	high: "border-rose-400/25",
	medium: "border-amber-500/25",
	low: "border-edge",
	none: "border-edge",
	positive: "border-emerald-500/25",
};

interface Props {
	finding: FindingProjection;
	onCreateAction?: (finding: FindingProjection) => void | Promise<void>;
	onDiscuss?: (finding: FindingProjection) => void;
	creatingAction?: boolean;
	defaultExpanded?: boolean;
}

export default function FindingCard({
	finding,
	onCreateAction,
	onDiscuss,
	creatingAction,
	defaultExpanded = false,
}: Props) {
	const [open, setOpen] = useState(defaultExpanded);
	const tc = useTranslations("console.common");
	const td = useTranslations("console.findings.discutir");
	const { currency } = useMcpData();
	const cardCurrency = finding.impact.currency || currency;

	const sev = finding.severity || "low";
	const dotClass = SEVERITY_DOT[sev] ?? SEVERITY_DOT.low;
	const borderClass = SEVERITY_BORDER[sev] ?? SEVERITY_BORDER.low;

	const min = finding.impact.monthly_range?.min ?? 0;
	const max = finding.impact.monthly_range?.max ?? 0;
	const role = finding.impact.role ?? "loss";
	const impactLabel = max > 0
		? `${fmtCurrencyUnits(min, cardCurrency, { zeroAsDash: true })} – ${fmtCurrencyUnits(max, cardCurrency, { zeroAsDash: true })}/mês`
		: null;
	const impactTone = role === "retention"
		? "text-emerald-600 dark:text-emerald-300"
		: "text-rose-600 dark:text-rose-300";

	// Buyer-friendly pack label. Falls back to the raw pack string if the
	// dict is missing the key (engineering packs added between releases).
	let packLabel = finding.pack;
	try {
		packLabel = tc(`pack_labels.${finding.pack}` as never) || finding.pack;
	} catch {
		// dict miss — keep raw value
	}

	const remediationSteps = (finding as any).remediation_steps as string[] | undefined;
	const hasExpandableBody = !!(finding.root_cause || (remediationSteps && remediationSteps.length > 0));

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
				{/* Severity dot — single visual cue. The full word
				    (Critical/Alto/Medium) lives in the dictionary table
				    view; in cards mode the color carries the meaning. */}
				<span
					className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
					aria-label={sev}
				/>

				<div className="min-w-0 flex-1">
					<div className="text-[14px] font-semibold leading-tight text-content sm:text-[15px]">
						{finding.title}
					</div>
					<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-content-muted">
						<span>{packLabel}</span>
						{finding.surface && (
							<>
								<span className="text-content-faint">·</span>
								<span className="truncate font-mono text-[11px]">{finding.surface}</span>
							</>
						)}
					</div>
					{impactLabel && (
						<div className={`mt-2 font-mono text-[13px] font-semibold tabular-nums ${impactTone}`}>
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
							{finding.root_cause && (
								<div className="mb-4">
									<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
										Por que está vazando
									</div>
									<p className="text-[13px] leading-relaxed text-content-secondary">
										{finding.root_cause}
									</p>
								</div>
							)}

							{remediationSteps && remediationSteps.length > 0 && (
								<div className="mb-4">
									<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
										Como corrigir
									</div>
									<ol className="space-y-1.5">
										{remediationSteps.slice(0, 5).map((step, i) => (
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
								{onCreateAction && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											void onCreateAction(finding);
										}}
										disabled={creatingAction}
										className="rounded-md bg-content px-3 py-1.5 text-[12px] font-medium text-surface-card transition-colors hover:bg-content-secondary disabled:opacity-50"
									>
										{creatingAction ? td("creating") : "Criar ação"}
									</button>
								)}
								{onDiscuss && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onDiscuss(finding);
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
