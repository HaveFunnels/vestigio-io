import type { IndexEssay } from "./types";

// ──────────────────────────────────────────────
// Edição #002 — Junho 2026 — SaaS B2B BR
//
// Restructured 2026-06-24: replaced "sales-led / self-serve / CAC /
// LTV / Stripe-style / procurement" jargon with plain BR vocab,
// added stats strip + stat callouts + numbered tiles + dividers
// to break up the wall-of-prose. Same Tese, same data.
// ──────────────────────────────────────────────

export const ESSAY_SAAS_B2B_2026_06_MATEMATICA: IndexEssay = {
	slug: "o-saas-b2b-brasileiro-nao-e-sales-led-por-escolha-e-sales-led-por-matematica",
	vertical: "saas-b2b",
	verticalLabel: "SaaS B2B",
	period: "2026-06",
	editionNumber: 2,
	publishedAt: "2026-06-24",
	title:
		"O SaaS B2B brasileiro vende por relacionamento. Não por escolha — por necessidade.",
	subtitle:
		"21 sites analisados. Zero têm plano gratuito. Zero mostram logos de cliente. O que falta na superfície revela como o mercado realmente funciona.",
	tese:
		"O SaaS B2B brasileiro parece, na superfície, uma versão tropical do americano — landing, página de planos, teste grátis, dashboard. Mas o que falta na superfície revela a diferença estrutural: custo de aquisição alto, capacidade de pagar menor, e cultura de relacionamento que substitui a prova pública. O resultado é uma arquitetura que parece igual mas opera diferente.",
	metaDescription:
		"Análise editorial de 21 SaaS B2B brasileiros: zero plano gratuito, zero logos de cliente, 10% têm \"agendar demo\". Os padrões anômalos vs SaaS americano revelam a estrutura econômica subjacente.",
	sitesAnalyzed: 21,
	stats: [
		{ value: "0%", label: "Oferecem plano gratuito permanente" },
		{ value: "0%", label: "Mostram logos de cliente na home" },
		{ value: "10%", label: "Têm CTA de \"agendar demo\"" },
	],
	body: [
		{
			type: "lede",
			text:
				"Olhamos para 25 sites de SaaS B2B brasileiros. Quatro bloquearam o scan (Cloudflare em todos os casos), 21 retornaram. Esperávamos uma versão tropical do SaaS americano — página de planos, teste grátis, logos de cliente, \"agendar demo\". Encontramos algo bem diferente. Quatro padrões anômalos comparados ao playbook internacional, e os quatro apontam pra uma mesma estrutura subjacente.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que o SaaS americano tem e o BR não tem",
		},
		{
			type: "numbered_tiles",
			items: [
				{
					n: "01",
					title: "Plano gratuito permanente — 0% das 21 lojas",
					body:
						"Em SaaS americano esse número fica entre 70% e 85% — Slack, Notion, Linear, Vercel, todos têm. No BR, nenhuma loja do nosso cohort oferece.",
				},
				{
					n: "02",
					title: "Logos de cliente na home — 0% das 21 lojas",
					body:
						"Em SaaS americano é universal — Zapier, Asana, Monday, todos abrem com 10-30 logos. No BR, ninguém.",
				},
				{
					n: "03",
					title: "CTA \"agendar demo\" — 10% das 21 lojas",
					body:
						"Em SaaS americano tipicamente 60-70%. No BR, 24% têm \"fale com vendas\" (conversa flexível) mas só 10% têm \"agendar demo\" (slot fixo de 30min).",
				},
				{
					n: "04",
					title: "Toggle anual visível — 5% das 21 lojas",
					body:
						"Em SaaS americano ronda 70% (monthly/annual switch com desconto sinalizado). No BR, quase ninguém — o anual existe, mas se negocia, não se exibe.",
				},
			],
		},
		{
			type: "paragraph",
			text:
				"Esses números não são imperfeições aleatórias da amostra. São padrão. E o padrão revela algo importante: o SaaS B2B brasileiro não está atrasado em relação ao americano — está operando num modelo econômico diferente, e o site reflete isso.",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "Por que necessidade, não escolha",
		},
		{
			type: "paragraph",
			text:
				"Plano gratuito zero é a anomalia mais reveladora. Plano gratuito existe em SaaS americano porque a matemática fecha: custo de aquisição baixo (orgânico + viral), valor do cliente ao longo do tempo alto (USD recorrente, expansão dentro de contas), e a conta de teste-curto-vs-grátis-pra-sempre pesa pra esse lado. No Brasil, nenhum dos três é verdade. Custo de aquisição é alto (Meta Ads BR é caro vs orgânico fraco), o valor do cliente é menor em termos absolutos (mensalidade média ~R$ 200-500), e o público de teste-grátis-com-cartão converte melhor que o de plano-grátis-pra-sempre que nunca migra. Plano gratuito não fecha. Teste finito força a conversão.",
		},
		{
			type: "stat_callout",
			value: "0 / 21",
			label: "Logos de cliente exibidos publicamente",
			context:
				"NDAs são mais restritivos por default no BR — empresas pagam menos por direitos de exibição, e o time de customer success não tem autoridade ou processo pra fechar esses contratos rápido. Não é por estar atrás — é por o contrato base ser diferente.",
		},
		{
			type: "paragraph",
			text:
				"\"Agendar demo\" baixo + \"fale com vendas\" alto é o terceiro padrão. 10% têm \"agendar demo\"; 24% têm \"fale com vendas\". Não é que o BR evita vendas — é que conversa antes de agendar. Comprador BR responde melhor a \"fale com vendas\" (flexível, marcada no WhatsApp) do que a \"agendar demo\" (slot Calendly de 30min com agenda fixa). A demo agendada é importação cultural; a conversa marcada é o nativo. Sites que tentam ambos confundem; sites que escolhem o nativo convertem mais.",
		},
		{
			type: "pullquote",
			text:
				"O SaaS B2B brasileiro copia a superfície do americano e ignora a estrutura — e depois se pergunta por que a fórmula não funciona igual.",
		},
		{ type: "hook" },
		{
			type: "heading",
			level: 2,
			text: "O que o SaaS BR tem e o americano não tem",
		},
		{
			type: "paragraph",
			text:
				"A outra metade da observação é o que aparece no cohort BR e está ausente do americano. Marcadores de uma infraestrutura financeira que o SaaS americano não precisa enfrentar:",
		},
		{
			type: "numbered_tiles",
			items: [
				{
					n: "01",
					title: "Campo CNPJ no signup — 48%",
					body: "(vs ~5% em SaaS americano). Identificador B2B padrão do BR.",
				},
				{
					n: "02",
					title: "PIX como opção de pagamento — 33%",
					body: "(vs 0%). Boleto bancário mencionado em 29%. NF-e em 29%.",
				},
				{
					n: "03",
					title: "Pricing em BRL — 52% / em USD — 62%",
					body:
						"Overlap significativo: muitas empresas listam ambos pra servir BR + LatAm wider.",
				},
			],
		},
		{
			type: "paragraph",
			text:
				"O ponto não é que o SaaS BR é menos sofisticado. É que opera em outro contexto, e a sofisticação está em servir ESSE contexto — receber PIX como alternativa ao cartão corporativo (que tem fee alto no BR), emitir NF-e como obrigação fiscal, pedir CNPJ porque é o identificador padrão. Quem ignora isso entrega menos.",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "O paradoxo",
		},
		{
			type: "paragraph",
			text:
				"Aqui a Tese se firma. O SaaS B2B brasileiro copia visualmente o americano (página de planos, CTA de teste, página de integrações, blog) mas opera no modelo brasileiro de relacionamento embaixo (vendas longas, NDA restritivo, anual negociado, PIX/boleto). O buraco entre a superfície e a operação cria fricção pra o comprador.",
		},
		{
			type: "paragraph",
			text:
				"O lead entra esperando uma jornada estilo americano — clico em \"começar grátis\", preencho 3 campos, estou usando o produto em 60s — e descobre que precisa entrar no fluxo brasileiro: conversa, demo agendada por email, contrato negociado, fatura por boleto. A surpresa custa conversão.",
		},
		{
			type: "stat_callout",
			value: "86%",
			label: "Lojas sem NENHUMA prova externa",
			context:
				"Nem logos, nem case studies, nem badge G2. O comprador chega na página de planos sem nada que reduza o risco, é forçado a abrir a conversa de vendas sem nenhuma calibração prévia. Custo de aquisição sobe porque cada conversa começa do zero.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que vem agora",
		},
		{
			type: "paragraph",
			text:
				"A próxima vitória pro SaaS B2B brasileiro não vem de importar mais funcionalidades do Stripe-style americano. Vem de reconhecer estruturalmente o modelo brasileiro e desenhar o site pra ele:",
		},
		{
			type: "list",
			items: [
				"Prova social mínima (3 logos negociados + 1 case study escrito) destrava a fase de avaliação.",
				"\"Sem cartão de crédito\" explícito no botão de signup recupera 10-20% de signup completion.",
				"Selo visível de LGPD ou SOC 2 acima da dobra destrava a barreira de compras corporativas antes da conversa.",
				"Toggle BRL/USD na página de planos (ou só BRL pra quem cobra em real) elimina o atrito de comparação.",
			],
		},
		{
			type: "paragraph",
			text:
				"Nada disso é Stripe-style. Tudo isso é serviço ao mercado brasileiro real. A Tese desta edição: o SaaS BR não precisa virar americano. Precisa virar mais brasileiro conscientemente — manter o registro de relacionamento, mas reduzir as fricções que a arquitetura herdada do SF impõe. Quem reconhece o modelo, ganha. Quem copia a superfície sem entender, paga aquisição sem necessidade.",
		},
	],
};
