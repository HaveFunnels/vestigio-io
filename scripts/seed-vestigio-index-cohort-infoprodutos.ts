// ──────────────────────────────────────────────
// Vestigio Index — one-shot cohort scan (Infoprodutos BR)
//
// Different signal set from ecommerce and saas-b2b — infoprodutos
// (cursos online, ebooks, mentorias, comunidades pagas) operate
// in a distinct funnel pattern:
//   - VSL (video sales letter) + long-form sales letter
//   - Hotmart / Eduzz / Kiwify / Monetizze / Braip checkout
//   - Garantia X dias as default trust signal
//   - Depoimentos heavy + Bônus sections
//   - Scarcity por lote / "últimas vagas" / countdown
//   - Parcelado 12x sem juros como expectativa universal
//
// Per user direction: one-shot, not pipeline. Refresh annually.
//
// Usage:
//   npx tsx scripts/seed-vestigio-index-cohort-infoprodutos.ts
// ──────────────────────────────────────────────

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { httpFetch } from "../workers/ingestion/http-client";

// 24 BR infoprodutos sites — mix of platforms (Hotmart, Eduzz,
// etc.) + top infoprodutor brand sites (Sobral, Erico, etc.).
const COHORT_URLS: string[] = [
	// Plataformas
	"https://www.hotmart.com",
	"https://www.eduzz.com",
	"https://kiwify.com.br",
	"https://www.monetizze.com.br",
	"https://www.braip.com.br",
	"https://ticto.com.br",
	"https://memberkit.com.br",
	"https://eadbox.com",
	"https://coursify.me",
	"https://www.sympla.com.br",
	// Top infoprodutores — finanças / empreendedorismo
	"https://oprimorico.com.br",
	"https://nathfinancas.com.br",
	"https://www.brunoperini.com.br",
	"https://www.camilafarani.com.br",
	"https://www.ericorocha.com.br",
	"https://pedrosobral.me",
	"https://www.conradoadolpho.com.br",
	"https://joeljota.com",
	// Top infoprodutores — educação / desenvolvimento / cursos
	"https://www.tiagobrunet.com.br",
	"https://www.camilaporto.com.br",
	"https://www.faculdadedigital.com.br",
	"https://www.descomplica.com.br",
	"https://www.napratica.org.br",
	"https://thinkific.com",
];

interface SiteSignals {
	url: string;
	status: "ok" | "fetch_error" | "timeout";
	statusCode?: number;
	fetchError?: string;
	// Payment / checkout
	hasHotmartCheckout: boolean;
	hasEduzzCheckout: boolean;
	hasKiwifyCheckout: boolean;
	hasMonetizzeCheckout: boolean;
	hasPixMention: boolean;
	// Funnel structure
	hasVSL: boolean;
	hasInstallmentVisible: boolean;
	hasMultipleBuyCtas: boolean;
	// Trust / proof
	hasGarantiaXDias: boolean;
	hasDepoimentos: boolean;
	hasBonusSection: boolean;
	// Urgency / scarcity
	hasCountdownTimer: boolean;
	hasLoteScarcity: boolean;
	hasUrgencyCopy: boolean;
	// Content structure
	hasFaqSection: boolean;
	hasParaQuemSection: boolean;
	hasLongFormSales: boolean;
	// Communication
	hasWhatsappContact: boolean;
	hasChatWidget: boolean;
	// Locale
	isPortugueseSite: boolean;
	// Pricing
	hasBrlPricing: boolean;
	// Numeric
	buyCtaCount: number;
	htmlSizeKb: number;
}

