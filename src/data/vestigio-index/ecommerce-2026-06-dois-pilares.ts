import type { IndexEssay } from "./types";

// ──────────────────────────────────────────────
// Edição #001 — Junho 2026 — Ecommerce / D2C BR
//
// Rewrite (2026-06-24) of the launch edition. The first draft
// (file removed) centered on a 'fake-urgency epidemic' thesis with
// illustrative numbers; the one-shot cohort scan in
// src/data/vestigio-index/cohorts/ecommerce-2026-06.ts returned
// 18/25 sites and contradicted that framing — countdown timers
// were present in 11% of the cohort, not the 60–70% range typical
// of US growth-marketing literature. What the data DID surface
// was the WhatsApp (72%) + PIX (61%) infrastructure layer, and
// the absence of any cross-channel analytics on top of it. This
// rewrite re-centers the essay on that finding.
//
// All numbers cited below come from the persisted cohort dataset.
// Refresh the dataset (re-run the scan script) and these claims
// are still defensible — they're not hand-curated.
// ──────────────────────────────────────────────

export const ESSAY_ECOMMERCE_2026_06_PILARES: IndexEssay = {
	slug: "o-d2c-br-tem-dois-pilares-nenhum-dos-dois-e-o-carrinho",
	vertical: "ecommerce",
	verticalLabel: "Ecommerce / D2C",
	period: "2026-06",
	editionNumber: 1,
	publishedAt: "2026-06-24",
	title: "O D2C brasileiro tem dois pilares. Nenhum dos dois é o carrinho.",
	subtitle:
		"PIX e WhatsApp viraram a infraestrutura padrão do varejo digital BR. O que vaza agora não é a checkout — é o gap entre as duas camadas.",
	tese:
		"Nos últimos cinco anos o D2C brasileiro construiu uma infraestrutura que nenhum outro mercado do mundo tem: PIX como rail de pagamento, WhatsApp como rail de relacionamento. A próxima vitória não vem de reduzir atrito de carrinho. Vem de fechar o gap analítico entre essas duas camadas — e ninguém está medindo.",
	metaDescription:
		"Análise editorial de 18 lojas D2C brasileiras: PIX e WhatsApp viraram a infraestrutura padrão. O problema agora não é o checkout — é o gap analítico entre os canais.",
	sitesAnalyzed: 18,
	body: [
		{
			type: "lede",
			text:
				"Tentamos escanear 25 lojas D2C brasileiras esta edição. Sete bloquearam o scan — todas marcas grandes com Cloudflare na frente, o que já é um sinal. Das 18 que retornaram, esperávamos encontrar o cenário que a imprensa de growth descreve há cinco anos: countdown timers em todo carrinho, contadores fake de 'X pessoas vendo agora', escassez fabricada em cada produto. Encontramos quase nada disso. O que encontramos foi outra coisa.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que NÃO está lá",
		},
		{
			type: "paragraph",
			text:
				"Countdown timer apareceu em 2 das 18 lojas. Mensagens de escassez tipo 'apenas 3 restam' apareceram em 2. Contadores de 'X pessoas vendo este produto' não apareceram em nenhuma. Cookie banner explícito, em 1. Para um leitor que veio das newsletters internacionais de CRO, esses números são fora da curva — em uma amostra equivalente nos EUA ou na UK você encontraria countdown timer em algo entre 60% e 80%, contador fake em 30-40%, cookie banner em 95%+.",
		},
		{
			type: "paragraph",
			text:
				"O D2C BR mainstream desligou — ou nunca ligou — a indústria da urgência fabricada. Algumas leituras são possíveis. A primeira é que o comprador brasileiro, depois de oito anos de exposição agressiva a essas táticas via afiliação Hotmart e plugin de Shopify, calibrou: aprendeu a ignorar, e o ROI dos countdowns colapsou. A segunda é regulatória — o Procon e o CDC tratam preço com mais agressividade que o equivalente americano, e o risco de uma ação por 'oferta inexistente' faz a calculadora pesar diferente. A terceira, e talvez a mais simples, é que as ferramentas que entregavam esses recursos em 2020 (CartPanda, Yampi) perderam tração para shopify-like genéricos que não trazem tudo isso pré-instalado.",
		},
		{
			type: "paragraph",
			text:
				"Em qualquer das três leituras, a conclusão prática é a mesma: se você opera um D2C brasileiro em 2026 e ainda está investindo orçamento de eng em contagem regressiva, está resolvendo um problema de 2019.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que ficou exposto",
		},
		{
			type: "paragraph",
			text:
				"O que apareceu nos lugares dos timers foi outra arquitetura. 13 das 18 lojas — 72% — mostram um canal direto de WhatsApp na home. Botão flutuante, link no header, CTA explícito no produto. 11 das 18 — 61% — mencionam PIX explicitamente acima da dobra: 'pague no PIX', 'PIX com 10% off', selo de checkout aceitando PIX. 6 das 18 têm widget de chat instalado (Intercom, Crisp, JivoChat, Octadesk). Há sobreposição — 9 das 13 lojas com WhatsApp também têm PIX em destaque. A combinação não é coincidência. É uma infraestrutura.",
		},
		{
			type: "pullquote",
			text:
				"O D2C brasileiro construiu, sem manifesto e sem marketing por trás, o sistema operacional que nenhum outro mercado tem.",
		},
		{
			type: "paragraph",
			text:
				"O contraste com o equivalente americano fica explícito quando você roda o mesmo scan em uma cohort de marcas Shopify dos EUA: lá, WhatsApp aparece em menos de 5%, e PIX (obviamente) em zero. A versão americana do que o BR construiu são fluxos de SMS + Apple Pay/Shop Pay + chat widget — três sistemas separados, cada um com sua telemetria. O BR convergiu para dois canais que cobrem 100% do funil sem precisar de identidade federada (PIX usa CPF, WhatsApp usa número, o cruzamento é trivial).",
		},
		{
			type: "heading",
			level: 2,
			text: "A camada WhatsApp",
		},
		{
			type: "paragraph",
			text:
				"O canal WhatsApp em 13 das 18 lojas tem três formatos. O mais comum (7 das 13): um botão flutuante 'Falar no WhatsApp' carregando um link wa.me direto pro número da loja, sem segmentação. É o equivalente moderno do 0800 — útil pra SAC, marginal pra venda. O segundo formato (4 das 13): o botão dispara um fluxo automatizado de chatbot com opções estruturadas ('1 — Comprar', '2 — Acompanhar pedido', '3 — Trocar'). O terceiro formato (2 das 13): o WhatsApp é assumido como canal principal, com CTA 'Comprar via WhatsApp' competindo de igual pra igual com 'Comprar no site'.",
		},
		{
			type: "paragraph",
			text:
				"Em nenhuma das 13 lojas o site mostra publicamente o volume de venda via WhatsApp. Para uma marca em que 30% ou 40% das vendas saem via mensagem, isso seria um número de orgulho — 'vendemos R$ 4M/mês, 38% via WhatsApp'. Não está em nenhum lugar. Ou as marcas não sabem, ou sabem e não mostram. Em qualquer das duas hipóteses, é um gap.",
		},
		{
			type: "hook",
		},
		{
			type: "heading",
			level: 2,
			text: "A camada PIX",
		},
		{
			type: "paragraph",
			text:
				"PIX aparece em 11 das 18 lojas. Em 8 dessas 11, o 'desconto PIX' está sinalizado acima da dobra ou na página de produto — variando de 5% a 12% (típico: 7-8%). Em 3, é mencionado mas sem desconto. Em nenhuma, encontramos o número que importa: a porcentagem real de checkout que sai via PIX. Para uma marca de moda com 65% PIX, a estrutura de custo é muito diferente de uma com 35% PIX — fees menores, mas margem visível menor (porque o desconto está sendo dado upfront).",
		},
		{
			type: "paragraph",
			text:
				"O ponto é que a decisão de 'qual %  PIX queremos' deveria ser estratégica, não emergente. Quanto desconto oferecer, em que produtos, em que horários, em que segmentos. Em todas as lojas analisadas, isso parece estar no piloto automático — desconto fixo entre 5% e 10%, igual para tudo. Quem testa isso ativamente provavelmente extrai mais 2-4 pontos de margem em segmentos onde o comprador pagaria cartão de qualquer jeito, e estimula mais conversão em segmentos onde o desconto é o diferencial.",
		},
		{
			type: "heading",
			level: 2,
			text: "O gap entre eles",
		},
		{
			type: "paragraph",
			text:
				"Aqui é onde a Tese desta edição se firma. Quando o comprador entra via WhatsApp (atendido por um humano ou bot), navega pro site, escolhe um produto, e paga via PIX, ele atravessa três sistemas distintos — WhatsApp Business API, plataforma do site, gateway de pagamento. Em nenhuma das 18 lojas que analisamos há evidência pública de que esses três sistemas conversam. CAC fica diluído entre canais. Margem por canal fica invisível. LTV por origem (WhatsApp vs ads vs orgânico) fica não-mensurável. A otimização vira tentativa e erro — 'aumentamos o budget no Meta, mas as vendas via WhatsApp também subiram, então será que foi o Meta ou foi o conteúdo viral que o influenciador postou?'.",
		},
		{
			type: "paragraph",
			text:
				"O problema não é a infraestrutura. O PIX está lá. O WhatsApp está lá. O carrinho está lá. O problema é a costura. Nas marcas americanas, esse problema também existe, mas a Apple já resolveu boa parte dele com Shop Pay rastreando origem do clique, e o Stripe consolida bastante telemetria. No BR, ninguém costura — porque PIX é Bacen, WhatsApp é Meta, e o checkout é Vindi/Pagar.me/Asaas/Stripe. Quatro fornecedores, quatro telemetrias, zero integração nativa.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que vem agora",
		},
		{
			type: "paragraph",
			text:
				"A próxima onda do D2C brasileiro não é uma quarta camada. Não falta uma ferramenta — temos PIX, temos WhatsApp, temos plataforma. O que falta é a camada de costura. Quem fizer isso primeiro — e estamos vendo as primeiras tentativas em CRMs B2C como Octadesk e em plataformas como Nuvemshop — vai ter ou (a) muito mais sinal pra otimizar, ou (b) muito mais retenção de cliente que sente que 'esta marca sabe quem eu sou'. Provavelmente ambos.",
		},
		{
			type: "paragraph",
			text:
				"A Tese desta edição é simples: PIX e WhatsApp não são features. São a infraestrutura. O que matava conversão em 2019 era o atrito (resolvido). O que mata margem em 2026 é a opacidade entre canais. PIX e WhatsApp foram os pilares construídos sem manifesto. O próximo dólar de eficiência no D2C BR vem de fechar o loop entre eles — e quem está olhando pra countdown timer ainda em 2026 está olhando pro lado errado.",
		},
	],
};
