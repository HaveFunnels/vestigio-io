"use client";

import { useState, useRef, useEffect } from "react";

// ──────────────────────────────────────────────
// MethodologyPopover — Wave-22.6 review fix UC1
//
// "How was this number calculated?" expandable rendered next to
// every money figure (ImpactBadge, MoneyOnTheTable hero, Strategy
// Plan HeroMetrics, dashboard KPI widgets). Surfaces internal state
// the engine already computes but never renders:
//
//   - min/max range (not just midpoint)
//   - basis_type: 'data_driven' | 'mixed' | 'heuristic' — and the
//     one-liner explanation of what each means
//   - The baseline % range used (10-25% of monthly revenue, etc.)
//   - Which BusinessInputs are real vs FALLBACK_INPUTS placeholders
//
// Triggered by a small "ⓘ" button. Click outside or Esc closes.
// Pure CSS positioning (no portal) so it inherits the parent's
// stacking context — keeps it simple inside drawers / cards.
// ──────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
	USD: "$",
	BRL: "R$",
	EUR: "€",
};

const BASIS_LABELS: Record<string, { label_pt: string; explain_pt: string }> = {
	data_driven: {
		label_pt: "Dados reais",
		explain_pt:
			"Calculado a partir dos seus inputs de negócio reais (faturamento mensal, AOV, conversão). Maior confiança.",
	},
	mixed: {
		label_pt: "Misto",
		explain_pt:
			"Alguns inputs do seu negócio + alguns baselines de categoria. Confiança intermediária.",
	},
	heuristic: {
		label_pt: "Heurístico",
		explain_pt:
			"Onboarding incompleto — usando perfil SMB padrão (R$ 50k/mês, AOV R$ 80, 625 transações). Atualize o perfil em Configurações para subir a confiança.",
	},
};

const BASIS_CHIP_CLASS: Record<string, string> = {
	data_driven: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
	mixed: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
	heuristic: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

function formatMoney(value: number, sym: string): string {
	if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}k`;
	return `${sym}${Math.round(value)}`;
}

function formatPct(p: number): string {
	return `${(p * 100).toFixed(0)}%`;
}

export interface MethodologyData {
	/** Min of the estimate range (raw cents/units, same as max). */
	min: number;
	/** Max of the estimate range. */
	max: number;
	/** Currency code (USD / BRL / EUR). */
	currency?: string;
	/** Estimate basis — drives chip color + one-liner. Defaults to
	 *  'heuristic' when unknown. */
	basis_type?: string | null;
	/** Severity bucket that determined which % range was applied. */
	severity?: "critical" | "high" | "medium" | "low" | null;
	/** Optional baseline detail — when provided, the popover shows
	 *  "X% to Y% of <metric>" (e.g. "10% to 25% of monthly revenue").
	 *  All optional; popover degrades gracefully. */
	baseline_pct_range?: { min: number; max: number } | null;
	baseline_metric?:
		| "revenue"
		| "transactions"
		| "chargeback_rate"
		| "conversion_rate"
		| null;
	/** Optional human-readable cause/effect for the row (already shown
	 *  elsewhere in many UIs; included here for standalone use). */
	cause?: string | null;
	effect?: string | null;
}

interface MethodologyPopoverProps extends MethodologyData {
	/** Optional placement. Defaults to right of trigger. */
	placement?: "right" | "left" | "above" | "below";
	/** Optional label shown on the trigger. Defaults to just "ⓘ". */
	triggerLabel?: string;
	className?: string;
}

export default function MethodologyPopover(props: MethodologyPopoverProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const sym = CURRENCY_SYMBOLS[props.currency || "BRL"] || "$";
	const basis = (props.basis_type ?? "heuristic") as keyof typeof BASIS_LABELS;
	const basisInfo = BASIS_LABELS[basis] ?? BASIS_LABELS.heuristic;
	const chipClass = BASIS_CHIP_CLASS[basis] ?? BASIS_CHIP_CLASS.heuristic;

	const placementClass =
		props.placement === "left"
			? "right-full mr-2 top-0"
			: props.placement === "above"
				? "bottom-full mb-2 left-0"
				: props.placement === "below"
					? "top-full mt-2 left-0"
					: "left-full ml-2 top-0";

	return (
		<span
			ref={containerRef}
			className={`relative inline-flex items-center ${props.className ?? ""}`}
		>
			<button
				type="button"
				aria-label="Como esse número foi calculado?"
				onClick={(e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				}}
				className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge bg-surface-card text-[10px] font-medium text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
			>
				{props.triggerLabel ?? "i"}
			</button>
			{open && (
				<div
					role="dialog"
					className={`absolute z-50 w-72 rounded-lg border border-edge bg-surface-card p-3 text-[12px] shadow-lg ${placementClass}`}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="font-medium text-content">Como esse número foi calculado</div>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="text-content-faint hover:text-content"
							aria-label="Fechar"
						>
							×
						</button>
					</div>

					{/* Range */}
					<div className="mb-3 rounded-md border border-edge bg-surface-subtle px-2.5 py-1.5">
						<div className="text-[10px] uppercase tracking-wider text-content-faint">
							Intervalo estimado
						</div>
						<div className="mt-0.5 font-mono text-[13px] text-content">
							{formatMoney(props.min, sym)} — {formatMoney(props.max, sym)}
							<span className="ml-1 text-[10px] text-content-muted">/mês</span>
						</div>
						<div className="mt-0.5 text-[10px] text-content-muted">
							Midpoint: {formatMoney((props.min + props.max) / 2, sym)}
						</div>
					</div>

					{/* Basis chip + explanation */}
					<div className="mb-2 space-y-1">
						<div className="flex items-center gap-2">
							<span
								className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${chipClass}`}
							>
								{basisInfo.label_pt}
							</span>
							{props.severity && (
								<span className="text-[10px] uppercase tracking-wider text-content-faint">
									Severidade: {props.severity}
								</span>
							)}
						</div>
						<p className="text-[11px] leading-snug text-content-muted">
							{basisInfo.explain_pt}
						</p>
					</div>

					{/* Baseline % rule used */}
					{props.baseline_pct_range && props.baseline_metric && (
						<div className="mb-2 rounded-md border border-edge bg-surface-subtle px-2.5 py-1.5">
							<div className="text-[10px] uppercase tracking-wider text-content-faint">
								Regra base
							</div>
							<div className="mt-0.5 text-[11px] text-content">
								{formatPct(props.baseline_pct_range.min)} —{" "}
								{formatPct(props.baseline_pct_range.max)} de{" "}
								<span className="font-medium">
									{props.baseline_metric === "revenue"
										? "faturamento mensal"
										: props.baseline_metric === "transactions"
											? "transações mensais × AOV"
											: props.baseline_metric === "chargeback_rate"
												? "taxa de chargeback"
												: "conversão"}
								</span>
							</div>
						</div>
					)}

					{/* Cause / effect */}
					{(props.cause || props.effect) && (
						<div className="border-t border-edge pt-2 text-[11px] leading-snug text-content-muted">
							{props.cause && (
								<div>
									<span className="text-content-faint">Causa: </span>
									{props.cause}
								</div>
							)}
							{props.effect && (
								<div className="mt-0.5">
									<span className="text-content-faint">Efeito: </span>
									{props.effect}
								</div>
							)}
						</div>
					)}

					{basis === "heuristic" && (
						<div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-2.5 py-1.5">
							<a
								href="/app/settings#business-inputs"
								className="text-[11px] font-medium text-amber-600 hover:underline dark:text-amber-400"
							>
								Atualizar perfil de negócio →
							</a>
						</div>
					)}
				</div>
			)}
		</span>
	);
}

