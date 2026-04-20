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
import HeroPills, { type Pill } from "./HeroPills";

// Pill icons and the pill interaction state live in HeroPills.tsx —
// this file only orchestrates the hero layout. CTAs moved to
// ProductTour so they sit below the product proof surface.

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
		className='pointer-events-none absolute inset-x-0 top-0 -z-1 h-[300vh]'
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

const Hero = async ({ i18nNamespace = "homepage.hero_v2" }: { i18nNamespace?: string } = {}) => {
	const t = await getTranslations(i18nNamespace);
	const pills = t.raw("pills") as Pill[];

	// No brush underline — removed per user feedback ("não está
	// surtindo o efeito que deveria").

	return (
		<section className='relative z-1 pb-2 pt-28 sm:pb-3 sm:pt-32 lg:pb-4 lg:pt-40'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
				/* Trail keyframe — a short bright segment that descends
				   through the hero AND into the product tour below.
				   Using 250vh so the pulse travels well past the hero
				   section boundary before fading out. */
				@keyframes vhero-trail {
					0%   { transform: translateY(-40px); opacity: 0; }
					5%   { opacity: 1; }
					85%  { opacity: 1; }
					100% { transform: translateY(250vh); opacity: 0; }
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

			{/* Background halos — extend well past the Hero section so
			    the glow fades gradually into the ProductTour below
			    instead of cutting off abruptly at the section boundary.
			    `overflow-hidden` is removed from the section so these
			    can bleed out. */}
			<div className='pointer-events-none absolute -inset-x-40 -top-20 -z-1 h-[200%]' aria-hidden>
				<div className='absolute left-1/2 top-0 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[120px]' />
				<div className='absolute left-1/2 top-[300px] h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-indigo-500/[0.05] blur-[120px]' />
			</div>

			{/* Animated descending vestigio trails */}
			<TrailLayer />

			{/* Announcement banner lives in the site layout now
			    (src/components/AnnouncementBanner) so it sits above the
			    header on the very first paint and auto-hides on scroll. */}

			{/* ─────────── Headline + subtitle + pills + CTAs ─────────── */}
			<div className='relative mx-auto w-full max-w-[1000px] px-4 text-center sm:px-8 xl:px-0'>
				<h1 className='mb-5 font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-white sm:mb-6 sm:text-[2.75rem] lg:text-[3.25rem] xl:text-[3.5rem]'>
					<span className='block'>{t("headline_part1")}</span>
					<span className='block'>{t("headline_part2")} {t("headline_part3")}</span>
				</h1>

				<p className='mx-auto mb-8 w-full max-w-[680px] text-base leading-relaxed text-zinc-400 sm:mb-10 sm:text-lg'>
					{t("subtitle")}
				</p>

				{/* 5 interactive impact / solution pills — client component.
				    Each card uses a liquid-fill animation to invert from
				    dark + pain → emerald + solution when clicked. See
				    HeroPills.tsx. */}
				<HeroPills pills={pills} />

			</div>

			{/* The product proof surface (browser shell with the action
			    queue, AI assistant, and recovery callout) used to live
			    here. It moved to the ProductTour section so the homepage
			    only has ONE product mockup instead of two. */}
		</section>
	);
};

export default Hero;
