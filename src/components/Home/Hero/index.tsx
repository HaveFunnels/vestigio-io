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
 * Vestigio trails — dashed L-shaped rails drawn over the hero
 * canvas. Each rail is a faint dashed path (think Mixpanel-style
 * background grid traces) and a brighter emerald pulse runs along
 * the rail from start to finish. The metaphor is "vestígios" — the
 * eye sees something moving along an invisible track and is pulled
 * to follow it down the page.
 *
 * Implementation: 6 inline `<svg>` elements, each containing two
 * paths:
 *   1. The faint dashed RAIL — always visible at low opacity
 *   2. The bright emerald PULSE — same path geometry but stroked
 *      with a small visible segment via `stroke-dasharray` and
 *      `stroke-dashoffset` animation, so the pulse looks like a
 *      glowing dot tracing the rail
 *
 * Each rail has a different L-shape (right→down, down→right,
 * down→left, etc.) and a different speed/delay so they never run
 * in lockstep. Pure CSS keyframes — no JS.
 * ──────────────────────────────────────────────────────────────── */

interface RailDef {
	/** SVG path definition for the rail (and the pulse) */
	d: string;
	/** Total path length in user units — used to size the dash arrays.
	 *  Approximate is fine, the pulse just needs a value bigger than
	 *  the visible segment. */
	length: number;
	/** Negative delay so the loop is already in motion on first paint */
	delay: number;
	/** Total cycle length in seconds */
	duration: number;
}

// All paths share a `0 0 100 100` viewBox so coordinates are in
// percent of the SVG. The SVG itself is positioned absolutely with
// inline `top/left/width/height` style props.
const RAILS: RailDef[] = [
	// Top-left → drops down → curves right
	{ d: "M 5 5 L 5 60 Q 5 75 20 75 L 95 75", length: 165, delay: 0,   duration: 14 },
	// Top-right → drops down → curves left
	{ d: "M 95 5 L 95 50 Q 95 65 80 65 L 5 65", length: 165, delay: 6,  duration: 16 },
	// Top-center → straight down → right elbow
	{ d: "M 50 5 L 50 70 Q 50 85 65 85 L 95 85", length: 145, delay: 3,  duration: 13 },
	// Mid-left → right → down
	{ d: "M 5 30 L 70 30 Q 85 30 85 45 L 85 95", length: 155, delay: 9,  duration: 18 },
	// Mid-right → left → down
	{ d: "M 95 35 L 30 35 Q 15 35 15 50 L 15 95", length: 155, delay: 4,  duration: 17 },
	// Top-near-center → diagonal down-right then down
	{ d: "M 35 5 L 35 40 Q 35 55 50 55 L 50 95", length: 130, delay: 11, duration: 15 },
];

