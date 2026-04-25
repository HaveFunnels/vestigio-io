"use client";

/**
 * StepShell — outer chrome for one-question-per-screen forms.
 *
 * Layout within the card (top to bottom):
 *   ┌─ progress bar (thin, edge-to-edge) ─┐
 *   │  ← back arrow  ─── progress dots    │
 *   │                                      │
 *   │  Title                               │
 *   │  Subtitle                            │
 *   │                                      │
 *   │         (stretch space)              │
 *   │                                      │
 *   │  Input / Cards                       │
 *   │  Checkbox                            │
 *   │  [  Button  ]                        │
 *   └─────────────────────────────────────┘
 */

import { AnimatePresence, motion } from "framer-motion";

interface StepShellProps {
	stepIndex: number;
	totalSteps: number;
	onBack: () => void;
	children: React.ReactNode;
	className?: string;
	showBack?: boolean;
}

export default function StepShell({
	stepIndex,
	totalSteps,
	onBack,
	children,
	className = "",
	showBack,
}: StepShellProps) {
	const showBackArrow = showBack ?? stepIndex > 0;
	const progress = totalSteps > 1 ? ((stepIndex + 1) / totalSteps) * 100 : 0;

	return (
		<div
			className={`relative flex min-h-[100dvh] items-center justify-center bg-[#090911] px-4 py-6 sm:py-10 ${className}`}
		>
			{/* Canvas dot-grid background */}
			<div
				className="pointer-events-none absolute inset-0"
				aria-hidden
				style={{
					backgroundImage: "radial-gradient(circle, rgba(63,63,70,0.6) 1px, transparent 1px)",
					backgroundSize: "24px 24px",
				}}
			/>

			<div className="relative w-full max-w-[480px]">
				<div className="shiny-card group relative flex min-h-[520px] flex-col overflow-hidden rounded-3xl shadow-[0_0_0_1px_rgba(16,185,129,0.1),0_25px_80px_-20px_rgba(0,0,0,0.35),0_0_50px_-10px_rgba(16,185,129,0.12)] sm:min-h-[560px]">
					{/* Emerald glow halos */}
					<div className="pointer-events-none absolute inset-0 -z-1 opacity-50" aria-hidden>
						<div className="absolute -left-20 -top-20 h-[250px] w-[250px] rounded-full bg-emerald-400/[0.12] blur-3xl" />
						<div className="absolute -bottom-20 -right-20 h-[250px] w-[250px] rounded-full bg-emerald-400/[0.08] blur-3xl" />
					</div>
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

					{/* Top bar: back arrow + progress bar (compact, same row) */}
					<div className="flex items-center gap-3 px-6 pt-5 sm:px-8 sm:pt-6">
						<button
							type="button"
							onClick={onBack}
							disabled={!showBackArrow}
							className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all ${
								showBackArrow
									? "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
									: "pointer-events-none border-transparent opacity-0"
							}`}
							aria-label="Voltar"
						>
							<svg
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="h-4 w-4"
							>
								<path d="M10 3L5 8l5 5" />
							</svg>
						</button>

						<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
							<div
								className="h-full rounded-full bg-zinc-900 transition-all duration-300 ease-out"
								style={{ width: `${Math.max(progress, 4)}%` }}
							/>
						</div>
					</div>

					{/* Step content — flex-1 so it stretches to fill the card */}
					<div className="flex flex-1 flex-col px-6 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8">
						<AnimatePresence mode="wait">
							<motion.div
								key={stepIndex}
								initial={{ opacity: 0, x: 16 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -16 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
								className="flex flex-1 flex-col"
							>
								{children}
							</motion.div>
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}
