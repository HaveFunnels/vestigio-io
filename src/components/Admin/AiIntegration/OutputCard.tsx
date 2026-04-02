"use client";

import CopyToClipboard from "@/components/Common/CopyToClipboard";
import Card from "@/components/Common/Dashboard/Card";
import { useTranslations } from "next-intl";

export default function OutputCard({ generated }: any) {
	const t = useTranslations("ai_integration_page.output_result");
	const tCommon = useTranslations("common");

	return (
		<div className='w-3/4'>
			<Card>
				<div className='mb-6 items-end justify-between sm:flex'>
					<div className='mb-6 sm:mb-0'>
						<h3 className='mb-1.5 font-satoshi text-custom-2xl font-bold tracking-[-.5px] text-dark dark:text-white'>
							{t("title")}
						</h3>
						<p className='text-body'>{t("description")}</p>
					</div>
					<div>
						<CopyToClipboard text={generated} label={tCommon("copy")} />
					</div>
				</div>

				<div>
					<textarea
						defaultValue={generated}
						name='result'
						placeholder={t("placeholder")}
						className='h-[422px] w-full rounded-lg border border-gray-3 px-5.5 py-3 text-dark outline-none ring-offset-1 duration-300 focus:shadow-input focus:ring-2 focus:ring-primary/20 dark:border-stroke-dark dark:bg-transparent dark:text-white dark:focus:border-transparent'
						readOnly
					></textarea>
				</div>
			</Card>
		</div>
	);
}
