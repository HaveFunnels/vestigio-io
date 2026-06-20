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

// Order: flanking badges on sides, Product Hunt (widest) in center.
//
// Switched from .svg to .png on 2026-06-20: the original SVGs were
// PNG rasters wrapped in <feColorMatrix> mask filters (250KB each,
// halo on light backgrounds). Transparent PNGs at 600×120 (3× retina
// for the ~120px display width) ship at ~17-33KB each — no halo, no
// filter weirdness, ~85% smaller per badge.
const BADGES: Badge[] = [
	{ src: "/images/awards/trustpilot.png", alt: "Trustpilot" },
	{ src: "/images/awards/product-hunt.png", alt: "Product Hunt" },
	{ src: "/images/awards/reclame-aqui.png", alt: "Reclame Aqui RA1000" },
];

interface AwardsStripProps {
	/** Smaller variant for footer */
	compact?: boolean;
	/** Set false when rendered on a light background. Default true since
	 *  the homepage is dark canvas-wide after the HomeBigCard kill. */
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
					// Only 3 small files (~17-33KB each at 600×120). Lazy gains
					// nothing here and risks visible pop-in when ClientGallery
					// enters viewport — `w-auto` would collapse them to zero
					// width during decode. width/height + eager kills both
					// CLS and the pop-in.
					width={190}
					height={38}
					style={darkBg ? { mixBlendMode: "lighten" } : undefined}
					className={`object-contain opacity-80 transition-opacity hover:opacity-100 ${
						compact ? "h-6" : "h-6 sm:h-[38px]"
					}`}
				/>
			))}
		</div>
	);
}
