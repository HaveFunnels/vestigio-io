// ──────────────────────────────────────────────
// Surface Categories — Wave 26
//
// A category is "an element a prospect of this customer type looks
// for on a homepage to decide whether to engage." Each customer type
// (saas / ecommerce / infoproduct / service / local_business /
// generic) has its own set of categories tuned to the buyer's
// decision criteria.
//
// The LLM enricher receives the category list, the page text, and a
// brief description of each category. It returns presence + region
// (header/hero/body/footer) + extracted text per category. The signal
// extractor then compares YOU vs the peer set per category and
// surfaces gaps where ≥50% of peers highlight a category you don't.
//
// Wave 26 starter set covers the 5 verticals we see today. New ones
// (fintech, healthtech, marketplace) plug in by adding entries to the
// CUSTOMER_TYPES map below. The library is intentionally small +
// curated; we'd rather refine 5 categories per type than dilute with
// 15 generic ones.
// ──────────────────────────────────────────────

export type CustomerType =
	| "saas"
	| "ecommerce"
	| "infoproduct"
	| "service"
	| "local_business"
	| "generic";

export type SurfaceRegion = "header" | "hero" | "body" | "footer";

export interface CategorySpec {
	/** Stable identifier (snake_case). Used as map key and signal slot. */
	key: string;
	/** pt-BR label shown in findings + UI. */
	label_pt: string;
	/** Short description sent to the LLM so it knows what to look for. */
	description_pt: string;
	/** Example phrases / claims to anchor the LLM's extraction. */
	examples_pt: string[];
	/** Buyer-impact weight (0-1). Higher = more decisive for the buyer.
	 *  Used to weight the gap score so finding severity scales with
	 *  what actually drives conversion, not raw count of gaps. */
	weight: number;
	/** Optional: only relevant when product is delivered in a specific
	 *  region. Default 'hero' = above-the-fold expectation. */
	expected_region?: SurfaceRegion;
}

const SAAS_CATEGORIES: CategorySpec[] = [
	{
		key: "core_features",
		label_pt: "Funcionalidades principais",
		description_pt:
			"Lista clara das funcionalidades centrais do produto — o que ele faz, organizado por capability.",
		examples_pt: [
			"automação de WhatsApp",
			"integração com CRM",
			"agentes de IA",
			"editor de funis",
		],
		weight: 0.9,
	},
	{
		key: "integrations",
		label_pt: "Integrações disponíveis",
		description_pt:
			"Quais ferramentas externas o produto se conecta (logos, lista nominal, ou apresentação de marketplace).",
		examples_pt: [
			"Stripe, HubSpot, Slack",
			"500+ integrações",
			"integração com Shopify",
		],
		weight: 0.7,
	},
	{
		key: "pricing_transparency",
		label_pt: "Transparência de preço",
		description_pt:
			"Preço visível na própria página de marketing (não atrás de 'fale com vendas'), com tiers e o que cada um inclui.",
		examples_pt: [
			"a partir de R$99/mês",
			"plano Starter, Pro, Enterprise",
			"tabela comparativa de planos",
		],
		weight: 0.8,
		expected_region: "hero",
	},
	{
		key: "free_trial",
		label_pt: "Mecânica de teste grátis",
		description_pt:
			"Como o prospect testa o produto antes de pagar — duração, requisitos (cartão? só email?), o que está incluso no trial.",
		examples_pt: [
			"teste grátis por 14 dias",
			"comece grátis, sem cartão",
			"freemium com upgrade",
		],
		weight: 0.7,
	},
	{
		key: "support_availability",
		label_pt: "Suporte disponível",
		description_pt:
			"Canais de suporte (chat, email, telefone), SLA visível, e se há suporte humano ou só docs.",
		examples_pt: [
			"suporte 24/7",
			"chat ao vivo",
			"resposta em <2h",
			"Customer Success dedicado",
		],
		weight: 0.6,
	},
	{
		key: "certifications",
		label_pt: "Certificações e compliance",
		description_pt:
			"Selos de segurança e compliance (SOC2, ISO 27001, LGPD, GDPR) visíveis para construir confiança em vendas B2B.",
		examples_pt: ["SOC 2 Type II", "compliance LGPD", "ISO 27001", "GDPR ready"],
		weight: 0.6,
	},
];

