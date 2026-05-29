// ──────────────────────────────────────────────
// Strategy Plan — locale helpers
//
// Single source of truth for month name lookup + locale narrowing
// so generator sub-sections + notification templates + UI adapters
// all read from the same table. Was previously duplicated across
// narrative.ts, next-steps.ts, and notification-triggers.ts.
// ──────────────────────────────────────────────

export type SupportedLocale = "pt-BR" | "en" | "es" | "de";

const SUPPORTED: ReadonlySet<string> = new Set(["pt-BR", "en", "es", "de"]);

export function resolveLocale(
	locale: string | null | undefined,
	fallback: SupportedLocale = "pt-BR",
): SupportedLocale {
	if (locale && SUPPORTED.has(locale)) return locale as SupportedLocale;
	return fallback;
}

const MONTH_NAMES: Record<SupportedLocale, readonly string[]> = {
	"pt-BR": [
		"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
		"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
	],
	en: [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December",
	],
	es: [
		"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
		"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
	],
	de: [
		"Januar", "Februar", "März", "April", "Mai", "Juni",
		"Juli", "August", "September", "Oktober", "November", "Dezember",
	],
};

const MONTH_NAMES_SHORT_PT_BR: readonly string[] = [
	"jan", "fev", "mar", "abr", "mai", "jun",
	"jul", "ago", "set", "out", "nov", "dez",
];

/**
 * Render the long month name (e.g. "Junho") + year for a YYYY-MM
 * input. Locale-aware; unsupported locales fall back to pt-BR.
 */
export function monthLabel(ymd: string, locale?: string | null): string {
	const [year, mm] = ymd.split("-");
	const idx = parseInt(mm, 10) - 1;
	const names = MONTH_NAMES[resolveLocale(locale)];
	return `${names[idx] ?? mm} ${year}`;
}

/**
 * Short month name (lowercase, 3 chars) for compact dates like
 * "8 jun". Currently pt-BR only — the UI surfaces using this are
 * pt-BR-locked (Step 3 mock data + drawer dates).
 */
export function monthShortPtBR(monthIndex0Based: number): string {
	return MONTH_NAMES_SHORT_PT_BR[monthIndex0Based] ?? "";
}
