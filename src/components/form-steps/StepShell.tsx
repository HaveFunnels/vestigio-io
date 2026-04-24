"use client";

/**
 * StepShell — outer chrome for one-question-per-screen forms.
 *
 * Provides:
 *   • Progress bar (emerald fill, smooth width transition)
 *   • Back arrow (hidden on first step)
 *   • AnimatePresence for step transitions (slide + fade)
 *   • Light card on dark background (premium feel)
 */

import { AnimatePresence, motion } from "framer-motion";

interface StepShellProps {
	stepIndex: number;
	totalSteps: number;
	onBack: () => void;
	children: React.ReactNode;
	/** Extra class on the outer dark container */
	className?: string;
	/** Hide back arrow even when stepIndex > 0 */
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
	const progress = totalSteps > 1 ? (stepIndex / (totalSteps - 1)) * 100 : 0;

	return (
		<div
			className={`flex min-h-[100dvh] items-center justify-center bg-[#090911] px-4 py-8 sm:py-12 ${className}`}
		>
			{/* Light card container */}
			<div className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)]">
				{/* Top bar: back arrow + progress */}
				<div className="flex items-center gap-3 px-6 pt-6 pb-2">
					{/* Back arrow */}
					<button
						type="button"
						onClick={onBack}
						disabled={!showBackArrow}
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 transition-all ${
							showBackArrow
								? "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
								: "pointer-events-none opacity-0"
						}`}
						aria-label="Go back"
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

					{/* Progress bar */}
					<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
						<div
							className="h-full rounded-full bg-zinc-900 transition-all duration-300 ease-out"
							style={{ width: `${Math.max(progress, 4)}%` }}
						/>
					</div>
				</div>

				{/* Step content with transition */}
				<div className="px-6 pb-8 pt-4 sm:px-8 sm:pb-10 sm:pt-6">
					<AnimatePresence mode="wait">
						<motion.div
							key={stepIndex}
							initial={{ opacity: 0, x: 16 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -16 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
						>
							{children}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
