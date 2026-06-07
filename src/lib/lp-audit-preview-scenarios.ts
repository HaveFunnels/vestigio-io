/**
 * Preview scenarios for the mini-audit result page.
 *
 * DEV-ONLY helper: lets us inspect the result/loading screens
 * without spinning up a real lead through the funnel each time.
 *
 * Gated by `process.env.NODE_ENV !== "production"` at the
 * consuming sites. Delete this whole file (and `/audit/preview`)
 * once the design has been validated end-to-end.
 */

import type { LandingPreview } from "../../workers/ingestion/landing-preview";
import type {
	MiniFinding,
	BlurredFinding,
} from "../../workers/ingestion/mini-audit-findings";
import type { MiniImpact } from "../../packages/impact/mini-impact";

const mkImpact = (minBrl: number, maxBrl: number): MiniImpact => ({
	min_brl_cents: minBrl * 100,
	max_brl_cents: maxBrl * 100,
	mid_brl_cents: Math.round(((minBrl + maxBrl) / 2) * 100),
	basis: "estimated",
});

interface PreviewLead {
	id: string;
	status: "draft" | "auditing" | "audit_complete" | "checkout_started" | "converted" | "expired" | "spam";
	currentStep: number;
	domain: string | null;
	organizationName: string | null;
	businessModel: string | null;
	monthlyRevenue?: number | null;
	primaryConcern?: string | null;
	currentOptimizationMethod?: string | null;
	whyNow?: string | null;
	emailMasked: string | null;
	createdAt: string;
	result: {
		id: string;
		preview: LandingPreview;
		visibleFindings: MiniFinding[];
		blurredFindings: BlurredFinding[];
		durationMs: number;
		computedAt: string;
	} | null;
}

export interface PreviewScenario {
	id: string;
	label: string;
	description: string;
	lead: PreviewLead;
}

const nowIso = () => new Date().toISOString();

const mkPreview = (host: string, title: string): LandingPreview => ({
	url: `https://${host}`,
	host,
	final_url: `https://${host}/`,
	title,
	description: `${title} — landing preview.`,
	og_image_url: null,
	favicon_url: `https://www.google.com/s2/favicons?sz=64&domain=${host}`,
	h1: title,
	http_status: 200,
	response_time_ms: 480,
	content_length: 124_000,
	captured_at: nowIso(),
});

const mkFinding = (
	id: string,
	severity: MiniFinding["severity"],
	category: MiniFinding["category"],
	title: string,
	body: string,
	impact_hint: string,
	suggestion: string,
	impact?: MiniFinding["impact"],
): MiniFinding => ({
	id,
	severity,
	category,
	title,
	body,
	impact_hint,
	suggestion,
	impact: impact ?? null,
	evidence_refs: ["DOM scrape", "HTTP headers"],
});

const mkBlurred = (
	id: string,
	category: MiniFinding["category"],
	teaser_title: string,
): BlurredFinding => ({ id, category, teaser_title });

const COMMON_BLURRED: BlurredFinding[] = [
	mkBlurred("b1", "checkout", "Checkout tem 3 etapas no celular"),
	mkBlurred("b2", "cta", "Botão principal se confunde com o fundo"),
	mkBlurred("b3", "trust", "Falta selo de segurança no pagamento"),
	mkBlurred("b4", "friction", "Cadastro pede telefone obrigatoriamente"),
	mkBlurred("b5", "performance", "Site demora pra carregar no celular"),
	mkBlurred("b6", "structure", "Títulos da página competem entre si"),
	mkBlurred("b7", "mobile", "Botões pequenos demais pra clicar no celular"),
	mkBlurred("b8", "policy", "Política de privacidade está desatualizada"),
	mkBlurred("b9", "cta", "Texto do botão deixa o cliente em dúvida"),
	mkBlurred("b10", "trust", "Depoimentos sem foto nem nome real"),
];

