/**
 * Home > Hero — the front door of vestigio.io.
 *
 * Layout (top → bottom):
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │  Announcement banner — thin pill above the headline   │
 *   ├───────────────────────────────────────────────────────┤
 *   │  Headline (two-line, dynamic gradient on the lead)    │
 *   │  Subtitle                                             │
 *   │  5 horizontal "pill" cards with checkboxes + icons    │
 *   │  Two CTAs (primary + secondary)                       │
 *   │  Microcopy line                                       │
 *   ├───────────────────────────────────────────────────────┤
 *   │  Giant browser-shell card                             │
 *   │  ├─ chrome bar with traffic-light dots + URL          │
 *   │  └─ vertical gradient + horizontal stripe layers      │
 *   │     ├─ Vestigio AI panel  (left float)                │
 *   │     ├─ Action Queue panel (center)                    │
 *   │     └─ Recovery callout   (right float)               │
 *   └───────────────────────────────────────────────────────┘
 *
 * Background: full-bleed vertical gradient (vestigio palette: emerald
 * → indigo dusk → near-black) with subtle horizontal stripe layers,
 * plus animated "vestigio trails" — vertical traces descending the
 * canvas as a quiet psychological cue to scroll. Trails are CSS-only
 * keyframes prefixed with `vhero-` to avoid global collisions.
 *
 * The component is a server component (`async`) using `getTranslations`
 * so it stays out of the client bundle. CTA hrefs/labels are still
 * overridable via props for the /lp variant.
 *
 * All copy lives under `homepage.hero_v2.*` in the dictionaries.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import HeroPills, { type Pill } from "./HeroPills";

interface HeroProps {
	// Optional CTA destination override. Default = signup flow.
	// /lp variant passes "/lp/audit" so the primary CTA jumps directly
	// into the anonymous lead funnel instead of asking for signup.
	primaryCtaHref?: string;
	primaryCtaLabel?: string;
}

// The browser-shell mockup that used to live here has moved to
// `src/components/Home/ProductTour/index.tsx`. The Hero now ends at
// the CTA strip — the product proof surface is the next section.
//
// Pill icons and the pill interaction state live in HeroPills.tsx —
// this file only orchestrates the hero layout.

/* ──────────────────────────────────────────────────────────────────
 * Animated Vestigio trails — small glowing emerald dots that wander
 * across the hero canvas in unpredictable paths (right → down →
 * left → down) and disappear off the bottom. The metaphor is
 * literal vestígios (Portuguese for "traces / footprints"): the user
 * sees something moving and is psychologically pulled to scroll
 * down to follow it.
 *
 * Each trail uses a unique multi-step CSS keyframe so trails NEVER
 * run in lockstep. They start at different X positions, follow
 * different turning patterns, and finish at different X positions.
 * Pure CSS — no JS.
 * ──────────────────────────────────────────────────────────────── */

interface TrailLane {
	/** Animation name — must match a `@keyframes vhero-trail-N` */
	name: string;
	/** Negative delay so the loop is already in motion on first paint */
	delay: number;
	/** Total cycle length in seconds */
	duration: number;
}

const TRAIL_LANES: TrailLane[] = [
	{ name: "vhero-trail-zigzag-a", delay: 0,    duration: 18 },
	{ name: "vhero-trail-zigzag-b", delay: 5,    duration: 22 },
	{ name: "vhero-trail-zigzag-c", delay: 2.5,  duration: 20 },
	{ name: "vhero-trail-zigzag-d", delay: 8,    duration: 19 },
	{ name: "vhero-trail-zigzag-a", delay: 12,   duration: 24 },
	{ name: "vhero-trail-zigzag-b", delay: 1,    duration: 17 },
	{ name: "vhero-trail-zigzag-c", delay: 6.5,  duration: 21 },
	{ name: "vhero-trail-zigzag-d", delay: 3.5,  duration: 23 },
];

const TrailLayer = () => (
	<div
		className='pointer-events-none absolute inset-0 -z-1 overflow-hidden'
		aria-hidden
	>
		{TRAIL_LANES.map((lane, i) => (
			<div
				key={i}
				className='absolute left-0 top-0 h-3 w-3 rounded-full bg-emerald-300/70 shadow-[0_0_14px_4px_rgba(110,231,183,0.55)]'
				style={{
					animationName: lane.name,
					animationDuration: `${lane.duration}s`,
					animationIterationCount: "infinite",
					animationTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
					animationDelay: `-${lane.delay}s`,
				}}
			/>
		))}
	</div>
);

