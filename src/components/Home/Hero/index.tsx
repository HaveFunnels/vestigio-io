import Link from "next/link";

interface HeroProps {
	// Optional CTA destination override. Default = signup flow.
	// /lp variant passes "/lp/audit" so the primary CTA jumps directly
	// into the anonymous lead funnel instead of asking for signup.
	primaryCtaHref?: string;
	primaryCtaLabel?: string;
}

const Hero = ({
	primaryCtaHref = "/auth/signup",
	primaryCtaLabel = "Get started",
}: HeroProps = {}) => {
	return (
		<section className='relative z-1 overflow-hidden pb-16 pt-24 sm:pb-20 sm:pt-28 lg:pb-28 lg:pt-44 xl:pb-32 xl:pt-52'>
			{/* Gradient background */}
			<div className='absolute inset-0 -z-1'>
				<div className='absolute inset-0 bg-gradient-to-b from-[#0a1a0a] via-[#090911] to-[#090911]' />
				<div className='absolute left-1/2 top-0 h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-emerald-900/20 blur-[100px] sm:h-[600px] sm:w-[800px] sm:blur-[120px]' />
			</div>

			<div className='mx-auto w-full max-w-[900px] px-4 text-center sm:px-8 xl:px-0'>
				<h1 className='mb-5 text-[2rem] font-bold leading-[1.1] tracking-tight text-white sm:mb-6 sm:text-5xl lg:text-6xl xl:text-[68px]'>
					Put your SaaS
					<br />
					intelligence on autopilot
				</h1>

				<p className='mx-auto mb-8 w-full max-w-[620px] text-base leading-relaxed text-gray-400 sm:mb-10 sm:text-lg'>
					Vestigio is the intelligence layer that audits, monitors, and
					optimizes your SaaS platform. Evidence-based decisions and actionable
					insights, so you can focus on growth.
				</p>

				<div className='flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4'>
					<Link
						href={primaryCtaHref}
						className='rounded-[1rem] bg-white px-7 py-3 text-center text-sm font-semibold text-black shadow-[0_12px_40px_-12px_rgba(255,255,255,0.45)] transition-all hover:bg-gray-100 hover:shadow-[0_16px_48px_-12px_rgba(255,255,255,0.55)] focus-visible:ring-2 focus-visible:ring-emerald-400'
					>
						{primaryCtaLabel}
					</Link>
					<Link
						href='/auth/signin'
						className='rounded-[1rem] border border-white/20 px-7 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30'
					>
						Try demo
					</Link>
				</div>
			</div>

			{/* Brand showcase */}
			<div className='mx-auto mt-14 w-full max-w-[1170px] px-4 sm:mt-20 sm:px-8 xl:mt-32 xl:px-0'>
				<div className='flex flex-wrap items-center justify-center gap-x-6 gap-y-4 opacity-40 sm:gap-x-10 sm:gap-y-6 lg:gap-x-12'>
					{["HUBX", "MacPaw", "Runna", "GeoGuessr", "Linear"].map((brand) => (
						<span
							key={brand}
							className='text-base font-bold tracking-wider text-white sm:text-lg'
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