// ──────────────────────────────────────────────
// Scenario 1: SaaS B2B PT-BR
// ──────────────────────────────────────────────
const SAAS_BR: PreviewScenario = {
	id: "saas-br",
	label: "SaaS B2B — PT-BR",
	description: "Plano Max, locale pt-BR, R$ 50k/mês, foco em trial-to-paid",
	lead: {
		id: "preview-saas-br",
		status: "audit_complete",
		currentStep: 12,
		domain: "havefunnels.com",
		organizationName: "HaveFunnels",
		businessModel: "saas",
		monthlyRevenue: 50_000,
		primaryConcern: "low_conversion",
		currentOptimizationMethod: "team_judgment",
		whyNow: "chronic_pain",
		emailMasked: "h***@havefunnels.com",
		createdAt: nowIso(),
		result: {
			id: "preview-result-saas-br",
			preview: mkPreview("havefunnels.com", "HaveFunnels — Funis de Vendas Automatizados"),
			visibleFindings: [
				mkFinding(
					"v1",
					"critical",
					"trust",
					"Sua página de preços não tem depoimentos reais",
					"A página /preços mostra 3 planos mas não tem nenhum depoimento de cliente com foto, nome e link pro perfil dele. Quem compra SaaS B2B confere quem já comprou antes de assinar.",
					"Você perde cerca de 18% dos trials por aqui",
					"Coloca 3 depoimentos com foto + nome completo + cargo + link do LinkedIn no terço de baixo da página de preços.",
					mkImpact(7_500, 11_200),
				),
				mkFinding(
					"v2",
					"high",
					"cta",
					"O botão do trial não diz que é grátis sem cartão",
					"O botão fala 'Começar trial grátis' mas em nenhum lugar próximo diz 'Sem precisar de cartão'. O cliente para pra tentar adivinhar e desiste.",
					"Você perde cerca de 12% dos cliques",
					"Coloca uma linha embaixo do botão: 'Sem cartão · Cancele quando quiser'.",
					mkImpact(4_200, 6_800),
				),
				mkFinding(
					"v3",
					"high",
					"checkout",
					"O pagamento abre numa janela nova e perde gente no caminho",
					"Quando o cliente vai pagar o upgrade, o site abre uma nova aba no checkout.stripe.com. Cada saída do seu domínio derruba a conversão em torno de 9%.",
					"Você perde cerca de 9% dos pagamentos por aqui",
					"Embutir o pagamento direto na sua página /billing, sem redirecionar.",
					mkImpact(5_400, 8_100),
				),
				mkFinding(
					"v4",
					"medium",
					"friction",
					"O cadastro pede o nome da empresa obrigatoriamente",
					"O campo 'Nome da empresa' é obrigatório pra criar conta. Tornar esse campo opcional aumenta finalização de cadastro em cerca de 7%.",
					"Você perde cerca de 7% dos cadastros",
					"Deixar o campo 'Empresa' opcional. Pode coletar depois quando o usuário já tá usando o produto.",
					mkImpact(2_100, 3_400),
				),
				mkFinding(
					"v5",
					"positive",
					"performance",
					"Seu site carrega rápido no celular",
					"Sua página principal carrega em menos de 2 segundos no 4G. Isso tá acima da média entre SaaS B2B brasileiros.",
					"Mantém vantagem competitiva",
					null as any,
				),
			],
			blurredFindings: COMMON_BLURRED,
			durationMs: 12_400,
			computedAt: nowIso(),
		},
	},
};

