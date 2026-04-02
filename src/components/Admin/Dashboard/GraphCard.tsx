"use client";

import { OverviewData } from "@/staticData/statsData";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import ChartOne from "./ChartOne";

export default function GraphCard({ data }: { data: OverviewData }) {
	const t = useTranslations("admin_page.overview.stats");

	return (
		<div className='rounded-lg bg-white p-7.5 shadow-1 dark:border dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none'>
			<div className='flex items-center justify-between'>
				<div>
					<p className='mb-1.5 font-satoshi text-sm font-medium tracking-[-.1px] text-body dark:text-zinc-400'>
						{t(data.titleKey)}
					</p>
					<h5 className='font-satoshi text-heading-5 font-bold text-dark dark:text-zinc-100'>
						{data.value}
					</h5>
				</div>
				<div>
					<div
						className={`inline-flex items-center gap-1.5 ${
							data.isIncrease ? "text-green" : "text-red"
						}`}
					>
						<div
							className={`flex h-6 w-6 items-center justify-center rounded-full ${
								data.isIncrease
									? "bg-[#E6F9EC] text-green dark:bg-emerald-500/10"
									: "bg-red-light-6 text-red dark:bg-red-500/10"
							}`}
						>
							<span className={!data.isIncrease ? "rotate-180" : ""}>
								<svg
									width='17'
									height='16'
									viewBox='0 0 17 16'
									fill='none'
									xmlns='http://www.w3.org/2000/svg'
								>
									<path
										d='M7.9597 5.28398L4.46768 8.776L3.54715 7.85547L8.6107 2.79192L13.6743 7.85547L12.7537 8.776L9.26171 5.28398L9.26171 13.2081L7.9597 13.2081L7.9597 5.28398Z'
										fill='currentColor'
									/>
								</svg>
							</span>
						</div>

						<span className='font-satoshi text-sm font-medium'>
							{data.percents}
						</span>
					</div>
				</div>
			</div>

			<Suspense fallback={null}>
				<ChartOne />
			</Suspense>
		</div>
	);
}
