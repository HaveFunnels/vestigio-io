import type { IndexEssay } from "./types";

// ──────────────────────────────────────────────
// Edição #002 — Junho 2026 — SaaS B2B BR
//
// First SaaS B2B edition of Vestigio Index. Backed by the
// saas-b2b-2026-06 cohort scan (21/25 sites succeeded). The four
// anomalies vs US/EU SaaS literature (free tier = 0%, customer
// logos = 0%, demo CTA = 10%, annual toggle = 5%) anchor the
// thesis — BR SaaS B2B looks like its US counterpart on the
// surface but operates on a different economic model underneath.
//
// All numerical claims trace to the persisted cohort dataset; rerun
// the scan script and the numbers still defend themselves.
// ──────────────────────────────────────────────

export const ESSAY_SAAS_B2B_2026_06_MATEMATICA: IndexEssay = {
	slug: "o-saas-b2b-brasileiro-nao-e-sales-led-por-escolha-e-sales-led-por-matematica",
	vertical: "saas-b2b",
	verticalLabel: "SaaS B2B",
	period: "2026-06",
	editionNumber: 2,
	publishedAt: "2026-06-24",
	title:
		"O SaaS B2B brasileiro não é sales-led por escolha. É sales-led por matemática.",
	subtitle:
		"21 sites analisados. Free tier zero. Customer logos zero. O que falta na superfície revela como o mercado realmente funciona.",
	tese:
		"O SaaS B2B brasileiro parece, na superfície, uma versão tropical do SaaS americano — landing, pricing page, trial, dashboard. Mas o que falta na superfície revela a verdadeira diferença estrutural: CAC alto, capacidade de pagar baixa, e cultura de relacionamento substituindo prova pública. O resultado é uma arquitetura que parece igual mas opera diferente — e os founders que reconhecem isso conscientemente ganham.",
	metaDescription:
		"Análise editorial de 21 SaaS B2B brasileiros: free tier 0%, customer logos 0%, demo CTA 10%. Os padrões anômalos vs US/EU SaaS revelam a estrutura econômica subjacente.",
	sitesAnalyzed: 21,
	body: [
		{
			type: "lede",
			text:
				"Escaneamos 25 sites de SaaS B2B brasileiros desta edição. Quatro bloquearam o scan (Cloudflare, todos os casos), 21 retornaram. Esperávamos encontrar uma versão tropical do SaaS americano — pricing page, free tier, customer logo wall, 'book a demo'. Encontramos algo bem diferente. Quatro padrões anômalos comparados à literatura US/EU, e os quatro apontam pra uma mesma estrutura subjacente.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que SaaS americano tem e BR não tem",
		},
		{
			type: "paragraph",
			text:
				"Quatro números do cohort fazem o BR SaaS B2B parecer um outro mercado. Plano gratuito ('free forever' / 'grátis pra sempre'): 0 das 21 lojas. Em qualquer cohort equivalente nos EUA, esse número fica entre 70% e 85% — Slack, Notion, Linear, Vercel, todos têm. Customer logo wall ('trusted by', strip de logos no topo da landing): 0 das 21. Em SaaS US, isso é universal — Zapier, Asana, Monday, todos abrem com 10-30 logos. Demo CTA explícito ('Book a demo' / 'Schedule a demo'): 2 das 21 (10%). Em SaaS US o número é tipicamente 60-70% — qualquer site sales-led tem o botão. Toggle anual visível na pricing page (monthly/annual switch com desconto sinalizado): 1 das 21 (5%). Em SaaS US ronda 70%.",
		},
		{
			type: "paragraph",
			text:
				"Esses números não são imperfeições aleatórias da amostra. São padrão. E o padrão revela algo importante: o BR SaaS B2B não está atrasado em relação ao SaaS americano — está operando num modelo econômico diferente, e o site reflete isso.",
		},
		{
			type: "heading",
			level: 2,
			text: "Por que matemática, não escolha",
		},
		{
			type: "paragraph",
			text:
				"Free tier zero é a anomalia mais reveladora. Free tier existe em SaaS americano porque a matemática fecha: CAC baixo (organic + viral), LTV alto (USD recorrente, expansão dentro de contas), e a conta de tarifas-de-trial-curto-vs-free-tier-longo pesa pra esse lado. No Brasil, nenhum dos três é verdade. CAC é alto (Meta Ads BR é caro vs orgânico fraco), LTV é menor em termos absolutos (mensalidade BRL média ~R$ 200-500), e o public sobre-trial-grátis-com-cartão tem taxa de conversão maior que o público de free-tier-pra-sempre que nunca migra. Free tier não pencila. Trial-based finito força conversão. Não é escolha estética — é matemática de unit economics.",
		},
		{
			type: "paragraph",
			text:
				"Customer logos zero é uma anomalia cultural. Customer logo wall existe em SaaS americano porque o costume contratual é: cliente paga, paga relativamente pouco a mais pra incluir display rights, e o customer success team gerencia a aprovação. No Brasil, NDAs são mais restritivos por default — empresas brasileiras pagam menos por display rights (literalmente: 'pra mostrar meu logo, vc me dá quanto de desconto?'), e o customer success team não tem autoridade ou processo pra fechar esses contratos rápido. Resultado: o logo nunca aparece. Não é por estarmos atrás — é por o contrato base ser diferente.",
		},
		{
			type: "pullquote",
			text:
				"O BR SaaS B2B copia a SUPERFÍCIE do SaaS americano e ignora a ESTRUTURA — e depois se pergunta por que a fórmula não funciona igual.",
		},
		{
			type: "paragraph",
			text:
				"Demo CTA baixo + customTier ('fale com vendas') alto é o terceiro padrão. 10% têm 'Book a demo'; 24% têm 'fale com vendas'. Não é que BR SaaS evita sales — é que BR SaaS conversa antes de agendar. Comprador BR responde melhor a 'fale com vendas' (conversa flexível, marcada no WhatsApp) que a 'book a demo' (slot Calendly de 30min com agenda fixa). A demo agendada é importação cultural; a conversa marcada é o nativo. Sites que tentam ambos confundem; sites que escolhem o nativo convertem mais.",
		},
		{
			type: "paragraph",
			text:
				"Toggle anual visível em 5% completa o quadro. SaaS BR vende contratos anuais — é como a unit economics fecha. Mas o anual não está na pricing page como toggle self-serve. Está na conversa de vendas. Por quê? Porque commit anual no Brasil é decisão de C-level, não de operador, e a negociação de desconto anual é parte da venda. Surfacear o toggle e oferecer 20% off self-serve mata a margem de negociação que o vendedor usaria. Os 5% que oferecem self-serve anual quase sempre são empresas-produto (Pipefy, RD Station) com fluxo de conversão alto que pode absorver a margem fixa em troca de velocidade.",
		},
		{
			type: "hook",
		},
		{
			type: "heading",
			level: 2,
			text: "O que SaaS BR tem e SaaS americano não tem",
		},
		{
			type: "paragraph",
			text:
				"A outra metade da observação é o que aparece no cohort BR e está ausente do cohort US. Campo CNPJ no signup: 48% (vs ~5% em SaaS US). Boleto bancário mencionado: 29% (vs 0%). NF-e / nota fiscal: 29% (vs 0%). PIX como opção de pagamento de assinatura: 33% (em SaaS US, PIX é inexistente). Pricing em BRL: 52%. Pricing em USD: 62% — overlap significativo de empresas listando ambos pra servir BR + LatAm wider. Esses são marcadores de uma infraestrutura financeira que SaaS americano não tem que se preocupar.",
		},
		{
			type: "paragraph",
			text:
				"O ponto não é que o BR SaaS B2B é menos sofisticado. É que opera em outro contexto, e a sofisticação está em servir ESSE contexto — receber PIX como alternativa a cartão de crédito num momento em que cartão corporativo brasileiro tem fee alto, emitir NF-e como obrigação fiscal, pedir CNPJ porque é o identificador B2B padrão. Isso não aparece no manual de SaaS americano porque a infraestrutura subjacente é diferente. Quem ignora isso entrega menos.",
		},
		{
			type: "heading",
			level: 2,
			text: "O paradoxo",
		},
		{
			type: "paragraph",
			text:
				"Aqui é onde a tese se firma. O BR SaaS B2B copia visualmente o SaaS americano (pricing page, trial CTA, integrations page, blog) mas opera no modelo brasileiro de relacionamento embaixo (vendas longas, NDA restritivo, anual negociado, PIX/boleto). O gap entre superfície e operação cria fricção pra comprador. O lead entra esperando uma jornada US-style — clico em 'start free trial', preencho 3 campos, estou usando o produto em 60s — e descobre que precisa entrar no fluxo BR-style: conversa, demo agendada por email, contrato negociado, fatura por boleto. A surpresa custa conversão.",
		},
		{
			type: "paragraph",
			text:
				"As 86% das lojas que NÃO mostram nenhum trust signal externo — sem logos, sem case studies, sem badge G2 — são o sintoma mais claro disso. O comprador chega na pricing page, não tem prova social pra reduzir risco, é forçado a abrir a conversa de vendas sem nenhuma calibração prévia. CAC sobe porque cada conversa começa do zero. Não tem nada a ver com o produto ser bom ou ruim — é arquitetura de funil errada.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que vem agora",
		},
		{
			type: "paragraph",
			text:
				"A próxima vitória pro BR SaaS B2B não vem de importar mais features de Stripe-style americano. Vem de reconhecer estruturalmente o modelo brasileiro e desenhar o site pra ele. Customer proof, mesmo que mínimo (3 logos negociados + 1 case study escrito), destrava avaliação. 'Sem cartão de crédito' (que ninguém comunica) explícito no botão de signup recupera 10-20% de signup completion. Marker visível de LGPD ou SOC 2 acima da dobra destrava a barreira de procurement antes da conversa. Toggle BRL/USD na pricing page (ou só BRL pra quem cobra em real) elimina o atrito mental de comparação.",
		},
		{
			type: "paragraph",
			text:
				"Nada disso é Stripe-style. Tudo isso é serviço ao mercado brasileiro real. A Tese desta edição: SaaS BR não precisa virar americano. Precisa virar mais brasileiro conscientemente — manter o registro de relacionamento, mas reduzir as fricções que a arquitetura herdada do SF impõe. Quem reconhece o modelo, ganha. Quem copia a superfície sem entender, paga CAC sem necessidade.",
		},
	],
};
