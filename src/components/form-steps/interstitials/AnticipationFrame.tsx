"use client";

import { useEffect, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	ChartBarIcon,
	CurrencyDollarSimpleIcon,
	MagnifyingGlassPlusIcon,
	ImageSquareIcon,
	ListChecksIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { AnticipationInterstitialProps } from "@/types/interstitial";

// ──────────────────────────────────────────────
// AnticipationFrame — preview do que vai ter na análise
//
// Mostra antes do último step (email) o que o visitante vai receber.
// Combate a hesitação de dar o email — fica claro o que ele tá comprando
// com o email dele. Espelha a estrutura do email mini-audit-complete.mjml
// (5 findings priorizados, valor R$, causa raiz, screenshot, plano).
// ──────────────────────────────────────────────

const ICON_MAP: Record<
	AnticipationInterstitialProps["items"][number]["icon"],
	ComponentType<{ size?: number; weight?: any }>
> = {
	stats: ChartBarIcon,
	money: CurrencyDollarSimpleIcon,
	root_cause: MagnifyingGlassPlusIcon,
	screenshot: ImageSquareIcon,
	plan: ListChecksIcon,
};

interface Props extends AnticipationInterstitialProps {
	continueLabel: string;
	onContinue: () => void;
	revealDelayMs?: number;
}

export default function AnticipationFrame({
	domain,
	items,
	continueLabel,
	onContinue,
	revealDelayMs = 1800,
}: Props) {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const id = setTimeout(() => setReady(true), revealDelayMs);
		return () => clearTimeout(id);
	}, [revealDelayMs]);

	return (
		<motion.div
			key="anticipation"
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -16 }}
			transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
			className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 px-2 py-6"
		>
			<div className="space-y-2 text-center">
				<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500/80">
					Último passo
				</div>
				<h2 className="text-[22px] font-semibold leading-snug text-content sm:text-[26px]">
					Sua análise de {domain} vai conter
				</h2>
			</div>

			<div className="space-y-2">
				{items.map((item, i) => {
					const Icon = ICON_MAP[item.icon];
					return (
						<motion.div
							key={item.label}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.35, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
							className="flex items-center gap-3 rounded-xl border border-edge bg-surface-card px-3.5 py-3"
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
								<Icon size={18} weight="duotone" />
							</div>
							<span className="text-[14px] leading-snug text-content">{item.label}</span>
						</motion.div>
					);
				})}
			</div>

			<div className="text-center text-[12px] text-content-faint">
				Resultado em ~60 segundos · Sem cartão de crédito
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
