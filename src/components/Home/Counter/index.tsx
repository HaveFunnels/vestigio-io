"use client";
import CountUp from "./CountUp";

// JetBrains Mono + tabular-nums on the hero numbers means the digits
// never jitter while CountUp animates from 0 → target. The colored
// text shadow gives the same emerald glow language as the dashboard's
// hero values, which makes the stats feel like instruments rather
// than marketing slop.
const numberClass =
	"font-mono text-4xl font-medium tabular-nums tracking-tight text-emerald-400 sm:text-[2.75rem] lg:text-5xl";
const numberShadow = {
	textShadow:
		"0 8px 32px rgba(16,185,129,0.35), 0 2px 8px rgba(16,185,129,0.2)",
};

const Counter = () => {
	return (
		<section className='relative overflow-hidden border-t border-white/5 bg-[#090911] py-14 sm:py-16 lg:py-20'>
			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<div className='flex flex-col items-center justify-center gap-10 sm:flex-row sm:gap-12 lg:gap-20 xl:gap-28'>
					<div className='w-full max-w-[220px] text-center'>
						<h3 className={`mb-3 ${numberClass}`} style={numberShadow}>
							<CountUp targetNumber={99} />
							<span className='-ml-1'>%</span>
						</h3>
						<p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400'>
							Evidence accuracy
						</p>
					</div>

					<div className='hidden h-16 w-px bg-white/10 sm:block' />

					<div className='w-full max-w-[220px] text-center'>
						<h3 className={`mb-3 ${numberClass}`} style={numberShadow}>
							<CountUp targetNumber={50} />
							<span className='-ml-1'>+</span>
						</h3>
						<p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400'>
							Verification checks
						</p>
					</div>

					<div className='hidden h-16 w-px bg-white/10 sm:block' />

					<div className='w-full max-w-[220px] text-center'>
						<h3 className={`mb-3 ${numberClass}`} style={numberShadow}>
							24/7
						</h3>
						<p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400'>
							Continuous monitoring
						</p>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Counter;
