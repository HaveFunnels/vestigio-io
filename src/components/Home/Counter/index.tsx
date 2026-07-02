"use client";

/**
 * Home > Counter — "Pra quem não escala no escuro." (editorial rewrite 2026-06-21).
 *
 * 6-card bento section that pitches: Quick Start, Full Visibility, the 4×
 * Guarantee (brand identity centerpiece), the Tese do mês (editorial
 * signature, refactored earlier), Continuous Monitoring, and Integrations.
 *
 * This rewrite:
 *   - Drops the 4× card's infinite loops (vcounter-pulse-ring + vcounter-float
 *     diamonds) — replaced with static dashed concentric rings mirroring
 *     the Tese card across the grid
 *   - Drops the 4X card's font-display gradient text + drop-shadow filter
 *     (heavy SaaS treatment) — replaced with Fraunces serif solid emerald
 *     numeral, multiplication symbol "×" instead of "X" (typographically
 *     correct + editorial)
 *   - Migrates all card surfaces from bespoke `border-white/[0.06]
 *     bg-white/[0.02]` to product design tokens `border-edge bg-surface-card`
 *     so the section visually matches the authenticated Plano
 *   - Migrates text colors to `text-content-*` tokens
 *   - Drops the IntersectionObserver + vcounter-paused mechanism (was used
 *     to pause the infinite animations when offscreen — moot now)
 */

import { useTranslations } from "next-intl";

