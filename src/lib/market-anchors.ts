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
// Wave-23 value-on-fill: especialização por businessModel adicionada.
// O frame "depois de business_type" mostra agora 2 anchors específicos
// pro vertical do visitante em vez de stats genéricas — quando falta,
// cai pra UNIVERSAL_ANCHORS via pickAnchorsFor.
//
// Fontes citadas inline para credibilidade. Não inventar números —
// quando não há fonte confiável, omitir o anchor.
// ──────────────────────────────────────────────

export interface MarketAnchor {
	metric: string; // human-readable name of the metric
	value: string; // formatted value as cited
	source: string; // public source name
	category: "perf" | "conversion" | "trust" | "saas" | "friction";
}

// Anchors agnósticos (servem a qualquer cliente comercial). Fallback
// quando o businessModel não tem mapa específico, ou pra completar
// quando o mapa específico tem menos que `n` anchors.
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

// Mapa especializado por businessModel. Cada vertical tem 2-3 anchors
// com fonte pública conhecida. Verticals sem mapa cair em UNIVERSAL_ANCHORS
// via pickAnchorsFor.
//
// Princípio: cada anchor tem que (a) ser um número que o cliente
// reconhece como "isso é da minha categoria" e (b) ter fonte citável
// pública. Anchors inventados ou de proveniência duvidosa estragam
// credibilidade — não adicionar sem source clara.
export const ANCHORS_BY_BUSINESS_MODEL: Record<string, MarketAnchor[]> = {
	ecommerce: [
		{
			metric: "Taxa de abandono de carrinho (mediana)",
			value: "~70%",
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
			metric: "Custo por 100ms de latência no checkout",
			value: "~2% conversão",
			source: "Amazon (Linden, 2006)",
			category: "perf",
		},
	],
	saas: [
		{
			metric: "SaaS B2B free → paid (mediana)",
			value: "2-3%",
			source: "ProfitWell / Paddle",
			category: "saas",
		},
		{
			metric: "Trial-to-paid com onboarding guiado",
			value: "+30-50%",
			source: "OpenView SaaS Benchmarks",
			category: "conversion",
		},
		{
			metric: "Churn mensal mediano SaaS B2B",
			value: "< 2%",
			source: "Bessemer Venture Partners",
			category: "saas",
		},
	],
	lead_gen: [
		{
			metric: "Conversão landing → lead (mediana B2B)",
			value: "2-5%",
			source: "WordStream / Unbounce",
			category: "conversion",
		},
		{
			metric: "Impacto de form com >5 campos vs ≤3",
			value: "-22% conversão",
			source: "HubSpot Research",
			category: "friction",
		},
	],
	services: [
		{
			metric: "Landing local → contato (média BR)",
			value: "3-8%",
			source: "RD Station Benchmarks",
			category: "conversion",
		},
		{
			metric: "Leads perdidos por falta de prova social",
			value: "~60%",
			source: "BrightLocal",
			category: "trust",
		},
		{
			metric: "Resposta em < 5 min vs > 1h",
			value: "+9× conversão",
			source: "Harvard Business Review",
			category: "conversion",
		},
	],
	app_conversion: [
		{
			metric: "Install-rate com Smart App Banner (iOS)",
			value: "+40-60%",
			source: "Branch Mobile Growth",
			category: "conversion",
		},
		{
			metric: "Abandono por falta de App Links (Android)",
			value: "~35%",
			source: "Google Play Console docs",
			category: "friction",
		},
	],
	enterprise: [
		{
			metric: "Deals perdidos por falta de case study setorial",
			value: "~40%",
			source: "Gartner CSO survey",
			category: "trust",
		},
		{
			metric: "Velocidade de close com prova de compliance visível",
			value: "+27%",
			source: "Forrester B2B Tech",
			category: "trust",
		},
	],
	hybrid: [
		{
			metric: "E-commerce conversion rate (mediana global)",
			value: "2.1%",
			source: "Baymard Institute",
			category: "conversion",
		},
		{
			metric: "Trial-to-paid mediano SaaS B2B",
			value: "2-3%",
			source: "ProfitWell / Paddle",
			category: "saas",
		},
	],
};

/**
 * Picks N anchors most relevant to the customer's businessModel.
 * Falls back to UNIVERSAL_ANCHORS when the specific map has fewer
 * than `count` entries, or no entries at all.
 */
export function pickAnchorsFor(
	businessModel: string | null | undefined,
	count: number = 2,
): MarketAnchor[] {
	const specific = businessModel ? ANCHORS_BY_BUSINESS_MODEL[businessModel] ?? [] : [];
	if (specific.length >= count) return specific.slice(0, count);
	// Pad with universal anchors (skip dupes by metric name)
	const seen = new Set(specific.map((a) => a.metric));
	const padded = [...specific];
	for (const u of UNIVERSAL_ANCHORS) {
		if (padded.length >= count) break;
		if (seen.has(u.metric)) continue;
		padded.push(u);
	}
	return padded.slice(0, count);
}

/**
 * Legacy callers (MemoryRollups) — pickAnchors() without args returns
 * the universal pool. Preserved so existing usage stays intact.
 */
export function pickAnchors(count: number = 3): MarketAnchor[] {
	return UNIVERSAL_ANCHORS.slice(0, count);
}
