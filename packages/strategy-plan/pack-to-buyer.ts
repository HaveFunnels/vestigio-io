// ──────────────────────────────────────────────
// Pack → Buyer ownership mapping
//
// Maps each Finding pack to the buyer who'd typically own resolving it.
// The Strategy Plan's [buyer-segments] section uses this to decompose
// monthly findings by who the operator should hand each one to: copy
// writers, engineers, or leadership/strategy.
//
// Source: docs/PLAN_MONTHLY_STRATEGY.md §3 — buyer-segments ownership
// heuristic. The packs not listed here fall through to `eng` (most
// defensive default for a SaaS B2B audit product).
//
// Adding a new pack: add to the right group below. The map is the
// single source of truth — the generator pulls it directly.
// ──────────────────────────────────────────────

export type BuyerKind = "copy" | "eng" | "leadership";

const COPY_PACKS = new Set<string>([
	"copy_alignment",
	"discoverability",
	"content_freshness",
	"first_impression_revenue",
]);

const LEADERSHIP_PACKS = new Set<string>([
	"saas_growth_readiness",
	"funnel_journey",
	"trust_revenue_gap",
	"brand_integrity",
	"action_value_map",
	"channel_integrity",
]);

// All other packs fall to engineering. Listed explicitly so future
// pack additions are forced through a review of where they belong:
const ENG_PACKS = new Set<string>([
	"scale_readiness",
	"revenue_integrity",
	"friction_tax",
	"path_efficiency",
	"mobile_revenue_exposure",
	"money_moment_exposure",
	"acquisition_integrity",
	"chargeback_resilience",
	"compliance",
]);

export function packToBuyer(pack: string): BuyerKind {
	if (COPY_PACKS.has(pack)) return "copy";
	if (LEADERSHIP_PACKS.has(pack)) return "leadership";
	if (ENG_PACKS.has(pack)) return "eng";
	// Defensive default — keeps unknown packs visible to engineering
	// rather than silently dropped to leadership (which is the higher-
	// cost mistake: leadership shouldn't be debugging unknown findings).
	return "eng";
}

export const BUYER_LABEL_PT_BR: Record<BuyerKind, string> = {
	copy: "Para o time de copy",
	eng: "Para o time de engenharia",
	leadership: "Para liderança",
};
