"use client";
import CountUp from "./CountUp";

const Counter = () => {
	return (
		<section className='relative overflow-hidden border-t border-white/5 bg-[#090911] py-14 sm:py-16 lg:py-20'>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<div className='flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-10 lg:gap-16 xl:gap-24'>
					<div className='w-full max-w-[220px] text-center'>
						<h3 className='mb-2 text-4xl font-bold tracking-tight text-emerald-400 sm:text-[2.5rem] lg:text-5xl'>
							<CountUp targetNumber={99} />
							<span className='-ml-1'>%</span>
						</h3>
						<p className='text-sm font-medium text-gray-400'>
							Evidence accuracy
						</p>
					</div>

					<div className='hidden h-16 w-px bg-white/10 sm:block' />

					<div className='w-full max-w-[220px] text-center'>
						<h3 className='mb-2 text-4xl font-bold tracking-tight text-emerald-400 sm:text-[2.5rem] lg:text-5xl'>
							<CountUp targetNumber={50} />
							<span className='-ml-1'>+</span>
						</h3>
						<p className='text-sm font-medium text-gray-400'>
							Verification checks
						</p>
					</div>

					<div className='hidden h-16 w-px bg-white/10 sm:block' />

					<div className='w-full max-w-[220px] text-center'>
						<h3 className='mb-2 text-4xl font-bold tracking-tight text-emerald-400 sm:text-[2.5rem] lg:text-5xl'>
							24/7
						</h3>
						<p className='text-sm font-medium text-gray-400'>
							Continuous monitoring
						</p>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Counter;
