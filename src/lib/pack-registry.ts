// ──────────────────────────────────────────────
// PACK_REGISTRY — Wave-22.6 review fix P1.2
//
// Single source of truth for pack identity. Every UI surface that
// displays a pack (chips, badges, dots, dropdowns, tooltips, filter
// options) reads from here. The engine itself (packages/inference,
// packages/projections) emits the canonical ids below — if you
// rename a pack you rename it ONCE in this file and TypeScript
// catches every drift.
//
// Pre-fix the same pack identity was scattered across 6 maps with
// drifting labels:
//   - src/lib/pack-colors.ts PACK_STYLE_MAP (long + short alias rows)
//   - src/components/console/ViewSelector.tsx PACK_OPTIONS
//   - src/components/console/chat/PackInsightBubble.tsx PACK_META
//   - src/lib/dashboard/aggregator.ts LABELS_EN
//   - inline label strings in components
//   - dictionary entries with names matching engine ids but inconsistent
//
// Audit friction #1 ("Engine vocabulary leaking to UI") flagged 14
// packs as a flat chip cloud with no glossary. This registry adds
// human-readable labels + descriptions per locale and a hover
// tooltip surface so a non-engineer user knows what each pack
// covers without learning the engine taxonomy.
// ──────────────────────────────────────────────

/**
 * Canonical pack ids. Match the engine's authoritative pack ids in
 * packages/projections/inference-to-pack.ts. NEW packs MUST be
 * added here so the UI knows how to render them; the engine builder
 * lints against this list (Wave 28 follow-up).
 */
export type PackId =
	| "revenue_integrity"
	| "chargeback_resilience"
	| "scale_readiness"
	| "money_moment_exposure"
	| "saas_growth_readiness"
	| "copy_alignment"
	| "content_freshness"
	| "channel_integrity"
	| "discoverability"
	| "brand_integrity"
	| "funnel_journey"
	| "friction_tax"
	| "trust_revenue_gap"
	| "payment_health"
	| "mobile_revenue_exposure"
	| "acquisition_integrity"
	| "action_value_map"
	| "path_efficiency"
	| "first_impression_revenue"
	| "vertical_specific"
	| "cross_signal"
	| "email_deliverability"
	| "competitive_lens";

export interface PackStyle {
	/** Tailwind text color class (e.g. "text-red-400"). */
	text: string;
	/** Tailwind background class for dots/badges. */
	dot: string;
	/** Tailwind background class for segmented bars. */
	bg: string;
}

export interface PackDefinition {
	id: PackId;
	label_pt: string;
	label_en: string;
	/** One-sentence explanation for the hover tooltip on every pack chip. */
	description_pt: string;
	description_en: string;
	style: PackStyle;
}

// ──────────────────────────────────────────────
// The registry
// ──────────────────────────────────────────────