// ──────────────────────────────────────────────
// Scenario 2: E-commerce BR (D2C)
// ──────────────────────────────────────────────
const ECOM_BR: PreviewScenario = {
	id: "ecom-br",
	label: "E-commerce D2C — PT-BR",
	description: "Loja BR, ~R$ 180k/mês, AOV R$ 240, foco em checkout",
	lead: {
		id: "preview-ecom-br",
		status: "audit_complete",
		currentStep: 12,
		domain: "marcadebeleza.com.br",
		organizationName: "Marca de Beleza",
		businessModel: "ecommerce",
		monthlyRevenue: 180_000,
		primaryConcern: "unknown_leak",
		currentOptimizationMethod: "agency_consultant",
		whyNow: "recent_drop",
		emailMasked: "m***@marcadebeleza.com.br",
		createdAt: nowIso(),
		result: {
			id: "preview-result-ecom-br",
			preview: mkPreview("marcadebeleza.com.br", "Marca de Beleza — Skincare Premium"),
			visibleFindings: [
				mkFinding(
					"v1",
					"critical",
					"checkout",
					"Cliente precisa criar conta antes de pagar",
					"Sua loja obriga o cliente a fazer cadastro antes de ir pra tela de pagamento. Em lojas D2C brasileiras, isso aumenta a desistência em mais ou menos 26%.",
					"Você perde cerca de 26% do checkout por aqui",
					"Adicionar a opção 'Continuar como visitante' como primeira escolha no checkout.",
					mkImpact(22_000, 31_000),
				),
				mkFinding(
					"v2",
					"high",
					"trust",
					"O prazo de entrega só aparece no final, depois do carrinho",
					"O cliente só vê em quantos dias chega depois de colocar o produto no carrinho e abrir o checkout. Quem compra D2C decide em segundos olhando o prazo.",
					"Você perde cerca de 14% dos cliques no 'comprar'",
					"Mostrar o prazo de entrega estimado por CEP já na página do produto, do lado do botão 'Comprar agora'.",
					mkImpact(8_800, 13_200),
				),
				mkFinding(
					"v3",
					"high",
					"cta",
					"'Comprar agora' e 'Adicionar ao carrinho' têm o mesmo destaque",
					"A página do produto tem dois botões com o mesmo peso visual. O cliente fica travado escolhendo e acaba não fazendo nem um nem outro.",
					"Você perde cerca de 11% na conversão da página do produto",
					"Deixar 'Comprar agora' como botão principal (cor cheia) e 'Adicionar ao carrinho' com fundo transparente.",
					mkImpact(6_400, 9_900),
				),
				mkFinding(
					"v4",
					"medium",
					"mobile",
					"Não dá pra dar zoom nas fotos do produto no celular",
					"Quem entra pelo celular não consegue dar zoom nas fotos do produto com o dedo. Pra beleza/skincare, o cliente quer ver o produto de perto antes de comprar.",
					"Você perde cerca de 6% das compras pelo celular",
					"Trocar o visualizador de fotos por um que aceite zoom com o dedo (tipo PhotoSwipe).",
					mkImpact(3_800, 5_600),
				),
				mkFinding(
					"v5",
					"medium",
					"trust",
					"As avaliações de cliente só têm estrelas e texto",
					"Suas reviews mostram só nota e texto. Quem compra cosmético olha foto real de antes e depois antes de decidir.",
					"Você perde cerca de 5% das compras",
					"Liberar envio de foto nas avaliações (Loox, Yotpo ou similar) e mostrar a galeria em destaque na página.",
					mkImpact(2_900, 4_700),
				),
			],
			blurredFindings: COMMON_BLURRED,
			durationMs: 11_800,
			computedAt: nowIso(),
		},
	},
};

