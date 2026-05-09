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
}

export default function AwardsStrip({ compact = false }: AwardsStripProps) {
	return (
		<div className={`flex items-center justify-center ${compact ? "gap-5" : "gap-2 sm:gap-8"}`}>
			{BADGES.map((badge) => (
				<img
					key={badge.alt}
					src={badge.src}
					alt={badge.alt}
					loading="lazy"
					className={`object-contain opacity-80 transition-opacity hover:opacity-100 ${
						compact ? "h-6" : "h-6 sm:h-[38px]"
					}`}
				/>
			))}
		</div>
	);
}
