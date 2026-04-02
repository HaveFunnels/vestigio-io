"use client";

import SectionHeader from "@/components/Common/SectionHeader";
import { Testimonial } from "@/types/testimonial";
import { useTranslations } from "next-intl";
import Image from "next/image";

const Testimonials = () => {
	const t = useTranslations("homepage.testimonials_section");
	const testimonialData: Testimonial[] = t.raw("items");

	return (
		<section className='relative z-1 overflow-hidden bg-gray-1 py-17.5 dark:bg-black lg:py-22.5 xl:py-27.5'>
			{/* <!-- section title --> */}
			<SectionHeader title={t("title")} description={t("subtitle")} />

			<div className='relative z-1 mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<div className='gap-7.5 space-y-7.5 sm:columns-2 lg:columns-3'>
					{/* <!-- 1st Column --> */}
					{testimonialData?.map((data, i) => (
						<div
							key={i}
							className='rounded-2xl bg-white p-[35px] shadow-testimonial hover:shadow-testimonial-2 dark:bg-gray-dark'
						>
							<div className='flex items-center gap-4'>
								<div className='h-15 w-full max-w-[60px] overflow-hidden rounded-full'>
									<Image
										src={`/images/testimonial/author-0${i + 1}.png`}
										alt='author'
										width={60}
										height={60}
									/>
								</div>
								<div className='w-full'>
									<h3 className='font-satoshi text-lg font-medium -tracking-[0.2px] text-black dark:text-white'>
										{data.name}
									</h3>

									<p className='font-medium dark:text-gray-4'>
										{data.designation}
									</p>
								</div>
							</div>

							<div className='my-6 h-px w-full bg-stroke dark:bg-stroke-dark'></div>

							<p className='dark:text-gray-5'>“{data.comment}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
};

export default Testimonials;