const RX = {
	hotmartCheckout: /(pay\.hotmart\.com|hotmart\.com[^"'\s]*\/(?:checkout|comprar|buy)|checkout\.hotmart)/i,
	eduzzCheckout: /(pay\.eduzz\.com|chk\.eduzz\.com|eduzz\.com[^"'\s]*\/(?:checkout|comprar))/i,
	kiwifyCheckout: /(pay\.kiwify\.com|kiwify\.com[^"'\s]*\/(?:checkout|comprar))/i,
	monetizzeCheckout: /(app\.monetizze\.com\.br[^"'\s]*\/r\/|monetizze\.com\.br[^"'\s]*\/checkout)/i,
	pix: /\bpix\b/i,
	vslAutoplay: /<video[^>]+\bautoplay\b/i,
	installment:
		/\b\d{1,2}\s*x\s*(?:de\s+r\$[\d.,]+\s+)?(?:sem\s+juros|s\/?\s*juros)|parcele(?:\s+em)?(?:\s+até)?\s+\d{1,2}\s*x/i,
	garantia:
		/\b(?:garantia\s+(?:de\s+)?\d+\s+(?:dias?|d[íi]as?)|garantia\s+incondicional|risco\s+zero|sem\s+risco|dinheiro\s+de\s+volta)\b/i,
	depoimentos:
		/\b(?:depoimento|testemunho|histórias?\s+de\s+(?:sucesso|alunos)|quem\s+já\s+fez|o\s+que\s+(?:dizem|falam))\b/i,
	bonusSection:
		/\b(?:b[ôo]nus\s*(?:especial|exclusiv|surpresa)?\s*(?:\d+|#\d+|n[º°]?\s*\d+)|brinde\s+exclusivo)\b/i,
	countdown:
		/<[^>]*(?:class|id)\s*=\s*["'][^"']*\b(countdown|timer|count-?down|deal-?timer|offer-?ends?|tempo-restante|contador)\b/i,
	loteScarcity:
		/\b(?:lote\s+(?:\d+|n[º°]?\s*\d+)|últimas?\s+vagas|vagas\s+limitadas|últimos?\s+\d+\s+(?:lugar(?:es)?|vagas?))\b/i,
	urgencyCopy:
		/\b(?:últimas?\s+horas|termina\s+(?:hoje|amanhã|em\s+\d+)|inscrições?\s+(?:até|encerram?|fecham?))\b/i,
	faqSection:
		/<[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:faq|perguntas-frequentes|perguntas-respostas)\b/i,
	paraQuemSection:
		/\bpara\s+quem\s+(?:é|n[ãa]o\s+é|esse|este|este\s+curso|este\s+programa)\b/i,
	whatsapp: /(wa\.me\/\d+|api\.whatsapp\.com\/send)/i,
	chat: /(intercom|crisp(?:chat)?|drift\.com|tawk\.to|hs-cta|hubspot.+messages|zdassets|tidio\.co|smartsupp|chatwoot|jivochat|octadesk)/i,
	ptBrMarkers:
		/\b(?:curso|garantia|aulas?|módulo|alunos?|inscri[çc][ãa]o|conteúdo|aprenda|saiba\s+mais)\b/i,
	brlPricing: /R\$\s*\d/i,
	// Buy CTA — counts occurrences of phrases that indicate
	// commercial action (used to detect "multiple buy CTAs" pattern).
	buyCtaCounter:
		/\b(?:quero\s+(?:me\s+inscrever|entrar|comprar|garantir)|comprar\s+agora|inscrever-se|fazer\s+(?:minha\s+)?inscri[çc][ãa]o|garantir\s+(?:minha\s+)?vaga|enroll|sign\s+up\s+now)\b/gi,
};

function detectSiteSignals(url: string, html: string, statusCode: number): SiteSignals {
	const buyCtaMatches = html.match(RX.buyCtaCounter) || [];
	const htmlSizeKb = Math.round(html.length / 1024);
	return {
		url,
		status: "ok",
		statusCode,
		hasHotmartCheckout: RX.hotmartCheckout.test(html),
		hasEduzzCheckout: RX.eduzzCheckout.test(html),
		hasKiwifyCheckout: RX.kiwifyCheckout.test(html),
		hasMonetizzeCheckout: RX.monetizzeCheckout.test(html),
		hasPixMention: RX.pix.test(html),
		hasVSL: RX.vslAutoplay.test(html),
		hasInstallmentVisible: RX.installment.test(html),
		hasMultipleBuyCtas: buyCtaMatches.length >= 3,
		hasGarantiaXDias: RX.garantia.test(html),
		hasDepoimentos: RX.depoimentos.test(html),
		hasBonusSection: RX.bonusSection.test(html),
		hasCountdownTimer: RX.countdown.test(html),
		hasLoteScarcity: RX.loteScarcity.test(html),
		hasUrgencyCopy: RX.urgencyCopy.test(html),
		hasFaqSection: RX.faqSection.test(html),
		hasParaQuemSection: RX.paraQuemSection.test(html),
		hasLongFormSales: htmlSizeKb >= 100, // proxy for long-form sales letter
		hasWhatsappContact: RX.whatsapp.test(html),
		hasChatWidget: RX.chat.test(html),
		isPortugueseSite: RX.ptBrMarkers.test(html),
		hasBrlPricing: RX.brlPricing.test(html),
		buyCtaCount: buyCtaMatches.length,
		htmlSizeKb,
	};
}

const CONCURRENCY = 3;
const INTER_BATCH_DELAY_MS = 1000;

async function scanOne(url: string): Promise<SiteSignals> {
	const emptySignals: Omit<SiteSignals, "url" | "status" | "fetchError" | "statusCode"> = {
		hasHotmartCheckout: false,
		hasEduzzCheckout: false,
		hasKiwifyCheckout: false,
		hasMonetizzeCheckout: false,
		hasPixMention: false,
		hasVSL: false,
		hasInstallmentVisible: false,
		hasMultipleBuyCtas: false,
		hasGarantiaXDias: false,
		hasDepoimentos: false,
		hasBonusSection: false,
		hasCountdownTimer: false,
		hasLoteScarcity: false,
		hasUrgencyCopy: false,
		hasFaqSection: false,
		hasParaQuemSection: false,
		hasLongFormSales: false,
		hasWhatsappContact: false,
		hasChatWidget: false,
		isPortugueseSite: false,
		hasBrlPricing: false,
		buyCtaCount: 0,
		htmlSizeKb: 0,
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

interface CohortAggregateInfo {
	vertical: string;
	period: string;
	scannedAt: string;
	urlsTotal: number;
	urlsScanned: number;
	urlsSucceeded: number;
	urlsFailed: number;
	prevalence: Record<string, number>;
	averages: Record<string, number>;
	sites: SiteSignals[];
}

function aggregate(
	results: SiteSignals[],
	vertical: string,
	period: string,
): CohortAggregateInfo {
	const ok = results.filter((r) => r.status === "ok");
	const denom = ok.length || 1;
	const sumBool = (key: keyof SiteSignals) =>
		ok.filter((r) => (r[key] as boolean) === true).length;
	const avgNum = (key: keyof SiteSignals) =>
		ok.reduce((acc, r) => acc + (r[key] as number), 0) / denom;
	return {
		vertical,
		period,
		scannedAt: new Date("2026-06-24").toISOString().slice(0, 10),
		urlsTotal: results.length,
		urlsScanned: results.length,
		urlsSucceeded: ok.length,
		urlsFailed: results.length - ok.length,
		prevalence: {
			hotmartCheckout: sumBool("hasHotmartCheckout") / denom,
			eduzzCheckout: sumBool("hasEduzzCheckout") / denom,
			kiwifyCheckout: sumBool("hasKiwifyCheckout") / denom,
			monetizzeCheckout: sumBool("hasMonetizzeCheckout") / denom,
			pixMention: sumBool("hasPixMention") / denom,
			vsl: sumBool("hasVSL") / denom,
			installmentVisible: sumBool("hasInstallmentVisible") / denom,
			multipleBuyCtas: sumBool("hasMultipleBuyCtas") / denom,
			garantiaXDias: sumBool("hasGarantiaXDias") / denom,
			depoimentos: sumBool("hasDepoimentos") / denom,
			bonusSection: sumBool("hasBonusSection") / denom,
			countdownTimer: sumBool("hasCountdownTimer") / denom,
			loteScarcity: sumBool("hasLoteScarcity") / denom,
			urgencyCopy: sumBool("hasUrgencyCopy") / denom,
			faqSection: sumBool("hasFaqSection") / denom,
			paraQuemSection: sumBool("hasParaQuemSection") / denom,
			longFormSales: sumBool("hasLongFormSales") / denom,
			whatsappContact: sumBool("hasWhatsappContact") / denom,
			chatWidget: sumBool("hasChatWidget") / denom,
			isPortugueseSite: sumBool("isPortugueseSite") / denom,
			brlPricing: sumBool("hasBrlPricing") / denom,
		},
		averages: {
			buyCtaCount: Math.round(avgNum("buyCtaCount") * 10) / 10,
			htmlSizeKb: Math.round(avgNum("htmlSizeKb")),
		},
		sites: results,
	};
}

function writeCohortDataset(aggregate: CohortAggregateInfo) {
	const outDir = join(process.cwd(), "src/data/vestigio-index/cohorts");
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	const slug = `${aggregate.vertical}-${aggregate.period}`;
	const outFile = join(outDir, `${slug}.ts`);
	const constName = `COHORT_${aggregate.vertical.replace(/-/g, "_").toUpperCase()}_${aggregate.period.replace(/-/g, "_")}`;
	const body = `// ──────────────────────────────────────────────
// Vestigio Index cohort dataset — ${aggregate.vertical} ${aggregate.period}
//
// Generated by scripts/seed-vestigio-index-cohort-infoprodutos.ts
// on ${aggregate.scannedAt}. Refresh annually if the editor wants
// new numbers. Backs the numerical claims in the infoprodutos
// edition essay.
// ──────────────────────────────────────────────

import type { CohortAggregate } from "../cohort-types";

export const ${constName}: CohortAggregate = ${JSON.stringify(aggregate, null, "\t")};
`;
	writeFileSync(outFile, body, "utf-8");
	console.log(`\nWrote ${outFile}`);
}

async function main() {
	const vertical = "infoprodutos";
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
	console.log("\nAverages:");
	for (const [k, v] of Object.entries(agg.averages)) {
		console.log(`  ${k.padEnd(28)} ${v}`);
	}
	writeCohortDataset(agg);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