// ──────────────────────────────────────────────
// AggregateMethodologyPopover — variant for KPI tiles
//
// Strategy Plan HeroMetrics, MoneyOnTheTable hero, and dashboard
// money KPI widgets show SUMS of midpoints, not single ranges. They
// can't surface basis_type per-finding because the tile aggregates
// across many. This variant explains what the aggregate IS, where
// the math comes from, and (when provided) links to the underlying
// findings list filtered to the same slice.
// ──────────────────────────────────────────────

export interface AggregateMethodologyPopoverProps {
	/** Headline label for the popover (e.g. "Retido / mês"). */
	title: string;
	/** What this number represents in 1-2 plain sentences. */
	description: string;
	/** Number of findings contributing to the aggregate (if known). */
	findingCount?: number | null;
	/** When known: aggregate min/max of the contributing findings.
	 *  Hero tiles only carry the midpoint sum today; future generator
	 *  versions can extend the HeroMetric shape with these. */
	aggregateRange?: { min: number; max: number } | null;
	currency?: string;
	/** Optional deep-link into a filtered findings list (e.g.
	 *  "/app/findings?polarity=positive" for retained). */
	drillHref?: string | null;
	/** Optional placement. Defaults to below trigger. */
	placement?: "right" | "left" | "above" | "below";
	className?: string;
}

export function AggregateMethodologyPopover(
	props: AggregateMethodologyPopoverProps,
) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const sym = CURRENCY_SYMBOLS[props.currency || "BRL"] || "$";
	const placementClass =
		props.placement === "right"
			? "left-full ml-2 top-0"
			: props.placement === "left"
				? "right-full mr-2 top-0"
				: props.placement === "above"
					? "bottom-full mb-2 left-0"
					: "top-full mt-2 left-0";

	return (
		<span
			ref={containerRef}
			className={`relative inline-flex items-center ${props.className ?? ""}`}
		>
			<button
				type="button"
				aria-label="Como esse número foi calculado?"
				onClick={(e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				}}
				className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-edge bg-surface-card text-[10px] font-medium text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
			>
				i
			</button>
			{open && (
				<div
					role="dialog"
					className={`absolute z-50 w-72 rounded-lg border border-edge bg-surface-card p-3 text-[12px] shadow-lg ${placementClass}`}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="font-medium text-content">{props.title}</div>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="text-content-faint hover:text-content"
							aria-label="Fechar"
						>
							×
						</button>
					</div>
					<p className="mb-2 text-[11px] leading-snug text-content-muted">
						{props.description}
					</p>
					{(props.aggregateRange || props.findingCount != null) && (
						<div className="mb-2 rounded-md border border-edge bg-surface-subtle px-2.5 py-1.5">
							{props.aggregateRange && (
								<>
									<div className="text-[10px] uppercase tracking-wider text-content-faint">
										Intervalo agregado
									</div>
									<div className="mt-0.5 font-mono text-[12px] text-content">
										{formatMoney(props.aggregateRange.min, sym)} —{" "}
										{formatMoney(props.aggregateRange.max, sym)}
										<span className="ml-1 text-[10px] text-content-muted">
											/mês
										</span>
									</div>
								</>
							)}
							{props.findingCount != null && (
								<div className="mt-1 text-[10px] text-content-muted">
									{props.findingCount} {props.findingCount === 1 ? "finding contribui" : "findings contribuem"}
								</div>
							)}
						</div>
					)}
					{props.drillHref && (
						<a
							href={props.drillHref}
							className="inline-block text-[11px] font-medium text-accent hover:underline"
						>
							Ver findings subjacentes →
						</a>
					)}
				</div>
			)}
		</span>
	);
}
