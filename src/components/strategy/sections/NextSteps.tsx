"use client";

import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { NextStep, NextStepStatus } from "../types";

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

function StepCard({ step }: { step: NextStep }) {
	const [status, setStatus] = useState<NextStepStatus>(step.status);
	const isDone = status === "done";
	const due = formatDate(step.dueAt);

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
			<div
				data-strategy-card
				className={`flex-1 rounded-2xl border bg-surface-card p-7 transition-all ${
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
						<button
							type="button"
							className="inline-flex items-center gap-1.5 text-[12px] text-content-muted transition-colors hover:text-content"
						>
							<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
								<path
									d="M1.5 2.5h10v6.5h-5L4 11V9h-2.5z"
									stroke="currentColor"
									strokeWidth="1.1"
									strokeLinejoin="round"
								/>
							</svg>
							{step.commentsCount > 0 ? step.commentsCount : "Comentar"}
						</button>
						<button
							type="button"
							className="text-[12px] text-content-muted underline-offset-2 transition-colors hover:text-content hover:underline"
						>
							Ver actions linkadas ({step.linkedActionRefs.length}) →
						</button>
					</div>
				</div>
			</div>
		</motion.div>
	);
}

function SequenceConnector() {
	return (
		<div
			data-strategy-print-hide
			className="ml-[22px] hidden h-10 w-px bg-edge sm:block"
			aria-hidden
		/>
	);
}

export default function NextSteps({ steps }: Props) {
	const [expanded, setExpanded] = useState(false);
	const top3 = steps.slice(0, 3);
	const hidden = steps.slice(3);

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
						<StepCard step={step} />
						{i < top3.length - 1 && <SequenceConnector />}
					</div>
				))}

				{hidden.length > 0 && (
					<Collapsible.Root open={expanded} onOpenChange={setExpanded}>
						<Collapsible.Content>
							{hidden.map((step) => (
								<div key={step.id}>
									<SequenceConnector />
									<StepCard step={step} />
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