// ──────────────────────────────────────────────
// Scenario 3: Course / Infoprodutor BR
// ──────────────────────────────────────────────
const COURSE_BR: PreviewScenario = {
	id: "course-br",
	label: "Curso / Infoproduto — PT-BR",
	description: "Lançamento, R$ 25k/mês, foco em conversão de página de vendas",
	lead: {
		id: "preview-course-br",
		status: "audit_complete",
		currentStep: 12,
		domain: "mentoria-vendas.com.br",
		organizationName: "Mentoria de Vendas",
		businessModel: "lead_gen",
		monthlyRevenue: 25_000,
		primaryConcern: "low_conversion",
		currentOptimizationMethod: "nothing",
		whyNow: "prove_roi",
		emailMasked: "p***@mentoria-vendas.com.br",
		createdAt: nowIso(),
		result: {
			id: "preview-result-course-br",
			preview: mkPreview("mentoria-vendas.com.br", "Mentoria de Vendas — Vagas Abertas"),
			visibleFindings: [
				mkFinding(
					"v1",
					"critical",
					"trust",
					"Sua página de vendas não mostra prova de aluno",
					"Sua landing não tem depoimentos de aluno com foto, nome e cargo, nem mostra quantos já se formaram. Em infoproduto, o cliente compra confiando em prova de gente real.",
					"Você perde cerca de 32% das vendas por aqui",
					"Coloca um bloco com 5+ depoimentos (foto, nome, cargo, link público) + 1 print de resultado real de aluno.",
					mkImpact(2_400, 3_800),
				),
				mkFinding(
					"v2",
					"high",
					"cta",
					"O botão principal manda pro WhatsApp em vez do checkout",
					"O botão 'Quero saber mais' leva pra uma conversa manual no WhatsApp. Quem já decidiu quer comprar na hora, não esperar atendente.",
					"Você perde cerca de 22% das vendas por aqui",
					"Trocar o botão principal pra 'Garantir minha vaga' levando direto pro checkout.",
					mkImpact(1_900, 2_900),
				),
				mkFinding(
					"v3",
					"high",
					"structure",
					"A primeira parte da página não diz o que você vende",
					"A primeira tela só fala 'Mentoria de Vendas' — não diz o resultado, o preço, o prazo nem o bônus. O cliente não sabe o que tá comprando antes de rolar a tela.",
					"Você perde cerca de 18% dos cliques nesse trecho",
					"Reescrever a primeira tela: o resultado em 1 frase + preço/prazo + 1 botão + 1 prova rápida.",
					mkImpact(1_500, 2_300),
				),
				mkFinding(
					"v4",
					"medium",
					"friction",
					"Não tem garantia de devolução visível",
					"Em nenhum lugar da página aparece 'Garantia de X dias ou seu dinheiro de volta'. Em infoproduto a compra é por impulso e garantia tira o medo de errar.",
					"Você perde cerca de 9% das vendas",
					"Adicionar um bloco 'Garantia de 7 dias' com selo perto do botão de compra e no rodapé do checkout.",
					mkImpact(800, 1_200),
				),
				mkFinding(
					"v5",
					"medium",
					"cta",
					"Não tem prazo nem vaga limitada na oferta",
					"Sua página não mostra contador de vagas, prazo da turma ou data de fechamento. Lançamento sem escassez real vende cerca de 12% menos.",
					"Você perde cerca de 12% das vendas",
					"Adicionar 'Próxima turma fecha em X dias' (real) com contador visual perto do botão de compra.",
					mkImpact(1_100, 1_700),
				),
			],
			blurredFindings: COMMON_BLURRED,
			durationMs: 11_200,
			computedAt: nowIso(),
		},
	},
};

// ──────────────────────────────────────────────
// Scenario 4: Loading / auditing in progress
// ──────────────────────────────────────────────
const LOADING: PreviewScenario = {
	id: "loading",
	label: "Loading (auditing)",
	description: "AuditingState — antes do botão 'Ver resultados' aparecer",
	lead: {
		id: "preview-loading",
		status: "auditing",
		currentStep: 11,
		domain: "havefunnels.com",
		organizationName: "HaveFunnels",
		businessModel: "saas",
		monthlyRevenue: 50_000,
		primaryConcern: "low_conversion",
		currentOptimizationMethod: "team_judgment",
		whyNow: "chronic_pain",
		emailMasked: "h***@havefunnels.com",
		createdAt: nowIso(),
		result: null,
	},
};

// ──────────────────────────────────────────────
// Scenario 5: Loading-complete (ready to click 'Ver resultados')
// ──────────────────────────────────────────────
const LOADING_DONE: PreviewScenario = {
	id: "loading-done",
	label: "Loading — ready to view",
	description: "AuditingState com botão 'Ver resultados' visível",
	lead: { ...SAAS_BR.lead, id: "preview-loading-done" },
};