const Counter = () => {
	const t = useTranslations("homepage.counter");

	return (
		<section className='relative overflow-hidden border-t border-edge bg-[#090911] py-10 sm:py-14 lg:py-20'>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<p className='mb-8 text-center text-sm font-semibold text-content sm:mb-10 sm:text-base'>
					{t("tagline")}
				</p>

				{/* Bento grid — 2 cols desktop, stacked on mobile */}
				<div className='grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2'>

					{/* ── Left column ── */}
					<div className='flex flex-col gap-3 sm:gap-4'>
						{/* Quick Start */}
						<div className='group flex items-center gap-4 rounded-2xl border border-edge bg-surface-card p-5 transition-colors hover:border-edge-focus sm:p-6'>
							<div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10'>
								<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 text-emerald-400'>
									<path d='M11 2L4.5 11.5H10L9 18L15.5 8.5H10L11 2Z' />
								</svg>
							</div>
							<div>
								<h3 className='text-sm font-semibold text-content sm:text-base'>{t("quick_start_title")}</h3>
								<p className='mt-0.5 text-xs text-content-muted sm:text-sm'>{t("quick_start_desc")}</p>
							</div>
						</div>

						{/* Full Visibility — radar icon, semantic match for "15 mil sinais por
						    ciclo". Icon kept neutral (zinc) so it doesn't compete with the
						    emerald 4× card below and the Tese card across; emerald is
						    reserved for action/identity moments. */}
						<div className='group flex items-center gap-4 rounded-2xl border border-edge bg-surface-card p-5 transition-colors hover:border-edge-focus sm:p-6'>
							<div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-500/10'>
								<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 text-zinc-300'>
									<circle cx='10' cy='10' r='7' />
									<circle cx='10' cy='10' r='3.5' />
									<path d='M10 10L15.5 4.5' />
									<circle cx='10' cy='10' r='0.6' fill='currentColor' stroke='none' />
								</svg>
							</div>
							<div>
								<h3 className='text-sm font-semibold text-content sm:text-base'>{t("visibility_title")}</h3>
								<p className='mt-0.5 text-xs text-content-muted sm:text-sm'>{t("visibility_desc")}</p>
							</div>
						</div>

						{/* 4× Guarantee — brand identity centerpiece. Editorial display
						    numeral in Fraunces serif (matches the rest of the homepage
						    typography signature). Static dashed concentric rings mirror
						    the Tese card across the grid — ambient depth, no infinite
						    loops. Solid emerald (no gradient text, no drop-shadow
						    filter); the typography weight carries the brand, not effects. */}
						<div className='relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-edge bg-surface-card p-8 sm:p-10 lg:flex-1'>
							<div className='pointer-events-none absolute inset-0 flex items-center justify-center' aria-hidden>
								<div className='absolute h-[260px] w-[260px] rounded-full border border-dashed border-emerald-500/[0.06]' />
								<div className='absolute h-[180px] w-[180px] rounded-full border border-dashed border-emerald-500/[0.09]' />
								<div className='absolute h-[100px] w-[100px] rounded-full border border-dashed border-emerald-500/[0.12]' />
							</div>

							<div className='relative text-center'>
								<span className='text-[4rem] font-bold leading-none tracking-tighter text-emerald-400 tabular-nums sm:text-[5.5rem] lg:text-[6.5rem]'>
									4×
								</span>
								<h3 className='mt-3 text-base font-semibold text-content sm:text-lg'>{t("roi_title")}</h3>
								<p className='mx-auto mt-1.5 max-w-[280px] text-sm text-content-muted sm:max-w-[320px]'>{t("roi_subtitle")}</p>
							</div>
						</div>
					</div>

					{/* ── Right column (desktop only) ── */}
					<div className='hidden flex-col gap-3 sm:gap-4 lg:flex'>
						{/* Tese do mês — editorial pull-quote card (refactored earlier).
						    Mirrors the Plano's MonthlyThesis pattern: decorative serif
						    quote glyph + dashed concentric rings (ambient depth, static)
						    + serif italic body. Click scrolls to the demo video at the
						    top of the page. */}
						<a
							href='#demo-video'
							onClick={(e) => {
								e.preventDefault();
								document.getElementById('demo-video')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
							}}
							className='group relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-edge bg-surface-card p-8 transition-colors hover:border-edge-focus'
							aria-label={t("pulse_title")}
						>
							<div className='pointer-events-none absolute inset-0 flex items-center justify-center' aria-hidden>
								<div className='absolute h-[260px] w-[260px] rounded-full border border-dashed border-white/[0.04]' />
								<div className='absolute h-[180px] w-[180px] rounded-full border border-dashed border-white/[0.06]' />
								<div className='absolute h-[100px] w-[100px] rounded-full border border-dashed border-white/[0.08]' />
								<div className='absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2 text-[7rem] font-bold leading-none text-white/15 select-none'>“</div>
							</div>

							<div className='relative mt-auto pt-32 text-center'>
								<p className='mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint'>{t("pulse_title")}</p>
								<p className='mx-auto max-w-[280px] text-base font-medium leading-snug text-content-secondary sm:text-lg'>{t("pulse_desc")}</p>
								<span className='mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400/70 transition-colors group-hover:text-emerald-300'>
									{t("pulse_cta")}
									<svg className='h-3 w-3 transition-transform group-hover:translate-x-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth='2'>
										<path strokeLinecap='round' strokeLinejoin='round' d='M17 8l4 4m0 0l-4 4m4-4H3' />
									</svg>
								</span>
							</div>
						</a>

						{/* Bottom two small cards */}
						<div className='flex gap-3 sm:gap-4'>
							{/* Continuous Monitoring — EKG icon for "Regressões em horas, não dias" */}
							<div className='group flex flex-1 items-center gap-3 rounded-2xl border border-edge bg-surface-card p-5 transition-colors hover:border-edge-focus'>
								<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10'>
									<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-4.5 w-4.5 text-sky-400'>
										<path d='M2 10h3l2-4 3 8 2-6 2 2h4' />
									</svg>
								</div>
								<div>
									<h3 className='text-sm font-semibold text-content'>{t("monitoring_title")}</h3>
									<p className='mt-0.5 text-[11px] text-content-faint'>{t("monitoring_desc")}</p>
								</div>
							</div>

							{/* Integrations */}
							<div className='group flex flex-1 items-center gap-3 rounded-2xl border border-edge bg-surface-card p-5 transition-colors hover:border-edge-focus'>
								<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10'>
									<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-4.5 w-4.5 text-amber-400'>
										<rect x='2' y='2' width='7' height='7' rx='1.5' />
										<rect x='11' y='2' width='7' height='7' rx='1.5' />
										<rect x='2' y='11' width='7' height='7' rx='1.5' />
										<rect x='11' y='11' width='7' height='7' rx='1.5' />
									</svg>
								</div>
								<div>
									<h3 className='text-sm font-semibold text-content'>{t("integrations_title")}</h3>
									<p className='mt-0.5 text-[11px] text-content-faint'>{t("integrations_desc")}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Counter;