const ECOMMERCE_CATEGORIES: CategorySpec[] = [
	{
		key: "free_shipping",
		label_pt: "Frete grátis em destaque",
		description_pt:
			"Política de frete grátis comunicada de forma proeminente (header, hero, ou tarja superior).",
		examples_pt: [
			"frete grátis acima de R$199",
			"frete grátis Brasil inteiro",
			"FRETE GRÁTIS",
		],
		weight: 0.85,
		expected_region: "header",
	},
	{
		key: "delivery_time",
		label_pt: "Prazo de entrega visível",
		description_pt:
			"Indicação clara de quando o produto chega — prazo padrão ou estimativa por região.",
		examples_pt: [
			"entrega em 2 dias úteis",
			"chegou em até 5 dias",
			"calculadora de prazo no header",
		],
		weight: 0.75,
	},
	{
		key: "return_policy",
		label_pt: "Política de troca / devolução",
		description_pt:
			"Política de devolução clara — janela, condições, custo, link visível no header ou footer.",
		examples_pt: [
			"troca grátis em 30 dias",
			"7 dias para arrependimento",
			"trocas e devoluções no menu",
		],
		weight: 0.7,
	},
	{
		key: "support_channels",
		label_pt: "Canais de suporte fáceis",
		description_pt:
			"WhatsApp, chat ao vivo, telefone ou central de ajuda acessíveis a 1-2 cliques da home.",
		examples_pt: [
			"chat WhatsApp no canto",
			"central de atendimento",
			"telefone 0800",
			"link 'Ajuda' no header",
		],
		weight: 0.65,
		expected_region: "header",
	},
	{
		key: "payment_options",
		label_pt: "Opções de pagamento + badges",
		description_pt:
			"Selos visíveis de cartões aceitos, parcelamento sem juros, PIX, boleto — sinaliza segurança e flexibilidade.",
		examples_pt: [
			"até 12x sem juros",
			"PIX com 5% off",
			"selos Visa Mastercard Amex",
			"site seguro / SSL",
		],
		weight: 0.7,
	},
	{
		key: "social_proof",
		label_pt: "Prova social específica",
		description_pt:
			"Avaliações de produtos, reviews em destaque, número de clientes, marcas de imprensa — não genérico.",
		examples_pt: [
			"4.8/5 com 12k reviews",
			"+250mil clientes",
			"Trustpilot Excellent",
			"como visto em Folha",
		],
		weight: 0.6,
	},
];

const INFOPRODUCT_CATEGORIES: CategorySpec[] = [
	{
		key: "instructor_authority",
		label_pt: "Autoridade do instrutor",
		description_pt:
			"Quem ensina, por que essa pessoa pode ensinar isso — credenciais, resultados próprios, anos de experiência.",
		examples_pt: [
			"15 anos como CTO em startups",
			"3 exits, R$50M em vendas",
			"PhD em XYZ",
			"+10mil alunos",
		],
		weight: 0.85,
		expected_region: "hero",
	},
	{
		key: "transformation_promise",
		label_pt: "Promessa de transformação",
		description_pt:
			"O resultado tangível e mensurável que o aluno alcança após completar o curso/produto — antes/depois claro.",
		examples_pt: [
			"de R$0 a R$10k em 90 dias",
			"sair do CLT e abrir sua agência",
			"primeiro código em 30 dias",
		],
		weight: 0.9,
		expected_region: "hero",
	},
	{
		key: "money_back_guarantee",
		label_pt: "Garantia de reembolso",
		description_pt:
			"Janela de reembolso explícita (7/15/30 dias) com termos claros — derisca a compra pra prospect inseguro.",
		examples_pt: [
			"7 dias de garantia incondicional",
			"30 dias risco zero",
			"seu dinheiro de volta",
		],
		weight: 0.7,
	},
	{
		key: "proof_of_results",
		label_pt: "Prova de resultados de alunos",
		description_pt:
			"Depoimentos com fotos + resultado mensurado por alunos reais (não testimonials genéricos).",
		examples_pt: [
			"Mariana, 28 anos, R$15k/mês após 4 meses",
			"prints de prints de vendas",
			"vídeos de transformação",
		],
		weight: 0.75,
	},
	{
		key: "curriculum_clarity",
		label_pt: "Currículo / conteúdo do curso",
		description_pt:
			"Lista de módulos, aulas ou capítulos visível — o prospect entende o que vai aprender antes de comprar.",
		examples_pt: [
			"8 módulos, 42 aulas",
			"currículo completo abaixo",
			"módulo 1: fundamentos",
		],
		weight: 0.6,
	},
	{
		key: "community_access",
		label_pt: "Comunidade ou suporte pós-compra",
		description_pt:
			"Grupo no Discord/Telegram, mentoria semanal, ou suporte continuado pra retenção e LTV.",
		examples_pt: [
			"grupo no Discord exclusivo",
			"mentoria semanal ao vivo",
			"acesso vitalício à comunidade",
		],
		weight: 0.5,
	},
];