// (BrowserShell deleted — moved to ProductTour/index.tsx)

/* ──────────────────────────────────────────────────────────────────
 * Section
 * ──────────────────────────────────────────────────────────────── */

const Hero = async ({
	primaryCtaHref = "/auth/signup",
	primaryCtaLabel,
}: HeroProps = {}) => {
	const t = await getTranslations("homepage.hero_v2");
	const pills = t.raw("pills") as Pill[];

	return (
		<section className='relative z-1 overflow-hidden pb-20 pt-28 sm:pb-24 sm:pt-32 lg:pb-32 lg:pt-40'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
				/* Trail keyframes — each one defines a different zigzag
				   path across the hero canvas. The X positions are in
				   viewport-width units (vw) so they scale with the screen,
				   the Y positions are in viewport-height (vh). Every
				   trail enters at opacity 0, fades in around 8% of the
				   cycle, holds visible until 92%, then fades out as it
				   exits the bottom. */
				@keyframes vhero-trail-zigzag-a {
					0%   { transform: translate(8vw,  -4vh); opacity: 0; }
					8%   { opacity: 0.85; }
					22%  { transform: translate(8vw,  18vh); }
					40%  { transform: translate(28vw, 32vh); }
					58%  { transform: translate(28vw, 52vh); }
					75%  { transform: translate(14vw, 68vh); }
					92%  { opacity: 0.85; }
					100% { transform: translate(14vw, 96vh); opacity: 0; }
				}
				@keyframes vhero-trail-zigzag-b {
					0%   { transform: translate(72vw, -4vh); opacity: 0; }
					8%   { opacity: 0.8; }
					25%  { transform: translate(72vw, 22vh); }
					45%  { transform: translate(52vw, 38vh); }
					62%  { transform: translate(52vw, 56vh); }
					78%  { transform: translate(68vw, 72vh); }
					92%  { opacity: 0.8; }
					100% { transform: translate(68vw, 100vh); opacity: 0; }
				}
				@keyframes vhero-trail-zigzag-c {
					0%   { transform: translate(38vw, -4vh); opacity: 0; }
					8%   { opacity: 0.7; }
					20%  { transform: translate(38vw, 14vh); }
					38%  { transform: translate(58vw, 28vh); }
					56%  { transform: translate(58vw, 48vh); }
					74%  { transform: translate(38vw, 62vh); }
					90%  { transform: translate(38vw, 84vh); opacity: 0.7; }
					100% { transform: translate(38vw, 100vh); opacity: 0; }
				}
				@keyframes vhero-trail-zigzag-d {
					0%   { transform: translate(92vw, -4vh); opacity: 0; }
					8%   { opacity: 0.9; }
					22%  { transform: translate(92vw, 20vh); }
					40%  { transform: translate(78vw, 36vh); }
					58%  { transform: translate(86vw, 54vh); }
					76%  { transform: translate(78vw, 70vh); }
					92%  { opacity: 0.9; }
					100% { transform: translate(82vw, 100vh); opacity: 0; }
				}
				@keyframes vhero-pulse {
					0%, 100% { transform: scale(1); opacity: 0.9; }
					50%      { transform: scale(1.18); opacity: 0.55; }
				}
				@keyframes vhero-float-up {
					0%   { opacity: 0; transform: translateY(20px); }
					100% { opacity: 1; transform: translateY(0); }
				}
				@keyframes vhero-float-left {
					0%   { opacity: 0; transform: translateX(-12px) rotate(-1.5deg); }
					100% { opacity: 1; transform: translateX(0) rotate(-1.5deg); }
				}
				@keyframes vhero-float-right {
					0%   { opacity: 0; transform: translateX(12px) rotate(1.5deg); }
					100% { opacity: 1; transform: translateX(0) rotate(1.5deg); }
				}
				.vhero-shell {
					animation: vhero-float-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
				}
				@media (min-width: 768px) {
					.vhero-float-left  { animation: vhero-float-left  1.1s cubic-bezier(0.16,1,0.3,1) 0.55s both; }
					.vhero-float-right { animation: vhero-float-right 1.1s cubic-bezier(0.16,1,0.3,1) 0.7s both; }
				}
				.vhero-float-up {
					animation: vhero-float-up 1s cubic-bezier(0.16,1,0.3,1) 0.4s both;
				}
				@media (prefers-reduced-motion: reduce) {
					.vhero-trail,
					.vhero-shell,
					.vhero-float-left,
					.vhero-float-right,
					.vhero-float-up {
						animation: none !important;
					}
				}
			`}</style>

			{/* Background — full-bleed vertical gradient in vestigio palette */}
			<div className='-z-2 absolute inset-0' aria-hidden>
				<div className='absolute inset-0 bg-gradient-to-b from-[#0a1a14] via-[#080912] to-[#080812]' />
				{/* central blooming halo */}
				<div className='absolute left-1/2 top-0 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[140px]' />
				<div className='absolute left-1/2 top-[200px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-500/[0.05] blur-[160px]' />
			</div>

			{/* Animated descending vestigio trails */}
			<TrailLayer />

			{/* Announcement banner lives in the site layout now
			    (src/components/AnnouncementBanner) so it sits above the
			    header on the very first paint and auto-hides on scroll. */}

			{/* ─────────── Headline + subtitle + pills + CTAs ─────────── */}
			<div className='relative mx-auto w-full max-w-[1000px] px-4 text-center sm:px-8 xl:px-0'>
				<h1 className='mb-5 text-[2.1rem] font-bold leading-[1.05] tracking-tight text-white sm:mb-6 sm:text-[3.25rem] lg:text-[4rem] xl:text-[4.5rem]'>
					<span className='block'>{t("headline_part1")}</span>
					<span className='block bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-300 bg-clip-text pb-1 text-transparent'>
						{t("headline_part2")}
					</span>
				</h1>

				<p className='mx-auto mb-8 w-full max-w-[680px] text-base leading-relaxed text-zinc-400 sm:mb-10 sm:text-lg'>
					{t("subtitle")}
				</p>

				{/* 5 interactive impact / solution pills — client component.
				    Each card flips between the user's pain and the Vestigio
				    feature that resolves it when clicked. See HeroPills.tsx. */}
				<HeroPills
					pills={pills}
					eyebrowImpact={t("pills_eyebrow_impact")}
					eyebrowSolution={t("pills_eyebrow_solution")}
				/>

				{/* CTAs — larger than typical buttons because they are the
				    primary conversion action on the entire homepage. */}
				<div className='mb-4 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4'>
					<Link
						href={primaryCtaHref}
						className='rounded-[1.1rem] bg-white px-9 py-5 text-center text-[15px] font-semibold text-black shadow-[0_22px_60px_-18px_rgba(255,255,255,0.65),0_10px_40px_-10px_rgba(16,185,129,0.5)] transition-all hover:bg-emerald-50 hover:shadow-[0_28px_72px_-18px_rgba(255,255,255,0.75),0_14px_44px_-10px_rgba(16,185,129,0.65)] focus-visible:ring-2 focus-visible:ring-emerald-400 sm:text-base'
					>
						{primaryCtaLabel ?? t("cta_primary")}
					</Link>
					<Link
						href='#product-tour'
						className='inline-flex items-center justify-center gap-2.5 rounded-[1.1rem] border border-white/15 bg-white/[0.02] px-9 py-5 text-center text-[15px] font-semibold text-white backdrop-blur transition-all hover:border-white/30 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30 sm:text-base'
					>
						<svg viewBox='0 0 16 16' fill='none' className='h-4 w-4'>
							<circle
								cx='8'
								cy='8'
								r='7'
								stroke='currentColor'
								strokeWidth='1.4'
							/>
							<path d='M6.5 5.5L11 8l-4.5 2.5v-5z' fill='currentColor' />
						</svg>
						{t("cta_secondary")}
					</Link>
				</div>

				<p className='mx-auto mb-14 mt-2 max-w-[560px] text-[11px] text-zinc-500 sm:mb-16 sm:text-xs'>
					{t("cta_micro")}
				</p>
			</div>

			{/* The product proof surface (browser shell with the action
			    queue, AI assistant, and recovery callout) used to live
			    here. It moved to the ProductTour section so the homepage
			    only has ONE product mockup instead of two. */}
		</section>
	);
};

export default Hero;
