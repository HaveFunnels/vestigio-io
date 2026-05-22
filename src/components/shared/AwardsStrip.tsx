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
		<div className={`flex items-center justify-center ${compact ? "gap-5" : "gap-3 sm:gap-8"}`}>
			{BADGES.map((badge) => (
				<img
					key={badge.alt}
					src={badge.src}
					alt={badge.alt}
					loading="lazy"
					// mix-blend-mode: lighten kills the dark anti-alias
					// halo around the masked-PNG badges. The SVGs wrap a
					// 1500x300 PNG; aggressive downscale on mobile (h-6
					// → 24px) leaves sub-pixel fringes that read as a
					// shadow against the dark page bg. "lighten" makes
					// each output pixel = max(src, bg), so dark fringe
					// blends into the bg while the white logo stays.
					style={{ mixBlendMode: "lighten" }}
					className={`object-contain opacity-80 transition-opacity hover:opacity-100 ${
						compact ? "h-6" : "h-6 sm:h-[38px]"
					}`}
				/>
			))}
		</div>
	);
}
