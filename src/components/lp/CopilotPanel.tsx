"use client";

/**
 * CopilotPanel — Vestigio AI as a right-side copilot, not a section.
 *
 * The previous McpChatMockup lived as a static section between
 * MapPreview and the findings list. Buyer had to scroll to it,
 * the typing animation fired once on mount, and if they scrolled
 * back the mid-sentence cut sat there frozen — the "alive" feel
 * was gone.
 *
 * Desktop: pinned to the right edge, slides in from the right.
 *   Trigger lives in the bottom-right corner with a quiet pulse.
 * Mobile: bottom sheet that slides up from the bottom-right FAB.
 *
 * Either way the typing animation re-runs every time the panel
 * opens, so the cut is always the peak moment — the visitor
 * arrives at it, doesn't stumble over its corpse.
 */

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

interface Props {
	domain: string;
	onCheckout: () => void;
	launching: boolean;
	/** When false, hide the trigger entirely (e.g., while the
	 *  AuditingState is still showing). */
	visible?: boolean;
	/** Fired whenever the panel toggles. The parent uses it to push
	 *  the page content to the left on desktop so the panel doesn't
	 *  overlap mid-page reading. Mobile parent should ignore it
	 *  (the bottom sheet already uses a backdrop, not a side push). */
	onOpenChange?: (open: boolean) => void;
}

type Phase = "idle" | "user" | "ai_typing" | "ai_response" | "done";

