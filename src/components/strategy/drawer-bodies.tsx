"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { humanizeSurfaceLabel } from "@/lib/surface-label";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
	FindingProjection,
	ActionProjection,
} from "../../../packages/projections";
import { buildFindingBackUrl, type DrawerCtx } from "./plan-url";

// ──────────────────────────────────────────────
// Drawer content bodies — composable inside PlanSideDrawer.
//
// Both bodies pull from the McpDataProvider (already loaded on the
// layout) so no client-side fetch is needed and the drawer paints
// instantly. Previously ActionDrawer consumed a MOCK_LINKED_ACTIONS
// dictionary that never got swapped to real data — every "Ver ações
// relacionadas" rendered "0 actions encontradas" because mock IDs
// didn't match real Action IDs. Fixed here by reading
// useMcpData().actions / .findings.
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

const SEVERITY_LABEL: Record<string, string> = {
	critical: "crítica",
	high: "alta",
	medium: "média",
	low: "baixa",
	none: "—",
};

// ──────────────────────────────────────────────
// ActionListBody
// ──────────────────────────────────────────────

// Reta-final: previously this component read MCP's current-cycle actions
// snapshot and filtered by id. That broke for plans generated from older
// cycles because Action.id rotates per cycle. Now the plan API embeds
// the resolved Action objects directly into each step (NextStep.linkedActions),
// so the drawer just renders them — no MCP cross-reference needed.

interface LinkedActionSummary {
	id: string;
	title: string;
	description: string;
	severity: string;
	category: string;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
}

interface ActionListProps {
	/** Server-resolved Action objects from NextStep.linkedActions. */
	linkedActions?: LinkedActionSummary[];
	/** Legacy: original ID refs from the plan. Used only when
	 *  linkedActions is undefined (pre-fix plans) so we still degrade
	 *  to the MCP path for backward compat. */
	actionIds?: string[];
}

