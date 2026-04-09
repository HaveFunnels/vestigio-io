import Link from "next/link";

interface CallToActionProps {
	primaryCtaHref?: string;
	primaryCtaLabel?: string;
}

const CallToAction = ({
	primaryCtaHref = "/auth/signup",
	primaryCtaLabel = "Get started free",
}: CallToActionProps = {}) => {
	return (
		<section className='relative z-1 overflow-hidden bg-[#090911] py-16 sm:py-20 lg:py-28'>
			<div className='mx-auto w-full max-w-[700px] px-4 text-center sm:px-8 xl:px-0'>
				{/* Gradient glow */}
				<div className='absolute left-1/2 top-1/2 h-[220px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-900/20 blur-[80px] sm:h-[300px] sm:w-[500px] sm:blur-[100px]' />

				<div className='relative'>
					<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:mb-5 sm:text-3xl lg:text-4xl xl:text-5xl'>
						Ready to put your platform on autopilot?
					</h2>

					<p className='mb-7 text-sm text-gray-400 sm:mb-8 sm:text-base'>
						Join SaaS teams using Vestigio to automate auditing, detect
						regressions, and make evidence-based decisions.
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
							Try live demo
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
};

export default CallToAction;