export const PACK_REGISTRY: Record<PackId, PackDefinition> = {
	revenue_integrity: {
		id: "revenue_integrity",
		label_pt: "Integridade de receita",
		label_en: "Revenue Integrity",
		description_pt:
			"Pontos onde sua receita está vazando hoje — checkout quebrado, fricção de pagamento, tracking incompleto, oportunidades não capturadas.",
		description_en:
			"Where your revenue leaks today — broken checkout, payment friction, incomplete tracking, missed opportunities.",
		style: { text: "text-red-400", dot: "bg-red-500", bg: "bg-red-500" },
	},
	chargeback_resilience: {
		id: "chargeback_resilience",
		label_pt: "Resiliência a chargeback",
		label_en: "Chargeback Resilience",
		description_pt:
			"Lacunas que aumentam contestações pós-venda — políticas ausentes, prova insuficiente, ambiguidade de cobrança.",
		description_en:
			"Gaps that increase post-purchase disputes — missing policies, insufficient proof, billing ambiguity.",
		style: { text: "text-amber-400", dot: "bg-amber-500", bg: "bg-amber-500" },
	},
	scale_readiness: {
		id: "scale_readiness",
		label_pt: "Prontidão para escala",
		label_en: "Scale Readiness",
		description_pt:
			"Infraestrutura, dependências e SPOFs que quebram quando o tráfego subir 10x.",
		description_en:
			"Infra, dependencies, and SPOFs that break when traffic 10x's.",
		style: {
			text: "text-emerald-400",
			dot: "bg-emerald-500",
			bg: "bg-emerald-500",
		},
	},
	money_moment_exposure: {
		id: "money_moment_exposure",
		label_pt: "Exposição em momentos de dinheiro",
		label_en: "Money-Moment Exposure",
		description_pt:
			"Vulnerabilidades de segurança nas páginas que mais lidam com dinheiro — checkout, pagamento, área autenticada.",
		description_en:
			"Security vulnerabilities on the pages closest to money — checkout, payment, authenticated app.",
		style: { text: "text-blue-400", dot: "bg-blue-500", bg: "bg-blue-500" },
	},
	saas_growth_readiness: {
		id: "saas_growth_readiness",
		label_pt: "Prontidão de growth SaaS",
		label_en: "SaaS Growth Readiness",
		description_pt:
			"Onboarding, ativação, upgrade — lacunas específicas do funil de SaaS.",
		description_en:
			"Onboarding, activation, upgrade — SaaS-funnel-specific gaps.",
		style: {
			text: "text-violet-400",
			dot: "bg-violet-500",
			bg: "bg-violet-500",
		},
	},
	copy_alignment: {
		id: "copy_alignment",
		label_pt: "Alinhamento de copy",
		label_en: "Copy Alignment",
		description_pt:
			"Mensagem, hierarquia, hero copy, CTAs — gaps de clareza e persuasão na própria escrita.",
		description_en:
			"Messaging, hierarchy, hero copy, CTAs — clarity and persuasion gaps in the writing itself.",
		style: { text: "text-pink-400", dot: "bg-pink-500", bg: "bg-pink-500" },
	},
	content_freshness: {
		id: "content_freshness",
		label_pt: "Frescor de conteúdo",
		label_en: "Content Freshness",
		description_pt:
			"Páginas e artigos desatualizados que prejudicam confiança e SEO.",
		description_en:
			"Stale pages and articles that hurt trust and SEO.",
		style: {
			text: "text-orange-400",
			dot: "bg-orange-500",
			bg: "bg-orange-500",
		},
	},
	channel_integrity: {
		id: "channel_integrity",
		label_pt: "Integridade de canal",
		label_en: "Channel Integrity",
		description_pt:
			"Coerência entre criativo de anúncio e landing page — match de mensagem, prova, oferta.",
		description_en:
			"Coherence between ad creative and landing page — message match, proof, offer.",
		style: { text: "text-cyan-400", dot: "bg-cyan-500", bg: "bg-cyan-500" },
	},
	discoverability: {
		id: "discoverability",
		label_pt: "Descobribilidade",
		label_en: "Discoverability",
		description_pt:
			"Como você aparece em buscas, IA generativa e marketplaces. SEO, structured data, brand SERP.",
		description_en:
			"How you show up in search, generative AI, and marketplaces. SEO, structured data, brand SERP.",
		style: { text: "text-teal-400", dot: "bg-teal-500", bg: "bg-teal-500" },
	},
	brand_integrity: {
		id: "brand_integrity",
		label_pt: "Integridade de marca",
		label_en: "Brand Integrity",
		description_pt:
			"Quem usa seu nome além de você — typosquats, lookalike domains, copy mirror em concorrentes.",
		description_en:
			"Who uses your name besides you — typosquats, lookalike domains, copy mirror in competitors.",
		style: {
			text: "text-purple-400",
			dot: "bg-purple-500",
			bg: "bg-purple-500",
		},
	},
	funnel_journey: {
		id: "funnel_journey",
		label_pt: "Jornada do funil",
		label_en: "Funnel Journey",
		description_pt:
			"Fricção estrutural na jornada do comprador — beco sem saída, momentos de ansiedade, abandono pós-compra.",
		description_en:
			"Structural friction on the buyer journey — dead ends, anxiety moments, post-purchase abandonment.",
		style: { text: "text-sky-400", dot: "bg-sky-500", bg: "bg-sky-500" },
	},
	friction_tax: {
		id: "friction_tax",
		label_pt: "Imposto de fricção",
		label_en: "Friction Tax",
		description_pt:
			"Atrito comportamental acumulado — clicks supérfluos, formulários longos, popups intrusivos.",
		description_en:
			"Accumulated behavioral friction — extra clicks, long forms, intrusive popups.",
		style: { text: "text-rose-400", dot: "bg-rose-500", bg: "bg-rose-500" },
	},
	trust_revenue_gap: {
		id: "trust_revenue_gap",
		label_pt: "Gap de confiança × receita",
		label_en: "Trust × Revenue Gap",
		description_pt:
			"Sinais de confiança ausentes que custam conversão — selos, depoimentos, política de devolução, garantia.",
		description_en:
			"Missing trust signals that cost conversion — badges, testimonials, return policy, guarantee.",
		style: {
			text: "text-indigo-400",
			dot: "bg-indigo-500",
			bg: "bg-indigo-500",
		},
	},
	payment_health: {
		id: "payment_health",
		label_pt: "Saúde de pagamento",
		label_en: "Payment Health",
		description_pt:
			"Métodos suportados, parcelamento, transparência de cobrança, taxa de aprovação.",
		description_en:
			"Supported methods, installments, billing transparency, approval rate.",
		style: {
			text: "text-yellow-400",
			dot: "bg-yellow-500",
			bg: "bg-yellow-500",
		},
	},
	mobile_revenue_exposure: {
		id: "mobile_revenue_exposure",
		label_pt: "Exposição de receita mobile",
		label_en: "Mobile Revenue Exposure",
		description_pt:
			"Findings específicos de mobile — touch targets, viewport, payment sheets, performance.",
		description_en:
			"Mobile-specific findings — touch targets, viewport, payment sheets, performance.",
		style: { text: "text-rose-400", dot: "bg-rose-500", bg: "bg-rose-500" },
	},
	acquisition_integrity: {
		id: "acquisition_integrity",
		label_pt: "Integridade de aquisição",
		label_en: "Acquisition Integrity",
		description_pt:
			"Tracking de aquisição, attribution, UTM hygiene, gaps de cohort.",
		description_en:
			"Acquisition tracking, attribution, UTM hygiene, cohort gaps.",
		style: { text: "text-red-400", dot: "bg-red-500", bg: "bg-red-500" },
	},
	action_value_map: {
		id: "action_value_map",
		label_pt: "Mapa de valor por ação",
		label_en: "Action Value Map",
		description_pt:
			"Onde o esforço se concentra — pacotes de ações de baixo esforço × alto impacto.",
		description_en:
			"Where the effort concentrates — low-effort × high-impact action bundles.",
		style: { text: "text-amber-400", dot: "bg-amber-500", bg: "bg-amber-500" },
	},
	path_efficiency: {
		id: "path_efficiency",
		label_pt: "Eficiência de caminho",
		label_en: "Path Efficiency",
		description_pt:
			"Caminhos de navegação — atalhos perdidos, redundância, dead ends comportamentais.",
		description_en:
			"Navigation paths — missed shortcuts, redundancy, behavioral dead ends.",
		style: { text: "text-teal-400", dot: "bg-teal-500", bg: "bg-teal-500" },
	},
	first_impression_revenue: {
		id: "first_impression_revenue",
		label_pt: "Receita de primeira impressão",
		label_en: "First-Impression Revenue",
		description_pt:
			"O que o visitante de primeira vez vê acima da dobra. Hero, value prop, CTA inicial.",
		description_en:
			"What a first-time visitor sees above the fold. Hero, value prop, initial CTA.",
		style: {
			text: "text-violet-400",
			dot: "bg-violet-500",
			bg: "bg-violet-500",
		},
	},
	vertical_specific: {
		id: "vertical_specific",
		label_pt: "Específico do vertical",
		label_en: "Vertical-Specific",
		description_pt:
			"Padrões específicos do tipo de negócio (e-commerce, SaaS, infoproduto, local).",
		description_en:
			"Patterns specific to the business type (e-commerce, SaaS, infoproduct, local).",
		style: { text: "text-lime-400", dot: "bg-lime-500", bg: "bg-lime-500" },
	},
	cross_signal: {
		id: "cross_signal",
		label_pt: "Cross-signal",
		label_en: "Cross-Signal",
		description_pt:
			"Cadeias de findings em packs diferentes que se reforçam — Security → Revenue, Copy → Behavioral, etc.",
		description_en:
			"Chains across different packs that reinforce each other — Security → Revenue, Copy → Behavioral, etc.",
		style: {
			text: "text-fuchsia-400",
			dot: "bg-fuchsia-500",
			bg: "bg-fuchsia-500",
		},
	},
	email_deliverability: {
		id: "email_deliverability",
		label_pt: "Entregabilidade de email",
		label_en: "Email Deliverability",
		description_pt:
			"DMARC, SPF, DKIM, BIMI — saúde dos registros DNS que determinam se seu email chega.",
		description_en:
			"DMARC, SPF, DKIM, BIMI — DNS record health that determines whether your email lands.",
		style: { text: "text-amber-400", dot: "bg-amber-500", bg: "bg-amber-500" },
	},
	competitive_lens: {
		id: "competitive_lens",
		label_pt: "Lente competitiva",
		label_en: "Competitive Lens",
		description_pt:
			"Posicionamento vs peer set — copy mirror, trust posture lag, SERP encroachment, surface gaps.",
		description_en:
			"Positioning vs peer set — copy mirror, trust posture lag, SERP encroachment, surface gaps.",
		style: {
			text: "text-fuchsia-400",
			dot: "bg-fuchsia-500",
			bg: "bg-fuchsia-500",
		},
	},
};

