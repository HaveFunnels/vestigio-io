"use client";

import { useTranslations } from "next-intl";
import { useHits } from "react-instantsearch";
import { integrations, messages } from "../../../integrations.config";

export default function EmptyState() {
	const t = useTranslations("global_search");
	const { items } = useHits();

	if (!integrations?.isAlgoliaEnabled) {
		return <div className='p-8'>{messages.algolia}</div>;
	}

	if (items?.length > 0) {
		return null;
	}

	return (
		<div className='p-8'>
			<p className='text-body-color text-center text-base'>{t("no_results")}</p>
		</div>
	);
};

