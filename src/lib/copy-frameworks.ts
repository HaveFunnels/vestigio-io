/**
 * copy-frameworks — Catalog of copywriting frameworks for the
 * Wave 11.5g Framework Lens widget.
 *
 * Each framework is a structured ruleset. Each criterion has a
 * stable id + label + hint of "what good looks like". The hint
 * doubles as evaluation guidance fed to the LLM at audit time.
 *
 * Labels/hints are inlined as { en, pt } for V1 — keeps the
 * catalog self-contained without exploding the i18n dictionaries
 * by ~150 keys. es/de fall back to en at render time. Move to
 * full i18n keys when the catalog stabilises.
 */

export interface CriterionText {
	en: string;
	pt: string;
}

export interface FrameworkCriterion {
	id: string;
	/** Short label shown in the checklist (3-4 words) */
	label: CriterionText;
	/** What a passing copy looks like — also fed to LLM as guidance */
	hint: CriterionText;
}

export interface CopyFramework {
	id: string;
	name: CriterionText;
	/** 1-line description shown when framework is selected */
	intro: CriterionText;
	/** 2-3 word strategic tag (e.g. "Loss frame", "Top of funnel"). */
	useCase: CriterionText;
	/** 1-sentence guidance on when this framework is the right pick. */
	whenToUse: CriterionText;
	criteria: FrameworkCriterion[];
}

export function pickText(text: CriterionText, locale: string): string {
	if (locale === "pt-BR" || locale === "pt") return text.pt;
	return text.en;
}

