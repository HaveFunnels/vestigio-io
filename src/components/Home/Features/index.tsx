const featuresData = [
	{
		title: "Automated Auditing",
		description:
			"Comprehensive analysis of your SaaS platform — compliance, performance, and security verified with evidence-based intelligence.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
			</svg>
		),
	},
	{
		title: "Change Detection",
		description:
			"Track regressions, improvements, and new issues across audit cycles. Know exactly what changed and why it matters.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
			</svg>
		),
	},
	{
		title: "Verification Lifecycle",
		description:
			"Static analysis meets browser verification. Track freshness, degradation, and trust strength across all findings.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
			</svg>
		),
	},
	{
		title: "AI-Powered Chat",
		description:
			"Ask questions about your platform's health in natural language. Get structured answers with evidence citations.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
			</svg>
		),
	},
	{
		title: "Actionable Insights",
		description:
			"Incidents, opportunities, and verification tasks organized by priority. Clear resolve paths for every issue found.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
			</svg>
		),
	},
	{
		title: "Continuous Monitoring",
		description:
			"Track how your platform evolves over time. Regression detection, improvement tracking, and trend analysis built in.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
				<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		),
	},
];

const Features = () => {
	return (
		<section
			id='features'
			className='relative z-1 overflow-hidden border-t border-white/5 bg-[#090911] py-16 sm:py-20 lg:py-28 xl:py-32'
		>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				{/* Section header */}
				<div className='mx-auto mb-12 max-w-[600px] text-center sm:mb-16'>
					<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl'>
						Everything you need to operate your SaaS
					</h2>
					<p className='text-sm text-gray-400 sm:text-base'>
						From automated auditing to AI-powered insights, Vestigio gives you the
						tools to make evidence-based decisions.
					</p>
				</div>

				<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3'>
					{featuresData.map((data, i) => (
						<div
							key={i}
							className='rounded-[1rem] border border-white/5 bg-white/[0.02] p-6 transition-colors hover:border-white/10 hover:bg-white/[0.04] sm:p-8'
						>
							<div className='mb-4 flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-emerald-500/10 text-emerald-400 sm:mb-5'>
								{data.icon}
							</div>
							<h3 className='mb-2 text-base font-semibold text-white sm:mb-3 sm:text-lg'>
								{data.title}
							</h3>
							<p className='text-sm leading-relaxed text-gray-400'>
								{data.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
};

export default Features;
