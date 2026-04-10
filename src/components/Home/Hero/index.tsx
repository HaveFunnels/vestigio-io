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
 * Vestigio trails — subtle dashed vertical lines on the LEFT and
 * RIGHT sides of the hero only (never under the headline). Each
 * rail is a thin, dark, dashed vertical line with a small bright
 * pulse that descends along it. Fewer rails (4 total: 2 per side),
 * thinner strokes, darker colors, and slower speeds.
 * ──────────────────────────────────────────────────────────────── */

interface RailDef {
	/** X position as a percentage of viewport width */
	xPct: number;
	/** Negative delay so the loop is already in motion on first paint */
	delay: number;
	/** Total cycle length in seconds */
	duration: number;
}

// 4 rails: 2 on the far left, 2 on the far right. None between
// ~15% and ~85% where the hero content sits.
const RAILS: RailDef[] = [
	{ xPct: 4,  delay: 0,  duration: 18 },
	{ xPct: 10, delay: 7,  duration: 22 },
	{ xPct: 90, delay: 3,  duration: 20 },
	{ xPct: 96, delay: 11, duration: 16 },
];

const TrailLayer = () => (
	<div
		className='pointer-events-none absolute inset-0 -z-1 overflow-hidden'
		aria-hidden
	>
		{RAILS.map((rail, i) => (
			<div
				key={i}
				className='absolute top-0 h-full w-px'
				style={{ left: `${rail.xPct}%` }}
			>
				{/* Faint dashed vertical guide — always visible */}
				<div className='absolute inset-y-0 left-0 w-px border-l border-dashed border-white/[0.04]' />
				{/* Moving pulse — a short bright segment */}
				<div
					className='vhero-trail absolute left-0 top-0 h-8 w-px bg-gradient-to-b from-transparent via-emerald-400/40 to-transparent'
					style={{
						animationDelay: `-${rail.delay}s`,
						animationDuration: `${rail.duration}s`,
					}}
				/>
			</div>
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

	// No brush underline — removed per user feedback ("não está
	// surtindo o efeito que deveria").

	return (
		<section className='relative z-1 overflow-hidden pb-10 pt-28 sm:pb-12 sm:pt-32 lg:pb-16 lg:pt-40'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
				/* Trail keyframe — a short bright segment that descends
				   from the top of the hero to the bottom. Simple vertical
				   translate, fades in near the top and out near the bottom. */
				@keyframes vhero-trail {
					0%   { transform: translateY(-40px); opacity: 0; }
					10%  { opacity: 1; }
					90%  { opacity: 1; }
					100% { transform: translateY(calc(100vh + 40px)); opacity: 0; }
				}
				.vhero-trail {
					animation-name: vhero-trail;
					animation-iteration-count: infinite;
					animation-timing-function: linear;
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
				<h1 className='mb-5 font-outfit text-[2.1rem] font-bold leading-[1.05] tracking-tighter text-white sm:mb-6 sm:text-[3.25rem] lg:text-[4rem] xl:text-[4.5rem]'>
					<span className='block'>{t("headline_part1")}</span>
					<span className='block'>{t("headline_part2")}</span>
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
