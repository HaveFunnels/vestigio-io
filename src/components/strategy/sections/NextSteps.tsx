"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type {
	NextStep,
	NextStepStatus,
	PlanComment,
	PendingPlanEdit,
} from "../types";
import PlanSideDrawer from "../PlanSideDrawer";
import { ActionListBody, FindingListBody } from "../drawer-bodies";
import { humanizeSurfaceLabel } from "@/lib/surface-label";
import {
	buildPlanHash,
	parsePlanHash,
	type DrawerCtx,
} from "../plan-url";
import PlanCommentThread from "../PlanCommentThread";
import PlanEditBanner from "../PlanEditBanner";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";
import { useCopilot } from "@/components/app/CopilotProvider";

/*
 * Next Steps — "Próximo passo, atacar nesta ordem"
 *
 * The composite descriptive + checklist section. Top 3 expanded by
 * default, +2 collapsed under "ver mais". Each card has:
 *   - Numbered badge in a left rail (Fraunces 700)
 *   - Title + combined impact pill in header row
 *   - "POR QUE PRIMEIRO" reasoning in Fraunces narrative voice
 *   - "COMO PROCEDER" numbered procedure steps
 *   - "PESQUISAR" research chip row
 *   - Effort + owner + due date + status + checkbox + comment count row
 *   - "Ver actions linkadas" trigger (Step 9 wires drawer; mock noop)
 */

interface Props {
	steps: NextStep[];
	/** Wave 22.6 Step 9 — collaboration props. Threaded comments per
	    step + inline edit banners. Required now that the mock
	    branch is gone — every caller routes a real backend plan. */
	comments: PlanComment[];
	pendingEdits: PendingPlanEdit[];
	canApprove: boolean;
	envId: string;
	month: string;
	planId: string;
	/** Wave 22.8 — Resumo (Executive Summary) mode. When true, renders
	 *  only the top 3 steps with compact-card treatment (title + impact
	 *  + status badge, no reasoning, no procedureSteps, no drawers).
	 *  Customer in a hurry reads the bet in seconds. */
	compact?: boolean;
	/** Reta-final "Por página" lens. When true, steps regroup by their
	 *  primary affectedSurface — each surface becomes a header card with
	 *  its steps under it. Cross-page steps surface "afeta também" badges
	 *  so the customer reads the systemic story even in operational mode.
	 *  Mutually exclusive with `compact` (Resumo never groups by page). */
	groupBySurface?: boolean;
}

const STATUS_LABEL: Record<NextStepStatus, string> = {
	todo: "A fazer",
	in_progress: "Em progresso",
	in_review: "Em revisão",
	done: "Feito",
	blocked: "Bloqueado",
};

const STATUS_TONE: Record<NextStepStatus, string> = {
	todo: "bg-surface-inset text-content-secondary ring-edge",
	in_progress: "bg-amber-500/10 text-amber-200/90 ring-amber-500/20",
	in_review: "bg-sky-500/10 text-sky-200/90 ring-sky-500/20",
	done: "bg-emerald-500/10 text-emerald-200/90 ring-emerald-500/20",
	blocked: "bg-rose-500/10 text-rose-200/90 ring-rose-500/20",
};

