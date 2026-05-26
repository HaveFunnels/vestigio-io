import type { StrategyPlan } from "./types";

/*
 * Monthly Strategy Plan — havefunnels.com / June 2026 mock
 *
 * The reference plan used during Step 3 (visual mock checkpoint). The
 * data is realistic — drawn from havefunnels' actual surface, the
 * SaaS B2B pt-BR locale, and projection figures consistent with what
 * the real engine would emit. Step 4 will replace this with a live
 * fetcher; the shape contract lives in ./types.
 */

export const MOCK_PLAN_HAVEFUNNELS_2026_06: StrategyPlan = {
	id: "mock_plan_havefunnels_2026_06",
	environmentId: "cmot57x2i006cbidwuwaw5z3s",
	envDomain: "havefunnels.com",
	month: "2026-06",
	locale: "pt-BR",
	generatedAt: new Date("2026-06-01T00:31:00Z"),
	lastRegenerated: new Date("2026-06-12T14:22:00Z"),
	status: "ready",
	cycleNumber: 8,

	heroMetrics: {
		retainedMid: 8523,
		capturedMid: 3214,
		criticalCount: 12,
		inProgressCount: 6,
		retainedDeltaMoM: 0.12,
		capturedDeltaMoM: 0.08,
		criticalDeltaMoM: -0.20,
		inProgressDeltaMoM: 0.50,
		retainedSpark: [6800, 7100, 7500, 7900, 8200, 8523],
		capturedSpark: [1800, 2100, 2400, 2800, 3000, 3214],
	},

	buyerSegments: [
		{
			buyer: "copy",
			buyerLabel: "Para o time de copy",
			count: 3,
			impactMin: 1200,
			impactMax: 2400,
			impactMidpoint: 1800,
			sampleFindingIds: [
				"finding_value_proposition_buried",
				"finding_cta_competing_or_unclear",
			],
			sampleFindingTitles: [
				"Hero da home não diz o outcome em <5s",
				"3 CTAs concorrentes na pricing",
			],
		},
		{
			buyer: "eng",
			buyerLabel: "Para o time de engenharia",
			count: 2,
			impactMin: 2800,
			impactMax: 5600,
			impactMidpoint: 4200,
			sampleFindingIds: [
				"finding_trust_boundary_crossed",
				"finding_revenue_path_fragile",
			],
			sampleFindingTitles: [
				"Checkout redireciona pra domínio externo sem aviso",
				"API de checkout p99 8x mais lenta que catálogo",
			],
		},
		{
			buyer: "leadership",
			buyerLabel: "Para liderança",
			count: 1,
			impactMin: 8000,
			impactMax: 16000,
			impactMidpoint: 12000,
			sampleFindingIds: ["finding_landing_app_mismatch"],
			sampleFindingTitles: [
				"Anúncio do Meta promete 'plano grátis' mas signup não tem",
			],
		},
	],

	narrativeWhatHappened: `Em maio você resolveu 4 findings totalizando **R$ 3.2k** — dois deles eram chronic, sinal que o time tá fechando padrões, não só sintomas. Mas o ciclo de **12/maio** trouxe 3 regressões novas conectadas ao deploy de Black Friday: o componente de checkout otimizado pra mobile introduziu fricção na variação desktop, provavelmente regressão da prop \`isFloatingLabel\`.

Comparado ao mês anterior, você cresceu valor capturado em **78%**, mas o número absoluto de findings críticos abertos (**12**) permanece acima da sua média histórica de **8**. A maior parte da exposição nova está no checkout — vale priorizar isso esta semana antes que afete revenue de junho.`,

	valuePreviewNarrative: `Você tá há **2 meses** no Vestigio. Em 1 mês, com seus dados de Stripe e behavioral entrando no engine, suas findings ficam ~40% mais específicas. Em 4 meses, você começa a ver benchmark contra sua categoria. Em 10 meses, o recommender tem histórico suficiente pra prever regressões antes de elas surgirem.`,

	valuePreview: {
		currentMonth: {
			label: "Hoje · M1",
			unlocked: ["surfaces visíveis", "findings públicos", "memory rollups"],
			icon: "check",
		},
		milestoneM3: {
			label: "M3",
			eta: "em 1 mês",
			unlocked: ["Stripe + behavioral no engine", "findings ~40% mais específicas"],
			icon: "pending",
		},
		milestoneM6: {
			label: "M6",
			eta: "em 4 meses",
			unlocked: ["benchmark vs categoria", "padrões cross-customer começam"],
			icon: "future",
		},
		milestoneM12: {
			label: "M12",
			eta: "em 10 meses",
			unlocked: ["recommender com histórico completo", "predição de regressões"],
			icon: "future",
		},
	},

	memoryRollups: {
		"1m": {
			label: "Último mês",
			actionsResolved: 6,
			capturedTotal: 4127,
			topCategories: ["copy_alignment", "channel_integrity"],
			monthlyValues: [{ month: "2026-05", value: 4127 }],
		},
		"3m": {
			label: "Últimos 3 meses",
			actionsResolved: 14,
			capturedTotal: 8945,
			topCategories: ["copy_alignment", "revenue_integrity", "channel_integrity"],
			biggestWin: {
				title: "Fix do checkout redirect chain",
				capturedAmount: 3200,
				resolvedAt: "2026-04-18",
			},
			monthlyValues: [
				{ month: "2026-03", value: 1800 },
				{ month: "2026-04", value: 3018 },
				{ month: "2026-05", value: 4127 },
			],
		},
		"6m": {
			label: "Últimos 6 meses",
			actionsResolved: 22,
			capturedTotal: 14820,
			topCategories: ["copy_alignment", "revenue_integrity"],
			biggestWin: {
				title: "Reorder da pricing page",
				capturedAmount: 4100,
				resolvedAt: "2026-02-09",
			},
			monthlyValues: [
				{ month: "2025-12", value: 2100 },
				{ month: "2026-01", value: 1900 },
				{ month: "2026-02", value: 2876 },
				{ month: "2026-03", value: 1800 },
				{ month: "2026-04", value: 3018 },
				{ month: "2026-05", value: 4127 },
			],
		},
		"12m": {
			label: "Últimos 12 meses",
			actionsResolved: 38,
			capturedTotal: 23410,
			topCategories: ["copy_alignment", "revenue_integrity", "scale_readiness"],
			benchmarkAvailability: "available_in_4_months",
			biggestWin: {
				title: "Substituição do gateway pra Stripe",
				capturedAmount: 6800,
				resolvedAt: "2025-09-12",
			},
			monthlyValues: [
				{ month: "2025-06", value: 1100 },
				{ month: "2025-07", value: 1450 },
				{ month: "2025-08", value: 980 },
				{ month: "2025-09", value: 6800 },
				{ month: "2025-10", value: 2100 },
				{ month: "2025-11", value: 1800 },
				{ month: "2025-12", value: 2100 },
				{ month: "2026-01", value: 1900 },
				{ month: "2026-02", value: 2876 },
				{ month: "2026-03", value: 1800 },
				{ month: "2026-04", value: 3018 },
				{ month: "2026-05", value: 4127 },
			],
		},
	},

	nextSteps: [
		{
			id: "mock_step_1",
			order: 1,
			title: "Resolver fricção do mobile checkout",
			reasoning: `**78% do seu tráfego de paid Meta vem de mobile** (cruzando Stripe + Meta CSV). O checkout mobile teve regressão de **22% em conversão** após o deploy de 12/maio — é provável que tenha sido a causa direta.

A urgência aqui é: você gasta ~R$ 18k/mês em Meta Ads pra trazer esse tráfego, e a regressão de 22% significa ~R$ 4k de spend efetivamente perdido por mês até resolver. Isso destrava também os Steps 2 e 3 — boa parte do impacto deles depende do checkout estar limpo.`,
			procedureSteps: [
				"Reproduzir o problema no Chrome DevTools mobile emulator (iPhone 14 Pro viewport, conexão 3G simulada)",
				"Checkar git log dos componentes de checkout no deploy 12/maio (provavelmente components/Checkout/PaymentForm.tsx ou MobileCheckout.tsx)",
				"Comparar Lighthouse audit antes/depois (Wayback Machine para a versão de 11/maio se snapshot local faltando)",
				"Se for layout: revert localmente, cherry-pick fixes necessários; se for runtime: identificar o JS error via Sentry/error tracking",
			],
			researchRefs: [
				{ title: "Baymard — Mobile Checkout Best Practices", url: "https://baymard.com/blog/mobile-checkout-design" },
				{ title: "Stripe Elements — Mobile Guide", url: "https://stripe.com/docs/stripe-js/elements/mobile" },
			],
			estimatedEffort: "1-2 dias dev",
			suggestedOwner: "time eng",
			linkedActionRefs: ["action_47", "action_51"],
			combinedImpact: { min: 3200, max: 4800, midpoint: 4000 },
			status: "todo",
			assigneeUserId: null,
			assigneeName: null,
			dueAt: new Date("2026-06-08T23:59:00Z"),
			commentsCount: 2,
		},
		{
			id: "mock_step_2",
			order: 2,
			title: "Recuperar política de refund visível nos PDPs",
			reasoning: `Findings de **policy_gap** e **trust_break_in_checkout** coincidem: nenhum PDP cita política de refund acima da dobra, e o link da política expira em 404 nos mobile-only PDPs (consequência do mesmo deploy do passo 1).

Customer hesita justamente onde decide comprar. Estimativa de impact: **R$ 800/mo** por PDP-equivalente afetado, recuperável em ~5 dias de trabalho de copy + 1 dia de eng.`,
			procedureSteps: [
				"Listar todos PDPs ativos (use /api/inventory ou painel Shopify)",
				"Adicionar block 'Política de Refund' acima da dobra no template PDP",
				"Validar que link da página /politica-de-reembolso retorna 200 em mobile",
			],
			researchRefs: [
				{ title: "Hotmart — Como exibir política de reembolso", url: "https://blog.hotmart.com/pt-br/politica-de-reembolso" },
			],
			estimatedEffort: "1 dia copy + 0.5 dia eng",
			suggestedOwner: "copywriter",
			linkedActionRefs: ["action_62"],
			combinedImpact: { min: 600, max: 1200, midpoint: 900 },
			status: "todo",
			assigneeUserId: null,
			assigneeName: null,
			dueAt: null,
			commentsCount: 0,
		},
		{
			id: "mock_step_3",
			order: 3,
			title: "Reescrever CTA da landing /b2b",
			reasoning: `Finding **cta_clarity_weak_on_commercial** detectado em /b2b: CTA atual é "Saiba mais", genérico. Análise comportamental mostra que **38% dos visitantes** dessa página rolam até o fim sem clicar — sinal de intent não-resolvida.

Impact pequeno isolado (~R$ 500/mo) mas é um teste rápido com risco mínimo — quinze minutos de copywriting validados pelo time pode liberar a métrica.`,
			procedureSteps: [
				"Substituir 'Saiba mais' por algo outcome-driven, ex: 'Comece sua trial de 14 dias' ou 'Veja como funciona em 2min'",
				"A/B test contra o atual por 1 semana (se tiver tooling) ou shipped direto com revert plan",
			],
			researchRefs: [
				{ title: "Copyblogger — CTA outcome formulas", url: "https://copyblogger.com" },
			],
			estimatedEffort: "15min copy + deploy",
			suggestedOwner: "copywriter",
			linkedActionRefs: ["action_73"],
			combinedImpact: { min: 400, max: 600, midpoint: 500 },
			status: "todo",
			assigneeUserId: null,
			assigneeName: null,
			dueAt: null,
			commentsCount: 1,
		},
		{
			id: "mock_step_4",
			order: 4,
			title: "Auditar política de cookies vs banner de consent",
			reasoning: `**LGPD:** banner de cookies está disparando analytics ANTES do consent. ANPD multou 60+ empresas em 2025 por padrão idêntico — é um risco recorrente que vale fechar fora do calor do mês.`,
			procedureSteps: [
				"Conditional GA fire (só após user clicar 'aceitar')",
				"Validar via browser console que GTM tags só rodam pós-consent",
				"Revisar texto do banner com peça anpd-friendly (botão recusar mesma proeminência)",
			],
			researchRefs: [
				{ title: "ANPD — Guia de Cookies (2024)", url: "https://www.gov.br/anpd" },
			],
			estimatedEffort: "0.5 dia eng",
			suggestedOwner: "time eng",
			linkedActionRefs: ["action_88"],
			combinedImpact: { min: 0, max: 0, midpoint: 0 },
			status: "todo",
			assigneeUserId: null,
			assigneeName: null,
			dueAt: null,
			commentsCount: 0,
		},
		{
			id: "mock_step_5",
			order: 5,
			title: "Atualizar last-updated em testimonials",
			reasoning: `5 depoimentos com data **2024** visíveis na home. Custo de execução próximo de zero; impact pequeno mas mensurável (trust signal).`,
			procedureSteps: [
				"Remover datas ou atualizar para 2026 com depoimentos novos",
			],
			researchRefs: [],
			estimatedEffort: "15min",
			suggestedOwner: "copywriter",
			linkedActionRefs: ["action_91"],
			combinedImpact: { min: 150, max: 350, midpoint: 250 },
			status: "todo",
			assigneeUserId: null,
			assigneeName: null,
			dueAt: null,
			commentsCount: 0,
		},
	],
};

// Default export so consumers can `import MOCK_PLAN from "..."`.
export default MOCK_PLAN_HAVEFUNNELS_2026_06;