export function ActionListBody({ linkedActions, actionIds }: ActionListProps) {
	const mcp = useMcpData();
	const { currency } = mcp;

	// Prefer server-resolved objects.
	let rows: LinkedActionSummary[] = linkedActions ?? [];

	// Backward-compat fallback: try to enrich via MCP for callers that
	// still pass actionIds without linkedActions.
	if (rows.length === 0 && actionIds && actionIds.length > 0) {
		const all = mcp.actions.status === "ready" ? mcp.actions.data : [];
		const wanted = new Set(actionIds);
		const matched: ActionProjection[] = all.filter((a) => wanted.has(a.id));
		rows = matched.map((a) => ({
			id: a.id,
			title: a.title,
			description: a.description,
			severity: a.severity,
			category: a.category,
			impactMin: a.impact?.monthly_range?.min ?? 0,
			impactMax: a.impact?.monthly_range?.max ?? 0,
			impactMidpoint: a.impact?.midpoint ?? 0,
		}));
	}

	if (rows.length === 0) {
		const requested = (linkedActions?.length ?? 0) + (actionIds?.length ?? 0);
		return (
			<EmptyState
				headline="Nenhuma ação encontrada"
				body={
					requested === 0
						? "Esse passo ainda não tem ações ligadas."
						: "As ações deste passo podem ter sido arquivadas ou fundidas em outra fila."
				}
			/>
		);
	}

	return (
		<ul className="space-y-3">
			{rows.map((action, idx) => (
				<motion.li
					key={action.id}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.05 * idx, duration: 0.25 }}
					className={`overflow-hidden rounded-2xl border bg-surface-card p-4 ${
						SEVERITY_BORDER[action.severity] ?? SEVERITY_BORDER.low
					}`}
				>
					<div className="flex items-start gap-3">
						<span
							className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
								SEVERITY_DOT[action.severity] ?? SEVERITY_DOT.low
							}`}
							aria-label={action.severity}
						/>
						<div className="min-w-0 flex-1">
							<h3 className="text-[14px] font-semibold leading-snug text-content">
								{action.title}
							</h3>
							<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-content-muted">
								<span className="capitalize">{SEVERITY_LABEL[action.severity] ?? action.severity}</span>
								<span className="text-content-faint">·</span>
								<span>{action.category}</span>
							</div>
							{action.impactMidpoint > 0 && (
								<div className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-rose-600 dark:text-rose-300">
									{fmtCurrencyUnits(action.impactMidpoint, currency, { zeroAsDash: true })}
									<span className="text-[10px] font-normal text-content-faint">{" "}/mês</span>
								</div>
							)}
						</div>
					</div>
					{action.description && (
						<p className="mt-3 border-t border-edge pt-3 font-serif text-[13px] leading-[1.6] text-content-secondary">
							{action.description}
						</p>
					)}
				</motion.li>
			))}
		</ul>
	);
}

// ──────────────────────────────────────────────
// FindingListBody — used by step drill-down + sample-finding click
// ──────────────────────────────────────────────

interface FindingListProps {
	findingIds: string[];
	/** Optional — when present, each card's "Abrir ficha completa" link
	 *  embeds a back URL that re-opens the same drawer + expands the same
	 *  card on return. Parent (BuyerSegments / NextSteps) owns the
	 *  drawer state and supplies the context. */
	month?: string;
	parentCtx?: DrawerCtx | null;
	returnLabel?: string;
	/** inferenceKey of the card that should mount expanded. The parent
	 *  reads this from the URL hash on mount and passes it in. */
	defaultExpandedKey?: string | null;
	/** Notify parent when expansion changes so the URL hash stays in
	 *  sync with the user's current view. */
	onExpandedChange?: (key: string | null) => void;
}

// Re-translate an engine string at render time using the dict in the
// current request locale. Engine writes finding text in the locale that
// was loaded when the audit ran; if the audit ran in English (legacy
// envs, missed locale propagation), this is the rescue path that still
// shows the right title on a pt-BR plan. Falls back to the projection
// value when no translation exists.
function useEngineTranslator() {
	const tEngine = useTranslations("engine");
	return {
		title: (inferenceKey: string, fallback: string) => {
			if (tEngine.has(`inference_titles.${inferenceKey}`)) {
				return tEngine(`inference_titles.${inferenceKey}`);
			}
			if (tEngine.has(`dynamic_titles.${inferenceKey}`)) {
				const dyn = tEngine(`dynamic_titles.${inferenceKey}`);
				if (!dyn.includes("{")) return dyn;
			}
			if (tEngine.has(`root_cause_titles.${inferenceKey}`)) {
				return tEngine(`root_cause_titles.${inferenceKey}`);
			}
			// Defensive fallback: when fallback IS the raw inference_key
			// (some legacy stored plans persisted the snake_case key as the
			// finding title), at least humanize to Title Case so the
			// customer doesn't see "trust boundary crossed".
			if (/^[a-z][a-z0-9_]+$/.test(fallback)) {
				return fallback
					.replace(/_/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase());
			}
			return fallback;
		},
		rootCause: (inferenceKey: string, fallback: string | null) => {
			if (tEngine.has(`root_cause_titles.${inferenceKey}`)) {
				return tEngine(`root_cause_titles.${inferenceKey}`);
			}
			return fallback;
		},
	};
}

export function FindingListBody({
	findingIds,
	month,
	parentCtx,
	returnLabel,
	defaultExpandedKey,
	onExpandedChange,
}: FindingListProps) {
	const mcp = useMcpData();
	const { currency } = mcp;
	const findingsReady = mcp.findings.status === "ready";
	const all = findingsReady ? mcp.findings.data : [];
	// Match by id OR inference_key. The plan generator now stores
	// inferenceKey strings (stable across cycles) instead of DB UUIDs,
	// but legacy plans still carry projection ids like
	// `finding_<inferenceKey>_<suffix>` — accepting both keeps both
	// shapes resolving without an extra migration step.
	const wanted = new Set(findingIds);
	const matched: FindingProjection[] = all
		.filter((f) => wanted.has(f.id) || wanted.has(f.inference_key))
		// Drop positives — the plan's drawer is about "problems to fix",
		// not state-of-health checks. Positives belong on /app/findings
		// with their own UI affordances.
		.filter((f) => f.polarity !== "positive")
		// Sort by impact descending so the highest-leverage card lands at
		// the top.
		.sort((a, b) => (b.impact?.midpoint ?? 0) - (a.impact?.midpoint ?? 0));

	// MCP findings still loading from the layout / refresh in flight.
	// Show a shimmer instead of jumping straight to "Problemas
	// indisponíveis" — the empty-state copy reads as "this problem was
	// resolved" but the actual cause is "we haven't checked yet". The
	// plan page's router.refresh() on mount typically resolves within
	// one streaming round-trip; this skeleton bridges that window.
	if (!findingsReady && findingIds.length > 0) {
		return (
			<ul className="space-y-3" aria-busy="true" aria-live="polite">
				{[0, 1, 2].slice(0, Math.min(findingIds.length, 3)).map((i) => (
					<li
						key={i}
						className="h-24 w-full animate-pulse rounded-2xl bg-surface-card"
					/>
				))}
			</ul>
		);
	}

	if (matched.length === 0) {
		return (
			<EmptyState
				headline="Problemas indisponíveis"
				body={
					findingIds.length === 0
						? "Esse passo não carrega problemas linkados (plano gerado antes da Phase 2)."
						: "Os problemas deste passo não aparecem no ciclo atual, provavelmente foram resolvidos ou regrediram desde então."
				}
			/>
		);
	}

	return (
		<ul className="space-y-3">
			{matched.map((finding, idx) => (
				<FindingCard
					key={finding.id}
					finding={finding}
					currency={currency}
					idx={idx}
					month={month}
					parentCtx={parentCtx}
					returnLabel={returnLabel}
					defaultOpen={
						defaultExpandedKey === finding.inference_key ||
						defaultExpandedKey === finding.id
					}
					onOpenChange={(open) => {
						if (!onExpandedChange) return;
						onExpandedChange(open ? finding.inference_key : null);
					}}
				/>
			))}
		</ul>
	);
}

// ──────────────────────────────────────────────
// Individual finding card — collapsible. Header is fixed-height when
// closed (uniform list); expanded body surfaces the rich detail that
// matches /app/findings drawer affordances: impact box, root cause,
// reasoning, remediation preview, linked actions, deep link.
// ──────────────────────────────────────────────

interface FindingCardProps {
	finding: FindingProjection;
	currency: string;
	idx: number;
	month?: string;
	parentCtx?: DrawerCtx | null;
	returnLabel?: string;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function FindingCard({
	finding,
	currency,
	idx,
	month,
	parentCtx,
	returnLabel,
	defaultOpen = false,
	onOpenChange,
}: FindingCardProps) {
	const [open, setOpen] = useState(defaultOpen);
	// Sync internal open with prop changes (when user navigates back from
	// the finding-detail page, defaultOpen flips from false to true and
	// we need to mirror that — useState only reads the initial value).
	useEffect(() => {
		setOpen(defaultOpen);
	}, [defaultOpen]);
	const t = useEngineTranslator();

	const title = t.title(finding.inference_key, finding.title);
	const rootCause = t.rootCause(finding.inference_key, finding.root_cause);
	const min = finding.impact?.monthly_range?.min ?? 0;
	const max = finding.impact?.monthly_range?.max ?? 0;
	const mid = finding.impact?.midpoint ?? 0;
	const role = finding.impact?.role ?? "loss";
	const impactLabel =
		max > 0
			? `${fmtCurrencyUnits(min, currency, { zeroAsDash: true })} – ${fmtCurrencyUnits(max, currency, { zeroAsDash: true })}`
			: null;
	const impactTone =
		role === "retention"
			? "text-emerald-600 dark:text-emerald-300"
			: "text-rose-600 dark:text-rose-300";

	const linkedActions = finding.action_refs ?? [];
	const remediationPreview = (finding.remediation_steps ?? []).slice(0, 3);

	// Header-level deep link, in addition to the "Abrir ficha completa"
	// button inside the expanded body. The tester reported wanting any
	// finding in the plan to be one click away from the detail page;
	// requiring expand-then-scroll-then-click was friction.
	const detailUrl = (() => {
		const base = `/app/findings/${finding.id}`;
		if (!month || !parentCtx) return base;
		const back = buildFindingBackUrl({
			month,
			ctx: parentCtx,
			expand: finding.inference_key,
		});
		const params = new URLSearchParams();
		params.set("back", back);
		if (returnLabel) params.set("backLabel", returnLabel);
		return `${base}?${params.toString()}`;
	})();

	return (
		<motion.li
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.04 * idx, duration: 0.25 }}
			className={`overflow-hidden rounded-2xl border bg-surface-card ${
				SEVERITY_BORDER[finding.severity] ?? SEVERITY_BORDER.low
			}`}
		>
			<Collapsible.Root
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					onOpenChange?.(next);
				}}
			>
				{/* Header — split into [expand trigger] + [detail link]
				    so the customer can either drill in-place (expand) or
				    jump straight to the canonical /app/findings/[id]
				    detail page without first expanding. */}
				<div className="flex items-stretch">
					<Collapsible.Trigger asChild>
						<button
							type="button"
							className="grid flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 p-4 text-left transition-colors hover:bg-surface-card-hover/40"
						>
							<span
								className={`h-2.5 w-2.5 shrink-0 rounded-full ${
									SEVERITY_DOT[finding.severity] ?? SEVERITY_DOT.low
								}`}
								aria-label={finding.severity}
							/>
							<div className="min-w-0">
								<h3 className="truncate text-[14px] font-semibold leading-snug text-content">
									{title}
								</h3>
								<div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[11px] text-content-muted">
									<span className="capitalize">
										{SEVERITY_LABEL[finding.severity] ?? finding.severity}
									</span>
									{finding.surface && (
										<>
											<span className="text-content-faint">·</span>
											<span className="truncate text-[10.5px]">
												{humanizeSurfaceLabel(finding.surface)}
											</span>
										</>
									)}
									{impactLabel && (
										<>
											<span className="text-content-faint">·</span>
											<span className={`font-mono tabular-nums ${impactTone}`}>
												{impactLabel}/mês
											</span>
										</>
									)}
								</div>
								{/* Wave 22.9 · Bloco 1.4 — 1-line description on
								    the collapsed card. Tester flagged: "os
								    findings não tem explicação ou descrição,
								    somente título." rootCause is the shortest
								    buyer-facing sentence the engine emits per
								    finding. Truncated with line-clamp so long
								    root causes still fit the header shell. Only
								    shows when collapsed — the expanded body
								    already carries the full detail. */}
								{!open && rootCause && (
									<p className="mt-1.5 line-clamp-2 text-left text-[12px] font-normal leading-snug text-content-secondary">
										{rootCause}
									</p>
								)}
							</div>
							<ChevronDown
								className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${open ? "rotate-180" : ""}`}
							/>
						</button>
					</Collapsible.Trigger>
					<Link
						href={detailUrl}
						aria-label="Abrir ficha completa do problema"
						title="Abrir ficha completa"
						className="flex shrink-0 items-center border-l border-edge px-3 text-content-muted transition-colors hover:bg-surface-card-hover/40 hover:text-content focus-visible:bg-surface-card-hover/40 focus-visible:text-content focus-visible:outline-none"
					>
						<ExternalLink className="h-3.5 w-3.5" />
					</Link>
				</div>

				{/* Expanded — rich detail. Mirrors /app/findings drawer
				    structure so the customer doesn't lose context jumping
				    between surfaces. */}
				<AnimatePresence>
					{open && (
						<Collapsible.Content asChild forceMount>
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
								className="overflow-hidden border-t border-edge"
							>
								<div className="space-y-4 p-4">
									{/* Impact box — the "what does this cost" row */}
									{mid > 0 && (
										<div className="rounded-xl border border-edge bg-surface-inset/40 p-3">
											<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
												{role === "retention" ? "Retido" : "Exposição"} estimada
											</div>
											<div
												className={`mt-1 font-mono text-[18px] font-semibold tabular-nums ${impactTone}`}
											>
												{fmtCurrencyUnits(mid, currency)}
												<span className="ml-1 text-[11px] font-normal text-content-faint">
													/mês
												</span>
											</div>
											{impactLabel && (
												<div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-content-faint">
													faixa {impactLabel}
												</div>
											)}
										</div>
									)}

									{/* Root cause */}
									{rootCause && (
										<div>
											<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
												Por que está vazando
											</div>
											<p className="font-serif text-[13px] leading-[1.6] text-content-secondary">
												{rootCause}
											</p>
										</div>
									)}

									{/* Reasoning (engine narrative) */}
									{finding.reasoning && finding.reasoning !== rootCause && (
										<div>
											<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
												O que detectamos
											</div>
											<p className="font-serif text-[13px] leading-[1.6] text-content-secondary">
												{finding.reasoning}
											</p>
										</div>
									)}

									{/* Remediation preview */}
									{remediationPreview.length > 0 && (
										<div>
											<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
												Como resolver
											</div>
											<ol className="ml-4 list-decimal space-y-1 text-[13px] leading-snug text-content-secondary">
												{remediationPreview.map((step, i) => (
													<li key={i}>{step}</li>
												))}
											</ol>
											{(finding.remediation_steps ?? []).length > 3 && (
												<div className="mt-1 text-[11px] italic text-content-faint">
													+ {(finding.remediation_steps ?? []).length - 3}{" "}
													passos adicionais na ficha completa.
												</div>
											)}
										</div>
									)}

									{/* Linked actions */}
									{linkedActions.length > 0 && (
										<div>
											<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
												Ações linkadas
											</div>
											<ul className="space-y-1 text-[12px] text-content-secondary">
												{linkedActions.slice(0, 3).map((a) => (
													<li key={a.id} className="flex items-baseline gap-2">
														<span className="text-content-faint">·</span>
														<span className="flex-1 truncate">{a.title}</span>
														{a.status && (
															<span className="rounded-md bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-content-muted">
																{a.status}
															</span>
														)}
													</li>
												))}
											</ul>
										</div>
									)}

									{/* Footer — deep link to the canonical finding page */}
									<div className="flex items-center justify-between border-t border-edge pt-3">
										<div className="text-[10px] text-content-faint">
											{finding.data_freshness === "fresh"
												? "Evidência recente"
												: finding.data_freshness === "stale"
													? "Evidência mais antiga, vale re-verificar"
													: ""}
										</div>
										<Link
											href={detailUrl}
											className="inline-flex items-center gap-1 text-[12px] font-medium text-content-secondary underline-offset-4 transition-colors hover:text-content hover:underline"
										>
											Abrir ficha completa
											<ExternalLink className="h-3 w-3" />
										</Link>
									</div>
								</div>
							</motion.div>
						</Collapsible.Content>
					)}
				</AnimatePresence>
			</Collapsible.Root>
		</motion.li>
	);
}

// ──────────────────────────────────────────────
// Shared empty state — editorial treatment matching the mini-audit
// ──────────────────────────────────────────────

function EmptyState({ headline, body }: { headline: string; body: string }) {
	return (
		<div className="rounded-2xl border border-dashed border-edge bg-surface-card/40 p-8 text-center">
			<h3 className="font-serif text-[16px] font-medium text-content">{headline}</h3>
			<p className="mt-2 text-[13px] leading-relaxed text-content-muted">{body}</p>
		</div>
	);
}