function renderInline(text: string) {
	const parts: ReactNode[] = [];
	const matches = Array.from(text.matchAll(/(\*\*[^*]+\*\*|`[^`]+`)/g));
	let lastIndex = 0;
	let key = 0;
	for (const m of matches) {
		const idx = m.index ?? 0;
		if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
		const token = m[0];
		if (token.startsWith("**")) {
			parts.push(
				<strong key={key++} className="font-semibold text-content">
					{token.slice(2, -2)}
				</strong>,
			);
		} else if (token.startsWith("`")) {
			parts.push(
				<code
					key={key++}
					className="rounded bg-surface-inset px-1 py-0.5 font-mono text-[0.92em]"
				>
					{token.slice(1, -1)}
				</code>,
			);
		}
		lastIndex = idx + token.length;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

interface StepCardProps {
	step: NextStep;
	comments: PlanComment[];
	pendingEdit?: PendingPlanEdit;
	canApprove: boolean;
	envId: string;
	month: string;
	planId: string;
	/**
	 * Wave 22.9 · Bloco 1 — total number of steps in the plan, so the
	 * eyebrow label can name the step's ROLE in the sequence rather
	 * than hardcoding "Por que primeiro" on all of them. Tester
	 * flagged: "todos os findings mostram 'Por que primeiro', sendo que
	 * só um pode ser o primeiro."
	 */
	totalSteps: number;
}

// Position-aware eyebrow labels per the page-cro council seat. Each
// step names its ROLE in the sequence (compounding dependency, quick
// win, cycle-trap) instead of the universal "Por que primeiro" lie.
// Last-step gets a distinct label regardless of index so plans with
// 3 or 4 steps still land the closing tension.
function eyebrowForPosition(order: number, totalSteps: number): string {
	if (order === 1) return "Por que este movimento primeiro";
	if (order === totalSteps) return "Por que este não pode esperar o próximo mês";
	if (order === 2) return "Por que este vem depois";
	if (order === 3) return "Por que este entra agora";
	return "Por que este fecha o ciclo";
}

// ──────────────────────────────────────────────
// StakesPopover — hover state que converte o midpoint mensal
// em narrativa de stakes acumulados. Renderiza absoluto à esquerda
// do pill (right-full) para não invadir o conteúdo do step. Pure
// CSS visibility via group-hover; sem state React, sem onMouseEnter/
// Leave — evita janks de mount/unmount + dá fade-in suave.
// ──────────────────────────────────────────────
function StakesPopover({ monthly, currency }: { monthly: number; currency: string }) {
	const weekly = monthly / 4.33;
	const m3 = monthly * 3;
	const m6 = monthly * 6;
	const m12 = monthly * 12;
	const fmt = (v: number) => fmtCurrencyUnits(v, currency, { zeroAsDash: true });
	return (
		<div
			className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[280px] rounded-xl border border-edge bg-surface-card p-4 opacity-0 shadow-xl ring-1 ring-edge/40 transition-all duration-150 group-hover/stakes:pointer-events-auto group-hover/stakes:translate-y-0 group-hover/stakes:opacity-100"
			role="tooltip"
		>
			<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
				Custo de procrastinar
			</div>
			<div className="space-y-1.5 font-mono text-[12px] tabular-nums">
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-content-muted">3 meses aberto</span>
					<span className="font-semibold text-content">{fmt(m3)}</span>
				</div>
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-content-muted">6 meses aberto</span>
					<span className="font-semibold text-content">{fmt(m6)}</span>
				</div>
				<div className="flex items-baseline justify-between gap-3 border-t border-edge/40 pt-1.5">
					<span className="text-content-muted">12 meses aberto</span>
					<span className="font-semibold text-rose-400">{fmt(m12)}</span>
				</div>
			</div>
			<div className="mt-3 border-t border-edge/40 pt-2.5 text-[11px] leading-snug text-content-secondary">
				Cada semana que passa adiciona{" "}
				<span className="font-mono font-semibold tabular-nums text-content">
					{fmt(weekly)}
				</span>{" "}
				não-recuperáveis.
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// StatusDropdown — bespoke popover replacing the native <select> so
// the trigger + menu match the rest of the plan visual language
// (rounded-xl surface card, severity-tone hover, no user-agent
// chrome). Closes on outside click + Escape + selection.
// ──────────────────────────────────────────────
function StatusDropdown({
	status,
	onChange,
}: {
	status: NextStepStatus;
	onChange: (next: NextStepStatus) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (!ref.current?.contains(e.target as Node)) setOpen(false);
		}
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKey);
		};
	}, [open]);

	return (
		<div ref={ref} className="relative inline-block">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition-colors ${STATUS_TONE[status]}`}
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<span>{STATUS_LABEL[status]}</span>
				<svg
					className={`h-3 w-3 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
					viewBox="0 0 12 12"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
				>
					<path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</button>
			{open && (
				<div
					role="listbox"
					className="absolute left-0 top-full z-30 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-edge bg-surface-card shadow-lg ring-1 ring-edge/40"
				>
					{(Object.keys(STATUS_LABEL) as NextStepStatus[]).map((s) => (
						<button
							key={s}
							type="button"
							role="option"
							aria-selected={s === status}
							onClick={() => {
								onChange(s);
								setOpen(false);
							}}
							className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-card-hover ${
								s === status ? "bg-surface-card-hover text-content" : "text-content-secondary"
							}`}
						>
							<span
								className={`inline-block h-1.5 w-1.5 rounded-full ${
									s === "done"
										? "bg-emerald-400"
										: s === "in_progress"
											? "bg-amber-400"
											: s === "in_review"
												? "bg-sky-400"
												: s === "blocked"
													? "bg-rose-400"
													: "bg-content-faint"
								}`}
							/>
							{STATUS_LABEL[s]}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function StepCard({
	step,
	comments,
	pendingEdit,
	canApprove,
	envId,
	month,
	planId,
	totalSteps,
}: StepCardProps) {
	// Phase 3.1 — inline edit. status / title / dueAt are now
	// server-persisted via PATCH on every change. Local state mirrors
	// the server so the UI stays optimistic; failures revert to the
	// pre-change value and toast the reason.
	const [status, setStatus] = useState<NextStepStatus>(step.status);
	const [title, setTitle] = useState<string>(step.title);
	const [dueAt, setDueAt] = useState<Date | null>(step.dueAt);
	const [editingTitle, setEditingTitle] = useState(false);
	const [actionsDrawerOpen, setActionsDrawerOpen] = useState(false);
	const [findingsDrawerOpen, setFindingsDrawerOpen] = useState(false);
	// Hash-driven default expansion when arriving from a finding-detail
	// breadcrumb. Mirrors the BuyerSegments pattern.
	const [defaultExpandedKey, setDefaultExpandedKey] = useState<string | null>(null);

	useEffect(() => {
		function syncFromHash() {
			if (typeof window === "undefined") return;
			const parsed = parsePlanHash(window.location.hash);
			if (!parsed.ctx || parsed.ctx.kind !== "step") {
				if (findingsDrawerOpen || actionsDrawerOpen) {
					// Hash cleared while this step's drawer was open — close it.
				}
				return;
			}
			if (parsed.ctx.stepId !== step.id) return;
			if (parsed.ctx.mode === "findings") {
				setFindingsDrawerOpen(true);
				setDefaultExpandedKey(parsed.expand);
			} else {
				setActionsDrawerOpen(true);
			}
		}
		syncFromHash();
		window.addEventListener("popstate", syncFromHash);
		window.addEventListener("hashchange", syncFromHash);
		return () => {
			window.removeEventListener("popstate", syncFromHash);
			window.removeEventListener("hashchange", syncFromHash);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step.id]);

	function writeStepHash(ctx: DrawerCtx | null, expand: string | null) {
		if (typeof window === "undefined") return;
		const newHash = buildPlanHash(ctx, expand);
		const url = `${window.location.pathname}${window.location.search}${newHash}`;
		window.history.replaceState(null, "", url);
	}

	const findingsCtx: DrawerCtx = { kind: "step", stepId: step.id, mode: "findings" };
	const actionsCtx: DrawerCtx = { kind: "step", stepId: step.id, mode: "actions" };
	const returnLabel = `Plano · Passo ${step.order}`;

	const copilot = useCopilot();

	function discussStep() {
		// Action-oriented prompt — customer is here to ATTACK the problem,
		// not to "discuss" it. Carries the step title + reasoning excerpt +
		// impact + linkedFinding references so the MCP knows exactly which
		// records to pull (plan/findings catalog) without guessing.
		const impactLine =
			step.combinedImpact?.midpoint && step.combinedImpact.midpoint > 0
				? `Impacto estimado: R$ ${Math.round(step.combinedImpact.midpoint).toLocaleString("pt-BR")}/mês.`
				: "";
		const findingLine =
			step.linkedFindingRefs.length > 0
				? `Findings que o sustentam: ${step.linkedFindingRefs.slice(0, 3).join(", ")}.`
				: "";
		copilot.open({
			prompt: [
				`Passo ${step.order} do meu plano: "${title}".`,
				step.reasoning ? `Resumo: ${step.reasoning.slice(0, 280)}` : "",
				impactLine,
				findingLine,
				`Carrega o plano deste mês com get_strategy_plan e me ajude a atacar isso: por onde começo, o que verifico, e o primeiro passo concreto que eu mesmo posso fazer hoje.`,
			]
				.filter(Boolean)
				.join("\n"),
		});
	}

	function askHowToDo(procedureText: string, idx: number) {
		copilot.open({
			prompt: `Sobre o passo "${title}", como faço a seguinte parte do procedimento (item ${idx + 1})? "${procedureText}"`,
		});
	}
	const { currency } = useMcpData();
	const isDone = status === "done";
	// formatDate(dueAt) was used for the previous read-only chip; the
	// inline date input now renders the value directly via the native
	// picker, so the formatted string isn't needed here anymore.

	const stepComments = comments;
	const sectionId = `next-step:${step.id}`;

	const paragraphs = step.reasoning.split(/\n{2,}/).filter((p) => p.trim().length > 0);

	async function persistPatch(patch: Record<string, any>): Promise<boolean> {
		try {
			const res = await fetch(
				`/api/library/strategy/${encodeURIComponent(month)}/steps/${encodeURIComponent(step.id)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ envId, ...patch }),
				},
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				return false;
			}
			return true;
		} catch (err) {
			return false;
		}
	}

	async function handleStatusChange(next: NextStepStatus) {
		const prev = status;
		setStatus(next);
		const ok = await persistPatch({ status: next });
		if (!ok) setStatus(prev);
	}

	async function handleTitleCommit(next: string) {
		const trimmed = next.trim();
		setEditingTitle(false);
		if (trimmed.length === 0 || trimmed === step.title) {
			setTitle(step.title);
			return;
		}
		const prev = title;
		setTitle(trimmed);
		const ok = await persistPatch({ title: trimmed });
		if (!ok) setTitle(prev);
	}

	async function handleDueChange(iso: string | null) {
		const prev = dueAt;
		const next = iso ? new Date(iso) : null;
		setDueAt(next);
		const ok = await persistPatch({ dueAt: iso });
		if (!ok) setDueAt(prev);
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
			className="relative flex gap-4 sm:gap-6"
		>
			{/* Numbered rail — hidden on mobile (rendered inline in the
			    card header instead, sm:hidden block below); desktop keeps
			    the numbered pill in the left rail so the eye tracks the
			    sequence at-a-glance. */}
			<div className="hidden flex-col items-center pt-1 sm:flex">
				<div
					className={`flex h-11 w-11 items-center justify-center rounded-full border ${
						isDone
							? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
							: "border-edge bg-surface-card text-content"
					}`}
				>
					<span className="font-serif text-[20px] font-semibold leading-none">
						{step.order}
					</span>
				</div>
			</div>

			{/* Card body */}
			<div className="flex-1">
				{/* Wave 22.6 Step 9 — inline MCP edit proposal banner.
				    Only renders when an unresolved PlanEdit exists for
				    THIS step's section. Admins see Aprovar/Recusar. */}
				{pendingEdit && (
					<PlanEditBanner
						edit={pendingEdit}
						month={month}
						envId={envId}
						canApprove={canApprove}
					/>
				)}
				<div
					data-vsgp-card
					className={`rounded-2xl border bg-surface-card p-5 transition-all sm:p-7 ${
						isDone
							? "border-emerald-500/30 opacity-75"
							: "border-edge hover:border-edge-focus"
					}`}
				>
				{/* Header row */}
				<div className="mb-4 flex items-start justify-between gap-4">
					<div className="flex-1">
						<div className="mb-1 flex items-center gap-2 sm:hidden">
							<div className="flex h-7 w-7 items-center justify-center rounded-full border border-edge bg-surface-inset font-serif text-[14px] font-semibold">
								{step.order}
							</div>
							<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-faint">
								Passo {step.order}
							</span>
						</div>
						{editingTitle ? (
							<input
								type="text"
								autoFocus
								defaultValue={title}
								onBlur={(e) => handleTitleCommit(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
									if (e.key === "Escape") {
										setEditingTitle(false);
									}
								}}
								className="w-full rounded-md border border-edge bg-surface-card px-2 py-1 text-[18px] font-semibold leading-tight text-content outline-none focus:border-edge-focus"
								maxLength={240}
							/>
						) : (
							<h3
								onClick={() => setEditingTitle(true)}
								className={`-mx-2 cursor-text rounded-md px-2 py-1 text-[18px] font-semibold leading-tight transition-colors hover:bg-surface-card-hover ${
									isDone ? "text-content-muted line-through" : "text-content"
								}`}
								title="Clique pra editar"
							>
								{title}
							</h3>
						)}
					</div>
					{step.combinedImpact.midpoint > 0 && (
						// Stakes narrative tooltip — hover no pill mostra o
						// custo composto se o passo ficar aberto. Customer
						// que vê "R$ 6k/mês" entende o número, mas não
						// necessariamente a urgência. O popover converte em
						// stakes acumulados (3m / 6m / 12m + custo semanal)
						// — desbloqueia a leitura de "isso é caro de
						// procrastinar", não só "isso vale 6k".
						<div className="group/stakes relative shrink-0">
							<div
								className={`rounded-lg border px-3 py-1.5 text-center transition-colors ${
									step.combinedImpact.midpoint >= 5000
										? "border-rose-500/40 bg-rose-500/10 group-hover/stakes:border-rose-500/60"
										: step.combinedImpact.midpoint >= 2000
											? "border-amber-500/40 bg-amber-500/10 group-hover/stakes:border-amber-500/60"
											: "border-edge bg-surface-inset group-hover/stakes:border-edge-focus"
								}`}
							>
								<div
									className={`text-[9px] font-semibold uppercase tracking-wider ${
										step.combinedImpact.midpoint >= 5000
											? "text-rose-300/90"
											: step.combinedImpact.midpoint >= 2000
												? "text-amber-300/90"
												: "text-content-faint"
									}`}
								>
									perda potencial
								</div>
								<div
									className={`font-mono text-[13px] font-semibold tabular-nums ${
										step.combinedImpact.midpoint >= 5000
											? "text-rose-200"
											: step.combinedImpact.midpoint >= 2000
												? "text-amber-200"
												: "text-content"
									}`}
								>
									{fmtCurrencyUnits(step.combinedImpact.midpoint, currency, { zeroAsDash: true })}
									<span className="text-[10px] font-normal opacity-70">
										{" "}/mês
									</span>
								</div>
							</div>
							<StakesPopover monthly={step.combinedImpact.midpoint} currency={currency} />
						</div>
					)}
				</div>

				{/* PV.9b - visual proof: the customer's ACTUAL page next to the finding. */}
				{step.screenshotUrl && (
					<figure className="mb-5 overflow-hidden rounded-xl border border-edge bg-surface-inset">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={step.screenshotUrl}
							alt={`Captura de ${step.affectedSurfaces?.[0]?.surface ?? "sua página"}`}
							loading="lazy"
							className="block max-h-[260px] w-full object-cover object-top"
						/>
						<figcaption className="border-t border-edge px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Sua página{step.affectedSurfaces?.[0]?.surface ? ` · ${step.affectedSurfaces[0].surface}` : ""}
						</figcaption>
					</figure>
				)}
				{/* Reasoning — eyebrow varies per position (Wave 22.9 · Bloco 1). */}
				<div className="mb-6 font-serif text-[15px] leading-[1.65] text-content-secondary">
					<div className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						{eyebrowForPosition(step.order, totalSteps)}
					</div>
					{paragraphs.map((para, i) => (
						<p key={i} className={i > 0 ? "mt-3" : ""}>
							{renderInline(para)}
						</p>
					))}
				</div>

				{/* Procedure */}
				{step.procedureSteps.length > 0 && (
					<div className="mb-5">
						<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Como proceder
						</div>
						<ol className="space-y-2">
							{step.procedureSteps.map((proc, i) => (
								<li
									key={i}
									className="group/proc flex gap-3 text-[14px] leading-[1.55] text-content-secondary"
								>
									<span className="shrink-0 font-mono text-[12px] tabular-nums text-content-faint">
										{i + 1}.
									</span>
									<span className="flex-1">{proc}</span>
									{/* Hover affordance — "Como faço isso?" opens the
									    Copilot panel with the procedure text as
									    seed. Stays hidden until hover so the
									    procedure list doesn't look like a
									    button row. */}
									<button
										type="button"
										onClick={() => askHowToDo(proc, i)}
										className="hidden shrink-0 items-center gap-1 self-start rounded-md border border-edge bg-surface-card px-2 py-0.5 text-[10px] font-medium text-content-muted opacity-0 transition-all group-hover/proc:flex group-hover/proc:opacity-100 hover:border-edge-focus hover:text-content"
										title="Pedir ajuda da Vestigio AI"
									>
										<svg className="h-3 w-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
											<path strokeLinecap="round" d="M5 7v.5M3.5 4a1.5 1.5 0 113 0c0 .5-.3.9-.7 1.2-.4.3-.8.5-.8 1.3" />
										</svg>
										Como faço?
									</button>
								</li>
							))}
						</ol>
					</div>
				)}

				{/* Reta-final: verification criteria. Answers the customer's
				    silent question "Como sei que está fixed?" right where
				    they decide to act. Pulled from REMEDIATION_CATALOG via
				    the API — hidden when no catalog entry matched. */}
				{step.verification && (
					<div className="mb-5">
						<div className="mb-2 flex items-baseline gap-2">
							<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
								Como saber se foi corrigido
							</div>
							{/* etaSeconds is Vestigio's internal recheck window
							    (typically ~6–30s). Customer-facing it reads as
							    noise — "verifica em ~6s" doesn't tell them
							    anything actionable. We only surface ETA when
							    it's slow enough to matter (≥5min), and even
							    then framed as the customer's wait window. */}
							{step.verification.etaSeconds !== null && step.verification.etaSeconds >= 300 && (
								<span className="text-[10.5px] text-content-faint">
									· Vestigio reconfere em ~{Math.round(step.verification.etaSeconds / 60)}min
								</span>
							)}
						</div>
						<div className="rounded-xl border border-edge bg-surface-inset/40 px-4 py-3 text-[13.5px] leading-[1.55] text-content-secondary">
							{step.verification.notes}
						</div>
					</div>
				)}

				{/* Research refs */}
				{step.researchRefs.length > 0 && (
					<div className="mb-5">
						<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Pesquisar
						</div>
						<div className="flex flex-wrap gap-2">
							{step.researchRefs.map((ref, i) => {
								const linkProps = ref.url
									? { href: ref.url, target: "_blank", rel: "noopener noreferrer" as const }
									: {};
								const Tag: any = ref.url ? "a" : "span";
								return (
									<Tag
										key={i}
										{...linkProps}
										className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-inset px-3 py-1 text-[12px] text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
									>
										{ref.title}
										{ref.url && (
											<svg
												width="10"
												height="10"
												viewBox="0 0 10 10"
												fill="none"
												className="opacity-60"
											>
												<path
													d="M3 1.5h5.5V7M8.5 1.5L2.5 7.5"
													stroke="currentColor"
													strokeWidth="1"
													strokeLinecap="round"
												/>
											</svg>
										)}
									</Tag>
								);
							})}
						</div>
					</div>
				)}

				{/* Chat CTA — elevated from the footer row where it was small
				    + gray + buried (council critique: customer reads a vague
				    Next Step like "Problema de segurança quebrando seu
				    rastreamento de receita" and has nowhere to ask "qual
				    problema? qual tracking?"). Now it lives between
				    procedure and effort+owner row, with prompt-context
				    visible so customer knows what the chat already has. */}
				<button
					type="button"
					onClick={discussStep}
					className="group/discuss mb-5 flex w-full items-center justify-between gap-3 rounded-xl border border-edge bg-surface-inset/50 px-4 py-3 text-left transition-all hover:border-edge-focus hover:bg-surface-card-hover"
				>
					<div className="flex items-center gap-3">
						<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-content/10 text-content transition-colors group-hover/discuss:bg-content/15 dark:bg-white/10 dark:group-hover/discuss:bg-white/15">
							{/* Lightning bolt (Heroicons) = action/strike. Was an
							    upload arrow by mistake. Matches the Acoes sidenav
							    icon — reforca que essa CTA estende a surface de
							    acoes via chat. */}
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
								<path d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" />
							</svg>
						</span>
						<div className="min-w-0">
							<div className="text-[13.5px] font-medium text-content">
								Atacar com Vestigio
							</div>
							<div className="text-[11.5px] text-content-muted">
								Vestigio já tem o plano e os problemas em contexto. Só pedir o próximo movimento.
							</div>
						</div>
					</div>
					<span className="shrink-0 text-content-faint transition-transform group-hover/discuss:translate-x-0.5">
						<svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
						</svg>
					</span>
				</button>

				{/* Effort + owner row + confidence badge (when not high).
				    Reta-final: customer feedback "meia jornada · time eng ·
				    calibração inicial" — sem rótulos os valores ficavam
				    incompreensíveis. Cada chip agora carrega o nome do campo
				    (Esforço, Time, Calibração) com o valor capitalizado. */}
				<div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-content-muted">
					<span>
						<span className="text-content-faint">Esforço:</span>{" "}
						<span className="text-content-secondary">{step.estimatedEffort}</span>
					</span>
					<span className="text-content-faint">·</span>
					<span>
						<span className="text-content-faint">Time:</span>{" "}
						<span className="text-content-secondary">{step.suggestedOwner}</span>
					</span>
					{/* Calibração badge removed — customer feedback: not
					    actionable, reads as clutter. The R$ impact already
					    appears in the impact line; calibration nuance lives in
					    the methodology drawer for the curious. */}
				</div>

				{/* Status / due / comments row */}
				<div className="flex flex-wrap items-center gap-3 border-t border-edge/60 pt-4">
					<button
						type="button"
						onClick={() => handleStatusChange(isDone ? "todo" : "done")}
						className="group/cb flex items-center gap-2 text-[13px] text-content-secondary transition-colors hover:text-content"
					>
						<span
							className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
								isDone
									? "border-emerald-500/60 bg-emerald-500/20"
									: "border-edge bg-surface-inset group-hover/cb:border-edge-focus"
							}`}
						>
							{isDone && (
								<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
									<path
										d="M1.5 5.8L4.2 8.5L9.5 2.5"
										stroke="rgb(110 231 183)"
										strokeWidth="1.8"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}
						</span>
						<span>{isDone ? "Marcado feito" : "Marcar feito"}</span>
					</button>

					{/* Status dropdown — full lifecycle inline editable. Custom
					    popover instead of <select> so the option list
					    matches the rest of the plan's visual language
					    (rounded-xl panel, hover tones). The native select
					    used user-agent menu chrome that broke the surface
					    aesthetic. */}
					<StatusDropdown status={status} onChange={handleStatusChange} />

					{/* Due date — bare input, no label. Empty = no due date.
					    Click opens the native picker, blur persists. */}
					<label className="inline-flex items-center gap-1.5">
						<svg className="h-3.5 w-3.5 text-content-faint" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
							<rect x="1.5" y="2.5" width="11" height="10" rx="1" />
							<path d="M1.5 5h11M4 1.5v2M10 1.5v2" strokeLinecap="round" />
						</svg>
						<input
							type="date"
							value={dueAt ? dueAt.toISOString().slice(0, 10) : ""}
							onChange={(e) => handleDueChange(e.currentTarget.value || null)}
							className="bg-transparent font-mono text-[11px] tabular-nums text-content-muted outline-none [color-scheme:dark] hover:text-content"
						/>
					</label>

					<div className="ml-auto flex items-center gap-3">
						{/* Wave 22.6 Step 9 — comments render as the inline
						    PlanCommentThread below. Up here we just show the
						    count + "ver" hint so the button row stays tight.
						    The previous mock-mode fallback (rendered when
						    envId/month/planId were missing) was deleted: every
						    caller — StrategyPlanPanel is the only one — now
						    always passes a real backend-sourced plan. */}
						{/* Comment count chip — only renders when there are
						    comments. The empty-state "Comentar abaixo" hint
						    used to live here too but duplicated the
						    composer affordance inside the inline thread
						    below; user feedback flagged the redundancy. */}
						{stepComments.length > 0 && (
							<span className="inline-flex items-center gap-1.5 text-[12px] text-content-muted">
								<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
									<path
										d="M1.5 2.5h10v6.5h-5L4 11V9h-2.5z"
										stroke="currentColor"
										strokeWidth="1.1"
										strokeLinejoin="round"
									/>
								</svg>
								{`${stepComments.length} ${stepComments.length === 1 ? "comentário" : "comentários"}`}
							</span>
						)}
						{/* The "Discutir com Vestigio" CTA used to live here. It
						    was moved up to a prominent banner (between procedure
						    and effort+owner) where customers actually read it. */}
						<button
							type="button"
							onClick={() => {
								setActionsDrawerOpen(true);
								writeStepHash(actionsCtx, null);
							}}
							className="text-[12px] text-content-muted underline-offset-2 transition-colors hover:text-content hover:underline"
						>
							Ver ações relacionadas ({step.linkedActionRefs.length}) →
						</button>
						{/* Step 5+ — findings drill-down now opens a drawer
						    instead of navigating to /app/findings. Keeps the
						    user inside the plan and matches the ações-related
						    drawer pattern. */}
						{step.linkedFindingRefs.length > 0 && (
							<button
								type="button"
								onClick={() => {
									setFindingsDrawerOpen(true);
									writeStepHash(findingsCtx, defaultExpandedKey);
								}}
								className="text-[12px] text-content-muted underline-offset-2 transition-colors hover:text-content hover:underline"
							>
								Ver problemas do passo ({step.linkedFindingRefs.length}) →
							</button>
						)}
					</div>
				</div>

				{/* Wave 22.6 Step 9 — inline collapsible comment thread.
				    Opens automatically when the step has comments;
				    the composer appears when expanded. */}
				<div className="px-7 pb-5">
					<PlanCommentThread
						comments={stepComments}
						sectionId={sectionId}
						envId={envId}
						month={month}
						planId={planId}
						defaultOpen={stepComments.length > 0}
					/>
				</div>
				</div>
			</div>

			{/* Per-card drawers — Radix manages focus + Esc independently
			    so two open cards never collide. Both drawers share the
			    PlanSideDrawer chrome (50vw desktop / bottom sheet mobile)
			    so the buyer feels they're inside one consistent surface,
			    not three different tools. */}
			<PlanSideDrawer
				open={actionsDrawerOpen}
				onOpenChange={(next) => {
					setActionsDrawerOpen(next);
					if (!next) writeStepHash(null, null);
				}}
				eyebrow="Ações deste passo"
				title={step.title}
				description={`${step.linkedActionRefs.length} ${step.linkedActionRefs.length === 1 ? "ação ligada" : "ações ligadas"} ao passo`}
				footer="Ações sincronizam com /app/actions, mudanças aqui aparecem na fila operacional."
			>
				<ActionListBody
					linkedActions={step.linkedActions}
					actionIds={step.linkedActionRefs}
				/>
			</PlanSideDrawer>

			<PlanSideDrawer
				open={findingsDrawerOpen}
				onOpenChange={(next) => {
					setFindingsDrawerOpen(next);
					if (!next) {
						setDefaultExpandedKey(null);
						writeStepHash(null, null);
					}
				}}
				eyebrow="Problemas que justificam o passo"
				title={step.title}
				description={`${step.linkedFindingRefs.length} ${step.linkedFindingRefs.length === 1 ? "problema linkado" : "problemas linkados"}`}
				footer="Encontrados no ciclo em que o plano foi gerado."
			>
				<FindingListBody
					findingIds={step.linkedFindingRefs}
					month={month}
					parentCtx={findingsCtx}
					returnLabel={returnLabel}
					defaultExpandedKey={defaultExpandedKey}
					onExpandedChange={(key) => {
						setDefaultExpandedKey(key);
						writeStepHash(findingsCtx, key);
					}}
				/>
			</PlanSideDrawer>
		</motion.div>
	);
}

// ──────────────────────────────────────────────
// "Por página" lens helpers
// ──────────────────────────────────────────────

interface SurfaceGroup {
	surface: string; // raw surface key, used to derive "afeta também" diff
	label: string;
	steps: NextStep[];
}

// Group label for steps with no specific surface. Customer feedback:
// "Sem página específica" leu como ausência ("falta página"). O grupo
// é justamente o trabalho sistêmico que atravessa o site inteiro —
// nomear como tal afirma a categoria em vez de descrevê-la pela
// negativa.
const CROSS_SITE_LABEL_PT = "Atravessa todas as páginas";

function groupStepsBySurface(steps: NextStep[]): SurfaceGroup[] {
	// Primary surface = first entry of affectedSurfaces (highest finding
	// count). Steps with no affectedSurfaces go to a "Cross-site" bucket
	// at the top so the customer sees systemic work isn't hidden.
	const grouped = new Map<string, NextStep[]>();
	const crossSite: NextStep[] = [];
	for (const step of steps) {
		const primary = step.affectedSurfaces?.[0]?.surface;
		if (!primary) {
			crossSite.push(step);
			continue;
		}
		const arr = grouped.get(primary) ?? [];
		arr.push(step);
		grouped.set(primary, arr);
	}

	const out: SurfaceGroup[] = [];
	if (crossSite.length > 0) {
		out.push({ surface: "__cross__", label: CROSS_SITE_LABEL_PT, steps: crossSite });
	}
	// Sort groups by aggregate impact desc so the highest-leverage page
	// surfaces first.
	const groupArr = Array.from(grouped.entries()).map(([surface, list]) => {
		const totalImpact = list.reduce((a, s) => a + (s.combinedImpact?.midpoint ?? 0), 0);
		return {
			surface,
			label: humanizeSurfaceLabel(surface),
			steps: list,
			totalImpact,
		};
	});
	groupArr.sort((a, b) => b.totalImpact - a.totalImpact);
	for (const g of groupArr) {
		out.push({ surface: g.surface, label: g.label, steps: g.steps });
	}
	return out;
}

// Compact step card used INSIDE "Por página" groups. Renders the same
// title + impact + status as the full StepCard but with shrunk chrome
// (no editable title, no inline drawers, no chat CTA — those live in
// the strategic Completo view). Customer reads this as "the dispatch
// list", clicks through to the full StepCard via the strategic view
// when they want to act. "Afeta também" badges expose cross-page nature
// so customer never forgets the systemic story.
interface StepInGroupProps {
	step: NextStep;
	primarySurface: string;
	comments: PlanComment[];
	pendingEdit?: PendingPlanEdit;
	canApprove: boolean;
	envId: string;
	month: string;
	planId: string;
	allSteps: NextStep[];
}

function StepInGroup({ step, primarySurface }: StepInGroupProps) {
	const { currency } = useMcpData();
	const impact = step.combinedImpact?.midpoint ?? 0;
	const isDone = step.status === "done";
	const otherSurfaces = (step.affectedSurfaces ?? []).filter(
		(s) => s.surface !== primarySurface,
	);
	return (
		<li
			className={`rounded-2xl border bg-surface-card p-4 transition-colors sm:p-5 ${
				isDone
					? "border-emerald-500/30 opacity-75"
					: "border-edge hover:border-edge-focus"
			}`}
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2">
						<span className="font-mono text-[12px] tabular-nums text-content-faint">
							{step.order}.
						</span>
						<h4
							className={`text-[15px] font-semibold leading-snug ${
								isDone ? "text-content-muted line-through" : "text-content"
							}`}
						>
							{step.title}
						</h4>
					</div>
					{otherSurfaces.length > 0 && (
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							<span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-300">
								afeta também
							</span>
							{otherSurfaces.map((s) => (
								<span
									key={s.surface}
									className="font-mono text-[11px] text-content-muted"
								>
									{humanizeSurfaceLabel(s.surface)}
								</span>
							))}
						</div>
					)}
					<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-content-muted">
						<span>
							<span className="text-content-faint">Esforço:</span>{" "}
							<span className="text-content-secondary">{step.estimatedEffort}</span>
						</span>
						<span className="text-content-faint">·</span>
						<span>
							<span className="text-content-faint">Time:</span>{" "}
							<span className="text-content-secondary">{step.suggestedOwner}</span>
						</span>
					</div>
				</div>
				{impact > 0 && (
					<div
						className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-center ${
							impact >= 5000
								? "border-rose-500/40 bg-rose-500/10"
								: impact >= 2000
									? "border-amber-500/40 bg-amber-500/10"
									: "border-edge bg-surface-inset"
						}`}
					>
						<div className="text-[9px] font-semibold uppercase tracking-wider text-content-faint">
							perda potencial
						</div>
						<div className="font-mono text-[12px] font-semibold tabular-nums text-content">
							{fmtCurrencyUnits(Math.round(impact), currency)}
							<span className="text-[9px] font-normal opacity-70"> /mês</span>
						</div>
					</div>
				)}
			</div>
		</li>
	);
}

