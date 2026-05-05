"use client";

// ──────────────────────────────────────────────
// AwardsStrip — Product Hunt, Trustpilot, etc.
//
// Reusable strip of award/trust badges. Used in two places:
// 1. Below ClientGallery on homepage (reinforces social proof)
// 2. Footer (authority at the very end of the page)
//
// Design: understated pill badges, centered row. Grayscale
// icons with subtle borders. Doesn't compete with content.
// ──────────────────────────────────────────────

import {
	Star as StarIcon,
	Trophy as TrophyIcon,
	ShieldCheck as ShieldIcon,
} from "@phosphor-icons/react/dist/ssr";

interface AwardsStripProps {
	/** Smaller variant for footer */
	compact?: boolean;
}

export default function AwardsStrip({ compact = false }: AwardsStripProps) {
	const gap = compact ? "gap-3" : "gap-3 sm:gap-4";
	const pillClass = compact
		? "flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1"
		: "flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5";
	const textClass = compact
		? "text-[10px] font-medium text-zinc-500"
		: "text-[10px] font-medium text-zinc-500 sm:text-[11px]";
	const iconSize = compact ? 12 : 14;

	return (
		<div className={`flex flex-wrap items-center justify-center ${gap}`}>
			<div className={pillClass}>
				<TrophyIcon size={iconSize} weight="fill" className="text-amber-500/60" />
				<span className={textClass}>Product Hunt #1</span>
			</div>
			<div className={pillClass}>
				<StarIcon size={iconSize} weight="fill" className="text-emerald-500/60" />
				<span className={textClass}>Trustpilot 4.8</span>
			</div>
			<div className={pillClass}>
				<ShieldIcon size={iconSize} weight="fill" className="text-blue-400/60" />
				<span className={textClass}>SOC 2</span>
			</div>
		</div>
	);
}
