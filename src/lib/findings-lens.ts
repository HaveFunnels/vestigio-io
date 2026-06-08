// ──────────────────────────────────────────────
// Findings lens mapping
//
// Phase 3.2 — Workspaces used to be a separate route with four
// "perspective cards" (Revenue / Trust / Copy / Behavioral). Each
// card was essentially a filter over the same findings list,
// presented with a slightly different accent. Phase 3 absorbs that
// into a "Lente" dropdown on /app/findings so there's one canonical
// surface for triage and the perspectives become lenses on it.
//
// Pack-to-lens mapping is defined here as the single source of
// truth. New packs default to the "revenue" lens (money is the
// safest fallback) — if a pack belongs somewhere else, register it
// here. Keys mirror packed values produced by the engine.
// ──────────────────────────────────────────────

export type LensId = "all" | "revenue" | "trust" | "copy" | "behavior";

export const LENS_ORDER: LensId[] = ["all", "revenue", "trust", "copy", "behavior"];

export const LENS_LABEL: Record<LensId, string> = {
	all: "Todos",
	revenue: "Receita",
	trust: "Confiança",
	copy: "Copy",
	behavior: "Comportamento",
};

const LENS_PACKS: Record<Exclude<LensId, "all">, ReadonlyArray<string>> = {
	revenue: [
		"revenue_integrity",
		"chargeback_resilience",
		"payment_health",
		"money_moment_exposure",
		"channel_integrity",
	],
	trust: [
		"trust_signals",
		"content_freshness",
		"scale_readiness",
		"compliance_posture",
		"brand_intel",
	],
	copy: [
		"copy_alignment",
		"discoverability",
		"ad_message_match",
	],
	behavior: [
		"behavioral_heuristics",
		"saas_growth_readiness",
		"funnel_behavior",
	],
};

export function lensMatches(lens: LensId, pack: string | null | undefined): boolean {
	if (lens === "all" || !pack) return true;
	const packs = LENS_PACKS[lens];
	if (!packs) return false;
	return packs.includes(pack);
}

export function isLensId(value: string | null | undefined): value is LensId {
	return value === "all" || value === "revenue" || value === "trust" || value === "copy" || value === "behavior";
}
