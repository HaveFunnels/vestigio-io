"use client";

import SectionHeader from "@/components/Common/SectionHeader";
import { getPricingData } from "@/pricing/pricingData";
import { useTranslations } from "next-intl";
import PriceItem from "./PriceItem";

const Pricing = ({ isBilling }: { isBilling?: boolean }) => {
	const t = useTranslations("homepage.pricing_section");

	return (
		<section
			id='pricing'
			className='overflow-hidden rounded-10 bg-white py-15 dark:bg-[#131a2b] md:px-15'
		>
			{!isBilling && (
				<SectionHeader title={t("title")} description={t("subtitle")} />
			)}

			<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<div className='grid grid-cols-1 gap-7.5 md:grid-cols-2 xl:grid-cols-3'>
					{getPricingData().map((price, key) => (
						<PriceItem plan={price} key={key} isBilling={isBilling} />
					))}
				</div>
			</div>
		</section>
	);
};

export default Pricing;
