"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { BenchmarkInterstitialProps } from "@/types/interstitial";

// ──────────────────────────────────────────────
// BenchmarkFrame — value-on-fill após business_type
//
// Mostra 2 anchors específicos do vertical do visitante (Baymard,
// ProfitWell, HTTP Archive, etc.) com fonte citada inline. Sinal
// "vocês entendem da minha categoria" sem fingir social proof.
//
// Pattern segue MirrorMoment: botão escondido por 2s (delay reveal),
// dots emerald enquanto espera. Diferença: layout em "card stack" pra
// dar peso visual aos números.
// ──────────────────────────────────────────────

interface Props extends BenchmarkInterstitialProps {
	continueLabel: string;
	onContinue: () => void;
	revealDelayMs?: number;
}

export default function BenchmarkFrame({
	answer,
	headline,
	anchors,
	continueLabel,
	onContinue,
	revealDelayMs = 2000,
}: Props) {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const id = setTimeout(() => setReady(true), revealDelayMs);
		return () => clearTimeout(id);
	}, [revealDelayMs]);

	return (
		<motion.div
			key="benchmark"
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -16 }}
			transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
			className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 px-2 py-6"
		>
			<div className="flex justify-center text-emerald-500">
				<ChartLineUpIcon size={28} weight="duotone" />
			</div>

			<div className="space-y-2 text-center">
				<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500/80">
					{answer}
				</div>
				<h2 className="text-[22px] font-semibold leading-snug text-content sm:text-[26px]">
					{headline}
				</h2>
			</div>

			<div className="space-y-2.5">
				{anchors.map((a, i) => (
					<motion.div
						key={a.metric}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
						className="rounded-2xl border border-edge bg-surface-card px-4 py-3.5"
					>
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-[13px] leading-tight text-content-muted">
								{a.metric}
							</span>
							<span className="font-mono text-[16px] font-semibold tabular-nums text-content">
								{a.value}
							</span>
						</div>
						<div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-content-faint">
							Fonte: {a.source}
						</div>
					</motion.div>
				))}
			</div>

			<AnimatePresence>
				{ready && (
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.35 }}
						className="mx-auto"
					>
						<ShinyButton onClick={onContinue}>{continueLabel}</ShinyButton>
					</motion.div>
				)}
			</AnimatePresence>

			{!ready && (
				/* Shimmer-skeleton placeholder — replaces 3-dot pulse loop.
				   Skeleton-over-spinner per standing rule: no infinite
				   animation cues, no "AI working" theatre. Width matches
				   the button that lands when ready. */
				<div className="mx-auto h-[46px] w-[180px] animate-pulse rounded-2xl bg-white/[0.04]" aria-hidden />
			)}
		</motion.div>
	);
}