// ──────────────────────────────────────────────
// Aliases — backwards compatibility for short forms
//
// Pre-fix code used short forms ("revenue" → revenue_integrity,
// "chargeback" → chargeback_resilience, "behavioral" → first_impression_revenue,
// "trust_gap" → trust_revenue_gap, "funnel_integrity" → funnel_journey).
// New code should use the canonical PackId; the alias map exists
// only to absorb legacy string literals from the engine + UI until
// they're migrated.
// ──────────────────────────────────────────────

export const PACK_ALIASES: Record<string, PackId> = {
	revenue: "revenue_integrity",
	chargeback: "chargeback_resilience",
	security_posture: "money_moment_exposure",
	behavioral: "first_impression_revenue",
	behavioral_heuristics: "first_impression_revenue",
	first_impression: "first_impression_revenue",
	trust_gap: "trust_revenue_gap",
	funnel_integrity: "funnel_journey",
};

// ──────────────────────────────────────────────
// Resolver helpers
// ──────────────────────────────────────────────

const FALLBACK_STYLE: PackStyle = {
	text: "text-content-muted",
	dot: "bg-content-faint",
	bg: "bg-content-faint",
};

/** Normalize a possibly-aliased pack id to its canonical form. */
export function canonicalPackId(packId: string): PackId | null {
	if (packId in PACK_REGISTRY) return packId as PackId;
	const aliased = PACK_ALIASES[packId];
	return aliased ?? null;
}

