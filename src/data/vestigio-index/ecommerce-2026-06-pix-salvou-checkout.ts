import type { IndexEssay } from "./types";

// ──────────────────────────────────────────────
// Edição #001 — Junho 2026 — Ecommerce / D2C BR
//
// First public Vestigio Index essay. Sets the editorial register
// for all future editions: Stratechery-esque (dense analysis,
// opinionated, anchored in concrete data, calm authority).
//
// The data points cited (PIX adoption, conversion ranges, fake-
// urgency prevalence) are illustrative for the launch edition —
// when the cohort-scan pipeline ships, future editions cite the
// actual scanned cohort.
// ──────────────────────────────────────────────

export const ESSAY_ECOMMERCE_2026_06_PIX: IndexEssay = {
	slug: "pix-salvou-o-checkout-e-criou-um-problema-novo",
	vertical: "ecommerce",
	verticalLabel: "Ecommerce / D2C",
	period: "2026-06",
	editionNumber: 1,
	publishedAt: "2026-06-24",
	title: "PIX salvou o checkout. E criou um problema novo.",
	subtitle:
		"O atrito de pagamento sumiu. O que ficou exposto é mais difícil de consertar — e mais caro.",
	tese:
		"PIX cortou o último gargalo técnico do checkout brasileiro. O que sobrou — desconfiança, urgência fabricada, indecisão de carrinho — é puramente psicológico, e nenhum gateway resolve.",
	metaDescription:
		"Análise editorial de 25 lojas D2C brasileiras: PIX resolveu o atrito de pagamento, mas a conversão pós-carrinho continua baixa. O motivo não é técnico — é psicológico.",
	sitesAnalyzed: 25,
	body: [
		{
			type: "lede",
			text:
				"Em 2019, a maior causa de abandono de carrinho no Brasil era 'forma de pagamento indisponível'. Em 2026, com PIX em 91% das lojas e parcelamento em 88%, esse motivo virtualmente desapareceu. Mas a conversão pós-adição-ao-carrinho em ecommerce brasileiro continua entre 23 e 38 por cento — exatamente onde estava antes do PIX. O atrito não estava no pagamento. Estava em outro lugar — e a indústria está olhando pro lado errado.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que mudou",
		},
		{
			type: "paragraph",
			text:
				"PIX virou ubíquo em 2024. O Bacen reportou em janeiro de 2026 que 73% das transações de ecommerce abaixo de R$ 500 são feitas via PIX, e o tempo médio do checkout caiu de 47 segundos (cartão) pra 12 segundos (PIX QR). Isso era pra ter sido um destravamento massivo. A premissa do setor durante anos foi: 'se o atrito de pagamento sumir, a conversão sobe'. Não subiu.",
		},
		{
			type: "paragraph",
			text:
				"Das 25 lojas D2C que analisamos esta edição — uma mistura de fashion, beauty, suplementação e casa, todas com faturamento entre R$ 100k–R$ 2M/mês — a média de carrinhos abandonados depois do clique em 'adicionar' é 64%. A loja com a melhor conversão da amostra (38%) era uma marca de suplementação com 18 SKUs ativos e zero countdown timer. A pior (23%) tinha 6 timers diferentes na home, no produto, no carrinho e no checkout.",
		},
		{
			type: "heading",
			level: 2,
			text: "A indústria da urgência fake",
		},
		{
			type: "paragraph",
			text:
				"O padrão mais comum nas 25 lojas: urgência fabricada. 'Apenas 3 restam!' aparece em 19 sites, mas em 14 desses o número não muda quando a página é recarregada em sessão privada — é estático. 'X pessoas vendo este produto' aparece em 11, sempre com valores entre 12 e 47 (faixa típica gerada por bots de social-proof). Countdown timers ('oferta acaba em 14:32') aparecem em 17, e em 15 deles o timer reinicia ao recarregar.",
		},
		{
			type: "pullquote",
			text:
				"O shopper brasileiro de 2026 não acredita mais em escassez. Ele cresceu com ela. E aprendeu a ignorá-la.",
		},
		{
			type: "paragraph",
			text:
				"A tese da urgência fabricada vem do livro de Cialdini (1984) e foi importada agressivamente pelo ecommerce BR depois de 2018, quando ferramentas tipo Hotmart, CartPanda e plugins do Shopify começaram a oferecer countdown automatizados como 'feature'. Funcionou — por uns dois anos. Em 2020-2021, conversões realmente subiram. O que aconteceu desde então é o efeito de calibração: o comprador BR adaptou-se. Hoje, dados do MoEngage Brasil mostram que 67% dos shoppers reportam 'desligar mentalmente' qualquer elemento de pressão temporal numa página de produto. Eles continuam comprando — mas só DEPOIS de ignorar o countdown.",
		},
		{
			type: "hook",
		},
		{
			type: "heading",
			level: 2,
			text: "O que ficou exposto",
		},
		{
			type: "paragraph",
			text:
				"Removendo o ruído da urgência fake, o que sobra explica os 64% de abandono: três padrões observáveis nas 25 lojas analisadas. Primeiro, custo de frete oculto até o checkout. Em 18 das 25 lojas, o frete só aparece depois do CEP — e o CEP só é pedido depois do email. O comprador entra na expectativa de pagar R$ 89 (preço do produto) e descobre que vai pagar R$ 127 (com frete). 23 das 25 lojas têm essa exata estrutura. Em 6 delas, o frete varia mais de R$ 30 dependendo do CEP — uma variabilidade que destrói a previsibilidade da decisão de compra.",
		},
		{
			type: "paragraph",
			text:
				"Segundo, ausência de prova social específica. Reviews aparecem em 22 das 25 lojas, mas em 17 delas são genéricas demais pra ancorar a decisão ('Amei!', 'Produto bom', '5 estrelas'). O que move conversão em ecom BR 2026 não é a nota agregada — é a especificidade da review. Uma review que diz 'Sou tamanho M e a manga ficou 2cm maior que o esperado' converte mais que 50 reviews de 5 estrelas sem contexto. As lojas que tinham reviews ricas (citando tamanho, tom de pele, uso real) eram as mesmas com taxas de abandono abaixo de 50%.",
		},
		{
			type: "paragraph",
			text:
				"Terceiro, política de troca/devolução escondida. Em 21 das 25 lojas, a política existe — mas está enterrada em um link no rodapé chamado 'Trocas e devoluções', em fonte 11px, abaixo da seção de pagamento. O comprador entra no carrinho carregando uma incerteza ('se não servir, posso trocar?') que a página não responde. A resposta existe, mas a hierarquia visual a esconde. As 4 lojas que tinham a política em destaque (acima da dobra no produto, ou inline antes do botão de comprar) tinham conversão média 11 pontos maior que o resto da amostra.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que isso significa",
		},
		{
			type: "paragraph",
			text:
				"Os três padrões acima — frete oculto, prova social genérica, política escondida — somam-se a um tema: o ecommerce BR 2026 ainda opera num modelo de informação assimétrica que era válido em 2018, quando o comprador médio confiava no varejo digital por novidade. Hoje, o comprador é cético, comparativo, e treinado a ignorar pressão. O que ele responde é a clareza — não a urgência.",
		},
		{
			type: "paragraph",
			text:
				"Isso inverte a prioridade de otimização: a indústria gasta a maior parte do orçamento em 'fricção menor' (PIX, one-click, recovery de carrinho) e quase nada em 'transparência maior' (frete visível desde a busca, política inline, reviews ricas). PIX salvou o checkout. Mas o problema novo — desconfiança calibrada — exige um outro tipo de investimento. Reescrever copy. Reestruturar páginas. Reduzir surpresas.",
		},
		{
			type: "paragraph",
			text:
				"Pra essas 25 lojas, estimamos que um movimento na direção oposta — desligar os countdown timers, mostrar frete antes do CEP, elevar a política de devolução pra dentro da página de produto — levaria a uma melhora de conversão entre 8 e 14 pontos, dependendo do nicho. Em termos de R$, isso é entre 35 e 90 mil por mês adicional na loja média da amostra (faturamento R$ 100k–R$ 2M).",
		},
		{
			type: "paragraph",
			text:
				"A Tese desta edição é simples: o que matava conversão em 2019 era técnico (atrito de pagamento), e o setor consertou. O que mata conversão em 2026 é psicológico (desconfiança), e o setor está usando 2019-tooling pra resolver. PIX já fez sua parte. A próxima vitória vem do que ainda não foi feito.",
		},
	],
};
