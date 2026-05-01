import { getTranslations } from "next-intl/server";
import FaqJsonLd from "@/components/SEO/FaqJsonLd";
import AccordionItem from "./AccordionItem";

interface FaqItem {
	question: string;
	answer: string;
}

const FAQ = async () => {
	const t = await getTranslations("homepage.faq");
	const items = t.raw("items") as FaqItem[];

	return (
		<section
			id="faq"
			className="overflow-hidden border-t border-white/5 bg-[#090911] py-8 sm:py-10 lg:py-14"
		>
			<FaqJsonLd faqs={items} />

			<div className="mx-auto mb-10 max-w-[600px] px-4 text-center sm:mb-12">
				<h2 className="mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl">
					{t("title")}
				</h2>
				<p className="text-sm text-zinc-400 sm:text-base">
					{t("subtitle")}
				</p>
			</div>

			<div className="mx-auto w-full max-w-[700px] px-4 sm:px-8 xl:px-0">
				<div className="flex flex-col gap-3">
					{items.map(({ question, answer }, i) => (
						<AccordionItem
							key={i}
							question={question}
							answer={answer}
							defaultOpen={i === 0}
						/>
					))}
				</div>
			</div>
		</section>
	);
};

export default FAQ;
