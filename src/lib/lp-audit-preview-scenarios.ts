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
// Scenario 6: Expired
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
	[LOADING.id]: LOADING,
	[LOADING_DONE.id]: LOADING_DONE,
	[EXPIRED.id]: EXPIRED,
};

export const PREVIEW_SCENARIO_LIST: PreviewScenario[] = [
	SAAS_BR,
	ECOM_BR,
	COURSE_BR,
	LOADING,
	LOADING_DONE,
	EXPIRED,
];
