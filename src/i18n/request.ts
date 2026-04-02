import deepmerge from "deepmerge";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { integrations } from "../../integrations.config";
import { SUPPORTED_LOCALES } from "./supported-locales";

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const requestedLocale = cookieStore.get("locale")?.value || "";

	let locale = "en"; // Default locale

	if (
		integrations.isI18nEnabled &&
		SUPPORTED_LOCALES.includes(requestedLocale)
	) {
		locale = requestedLocale;
	}

	const defaultMessages = (await import(`../../dictionary/en.json`)).default;
	const userMessages = (await import(`../../dictionary/${locale}.json`))
		.default;

	const messages = deepmerge(defaultMessages, userMessages, {
		arrayMerge: (destination, source) => {
			/**
			 * destination: defaultMessages array
			 * source: userMessages array
			 */

			if (
				source.length === destination.length ||
				source.length > destination.length
			) {
				return source;
			}

			/**
			 * If the source array is shorter than the destination array, we want to
			 * fill the missing values of the source array with the values of the destination array.
			 */
			for (let i = 0; i < destination.length; i++) {
				if (source[i] === undefined) {
					source[i] = destination[i];
				}
			}

			return source;
		},
	});

	return {
		locale,
		messages: messages as any,
	};
});
