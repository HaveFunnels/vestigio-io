"use client";
import SectionHeader from "@/components/Common/SectionHeader";
import { PaddleLoader } from "@/paddle/paddleLoader";
import { getPricingData } from "@/pricing/pricingData";
import { useTranslations } from "next-intl";
import CancelSubscription from "./CancelSubscription";
import PriceItem from "./PriceItem";

const Pricing = ({ isBilling }: { isBilling?: boolean }) => {
	const t = useTranslations("homepage.pricing_section");

	return (
		<>
			<PaddleLoader />
			<section
				id='pricing'
				className='overflow-hidden border-t border-white/5 bg-[#090911] py-20 lg:py-28 md:px-15'
			>
				{!isBilling && (
					<div className='mx-auto mb-12 max-w-[600px] px-4 text-center'>
						<h2 className='mb-4 text-3xl font-bold tracking-tight text-white lg:text-4xl'>
							{t("title")}
						</h2>
						<p className='text-base text-gray-400'>
							{t("subtitle")}
						</p>
					</div>
				)}

				<div className='mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
					<div className='grid grid-cols-1 gap-7.5 md:grid-cols-2 xl:grid-cols-3'>
						{getPricingData().map((price, key) => (
							<PriceItem plan={price} key={key} isBilling={isBilling} />
						))}
					</div>
				</div>
			</section>

			{isBilling && <CancelSubscription />}
		</>
	);
};

export default Pricing;
