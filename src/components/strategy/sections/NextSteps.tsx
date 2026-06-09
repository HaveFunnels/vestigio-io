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
	const copilot = useCopilot();

	function discussStep() {
		copilot.open({
			prompt: `Quero discutir o passo "${title}" do plano de estratégia mensal. Reasoning: ${step.reasoning.slice(0, 300)}. Me ajuda a entender melhor e decidir como atacar?`,
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
				console.warn("[NextSteps] PATCH failed:", res.status, data);
				return false;
			}
			return true;
		} catch (err) {
			console.warn("[NextSteps] PATCH threw:", err);
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
			className="relative flex gap-6"
		>
			{/* Numbered rail */}
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
					className={`rounded-2xl border bg-surface-card p-7 transition-all ${
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
						<div className="shrink-0 rounded-lg border border-edge bg-surface-inset px-3 py-1.5 text-right">
							<div className="text-[9px] font-semibold uppercase tracking-wider text-content-faint">
								impact
							</div>
							<div className="font-mono text-[13px] font-semibold tabular-nums text-content">
								{fmtCurrencyUnits(step.combinedImpact.midpoint, currency, { zeroAsDash: true })}
								<span className="text-[10px] font-normal text-content-faint">
									{" "}/mo
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Reasoning */}
				<div className="mb-6 font-serif text-[15px] leading-[1.65] text-content-secondary">
					<div className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Por que primeiro
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
										<svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
											<path strokeLinecap="round" d="M5 7v.5M3.5 4a1.5 1.5 0 113 0c0 .5-.3.9-.7 1.2-.4.3-.8.5-.8 1.3" />
										</svg>
										Como faço?
									</button>
								</li>
							))}
						</ol>
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

				{/* Effort + owner row */}
				<div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-content-muted">
					<span>{step.estimatedEffort}</span>
					<span className="text-content-faint">·</span>
					<span>{step.suggestedOwner}</span>
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
						<button
							type="button"
							onClick={discussStep}
							className="inline-flex items-center gap-1 text-[12px] text-content-muted transition-colors hover:text-content"
							title="Abrir o copilot pra discutir esse passo"
						>
							<svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
								<path strokeLinecap="round" strokeLinejoin="round" d="M2 3.5h8v5H6.5L4 10v-1.5H2z" />
							</svg>
							Discutir com Vestigio
						</button>
						<button
							type="button"
							onClick={() => setActionsDrawerOpen(true)}
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
								onClick={() => setFindingsDrawerOpen(true)}
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
				onOpenChange={setActionsDrawerOpen}
				eyebrow="Ações deste passo"
				title={step.title}
				description={`${step.linkedActionRefs.length} ${step.linkedActionRefs.length === 1 ? "ação ligada" : "ações ligadas"} ao passo`}
				footer="Ações sincronizam com /app/actions — mudanças aqui aparecem na fila operacional."
			>
				<ActionListBody actionIds={step.linkedActionRefs} />
			</PlanSideDrawer>

			<PlanSideDrawer
				open={findingsDrawerOpen}
				onOpenChange={setFindingsDrawerOpen}
				eyebrow="Problemas que justificam o passo"
				title={step.title}
				description={`${step.linkedFindingRefs.length} ${step.linkedFindingRefs.length === 1 ? "problema linkado" : "problemas linkados"}`}
				footer="Encontrados no ciclo em que o plano foi gerado."
			>
				<FindingListBody findingIds={step.linkedFindingRefs} />
			</PlanSideDrawer>
		</motion.div>
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
}: Props) {
	const [expanded, setExpanded] = useState(false);
	const top3 = steps.slice(0, 3);
	const hidden = steps.slice(3);

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
	});

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.24 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[22px] font-medium tracking-tight text-content">
					Próximo passo — atacar nesta ordem
				</h2>
				<div className="text-[11px] text-content-faint">
					{steps.length} passos · top 3 destacados
				</div>
			</div>

			<div className="flex flex-col">
				{top3.map((step, i) => (
					<div key={step.id}>
						<StepCard {...cardProps(step)} />
						{i < top3.length - 1 && <SequenceConnector />}
					</div>
				))}

				{hidden.length > 0 && (
					<Collapsible.Root open={expanded} onOpenChange={setExpanded}>
						<Collapsible.Content>
							{hidden.map((step) => (
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
									: `Ver mais ${hidden.length} passos →`}
							</button>
						</Collapsible.Trigger>
					</Collapsible.Root>
				)}
			</div>
		</motion.section>
	);
}
