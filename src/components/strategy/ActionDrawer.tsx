"use client";

import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { MOCK_LINKED_ACTIONS, type MockLinkedAction } from "./mock-data";

/*
 * Action drawer — slides from the right when an operator clicks
 * "Ver actions linkadas (N) →" inside a NextStep card. Lists the
 * full ActionProjection-shaped detail for each linked action so the
 * operator can drill into the work item without leaving the plan.
 *
 * Step 3 uses MOCK_LINKED_ACTIONS for the lookup; Step 4 will swap
 * it for a fetch against /api/actions/by-ids (or join the action data
 * directly into the plan payload, undecided). The contract surface
 * the drawer renders against is intentionally action-shaped so the
 * swap is mechanical.
 */

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stepTitle: string;
	actionIds: string[];
}

const SEVERITY_TONE: Record<MockLinkedAction["severity"], string> = {
	critical: "bg-rose-500/10 text-rose-200 ring-rose-500/30",
	high: "bg-amber-500/10 text-amber-200 ring-amber-500/30",
	medium: "bg-sky-500/10 text-sky-200 ring-sky-500/30",
	low: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30",
};

const SEVERITY_LABEL: Record<MockLinkedAction["severity"], string> = {
	critical: "crítica",
	high: "alta",
	medium: "média",
	low: "baixa",
};

const STATUS_LABEL: Record<MockLinkedAction["status"], string> = {
	open: "Aberta",
	in_progress: "Em progresso",
	in_review: "Em revisão",
	done: "Feita",
	dismissed: "Descartada",
};

function formatBRL(value: number): string {
	if (value === 0) return "—";
	if (value >= 1000) return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
	return `R$ ${value.toLocaleString("pt-BR")}`;
}

export default function ActionDrawer({
	open,
	onOpenChange,
	stepTitle,
	actionIds,
}: Props) {
	const actions = actionIds
		.map((id) => MOCK_LINKED_ACTIONS[id])
		.filter((a): a is MockLinkedAction => a !== undefined);

	// Esc + outside-click are handled by Radix Dialog automatically.
	// Just make sure the body doesn't scroll behind the drawer.
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [open]);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<Dialog.Portal forceMount>
						<Dialog.Overlay asChild>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
							/>
						</Dialog.Overlay>
						<Dialog.Content asChild>
							<motion.div
								initial={{ x: "100%" }}
								animate={{ x: 0 }}
								exit={{ x: "100%" }}
								transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
								className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-edge bg-surface shadow-2xl"
							>
								{/* Header */}
								<div className="flex items-start justify-between gap-4 border-b border-edge px-6 py-5">
									<div className="min-w-0 flex-1">
										<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
											Actions linkadas a esse passo
										</div>
										<Dialog.Title className="truncate font-serif text-[18px] font-medium leading-tight text-content">
											{stepTitle}
										</Dialog.Title>
										<Dialog.Description className="mt-1 text-[12px] text-content-muted">
											{actions.length} {actions.length === 1 ? "action" : "actions"} priorizadas pelo engine
										</Dialog.Description>
									</div>
									<Dialog.Close asChild>
										<button
											type="button"
											aria-label="Fechar"
											className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
										>
											<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
												<path
													d="M3 3L11 11M11 3L3 11"
													stroke="currentColor"
													strokeWidth="1.6"
													strokeLinecap="round"
												/>
											</svg>
										</button>
									</Dialog.Close>
								</div>

								{/* List */}
								<div className="flex-1 overflow-y-auto px-6 py-5">
									{actions.length === 0 ? (
										<div className="rounded-lg border border-dashed border-edge bg-surface-card/40 p-6 text-center text-[13px] text-content-muted">
											Nenhuma action encontrada para esse passo (IDs referenciados podem ter sido arquivados).
										</div>
									) : (
										<ul className="space-y-4">
											{actions.map((action, idx) => (
												<motion.li
													key={action.id}
													initial={{ opacity: 0, y: 8 }}
													animate={{ opacity: 1, y: 0 }}
													transition={{ delay: 0.06 * idx, duration: 0.3 }}
													className="rounded-xl border border-edge bg-surface-card p-4"
												>
													<div className="mb-2 flex items-start justify-between gap-3">
														<h3 className="flex-1 text-[14px] font-semibold leading-snug text-content">
															{action.title}
														</h3>
														<span
															className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${SEVERITY_TONE[action.severity]}`}
														>
															{SEVERITY_LABEL[action.severity]}
														</span>
													</div>

													<p className="mb-3 font-serif text-[13px] leading-[1.6] text-content-secondary">
														{action.summary}
													</p>

													<div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-edge/60 pt-3 text-[11px]">
														<div>
															<div className="font-semibold uppercase tracking-wider text-content-faint">
																Impact
															</div>
															<div className="mt-0.5 font-mono tabular-nums text-content">
																{formatBRL(action.impactMidpoint)}
																{action.impactMidpoint > 0 && (
																	<span className="text-content-faint">/mo</span>
																)}
															</div>
														</div>
														<div>
															<div className="font-semibold uppercase tracking-wider text-content-faint">
																Status
															</div>
															<div className="mt-0.5 text-content">
																{STATUS_LABEL[action.status]}
															</div>
														</div>
														<div>
															<div className="font-semibold uppercase tracking-wider text-content-faint">
																Surface
															</div>
															<div className="mt-0.5 truncate font-mono text-content-secondary">
																{action.surface}
															</div>
														</div>
														<div>
															<div className="font-semibold uppercase tracking-wider text-content-faint">
																Última atualização
															</div>
															<div className="mt-0.5 font-mono tabular-nums text-content-secondary">
																{action.lastUpdate}
															</div>
														</div>
													</div>

													<div className="mt-3 flex items-center justify-between gap-3 border-t border-edge/60 pt-3">
														<div className="text-[11px] text-content-faint">
															Origem: <span className="font-mono">{action.findingId}</span>
														</div>
														<a
															href={`/app/actions?id=${action.id}`}
															className="text-[12px] text-content-secondary underline-offset-2 transition-colors hover:text-content hover:underline"
														>
															Abrir na fila →
														</a>
													</div>
												</motion.li>
											))}
										</ul>
									)}
								</div>

								{/* Footer */}
								<div className="border-t border-edge px-6 py-3 text-[11px] text-content-faint">
									Actions são geradas pelo engine. Mudanças aqui sincronizam com /app/actions.
								</div>
							</motion.div>
						</Dialog.Content>
					</Dialog.Portal>
				)}
			</AnimatePresence>
		</Dialog.Root>
	);
}
