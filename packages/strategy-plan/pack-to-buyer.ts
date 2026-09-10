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
	// Wave 24 — competitive_lens: decisões de posicionamento e
	// diferenciação são chamadas de leadership/marketing, não de eng
	// (mesmo quando a remediação envolve trust_posture_lag que é eng).
	"competitive_lens",
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
	// Wave 23.1 — DMARC/SPF/DKIM/BIMI são configurações de DNS;
	// o fix é eng abrindo um console de DNS e publicando TXT records.
	"email_deliverability",
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

// Customer-facing role labels — alinhados com ownerFromCategory em
// sections/next-steps.ts (Marketing / Desenvolvedor / Diretoria).
// Cards em BuyerSegments e a meta line dos passos passam a falar a
// mesma língua: o cliente lê "Time: Marketing" no passo e "Para o
// time de Marketing" no card, sem cognitive break.
export const BUYER_LABEL_PT_BR: Record<BuyerKind, string> = {
	copy: "Para o time de Marketing",
	eng: "Para o time de Desenvolvedores",
	leadership: "Para a Diretoria",
};

// EXAME E6 — locale-aware buyer labels. pt-BR keeps the original set;
// every other locale falls back to English until es/de get their own.
const BUYER_LABEL_EN: Record<BuyerKind, string> = {
	copy: "For the Marketing team",
	eng: "For the Development team",
	leadership: "For Leadership",
};

// EXAME P6 — a Shopify merchant is usually ONE person wearing all
// three hats; "Para o time de Desenvolvedores" reads like the plan was
// written for someone else's company. E-commerce verticals get labels
// addressed to the operator, not to org-chart teams.
const BUYER_LABEL_ECOMMERCE_PT_BR: Record<BuyerKind, string> = {
	copy: "Marketing da loja",
	eng: "Parte técnica",
	leadership: "Decisão sua",
};
const BUYER_LABEL_ECOMMERCE_EN: Record<BuyerKind, string> = {
	copy: "Store marketing",
	eng: "Technical",
	leadership: "Your call",
};

export function buyerLabel(
	buyer: BuyerKind,
	locale?: string | null,
	vertical?: string | null,
): string {
	const pt = (locale ?? "pt-BR") === "pt-BR";
	const ecom = (vertical ?? "").toLowerCase().includes("commerce");
	if (ecom) return pt ? BUYER_LABEL_ECOMMERCE_PT_BR[buyer] : BUYER_LABEL_ECOMMERCE_EN[buyer];
	return pt ? BUYER_LABEL_PT_BR[buyer] : BUYER_LABEL_EN[buyer];
}
