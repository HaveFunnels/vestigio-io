"use client";

// ──────────────────────────────────────────────
// LogoStrip — social proof logos + awards between hero and product tour.
//
// Design: understated, premium feel. Logos in grayscale at low opacity.
// Awards (Product Hunt, Trustpilot) as subtle badges.
// The headline "Confiada por..." is small, zinc-500 text.
//
// Placeholder logos until real ones are available — rendered
// as generic rounded rectangles with company initials.
// ──────────────────────────────────────────────

import {
	Star as StarIcon,
	Trophy as TrophyIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

// Placeholder logos — replace with real SVGs when available.
// Using initials + generic shape to communicate the concept.
const PLACEHOLDER_LOGOS = [
	{ initials: "HM", name: "Hotmart" },
	{ initials: "RD", name: "RD Station" },
	{ initials: "VT", name: "VTEX" },
	{ initials: "NS", name: "Nuvemshop" },
	{ initials: "RS", name: "Reserva" },
	{ initials: "IF", name: "iFood" },
];

function PlaceholderLogo({ initials, name }: { initials: string; name: string }) {
	return (
		<div
			className="flex h-8 w-16 items-center justify-center rounded-md bg-zinc-800/40 text-[10px] font-semibold tracking-wide text-zinc-500 opacity-50 transition-opacity hover:opacity-80 sm:h-9 sm:w-20"
			title={name}
		>
			{initials}
		</div>
	);
}

export default function LogoStrip() {
	const t = useTranslations("homepage.logo_strip");

	return (
		<div className="relative z-1 mx-auto max-w-[900px] px-4 py-8 sm:py-10">
			{/* Headline */}
			<p className="mb-5 text-center text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-600 sm:mb-6 sm:text-xs">
				{t("headline")}
			</p>

			{/* Logo row */}
			<div className="mb-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
				{PLACEHOLDER_LOGOS.map((logo) => (
					<PlaceholderLogo key={logo.initials} {...logo} />
				))}
			</div>

			{/* Awards strip */}
			<div className="flex items-center justify-center gap-4 sm:gap-6">
				{/* Product Hunt badge */}
				<div className="flex items-center gap-1.5 rounded-full border border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5">
					<TrophyIcon size={14} weight="fill" className="text-amber-500/70" />
					<span className="text-[10px] font-medium text-zinc-500 sm:text-[11px]">
						Product Hunt #1
					</span>
				</div>

				{/* Trustpilot badge */}
				<div className="flex items-center gap-1.5 rounded-full border border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5">
					<StarIcon size={14} weight="fill" className="text-emerald-500/70" />
					<span className="text-[10px] font-medium text-zinc-500 sm:text-[11px]">
						Trustpilot 4.8
					</span>
				</div>
			</div>
		</div>
	);
}
