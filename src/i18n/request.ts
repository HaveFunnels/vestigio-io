import deepmerge from "deepmerge";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { integrations } from "../../integrations.config";
import { SUPPORTED_LOCALES } from "./supported-locales";

// ──────────────────────────────────────────────
// Country → locale mapping for IP geolocation.
//
// Used when no explicit `locale` cookie is set yet — i.e. first-time
// marketing/landing-page visitors. Country codes follow ISO 3166-1
// alpha-2. The cookie set by the language selector ALWAYS wins over
// auto-detection (so a user who explicitly picked English while on
// holiday in Berlin keeps English).
// ──────────────────────────────────────────────
const COUNTRY_TO_LOCALE: Record<string, string> = {
	// Brazilian Portuguese (Portugal also routes here — closest match)
	BR: "pt-BR",
	PT: "pt-BR",
	// German
	DE: "de",
	AT: "de",
	CH: "de",
	LI: "de",
	// Spanish
	ES: "es",
	MX: "es",
	AR: "es",
	CL: "es",
	CO: "es",
	PE: "es",
	UY: "es",
	VE: "es",
	EC: "es",
	GT: "es",
	CU: "es",
	BO: "es",
	DO: "es",
	HN: "es",
	PY: "es",
	SV: "es",
	NI: "es",
	CR: "es",
	PA: "es",
	PR: "es",
};

/**
 * Resolve a locale from request headers.
 *
 * Strategy:
 *   1. IP geo (Vercel `x-vercel-ip-country`, Cloudflare `cf-ipcountry`,
 *      generic `x-country-code`) → mapped via COUNTRY_TO_LOCALE
 *   2. Browser `Accept-Language` header (first matching tag)
 *   3. Fallback to "en"
 *
 * Both signals get filtered through SUPPORTED_LOCALES so an unsupported
 * tag (e.g. `fr-CA`) cleanly falls through.
 */
function detectLocaleFromHeaders(headerStore: Headers): string {
	// 1. IP geolocation country code
	const country = (
		headerStore.get("x-vercel-ip-country") ||
		headerStore.get("cf-ipcountry") ||
		headerStore.get("x-country-code") ||
		""
	)
		.trim()
		.toUpperCase();

	if (country) {
		const candidate = COUNTRY_TO_LOCALE[country];
		if (candidate && SUPPORTED_LOCALES.includes(candidate)) {
			return candidate;
		}
	}

	// 2. Browser Accept-Language header — try exact then prefix match
	const accept = headerStore.get("accept-language") || "";
	if (accept) {
		const tags = accept
			.split(",")
			.map((t) => t.split(";")[0].trim())
			.filter(Boolean);

		for (const tag of tags) {
			// Exact match first ("pt-BR" → "pt-BR")
			if (SUPPORTED_LOCALES.includes(tag)) return tag;

			// Prefix match ("pt" → "pt-BR", "de-DE" → "de")
			const prefix = tag.split("-")[0].toLowerCase();
			const prefixMatch = SUPPORTED_LOCALES.find((l) => {
				const ll = l.toLowerCase();
				return ll === prefix || ll.startsWith(prefix + "-");
			});
			if (prefixMatch) return prefixMatch;
		}
	}

	return "en";
}

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const headerStore = await headers();
	const cookieLocale = cookieStore.get("locale")?.value || "";

	// Priority: explicit cookie (user choice via language selector or
	// settings page, kept in sync with the DB) > IP geolocation >
	// browser Accept-Language > default "en".
	let locale = "en";

	if (integrations.isI18nEnabled) {
		if (SUPPORTED_LOCALES.includes(cookieLocale)) {
			locale = cookieLocale;
		} else {
			locale = detectLocaleFromHeaders(headerStore);
		}
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
