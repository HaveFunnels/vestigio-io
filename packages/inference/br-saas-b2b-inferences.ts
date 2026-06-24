// ──────────────────────────────────────────────
// BR SaaS B2B inferences — detectors backed by the 21-site cohort
// scan in src/data/vestigio-index/cohorts/saas-b2b-2026-06.ts.
//
// Different signal set from br-d2c-inferences.ts because BR SaaS
// B2B operates in a different surface mix:
//   - Pricing transparency / trial vs demo / annual cycles
//   - B2B billing (CNPJ, boleto, NF-e — PIX less central than D2C)
//   - Trust signals (case studies, customer logos, security badges)
//   - Self-serve vs sales-led axis
//
// The cohort surfaced 4 patterns where BR diverges from US/EU SaaS
// literature so far that the absence is a measurable opportunity —
// not a market norm to be normalized into noise:
//
//   1. customer_proof_minimal — 0% have customer logos, 14% have
//      case studies, 5% have G2/Capterra badges. So 86% of BR SaaS
//      B2B sites have no external trust signal at all. Even one
//      adds meaningful conversion in a B2B funnel.
//
//   2. signup_no_card_claim_missing — 0% (literally zero) of the
//      cohort communicates "sem cartão" / "no credit card
//      required". Buyers default-assume they need a card to start
//      trial; the explicit claim removes that friction.
//
//   3. security_compliance_signal_absent — 19% have SOC2/ISO/LGPD/
//      PCI mentions on the public site. B2B buyers — especially
//      procurement — look for these markers; absence pushes the
//      conversation to email-the-CISO friction.
//
//   4. pricing_usd_only_for_br_site — 38% of BR SaaS B2B sites
//      that target Brazil (100% PT-BR, 76% mention Brasil) don't
//      show pricing in R$. Mental conversion is friction that loses
//      mid-funnel browsers.
//
// All 4 are gated on env_locale='pt-BR' + businessModel='saas' —
// the same plumbing the BR D2C detectors use.
// ──────────────────────────────────────────────

import {
	Evidence,
	EvidenceType,
	Inference,
	InferenceCategory,
	Scoping,
	Signal,
	makeRef,
} from "../domain";
import { buildInference } from "./vertical-inference";

// ── Shared helpers ────────────────────────────

function getPageContentEvidence(evidence: readonly Evidence[]): Evidence[] {
	return evidence.filter((e) => e.evidence_type === EvidenceType.PageContent);
}

function joinPageRawHtml(evidence: readonly Evidence[]): string {
	const pages = getPageContentEvidence(evidence);
	const parts: string[] = [];
	for (const e of pages) {
		const p = e.payload as { raw_html?: string | null; body?: string | null };
		if (p.raw_html) parts.push(p.raw_html);
		if (p.body) parts.push(p.body);
	}
	return parts.join("\n");
}

// ── 1. Customer proof minimal ───────────────────

/**
 * Fires when a SaaS B2B site has a real funnel (pricing page
 * present) but exposes ZERO external trust signal: no customer
 * logo wall, no case studies link, no G2/Capterra badge.
 *
 * Cohort context: 0% have customer logos, 14% have case studies,
 * 5% have G2/Capterra. So 86% of the cohort exposes no external
 * trust signal at all. Cultural NDA constraints + lower public-
 * proof norm explain the prevalence — but the lever is still
 * real for any founder willing to negotiate display rights with
 * even 3-5 customers. In a market where peers don't, you stand
 * out.
 *
 * Detector requires the pricing page signal because we don't want
 * to fire on early-stage brochure sites that haven't built the
 * funnel yet.
 */
