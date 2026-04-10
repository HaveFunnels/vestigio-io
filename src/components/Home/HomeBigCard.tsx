/**
 * HomeBigCard — gradient wrapper that visually unifies the first
 * five sections of the homepage (Hero → ProductTour → ClientGallery
 * → FeaturesWithImage → Features) into a single "big card" with a
 * top-to-bottom zinc-tone gradient.
 *
 * The page background OUTSIDE this card stays the existing dark
 * `#090911` from the body, so the card looks like a lit zone
 * floating on the dark canvas — same vibe as the mixpanel reference
 * the user shared (a single product canvas surface that frames the
 * hero, the dashboard mockup, and the feature grid).
 *
 * Gradient direction: top → bottom, dark → progressively lighter.
 * The lightest stop is `zinc-500` rather than pure white because the
 * Features bento at the bottom is built around white-on-dark cards
 * (`bg-white/[0.02]` borders) that need a dark-enough background
 * to read against. Going to pure white would require redesigning
 * every bento card.
 *
 * Layout chrome:
 *   - rounded-3xl corners on lg+ (sharp on mobile so it edge-to-edge)
 *   - mx margins on sm+ so the dark page bg shows around the card
 *   - thin white/8 border + outer shadow for the floating-card feel
 *
 * Inner sections must have transparent backgrounds — see the
 * `[&_section]:!bg-transparent` selector below, which forces every
 * descendant `<section>` element to inherit the wrapper's gradient
 * instead of painting its own opaque bg over it.
 */

import type { ReactNode } from "react";

interface HomeBigCardProps {
	children: ReactNode;
}

export default function HomeBigCard({ children }: HomeBigCardProps) {
	return (
		<div className='relative px-0 sm:px-4 lg:px-8 xl:px-12'>
			<div
				className={[
					// Visual chrome
					"relative overflow-hidden",
					"border border-white/[0.06]",
					"sm:rounded-3xl",
					"shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)]",
					// The actual gradient — top dark, bottom lighter
					"bg-gradient-to-b from-[#090911] via-zinc-900 to-zinc-700",
					// Force every nested <section> to be transparent so the
					// gradient shows through. Without this, the per-section
					// bg-[#090911] / bg-[#080812] classes would paint over
					// the wrapper and you'd see no gradient at all.
					"[&_section]:!bg-transparent",
					// Same for any direct nested div that has its own
					// dark bg (Hero uses an absolute layer for its own
					// background gradient — neutralize that too).
					"[&_section_div.-z-2]:!hidden",
				].join(" ")}
			>
				{children}
			</div>
		</div>
	);
}
