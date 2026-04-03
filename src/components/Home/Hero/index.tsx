import Link from "next/link";

const Hero = () => {
	return (
		<section className='relative z-1 overflow-hidden pb-20 pt-36 lg:pb-28 lg:pt-44 xl:pb-32 xl:pt-52'>
			{/* Gradient background */}
			<div className='absolute inset-0 -z-1'>
				<div className='absolute inset-0 bg-gradient-to-b from-[#0a1a0a] via-[#090911] to-[#090911]' />
				<div className='absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-900/20 blur-[120px]' />
			</div>

			<div className='mx-auto w-full max-w-[900px] px-4 text-center sm:px-8 xl:px-0'>
				<h1 className='mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-[68px]'>
					Put your SaaS
					<br />
					intelligence on autopilot
				</h1>

				<p className='mx-auto mb-10 w-full max-w-[620px] text-lg leading-relaxed text-gray-400'>
					Vestigio is the intelligence layer that audits, monitors, and optimizes
					your SaaS platform. Evidence-based decisions and actionable insights,
					so you can focus on growth.
				</p>

				<div className='flex items-center justify-center gap-4'>
					<Link
						href='/auth/signup'
						className='rounded-[1rem] bg-white px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100'
					>
						Get started
					</Link>
					<Link
						href='/auth/signin'
						className='rounded-[1rem] border border-white/20 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5'
					>
						Try demo
					</Link>
				</div>
			</div>

			{/* Brand showcase */}
			<div className='mx-auto mt-24 w-full max-w-[1170px] px-4 sm:px-8 xl:mt-32 xl:px-0'>
				<div className='flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-40'>
					{["HUBX", "MacPaw", "Runna", "GeoGuessr", "Linear"].map((brand) => (
						<span
							key={brand}
							className='text-lg font-bold tracking-wider text-white'
						>
							{brand}
						</span>
					))}
				</div>
			</div>
		</section>
	);
};

export default Hero;