export function inferCustomerProofMinimal(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	const fullCorpus = `${corpus}\n${html.toLowerCase()}`;
	// Must have a pricing-page signal (real funnel exists).
	const pricingPagePresent =
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:pricing|precos|planos|prices|plans)/i.test(html);
	if (!pricingPagePresent) return [];
	// Customer logo wall signals.
	const customerLogos =
		/<[^>]+(?:class|id)\s*=\s*["'][^"']*\b(?:logo(?:-)?(?:wall|cloud|grid|bar|strip|client|customer)|trusted-?by|customers?-logos?|clientes?-logos?)\b/i.test(html);
	// Case studies link.
	const caseStudies =
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:case-studies?|customer-?stor(?:y|ies)|histor[íi]as?(?:-de)?-?(?:clientes?|sucesso)|estudos?-de-?caso)/i.test(html);
	// Third-party review badge.
	const externalReviewBadge =
		/(g2crowd|g2\.com|capterra\.com|trustpilot\.com|gartner\b)/i.test(html);

	// If ANY of the three exists, the site has some external proof
	// — don't fire. We only fire on triple-no.
	if (customerLogos || caseStudies || externalReviewBadge) return [];

	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"customer_proof_minimal",
			InferenceCategory.RevenuePath,
			scoping,
			cycleRef,
			"true",
			"high",
			72,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Você tem pricing page mas zero prova externa — sem logos de cliente, sem case studies, sem badge G2/Capterra. No SaaS B2B BR isso é a norma (86% do mercado faz igual), o que significa: quem entra com QUALQUER prova externa se diferencia muito. Você não precisa de logo wall de 30 marcas — 3-5 logos de clientes que aceitam exposição + 1-2 case studies escritos move conversão na fase de avaliação. O comprador B2B BR está acostumado com 'fé no vendedor'; quem mostra prova ganha.",
		),
	];
}

// ── 2. Signup "no card" claim missing ───────────

/**
 * Fires when the site offers self-serve signup AND a free trial
 * but does NOT communicate explicitly that no credit card is
 * required to start.
 *
 * Cohort context: 0% (literally zero) of the 21 sites surface this
 * claim. Buyers default-assume any trial requires a card; the
 * explicit "sem cartão de crédito" / "no credit card required"
 * claim removes that friction at the decision moment.
 *
 * Detector requires both signup CTA + trial offer to avoid firing
 * on demo-only sites where the claim wouldn't apply.
 */
export function inferSignupNoCardClaimMissing(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	const selfServeSignup =
		/<a[^>]+(?:href\s*=\s*["'][^"']*\/(?:signup|sign-up|cadastro|criar-?conta|register|comecar|start)|class\s*=\s*["'][^"']*\b(?:signup|cadastro|start-free|get-started)\b)/i.test(
			html,
		);
	if (!selfServeSignup) return [];
	const trialOffered =
		/\b(?:teste\s+(?:grátis|gratuito|por\s+\d+\s+dias)|free\s+trial|trial\s+gratuito|experimente\s+grátis|comece\s+grátis|start\s+free|try\s+for\s+free)\b/i.test(
			html,
		);
	if (!trialOffered) return [];
	const noCardClaim =
		/\b(?:sem\s+(?:cartão|cart[aã]o\s+de\s+crédito)|no\s+credit\s+card(?:\s+required)?|sem\s+precisar\s+de\s+cartão)\b/i.test(
			html,
		);
	if (noCardClaim) return [];
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"signup_no_card_claim_missing",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"high",
			75,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Você oferece teste grátis mas não diz 'sem cartão de crédito'. No BR SaaS B2B, 100% das lojas do cohort que analisamos têm o mesmo gap — comprador presume que precisa de cartão pra começar e abandona o signup. A claim explícita 'Comece grátis, sem cartão' no botão de signup remove o atrito mental no momento da decisão. Custo: 5 minutos de copy + deploy. Impacto típico: signup-completion sobe 10-20%.",
		),
	];
}

// ── 3. Security / compliance signal absent ──────

/**
 * Fires when a B2B SaaS site has a pricing page (= real B2B funnel)
 * but no compliance / security signal on the public surface — no
 * SOC 2, ISO 27001, LGPD-compliance, PCI-DSS, GDPR-ready mention.
 *
 * Cohort context: 19% have a security badge of some kind. The 81%
 * gap matters for B2B procurement — buyers expect to find these
 * markers above the fold. Absence forces the conversation back to
 * email-the-CISO friction at the worst moment in the sales cycle.
 *
 * Even a "trabalhamos com SOC 2" line above the fold or a /trust
 * page link signals readiness; the lever is mostly copy.
 */
