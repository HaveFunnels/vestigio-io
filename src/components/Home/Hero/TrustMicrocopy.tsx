"use client";

// ──────────────────────────────────────────────
// TrustMicrocopy — subtle trust reinforcement below the hero CTA.
//
// Two trust signals rendered as understated, centered pills:
// 1. "Garantia 4X" — ROI guarantee
// 2. "Funciona com qualquer plataforma" — platform compatibility
//
// Design: barely-there text that catches the eye only when the
// visitor hesitates on the CTA. No borders, no backgrounds —
// just text with tiny icons, separated by a faint dot.
// ──────────────────────────────────────────────

import {
	ShieldCheck as ShieldIcon,
	CheckCircle as CheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

export default function TrustMicrocopy() {
	const t = useTranslations("homepage.hero_v2.trust_microcopy");

	return (
		<div className="mt-4 flex flex-col items-center gap-2 sm:mt-5 sm:flex-row sm:justify-center sm:gap-4">
			{/* Guarantee */}
			<span className="flex items-center gap-1.5 text-[11px] text-zinc-500 sm:text-xs">
				<ShieldIcon
					size={13}
					weight="fill"
					className="shrink-0 text-emerald-500/70"
				/>
				<span>{t("guarantee")}</span>
			</span>

			{/* Separator — visible on desktop only */}
			<span className="hidden h-3 w-px bg-zinc-700/60 sm:block" aria-hidden />

			{/* Platforms */}
			<span className="flex items-center gap-1.5 text-[11px] text-zinc-500 sm:text-xs">
				<CheckIcon
					size={13}
					weight="fill"
					className="shrink-0 text-emerald-500/70"
				/>
				<span>{t("platforms")}</span>
			</span>
		</div>
	);
}
