"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const Counter = () => {
	const sectionRef = useRef<HTMLElement>(null);
	const [inView, setInView] = useState(false);
	const t = useTranslations("homepage.counter");

	useEffect(() => {
		const el = sectionRef.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			([entry]) => setInView(entry.isIntersecting),
			{ rootMargin: "200px" },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	return (
		<section ref={sectionRef} className='relative overflow-hidden border-t border-white/5 bg-[#090911] py-8 sm:py-10 lg:py-14'>
			<style>{`
				.vcounter-paused * { animation-play-state: paused !important; }
				@keyframes vcounter-float {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-6px); }
				}
				@keyframes vcounter-pulse-ring {
					0% { transform: scale(0.9); opacity: 0.5; }
					50% { transform: scale(1.1); opacity: 0.2; }
					100% { transform: scale(0.9); opacity: 0.5; }
				}
			`}</style>

			<div className={`mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0 ${!inView ? 'vcounter-paused' : ''}`}>
				<p className='mb-6 text-center text-sm font-semibold text-white sm:mb-8 sm:text-base'>
					{t("tagline")}
				</p>

				{/* Bento grid: 2 cols desktop, 1 col mobile */}
				<div className='grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2'>

					{/* ── Left column ── */}
					<div className='flex flex-col gap-3 sm:gap-4'>
						{/* Quick Start */}
						<div className='group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-emerald-500/20 hover:bg-white/[0.04] sm:p-6'>
							<div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10'>
								<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 text-emerald-400'>
									<path d='M11 2L4.5 11.5H10L9 18L15.5 8.5H10L11 2Z' />
								</svg>
							</div>
							<div>
								<h3 className='text-sm font-semibold text-white sm:text-base'>{t("quick_start_title")}</h3>
								<p className='mt-0.5 text-xs text-zinc-400 sm:text-sm'>{t("quick_start_desc")}</p>
							</div>
						</div>

						{/* Full Visibility — radar with sweep, semantic match for
						    "15 mil sinais por ciclo" (scanning breadth, not time).
						    Violet was the marketing surface's "AI brand" signature
						    and doesn't exist anywhere in the authenticated product;
						    emerald keeps the visibility metaphor without breaking
						    cohesion with the Plano's restricted palette. */}
						<div className='group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-emerald-500/20 hover:bg-white/[0.04] sm:p-6'>
							<div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10'>
								<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 text-emerald-400'>
									<circle cx='10' cy='10' r='7' />
									<circle cx='10' cy='10' r='3.5' />
									<path d='M10 10L15.5 4.5' />
									<circle cx='10' cy='10' r='0.6' fill='currentColor' stroke='none' />
								</svg>
							</div>
							<div>
								<h3 className='text-sm font-semibold text-white sm:text-base'>{t("visibility_title")}</h3>
								<p className='mt-0.5 text-xs text-zinc-400 sm:text-sm'>{t("visibility_desc")}</p>
							</div>
						</div>

						{/* 4X ROI Guarantee — hero card */}
						<div className='relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#0a0a14] to-[#0d1a12] p-8 sm:p-10 lg:flex-1'>
							{/* Animated background elements */}
							<div className='pointer-events-none absolute inset-0'>
								<div className='absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/10' style={{ animation: 'vcounter-pulse-ring 4s ease-in-out infinite' }} />
								<div className='absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/[0.06]' style={{ animation: 'vcounter-pulse-ring 4s ease-in-out infinite 1s' }} />
								{/* Floating diamonds */}
								<div className='absolute left-[15%] top-[30%] h-2 w-2 rotate-45 bg-emerald-400/40' style={{ animation: 'vcounter-float 3s ease-in-out infinite' }} />
								<div className='absolute bottom-[25%] right-[20%] h-2 w-2 rotate-45 bg-emerald-400/30' style={{ animation: 'vcounter-float 3s ease-in-out infinite 1.5s' }} />
								<div className='absolute bottom-[40%] left-[25%] h-1.5 w-1.5 rotate-45 bg-emerald-400/20' style={{ animation: 'vcounter-float 4s ease-in-out infinite 0.5s' }} />
							</div>

							<div className='relative text-center'>
								<span className='font-display text-[5rem] font-bold leading-none tracking-tighter sm:text-[6.5rem] lg:text-[8rem]' style={{ background: 'linear-gradient(to bottom, #34d399 0%, #34d399 60%, rgba(52,211,153,0.3) 85%, transparent 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 8px 32px rgba(16,185,129,0.3))' }}>
									4X
								</span>
								<h3 className='mt-2 text-lg font-bold text-white sm:text-xl'>{t("roi_title")}</h3>
								<p className='mx-auto mt-1 max-w-[280px] text-sm text-zinc-400 sm:max-w-[320px]'>{t("roi_subtitle")}</p>
							</div>
						</div>
					</div>

					{/* ── Right column (desktop only) ── */}
					<div className='hidden flex-col gap-3 sm:gap-4 lg:flex'>
						{/* Vestigio Pulse — large visual card. Click scrolls back
						    to the demo video at the top of the page (DemoSurface). */}
						<a
							href='#demo-video'
							onClick={(e) => {
								e.preventDefault();
								document.getElementById('demo-video')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
							}}
							className='group relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/[0.04]'
							aria-label={t("pulse_title")}
						>
							{/* "Tese do mês" card — formerly a radar/pulse metaphor
							    for the Vestigio Pulse chat. Pulse is dead (Wave 22.8),
							    and the radar's expanding rings + breathing core fight
							    the editorial register the actual Plano sets. Stripped
							    to a quiet typographic pull-quote: serif quote glyph
							    over static dashed concentric rings (ambient depth,
							    no infinite loops), serif title (Fraunces matches the
							    Plano's MonthlyThesis pattern), then desc + CTA. */}
							{/* Static dashed concentric rings — ambient depth only,
							    no animation. Plano uses a Notion-style dotted grid;
							    these dashed rings are the marketing-card analogue. */}
							<div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
								<div className='absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/[0.05]' />
								<div className='absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/[0.07]' />
								<div className='absolute left-1/2 top-1/2 h-[100px] w-[100px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/[0.09]' />

								{/* Decorative serif quote glyph — mirrors the Plano's
								    MonthlyThesis pull-quote pattern. The serif is the
								    editorial signal; the rings are the ambient frame. */}
								<div className='absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2 font-serif text-[7rem] leading-none text-emerald-400/30 select-none' aria-hidden>“</div>
							</div>

							<div className='relative mt-auto pt-32 text-center'>
								<p className='mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/70'>{t("pulse_title")}</p>
								<p className='mx-auto max-w-[280px] font-serif text-base italic leading-snug text-zinc-300 sm:text-lg'>{t("pulse_desc")}</p>
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
							{/* Continuous Monitoring — EKG/heartbeat line, semantic
							    match for "Regressões em horas, não dias" (continuous
							    detection with a spike when something breaks). */}
							<div className='group flex flex-1 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-emerald-500/20 hover:bg-white/[0.04]'>
								<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10'>
									<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-4.5 w-4.5 text-sky-400'>
										<path d='M2 10h3l2-4 3 8 2-6 2 2h4' />
									</svg>
								</div>
								<div>
									<h3 className='text-sm font-semibold text-white'>{t("monitoring_title")}</h3>
									<p className='mt-0.5 text-[11px] text-zinc-500'>{t("monitoring_desc")}</p>
								</div>
							</div>

							{/* Integrations */}
							<div className='group flex flex-1 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-emerald-500/20 hover:bg-white/[0.04]'>
								<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10'>
									<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-4.5 w-4.5 text-amber-400'>
										<rect x='2' y='2' width='7' height='7' rx='1.5' />
										<rect x='11' y='2' width='7' height='7' rx='1.5' />
										<rect x='2' y='11' width='7' height='7' rx='1.5' />
										<rect x='11' y='11' width='7' height='7' rx='1.5' />
									</svg>
								</div>
								<div>
									<h3 className='text-sm font-semibold text-white'>{t("integrations_title")}</h3>
									<p className='mt-0.5 text-[11px] text-zinc-500'>{t("integrations_desc")}</p>
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
