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
import TrustMicrocopy from "./TrustMicrocopy";
import { ShinyButton } from "@/components/ui/shiny-button";

interface HeroStat { value: string; label: string }

// HeroPills (4 pain→solution liquid-fill cards) removed 2026-06-21
// per frontend-design audit: pain→solution pills are a 2020-2022
// conversion trope; 2026 SaaS peers (Linear, Vercel, Anthropic) don't
// use them. Replaced with a concrete stat-strip (3 product facts in
// JetBrains Mono) — Stripe-style proof anchor rather than 4 generic
// rhetorical questions. The stat values are deliberately not
// fabricated specifics (no made-up R$ amount); they're the actual
// product facts: median leak count, R$ precision per finding, and
// prescribed actions per edition.

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
	const stats = t.raw("stats") as HeroStat[];

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
				{/* Scale reduced 2026-06-21 per frontend-design audit (orphan
				    word at xl). text-balance added for mobile/tablet
				    viewports where the long pain-hook clause necessarily
				    wraps — balance distributes the wrap into roughly equal
				    lines instead of letting "operação." or "quanto." orphan
				    on its own. On desktop (lg+) the type already fits one
				    line per part so balance is a no-op there, which is the
				    right behavior (editorial publications control desktop
				    headlines with sizing, not balance). */}
				<h1 className='mb-5 text-[1.875rem] font-semibold leading-[1.1] tracking-tight text-balance text-zinc-100 sm:mb-6 sm:text-[2.5rem] lg:text-[3.25rem] xl:text-[3.5rem]'>
					{t("headline_part1") && <span className='block'>{t("headline_part1")}</span>}
					{t("headline_part2") && <span className='block'>{t("headline_part2")}</span>}
					{t("headline_part3") && (
						<span className='mt-1 block font-normal italic text-content-secondary sm:mt-2'>
							{t("headline_part3")}
						</span>
					)}
				</h1>

				{/* Subtitle polishes per frontend-design audit:
				    - Width tightened: max-w-[680px] → max-w-[560px]
				    - Spacing increased: mb-8/mb-10 → mb-10/mb-12
				    - Color lifted: text-zinc-400 → text-zinc-300
				    - Emphasis via Fraunces serif italic on the key clause
				      ("onde…parar") — echoes the H1 typography signature
				      and creates an editorial micro-moment inside the
				      otherwise sans paragraph. */}
				<p className='mx-auto mb-10 w-full max-w-[560px] text-base leading-relaxed text-zinc-300 sm:mb-12 sm:text-lg'>
					{t("subtitle_before_bold") ? (
						<>
							{t("subtitle_line1") && <><span>{t("subtitle_line1")}</span><br className='sm:hidden' />{" "}</>}
							{t("subtitle_before_bold")}
							<em className='font-semibold not-italic text-zinc-100'>{t("subtitle_bold")}</em>
							{t("subtitle_after_bold")}
						</>
					) : (
						t("subtitle")
					)}
				</p>

				{/* Stat-strip — 3 concrete product facts (Stripe-style
				    proof anchor). Numbers in JetBrains Mono for visual
				    consistency with HeroMetrics inside the authenticated
				    Plano. Hairline `divide-x` rules between cells = the
				    editorial newspaper feature signature already used in
				    Features and ProductTour. Zinc-100 numbers + small
				    uppercase labels — no color accents (loss-frame
				    already lives in the H1; the strip stays neutral so
				    the data carries on its own).

				    Mobile vertical-alignment fix (2026-06-22):
				    At the original 16px value + 9px label sizes on
				    mobile, longer values ("Exact amount" / "9 vazamentos")
				    wrapped to 2 lines in their 92px content column while
				    shorter ones ("R$ exato" / "4 passos") stayed at 1
				    line — pushing the label below to different vertical
				    positions across columns. Labels themselves also wrap
				    inconsistently (some 1 line, some 2). Three changes:

				    1. Mobile padding px-2 → px-1.5 (more content area).
				    2. Mobile value font 16px → 12px + whitespace-nowrap,
				       so all 3 values stay on a single line (the typical
				       Portuguese widths fit at 12px JetBrains Mono in the
				       ~100px column).
				    3. Mobile label font 9px → 8px + min-h-[20px] on the
				       label container so labels that wrap to 2 lines and
				       labels that fit 1 line both reserve the same
				       vertical space. items-start anchors them all at
				       the top of that reserved area, so the start-of-text
				       baseline matches across all 3 columns. */}
				<dl className="mx-auto mb-8 grid max-w-[560px] grid-cols-3 divide-x divide-edge sm:mb-10 sm:max-w-[600px]">
					{stats.map((s, i) => (
						<div key={i} className="flex flex-col items-center px-1.5 text-center sm:px-3">
							<dt className="whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums leading-none text-zinc-100 sm:whitespace-normal sm:text-[20px] lg:text-[22px]">
								{s.value}
							</dt>
							<dd className="mt-2 flex min-h-[20px] items-start justify-center text-[8px] font-medium uppercase leading-tight tracking-[0.08em] text-content-faint sm:min-h-0 sm:items-center sm:text-[10px] sm:tracking-[0.14em]">
								{s.label}
							</dd>
						</div>
					))}
				</dl>

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
