"use client";

import { motion } from "framer-motion";
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

export function FindingListBody({ findingIds }: FindingListProps) {
	const mcp = useMcpData();
	const { currency } = mcp;
	const all =
		mcp.findings.status === "ready" ? mcp.findings.data : [];
	// Match by id OR inference_key. The plan generator now stores
	// inferenceKey strings (stable across cycles) instead of DB UUIDs,
	// but legacy plans still carry projection ids like
	// `finding_<inferenceKey>_<suffix>` — accepting both keeps both
	// shapes resolving without an extra migration step.
	const wanted = new Set(findingIds);
	const matched: FindingProjection[] = all.filter(
		(f) => wanted.has(f.id) || wanted.has(f.inference_key),
	);

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
			{matched.map((finding, idx) => {
				const min = finding.impact?.monthly_range?.min ?? 0;
				const max = finding.impact?.monthly_range?.max ?? 0;
				const role = finding.impact?.role ?? "loss";
				const impactLabel =
					max > 0
						? `${fmtCurrencyUnits(min, currency, { zeroAsDash: true })} – ${fmtCurrencyUnits(max, currency, { zeroAsDash: true })}/mês`
						: null;
				const impactTone =
					role === "retention"
						? "text-emerald-600 dark:text-emerald-300"
						: "text-rose-600 dark:text-rose-300";

				return (
					<motion.li
						key={finding.id}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.05 * idx, duration: 0.25 }}
						className={`overflow-hidden rounded-2xl border bg-surface-card p-4 ${
							SEVERITY_BORDER[finding.severity] ?? SEVERITY_BORDER.low
						}`}
					>
						<div className="flex items-start gap-3">
							<span
								className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
									SEVERITY_DOT[finding.severity] ?? SEVERITY_DOT.low
								}`}
								aria-label={finding.severity}
							/>
							<div className="min-w-0 flex-1">
								<h3 className="text-[14px] font-semibold leading-snug text-content">
									{finding.title}
								</h3>
								<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-content-muted">
									<span className="capitalize">
										{SEVERITY_LABEL[finding.severity] ?? finding.severity}
									</span>
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
						</div>
						{finding.root_cause && (
							<div className="mt-3 border-t border-edge pt-3">
								<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Por que está vazando
								</div>
								<p className="font-serif text-[13px] leading-[1.6] text-content-secondary">
									{finding.root_cause}
								</p>
							</div>
						)}
					</motion.li>
				);
			})}
		</ul>
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
