"use client";

import { useEffect, useRef, useState } from "react";

const Counter = () => {
	const sectionRef = useRef<HTMLElement>(null);
	const [inView, setInView] = useState(false);

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
		<section ref={sectionRef} className='relative overflow-hidden border-t border-white/5 bg-[#090911] py-14 sm:py-16 lg:py-20'>
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
					Feito pra quem não aceita escalar no escuro.
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
								<h3 className='text-sm font-semibold text-white sm:text-base'>Quick Start</h3>
								<p className='mt-0.5 text-xs text-zinc-400 sm:text-sm'>Comece em segundos, apenas com seu domínio.</p>
							</div>
						</div>

						{/* Visibilidade Completa */}
						<div className='group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-emerald-500/20 hover:bg-white/[0.04] sm:p-6'>
							<div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10'>
								<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 text-violet-400'>
									<circle cx='10' cy='10' r='7' />
									<path d='M10 6v4l2.5 2.5' />
								</svg>
							</div>
							<div>
								<h3 className='text-sm font-semibold text-white sm:text-base'>Visibilidade Completa</h3>
								<p className='mt-0.5 text-xs text-zinc-400 sm:text-sm'>Mais de 15 mil sinais analisados automaticamente.</p>
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
								<div className='absolute bottom-[40%] left-[25%] h-1.5 w-1.5 rotate-45 bg-violet-400/30' style={{ animation: 'vcounter-float 4s ease-in-out infinite 0.5s' }} />
							</div>

							<div className='relative text-center'>
								<div className='relative inline-block'>
									<svg className='h-[5rem] sm:h-[6.5rem] lg:h-[8rem]' viewBox='0 0 180 100' aria-label='4X'>
										<defs>
											<linearGradient id='roi-text-grad' x1='0' y1='0' x2='0' y2='1'>
												<stop offset='0%' stopColor='#34d399' />
												<stop offset='85%' stopColor='#34d399' stopOpacity='0.5' />
												<stop offset='100%' stopColor='#0d1a12' stopOpacity='0' />
											</linearGradient>
										</defs>
										<text x='50%' y='80%' textAnchor='middle' fill='url(#roi-text-grad)' className='font-display' style={{ fontSize: '90px', fontWeight: 700, letterSpacing: '-0.05em', filter: 'drop-shadow(0 12px 48px rgba(16,185,129,0.3)) drop-shadow(0 4px 16px rgba(16,185,129,0.2))' }}>4X</text>
									</svg>
								</div>
								<h3 className='mt-2 text-lg font-bold text-white sm:text-xl'>ROI Guarantee</h3>
								<p className='mt-1 text-sm text-zinc-400'>Você literalmente não tem como perder.</p>
							</div>
						</div>
					</div>

					{/* ── Right column (desktop only) ── */}
					<div className='hidden flex-col gap-3 sm:gap-4 lg:flex'>
						{/* Vestigio Pulse — large visual card */}
						<div className='relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8'>
							<style>{`
								@keyframes vpulse-ring-expand {
									0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0.5; }
									100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
								}
								@keyframes vpulse-core-breathe {
									0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
									50% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
								}
							`}</style>
							{/* Pulse radar — concentric rings radiating from center */}
							<div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
								{/* Static concentric rings */}
								<div className='absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/[0.06]' />
								<div className='absolute left-1/2 top-1/2 h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/[0.08]' />
								<div className='absolute left-1/2 top-1/2 h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/[0.10]' />

								{/* Expanding pulse rings — staggered */}
								<div className='absolute left-1/2 top-1/2 h-[200px] w-[200px] rounded-full border border-emerald-400/20' style={{ animation: 'vpulse-ring-expand 4s cubic-bezier(0.4, 0, 0.2, 1) infinite' }} />
								<div className='absolute left-1/2 top-1/2 h-[200px] w-[200px] rounded-full border border-emerald-400/15' style={{ animation: 'vpulse-ring-expand 4s cubic-bezier(0.4, 0, 0.2, 1) infinite 1.3s' }} />
								<div className='absolute left-1/2 top-1/2 h-[200px] w-[200px] rounded-full border border-emerald-400/10' style={{ animation: 'vpulse-ring-expand 4s cubic-bezier(0.4, 0, 0.2, 1) infinite 2.6s' }} />

								{/* Core glow */}
								<div className='absolute left-1/2 top-1/2 h-8 w-8 rounded-full bg-emerald-500/20' style={{ animation: 'vpulse-core-breathe 3s ease-in-out infinite', filter: 'blur(8px)' }} />

								{/* Center icon */}
								<div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
									<div className='flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]'>
										<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.4' className='h-6 w-6 text-emerald-400'>
											<path d='M4 4H20C20.5523 4 21 4.44772 21 5V17C21 17.5523 20.5523 18 20 18H9L4 22V5C4 4.44772 4.44772 4 5 4Z' strokeLinecap='round' strokeLinejoin='round' />
											<path d='M9 9H15M9 13H12' strokeLinecap='round' />
										</svg>
									</div>
								</div>
							</div>

							<div className='relative mt-auto pt-32 text-center'>
								<h3 className='text-lg font-bold text-white'>Vestigio Pulse</h3>
								<p className='mt-1 text-sm text-zinc-400'>Converse com seus dados. Pergunte, investigue, decida.</p>
							</div>
						</div>

						{/* Bottom two small cards */}
						<div className='flex gap-3 sm:gap-4'>
							{/* Monitoramento Contínuo */}
							<div className='group flex flex-1 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-emerald-500/20 hover:bg-white/[0.04]'>
								<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10'>
									<svg viewBox='0 0 20 20' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' className='h-4.5 w-4.5 text-sky-400'>
										<path d='M3 16V10M7 16V6M11 16V8M15 16V3' />
									</svg>
								</div>
								<div>
									<h3 className='text-sm font-semibold text-white'>Monitoramento Contínuo</h3>
									<p className='mt-0.5 text-[11px] text-zinc-500'>Ciclos automáticos de auditoria.</p>
								</div>
							</div>

							{/* Integrações */}
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
									<h3 className='text-sm font-semibold text-white'>Integrações</h3>
									<p className='mt-0.5 text-[11px] text-zinc-500'>Shopify, Stripe, GA e mais.</p>
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
