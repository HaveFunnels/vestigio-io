"use client";

import { useState } from "react";

interface FAQItem {
	question: string;
	answer: string;
}

interface PricingFAQProps {
	faqs?: FAQItem[];
}

const DEFAULT_FAQS: FAQItem[] = [
	{
		question: "Posso experimentar antes de assinar?",
		answer:
			"Sim. Voc\u00ea pode se cadastrar e rodar sua primeira auditoria gratuitamente. Sem cart\u00e3o de cr\u00e9dito.",
	},
	{
		question: "O que acontece depois do per\u00edodo gratuito?",
		answer:
			"Voc\u00ea escolhe o plano que melhor atende seu neg\u00f3cio. Sem surpresas \u2014 todos os recursos do plano ficam dispon\u00edveis desde o primeiro dia.",
	},
	{
		question: "Como funciona a garantia de 4X ROI?",
		answer:
			"Se os insights da Vestigio n\u00e3o gerarem pelo menos 4X o valor da sua assinatura em oportunidades identificadas, voc\u00ea recebe cr\u00e9dito integral.",
	},
	{
		question: "Posso mudar de plano a qualquer momento?",
		answer:
			"Sim. Upgrade ou downgrade a qualquer momento. A cobran\u00e7a \u00e9 ajustada proporcionalmente.",
	},
	{
		question: "Quais m\u00e9todos de pagamento voc\u00eas aceitam?",
		answer:
			"Cart\u00e3o de cr\u00e9dito (Visa, Mastercard, Amex) e PayPal via Paddle. Fatura autom\u00e1tica todo m\u00eas.",
	},
	{
		question: "Preciso instalar algo no meu site?",
		answer:
			"A auditoria b\u00e1sica n\u00e3o requer instala\u00e7\u00e3o \u2014 apenas seu dom\u00ednio. Para dados comportamentais avan\u00e7ados, adicionamos um snippet leve (< 2KB).",
	},
];

const PricingFAQ = ({ faqs = DEFAULT_FAQS }: PricingFAQProps) => {
	const [openIndex, setOpenIndex] = useState<number | null>(0);

	return (
		<section className="overflow-hidden border-t border-white/5 bg-[#090911] py-16 sm:py-20">
			<div className="mx-auto mb-10 max-w-[600px] px-4 text-center sm:mb-12">
				<h2 className="mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl">
					D&uacute;vidas sobre planos e pre&ccedil;os
				</h2>
				<p className="text-sm text-zinc-400 sm:text-base">
					Tudo que voc&ecirc; precisa saber antes de come&ccedil;ar.
				</p>
			</div>

			<div className="mx-auto w-full max-w-[700px] px-4 sm:px-8 xl:px-0">
				<div className="flex flex-col gap-3">
					{faqs.map(({ question, answer }, i) => {
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

								{/* CSS grid 0fr->1fr: the only reliable CSS-only auto-height animation */}
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

export default PricingFAQ;
