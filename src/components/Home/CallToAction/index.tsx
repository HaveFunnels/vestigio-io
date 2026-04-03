import Link from "next/link";

const CallToAction = () => {
	return (
		<section className='relative z-1 overflow-hidden bg-[#090911] py-20 lg:py-28'>
			<div className='mx-auto w-full max-w-[700px] px-4 text-center sm:px-8 xl:px-0'>
				{/* Gradient glow */}
				<div className='absolute left-1/2 top-1/2 h-[300px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-900/20 blur-[100px]' />

				<div className='relative'>
					<h2 className='mb-5 text-3xl font-bold tracking-tight text-white lg:text-4xl xl:text-5xl'>
						Ready to put your platform on autopilot?
					</h2>

					<p className='mb-8 text-base text-gray-400'>
						Join SaaS teams using Vestigio to automate auditing, detect regressions,
						and make evidence-based decisions.
					</p>

					<div className='flex items-center justify-center gap-4'>
						<Link
							href='/auth/signup'
							className='rounded-[1rem] bg-white px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100'
						>
							Get started free
						</Link>
						<Link
							href='/auth/signin'
							className='rounded-[1rem] border border-white/20 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5'
						>
							Try live demo
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
};

export default CallToAction;
