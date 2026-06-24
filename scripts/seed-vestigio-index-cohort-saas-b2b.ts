// ──────────────────────────────────────────────
// Vestigio Index — one-shot cohort scan (SaaS B2B BR)
//
// Sister to scripts/seed-vestigio-index-cohort-ecommerce.ts, with
// signals specific to BR SaaS B2B rather than D2C. Where the ecom
// scan measured PIX / WhatsApp / fake urgency, this one measures
// pricing transparency, free trial vs demo, integration ecosystem
// visibility, BR-specific payment surfaces (PIX still appears in
// SaaS billing, plus boleto for B2B), and the self-serve-vs-sales-
// led axis.
//
// Per user direction this is a one-shot, not a pipeline. Refresh
// annually if/when the editor wants new numbers.
//
// Usage:
//   npx tsx scripts/seed-vestigio-index-cohort-saas-b2b.ts
// ──────────────────────────────────────────────

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { httpFetch } from "../workers/ingestion/http-client";

// 25 real BR SaaS B2B brands across marketing/sales, finance/ERP,
// customer service, HR, project/ops, vertical SaaS, fintech.
// Mix is intentional — engine signals should generalize across
// SaaS subverticals (the BR-SaaS-specific axes are pricing,
// trial vs demo, BR billing surfaces, locale).
const COHORT_URLS: string[] = [
	// Marketing / sales / growth
	"https://www.rdstation.com",
	"https://www.reportei.com",
	"https://www.hubla.com.br",
	// Finance / accounting / ERP
	"https://www.contaazul.com",
	"https://www.bling.com.br",
	"https://www.omie.com",
	"https://www.granatum.com.br",
	"https://www.egestor.com.br",
	// Customer service / support
	"https://www.octadesk.com",
	"https://www.movidesk.com",
	// People / HR / culture
	"https://www.solides.com.br",
	"https://www.gupy.io",
	// Project / process / ops
	"https://www.pipefy.com",
	"https://www.sankhya.com.br",
	// Fintech / payments / banking-as-service
	"https://www.asaas.com",
	"https://stark.expert",
	// Ecom platforms (sold as SaaS to brands)
	"https://www.tray.com.br",
	"https://www.lojaintegrada.com.br",
	"https://www.nuvemshop.com.br",
	// Logistics / fulfillment
	"https://olist.com",
	// Comms / engagement (B2C SaaS but sold B2B)
	"https://www.zenklub.com.br",
	// Vertical SaaS — health/legal/edu
	"https://www.iclinic.com.br",
	"https://www.medlogica.com.br",
	"https://www.sponteweb.com.br",
	// Marketing automation / analytics
	"https://www.mlabs.com.br",
];

// ── Detection patterns ─────────────────────────

interface SiteSignals {
	url: string;
	status: "ok" | "fetch_error" | "timeout";
	statusCode?: number;
	fetchError?: string;
	// Pricing surface
	hasPricingPageLink: boolean;
	hasCustomTier: boolean; // "fale com vendas" / "contact sales"
	hasAnnualToggle: boolean; // monthly vs annual switch
	hasFreeTier: boolean; // explicit free plan
	// Trial / try
	hasFreeTrialOffered: boolean;
	hasDemoBookingCTA: boolean;
	hasSignupNoCardClaim: boolean;
	// Self-serve indicators
	hasSelfServeSignupCTA: boolean;
	hasSeparateLoginLink: boolean;
	// Trust / proof
	hasCustomerLogos: boolean; // "trusted by" with image wall pattern
	hasCaseStudiesLink: boolean;
	hasSecurityBadges: boolean; // SOC2/ISO/LGPD compliance markers
	hasG2OrCapterraBadge: boolean;
	// Integration ecosystem
	hasIntegrationsPage: boolean;
	hasApiDocsLink: boolean;
	// BR payment surface (relevant for SaaS billing too)
	hasPixMention: boolean;
	hasBoletoMention: boolean;
	hasCnpjFieldMention: boolean; // CNPJ in signup = explicit B2B
	hasNfeMention: boolean; // NF-e (electronic invoice) signal
	// Content / support
	hasBlogLink: boolean;
	hasChangelogLink: boolean;
	hasHelpCenterLink: boolean;
	hasChatWidget: boolean;
	// Locale
	isPortugueseSite: boolean;
	mentionsBrazilExplicitly: boolean;
	// Pricing currency
	hasBrlPricing: boolean; // R$ symbol on pricing
	hasUsdPricing: boolean; // $ symbol on pricing
}