const TrailLayer = () => (
	<div
		className='pointer-events-none absolute inset-0 -z-1 overflow-hidden'
		aria-hidden
	>
		{RAILS.map((rail, i) => {
			// The pulse is a 12-unit visible segment that travels along
			// the path. `strokeDasharray` is `12 length` so there's only
			// one visible segment at a time, and `strokeDashoffset`
			// animates from `length` (offscreen at start) to `-12`
			// (offscreen at end).
			return (
				<svg
					key={i}
					viewBox='0 0 100 100'
					preserveAspectRatio='none'
					className='absolute inset-0 h-full w-full'
				>
					{/* Faint dashed rail — always visible */}
					<path
						d={rail.d}
						stroke='rgba(255, 255, 255, 0.06)'
						strokeWidth='0.25'
						strokeDasharray='1 1.5'
						fill='none'
					/>
					{/* Bright emerald pulse — animates along the rail */}
					<path
						d={rail.d}
						stroke='rgb(110 231 183)'
						strokeWidth='0.45'
						strokeLinecap='round'
						fill='none'
						style={{
							filter: "drop-shadow(0 0 1.5px rgba(110, 231, 183, 0.9))",
							strokeDasharray: `12 ${rail.length}`,
							animation: `vhero-rail-pulse ${rail.duration}s linear infinite`,
							animationDelay: `-${rail.delay}s`,
						}}
					/>
				</svg>
			);
		})}
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

	// Split the first headline so we can wrap the brush-highlighted word
	// in a `<span>` with an SVG underline beneath it. The brush word
	// comes from `headline_brush_word` in the dictionary so we don't
	// have to hardcode "analytics" in 4 different translations.
	const headline1 = t("headline_part1");
	const brushWord = t("headline_brush_word");
	const brushIdx = headline1.toLowerCase().indexOf(brushWord.toLowerCase());
	const headline1Pre = brushIdx >= 0 ? headline1.slice(0, brushIdx) : headline1;
	const headline1Brush =
		brushIdx >= 0 ? headline1.slice(brushIdx, brushIdx + brushWord.length) : "";
	const headline1Post =
		brushIdx >= 0 ? headline1.slice(brushIdx + brushWord.length) : "";

	return (
		<section className='relative z-1 overflow-hidden pb-10 pt-28 sm:pb-12 sm:pt-32 lg:pb-16 lg:pt-40'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
				/* Rail pulse keyframe — animates stroke-dashoffset so
				   a single bright segment travels along the rail path
				   from start to finish. The starting offset is positive
				   (segment starts off-canvas at the rail beginning)
				   and animates down to a negative value (segment exits
				   off-canvas at the rail end). The numeric range is
				   intentionally large so it works for any rail length;
				   the visible segment width is set by stroke-dasharray
				   on each path inline. */
				@keyframes vhero-rail-pulse {
					0%   { stroke-dashoffset: 200; opacity: 0; }
					8%   { opacity: 1; }
					92%  { opacity: 1; }
					100% { stroke-dashoffset: -20; opacity: 0; }
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

			{/* Background halos only — no opaque gradient anymore.
			    The Hero now sits on top of the HomeBigCard wrapper's
			    gradient (dark top → white bottom), so we no longer
			    paint our own opaque background plate. The radial halos
			    stay because they add atmospheric depth without
			    blocking the wrapper gradient. */}
			<div className='pointer-events-none absolute inset-0 -z-1' aria-hidden>
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
					<span className='block'>
						{headline1Pre}
						{/* Paintbrush-underlined word — solid white text on
						    top, hand-drawn SVG stroke beneath. The SVG
						    `viewBox` is wide and short and uses
						    `preserveAspectRatio="none"` so it stretches to
						    match whatever word it sits under. */}
						{headline1Brush && (
							<span className='relative inline-block'>
								<span className='relative z-10'>{headline1Brush}</span>
								<svg
									className='pointer-events-none absolute inset-x-0 -bottom-1 h-[0.42em] w-full text-emerald-400 sm:-bottom-1.5'
									viewBox='0 0 200 18'
									fill='none'
									preserveAspectRatio='none'
									aria-hidden
								>
									{/* Hand-drawn paintbrush stroke — two
									    overlapping curves with rough endcaps so
									    it reads as ink, not a vector line. */}
									<path
										d='M2 11 C 30 4, 60 14, 95 8 C 130 3, 160 13, 198 7'
										stroke='currentColor'
										strokeWidth='6'
										strokeLinecap='round'
										strokeLinejoin='round'
										opacity='0.85'
									/>
									<path
										d='M6 14 C 40 9, 80 16, 120 11 C 150 7, 175 14, 196 11'
										stroke='currentColor'
										strokeWidth='3'
										strokeLinecap='round'
										strokeLinejoin='round'
										opacity='0.55'
									/>
								</svg>
							</span>
						)}
						{headline1Post}
					</span>
					<span className='block text-white'>{t("headline_part2")}</span>
				</h1>

				<p className='mx-auto mb-8 w-full max-w-[680px] text-base leading-relaxed text-zinc-400 sm:mb-10 sm:text-lg'>
					{t("subtitle")}
				</p>

				{/* 5 interactive impact / solution pills — client component.
				    Each card uses a liquid-fill animation to invert from
				    dark + pain → emerald + solution when clicked. See
				    HeroPills.tsx. */}
				<HeroPills pills={pills} />

				{/* CTAs — confident but not desperate. Smaller padding,
				    softer shadow, single subtle glow on hover instead of
				    a perpetual two-layer halo. */}
				<div className='mb-3 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-3'>
					<Link
						href={primaryCtaHref}
						className='rounded-[0.875rem] bg-white px-6 py-3 text-center text-[14px] font-semibold text-black shadow-[0_8px_24px_-12px_rgba(255,255,255,0.4)] transition-all hover:bg-zinc-100 hover:shadow-[0_12px_30px_-12px_rgba(255,255,255,0.55)] focus-visible:ring-2 focus-visible:ring-emerald-400'
					>
						{primaryCtaLabel ?? t("cta_primary")}
					</Link>
					<Link
						href='#product-tour'
						className='inline-flex items-center justify-center gap-2 rounded-[0.875rem] border border-white/15 bg-white/[0.02] px-6 py-3 text-center text-[14px] font-semibold text-white backdrop-blur transition-all hover:border-white/30 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30'
					>
						<svg viewBox='0 0 16 16' fill='none' className='h-3.5 w-3.5'>
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

				<p className='mx-auto mt-2 max-w-[560px] text-[11px] text-zinc-500 sm:text-xs'>
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
