// ──────────────────────────────────────────────
// Backwards-compat re-exports from PACK_REGISTRY.
//
// This file used to be the source of truth for pack visual identity
// via a Record<string, PackStyle> map with both canonical and alias
// rows interleaved. Wave-22.6 review fix P1.2 collapsed that map
// into the single PACK_REGISTRY in pack-registry.ts (which also
// carries labels + descriptions per locale, enabling the per-chip
// tooltip the audit flagged as missing). Existing callsites that
// imported PACK_STYLE_MAP / getPackStyle / getPackBg from
// "@/lib/pack-colors" keep working unchanged.
//
// New code should import from "@/lib/pack-registry" directly so the
// canonical PackId type lights up.
// ──────────────────────────────────────────────

import {
	PACK_REGISTRY,
	PACK_ALIASES,
	getPackStyle as registryGetPackStyle,
	getPackBg as registryGetPackBg,
	type PackStyle,
} from "./pack-registry";

export type { PackStyle };

/**
 * Compatibility map — flat union of canonical pack ids + legacy
 * aliases (revenue, chargeback, behavioral, first_impression,
 * trust_gap, funnel_integrity, security_posture) so consumers that
 * still iterate Object.keys(PACK_STYLE_MAP) keep finding the same
 * surface they used to.
 */
export const PACK_STYLE_MAP: Record<string, PackStyle> = (() => {
	const out: Record<string, PackStyle> = {};
	for (const id of Object.keys(PACK_REGISTRY)) {
		out[id] = PACK_REGISTRY[id as keyof typeof PACK_REGISTRY].style;
	}
	for (const [alias, canonical] of Object.entries(PACK_ALIASES)) {
		out[alias] = PACK_REGISTRY[canonical].style;
	}
	return out;
})();

export const FALLBACK_PACK_STYLE: PackStyle = {
	text: "text-content-muted",
	dot: "bg-content-faint",
	bg: "bg-content-faint",
};

/** Get the style for a pack key. Never returns undefined. */
export function getPackStyle(pack: string): PackStyle {
	return registryGetPackStyle(pack);
}

/** Get just the bg class (for segmented bars in the aggregator). */
export function getPackBg(pack: string): string {
	return registryGetPackBg(pack);
}
