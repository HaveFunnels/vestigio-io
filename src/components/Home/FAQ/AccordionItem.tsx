"use client";

import { useState } from "react";

export default function AccordionItem({
	question,
	answer,
	defaultOpen = false,
}: {
	question: string;
	answer: string;
	defaultOpen?: boolean;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<div className="rounded-2xl border border-white/5 bg-white/[0.02] transition-colors duration-200 hover:border-white/10">
			<button
				onClick={() => setIsOpen((o) => !o)}
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

			<div
				className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
				style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
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
}
