// ──────────────────────────────────────────────
// Page type color mapping — shared between inventory table and maps
//
// Single source of truth so badges and map nodes use the same palette.
//
// Design rules:
//   - No red (reserved for status indicators like "Down" / errors).
//   - Each commercial-funnel type has its own hue so the table reads
//     as a quick-scan funnel breakdown.
//   - Long-tail informational types share softer neutrals.
// ──────────────────────────────────────────────

export interface PageTypeStyle {
	bg: string;
	text: string;
}

const PAGE_TYPE_STYLES: Record<string, PageTypeStyle> = {
	// ── Primary commercial funnel — strong distinct hues ──
	homepage:    { bg: "bg-emerald-500/10",  text: "text-emerald-600 dark:text-emerald-400" },
	landing:     { bg: "bg-green-500/10",    text: "text-green-600 dark:text-green-400" },
	product:     { bg: "bg-blue-500/10",     text: "text-blue-600 dark:text-blue-400" },
	category:    { bg: "bg-cyan-500/10",     text: "text-cyan-600 dark:text-cyan-400" },
	pricing:     { bg: "bg-violet-500/10",   text: "text-violet-600 dark:text-violet-400" },
	cart:        { bg: "bg-amber-500/10",    text: "text-amber-600 dark:text-amber-400" },
	checkout:    { bg: "bg-fuchsia-500/10",  text: "text-fuchsia-600 dark:text-fuchsia-400" },
	thank_you:   { bg: "bg-lime-500/10",     text: "text-lime-600 dark:text-lime-400" },
	signup:      { bg: "bg-purple-500/10",   text: "text-purple-600 dark:text-purple-400" },
	demo:        { bg: "bg-rose-500/10",     text: "text-rose-600 dark:text-rose-400" },
	lead_form:   { bg: "bg-rose-500/10",     text: "text-rose-600 dark:text-rose-400" },

	// ── Secondary product surfaces ──
	features:    { bg: "bg-indigo-500/10",   text: "text-indigo-600 dark:text-indigo-400" },
	account:     { bg: "bg-sky-500/10",      text: "text-sky-600 dark:text-sky-400" },
	login:       { bg: "bg-sky-500/10",      text: "text-sky-600 dark:text-sky-400" },
	onboarding:  { bg: "bg-teal-500/10",     text: "text-teal-600 dark:text-teal-400" },

	// ── Informational / long tail ──
	support:     { bg: "bg-yellow-500/10",   text: "text-yellow-600 dark:text-yellow-400" },
	contact:     { bg: "bg-orange-500/10",   text: "text-orange-600 dark:text-orange-400" },
	about:       { bg: "bg-slate-500/15",    text: "text-slate-600 dark:text-slate-300" },
	blog:        { bg: "bg-pink-500/10",     text: "text-pink-600 dark:text-pink-400" },
	policy:      { bg: "bg-stone-500/15",    text: "text-stone-600 dark:text-stone-300" },

	// ── Non-page assets and unknowns ──
	asset:       { bg: "bg-neutral-500/15",  text: "text-neutral-500 dark:text-neutral-400" },
	other:       { bg: "bg-zinc-500/10",     text: "text-zinc-600 dark:text-zinc-400" },
	unknown:     { bg: "bg-zinc-500/10",     text: "text-zinc-600 dark:text-zinc-400" },
};

// Fallback for any type not explicitly listed above. Kept neutral so
// new/unmapped types are visually low-priority until a designer picks
// a hue for them.
const FALLBACK: PageTypeStyle = { bg: "bg-zinc-500/10", text: "text-zinc-600 dark:text-zinc-400" };

export function getPageTypeStyle(pageType: string): PageTypeStyle {
	return PAGE_TYPE_STYLES[pageType] || FALLBACK;
}