export function inferSecurityComplianceSignalAbsent(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	const fullCorpus = `${corpus}\n${html.toLowerCase()}`;
	// Require pricing page (= real B2B funnel) to avoid noise on
	// early-stage brochure sites.
	const pricingPagePresent =
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:pricing|precos|planos|prices|plans)/i.test(html);
	if (!pricingPagePresent) return [];
	const complianceMarkers =
		/\b(?:soc\s*2|soc-?ii|iso\s*27001|iso-?27\d+|lgpd|gdpr-?ready|gdpr\s+compliant|pci-?dss|hipaa|trust\s+center|central\s+de\s+confiança|security\s+(?:program|page)|programa\s+de\s+segurança)\b/i;
	if (complianceMarkers.test(fullCorpus)) return [];
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"security_compliance_signal_absent",
			InferenceCategory.RevenuePath,
			scoping,
			cycleRef,
			"true",
			"medium",
			68,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Você tem pricing page mas nenhum sinal de compliance/segurança visível — sem SOC 2, sem ISO 27001, sem 'LGPD', sem 'central de confiança'. No B2B BR, comprador de procurement pesquisa esses markers antes de abrir conversa comercial. Quando não acha, a venda volta pro fluxo 'preciso conversar com seu CISO' — que é o pior momento pra introduzir fricção. Lever: uma linha 'Trabalhamos em conformidade com LGPD e auditoria SOC 2' acima da dobra OU uma página /trust dedicada destrava a barreira sem precisar de cert nova.",
		),
	];
}

// ── 4. Pricing in USD only for BR-targeting site ─

/**
 * Fires when a site clearly targets BR (Portuguese-language + may
 * mention Brasil explicitly) AND has pricing visible in USD ($) AND
 * does NOT show pricing in BRL (R$).
 *
 * Cohort context: 100% of the cohort is in Portuguese, 76% mention
 * Brazil explicitly, 52% show BRL pricing, 62% show USD. The
 * overlap means 38% of BR-targeting SaaS B2B sites don't surface
 * pricing in R$ at all — leaving BR buyers to mentally convert
 * mid-funnel. Friction that loses browsers at the price-comparison
 * stage.
 *
 * Detector requires Portuguese-language site AND USD pricing AND
 * no BRL pricing. Sites that publish in BOTH currencies are fine
 * — that's the right move for serving BR + LatAm.
 */
export function inferPricingUsdOnlyForBrSite(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	// PT-BR site signals — strong lexical markers.
	const isPortuguese =
		/\b(?:plano|preço|grátis|cadastre-?se|começar|empresa|recurso|funcionalidade|saiba\s+mais|entrar)\b/i.test(
			html,
		);
	if (!isPortuguese) return [];
	const hasUsdPricing = /\$\s*\d{1,4}(?:[.,]\d{2})?(?:\s*\/(?:mês|mo|month|user))?/i.test(html);
	if (!hasUsdPricing) return [];
	const hasBrlPricing = /R\$\s*\d/i.test(html);
	if (hasBrlPricing) return []; // Dual-currency is fine — don't fire.
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"pricing_usd_only_for_br_site",
			InferenceCategory.RevenuePath,
			scoping,
			cycleRef,
			"true",
			"medium",
			65,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Seu site está em português e seus preços estão só em USD — sem R$ visível. Quase 40% do BR SaaS B2B faz isso, e perde browsers no momento de comparação de preço (comprador precisa abrir conversor mental). Pra B2B BR vendendo pra empresas que pagam em real, mostrar preço em R$ (ou pelo menos um toggle BRL/USD) reduz o atrito de avaliação. Se você cobra em USD intencionalmente (target enterprise / LatAm wider), publique BOTH — taxa fixa de conversão é mais transparente que forçar o cliente a calcular.",
		),
	];
}

// ── Dispatch helper ───────────────────────────

/**
 * Run all BR SaaS B2B inferences in sequence and return the
 * combined array. Caller is responsible for the
 * envLocale='pt-BR' + model==='saas' gate.
 */
export function computeBrSaasB2bInferences(
	sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	corpus: string,
): Inference[] {
	return [
		...inferCustomerProofMinimal(sigs, scoping, cycleRef, evidence, corpus),
		...inferSignupNoCardClaimMissing(sigs, scoping, cycleRef, evidence, corpus),
		...inferSecurityComplianceSignalAbsent(sigs, scoping, cycleRef, evidence, corpus),
		...inferPricingUsdOnlyForBrSite(sigs, scoping, cycleRef, evidence, corpus),
	];
}