// ──────────────────────────────────────────────
// Scenario 6: Services BR (clínica odontológica)
// Wave-22.7 — flagship case for the services-vertical extension.
// Concrete, recognizable: dentista de bairro, R$60k/mês, foco em
// captação via WhatsApp + Google Business. Findings exercícios os
// 7 detectors services-específicos.
// ──────────────────────────────────────────────
const SERVICES_BR: PreviewScenario = {
	id: "services-br",
	label: "Serviços — Clínica odontológica",
	description: "Clínica de bairro, R$ 60k/mês, foco em captação via WhatsApp + Google",
	lead: {
		id: "preview-services-br",
		status: "audit_complete",
		currentStep: 12,
		domain: "sorrisofelizodonto.com.br",
		organizationName: "Sorriso Feliz Odontologia",
		businessModel: "services",
		monthlyRevenue: 60_000,
		primaryConcern: "low_conversion",
		currentOptimizationMethod: "nothing",
		whyNow: "scaling_paid_traffic",
		emailMasked: "c***@sorrisofelizodonto.com.br",
		createdAt: nowIso(),
		result: {
			id: "preview-result-services-br",
			preview: mkPreview(
				"sorrisofelizodonto.com.br",
				"Sorriso Feliz Odontologia — Atendimento Familiar",
			),
			visibleFindings: [
				mkFinding(
					"v1",
					"critical",
					"cta",
					"Sem WhatsApp na página — você está deixando dinheiro na mesa",
					"No Brasil, quem procura dentista abre o WhatsApp antes de qualquer formulário. Sua página não tem botão de WhatsApp visível em nenhum lugar. Cada paciente que poderia ter chamado vai pro concorrente que tem.",
					"30-50% dos contatos viram concorrente",
					"Coloca um botão flutuante de WhatsApp visível em todas as páginas (canto inferior direito, verde, com ícone). Inclua o número também no topo do site e na seção 'Fale conosco'.",
					mkImpact(4_800, 9_600),
				),
				mkFinding(
					"v2",
					"high",
					"trust",
					"Falta o registro de saúde (CRO, CRM, CRP, CREFITO etc.) na página",
					"Quem procura clínica odontológica checa antes se você tem CRO em dia. Se o número do conselho não aparece no rodapé nem na página 'Quem somos', o paciente desconfia e vai pra concorrência que mostra.",
					"Falta de registro reduz confiança em 40%+",
					"Adicione o CRO no rodapé do site (ex: 'CRO/SP 12345'). Se você tem equipe, mostre o CRO de cada dentista na página dele.",
					mkImpact(3_600, 7_200),
				),
				mkFinding(
					"v3",
					"high",
					"trust",
					"Sem link pro seu Google Business Profile",
					"Paciente que procura dentista quase sempre passa pelo Google Maps antes de te chamar (pra ver foto da fachada, horário, avaliação). Seu site não linka pro seu perfil no Google.",
					"Tráfego perdido pro concorrente nas reviews",
					"Crie ou reivindique seu perfil em business.google.com e adicione o link no rodapé + página 'Onde estamos'. Mostre também a nota geral ('4.8 ⭐ no Google, 87 avaliações') na primeira dobra.",
					mkImpact(2_400, 4_800),
				),
				mkFinding(
					"v4",
					"medium",
					"trust",
					"Falta informação básica que todo paciente quer ver",
					"Quem chega no site procura logo o básico: endereço físico, horário de atendimento, área de atuação. Se não aparece em até 2 cliques, o paciente assume amador e fecha a aba.",
					"Paciente sem essas infos abandona em 6-8 segundos",
					"Crie uma seção 'Onde estamos' visível no menu principal e no footer, com: endereço completo, horário de atendimento (incluindo finais de semana se for o caso), telefone e WhatsApp. Use um mapa do Google embutido.",
					mkImpact(1_800, 3_600),
				),
				mkFinding(
					"v5",
					"medium",
					"trust",
					"Seus depoimentos não dão pra checar — soa fake",
					"Você tem uma seção de depoimentos, mas eles não trazem nome completo + cidade ou link pra avaliação real. Paciente em pesquisa desconta depoimento sem prova como 'invenção do site'.",
					"Depoimento sem prova quase não move a agulha",
					"Pra cada depoimento, inclua: nome real + foto (com autorização), cidade-estado, e link pro perfil dele ou avaliação no Google. Mostre também a nota geral do Google em destaque.",
					mkImpact(1_200, 2_400),
				),
			],
			blurredFindings: COMMON_BLURRED,
			durationMs: 13_800,
			computedAt: nowIso(),
		},
	},
};

