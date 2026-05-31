"use client";

import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type {
	NextStep,
	NextStepStatus,
	PlanComment,
	PendingPlanEdit,
} from "../types";
import ActionDrawer from "../ActionDrawer";
import PlanCommentThread from "../PlanCommentThread";
import PlanEditBanner from "../PlanEditBanner";

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
	    step + inline edit banners. Optional so the Step 3 mock keeps
	    working without backend wiring. */
	comments?: PlanComment[];
	pendingEdits?: PendingPlanEdit[];
	canApprove?: boolean;
	envId?: string;
	month?: string;
	planId?: string;
}

function formatBRL(value: number): string {
	if (value === 0) return "—";
	if (value >= 1000) return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

function formatDate(date: Date | null): string | null {
	if (!date) return null;
	const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
	return `${date.getDate()} ${months[date.getMonth()]}`;
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
	comments?: PlanComment[];
	pendingEdit?: PendingPlanEdit;
	canApprove?: boolean;
	envId?: string;
	month?: string;
	planId?: string;
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
	const [status, setStatus] = useState<NextStepStatus>(step.status);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const isDone = status === "done";
	const due = formatDate(step.dueAt);

	const stepComments = comments ?? [];
	const sectionId = `next-step:${step.id}`;

	const paragraphs = step.reasoning.split(/\n{2,}/).filter((p) => p.trim().length > 0);

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
				{pendingEdit && envId && month && (
					<PlanEditBanner
						edit={pendingEdit}
						month={month}
						envId={envId}
						canApprove={canApprove ?? false}
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
						<h3
							className={`text-[18px] font-semibold leading-tight ${
								isDone ? "text-content-muted line-through" : "text-content"
							}`}
						>
							{step.title}
						</h3>
					</div>
					{step.combinedImpact.midpoint > 0 && (
						<div className="shrink-0 rounded-lg border border-edge bg-surface-inset px-3 py-1.5 text-right">
							<div className="text-[9px] font-semibold uppercase tracking-wider text-content-faint">
								impact
							</div>
							<div className="font-mono text-[13px] font-semibold tabular-nums text-content">
								{formatBRL(step.combinedImpact.midpoint)}
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
									className="flex gap-3 text-[14px] leading-[1.55] text-content-secondary"
								>
									<span className="shrink-0 font-mono text-[12px] tabular-nums text-content-faint">
										{i + 1}.
									</span>
									<span>{proc}</span>
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
						onClick={() => setStatus(isDone ? "todo" : "done")}
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

					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${STATUS_TONE[status]}`}
					>
						{STATUS_LABEL[status]}
					</span>

					{due && (
						<span className="font-mono text-[11px] tabular-nums text-content-muted">
							due {due}
						</span>
					)}

					<div className="ml-auto flex items-center gap-3">
						{/* Step 9 — when the plan came from the backend
						    (envId+month+planId all present), comments render
						    as the inline PlanCommentThread below. Up here
						    we just show the count + "ver" hint so the
						    button row stays tight. When in mock mode
						    (no envId), fall back to the legacy disabled
						    affordance. */}
						{envId && month && planId ? (
							<span className="inline-flex items-center gap-1.5 text-[12px] text-content-muted">
								<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
									<path
										d="M1.5 2.5h10v6.5h-5L4 11V9h-2.5z"
										stroke="currentColor"
										strokeWidth="1.1"
										strokeLinejoin="round"
									/>
								</svg>
								{stepComments.length === 0
									? "Comentar abaixo"
									: `${stepComments.length} ${stepComments.length === 1 ? "comentário" : "comentários"}`}
							</span>
						) : (
							<span
								title="Comentários disponíveis quando o plano vier do backend"
								className="inline-flex items-center gap-1.5 text-[12px] text-content-faint opacity-60"
							>
								<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
									<path
										d="M1.5 2.5h10v6.5h-5L4 11V9h-2.5z"
										stroke="currentColor"
										strokeWidth="1.1"
										strokeLinejoin="round"
									/>
								</svg>
								{step.commentsCount > 0
									? `${step.commentsCount} · mock`
									: "mock"}
							</span>
						)}
						<button
							type="button"
							onClick={() => setDrawerOpen(true)}
							className="text-[12px] text-content-muted underline-offset-2 transition-colors hover:text-content hover:underline"
						>
							Ver actions linkadas ({step.linkedActionRefs.length}) →
						</button>
					</div>
				</div>

				{/* Wave 22.6 Step 9 — inline collapsible comment thread.
				    Opens automatically when the step has comments;
				    the composer appears when expanded. Skips when in
				    mock mode (no envId/month/planId props passed). */}
				{envId && month && planId && (
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
				)}
				</div>
			</div>

			{/* Side drawer with the actions linked to this step. Mounted
			    per-card so Radix manages focus + Esc handling
			    independently — multiple cards never collide. */}
			<ActionDrawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				stepTitle={step.title}
				actionIds={step.linkedActionRefs}
			/>
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
	for (const c of comments ?? []) {
		const m = c.sectionId.match(/^next-step:(.+)$/);
		if (!m) continue;
		const arr = commentsByStepId.get(m[1]) ?? [];
		arr.push(c);
		commentsByStepId.set(m[1], arr);
	}
	const editByStepId = new Map<string, PendingPlanEdit>();
	for (const e of pendingEdits ?? []) {
		const m = e.sectionId.match(/^next-step:(.+)$/);
		if (m) editByStepId.set(m[1], e);
	}

	const cardProps = (step: NextStep) => ({
		step,
		comments: commentsByStepId.get(step.id),
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