export default function CopilotPanel({
	domain,
	onCheckout,
	launching,
	visible = true,
	onOpenChange,
}: Props) {
	const t = useTranslations("lp.audit_result");
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<Phase>("idle");
	const [typedChars, setTypedChars] = useState(0);
	const [isDesktop, setIsDesktop] = useState(false);

	const question = t("mcp_mockup.question");
	// Rich response is split into intro (streamed char-by-char for
	// the "alive" effect) + structured chunks (causes list, mini
	// table, cut hint) that mount when streaming finishes.
	const introText = `${t("mcp_mockup.rich.intro_prefix")} ${t("mcp_mockup.rich.intro_amount")} ${t("mcp_mockup.rich.intro_suffix")}`;
	const scrollRef = useRef<HTMLDivElement>(null);

	// Slide direction switches with viewport: desktop slides in from the
	// right edge, mobile slides up from the bottom.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const mq = window.matchMedia("(min-width: 640px)");
		setIsDesktop(mq.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	// Notify parent on every toggle so it can adjust layout (push
	// page content left on desktop).
	useEffect(() => {
		onOpenChange?.(open);
	}, [open, onOpenChange]);

	// Reset + restart the typing sequence every time the panel opens.
	// The mid-sentence cut should always arrive fresh, never sit
	// frozen after the first read.
	useEffect(() => {
		if (!open) {
			setPhase("idle");
			setTypedChars(0);
			return;
		}
		const timers: number[] = [];
		timers.push(window.setTimeout(() => setPhase("user"), 500));
		timers.push(window.setTimeout(() => setPhase("ai_typing"), 1500));
		timers.push(window.setTimeout(() => setPhase("ai_response"), 2700));
		return () => {
			timers.forEach((id) => window.clearTimeout(id));
		};
	}, [open]);

	useEffect(() => {
		if (phase !== "ai_response") return;
		const id = window.setInterval(() => {
			setTypedChars((n) => {
				if (n >= introText.length) {
					window.clearInterval(id);
					setPhase("done");
					return n;
				}
				return n + 1;
			});
		}, 22);
		return () => window.clearInterval(id);
	}, [phase, introText.length]);

	// Auto-scroll the chat to the bottom as the response types.
	useEffect(() => {
		if (!scrollRef.current) return;
		scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
	}, [typedChars, phase]);

	if (!visible) return null;

	return (
		<>
			{/* Trigger — fixed bottom-right, pulses gently to invite */}
			<AnimatePresence>
				{!open && (
					<motion.button
						type="button"
						onClick={() => setOpen(true)}
						initial={{ opacity: 0, y: 20, scale: 0.9 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 20, scale: 0.9 }}
						transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
						className="group fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-zinc-900/95 px-4 py-3 text-[13px] font-semibold text-zinc-100 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.4)] backdrop-blur transition-all hover:border-emerald-500/60 hover:shadow-[0_8px_40px_-8px_rgba(16,185,129,0.6)] sm:bottom-6 sm:right-6"
						aria-label={t("mcp_mockup.title")}
					>
						<span className="relative flex h-6 w-6 items-center justify-center">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30" />
							<Sparkles className="relative h-4 w-4 text-emerald-300" />
						</span>
						<span className="font-[family-name:var(--font-fraunces)] text-[14px] font-medium tracking-tight">
							{t("mcp_mockup.title")}
						</span>
					</motion.button>
				)}
			</AnimatePresence>

			{/* Backdrop — mobile only (desktop panel doesn't dim the page) */}
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
						aria-hidden
					/>
				)}
			</AnimatePresence>

			{/* The panel itself.
			    - Desktop (sm+): pinned right, full-height, 360-400px wide,
			      slides from right.
			    - Mobile (<sm): bottom sheet, 90vh max, slides from bottom. */}
			<AnimatePresence>
				{open && (
					<motion.aside
						initial={isDesktop ? { x: "100%", y: 0 } : { y: "100%", x: 0 }}
						animate={{ x: 0, y: 0 }}
						exit={isDesktop ? { x: "100%", y: 0 } : { y: "100%", x: 0 }}
						transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
						className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-3xl border border-emerald-500/20 bg-zinc-950/95 shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.5)] backdrop-blur sm:inset-x-auto sm:right-0 sm:top-0 sm:h-screen sm:max-h-screen sm:w-[380px] sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-r-0 sm:border-t-0 sm:border-b-0"
					>
						{/* Header */}
						<div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4">
							<div className="flex items-center gap-2.5">
								<span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15">
									<Sparkles className="h-3.5 w-3.5 text-emerald-300" />
								</span>
								<div>
									<div className="text-[14px] font-semibold leading-tight text-zinc-100">
										{t("mcp_mockup.title")}
									</div>
									<div className="text-[11px] text-zinc-500">
										{t("mcp_mockup.header", { domain })}
									</div>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
								aria-label="Fechar"
							>
								<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>

						{/* Chat scroll area */}
						<div
							ref={scrollRef}
							className="flex-1 space-y-3 overflow-y-auto p-5"
						>
							{/* User message */}
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{
									opacity: phase === "idle" ? 0 : 1,
									y: phase === "idle" ? 8 : 0,
								}}
								transition={{ duration: 0.3 }}
								className="flex justify-end"
							>
								<div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-500/15 px-4 py-2.5 text-[13px] text-zinc-100">
									{question}
								</div>
							</motion.div>

							{/* AI bubble — typing dots, streamed intro, or full rich response */}
							{(phase === "ai_typing" ||
								phase === "ai_response" ||
								phase === "done") && (
								<motion.div
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3 }}
									className="flex justify-start"
								>
									<div className="w-full max-w-[92%] space-y-3 rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-[13px] text-zinc-300">
										{phase === "ai_typing" ? (
											<span className="inline-flex items-center gap-1.5">
												<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:0ms]" />
												<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:150ms]" />
												<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:300ms]" />
											</span>
										) : (
											<>
												{/* Intro — streamed char-by-char while typing,
												   then re-rendered with the R$value highlighted
												   once we hit done. */}
												{phase === "ai_response" ? (
													<p className="leading-relaxed">
														{introText.slice(0, typedChars)}
														<span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-emerald-400 align-middle" />
													</p>
												) : (
													<p className="leading-relaxed">
														{t("mcp_mockup.rich.intro_prefix")}{" "}
														<strong className="font-semibold text-rose-300">
															{t("mcp_mockup.rich.intro_amount")}
														</strong>{" "}
														{t("mcp_mockup.rich.intro_suffix")}
													</p>
												)}

												{/* Structured chunks appear after the streamed intro
												   completes. Each chunk fades in with a tiny stagger
												   so it reads as "the AI is composing this for you". */}
												{phase === "done" && (
													<>
														<motion.div
															initial={{ opacity: 0, y: 4 }}
															animate={{ opacity: 1, y: 0 }}
															transition={{ delay: 0.1, duration: 0.25 }}
														>
															<p className="text-zinc-100">
																<strong className="font-semibold">
																	{t("mcp_mockup.rich.causes_label")}
																</strong>
															</p>
															<ol className="mt-1.5 space-y-1 text-zinc-300">
																<li className="flex gap-2">
																	<span className="text-zinc-500">1.</span>
																	<span>
																		{t("mcp_mockup.rich.cause_1_main")}{" "}
																		<strong className="font-semibold text-amber-300">
																			{t("mcp_mockup.rich.cause_1_bold")}
																		</strong>
																	</span>
																</li>
																<li className="flex gap-2">
																	<span className="text-zinc-500">2.</span>
																	<span>{t("mcp_mockup.rich.cause_2")}</span>
																</li>
																<li className="flex gap-2">
																	<span className="text-zinc-500">3.</span>
																	<span>{t("mcp_mockup.rich.cause_3")}</span>
																</li>
															</ol>
														</motion.div>

														<motion.div
															initial={{ opacity: 0, y: 4 }}
															animate={{ opacity: 1, y: 0 }}
															transition={{ delay: 0.4, duration: 0.25 }}
														>
															<p className="mb-1.5 text-zinc-100">
																<strong className="font-semibold">
																	{t("mcp_mockup.rich.table_label")}
																</strong>
															</p>
															<div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
																<div className="grid grid-cols-[1fr_auto] border-b border-zinc-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
																	<span>{t("mcp_mockup.rich.col_where")}</span>
																	<span>{t("mcp_mockup.rich.col_cost")}</span>
																</div>
																<div className="grid grid-cols-[1fr_auto] border-b border-zinc-800/60 px-3 py-2 text-[12px]">
																	<span className="text-zinc-200">{t("mcp_mockup.rich.row_checkout")}</span>
																	<span className="font-mono tabular-nums text-rose-300">R$14.200</span>
																</div>
																<div className="grid grid-cols-[1fr_auto] border-b border-zinc-800/60 px-3 py-2 text-[12px]">
																	<span className="text-zinc-200">{t("mcp_mockup.rich.row_cart")}</span>
																	<span className="font-mono tabular-nums text-rose-300">R$4.800</span>
																</div>
																<button
																	type="button"
																	onClick={onCheckout}
																	className="grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-zinc-900/40"
																>
																	<span
																		className="select-none truncate text-zinc-400 blur-[5px]"
																		aria-hidden
																	>
																		{t("mcp_mockup.rich.row_more")}
																	</span>
																	<span
																		className="select-none font-mono tabular-nums text-zinc-500 blur-[4px]"
																		aria-hidden
																	>
																		R$6.100
																	</span>
																</button>
															</div>
														</motion.div>

														<motion.div
															initial={{ opacity: 0, y: 4 }}
															animate={{ opacity: 1, y: 0 }}
															transition={{ delay: 0.7, duration: 0.25 }}
															className="flex items-center gap-1.5 pt-1 text-[11px] text-zinc-500"
														>
															<span className="inline-block h-1 w-1 rounded-full bg-emerald-400" />
															<span>{t("mcp_mockup.rich.cut_hint")}</span>
														</motion.div>
													</>
												)}
											</>
										)}
									</div>
								</motion.div>
							)}
						</div>

						{/* CTA footer */}
						<div className="border-t border-zinc-800/80 p-4">
							<button
								type="button"
								onClick={onCheckout}
								disabled={launching}
								className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-3 text-[13px] font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25 disabled:opacity-60"
							>
								{t("mcp_mockup.cta")}
								<svg
									className="h-3.5 w-3.5"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden
								>
									<path d="M3 8h10M9 4l4 4-4 4" />
								</svg>
							</button>
						</div>
					</motion.aside>
				)}
			</AnimatePresence>
		</>
	);
}