// ──────────────────────────────────────────────
// Scenario 7: Mobile-app conversion BR
// Wave-22.7 — flagship case for the app-conversion vertical. An
// app de delivery / utilidade / consumer focado em install via
// site. Exercises the 6 mobile detectors with plausible findings.
// ──────────────────────────────────────────────
const MOBILE_BR: PreviewScenario = {
	id: "mobile-br",
	label: "App mobile — Utilidade",
	description: "App de utilidade / consumer com landing focada em install",
	lead: {
		id: "preview-mobile-br",
		status: "audit_complete",
		currentStep: 12,
		domain: "rotaesperta.app",
		organizationName: "Rota Esperta",
		businessModel: "app_conversion",
		monthlyRevenue: 40_000,
		primaryConcern: "low_conversion",
		currentOptimizationMethod: "analytics_tools",
		whyNow: "scaling_paid_traffic",
		emailMasked: "c***@rotaesperta.app",
		createdAt: nowIso(),
		result: {
			id: "preview-result-mobile-br",
			preview: mkPreview(
				"rotaesperta.app",
				"Rota Esperta — O melhor caminho até onde você quer chegar",
			),
			visibleFindings: [
				mkFinding(
					"v1",
					"critical",
					"cta",
					"Sem botão de download pra App Store (iPhone)",
					"Visitante que chega no site quer baixar o app — não ler mais sobre ele. Sua página não mostra o botão oficial da App Store em nenhum lugar. Cada visitante que veio com intenção de instalar e não encontrou o botão volta pro Google e pode acabar baixando um concorrente.",
					"30-50% dos visitantes com intenção saem sem instalar",
					"Coloque o badge oficial da App Store na primeira dobra do site, com link direto pra sua página na loja. Use a imagem oficial (developer.apple.com/app-store/marketing/guidelines/) — o cliente reconhece em meio segundo.",
					mkImpact(3_200, 6_400),
				),
				mkFinding(
					"v2",
					"high",
					"cta",
					"Falta a barra do iPhone que abre o app direto do site",
					"Quando alguém abre seu site no Safari do iPhone, existe uma faixa que aparece no topo dizendo 'Abrir no app' ou 'Baixar na App Store'. Sem isso, o usuário iOS precisa sair do navegador, abrir a App Store e procurar pelo nome — é quando você perde a maior parte deles.",
					"Usuário iOS sem essa faixa raramente instala depois",
					"Adicione a meta tag <meta name=\"apple-itunes-app\" content=\"app-id=SEU_APP_ID\"> no <head> de todas as páginas. Coloque o ID do seu app na App Store. A faixa aparece automaticamente no Safari — sem código adicional, sem custo de banda.",
					mkImpact(2_400, 4_800),
				),
				mkFinding(
					"v3",
					"medium",
					"trust",
					"Você não mostra a nota do seu app na loja",
					"Quem está pensando em baixar um app vai checar a nota na loja antes — todo mundo faz isso. Se você tem 4.5+ estrelas e milhares de avaliações, é a sua maior carta de vendas e ela não aparece no site.",
					"Nota visível aumenta clique pro botão em 15-25%",
					"Coloque na primeira dobra: nota geral ('4.7 ⭐ na App Store · 4.8 ⭐ na Play Store · 12 mil avaliações'). Pode usar widget oficial ou só renderizar como texto + ícone.",
					mkImpact(1_800, 3_600),
				),
				mkFinding(
					"v4",
					"medium",
					"structure",
					"Sem prévia visual de como o app funciona",
					"Visitante que está decidindo se baixa o app quer ver as telas antes. Sua landing não mostra screenshots do app. Quem visita só com texto não consegue imaginar o produto e desiste.",
					"Sem prévia visual, install cai 25-40%",
					"Adicione 3 a 5 screenshots da tela principal do app na primeira dobra, com legenda curta em cada uma. Use mockup de iPhone/Android pra ficar profissional.",
					mkImpact(1_500, 3_000),
				),
				mkFinding(
					"v5",
					"medium",
					"trust",
					"Você pede permissões sem explicar o porquê — assusta",
					"Seu site menciona que o app precisa de permissões (localização, notificações) mas não explica pra que cada uma serve. Usuário lê só 'precisa acessar sua localização' e pensa 'vão me espionar'.",
					"Permissão sem contexto reduz install em 15-20%",
					"Pra cada permissão que você pede, escreva 1 frase que diga o que ela libera no app. 'Localização: pra te mostrar opções perto de você. Notificação: pra avisar quando seu pedido sair pra entrega.'",
					mkImpact(900, 1_800),
				),
			],
			blurredFindings: COMMON_BLURRED,
			durationMs: 11_200,
			computedAt: nowIso(),
		},
	},
};

