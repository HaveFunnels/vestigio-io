/**
 * HomeBigCard — gradient wrapper around the THREE top sections of
 * the homepage (Hero → ProductTour → ClientGallery).
 *
 * The page background OUTSIDE this card stays the existing dark
 * `#090911` from the body, so the card reads as a lit canvas
 * floating on the dark page — same idea as the mixpanel reference
 * the user shared.
 *
 * SCOPE
 *
 * Phase 6 originally wrapped 5 sections (through the Features
 * bento). Phase 7d shrinks the scope to just 3:
 *   1. Hero
 *   2. ProductTour
 *   3. ClientGallery
 *
 * Everything below ClientGallery (FeaturesWithImage, Features
 * bento, SolutionLayers, …) is back to standalone dark sections
 * — they were never the right fit for a light-bottom gradient
 * because they're built around white-on-dark cards that disappear
 * on a light background.
 *
 * GRADIENT
 *
 * Top → bottom, dark → white. The transition is intentionally
 * abrupt mid-card (around 60% of the height) so the user clearly
 * sees the canvas changing tone. The top half holds the Hero
 * (dark elements stay readable) and the bottom half holds the
 * ClientGallery (which adapts its text colors to dark for
 * legibility on the light surface).
 *
 *   0% — #090911 (existing site dark)
 *  35% — #1a1a22 (slightly lighter dark, holds the ProductTour)
 *  60% — zinc-300 (the abrupt transition zone)
 * 100% — white
 *
 * INNER ELEMENTS
 *
 * The previous version forced every nested `<section>` to
 * `!bg-transparent` via an arbitrary-variant selector. Removed
 * that hack — instead the three wrapped sections (Hero,
 * ProductTour, ClientGallery) have their own `bg-*` classes
 * deleted from their section wrappers in their respective files.
 * Inner elements (the browser shell mockup, brand strip wrapper,
 * cards) keep their opaque colors as designed. The user's exact
 * words: "não quero elementos transparentes" — only the section
 * background plate moved to the wrapper, everything inside stays
 * the way it was painted.
 */

import type { ReactNode } from "react";

interface HomeBigCardProps {
	children: ReactNode;
}

export default function HomeBigCard({ children }: HomeBigCardProps) {
	return (
		<div className='relative px-2 sm:px-4 lg:px-8 xl:px-12'>
			<div
				className={[
					// Visual chrome
					"relative overflow-hidden",
					"border border-white/[0.06]",
					"rounded-2xl sm:rounded-3xl",
					"shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)]",
					// The actual gradient — dark top, abrupt mid-band, white
					// bottom. The arbitrary stop percentages (`from-X`,
					// `via-Y`, `to-Z` with `via-N%`) shape the curve so the
					// transition has a clear inflection.
					"bg-[linear-gradient(to_bottom,#090911_0%,#0e0e16_30%,#1a1a22_55%,#a1a1aa_75%,#ffffff_100%)]",
				].join(" ")}
			>
				{children}
			</div>
		</div>
	);
}
