import type { IndexEssay } from "./types";

// ──────────────────────────────────────────────
// Edição #001 — Junho 2026 — Ecommerce BR
//
// Restructured 2026-06-24: replaced D2C/sales-led jargon with
// plain BR vocabulary, broke up the wall-of-prose layout with
// stat callouts + numbered tiles + dividers + a stats strip
// under the title. Same Tese, same data, more visual rhythm.
// ──────────────────────────────────────────────

export const ESSAY_ECOMMERCE_2026_06_PILARES: IndexEssay = {
	slug: "o-d2c-br-tem-dois-pilares-nenhum-dos-dois-e-o-carrinho",
	vertical: "ecommerce",
	verticalLabel: "Ecommerce",
	period: "2026-06",
	editionNumber: 1,
	publishedAt: "2026-06-24",
	title: "O ecommerce brasileiro tem dois pilares. Nenhum dos dois é o carrinho.",
	subtitle:
		"PIX e WhatsApp viraram a infraestrutura padrão das lojas online no Brasil. O que vaza agora não é o checkout — é o que escapa entre os dois canais.",
	tese:
		"Nos últimos cinco anos o ecommerce brasileiro construiu uma infraestrutura que nenhum outro mercado do mundo tem: PIX como caminho de pagamento, WhatsApp como caminho de relacionamento. A próxima vitória não vem de reduzir atrito no carrinho. Vem de fechar o buraco entre essas duas camadas — e ninguém está medindo.",
	metaDescription:
		"Análise editorial de lojas online brasileiras: PIX e WhatsApp viraram a infraestrutura padrão. O problema agora não é o checkout — é o buraco entre os dois canais.",
	sitesAnalyzed: 18,
	stats: [
		{ value: "72%", label: "Têm WhatsApp como canal direto" },
		{ value: "61%", label: "Mencionam PIX explicitamente" },
		{ value: "~0%", label: "Medem atribuição de qualquer um" },
	],
	body: [
		{
			type: "lede",
			text:
				"Olhamos para 25 lojas online brasileiras esta edição. Sete bloquearam o scan (Cloudflare, todas marcas grandes — já é um sinal). As 18 que retornaram contam outra história. Esperávamos achar o cenário que a imprensa de marketing descreve há cinco anos: countdown timers em todo carrinho, contadores fake de pessoas vendo, escassez fabricada por todo canto. Encontramos quase nada disso.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que não está lá",
		},
		{
			type: "paragraph",
			text:
				"Countdown timer apareceu em 2 das 18 lojas. Mensagens de escassez tipo \"apenas 3 restam\" também em 2. Contadores de \"X pessoas vendo este produto\" em zero. Cookie banner explícito, em 1. Para um leitor acostumado às newsletters de conversão internacionais, são números fora da curva. Em uma amostra equivalente nos EUA ou na UK, countdown timer ficaria entre 60% e 80%, contador fake em 30-40%, cookie banner em 95%+.",
		},
		{
			type: "stat_callout",
			value: "11%",
			label: "Lojas BR com countdown timer",
			context:
				"Compare com 60-80% típico do varejo online americano. O comprador BR calibrou desde 2020 — aprendeu a ignorar pressão temporal — e o retorno colapsou.",
		},
		{
			type: "paragraph",
			text:
				"O ecommerce brasileiro desligou — ou nunca ligou — a indústria da urgência fabricada. A explicação mais simples: o comprador BR adaptou-se. Em qualquer leitura, a conclusão prática é a mesma: se você ainda investe orçamento em contagem regressiva, está resolvendo um problema de 2019.",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "O que ficou exposto",
		},
		{
			type: "paragraph",
			text:
				"O que apareceu nos lugares dos timers foi outra arquitetura. 13 das 18 lojas (72%) mostram um canal direto de WhatsApp na home — botão flutuante, link no header, CTA explícito no produto. 11 das 18 (61%) mencionam PIX acima da dobra: \"pague no PIX\", \"PIX com 10% off\", selo de checkout aceitando PIX. 6 das 18 têm chat instalado (Intercom, Crisp, JivoChat, Octadesk). A combinação não é coincidência — é uma infraestrutura.",
		},
		{
			type: "pullquote",
			text:
				"O ecommerce brasileiro construiu, sem manifesto e sem marketing por trás, o sistema operacional que nenhum outro mercado tem.",
		},
		{
			type: "paragraph",
			text:
				"O contraste com o mercado americano fica claro quando você roda o mesmo scan numa amostra de marcas Shopify dos EUA: lá, WhatsApp aparece em menos de 5%, e PIX (obviamente) em zero. A versão americana do que o BR construiu são fluxos de SMS + Apple Pay/Shop Pay + chat widget — três sistemas separados, cada um com sua telemetria. O BR convergiu para dois canais que cobrem 100% do funil sem precisar de identidade federada (PIX usa CPF, WhatsApp usa número — o cruzamento é trivial).",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "Os três formatos de WhatsApp",
		},
		{
			type: "numbered_tiles",
			items: [
				{
					n: "01",
					title: "Botão flutuante sem segmentação",
					body:
						"7 das 13 lojas. Link wa.me direto pro número da loja, sem mensagem pré-preenchida. É o equivalente moderno do 0800 — útil pra atendimento, marginal pra venda.",
				},
				{
					n: "02",
					title: "Chatbot com fluxo automatizado",
					body:
						"4 das 13. O botão dispara opções estruturadas (\"1 — Comprar\", \"2 — Acompanhar pedido\", \"3 — Trocar\"). Reduz volume na inbox da loja, qualifica o lead.",
				},
				{
					n: "03",
					title: "WhatsApp como canal principal de venda",
					body:
						"2 das 13. CTA \"Comprar via WhatsApp\" competindo de igual pra igual com \"Comprar no site\". A venda acontece na conversa, não no carrinho.",
				},
			],
		},
		{
			type: "paragraph",
			text:
				"Em nenhuma das 13 lojas o site mostra publicamente o volume de venda via WhatsApp. Para uma marca em que 30% ou 40% das vendas saem via mensagem, seria um número de orgulho — \"vendemos R$ 4M/mês, 38% via WhatsApp\". Não está em nenhum lugar. Ou as marcas não sabem, ou sabem e não mostram. Em qualquer dos dois, é um buraco.",
		},
		{ type: "hook" },
		{
			type: "heading",
			level: 2,
			text: "A camada PIX",
		},
		{
			type: "paragraph",
			text:
				"PIX aparece em 11 das 18 lojas. Em 8 dessas 11, o desconto PIX está sinalizado acima da dobra — variando de 5% a 12% (típico: 7-8%). Em 3, é mencionado mas sem desconto. Em nenhuma encontramos o número que importa: a porcentagem real de checkout que sai via PIX. Para uma marca de moda com 65% PIX, a estrutura de custo é muito diferente de uma com 35% PIX.",
		},
		{
			type: "stat_callout",
			value: "44%",
			label: "Lojas que mencionam PIX mas sem desconto",
			context:
				"A decisão de \"qual % PIX queremos\" deveria ser estratégica, não emergente. Hoje, desconto fixo entre 5% e 10% para tudo. Quem testa isso ativamente extrai 2-4 pontos de margem em segmentos onde o comprador pagaria cartão.",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "O buraco entre eles",
		},
		{
			type: "paragraph",
			text:
				"Aqui é onde a Tese se firma. Quando o comprador entra via WhatsApp (atendido por humano ou bot), navega pro site, escolhe um produto, e paga via PIX, ele atravessa três sistemas distintos — WhatsApp Business API, plataforma do site, gateway de pagamento. Em nenhuma das 18 lojas há evidência pública de que esses três sistemas conversam. Custo de aquisição fica diluído entre canais. Margem por canal fica invisível. Tempo de vida do cliente por origem (WhatsApp vs ads vs orgânico) fica não-mensurável. A otimização vira tentativa e erro.",
		},
		{
			type: "paragraph",
			text:
				"O problema não é a infraestrutura. O PIX está lá. O WhatsApp está lá. O carrinho está lá. O problema é a costura. Nas marcas americanas, esse problema também existe, mas a Apple resolveu boa parte com Shop Pay rastreando origem do clique, e o Stripe consolida bastante telemetria. No BR, ninguém costura — porque PIX é Bacen, WhatsApp é Meta, e o checkout é Vindi/Pagar.me/Asaas/Stripe. Quatro fornecedores, quatro telemetrias, zero integração nativa.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que vem agora",
		},
		{
			type: "paragraph",
			text:
				"A próxima onda do ecommerce brasileiro não é uma quarta camada. Não falta uma ferramenta — temos PIX, temos WhatsApp, temos plataforma. O que falta é a camada de costura. Quem fizer isso primeiro vai ter ou (a) muito mais sinal pra otimizar, ou (b) muito mais retenção de cliente que sente que \"esta marca sabe quem eu sou\". Provavelmente ambos.",
		},
		{
			type: "paragraph",
			text:
				"A Tese desta edição é simples: PIX e WhatsApp não são funcionalidades. São a infraestrutura. O que matava conversão em 2019 era atrito (resolvido). O que mata margem em 2026 é a opacidade entre canais. Os dois pilares estão construídos. O próximo dólar de eficiência vem de fechar o loop entre eles — e quem ainda está olhando pra countdown timer está olhando pro lado errado.",
		},
	],
};