export const COPY_FRAMEWORKS: CopyFramework[] = [
	{
		id: "aida",
		name: { en: "AIDA", pt: "AIDA" },
		intro: {
			en: "Attention, Interest, Desire, Action — the classic 4-stage funnel for landing pages and ads.",
			pt: "Atenção, Interesse, Desejo, Ação — o clássico funil de 4 estágios pra landing pages e ads.",
		},
		useCase: { en: "Top of funnel", pt: "Topo do funil" },
		whenToUse: {
			en: "Drag a cold reader from awareness to action in 4 beats. Best for ads, hero sections, cold landing pages.",
			pt: "Conduz o leitor frio de awareness a ação em 4 batidas. Ideal pra ads, heros e landing pages frias.",
		},
		criteria: [
			{
				id: "attention",
				label: { en: "Attention", pt: "Atenção" },
				hint: {
					en: "Headline stops scroll: contrast, novelty, specific number, or pattern interrupt.",
					pt: "Headline para o scroll: contraste, novidade, número específico ou pattern interrupt.",
				},
			},
			{
				id: "interest",
				label: { en: "Interest", pt: "Interesse" },
				hint: {
					en: "Subhead deepens curiosity with specific intrigue or a tangible promise.",
					pt: "Subhead aprofunda a curiosidade com intrigue específica ou promessa tangível.",
				},
			},
			{
				id: "desire",
				label: { en: "Desire", pt: "Desejo" },
				hint: {
					en: "Outcome / transformation language is visible — what the reader becomes after using it.",
					pt: "Linguagem de transformação visível — quem o leitor se torna após usar o produto.",
				},
			},
			{
				id: "action",
				label: { en: "Action", pt: "Ação" },
				hint: {
					en: "CTA is clear, specific, and singular — uses an action verb the reader can complete now.",
					pt: "CTA claro, específico e singular — verbo de ação que o leitor pode completar agora.",
				},
			},
		],
	},
	{
		id: "pas",
		name: { en: "PAS", pt: "PAS" },
		intro: {
			en: "Problem, Agitation, Solution — short-form persuasion that opens a wound before offering the cure.",
			pt: "Problema, Agitação, Solução — persuasão curta que abre a ferida antes de oferecer a cura.",
		},
		useCase: { en: "Loss frame", pt: "Frame de perda" },
		whenToUse: {
			en: "Lead with the pain, agitate the cost of inaction, then deliver the solution. Built for problem-aware audiences.",
			pt: "Comece com a dor, agite o custo de não agir, então entregue a solução. Feito pra audiências problem-aware.",
		},
		criteria: [
			{
				id: "problem",
				label: { en: "Problem", pt: "Problema" },
				hint: {
					en: "Names a specific pain the reader already feels — not a vague industry issue.",
					pt: "Nomeia uma dor específica que o leitor já sente — não um problema genérico do setor.",
				},
			},
			{
				id: "agitation",
				label: { en: "Agitation", pt: "Agitação" },
				hint: {
					en: "Amplifies the cost of inaction. Concrete consequences, not abstractions.",
					pt: "Amplifica o custo da inação. Consequências concretas, não abstrações.",
				},
			},
			{
				id: "solution",
				label: { en: "Solution", pt: "Solução" },
				hint: {
					en: "Solution flows naturally from the agitated problem — mechanism is plausible.",
					pt: "A solução flui naturalmente do problema agitado — o mecanismo é plausível.",
				},
			},
		],
	},
	{
		id: "four_ps",
		name: { en: "4 P's", pt: "4 P's" },
		intro: {
			en: "Promise, Picture, Proof, Push — Henry Hoke's framework for headline + subhead structure.",
			pt: "Promessa, Imagem, Prova, Empurrão — framework do Henry Hoke pra estrutura de headline.",
		},
		useCase: { en: "Long-form sales", pt: "Vendas long-form" },
		whenToUse: {
			en: "Paint the outcome, promise the path, prove it works, push to act. Classic direct-response structure.",
			pt: "Pinte o resultado, prometa o caminho, prove que funciona, empurre pra ação. Estrutura clássica de direct-response.",
		},
		criteria: [
			{
				id: "promise",
				label: { en: "Promise", pt: "Promessa" },
				hint: {
					en: "Headline makes a concrete benefit promise tied to the reader's real outcome.",
					pt: "Headline faz uma promessa concreta de benefício ligada ao resultado real do leitor.",
				},
			},
			{
				id: "picture",
				label: { en: "Picture", pt: "Imagem" },
				hint: {
					en: "Subhead paints a vivid picture of the after-state — reader can see themselves there.",
					pt: "Subhead pinta uma imagem vívida do estado pós — o leitor se vê nele.",
				},
			},
			{
				id: "proof",
				label: { en: "Proof", pt: "Prova" },
				hint: {
					en: "Tangible proof anchors the promise: number, testimonial, credential, or specific case.",
					pt: "Prova tangível ancora a promessa: número, depoimento, credencial ou caso específico.",
				},
			},
			{
				id: "push",
				label: { en: "Push", pt: "Empurrão" },
				hint: {
					en: "Push toward the next step — urgency, scarcity, or simple CTA. Removes ambiguity.",
					pt: "Empurra pro próximo passo — urgência, escassez ou CTA simples. Remove ambiguidade.",
				},
			},
		],
	},
	{
		id: "bab",
		name: { en: "BAB", pt: "BAB" },
		intro: {
			en: "Before, After, Bridge — three-beat structure perfect for emails and short pages.",
			pt: "Antes, Depois, Ponte — estrutura de 3 batidas perfeita pra emails e páginas curtas.",
		},
		useCase: { en: "Transformation", pt: "Transformação" },
		whenToUse: {
			en: "Anchor a vivid 'before', contrast with the 'after', position your product as the bridge. Perfect for outcome-driven copy.",
			pt: "Ancore um 'antes' vívido, contraste com o 'depois', posicione seu produto como a ponte. Perfeito pra copy orientada a resultado.",
		},
		criteria: [
			{
				id: "before",
				label: { en: "Before state", pt: "Estado anterior" },
				hint: {
					en: "Captures the reader's current frustrating state with empathy and specificity.",
					pt: "Captura o estado atual frustrante do leitor com empatia e especificidade.",
				},
			},
			{
				id: "after",
				label: { en: "After state", pt: "Estado posterior" },
				hint: {
					en: "Shows the desired after-state vividly — what life looks like once solved.",
					pt: "Mostra o estado desejado vividamente — como a vida fica uma vez resolvido.",
				},
			},
			{
				id: "bridge",
				label: { en: "Bridge", pt: "Ponte" },
				hint: {
					en: "The product is the bridge between before and after — the mechanism is clear.",
					pt: "O produto é a ponte entre antes e depois — o mecanismo está claro.",
				},
			},
		],
	},
	{
		id: "spin",
		name: { en: "SPIN", pt: "SPIN" },
		intro: {
			en: "Situation, Problem, Implication, Need-payoff — Neil Rackham's B2B framework, perfect for SaaS.",
			pt: "Situação, Problema, Implicação, Need-payoff — framework B2B do Neil Rackham, ideal pra SaaS.",
		},
		useCase: { en: "Enterprise sales", pt: "Vendas enterprise" },
		whenToUse: {
			en: "Situation, Problem, Implication, Need-payoff. Built for high-ticket consultative selling.",
			pt: "Situação, Problema, Implicação, Need-payoff. Feito pra vendas consultivas de ticket alto.",
		},
		criteria: [
			{
				id: "situation",
				label: { en: "Situation", pt: "Situação" },
				hint: {
					en: "Establishes the reader's business context — what they do, who they serve.",
					pt: "Estabelece o contexto de negócio do leitor — o que faz, quem atende.",
				},
			},
			{
				id: "problem",
				label: { en: "Problem", pt: "Problema" },
				hint: {
					en: "Surfaces a specific operational problem the reader recognizes immediately.",
					pt: "Faz emergir um problema operacional específico que o leitor reconhece de imediato.",
				},
			},
			{
				id: "implication",
				label: { en: "Implication", pt: "Implicação" },
				hint: {
					en: "Reveals the downstream cost of the problem — money, time, churn, risk.",
					pt: "Revela o custo a jusante do problema — dinheiro, tempo, churn, risco.",
				},
			},
			{
				id: "need_payoff",
				label: { en: "Need-payoff", pt: "Recompensa" },
				hint: {
					en: "Connects solving the problem to a measurable business outcome the reader values.",
					pt: "Conecta resolver o problema a um resultado de negócio mensurável que o leitor valoriza.",
				},
			},
		],
	},
	{
		id: "fab",
		name: { en: "FAB", pt: "FAB" },
		intro: {
			en: "Features, Advantages, Benefits — translates product specs into user outcomes.",
			pt: "Features, Vantagens, Benefícios — traduz specs do produto em resultados pro usuário.",
		},
		useCase: { en: "Feature pages", pt: "Páginas de features" },
		whenToUse: {
			en: "Translate features into advantages into customer benefits. Stops the 'feature dump' anti-pattern cold.",
			pt: "Traduz features em vantagens em benefícios do cliente. Mata o anti-padrão de 'feature dump'.",
		},
		criteria: [
			{
				id: "features",
				label: { en: "Features", pt: "Features" },
				hint: {
					en: "Specific product capabilities are stated — not buzzwords.",
					pt: "Capacidades específicas do produto são declaradas — não buzzwords.",
				},
			},
			{
				id: "advantages",
				label: { en: "Advantages", pt: "Vantagens" },
				hint: {
					en: "Each feature is explicitly tied to what it does better than alternatives.",
					pt: "Cada feature está explicitamente ligada ao que faz melhor que alternativas.",
				},
			},
			{
				id: "benefits",
				label: { en: "Benefits", pt: "Benefícios" },
				hint: {
					en: "Advantages translate into reader-facing outcomes — money saved, time recovered, risk reduced.",
					pt: "As vantagens se traduzem em resultados pro leitor — dinheiro poupado, tempo recuperado, risco reduzido.",
				},
			},
		],
	},
	{
		id: "dos",
		name: { en: "DOS", pt: "DOS" },
		intro: {
			en: "Dream, Obstacle, Solution — common in coaching and info-product copy.",
			pt: "Sonho, Obstáculo, Solução — comum em copy de coaching e info-produtos.",
		},
		useCase: { en: "Storytelling", pt: "Storytelling" },
		whenToUse: {
			en: "Anchor an aspirational dream, name the obstacle, position your solution. Story-arc copy that resonates.",
			pt: "Ancore um sonho aspiracional, nomeie o obstáculo, posicione sua solução. Copy em arco narrativo que ressoa.",
		},
		criteria: [
			{
				id: "dream",
				label: { en: "Dream", pt: "Sonho" },
				hint: {
					en: "Names the reader's aspiration explicitly — what they secretly want.",
					pt: "Nomeia explicitamente a aspiração do leitor — o que secretamente querem.",
				},
			},
			{
				id: "obstacle",
				label: { en: "Obstacle", pt: "Obstáculo" },
				hint: {
					en: "Identifies the specific obstacle stopping them — and validates that it's not their fault.",
					pt: "Identifica o obstáculo específico que os para — e valida que não é culpa deles.",
				},
			},
			{
				id: "solution",
				label: { en: "Solution", pt: "Solução" },
				hint: {
					en: "Positions the product as the obstacle-remover, not the dream-fulfiller.",
					pt: "Posiciona o produto como removedor do obstáculo, não realizador do sonho.",
				},
			},
		],
	},
	{
		id: "pixar",
		name: { en: "Pixar", pt: "Pixar" },
		intro: {
			en: "Once upon a time / Every day / One day / Because of that / Until finally — narrative arc for About / manifesto pages.",
			pt: "Era uma vez / Todo dia / Um dia / Por causa disso / Até que finalmente — arco narrativo pra About / manifesto.",
		},
		useCase: { en: "Narrative copy", pt: "Copy narrativa" },
		whenToUse: {
			en: "Mythic story structure: 'Once upon a time… every day… until one day…'. Perfect for About pages and brand narratives.",
			pt: "Estrutura mítica: 'Era uma vez… todo dia… até que um dia…'. Perfeito pra páginas About e narrativas de marca.",
		},
		criteria: [
			{
				id: "once",
				label: { en: "Setting", pt: "Cenário" },
				hint: {
					en: "Establishes the world before the change — the status quo of the reader's life.",
					pt: "Estabelece o mundo antes da mudança — o status quo da vida do leitor.",
				},
			},
			{
				id: "every_day",
				label: { en: "Routine", pt: "Rotina" },
				hint: {
					en: "Shows the recurring tension — a daily pain that compounds.",
					pt: "Mostra a tensão recorrente — uma dor diária que se acumula.",
				},
			},
			{
				id: "one_day",
				label: { en: "Inciting event", pt: "Evento desencadeador" },
				hint: {
					en: "Marks the moment something changed — discovery, breaking point, or invitation.",
					pt: "Marca o momento em que algo mudou — descoberta, ponto de ruptura ou convite.",
				},
			},
			{
				id: "because",
				label: { en: "Consequence", pt: "Consequência" },
				hint: {
					en: "Connects the inciting event to a chain of consequences the product enabled.",
					pt: "Conecta o evento desencadeador a uma cadeia de consequências que o produto habilitou.",
				},
			},
			{
				id: "until",
				label: { en: "Resolution", pt: "Resolução" },
				hint: {
					en: "Closes the arc with the new normal — life as it is now, post-product.",
					pt: "Fecha o arco com o novo normal — a vida como ela é agora, pós-produto.",
				},
			},
		],
	},
	{
		id: "quest",
		name: { en: "QUEST", pt: "QUEST" },
		intro: {
			en: "Qualify, Understand, Educate, Stimulate, Transition — Michel Fortin's structure for demo / consult pages.",
			pt: "Qualificar, Entender, Educar, Estimular, Transicionar — estrutura do Michel Fortin pra páginas de demo / consult.",
		},
		useCase: { en: "Premium offers", pt: "Ofertas premium" },
		whenToUse: {
			en: "Qualify, Understand, Educate, Stimulate, Transition. Designed for high-trust demo and consult pages.",
			pt: "Qualifica, Entende, Educa, Estimula, Transiciona. Feito pra páginas de demo e consult de alta confiança.",
		},
		criteria: [
			{
				id: "qualify",
				label: { en: "Qualify", pt: "Qualificar" },
				hint: {
					en: "Pre-qualifies the reader — speaks to a specific role/segment so unfit readers self-select out.",
					pt: "Pré-qualifica o leitor — fala com role/segmento específico pra que readers não-fit saiam.",
				},
			},
			{
				id: "understand",
				label: { en: "Understand", pt: "Entender" },
				hint: {
					en: "Demonstrates understanding of the reader's situation — they feel seen.",
					pt: "Demonstra entendimento da situação do leitor — eles se sentem vistos.",
				},
			},
			{
				id: "educate",
				label: { en: "Educate", pt: "Educar" },
				hint: {
					en: "Teaches something new — not a sales pitch, an insight the reader didn't have.",
					pt: "Ensina algo novo — não pitch de venda, um insight que o leitor não tinha.",
				},
			},
			{
				id: "stimulate",
				label: { en: "Stimulate", pt: "Estimular" },
				hint: {
					en: "Creates desire for the outcome the reader couldn't see before — opens a new ambition.",
					pt: "Cria desejo pelo resultado que o leitor não enxergava — abre uma nova ambição.",
				},
			},
			{
				id: "transition",
				label: { en: "Transition", pt: "Transição" },
				hint: {
					en: "Hands the reader to the CTA naturally — feels like the logical next step, not an ask.",
					pt: "Entrega o leitor pra o CTA naturalmente — parece o próximo passo lógico, não um pedido.",
				},
			},
		],
	},
	{
		id: "four_cs",
		name: { en: "4 Cs", pt: "4 Cs" },
		intro: {
			en: "Clear, Concise, Compelling, Credible — Atwan & Aronson's general quality audit for any copy.",
			pt: "Clara, Concisa, Convincente, Crível — audit de qualidade geral do Atwan & Aronson pra qualquer copy.",
		},
		useCase: { en: "Hygiene check", pt: "Checagem de higiene" },
		whenToUse: {
			en: "Clear, Concise, Compelling, Credible. Not a story arc — a quality bar every line of copy should pass.",
			pt: "Claro, Conciso, Convincente, Crível. Não é um arco narrativo — é uma régua de qualidade que toda linha deve passar.",
		},
		criteria: [
			{
				id: "clear",
				label: { en: "Clear", pt: "Clara" },
				hint: {
					en: "Reader knows what the product does within 5 seconds — no jargon, no maze of clauses.",
					pt: "Leitor sabe o que o produto faz em 5 segundos — sem jargão, sem labirinto de cláusulas.",
				},
			},
			{
				id: "concise",
				label: { en: "Concise", pt: "Concisa" },
				hint: {
					en: "Every word earns its spot — short sentences, no filler, no warm-up.",
					pt: "Toda palavra ganha seu lugar — frases curtas, sem filler, sem aquecimento.",
				},
			},
			{
				id: "compelling",
				label: { en: "Compelling", pt: "Convincente" },
				hint: {
					en: "Reader feels something — curiosity, urgency, relief, recognition. Not flat.",
					pt: "O leitor sente algo — curiosidade, urgência, alívio, reconhecimento. Não é flat.",
				},
			},
			{
				id: "credible",
				label: { en: "Credible", pt: "Crível" },
				hint: {
					en: "Claims are anchored — numbers, names, specifics. No 'best in class' without proof.",
					pt: "Claims ancorados — números, nomes, específicos. Sem 'best in class' sem prova.",
				},
			},
		],
	},
];

const BY_ID = new Map(COPY_FRAMEWORKS.map((f) => [f.id, f]));

export function getFramework(id: string): CopyFramework | null {
	return BY_ID.get(id) ?? null;
}

export function getAllFrameworkIds(): string[] {
	return COPY_FRAMEWORKS.map((f) => f.id);
}
