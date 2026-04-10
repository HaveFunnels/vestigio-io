"use client";

import { useState } from "react";

const faqData = [
	{
		question: "What does Vestigio actually do?",
		answer:
			"Vestigio is an intelligence layer for SaaS platforms. It audits your site, detects regressions between cycles, verifies findings with browser evidence, and surfaces actionable insights — all powered by AI.",
	},
	{
		question: "How does the verification system work?",
		answer:
			"Vestigio uses a multi-stage verification pipeline: static analysis, browser-based verification via Playwright, and corroboration scoring. Each finding carries a trust level — from unverified to fully verified — so you always know the confidence behind every decision.",
	},
	{
		question: "Can I try it before committing?",
		answer:
			"Yes. You can sign up for a free trial and run your first audit immediately. No credit card required to get started.",
	},
	{
		question: "What pricing plans are available?",
		answer:
			"We offer three plans: Vestigio (starter), Pro, and Max — each with increasing MCP query limits, Playwright runs, and features. Check our pricing section for detailed comparisons.",
	},
];

const FAQ = () => {
	const [activeFaq, setActiveFaq] = useState<number | null>(0);

	const handleFaqToggle = (id: number) => {
		activeFaq === id ? setActiveFaq(null) : setActiveFaq(id);
	};

	return (
		<section id="faq" className='overflow-hidden border-t border-white/5 bg-[#090911] py-16 sm:py-20 lg:py-28'>
			{/* Section header */}
			<div className='mx-auto mb-10 max-w-[600px] px-4 text-center sm:mb-12'>
				<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl'>
					Frequently asked questions
				</h2>
				<p className='text-sm text-gray-400 sm:text-base'>
					Everything you need to know about Vestigio.
				</p>
			</div>

			<div className='mx-auto w-full max-w-[700px] px-4 sm:px-8 xl:px-0'>
				<div className='flex flex-col gap-3'>
					{faqData.map(({ question, answer }, i) => (
						<div
							key={i}
							className='rounded-[1rem] border border-white/5 bg-white/[0.02] transition-colors hover:border-white/10'
						>
							<button
								onClick={() => handleFaqToggle(i)}
								className='flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-white sm:px-6 sm:py-5'
							>
								{question}
								<span
									className={`ml-2 shrink-0 text-gray-500 transition-transform duration-200 ${activeFaq === i ? "rotate-180" : ""}`}
								>
									<svg
										width='20'
										height='20'
										viewBox='0 0 24 25'
										fill='none'
										xmlns='http://www.w3.org/2000/svg'
									>
										<path
											fillRule='evenodd'
											clipRule='evenodd'
											d='M4.43057 8.87618C4.70014 8.56168 5.17361 8.52526 5.48811 8.79483L12 14.3765L18.5119 8.79483C18.8264 8.52526 19.2999 8.56168 19.5695 8.87618C19.839 9.19067 19.8026 9.66415 19.4881 9.93371L12.4881 15.9337C12.2072 16.1745 11.7928 16.1745 11.5119 15.9337L4.51192 9.93371C4.19743 9.66415 4.161 9.19067 4.43057 8.87618Z'
											fill='currentColor'
										/>
									</svg>
								</span>
							</button>
							<div
								className={`grid transition-[grid-template-rows] duration-300 ease-out ${
									activeFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
								}`}
							>
								<div className='overflow-hidden'>
									<p className='border-t border-white/5 px-4 py-4 text-sm leading-relaxed text-gray-400 sm:px-6 sm:py-5'>
										{answer}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
};

export default FAQ;