/** Resolve a pack id to its definition. Returns null for unknowns. */
export function getPackDefinition(packId: string): PackDefinition | null {
	const canonical = canonicalPackId(packId);
	return canonical ? PACK_REGISTRY[canonical] : null;
}

/** Get the style for a pack key. Never returns undefined — falls back
 *  to the gray placeholder style for unknown packs. */
export function getPackStyle(packId: string): PackStyle {
	return getPackDefinition(packId)?.style ?? FALLBACK_STYLE;
}

/** Get just the bg class (for segmented bars in the aggregator). */
export function getPackBg(packId: string): string {
	return getPackDefinition(packId)?.style.bg ?? FALLBACK_STYLE.bg;
}

/** Get the localized label for a pack. Falls back to humanized id. */
export function getPackLabel(packId: string, locale: string = "pt-BR"): string {
	const def = getPackDefinition(packId);
	if (!def) return packId.replace(/_/g, " ");
	return locale.startsWith("pt") ? def.label_pt : def.label_en;
}

/** Get the localized description (for tooltips). Empty string if unknown. */
export function getPackDescription(
	packId: string,
	locale: string = "pt-BR",
): string {
	const def = getPackDefinition(packId);
	if (!def) return "";
	return locale.startsWith("pt") ? def.description_pt : def.description_en;
}

/** All canonical pack ids in display order (suitable for filter dropdowns). */
export function listPackIds(): PackId[] {
	return Object.keys(PACK_REGISTRY) as PackId[];
}