const RX = {
	pricingPage: /<a[^>]+href\s*=\s*["'][^"']*\/(?:pricing|precos|planos|prices|plans)/i,
	customTier:
		/\b(?:fale com (?:vendas|um especialista|nossa equipe)|contact sales|talk to sales|solicitar (?:uma )?proposta|contato comercial|sob consulta|enterprise plan)\b/i,
	annualToggle:
		/(?:mensal\s*[\/|]\s*anual|monthly\s*[\/|]\s*annual|anual\s*\(.*?(?:desconto|off|economize)|annual.{0,40}save)/i,
	freeTier:
		/\b(?:plano\s+gratuit|free\s+plan|grátis\s+pra\s+sempre|forever\s+free|gratuito\s+para\s+sempre|free\s+forever)\b/i,
	freeTrial:
		/\b(?:teste\s+(?:grátis|gratuito|por\s+\d+\s+dias)|free\s+trial|trial\s+gratuito|experimente\s+grátis|comece\s+grátis|start\s+free|try\s+for\s+free)\b/i,
	demoBooking:
		/\b(?:agendar\s+(?:uma\s+)?demo|book\s+a\s+demo|solicitar\s+(?:uma\s+)?demo|request\s+(?:a\s+)?demo|ver\s+demo|schedule\s+demo|agende\s+(?:uma\s+)?conversa)\b/i,
	signupNoCard:
		/\b(?:sem\s+(?:cartão|cart[aã]o\s+de\s+crédito)|no\s+credit\s+card(?:\s+required)?|sem\s+precisar\s+de\s+cartão)\b/i,
	selfServeSignup:
		/<a[^>]+(?:href\s*=\s*["'][^"']*\/(?:signup|sign-up|cadastro|criar-?conta|register|comecar|start)|class\s*=\s*["'][^"']*\b(?:signup|cadastro|start-free|get-started)\b)/i,
	separateLogin:
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:login|sign-in|signin|entrar|acessar)/i,
	customerLogos:
		/<[^>]+(?:class|id)\s*=\s*["'][^"']*\b(?:logo(?:-)?(?:wall|cloud|grid|bar|strip|client|customer)|trusted-?by|customers?-logos?|clientes?-logos?)\b/i,
	caseStudies:
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:case-studies?|customer-?stor(?:y|ies)|histor[íi]as?(?:-de)?-?(?:clientes?|sucesso)|estudos?-de-?caso)/i,
	securityBadges:
		/\b(?:soc\s*2|soc-?ii|iso\s*27001|iso-?27\d+|lgpd|gdpr-?ready|gdpr\s+compliant|pci-?dss|hipaa)\b/i,
	g2Badge:
		/(g2crowd|g2\.com|capterra\.com|trustpilot\.com|appstore.+vestigio|gartner\b)/i,
	integrationsPage:
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:integrations|integracoes|integracao|integrations?-?page)/i,
	apiDocs:
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:docs|api|developers?|api-?reference|documentation|documentacao)/i,
	pix: /\bpix\b/i,
	boleto: /\bboleto(?:\s+banc[áa]rio)?\b/i,
	cnpjField: /\bcnpj\b/i,
	nfe: /\b(?:nf-?e|nota\s+fiscal\s+(?:eletr[ôo]nica|de\s+servi[çc]o)|nfs-?e|emiss[ãa]o\s+de\s+nota)\b/i,
	blog: /<a[^>]+href\s*=\s*["'][^"']*\/blog/i,
	changelog:
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:changelog|updates?|whats-?new|novidades|releases?|release-?notes)/i,
	helpCenter:
		/<a[^>]+href\s*=\s*["'][^"']*\/(?:help|ajuda|suporte|support|central(?:-de)?-?(?:ajuda|atendimento|conhecimento)|knowledge-?base)/i,
	chat: /(intercom|crisp(?:chat)?|drift\.com|tawk\.to|hs-cta|hubspot.+messages|zdassets|tidio\.co|smartsupp|chatwoot|jivochat|octadesk)/i,
	// Portuguese-language markers — strong PT-BR vocab
	ptBrMarkers:
		/\b(?:plano|preço|grátis|cadastre-?se|começar|empresa|recurso|funcionalidade|saiba\s+mais|entrar)\b/i,
	mentionsBrazil: /\b(?:brasil(?:eir[oa])?s?|brazil|brazilian)\b/i,
	brlPricing: /R\$\s*\d/i,
	usdPricing: /\$\s*\d{1,4}(?:[.,]\d{2})?(?:\s*\/(?:mês|mo|month|user))?/i,
};

function detectSiteSignals(url: string, html: string, statusCode: number): SiteSignals {
	return {
		url,
		status: "ok",
		statusCode,
		hasPricingPageLink: RX.pricingPage.test(html),
		hasCustomTier: RX.customTier.test(html),
		hasAnnualToggle: RX.annualToggle.test(html),
		hasFreeTier: RX.freeTier.test(html),
		hasFreeTrialOffered: RX.freeTrial.test(html),
		hasDemoBookingCTA: RX.demoBooking.test(html),
		hasSignupNoCardClaim: RX.signupNoCard.test(html),
		hasSelfServeSignupCTA: RX.selfServeSignup.test(html),
		hasSeparateLoginLink: RX.separateLogin.test(html),
		hasCustomerLogos: RX.customerLogos.test(html),
		hasCaseStudiesLink: RX.caseStudies.test(html),
		hasSecurityBadges: RX.securityBadges.test(html),
		hasG2OrCapterraBadge: RX.g2Badge.test(html),
		hasIntegrationsPage: RX.integrationsPage.test(html),
		hasApiDocsLink: RX.apiDocs.test(html),
		hasPixMention: RX.pix.test(html),
		hasBoletoMention: RX.boleto.test(html),
		hasCnpjFieldMention: RX.cnpjField.test(html),
		hasNfeMention: RX.nfe.test(html),
		hasBlogLink: RX.blog.test(html),
		hasChangelogLink: RX.changelog.test(html),
		hasHelpCenterLink: RX.helpCenter.test(html),
		hasChatWidget: RX.chat.test(html),
		isPortugueseSite: RX.ptBrMarkers.test(html),
		mentionsBrazilExplicitly: RX.mentionsBrazil.test(html),
		hasBrlPricing: RX.brlPricing.test(html),
		hasUsdPricing: RX.usdPricing.test(html),
	};
}

// ── Concurrency + scan loop ────────────────────

const CONCURRENCY = 3;
const INTER_BATCH_DELAY_MS = 1000;

async function scanOne(url: string): Promise<SiteSignals> {
	const emptySignals: Omit<SiteSignals, "url" | "status" | "fetchError" | "statusCode"> = {
		hasPricingPageLink: false,
		hasCustomTier: false,
		hasAnnualToggle: false,
		hasFreeTier: false,
		hasFreeTrialOffered: false,
		hasDemoBookingCTA: false,
		hasSignupNoCardClaim: false,
		hasSelfServeSignupCTA: false,
		hasSeparateLoginLink: false,
		hasCustomerLogos: false,
		hasCaseStudiesLink: false,
		hasSecurityBadges: false,
		hasG2OrCapterraBadge: false,
		hasIntegrationsPage: false,
		hasApiDocsLink: false,
		hasPixMention: false,
		hasBoletoMention: false,
		hasCnpjFieldMention: false,
		hasNfeMention: false,
		hasBlogLink: false,
		hasChangelogLink: false,
		hasHelpCenterLink: false,
		hasChatWidget: false,
		isPortugueseSite: false,
		mentionsBrazilExplicitly: false,
		hasBrlPricing: false,
		hasUsdPricing: false,
	};
	try {
		const res = await httpFetch(url);
		if (res.status_code >= 400) {
			return {
				url,
				status: "fetch_error",
				statusCode: res.status_code,
				fetchError: `HTTP ${res.status_code}`,
				...emptySignals,
			};
		}
		return detectSiteSignals(url, res.body, res.status_code);
	} catch (err) {
		return {
			url,
			status: "fetch_error",
			fetchError: err instanceof Error ? err.message : String(err),
			...emptySignals,
		};
	}
}

async function scanAll(urls: string[]): Promise<SiteSignals[]> {
	const results: SiteSignals[] = [];
	for (let i = 0; i < urls.length; i += CONCURRENCY) {
		const batch = urls.slice(i, i + CONCURRENCY);
		console.log(`  Batch ${i / CONCURRENCY + 1}: ${batch.length} sites...`);
		const batchResults = await Promise.all(batch.map((u) => scanOne(u)));
		for (const r of batchResults) {
			console.log(
				`    ${r.status === "ok" ? "✓" : "✗"} ${r.url.padEnd(50)} ${r.status === "ok" ? "" : r.fetchError || ""}`,
			);
			results.push(r);
		}
		if (i + CONCURRENCY < urls.length) {
			await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
		}
	}
	return results;
}

// ── Aggregation ────────────────────────────────

interface CohortAggregateSaas {
	vertical: string;
	period: string;
	scannedAt: string;
	urlsTotal: number;
	urlsScanned: number;
	urlsSucceeded: number;
	urlsFailed: number;
	prevalence: {
		pricingPageLink: number;
		customTier: number;
		annualToggle: number;
		freeTier: number;
		freeTrialOffered: number;
		demoBookingCTA: number;
		signupNoCardClaim: number;
		selfServeSignupCTA: number;
		separateLoginLink: number;
		customerLogos: number;
		caseStudiesLink: number;
		securityBadges: number;
		g2OrCapterraBadge: number;
		integrationsPage: number;
		apiDocsLink: number;
		pixMention: number;
		boletoMention: number;
		cnpjFieldMention: number;
		nfeMention: number;
		blogLink: number;
		changelogLink: number;
		helpCenterLink: number;
		chatWidget: number;
		isPortugueseSite: number;
		mentionsBrazilExplicitly: number;
		brlPricing: number;
		usdPricing: number;
	};
	sites: SiteSignals[];
}

function aggregate(
	results: SiteSignals[],
	vertical: string,
	period: string,
): CohortAggregateSaas {
	const ok = results.filter((r) => r.status === "ok");
	const denom = ok.length || 1;
	const sumBool = (key: keyof SiteSignals) =>
		ok.filter((r) => (r[key] as boolean) === true).length;
	return {
		vertical,
		period,
		scannedAt: new Date("2026-06-24").toISOString().slice(0, 10),
		urlsTotal: results.length,
		urlsScanned: results.length,
		urlsSucceeded: ok.length,
		urlsFailed: results.length - ok.length,
		prevalence: {
			pricingPageLink: sumBool("hasPricingPageLink") / denom,
			customTier: sumBool("hasCustomTier") / denom,
			annualToggle: sumBool("hasAnnualToggle") / denom,
			freeTier: sumBool("hasFreeTier") / denom,
			freeTrialOffered: sumBool("hasFreeTrialOffered") / denom,
			demoBookingCTA: sumBool("hasDemoBookingCTA") / denom,
			signupNoCardClaim: sumBool("hasSignupNoCardClaim") / denom,
			selfServeSignupCTA: sumBool("hasSelfServeSignupCTA") / denom,
			separateLoginLink: sumBool("hasSeparateLoginLink") / denom,
			customerLogos: sumBool("hasCustomerLogos") / denom,
			caseStudiesLink: sumBool("hasCaseStudiesLink") / denom,
			securityBadges: sumBool("hasSecurityBadges") / denom,
			g2OrCapterraBadge: sumBool("hasG2OrCapterraBadge") / denom,
			integrationsPage: sumBool("hasIntegrationsPage") / denom,
			apiDocsLink: sumBool("hasApiDocsLink") / denom,
			pixMention: sumBool("hasPixMention") / denom,
			boletoMention: sumBool("hasBoletoMention") / denom,
			cnpjFieldMention: sumBool("hasCnpjFieldMention") / denom,
			nfeMention: sumBool("hasNfeMention") / denom,
			blogLink: sumBool("hasBlogLink") / denom,
			changelogLink: sumBool("hasChangelogLink") / denom,
			helpCenterLink: sumBool("hasHelpCenterLink") / denom,
			chatWidget: sumBool("hasChatWidget") / denom,
			isPortugueseSite: sumBool("isPortugueseSite") / denom,
			mentionsBrazilExplicitly: sumBool("mentionsBrazilExplicitly") / denom,
			brlPricing: sumBool("hasBrlPricing") / denom,
			usdPricing: sumBool("hasUsdPricing") / denom,
		},
		sites: results,
	};
}

// ── Output ─────────────────────────────────────

function writeCohortDataset(aggregate: CohortAggregateSaas) {
	const outDir = join(process.cwd(), "src/data/vestigio-index/cohorts");
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	const slug = `${aggregate.vertical}-${aggregate.period}`;
	const outFile = join(outDir, `${slug}.ts`);
	const constName = `COHORT_${aggregate.vertical.replace(/-/g, "_").toUpperCase()}_${aggregate.period.replace(/-/g, "_")}`;
	const body = `// ──────────────────────────────────────────────
// Vestigio Index cohort dataset — ${aggregate.vertical} ${aggregate.period}
//
// Generated by scripts/seed-vestigio-index-cohort-saas-b2b.ts on
// ${aggregate.scannedAt}. Run that script again (manually, no
// schedule) to refresh; results are otherwise stable. Backs the
// numerical claims in the SaaS B2B edition essay; can also feed
// benchmark cards inside the authenticated Plano once that wiring
// lands.
//
// Schema differs from the ecommerce cohort — SaaS B2B signals are
// different (pricing transparency, trial vs demo, integration
// ecosystem, BR billing surfaces) so the prevalence map is wider.
// ──────────────────────────────────────────────

export interface SaasB2bSiteSignals {
	url: string;
	status: "ok" | "fetch_error" | "timeout";
	statusCode?: number;
	fetchError?: string;
	hasPricingPageLink: boolean;
	hasCustomTier: boolean;
	hasAnnualToggle: boolean;
	hasFreeTier: boolean;
	hasFreeTrialOffered: boolean;
	hasDemoBookingCTA: boolean;
	hasSignupNoCardClaim: boolean;
	hasSelfServeSignupCTA: boolean;
	hasSeparateLoginLink: boolean;
	hasCustomerLogos: boolean;
	hasCaseStudiesLink: boolean;
	hasSecurityBadges: boolean;
	hasG2OrCapterraBadge: boolean;
	hasIntegrationsPage: boolean;
	hasApiDocsLink: boolean;
	hasPixMention: boolean;
	hasBoletoMention: boolean;
	hasCnpjFieldMention: boolean;
	hasNfeMention: boolean;
	hasBlogLink: boolean;
	hasChangelogLink: boolean;
	hasHelpCenterLink: boolean;
	hasChatWidget: boolean;
	isPortugueseSite: boolean;
	mentionsBrazilExplicitly: boolean;
	hasBrlPricing: boolean;
	hasUsdPricing: boolean;
}

export interface SaasB2bCohortAggregate {
	vertical: string;
	period: string;
	scannedAt: string;
	urlsTotal: number;
	urlsScanned: number;
	urlsSucceeded: number;
	urlsFailed: number;
	prevalence: Record<string, number>;
	sites: SaasB2bSiteSignals[];
}

export const ${constName}: SaasB2bCohortAggregate = ${JSON.stringify(aggregate, null, "\t")};
`;
	writeFileSync(outFile, body, "utf-8");
	console.log(`\nWrote ${outFile}`);
}

// ── Main ───────────────────────────────────────

async function main() {
	const vertical = "saas-b2b";
	const period = "2026-06";

	console.log(`\nVestigio Index cohort scan — ${vertical} ${period}`);
	console.log(`URLs: ${COHORT_URLS.length}`);
	console.log(`Concurrency: ${CONCURRENCY} · Delay between batches: ${INTER_BATCH_DELAY_MS}ms\n`);

	const start = Date.now();
	const results = await scanAll(COHORT_URLS);
	const elapsed = ((Date.now() - start) / 1000).toFixed(1);

	console.log(`\nScan complete in ${elapsed}s`);
	const agg = aggregate(results, vertical, period);
	console.log(`Succeeded: ${agg.urlsSucceeded}/${agg.urlsTotal}`);
	console.log("\nPrevalence (across succeeded sites):");
	for (const [k, v] of Object.entries(agg.prevalence)) {
		console.log(`  ${k.padEnd(28)} ${(v * 100).toFixed(0)}% (${Math.round(v * agg.urlsSucceeded)}/${agg.urlsSucceeded})`);
	}

	writeCohortDataset(agg);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
