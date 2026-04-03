"use client";
import CountUp from "./CountUp";

const Counter = () => {
	return (
		<section className='relative overflow-hidden border-t border-white/5 bg-[#090911] py-16 lg:py-20'>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<div className='flex flex-col items-center justify-center gap-10 sm:flex-row lg:gap-16 xl:gap-24'>
					<div className='w-[220px] text-center'>
						<h3 className='mb-2 text-4xl font-bold tracking-tight text-emerald-400 lg:text-5xl'>
							<CountUp targetNumber={99} />
							<span className='-ml-1'>%</span>
						</h3>
						<p className='text-sm font-medium text-gray-400'>
							Evidence accuracy
						</p>
					</div>

					<div className='h-px w-16 bg-white/10 sm:h-16 sm:w-px' />

					<div className='w-[220px] text-center'>
						<h3 className='mb-2 text-4xl font-bold tracking-tight text-emerald-400 lg:text-5xl'>
							<CountUp targetNumber={50} />
							<span className='-ml-1'>+</span>
						</h3>
						<p className='text-sm font-medium text-gray-400'>
							Verification checks
						</p>
					</div>

					<div className='h-px w-16 bg-white/10 sm:h-16 sm:w-px' />

					<div className='w-[220px] text-center'>
						<h3 className='mb-2 text-4xl font-bold tracking-tight text-emerald-400 lg:text-5xl'>
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
