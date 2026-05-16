// ──────────────────────────────────────────────
// Date formatting — locale-aware (Wave 18o)
//
// `Date.prototype.toLocaleDateString()` without a locale argument
// uses the SERVER's locale, which on Railway is en-US. That means
// every pt-BR / es / de customer was seeing mm/dd/yyyy in every
// place a date was rendered (cross-signal cards, finding "checked
// on" timestamps, member join dates, etc.).
//
// This helper centralizes the conversion so:
//   - Locale is always explicit (no default-locale leak from Node)
//   - Format style is consistent across the app
//   - Future locale additions don't need 34 site-by-site updates
//
// `locale` should be the user's display locale (one of en, pt-BR,
// es, de). Falls back to en-US for unknown values rather than
// using the server's locale.
// ──────────────────────────────────────────────

const LOCALE_MAP: Record<string, string> = {
	"en": "en-US",
	"pt-BR": "pt-BR",
	"pt": "pt-BR",
	"es": "es-ES",
	"de": "de-DE",
};

function resolveLocale(locale: string | null | undefined): string {
	if (!locale) return "en-US";
	return LOCALE_MAP[locale] ?? LOCALE_MAP[locale.split("-")[0]] ?? "en-US";
}

/** Short date — e.g. "01/05/2026" in pt-BR, "5/1/2026" in en-US. */
export function formatDate(
	value: Date | string | number | null | undefined,
	locale: string | null | undefined,
): string {
	if (value == null) return "";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString(resolveLocale(locale));
}

/** Long date — e.g. "5 de janeiro de 2026" in pt-BR, "January 5, 2026" in en-US. */
export function formatDateLong(
	value: Date | string | number | null | undefined,
	locale: string | null | undefined,
): string {
	if (value == null) return "";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString(resolveLocale(locale), {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/** Date + time — short variant, includes time zone. */
export function formatDateTime(
	value: Date | string | number | null | undefined,
	locale: string | null | undefined,
): string {
	if (value == null) return "";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleString(resolveLocale(locale));
}
