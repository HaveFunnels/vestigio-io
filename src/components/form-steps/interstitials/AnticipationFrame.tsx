"use client";

import { useEffect, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	ArrowRightIcon,
	ChartBarIcon,
	CurrencyDollarSimpleIcon,
	MagnifyingGlassPlusIcon,
	ImageSquareIcon,
	ListChecksIcon,
} from "@phosphor-icons/react/dist/ssr";
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
					Quase lá
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
					<motion.button
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.35 }}
						onClick={onContinue}
						className="mx-auto flex items-center gap-2 rounded-2xl bg-emerald-100 px-6 py-3.5 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-content dark:hover:bg-emerald-500/30"
					>
						{continueLabel}
						<ArrowRightIcon size={14} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
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
