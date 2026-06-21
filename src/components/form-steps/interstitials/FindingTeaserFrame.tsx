"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { ShinyButton } from "@/components/ui/shiny-button";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import type { FindingTeaserInterstitialProps } from "@/types/interstitial";

// ──────────────────────────────────────────────
// FindingTeaserFrame — primeiro finding detectado durante o crawl
//
// Killer-feature do Sprint 3: enquanto o visitante preenche os steps
// 4-6, o early-crawl roda em background e detecta ao menos 1 finding.
// Mostramos aqui o título do finding + faixa R$ exposição estimada.
// Cria "oh shit moment" — vocês olharam meu site DE VERDADE enquanto eu
// respondia.
//
// Faixa (não valor exato) porque:
//   1. Cálculo exato exige revenue + concern preenchidos (depende do step)
//   2. Faixa é mais honesto pré-correlação cruzada do audit completo
//   3. Curiosidade pelo número exato vira motivo pra terminar o form
// ──────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
	trust: "Confiança",
	cta: "Chamada",
	friction: "Fricção",
	checkout: "Checkout",
	performance: "Performance",
	structure: "Estrutura",
	mobile: "Mobile",
	policy: "Política",
};

function formatRangeBrl(lowCents: number, highCents: number): string {
	const low = Math.round(lowCents / 100);
	const high = Math.round(highCents / 100);
	return `${fmtCurrencyUnits(low, "BRL", { mode: "k" })}–${fmtCurrencyUnits(high, "BRL", { mode: "k" })}`;
}

interface Props extends FindingTeaserInterstitialProps {
	continueLabel: string;
	onContinue: () => void;
	revealDelayMs?: number;
}

export default function FindingTeaserFrame({
	finding,
	rangeLowBrlCents,
	rangeHighBrlCents,
	continueLabel,
	onContinue,
	revealDelayMs = 1800,
}: Props) {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const id = setTimeout(() => setReady(true), revealDelayMs);
		return () => clearTimeout(id);
	}, [revealDelayMs]);

	const categoryLabel = CATEGORY_LABEL[finding.category] ?? finding.category;
	const rangeLabel = formatRangeBrl(rangeLowBrlCents, rangeHighBrlCents);

	return (
		<motion.div
			key="finding-teaser"
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -16 }}
			transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
			className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 px-2 py-6"
		>
			<div className="space-y-2 text-center">
				<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500/80">
					Enquanto você respondia
				</div>
				<h2 className="text-[22px] font-semibold leading-snug text-content sm:text-[26px]">
					Seu primeiro vazamento detectado
				</h2>
			</div>

			<motion.div
				initial={{ opacity: 0, scale: 0.97 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
				className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/5"
			>
				<div className="mb-2 flex items-center gap-2">
					<WarningIcon size={16} weight="fill" className="text-amber-600 dark:text-amber-400" />
					<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
						{categoryLabel}
					</span>
				</div>
				<div className="text-[15px] font-semibold leading-snug text-content sm:text-[16px]">
					{finding.title}
				</div>
				<div className="mt-3 flex items-baseline gap-2">
					<span className="text-[11px] uppercase tracking-[0.12em] text-content-muted">
						Exposição estimada
					</span>
					<span className="font-mono text-[16px] font-semibold tabular-nums text-red-600 dark:text-red-400">
						{rangeLabel}
					</span>
					<span className="text-[11px] text-content-muted">/mês</span>
				</div>
			</motion.div>

			<div className="text-center text-[12px] text-content-faint">
				O número exato + outros vazamentos no relatório final.
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
				   Skeleton-over-spinner per standing rule. */
				<div className="mx-auto h-[46px] w-[180px] animate-pulse rounded-2xl bg-white/[0.04]" aria-hidden />
			)}
		</motion.div>
	);
}
