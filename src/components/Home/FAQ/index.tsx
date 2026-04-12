"use client";

import FaqJsonLd from "@/components/SEO/FaqJsonLd";
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
			"Yes. You can sign up and run your first audit immediately. No credit card required to get started.",
	},
	{
		question: "What pricing plans are available?",
		answer:
			"We offer three plans: Vestigio (starter), Pro, and Max — each with increasing MCP query limits, Playwright runs, and features. Check our pricing section for detailed comparisons.",
	},
];

const FAQ = () => {
	const [openIndex, setOpenIndex] = useState<number | null>(0);

	return (
		<section
			id="faq"
			className="overflow-hidden border-t border-white/5 bg-[#090911] py-16 sm:py-20 lg:py-28"
		>
			<FaqJsonLd faqs={faqData} />

			<div className="mx-auto mb-10 max-w-[600px] px-4 text-center sm:mb-12">
				<h2 className="mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl">
					Frequently asked questions
				</h2>
				<p className="text-sm text-zinc-400 sm:text-base">
					Everything you need to know about Vestigio.
				</p>
			</div>

			<div className="mx-auto w-full max-w-[700px] px-4 sm:px-8 xl:px-0">
				<div className="flex flex-col gap-3">
					{faqData.map(({ question, answer }, i) => {
						const isOpen = openIndex === i;
						return (
							<div
								key={i}
								className="rounded-2xl border border-white/5 bg-white/[0.02] transition-colors duration-200 hover:border-white/10"
							>
								<button
									onClick={() => setOpenIndex(isOpen ? null : i)}
									className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
								>
									<span className="text-sm font-medium text-white sm:text-[15px]">
										{question}
									</span>
									<svg
										width="18"
										height="18"
										viewBox="0 0 18 18"
										fill="none"
										className={`shrink-0 text-zinc-500 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isOpen ? "rotate-180" : ""}`}
									>
										<path
											d="M4.5 6.75L9 11.25L13.5 6.75"
											stroke="currentColor"
											strokeWidth="1.5"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</button>

								{/* CSS grid 0fr→1fr: the only reliable CSS-only auto-height animation */}
								<div
									className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
									style={{
										gridTemplateRows: isOpen ? "1fr" : "0fr",
									}}
								>
									<div className="overflow-hidden" style={{ minHeight: 0 }}>
										<div className="border-t border-white/5 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
											<p className="text-sm leading-relaxed text-zinc-400">
												{answer}
											</p>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
};

export default FAQ;
