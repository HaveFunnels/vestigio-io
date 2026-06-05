"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// MirrorMoment — value-mirror interstitial between onboarding steps
//
// Pattern: user submits a step → instead of jumping straight to the
// next form field, we show one quiet screen that explains what their
// answer just unlocked ("Isso vai permitir que…"). The Continue
// button is hidden for `revealDelayMs` so the user can't blast
// through without reading; once revealed, the button fades in.
//
// Used by /app/onboarding to convert a pure data-capture form into
// an interactive ritual where each answered question feels earned.
// ──────────────────────────────────────────────

interface Props {
	/** The user's just-submitted answer, echoed back to ground the
	 *  mirror copy in their own words. */
	answer: string;
	/** Headline — usually a "Isso vai permitir que..." style line. */
	headline: string;
	/** 1-2 sentence body that explains the unlocked behavior. */
	body: string;
	/** Optional icon node rendered above the headline. */
	icon?: ReactNode;
	/** Label on the continue button. Defaults to "Entendi". */
	continueLabel: string;
	onContinue: () => void;
	revealDelayMs?: number;
}

export default function MirrorMoment({
	answer,
	headline,
	body,
	icon,
	continueLabel,
	onContinue,
	revealDelayMs = 2500,
}: Props) {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const id = setTimeout(() => setReady(true), revealDelayMs);
		return () => clearTimeout(id);
	}, [revealDelayMs]);

	return (
		<motion.div
			key="mirror"
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -16 }}
			transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
			className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 px-6 py-10"
		>
			{icon && (
				<div className="flex justify-center text-emerald-500">{icon}</div>
			)}
			<div className="space-y-2 text-center">
				<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500/80">
					{answer}
				</div>
				<h2 className="text-[24px] font-semibold leading-snug text-content sm:text-[28px]">
					{headline}
				</h2>
				<p className="text-[14px] leading-relaxed text-content-muted">{body}</p>
			</div>

			<AnimatePresence>
				{ready && (
					<motion.button
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.35 }}
						onClick={onContinue}
						className="mx-auto flex items-center gap-2 rounded-2xl bg-emerald-100 px-6 py-3.5 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-emerald-200"
					>
						{continueLabel}
						<ArrowRightIcon size={14} weight="bold" className="text-emerald-600" />
					</motion.button>
				)}
			</AnimatePresence>

			{!ready && (
				<div className="mx-auto flex items-center gap-2 text-[11px] text-content-faint">
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:200ms]" />
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:400ms]" />
				</div>
			)}
		</motion.div>
	);
}
