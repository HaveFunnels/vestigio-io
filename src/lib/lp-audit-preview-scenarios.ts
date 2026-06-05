/**
 * Preview scenarios for the mini-audit result page.
 *
 * DEV-ONLY helper: lets us inspect the result/loading screens
 * without spinning up a real lead through the funnel each time.
 *
 * Gated by `process.env.NODE_ENV !== "production"` at the
 * consuming sites. Delete this whole file (and `/lp/audit/preview`)
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
	mkBlurred("b1", "checkout", "Abandono de checkout em mobile (3 etapas)"),
	mkBlurred("b2", "cta", "CTA acima da dobra com baixo contraste"),
	mkBlurred("b3", "trust", "Selos de segurança ausentes na finalização"),
	mkBlurred("b4", "friction", "Campo de telefone obrigatório no cadastro"),
	mkBlurred("b5", "performance", "LCP > 2.5s em conexão 4G"),
	mkBlurred("b6", "structure", "Hierarquia de H1/H2 conflitante"),
	mkBlurred("b7", "mobile", "Tap-target < 44px em CTA principal"),
	mkBlurred("b8", "policy", "Política de privacidade sem data de revisão"),
	mkBlurred("b9", "cta", "Microcopy do CTA gera fricção"),
	mkBlurred("b10", "trust", "Depoimentos sem prova fotográfica ou link"),
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
					"Página de preços sem prova social verificável",
					"A página /pricing lista 3 planos mas não exibe depoimentos com link para perfis reais (LinkedIn/Twitter/Instagram). Buyers de SaaS B2B típicos checam autoria antes de assinar.",
					"~18% drop em trial signup",
					"Adicionar 3 depoimentos com foto + nome completo + cargo + link verificável no terço inferior da página de preços.",
					mkImpact(7_500, 11_200),
				),
				mkFinding(
					"v2",
					"high",
					"cta",
					"CTA do trial não menciona ausência de cartão",
					"O botão diz 'Começar trial grátis' mas não tem subline 'Sem cartão de crédito'. Buyers SaaS de ticket médio param no botão para checar essa fricção.",
					"~12% drop em CTR do CTA",
					"Adicionar subline 'Sem cartão · Cancele quando quiser' abaixo do botão principal.",
					mkImpact(4_200, 6_800),
				),
				mkFinding(
					"v3",
					"high",
					"checkout",
					"Fluxo de upgrade força saída para Stripe Checkout",
					"O upgrade do trial abre uma nova aba para checkout.stripe.com. Cada redirect adicional perde ~9% no trial→paid conforme nosso baseline.",
					"~9% perda no upgrade",
					"Embedar Stripe Elements no /billing para manter o usuário no domínio.",
					mkImpact(5_400, 8_100),
				),
				mkFinding(
					"v4",
					"medium",
					"friction",
					"Formulário de signup pede campo de empresa obrigatório",
					"O campo 'Nome da empresa' está marcado como required no signup. Trial-led B2B benchmarks mostram que tornar isso optional aumenta signups em ~7%.",
					"~7% drop em signup completion",
					"Tornar o campo 'Empresa' opcional e coletar depois no onboarding.",
					mkImpact(2_100, 3_400),
				),
				mkFinding(
					"v5",
					"positive",
					"performance",
					"LCP abaixo de 2s em 4G",
					"A landing carrega o hero em 1.6s mediano (campo Lighthouse). Está acima da maioria do baseline SaaS B2B PT-BR.",
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
					"Checkout exige cadastro antes do pagamento",
					"A loja força criação de conta antes de ver a tela de pagamento. Benchmark D2C BR mostra ~26% de abandono adicional vs guest checkout.",
					"~26% perda no checkout",
					"Adicionar opção 'Continuar como visitante' como primeira ação no checkout.",
					mkImpact(22_000, 31_000),
				),
				mkFinding(
					"v2",
					"high",
					"trust",
					"Prazo de entrega não aparece antes do checkout",
					"O cliente só vê o prazo de entrega depois de adicionar produto e ir ao checkout. Buyers D2C decidem em segundos baseado em entrega.",
					"~14% drop em add-to-cart",
					"Mostrar prazo de entrega estimado por CEP na PDP (próximo ao 'Comprar agora').",
					mkImpact(8_800, 13_200),
				),
				mkFinding(
					"v3",
					"high",
					"cta",
					"Botão 'Comprar agora' compete com 'Adicionar ao carrinho'",
					"PDP tem dois CTAs primários sem hierarquia visual. Buyers travados escolhem nenhum dos dois.",
					"~11% drop em conversão de PDP",
					"Tornar 'Comprar agora' o CTA principal e 'Adicionar ao carrinho' ghost button.",
					mkImpact(6_400, 9_900),
				),
				mkFinding(
					"v4",
					"medium",
					"mobile",
					"Imagens do PDP não fazem zoom no mobile",
					"Não há gesture de pinch-to-zoom nas imagens da PDP mobile. Categoria beleza vive de close-up de produto.",
					"~6% drop em add-to-cart mobile",
					"Adicionar viewer com zoom touch-friendly (PhotoSwipe ou similar).",
					mkImpact(3_800, 5_600),
				),
				mkFinding(
					"v5",
					"medium",
					"trust",
					"Avaliações sem fotos enviadas por cliente",
					"As reviews no PDP são apenas estrelas + texto. Buyers de skincare confiam em fotos antes/depois reais.",
					"~5% drop em conversão",
					"Habilitar upload de fotos nas reviews (loox / yotpo) e exibir grid em destaque.",
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
					"Ausência total de prova social verificável",
					"A página de vendas não exibe depoimentos com nome real, foto + cargo, nem números de alunos formados. Categoria info-produto vive de prova.",
					"~32% drop em conversão",
					"Adicionar bloco com 5+ depoimentos: foto, nome, cargo, link público + 1 case com print de resultado.",
					mkImpact(2_400, 3_800),
				),
				mkFinding(
					"v2",
					"high",
					"cta",
					"CTA 'Quero saber mais' não fecha venda",
					"O CTA principal direciona para WhatsApp manual. Buyers em modo decisão querem comprar direto.",
					"~22% perda no funnel",
					"Trocar o CTA principal para 'Garantir minha vaga' levando direto ao checkout.",
					mkImpact(1_900, 2_900),
				),
				mkFinding(
					"v3",
					"high",
					"structure",
					"Página de vendas sem oferta clara acima da dobra",
					"O hero diz 'Mentoria de Vendas' mas não menciona transformação, prazo, preço ou bônus na dobra. Buyer não sabe o que está comprando até rolar.",
					"~18% drop em CTR do CTA acima da dobra",
					"Reescrever hero: outcome em 1 frase + preço/prazo + 1 CTA + 1 prova.",
					mkImpact(1_500, 2_300),
				),
				mkFinding(
					"v4",
					"medium",
					"friction",
					"Sem garantia de devolução visível",
					"Não há menção de garantia de 7/15/30 dias. Categoria info-produto compra é por impulso e garantia reduz risco percebido.",
					"~9% drop em conversão",
					"Adicionar bloco 'Garantia incondicional de 7 dias' com selo no rodapé do checkout.",
					mkImpact(800, 1_200),
				),
				mkFinding(
					"v5",
					"medium",
					"cta",
					"Ausência de urgência genuína",
					"Sem contagem regressiva de vagas, prazo, ou turma. Lançamento sem escassez performa ~12% pior.",
					"~12% drop em conversão",
					"Adicionar 'Próxima turma fecha em X dias' (real) com counter visual.",
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
