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
 * Animated Vestigio trails — descending dot traces as a subtle
 * psychological scroll cue. Each trail is a fixed-width column with
 * a 2x24px dot animating top→bottom, staggered via inline delays so
 * they never all run in lockstep. CSS-keyframes only — no JS.
 * ──────────────────────────────────────────────────────────────── */

const TRAIL_LANES: Array<{ leftPct: number; delay: number; duration: number }> =
	[
		{ leftPct: 6, delay: 0, duration: 14 },
		{ leftPct: 14, delay: 4.5, duration: 11 },
		{ leftPct: 22, delay: 1.7, duration: 16 },
		{ leftPct: 31, delay: 7, duration: 13 },
		{ leftPct: 42, delay: 3, duration: 18 },
		{ leftPct: 51, delay: 6.2, duration: 12 },
		{ leftPct: 60, delay: 1, duration: 15 },
		{ leftPct: 69, delay: 8, duration: 17 },
		{ leftPct: 78, delay: 2.3, duration: 13 },
		{ leftPct: 86, delay: 5.5, duration: 14 },
		{ leftPct: 94, delay: 0.8, duration: 11 },
	];

const TrailLayer = () => (
	<div
		className='pointer-events-none absolute inset-0 -z-1 overflow-hidden'
		aria-hidden
	>
		{TRAIL_LANES.map((lane, i) => (
			<div
				key={i}
				className='absolute top-0 h-full w-px'
				style={{ left: `${lane.leftPct}%` }}
			>
				{/* faint vertical guide line so the trace looks like it
				    follows a path; barely visible at idle */}
				<div className='absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent' />
				{/* the moving trace itself — a small bright vertical
				    segment with an emerald glow */}
				<div
					className='vhero-trail absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-emerald-300/70 to-transparent shadow-[0_0_8px_rgba(110,231,183,0.45)]'
					style={{
						animationDelay: `-${lane.delay}s`,
						animationDuration: `${lane.duration}s`,
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

	return (
		<section className='relative z-1 overflow-hidden pb-20 pt-10 sm:pb-24 sm:pt-14 lg:pb-32 lg:pt-20'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
				@keyframes vhero-trail {
					0%   { transform: translateY(-80px); opacity: 0; }
					12%  { opacity: 0.85; }
					88%  { opacity: 0.85; }
					100% { transform: translateY(800px); opacity: 0; }
				}
				.vhero-trail {
					animation-name: vhero-trail;
					animation-iteration-count: infinite;
					animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1);
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