function SequenceConnector() {
	return (
		<div
			data-vsgp-print-hide
			className="ml-[22px] hidden h-10 w-px bg-edge sm:block"
			aria-hidden
		/>
	);
}

export default function NextSteps({
	steps,
	comments,
	pendingEdits,
	canApprove,
	envId,
	month,
	planId,
	compact = false,
	groupBySurface = false,
}: Props) {
	const { currency } = useMcpData();
	const [expanded, setExpanded] = useState(false);
	// E2 — split the queue into ONE main move + supporting moves. The
	// section used to render "top 3 expanded + collapsible rest" with no
	// visual hierarchy difference between step 1 and step 2; that read
	// as 5 equally-important findings rather than an opinionated bet.
	// Main move gets its own framing block above; supporting moves get
	// an eyebrow label ("Quando o movimento principal for concluído")
	// before they list out.
	const mainMove = steps[0];
	const supportingVisible = steps.slice(1, 3);
	const supportingHidden = steps.slice(3);

	// Reta-final "Por página" lens — regroups the SAME steps by surface
	// for dispatch. Strategic content (tese, padrão, hero) stays above
	// untouched; only this section changes. Cross-page steps get an
	// "afeta também" badge so the systemic story is still visible.
	if (groupBySurface) {
		const groups = groupStepsBySurface(steps);
		return (
			<motion.section
				initial={{ opacity: 0, y: 16 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, margin: "-10%" }}
				transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
				className="mb-12"
			>
				<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
					<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
						Por página · {groups.length} {groups.length === 1 ? "grupo" : "grupos"}
					</h2>
					<div className="text-[11px] text-content-faint">
						lente operacional · {steps.length} passos no total
					</div>
				</div>

				{/* Anti-retrabalho banner — explicitly tells the customer the
				    strategic moat lives elsewhere so this lens is read as
				    "operational dispatch", not "the answer". Council
				    deliberation: preserves the systemic differentiation while
				    serving the Type-B operator. */}
				<div className="mb-6 flex items-start gap-3 rounded-xl border border-edge bg-surface-inset/40 px-4 py-3 text-[12.5px] leading-snug text-content-secondary">
					<svg className="mt-0.5 h-4 w-4 shrink-0 text-content-faint" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
						<circle cx="8" cy="8" r="6" />
						<path strokeLinecap="round" d="M8 5v3.5M8 11v.2" />
					</svg>
					<p>
						Lente operacional: os mesmos passos do plano, reagrupados por
						página pra você distribuir entre times. A análise estratégica
						(tese, tema dominante, causa raiz) vive nas seções acima. Passos com badge{" "}
						<span className="rounded bg-surface-card px-1 py-0.5 font-mono text-[10.5px] text-content">
							afeta também
						</span>{" "}
						cruzam mais de uma página. Atacar isolado normalmente vira retrabalho.
					</p>
				</div>

				<div className="space-y-8">
					{groups.map((g) => {
						const totalImpact = g.steps.reduce(
							(a, s) => a + (s.combinedImpact?.midpoint ?? 0),
							0,
						);
						return (
							<div key={g.label}>
								<div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-edge/60 pb-2">
									<div className="flex items-baseline gap-2">
										<h3 className="font-serif text-[17px] font-medium text-content">
											{g.label}
										</h3>
										<span className="text-[11px] text-content-faint">
											{g.steps.length} {g.steps.length === 1 ? "passo" : "passos"}
										</span>
									</div>
									{totalImpact > 0 && (
										<span className="font-mono text-[12px] tabular-nums text-content-muted">
											{fmtCurrencyUnits(Math.round(totalImpact), currency)}/mês
										</span>
									)}
								</div>
								<ol className="space-y-3">
									{g.steps.map((step) => (
										<StepInGroup
											key={step.id}
											step={step}
											primarySurface={g.surface}
											comments={comments.filter((c) => c.sectionId === `next-step:${step.id}`)}
											pendingEdit={pendingEdits.find(
												(p) => p.sectionId === `next-step:${step.id}`,
											)}
											canApprove={canApprove}
											envId={envId}
											month={month}
											planId={planId}
											allSteps={steps}
										/>
									))}
								</ol>
							</div>
						);
					})}
				</div>
			</motion.section>
		);
	}

	// Wave 22.8 — Resumo mode renderiza top 3 steps em cartoes compactos
	// inline. Sem reasoning, sem procedure, sem drawers — title + impacto
	// + status. Customer le a aposta em segundos.
	if (compact) {
		const topThree = steps.slice(0, 3);
		return (
			<motion.section
				initial={{ opacity: 0, y: 16 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, margin: "-10%" }}
				transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
				className="mb-12"
			>
				<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
					<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
						Onde focar este mês
					</h2>
					<div className="text-[11px] text-content-faint">
						top {topThree.length} de {steps.length}
					</div>
				</div>
				<ol className="space-y-2">
					{topThree.map((step, idx) => {
						const tone =
							STATUS_TONE[step.status] ?? STATUS_TONE.todo;
						const impact = step.combinedImpact?.midpoint ?? 0;
						return (
							<li
								key={step.id}
								className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-edge bg-surface-card p-4 sm:p-5"
							>
								<span className="font-serif text-[24px] font-medium text-content-faint tabular-nums sm:text-[28px]">
									{idx + 1}
								</span>
								<div className="min-w-0">
									<div className="truncate text-[14px] font-semibold text-content">
										{step.title}
									</div>
									<div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-content-muted">
										<span>{step.estimatedEffort}</span>
										<span className="text-content-faint">·</span>
										<span>{step.suggestedOwner}</span>
									</div>
								</div>
								<div className="flex flex-col items-end gap-1.5">
									{impact > 0 && (
										<span className="font-mono text-[14px] font-semibold tabular-nums text-content">
											{fmtCurrencyUnits(Math.round(impact), currency)}
											<span className="ml-0.5 text-[10px] font-normal text-content-faint">
												/mês
											</span>
										</span>
									)}
									<span
										className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${tone}`}
									>
										{STATUS_LABEL[step.status]}
									</span>
								</div>
							</li>
						);
					})}
				</ol>
			</motion.section>
		);
	}

	// Build per-step lookup tables so each StepCard receives only the
	// comments + pending edit that belong to it. Comments are keyed
	// by sectionId="next-step:<step.id>"; pending edits same.
	const commentsByStepId = new Map<string, PlanComment[]>();
	for (const c of comments) {
		const m = c.sectionId.match(/^next-step:(.+)$/);
		if (!m) continue;
		const arr = commentsByStepId.get(m[1]) ?? [];
		arr.push(c);
		commentsByStepId.set(m[1], arr);
	}
	const editByStepId = new Map<string, PendingPlanEdit>();
	for (const e of pendingEdits) {
		const m = e.sectionId.match(/^next-step:(.+)$/);
		if (m) editByStepId.set(m[1], e);
	}

	const cardProps = (step: NextStep) => ({
		step,
		comments: commentsByStepId.get(step.id) ?? [],
		pendingEdit: editByStepId.get(step.id),
		canApprove,
		envId,
		month,
		planId,
		totalSteps: steps.length,
	});

	const supportingTotal = supportingVisible.length + supportingHidden.length;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.24 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Onde focar este mês
				</h2>
				{/* Count summary removed — the in-section eyebrows below
				    ("O movimento principal" + "Movimentos de apoio · quando
				    o principal terminar") already communicate the structure;
				    "1 movimento principal · 4 de apoio" lowercase was reading
				    as fragment/clutter. */}
			</div>

			<div className="flex flex-col">
				{mainMove && (
					<>
						{/* E2 — eyebrow framing for the main move. Visually
						    separates THE bet from the supporting list. */}
						<div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
							<span className="h-px w-6 bg-content-faint/40" />
							<span>O movimento principal</span>
						</div>
						<StepCard {...cardProps(mainMove)} />
					</>
				)}

				{supportingTotal > 0 && (
					<>
						{/* E2 — supporting moves eyebrow. Explicit framing
						    that these only unlock once the main move is done
						    — kills the "5 equally important steps" feeling. */}
						<div className="mb-3 mt-10 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
							<span className="h-px w-6 bg-content-faint/40" />
							<span>
								Movimentos de apoio · quando o principal terminar
							</span>
						</div>

						{supportingVisible.map((step, i) => (
							<div key={step.id}>
								{i > 0 && <SequenceConnector />}
								<StepCard {...cardProps(step)} />
							</div>
						))}

						{supportingHidden.length > 0 && (
							<Collapsible.Root open={expanded} onOpenChange={setExpanded}>
								<Collapsible.Content>
									{supportingHidden.map((step) => (
										<div key={step.id}>
											<SequenceConnector />
											<StepCard {...cardProps(step)} />
										</div>
									))}
								</Collapsible.Content>
								<Collapsible.Trigger asChild>
									<button
										type="button"
										className="mt-6 self-start text-[13px] text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline"
									>
										{expanded
											? "Esconder passos"
											: `Ver mais ${supportingHidden.length} passos →`}
									</button>
								</Collapsible.Trigger>
							</Collapsible.Root>
						)}
					</>
				)}
			</div>
		</motion.section>
	);
}