const SERVICE_CATEGORIES: CategorySpec[] = [
	{
		key: "case_studies",
		label_pt: "Cases de sucesso",
		description_pt:
			"Histórias de cliente específicas com problema/solução/resultado mensurado — não logos genéricos.",
		examples_pt: [
			"+200% de leads em 3 meses pra cliente X",
			"redução de 40% em CAC",
			"case study completo: cliente Y",
		],
		weight: 0.85,
	},
	{
		key: "methodology",
		label_pt: "Metodologia / processo claro",
		description_pt:
			"Como o serviço é entregue passo a passo — diagrama, framework próprio, fases nominais.",
		examples_pt: [
			"método XYZ em 4 etapas",
			"diagnóstico → planejamento → execução",
			"nosso framework proprietário",
		],
		weight: 0.7,
	},
	{
		key: "team_visibility",
		label_pt: "Time visível",
		description_pt:
			"Fotos + nomes + roles dos profissionais que vão entregar — sinaliza substância vs caixa preta.",
		examples_pt: [
			"conheça nosso time",
			"fundadores: A, B, C",
			"liderado por ex-Google",
			"15 especialistas em SEO",
		],
		weight: 0.65,
	},
	{
		key: "qualification_process",
		label_pt: "Mecanismo de qualificação",
		description_pt:
			"Como o lead se qualifica (formulário detalhado, agendamento, pré-projeto) — sinaliza seriedade da agência.",
		examples_pt: [
			"formulário de diagnóstico",
			"agende uma sessão estratégica",
			"projetos a partir de R$50k",
		],
		weight: 0.6,
	},
	{
		key: "response_time",
		label_pt: "Tempo de resposta visível",
		description_pt:
			"Promessa explícita de SLA de resposta — 24h, 48h, mesmo dia útil.",
		examples_pt: [
			"resposta em até 24h",
			"retorno no mesmo dia útil",
			"primeira call em 48h",
		],
		weight: 0.55,
	},
	{
		key: "client_logos",
		label_pt: "Logos de clientes",
		description_pt:
			"Faixa de logos de clientes reconhecíveis — sinal de validação pra prospects similares.",
		examples_pt: [
			"clientes: Itaú, Nubank, iFood",
			"trabalhamos com +50 marcas",
			"faixa de logos no hero",
		],
		weight: 0.55,
	},
];

const LOCAL_BUSINESS_CATEGORIES: CategorySpec[] = [
	{
		key: "address_visibility",
		label_pt: "Endereço visível",
		description_pt:
			"Endereço completo do estabelecimento físico no topo, footer e/ou mapa embed — não só CEP.",
		examples_pt: [
			"Rua das Flores, 123 - Pinheiros",
			"mapa Google embed",
			"endereço no header e footer",
		],
		weight: 0.85,
		expected_region: "header",
	},
	{
		key: "hours_visible",
		label_pt: "Horário de funcionamento",
		description_pt:
			"Horários por dia da semana visíveis — quando abre, fecha, almoço, feriados especiais.",
		examples_pt: [
			"seg-sex 9h-18h",
			"sábado até 13h",
			"fechado aos domingos",
			"horário no header",
		],
		weight: 0.8,
		expected_region: "header",
	},
	{
		key: "phone_whatsapp",
		label_pt: "Telefone / WhatsApp em destaque",
		description_pt:
			"Telefone clicável (tel:) ou link WhatsApp acessível em 1 clique do header em qualquer página.",
		examples_pt: [
			"(11) 9xxxx-xxxx clicável",
			"botão flutuante de WhatsApp",
			"chame no WhatsApp",
		],
		weight: 0.85,
		expected_region: "header",
	},
	{
		key: "online_reviews",
		label_pt: "Avaliações online",
		description_pt:
			"Nota Google Maps, TripAdvisor, ou nicho-específico (iFood pra restaurante, Doctoralia pra clínica) com volume.",
		examples_pt: [
			"4.8 estrelas no Google (320 reviews)",
			"Excellent no TripAdvisor",
			"+500 avaliações iFood",
		],
		weight: 0.75,
	},
	{
		key: "photos_of_place",
		label_pt: "Fotos do local / produto",
		description_pt:
			"Galeria de fotos reais do estabelecimento, do produto ou do serviço — não stock photos.",
		examples_pt: [
			"galeria de fotos da loja",
			"ambiente acolhedor (fotos reais)",
			"cardápio com fotos",
		],
		weight: 0.6,
	},
	{
		key: "booking_mechanism",
		label_pt: "Agendamento / reserva online",
		description_pt:
			"Mecanismo pra o cliente reservar mesa, agendar consulta ou pedir orçamento online sem ligar.",
		examples_pt: [
			"reserve sua mesa",
			"agende sua consulta online",
			"botão 'Pedir orçamento'",
		],
		weight: 0.6,
	},
];

