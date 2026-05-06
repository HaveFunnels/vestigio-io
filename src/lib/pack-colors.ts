// ──────────────────────────────────────────────
// Global pack color definitions
//
// Single source of truth for pack visual identity.
// Every component that renders pack-colored elements
// (dots, badges, backgrounds, text) imports from here.
// ──────────────────────────────────────────────

export interface PackStyle {
	/** Tailwind text color class (e.g. "text-red-400") */
	text: string;
	/** Tailwind background class for dots/badges (e.g. "bg-red-500") */
	dot: string;
	/** Tailwind background class for bars/segments (e.g. "bg-red-500") */
	bg: string;
}

export const PACK_STYLE_MAP: Record<string, PackStyle> = {
	// Revenue / conversion
	revenue:              { text: "text-red-400",     dot: "bg-red-500",     bg: "bg-red-500" },
	revenue_integrity:    { text: "text-red-400",     dot: "bg-red-500",     bg: "bg-red-500" },

	// Scale / infrastructure
	scale_readiness:      { text: "text-emerald-400", dot: "bg-emerald-500", bg: "bg-emerald-500" },

	// Security
	money_moment_exposure:{ text: "text-blue-400",    dot: "bg-blue-500",    bg: "bg-blue-500" },
	security_posture:     { text: "text-blue-400",    dot: "bg-blue-500",    bg: "bg-blue-500" },

	// Chargeback
	chargeback:           { text: "text-amber-400",   dot: "bg-amber-500",   bg: "bg-amber-500" },
	chargeback_resilience:{ text: "text-amber-400",   dot: "bg-amber-500",   bg: "bg-amber-500" },

	// Copy
	copy_alignment:       { text: "text-pink-400",    dot: "bg-pink-500",    bg: "bg-pink-500" },

	// Content freshness
	content_freshness:    { text: "text-orange-400",  dot: "bg-orange-500",  bg: "bg-orange-500" },

	// Channel
	channel_integrity:    { text: "text-cyan-400",    dot: "bg-cyan-500",    bg: "bg-cyan-500" },

	// Discoverability / SEO
	discoverability:      { text: "text-teal-400",    dot: "bg-teal-500",    bg: "bg-teal-500" },

	// Brand
	brand_integrity:      { text: "text-purple-400",  dot: "bg-purple-500",  bg: "bg-purple-500" },

	// SaaS
	saas_growth_readiness:{ text: "text-violet-400",  dot: "bg-violet-500",  bg: "bg-violet-500" },

	// Behavioral
	behavioral:           { text: "text-violet-400",  dot: "bg-violet-500",  bg: "bg-violet-500" },
	first_impression:     { text: "text-violet-400",  dot: "bg-violet-500",  bg: "bg-violet-500" },

	// Friction / trust
	friction_tax:         { text: "text-rose-400",    dot: "bg-rose-500",    bg: "bg-rose-500" },
	trust_gap:            { text: "text-indigo-400",  dot: "bg-indigo-500",  bg: "bg-indigo-500" },
	trust_revenue_gap:    { text: "text-indigo-400",  dot: "bg-indigo-500",  bg: "bg-indigo-500" },

	// Payment
	payment_health:       { text: "text-yellow-400",  dot: "bg-yellow-500",  bg: "bg-yellow-500" },

	// Vertical-specific
	vertical_specific:    { text: "text-lime-400",    dot: "bg-lime-500",    bg: "bg-lime-500" },

	// Funnel journey
	funnel_journey:       { text: "text-sky-400",     dot: "bg-sky-500",     bg: "bg-sky-500" },

	// Cross-signal
	cross_signal:         { text: "text-fuchsia-400", dot: "bg-fuchsia-500", bg: "bg-fuchsia-500" },

	// Other behavioral sub-packs
	mobile_revenue_exposure: { text: "text-rose-400",  dot: "bg-rose-500",  bg: "bg-rose-500" },
	acquisition_integrity:   { text: "text-red-400",   dot: "bg-red-500",   bg: "bg-red-500" },
	action_value_map:        { text: "text-amber-400", dot: "bg-amber-500", bg: "bg-amber-500" },
	path_efficiency:         { text: "text-teal-400",  dot: "bg-teal-500",  bg: "bg-teal-500" },
};

export const FALLBACK_PACK_STYLE: PackStyle = {
	text: "text-content-muted",
	dot: "bg-content-faint",
	bg: "bg-content-faint",
};

/** Get the style for a pack key. Never returns undefined. */
export function getPackStyle(pack: string): PackStyle {
	return PACK_STYLE_MAP[pack] || FALLBACK_PACK_STYLE;
}

/** Get just the bg class (for segmented bars in the aggregator). */
export function getPackBg(pack: string): string {
	return PACK_STYLE_MAP[pack]?.bg || FALLBACK_PACK_STYLE.bg;
}
