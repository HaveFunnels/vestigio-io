// ──────────────────────────────────────────────
// Page type color mapping — shared between inventory table and maps
//
// Single source of truth so badges and map nodes use the same palette.
// ──────────────────────────────────────────────

export interface PageTypeStyle {
	bg: string;
	text: string;
}

const PAGE_TYPE_STYLES: Record<string, PageTypeStyle> = {
	homepage:   { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
	landing:    { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
	product:    { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400" },
	category:   { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400" },
	pricing:    { bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400" },
	cart:       { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400" },
	checkout:   { bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400" },
	thank_you:  { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
	features:   { bg: "bg-indigo-500/10",  text: "text-indigo-600 dark:text-indigo-400" },
	signup:     { bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400" },
	demo:       { bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400" },
	account:    { bg: "bg-sky-500/10",     text: "text-sky-600 dark:text-sky-400" },
	onboarding: { bg: "bg-teal-500/10",    text: "text-teal-600 dark:text-teal-400" },
	support:    { bg: "bg-zinc-500/10",    text: "text-zinc-400" },
	contact:    { bg: "bg-orange-500/10",  text: "text-orange-600 dark:text-orange-400" },
	about:      { bg: "bg-slate-500/10",   text: "text-slate-400" },
	blog:       { bg: "bg-pink-500/10",    text: "text-pink-600 dark:text-pink-400" },
	policy:     { bg: "bg-zinc-500/10",    text: "text-zinc-400" },
	login:      { bg: "bg-sky-500/10",     text: "text-sky-600 dark:text-sky-400" },
	unknown:    { bg: "bg-zinc-500/10",    text: "text-zinc-400" },
};

const FALLBACK: PageTypeStyle = { bg: "bg-zinc-500/10", text: "text-zinc-400" };

export function getPageTypeStyle(pageType: string): PageTypeStyle {
	return PAGE_TYPE_STYLES[pageType] || FALLBACK;
}
