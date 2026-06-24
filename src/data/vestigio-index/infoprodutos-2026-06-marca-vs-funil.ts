import type { IndexEssay } from "./types";

// ──────────────────────────────────────────────
// Edição #003 — Junho 2026 — Infoprodutos BR
//
// Backed by the infoprodutos-2026-06 cohort. The data revealed
// something unexpected: the homepages of big BR infoprodutores
// (Hotmart, Eduzz, Sobral, Erico, Nigro, Perini) look like SaaS
// brand sites today — not the VSL-heavy funnel pages the category
// used to be famous for. The "cultura VSL/lote/garantia" migrated
// to sub-pages. Good sign for professionalization; potential
// trap if the lead entering via the home doesn't reach the funnel
// that converts.
// ──────────────────────────────────────────────

export const ESSAY_INFOPRODUTOS_2026_06_MARCA_VS_FUNIL: IndexEssay = {
	slug: "o-infoprodutor-brasileiro-separou-a-marca-do-funil",
	vertical: "infoprodutos",
	verticalLabel: "Infoprodutos",
	period: "2026-06",
	editionNumber: 3,
	publishedAt: "2026-06-24",
	title:
		"O infoprodutor brasileiro separou a marca do funil. Não sabe ainda o que isso custa.",
	subtitle:
		"A homepage profissionalizou — virou cara de SaaS. O VSL, a garantia, a urgência migraram pra subpáginas. Bom sinal, mas cria uma armadilha que ninguém está medindo.",
	tese:
		"Há uma transição silenciosa no infoproduto brasileiro: Hotmart, Eduzz e os grandes infoprodutores (Erico, Sobral, Perini, Nigro) hoje têm homepages que poderiam ser de qualquer SaaS. A cultura VSL/lote/garantia/bônus migrou pra dentro do funil, fora da fachada. Isso é evolução — mas cria uma armadilha: o lead que entra pela home (orgânico, ads de marca) atravessa um vazio antes de chegar no funil que converte.",
	metaDescription:
		"Análise editorial de 20 infoprodutores brasileiros: homepages viraram cara de SaaS. VSL, garantia e lote migraram pra subpáginas. A armadilha que ninguém mede.",
	sitesAnalyzed: 20,
	stats: [
		{ value: "0%", label: "Têm garantia visível na home" },
		{ value: "0%", label: "Mostram VSL ou countdown na home" },
		{ value: "50%", label: "Têm sales-letter longa (HTML > 100KB)" },
	],
	body: [
		{
			type: "lede",
			text:
				"Olhamos para 24 sites de infoprodutores brasileiros — plataformas (Hotmart, Eduzz, Kiwify, Monetizze, Braip) e marcas de criadores grandes (Erico Rocha, Pedro Sobral, Bruno Perini, Thiago Nigro, Camila Farani, Joel Jota, Tiago Brunet, entre outros). 20 retornaram. Esperávamos a cara clássica do infoproduto: VSL no topo, garantia de 7 dias em destaque, lote 1/2/3, bônus #1/#2/#3, countdown ativo. Encontramos quase nada disso.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que sumiu da homepage",
		},
		{
			type: "numbered_tiles",
			items: [
				{
					n: "01",
					title: "Garantia X dias — 0 de 20",
					body:
						"\"Garantia 7 dias\" / \"risco zero\" / \"dinheiro de volta\" era item de primeira dobra obrigatório até 2022. Hoje sumiu da home.",
				},
				{
					n: "02",
					title: "VSL com autoplay — 2 de 20 (10%)",
					body:
						"O vídeo de vendas de 15min que abria toda página virou exceção na home. Migrou pra subpáginas de produto.",
				},
				{
					n: "03",
					title: "Countdown timer — 0 de 20",
					body:
						"Lote 1, lote 2, \"últimas vagas\", \"termina hoje\" — toda essa indústria da urgência fabricada não aparece na fachada.",
				},
				{
					n: "04",
					title: "Seção \"para quem é\" — 0 de 20",
					body:
						"Outro item canônico de sales page (\"para quem este curso é / não é\") está ausente das homes que analisamos.",
				},
				{
					n: "05",
					title: "Bônus exclusivos — 0 de 20",
					body:
						"\"Bônus #1\", \"Bônus #2 surpresa\", a estrutura clássica de empilhamento — sumiu.",
				},
			],
		},
		{
			type: "stat_callout",
			value: "0%",
			label: "Têm garantia exibida na home",
			context:
				"Há 4 anos isto seria 100%. A migração do funil pra subpáginas é tão completa que nenhum dos 20 sites usa o gatilho mais clássico do gênero na primeira tela.",
		},
		{
			type: "paragraph",
			text:
				"Esses números são chocantes para quem viveu o boom do infoproduto BR 2018-2022. O playbook era VSL + garantia + lote + bônus, todos visíveis acima da dobra, todos batendo no comprador na primeira tela. Hoje, é praticamente outro mercado.",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "O que está no lugar",
		},
		{
			type: "paragraph",
			text:
				"Na primeira dobra das 20 lojas que analisamos, agora você vê: foto profissional do infoprodutor, headline aspiracional curta (não promessa transacional), CTA \"saiba mais\" ou \"comece\" (não \"comprar agora\"), e — em metade dos casos — uma sales-letter longa abaixo. O comprador atravessa a home como atravessaria um portfolio de qualquer profissional — sem pressão.",
		},
		{
			type: "stat_callout",
			value: "50%",
			label: "HTML é sales-letter longa (> 100KB)",
			context:
				"Metade do cohort tem páginas substanciais o suficiente pra serem o velho \"funil em uma página\". A outra metade são homes de marca: foto, bio, links pra produtos. As duas escolas convivem.",
		},
		{
			type: "paragraph",
			text:
				"35% têm chat widget instalado — pra atendimento de matrícula e dúvidas sobre o produto. 50% mostram pricing em R$ na home. 25% mencionam PIX como opção de pagamento. WhatsApp como canal direto aparece em apenas 10% — bem menos que no ecommerce (72%), o que faz sentido: infoproduto vende mais por marca/conteúdo do que por conversa direta.",
		},
		{
			type: "pullquote",
			text:
				"A primeira geração de infoprodutores brasileiros vendia tudo na primeira página. A atual deslocou tudo pra dentro do funil — e a home virou apenas a fachada da marca.",
		},
		{ type: "hook" },
		{
			type: "heading",
			level: 2,
			text: "A armadilha que ninguém mede",
		},
		{
			type: "paragraph",
			text:
				"A profissionalização da homepage é evolução. Mostrar que você é uma marca, não apenas um vendedor, sinaliza maturidade. Mas cria um problema operacional novo: o lead que entra pela home — vindo de orgânico, de ads de marca, de menção em podcast — não vê o funil que converte.",
		},
		{
			type: "paragraph",
			text:
				"Antes era assim: ad → landing → VSL → garantia → comprar. Quatro telas. Agora é: ad → home (institucional) → procurar o produto → subpágina de venda → VSL → garantia → comprar. Sete telas. O lead atravessa um vazio antes de chegar onde o funil realmente acontece. Drop-off de cada degrau adicional comprime a conversão final.",
		},
		{
			type: "heading",
			level: 3,
			text: "O que isso custa",
		},
		{
			type: "paragraph",
			text:
				"Não medimos diretamente (precisaria do analytics interno das marcas), mas pelo padrão geral de funil web, cada degrau intermediário tira tipicamente 30-40% do tráfego. Adicionar 3 degraus entre o ad e a venda significa que ~70% do tráfego se perde no caminho, antes mesmo de ver o gatilho que converteria. Em volumes típicos de infoprodutor (ad spend de R$ 50k-500k/mês), isso é receita perdida que não aparece no dashboard porque nunca chegou no funil pra ser contada.",
		},
		{ type: "divider" },
		{
			type: "heading",
			level: 2,
			text: "Os dois modelos convivendo",
		},
		{
			type: "paragraph",
			text:
				"O cohort mostra que metade do mercado segue a escola \"home institucional + funil escondido\" e a outra metade mantém algum elemento de funil na própria home. Plataformas tipo Hotmart e Eduzz precisam de homepage institucional (são marcas de mercado, não vendem produtos). Marcas como Descomplica e Faculdade Digital também — vendem dezenas de cursos, a home é navegação. Mas infoprodutores únicos (Erico, Sobral, Perini) estão no meio do dilema: a marca pede profissionalização, o conteúdo do produto pede funil ativo.",
		},
		{
			type: "heading",
			level: 2,
			text: "O que vem agora",
		},
		{
			type: "paragraph",
			text:
				"A próxima onda do infoproduto BR não é voltar pro VSL/lote/garantia da era 2020 — esse barco já zarpou. É reconhecer que a home institucional cria um caminho mais longo entre tráfego e venda, e fechar esse caminho com instrumentação:",
		},
		{
			type: "list",
			items: [
				"Medir o drop-off entre home → produto → subpágina de venda. Hoje quase ninguém olha esse funil completo.",
				"Adicionar pelo menos UMA prova de conversão na home — depoimento curto, número de alunos, badge de notoriedade — pra dar contexto enquanto o lead navega.",
				"Reduzir a distância entre a home e o produto principal. Botão direto \"Comece pelo curso X\" acima da dobra é melhor que \"explore tudo\".",
				"Manter o funil completo (VSL, garantia, bônus, urgência real) na subpágina de venda — não é regressão usar essas ferramentas onde elas convertem.",
			],
		},
		{
			type: "paragraph",
			text:
				"A Tese desta edição: o infoprodutor brasileiro está atravessando uma transição de imagem necessária, mas a transição custa conversão enquanto não fecha o caminho entre marca e funil. Quem reconhece o gap, mede, e fecha — sem voltar pra estética de 2020 — pega a melhor parte dos dois mundos. Quem só profissionaliza a home e esquece de instrumentar o que vem depois, paga ad sem necessidade.",
		},
	],
};
