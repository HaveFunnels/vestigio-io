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
import TrustMicrocopy from "./TrustMicrocopy";
import { ShinyButton } from "@/components/ui/shiny-button";

// Pill icons and the pill interaction state live in HeroPills.tsx —
// this file only orchestrates the hero layout. CTAs moved to
// ProductTour so they sit below the product proof surface.

// Vestigio trails (4 vertical rails with descending emerald pulses,
// 16-22s loops) were removed 2026-06-20 as part of the homepage cohesion
// pass: the authenticated Plano has zero infinite-loop animations and
// the trails were an always-on attention magnet fighting the editorial
// register. The halos + hero gradient already carry ambient depth.

// (BrowserShell deleted — moved to ProductTour/index.tsx)

/* ──────────────────────────────────────────────────────────────────
 * Section
 * ──────────────────────────────────────────────────────────────── */

const Hero = async ({ i18nNamespace = "homepage.hero_v2", primaryCtaHref = "/audit" }: { i18nNamespace?: string; primaryCtaHref?: string } = {}) => {
	const t = await getTranslations(i18nNamespace);
	const pills = t.raw("pills") as Pill[];

	// No brush underline — removed per user feedback ("não está
	// surtindo o efeito que deveria").

	return (
		<section className='relative z-1 pb-2 pt-28 sm:pb-3 sm:pt-32 lg:pb-4 lg:pt-40'>
			{/* Component-scoped keyframes — `vhero-` prefix avoids global
			    collisions with the rest of the app. */}
			<style>{`
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
			    can bleed out.

			    Mobile blur reduced from 100px → 60px: the blur op runs on
			    every paint at the larger radius (which on a 360px-wide
			    device is ~17% of viewport — heavy GPU work during LCP).
			    60px still reads as a soft glow at the opacity used here.

			    content-visibility:auto lets the browser skip painting
			    this wrapper entirely when it scrolls offscreen — without
			    it, the halo's 200%-tall box keeps consuming paint cycles
			    even when below the fold. */}
			<div
				className='pointer-events-none absolute -inset-x-40 -top-20 -z-1 h-[200%]'
				style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 1200px' }}
				aria-hidden
			>
				<div className='absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-emerald-500/[0.04] blur-[60px] sm:h-[700px] sm:w-[1100px] sm:bg-emerald-500/[0.07] sm:blur-[120px]' />
				<div className='absolute left-1/2 top-[300px] h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-500/[0.03] blur-[60px] sm:h-[600px] sm:w-[1000px] sm:bg-indigo-500/[0.05] sm:blur-[120px]' />
			</div>

			{/* Announcement banner lives in the site layout now
			    (src/components/AnnouncementBanner) so it sits above the
			    header on the very first paint and auto-hides on scroll. */}

			{/* ─────────── Headline + subtitle + pills + CTAs ─────────── */}
			<div className='relative mx-auto w-full max-w-[1000px] px-4 text-center sm:px-8 xl:px-0'>
				{/* H1 now sets in Fraunces (font-serif) at medium weight — the
				    copy ("Um Plano de Estratégia / por mês. / Escrito, não
				    gerado.") is editorial register, so the serif earns its
				    place (not costume drama).
				    Line 3 takes italic + muted as the anti-AI-slop signature
				    ("Escrito, não gerado" — the phrase the council flagged
				    as the single most positioning-dense line available).
				    The old emerald gradient is dropped (color-on-text is the
				    template move; the typography carries identity now). */}
				{/* Scale reduced 2026-06-21 per frontend-design audit: at the
				    previous xl text-[4.25rem] (68px), the first line "Tem
				    dinheiro vazando na sua operação." (40 chars in Fraunces)
				    didn't fit in the max-w-[1000px] container and forced
				    "operação." into an orphan line. Editorial publications
				    (Atlantic feature openers, FT Weekend ledes) size around
				    50-60px for similar-length headlines; 3.5rem (56px) lands
				    in that range without sacrificing weight. lg + sm scales
				    were also brought down for cascade consistency. */}
				<h1 className='mb-5 font-serif text-[2rem] font-medium leading-[1.1] tracking-tight text-zinc-100 sm:mb-6 sm:text-[2.5rem] lg:text-[3.25rem] xl:text-[3.5rem]'>
					{t("headline_part1") && <span className='block'>{t("headline_part1")}</span>}
					{t("headline_part2") && <span className='block'>{t("headline_part2")}</span>}
					{t("headline_part3") && (
						<span className='mt-1 block font-normal italic text-content-secondary sm:mt-2'>
							{t("headline_part3")}
						</span>
					)}
				</h1>

				<p className='mx-auto mb-8 w-full max-w-[680px] text-base leading-relaxed text-zinc-400 sm:mb-10 sm:text-lg'>
					{t("subtitle_before_bold") ? (
						<>
							{t("subtitle_line1") && <><span>{t("subtitle_line1")}</span><br className='sm:hidden' />{" "}</>}
							{t("subtitle_before_bold")}
							<strong className='font-semibold text-zinc-300'>{t("subtitle_bold")}</strong>
							{t("subtitle_after_bold")}
						</>
					) : (
						t("subtitle")
					)}
				</p>

				{/* 5 interactive impact / solution pills — client component.
				    Each card uses a liquid-fill animation to invert from
				    dark + pain → emerald + solution when clicked. See
				    HeroPills.tsx. */}
				<HeroPills pills={pills} />

				{/* Primary CTA — visible above the fold, before the
				    visitor scrolls into the Product Tour. The button
				    carries its own href so it renders as a single <a>;
				    wrapping <ShinyButton> in <Link> previously produced
				    <a><button>, which HTML5 forbids and SEO auditors
				    flag as a closing-tag mismatch. */}
				<div className="mt-8 sm:mt-10">
					{/* data-vtg-cta picked up by the delegated click listener
					    in components/analytics/TrackingScript — fires a
					    cta_click event with target="hero-primary". Stable
					    name; don't rename without updating the funnel view. */}
					<ShinyButton href={primaryCtaHref} data-vtg-cta="hero-primary">{t("cta_primary")}</ShinyButton>
					{/* Trust microcopy — subtle guarantee + platform signals */}
					<TrustMicrocopy />
				</div>

			</div>

			{/* The product proof surface (browser shell with the action
			    queue, AI assistant, and recovery callout) used to live
			    here. It moved to the ProductTour section so the homepage
			    only has ONE product mockup instead of two. */}
		</section>
	);
};

export default Hero;
