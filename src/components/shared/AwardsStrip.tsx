"use client";

// ──────────────────────────────────────────────
// AwardsStrip — Product Hunt, Trustpilot, etc.
//
// Renders award badges from /public/images/awards/.
// Place your badge images there:
//   - product-hunt.svg
//   - trustpilot.svg
//   - soc2.svg
//
// Used in:
//   1. Below ClientGallery on homepage
//   2. Footer
// ──────────────────────────────────────────────

import Image from "next/image";

interface Badge {
	src: string;
	alt: string;
}

const BADGES: Badge[] = [
	{ src: "/images/awards/product-hunt.svg", alt: "Product Hunt" },
	{ src: "/images/awards/trustpilot.svg", alt: "Trustpilot" },
	{ src: "/images/awards/reclame-aqui.svg", alt: "Reclame Aqui RA1000" },
];

interface AwardsStripProps {
	/** Smaller variant for footer */
	compact?: boolean;
}

export default function AwardsStrip({ compact = false }: AwardsStripProps) {
	const height = compact ? 24 : 38;
	const gap = compact ? "gap-5" : "gap-3 sm:gap-8";

	return (
		<div className={`flex flex-nowrap items-center justify-center ${gap}`}>
			{BADGES.map((badge) => (
				<Image
					key={badge.alt}
					src={badge.src}
					alt={badge.alt}
					width={height * 3}
					height={height}
					className={`shrink opacity-80 transition-opacity hover:opacity-100 ${compact ? "h-6" : "h-7 sm:h-[38px]"} w-auto`}
					style={{ width: "auto" }}
				/>
			))}
		</div>
	);
}
