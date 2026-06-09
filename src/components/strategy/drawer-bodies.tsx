"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
	FindingProjection,
	ActionProjection,
} from "../../../packages/projections";

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

interface ActionListProps {
	actionIds: string[];
}

export function ActionListBody({ actionIds }: ActionListProps) {
	const mcp = useMcpData();
	const { currency } = mcp;
	const all =
		mcp.actions.status === "ready" ? mcp.actions.data : [];
	const wanted = new Set(actionIds);
	const matched: ActionProjection[] = all.filter((a) => wanted.has(a.id));

	if (matched.length === 0) {
		return (
			<EmptyState
				headline="Nenhuma ação encontrada"
				body={
					actionIds.length === 0
						? "Esse passo ainda não tem ações ligadas."
						: "As ações deste passo podem ter sido arquivadas ou fundidas em outra fila."
				}
			/>
		);
	}

	return (
		<ul className="space-y-3">
			{matched.map((action, idx) => (
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
								{action.effort_hint && (
									<>
										<span className="text-content-faint">·</span>
										<span>esforço {action.effort_hint}</span>
									</>
								)}
							</div>
							{action.impact?.midpoint != null && action.impact.midpoint > 0 && (
								<div className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-rose-600 dark:text-rose-300">
									{fmtCurrencyUnits(action.impact.midpoint, currency, { zeroAsDash: true })}
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

export function FindingListBody({ findingIds }: FindingListProps) {
	const mcp = useMcpData();
	const { currency } = mcp;
	const all = mcp.findings.status === "ready" ? mcp.findings.data : [];
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

	if (matched.length === 0) {
		return (
			<EmptyState
				headline="Problemas indisponíveis"
				body={
					findingIds.length === 0
						? "Esse passo não carrega problemas linkados (plano gerado antes da Phase 2)."
						: "Os problemas deste passo não aparecem no ciclo atual — provavelmente foram resolvidos ou regrediram desde então."
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
}

function FindingCard({ finding, currency, idx }: FindingCardProps) {
	const [open, setOpen] = useState(false);
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

	return (
		<motion.li
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.04 * idx, duration: 0.25 }}
			className={`overflow-hidden rounded-2xl border bg-surface-card ${
				SEVERITY_BORDER[finding.severity] ?? SEVERITY_BORDER.low
			}`}
		>
			<Collapsible.Root open={open} onOpenChange={setOpen}>
				{/* Header — always shown, uniform height across cards. */}
				<Collapsible.Trigger asChild>
					<button
						type="button"
						className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-4 text-left transition-colors hover:bg-surface-card-hover/40"
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
										<span className="truncate font-mono text-[10.5px]">
											{finding.surface}
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
						</div>
						<ChevronDown
							className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${open ? "rotate-180" : ""}`}
						/>
					</button>
				</Collapsible.Trigger>

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
													? "Evidência mais antiga — vale re-verificar"
													: ""}
										</div>
										<Link
											href={`/app/findings/${finding.id}`}
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