const GENERIC_CATEGORIES: CategorySpec[] = [
	{
		key: "value_prop_clarity",
		label_pt: "Proposta de valor clara",
		description_pt:
			"Headline acima da dobra responde 'o que é isso e por que me importa' em <10 segundos de leitura.",
		examples_pt: [
			"headline curto + subhead explicativo",
			"benefício concreto no hero",
		],
		weight: 0.85,
		expected_region: "hero",
	},
	{
		key: "social_proof",
		label_pt: "Prova social",
		description_pt:
			"Depoimentos, números de uso, logos de clientes ou avaliações em destaque acima da dobra.",
		examples_pt: ["+10mil clientes", "logos de marcas", "5 estrelas com X reviews"],
		weight: 0.7,
	},
	{
		key: "contact_visibility",
		label_pt: "Contato visível",
		description_pt:
			"Pelo menos um canal de contato (email, formulário, WhatsApp) acessível do header de qualquer página.",
		examples_pt: ["formulário 'Fale conosco'", "WhatsApp flutuante", "email no footer"],
		weight: 0.55,
	},
	{
		key: "policy_or_guarantee",
		label_pt: "Política ou garantia",
		description_pt:
			"Algum mecanismo de derisco — garantia de satisfação, devolução, prazo de teste, etc.",
		examples_pt: [
			"garantia de 30 dias",
			"cancele quando quiser",
			"satisfação ou seu dinheiro de volta",
		],
		weight: 0.5,
	},
];

export const CUSTOMER_TYPES: Record<CustomerType, CategorySpec[]> = {
	saas: SAAS_CATEGORIES,
	ecommerce: ECOMMERCE_CATEGORIES,
	infoproduct: INFOPRODUCT_CATEGORIES,
	service: SERVICE_CATEGORIES,
	local_business: LOCAL_BUSINESS_CATEGORIES,
	generic: GENERIC_CATEGORIES,
};

// ──────────────────────────────────────────────
// Customer-type resolver
//
// businessModel is the primary signal (enum on Environment).
// industry text is the secondary discriminator — when present and
// matches a known sub-vertical keyword, it overrides the businessModel
// default. Falls back to 'generic' when neither signals match.
// ──────────────────────────────────────────────

const INDUSTRY_INFOPRODUCT = /\b(curso|cursos|treinamento|treinamentos|ebook|infoproduto|info\s*produto|formação|certificação|mentoria)\b/i;
const INDUSTRY_LOCAL = /\b(local|física|fisica|clínica|clinica|consultório|consultorio|restaurante|loja\s*física|loja\s*fisica|salão|salao|barbearia|estética|estetica|odonto|petshop|pet\s*shop|academia)\b/i;
const INDUSTRY_SERVICE = /\b(agência|agencia|consultoria|assessoria|serviços|servicos\s+profissionais|escritório|escritorio)\b/i;

export function resolveCustomerType(
	businessModel: string | null | undefined,
	industry: string | null | undefined,
): CustomerType {
	const ind = (industry || "").trim();
	if (ind.length > 0) {
		if (INDUSTRY_INFOPRODUCT.test(ind)) return "infoproduct";
		if (INDUSTRY_LOCAL.test(ind)) return "local_business";
		// service keywords override lead_gen + hybrid defaults
		if (INDUSTRY_SERVICE.test(ind)) return "service";
	}
	switch (businessModel) {
		case "saas":
			return "saas";
		case "ecommerce":
			return "ecommerce";
		case "lead_gen":
			return "service";
		case "hybrid":
		default:
			return "generic";
	}
}

export function getCategoriesFor(type: CustomerType): CategorySpec[] {
	return CUSTOMER_TYPES[type];
}