// ──────────────────────────────────────────────
// Scenario 8: Enterprise B2B fintech BR
// Wave-22.7 — flagship case for the enterprise vertical. Mid-market
// BR fintech, ACV around R$300k, sales cycle of 4-6 months. Findings
// surface procurement-stage friction (compliance, case studies,
// security review). Copy is technical — audience is CTO / CISO /
// Head of Growth.
// ──────────────────────────────────────────────
const ENTERPRISE_BR: PreviewScenario = {
	id: "enterprise-br",
	label: "Enterprise B2B — Fintech",
	description: "Mid-market fintech BR, ACV R$300k, sales cycle 4-6 meses",
	lead: {
		id: "preview-enterprise-br",
		status: "audit_complete",
		currentStep: 12,
		domain: "paragonpay.com.br",
		organizationName: "ParagonPay",
		businessModel: "enterprise",
		monthlyRevenue: 1_500_000,
		primaryConcern: "prioritization",
		currentOptimizationMethod: "agency_consultant",
		whyNow: "prove_roi",
		emailMasked: "g***@paragonpay.com.br",
		createdAt: nowIso(),
		result: {
			id: "preview-result-enterprise-br",
			preview: mkPreview(
				"paragonpay.com.br",
				"ParagonPay — Payment infrastructure for B2B platforms",
			),
			visibleFindings: [
				mkFinding(
					"v1",
					"critical",
					"trust",
					"Missing compliance certifications expected at security review",
					"Enterprise procurement runs a security questionnaire before any contract closes. Detected 0 of the 5 expected attestations surfaced on the site (SOC 2, ISO 27001, LGPD, PCI DSS — required for fintech, GDPR). Without these visible on the trust/security page or footer, the deal stalls in security review for weeks while sales engineering scrambles to produce evidence.",
					"Compliance gap blocks ~30% of mid-market deals at security review",
					"Surface the certifications on a dedicated /security or /trust page linked from header + footer. List the attestation, audit firm, date, and an inline link to the SOC 2 report request flow. For pre-SOC 2 startups: state the timeline + the controls framework you operate under.",
					mkImpact(120_000, 285_000),
				),
				mkFinding(
					"v2",
					"high",
					"trust",
					"Case studies present but unquantified — fails the CFO buy-in test",
					"Case studies / customer stories detected on the site, but no quantified outcomes (% revenue lift, time saved, $ recovered, NPS delta, etc.). Enterprise champions need numbers to take the business case to the buying committee.",
					"Champion can't sell upward without metrics — 40% of deals stall here",
					"For every case study, lead with the metric: 'reduced fraud losses by 38% in 90 days' / 'cut chargebacks from 1.8% to 0.4%' / 'increased trial-to-paid by 22%'. Three quantified results per case beats five qualitative ones.",
					mkImpact(80_000, 192_000),
				),
				mkFinding(
					"v3",
					"high",
					"cta",
					"Demo CTA missing or buried — primary conversion path broken",
					"Enterprise sites convert through one mechanism: the demo request form. No demo CTA was surfaced in the first scroll. Visitors hitting the page from outbound, paid, or LinkedIn don't have an obvious next step.",
					"Buried demo CTA drops pipeline by 30-40%",
					"Place the 'Book a demo' / 'Talk to sales' CTA as the primary above-the-fold action in the hero — distinct visual weight from secondary CTAs. Use Chili Piper / Calendly inline so the buyer books in 2 clicks.",
					mkImpact(60_000, 144_000),
				),
				mkFinding(
					"v4",
					"medium",
					"structure",
					"Zero pricing transparency — buyer leaves before booking the call",
					"No price ranges, starting-at anchors, or tier comparisons detected. 'Contact sales for pricing' is the only path. Modern enterprise buyers research before they engage — if your competitor publishes 'starting at $50k ACV' and you publish nothing, your discovery call rate drops.",
					"Hidden pricing cuts pipeline qualification by 25%+",
					"Publish at minimum a 'starting at' price for each tier — full pricing fine to gate behind 'contact sales', but the anchor matters. Counter-example: Stripe, Snowflake, Datadog all publish starting prices and still close enterprise contracts.",
					mkImpact(30_000, 72_000),
				),
				mkFinding(
					"v5",
					"medium",
					"trust",
					"No /security or /trust page reachable from main nav",
					"Enterprise procurement opens /security or /trust before they read a feature page. No such page reachable from main nav or footer. A published security posture is what shortens the security review from 4 weeks to 4 days.",
					"Missing trust page extends procurement by 2-4 weeks",
					"Build a /security page covering: SOC 2 / ISO scope, data classification + encryption posture, multi-region availability, data residency, incident-response SLA, sub-processor list. Link from footer + demo thank-you page.",
					mkImpact(45_000, 108_000),
				),
			],
			blurredFindings: COMMON_BLURRED,
			durationMs: 14_400,
			computedAt: nowIso(),
		},
	},
};

// ──────────────────────────────────────────────
// Scenario 9: Expired
// ──────────────────────────────────────────────
const EXPIRED: PreviewScenario = {
	id: "expired",
	label: "Expired result",
	description: "ExpiredState — usuário voltou depois de 24h",
	lead: { ...SAAS_BR.lead, id: "preview-expired", status: "expired" },
};

export const PREVIEW_SCENARIOS: Record<string, PreviewScenario> = {
	[SAAS_BR.id]: SAAS_BR,
	[ECOM_BR.id]: ECOM_BR,
	[COURSE_BR.id]: COURSE_BR,
	[SERVICES_BR.id]: SERVICES_BR,
	[MOBILE_BR.id]: MOBILE_BR,
	[ENTERPRISE_BR.id]: ENTERPRISE_BR,
	[LOADING.id]: LOADING,
	[LOADING_DONE.id]: LOADING_DONE,
	[EXPIRED.id]: EXPIRED,
};

export const PREVIEW_SCENARIO_LIST: PreviewScenario[] = [
	SAAS_BR,
	ECOM_BR,
	COURSE_BR,
	SERVICES_BR,
	MOBILE_BR,
	ENTERPRISE_BR,
	LOADING,
	LOADING_DONE,
	EXPIRED,
];
