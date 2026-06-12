// ──────────────────────────────────────────────
// Market anchors — referências calibradas de mercado
//
// Customer feedback: o slot "Benchmark vs categoria fica disponível em
// ~4 meses" matava a peça da MemoryRollups. Em vez de esperar o N
// estatístico pra dar comparação na categoria do cliente, ancoramos em
// referências PÚBLICAS conhecidas (Baymard, HTTP Archive, ProfitWell,
// Amazon). É comparação categórica, não estatística — funciona com
// N=1 customer e ainda dá ao cliente um norte concreto pra calibrar
// expectativas.
//
// Fontes citadas inline para credibilidade. Não inventar números —
// quando não há fonte confiável, omitir o anchor.
// ──────────────────────────────────────────────

export interface MarketAnchor {
	metric: string; // human-readable name of the metric
	value: string; // formatted value as cited
	source: string; // public source name
	category: "perf" | "conversion" | "trust" | "saas";
}

// Anchors agnósticos (servem a qualquer cliente comercial). Quando
// quisermos especializar por business_model (saas/ecommerce/lead_gen),
// adicionar mapas paralelos.
export const UNIVERSAL_ANCHORS: MarketAnchor[] = [
	{
		metric: "Checkout p99 (top quartile e-commerce)",
		value: "< 500ms",
		source: "HTTP Archive 2025",
		category: "perf",
	},
	{
		metric: "Custo por 100ms acima de 1s no checkout",
		value: "~2% de conversão",
		source: "Amazon (Linden, 2006)",
		category: "perf",
	},
	{
		metric: "E-commerce conversion rate (mediana global)",
		value: "2.1%",
		source: "Baymard Institute",
		category: "conversion",
	},
	{
		metric: "Abandono ao ver checkout off-domain",
		value: "82% dos buyers",
		source: "Baymard Institute",
		category: "trust",
	},
	{
		metric: "SaaS B2B free → paid (mediana)",
		value: "2-3%",
		source: "ProfitWell / Paddle",
		category: "saas",
	},
];

/**
 * Picks N anchors most relevant to the customer. For now agnostic —
 * future: filter by businessModel (saas/ecommerce/lead_gen) to bias the
 * selection.
 */
export function pickAnchors(count: number = 3): MarketAnchor[] {
	return UNIVERSAL_ANCHORS.slice(0, count);
}
