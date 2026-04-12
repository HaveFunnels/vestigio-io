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
								@keyframes vneural-pulse {
									0%, 100% { opacity: 0.4; transform: scale(1); }
									50% { opacity: 1; transform: scale(1.3); }
								}
								@keyframes vneural-travel-1 {
									0% { offset-distance: 0%; opacity: 0; }
									10% { opacity: 1; }
									90% { opacity: 1; }
									100% { offset-distance: 100%; opacity: 0; }
								}
								@keyframes vneural-travel-2 {
									0% { offset-distance: 0%; opacity: 0; }
									10% { opacity: 1; }
									90% { opacity: 1; }
									100% { offset-distance: 100%; opacity: 0; }
								}
								@keyframes vneural-travel-3 {
									0% { offset-distance: 0%; opacity: 0; }
									10% { opacity: 1; }
									90% { opacity: 1; }
									100% { offset-distance: 100%; opacity: 0; }
								}
								@keyframes vneural-line-glow {
									0%, 100% { opacity: 0.12; }
									50% { opacity: 0.25; }
								}
							`}</style>
							{/* Neural network visualization */}
							<div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
								<svg viewBox='0 0 300 220' className='h-full w-full' fill='none'>
									{/* Synapse lines */}
									<line x1='70' y1='55' x2='150' y2='40' stroke='rgba(16,185,129,0.15)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite' }} />
									<line x1='70' y1='55' x2='180' y2='110' stroke='rgba(139,92,246,0.12)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 0.5s' }} />
									<line x1='150' y1='40' x2='240' y2='65' stroke='rgba(16,185,129,0.15)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 1s' }} />
									<line x1='150' y1='40' x2='180' y2='110' stroke='rgba(251,191,36,0.12)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 1.5s' }} />
									<line x1='240' y1='65' x2='180' y2='110' stroke='rgba(16,185,129,0.15)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 0.8s' }} />
									<line x1='55' y1='140' x2='180' y2='110' stroke='rgba(139,92,246,0.12)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 2s' }} />
									<line x1='55' y1='140' x2='130' y2='175' stroke='rgba(251,191,36,0.12)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 1.2s' }} />
									<line x1='180' y1='110' x2='130' y2='175' stroke='rgba(16,185,129,0.15)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 0.3s' }} />
									<line x1='180' y1='110' x2='250' y2='160' stroke='rgba(139,92,246,0.12)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 1.8s' }} />
									<line x1='130' y1='175' x2='250' y2='160' stroke='rgba(16,185,129,0.15)' strokeWidth='1' style={{ animation: 'vneural-line-glow 4s ease-in-out infinite 2.5s' }} />

									{/* Traveling dots along paths */}
									<circle r='2' fill='#34d399' style={{ offsetPath: "path('M 70 55 L 150 40')", animation: 'vneural-travel-1 3s linear infinite' }} />
									<circle r='2' fill='#a78bfa' style={{ offsetPath: "path('M 150 40 L 240 65')", animation: 'vneural-travel-2 3.5s linear infinite 0.8s' }} />
									<circle r='2' fill='#fbbf24' style={{ offsetPath: "path('M 180 110 L 130 175')", animation: 'vneural-travel-3 4s linear infinite 1.5s' }} />
									<circle r='1.5' fill='#34d399' style={{ offsetPath: "path('M 55 140 L 180 110')", animation: 'vneural-travel-1 3.2s linear infinite 2s' }} />
									<circle r='1.5' fill='#a78bfa' style={{ offsetPath: "path('M 240 65 L 180 110')", animation: 'vneural-travel-2 2.8s linear infinite 0.5s' }} />

									{/* Nodes */}
									<circle cx='70' cy='55' r='5' fill='#34d399' opacity='0.6' style={{ animation: 'vneural-pulse 3s ease-in-out infinite' }} />
									<circle cx='70' cy='55' r='2.5' fill='#34d399' />
									<circle cx='150' cy='40' r='5' fill='#a78bfa' opacity='0.6' style={{ animation: 'vneural-pulse 3s ease-in-out infinite 0.5s' }} />
									<circle cx='150' cy='40' r='2.5' fill='#a78bfa' />
									<circle cx='240' cy='65' r='5' fill='#34d399' opacity='0.6' style={{ animation: 'vneural-pulse 3s ease-in-out infinite 1s' }} />
									<circle cx='240' cy='65' r='2.5' fill='#34d399' />
									<circle cx='180' cy='110' r='7' fill='#34d399' opacity='0.5' style={{ animation: 'vneural-pulse 3s ease-in-out infinite 1.5s' }} />
									<circle cx='180' cy='110' r='3.5' fill='#34d399' />
									<circle cx='55' cy='140' r='5' fill='#fbbf24' opacity='0.5' style={{ animation: 'vneural-pulse 3s ease-in-out infinite 2s' }} />
									<circle cx='55' cy='140' r='2.5' fill='#fbbf24' />
									<circle cx='130' cy='175' r='5' fill='#a78bfa' opacity='0.5' style={{ animation: 'vneural-pulse 3s ease-in-out infinite 2.5s' }} />
									<circle cx='130' cy='175' r='2.5' fill='#a78bfa' />
									<circle cx='250' cy='160' r='5' fill='#fbbf24' opacity='0.5' style={{ animation: 'vneural-pulse 3s ease-in-out infinite 0.8s' }} />
									<circle cx='250' cy='160' r='2.5' fill='#fbbf24' />
								</svg>
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
