"use client";

// ──────────────────────────────────────────────
// AwardsStrip — Product Hunt, Trustpilot, etc.
//
// Renders award badges from /public/images/awards/.
//
// Used in:
//   1. Below ClientGallery on homepage
//   2. Footer
// ──────────────────────────────────────────────

interface Badge {
	src: string;
	alt: string;
}

// Order: flanking badges on sides, Product Hunt (widest) in center
const BADGES: Badge[] = [
	{ src: "/images/awards/trustpilot.svg", alt: "Trustpilot" },
	{ src: "/images/awards/product-hunt.svg", alt: "Product Hunt" },
	{ src: "/images/awards/reclame-aqui.svg", alt: "Reclame Aqui RA1000" },
];

interface AwardsStripProps {
	/** Smaller variant for footer */
	compact?: boolean;
	/** Set false when rendered on a light background (e.g. HomeBigCard gradient bottom) */
	darkBg?: boolean;
	/** Restrict to specific badges by alt text */
	only?: string[];
}

export default function AwardsStrip({ compact = false, darkBg = true, only }: AwardsStripProps) {
	const filtered = only ? BADGES.filter((b) => only.includes(b.alt)) : BADGES;

	return (
		<div className={`flex items-center justify-center ${compact ? "gap-5" : "gap-3 sm:gap-8"}`}>
			{filtered.map((badge) => (
				<img
					key={badge.alt}
					src={badge.src}
					alt={badge.alt}
					loading="lazy"
					style={darkBg ? { mixBlendMode: "lighten" } : undefined}
					className={`object-contain opacity-80 transition-opacity hover:opacity-100 ${
						compact ? "h-6" : "h-6 sm:h-[38px]"
					}`}
				/>
			))}
		</div>
	);
}
