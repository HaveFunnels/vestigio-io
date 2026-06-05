"use client";

/**
 * StepShell — outer chrome for one-question-per-screen forms.
 *
 * Wave-22.6 redesign: switched from a dark glassmorphic card to a
 * light, premium "consumer app" aesthetic — full-bleed off-white
 * background, centered Vestigio wordmark, icon-chip progress row,
 * and the step content rendered directly on the page (no card
 * chrome) so each question feels like a screen, not a form field.
 *
 * The previous dark variant lives in the git history if needed.
 */

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import logoDark from "@/../public/images/logo/logo.png";
import logoLight from "@/../public/images/logo/logo-light.png";
import StepProgressChips, { type StepKind } from "./StepProgressChips";

interface StepShellProps {
	stepIndex: number;
	totalSteps: number;
	onBack: () => void;
	children: React.ReactNode;
	className?: string;
	showBack?: boolean;
	/** Ordered list of step kinds — drives the icon chip row. When
	 *  omitted, the chip row is hidden (back-compat for any caller
	 *  that doesn't pass this yet). */
	steps?: readonly StepKind[];
}

export default function StepShell({
	stepIndex,
	totalSteps,
	onBack,
	children,
	className = "",
	showBack,
	steps,
}: StepShellProps) {
	const showBackArrow = showBack ?? stepIndex > 0;

	return (
		<div
			className={`relative flex min-h-[100dvh] flex-col bg-surface-shell px-5 pb-8 pt-6 sm:px-6 sm:py-10 ${className}`}
		>
			{/* Back arrow — absolute top-left so it doesn't take layout
			    space when hidden. */}
			<button
				type="button"
				onClick={onBack}
				disabled={!showBackArrow}
				className={`absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors sm:left-6 sm:top-6 ${
					showBackArrow
						? "text-content-muted hover:bg-surface-card-hover hover:text-content"
						: "pointer-events-none opacity-0"
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

			{/* Header — Vestigio wordmark centered */}
			<div className="mx-auto mb-7 mt-1 flex w-full max-w-[560px] flex-col items-center gap-6 sm:mb-9">
				<Image
					src={logoDark}
					alt="Vestigio"
					className="h-6 w-auto dark:hidden"
					priority
				/>
				<Image
					src={logoLight}
					alt="Vestigio"
					className="hidden h-6 w-auto dark:block"
					priority
				/>
				{steps && steps.length > 1 && (
					<StepProgressChips steps={steps} activeIndex={stepIndex} />
				)}
			</div>

			{/* Step content. mx-auto keeps a 560px reading column on big
			    screens; on mobile we use the available width minus
			    horizontal padding from the parent. */}
			<div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
				<AnimatePresence mode="wait">
					<motion.div
						key={stepIndex}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
						className="flex flex-1 flex-col"
					>
						{children}
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
}
