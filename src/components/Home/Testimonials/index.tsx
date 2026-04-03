"use client";

const testimonials = [
	{
		name: "Sarah Chen",
		role: "CTO, FinTech Startup",
		comment: "Vestigio caught compliance regressions our manual reviews kept missing. The evidence-based approach gives us confidence in every decision.",
	},
	{
		name: "Marcus Rivera",
		role: "VP Engineering, SaaS Platform",
		comment: "The continuous monitoring alone justified the investment. We detect issues before they reach customers now.",
	},
	{
		name: "Anna Kowalski",
		role: "Head of Product, E-commerce",
		comment: "The AI chat is incredible — I can ask questions about our platform health in plain English and get structured, cited answers.",
	},
];

const Testimonials = () => {
	return (
		<section className='relative z-1 overflow-hidden border-t border-white/5 bg-[#0d0d15] py-20 lg:py-28'>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				{/* Section header */}
				<div className='mx-auto mb-16 max-w-[600px] text-center'>
					<h2 className='mb-4 text-3xl font-bold tracking-tight text-white lg:text-4xl'>
						Loved by engineering teams
					</h2>
					<p className='text-base text-gray-400'>
						Teams trust Vestigio to keep their platforms healthy and their decisions evidence-based.
					</p>
				</div>

				<div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'>
					{testimonials.map((data, i) => (
						<div
							key={i}
							className='rounded-[1rem] border border-white/5 bg-white/[0.02] p-8 transition-colors hover:border-white/10'
						>
							<div className='mb-6 flex items-center gap-3'>
								<div className='flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-400'>
									{data.name.charAt(0)}
								</div>
								<div>
									<h3 className='text-sm font-semibold text-white'>
										{data.name}
									</h3>
									<p className='text-xs text-gray-500'>
										{data.role}
									</p>
								</div>
							</div>
							<p className='text-sm leading-relaxed text-gray-400'>
								&ldquo;{data.comment}&rdquo;
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
};

export default Testimonials;
