import Link from "next/link";

const FeaturesWithImage = () => {
	return (
		<section id="solutions" className='overflow-hidden border-t border-white/5 bg-[#090911] py-16 sm:py-20 lg:py-28 xl:py-32'>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				{/* Section header */}
				<div className='mx-auto mb-12 max-w-[600px] text-center sm:mb-16'>
					<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl'>
						Build, launch, and scale with confidence
					</h2>
					<p className='text-sm text-gray-400 sm:text-base'>
						From initial audit to continuous monitoring, Vestigio covers
						your entire SaaS lifecycle.
					</p>
				</div>

				{/* Feature blocks */}
				<div className='grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2'>
					{/* Block 1 */}
					<div className='rounded-[1rem] border border-white/5 bg-white/[0.02] p-6 sm:p-8 lg:p-10'>
						<div className='mb-4 flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-emerald-500/10 text-emerald-400'>
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
							</svg>
						</div>
						<h3 className='mb-3 text-xl font-semibold text-white'>
							Intelligence Dashboard
						</h3>
						<p className='mb-5 text-sm leading-relaxed text-gray-400'>
							A unified view of your platform&apos;s health. Actions, workspaces, findings, and
							maps — all connected through an intelligence layer that surfaces what matters.
						</p>
						<ul className='flex flex-col gap-2.5'>
							{["Prioritized action items", "Workspace-level analysis", "Evidence-backed findings", "Interactive dependency maps"].map((feature) => (
								<li key={feature} className='flex items-center gap-2.5 text-sm text-gray-300'>
									<svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
									{feature}
								</li>
							))}
						</ul>
					</div>

					{/* Block 2 */}
					<div className='rounded-[1rem] border border-white/5 bg-white/[0.02] p-6 sm:p-8 lg:p-10'>
						<div className='mb-4 flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-purple-500/10 text-purple-400'>
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
							</svg>
						</div>
						<h3 className='mb-3 text-xl font-semibold text-white'>
							AI-Powered Analysis
						</h3>
						<p className='mb-5 text-sm leading-relaxed text-gray-400'>
							A Claude-powered intelligence engine that understands your platform context.
							Ask questions, get structured answers, and receive proactive recommendations.
						</p>
						<ul className='flex flex-col gap-2.5'>
							{["Natural language queries", "Evidence-cited responses", "Corroboration scoring", "Context-aware recommendations"].map((feature) => (
								<li key={feature} className='flex items-center gap-2.5 text-sm text-gray-300'>
									<svg className="h-4 w-4 shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
									{feature}
								</li>
							))}
						</ul>
					</div>
				</div>

				{/* CTA */}
				<div className='mt-8 text-center sm:mt-12'>
					<Link
						href='/auth/signup'
						className='inline-flex rounded-[1rem] bg-white px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-emerald-400'
					>
						Start your first audit
					</Link>
				</div>
			</div>
		</section>
	);
};

export default FeaturesWithImage;
