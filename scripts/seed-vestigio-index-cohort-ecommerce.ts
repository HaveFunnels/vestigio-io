// ──────────────────────────────────────────────
// Vestigio Index — one-shot cohort scan (Ecommerce / D2C BR)
//
// Runs heuristic detection against ~25 publicly-accessible BR
// D2C/ecommerce homepages and writes the aggregated results to
// src/data/vestigio-index/cohorts/ecommerce-<period>.ts so the
// edition essay can cite real prevalence numbers.
//
// Per user direction: this is a ONE-SHOT script, not a recurring
// pipeline. Run once to back the launch edition; refresh annually
// (or whenever the editor wants new numbers). No DB persistence,
// no LLM calls — pure regex/DOM detection on top of the same
// patterns used by computeAboveFoldDensityHeuristic.
//
// Usage:
//   npx tsx scripts/seed-vestigio-index-cohort-ecommerce.ts
//
// Costs nothing — no LLM, only N HTTP requests. Concurrency cap +
// inter-batch delay keep us polite to the target sites.
// ──────────────────────────────────────────────

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { httpFetch } from "../workers/ingestion/http-client";

// 25 real BR D2C / ecommerce brands across fashion, beauty,
// supplementation, home, food. Mix of mid-sized D2C (~R$100k–R$2M
// mensal range, the essay's framing) and larger brands — the
// heuristic patterns (fake urgency, cookie consent, chat widgets,
// CTAs above the fold) generalize across revenue tiers.
const COHORT_URLS: string[] = [
	// Fashion / D2C
	"https://www.usereserva.com",
	"https://www.farmrio.com.br",
	"https://www.animale.com.br",
	"https://www.tf.com.br",
	"https://www.insiderstore.com.br",
	"https://www.anacapri.com.br",
	// Beauty
	"https://www.granado.com.br",
	"https://www.quemdisseberenice.com.br",
	"https://www.eudora.com.br",
	"https://www.boticario.com.br",
	"https://www.vichy.com.br",
	// Supplementation
	"https://www.gsuplementos.com.br",
	"https://www.integralmedica.com.br",
	"https://www.probiotica.com.br",
	"https://www.blackskullusa.com.br",
	// Home / Decor
	"https://www.tokstok.com.br",
	"https://www.mobly.com.br",
	"https://www.madeiramadeira.com.br",
	"https://www.westwing.com.br",
	// Misc D2C / lifestyle / food
	"https://www.livup.com.br",
	"https://www.korin.com.br",
	"https://www.useskin.com.br",
	"https://www.olympikus.com.br",
	"https://www.vivara.com.br",
	"https://www.centauro.com.br",
];

// ── Detection patterns ─────────────────────────

interface SiteSignals {
	url: string;
	status: "ok" | "fetch_error" | "timeout";
	statusCode?: number;
	fetchError?: string;
	// Boolean detections (true = present)
	hasCountdownTimer: boolean;
	hasFakeScarcity: boolean;
	hasViewingCounter: boolean;
	hasCookieBanner: boolean;
	hasChatWidget: boolean;
	hasAutoplayVideo: boolean;
	hasH1: boolean;
	hasPixMention: boolean;
	hasWhatsappContact: boolean;
	// Counted signals
	aboveFoldCtaCount: number;
	totalFormFields: number;
}

const RX = {
	// Countdown timer — class/id markers OR runtime libs commonly
	// used (timer.js patterns, deal timers from CartPanda/Yampi/
	// Loja Integrada). Strict regex; false positives are low.
	countdown:
		/<[^>]*(?:class|id)\s*=\s*["'][^"']*\b(countdown|timer|count-?down|deal-?timer|offer-?ends?|tempo-restante|contador)\b/i,
	// Fake scarcity — "apenas X" / "restam X" / "últimas X
	// unidades" patterns. Bracketing nearby text catches stock-
	// remaining indicators.
	scarcity:
		/\b(apenas|restam|últim[oa]s?|stock\s+limitado|estoque\s+(?:baixo|limitado))\b[^<]{0,40}\b\d+\b/i,
	// Live-viewing fake counter — "X pessoas vendo" / "X people
	// viewing". Specific phrasing patterns from social-proof
	// libraries (BravePop, Fomo, etc.).
	viewing:
		/\b\d+\s+(?:pessoas?|customers?|visitors?|usuários?|clientes?|pessoas?\s+est[ãa]o)\s+(?:vendo|visualizando|olhando|viewing|looking)\b/i,
	// Cookie/GDPR/consent banner — class/id markers plus common
	// vendor libs (OneTrust, Cookiebot, LGPD-specific).
	cookie:
		/<[^>]*(?:class|id)\s*=\s*["'][^"']*\b(cookie|gdpr|lgpd|consent|onetrust|cookiebot|cookieyes)\b/i,
	// Chat widget — vendor signatures.
	chat: /(intercom|crisp(?:chat)?|drift\.com|tawk\.to|hs-cta|hubspot.+messages|zdassets|tidio\.co|smartsupp|chatwoot|jivochat|octadesk)/i,
	// Autoplay video.
	autoplayVideo: /<video[^>]+\bautoplay\b/i,
	// H1 with body.
	h1: /<h1[^>]*>([\s\S]*?)<\/h1>/i,
	// PIX mention (BR payment surface signal — the essay's central
	// thesis hinges on this).
	pixMention: /\bpix\b/i,
	// WhatsApp contact button — class/id markers OR wa.me links.
	whatsapp: /(wa\.me\/\d+|whatsapp|<[^>]*class\s*=\s*["'][^"']*\bwhats?app\b)/i,
};

function stripTagsForCount(html: string): number {
	// Count <button> + <a class="...btn..."> patterns in the first
	// 3500 chars of HTML, mirroring the above_fold_density heuristic
	// already in the codebase. Same definition keeps cohort numbers
	// comparable to per-cycle findings.
	const aboveFold = html.slice(0, 3500);
	const btn = (aboveFold.match(/<button[\s>]/gi) || []).length;
	const anchorBtn =
		(aboveFold.match(
			/<a[^>]*(?:class\s*=\s*["'][^"']*\b(?:btn|button|cta|primary-action|signup|signin|get-started|comprar|buy|add-to-cart|adicionar)\b|role\s*=\s*["']button["'])/gi,
		) || []).length;
	return btn + anchorBtn;
}

function countFormFields(html: string): number {
	// Total <input>/<textarea>/<select> count — proxy for friction
	// at signup/checkout entry. Excludes type=hidden.
	const inputs = (html.match(/<input\b(?![^>]*type\s*=\s*["']hidden["'])/gi) || [])
		.length;
	const textareas = (html.match(/<textarea\b/gi) || []).length;
	const selects = (html.match(/<select\b/gi) || []).length;
	return inputs + textareas + selects;
}

function detectSiteSignals(url: string, html: string, statusCode: number): SiteSignals {
	const h1Match = RX.h1.exec(html);
	const h1Text = h1Match ? h1Match[1].replace(/<[^>]*>/g, "").trim() : "";
	return {
		url,
		status: "ok",
		statusCode,
		hasCountdownTimer: RX.countdown.test(html),
		hasFakeScarcity: RX.scarcity.test(html),
		hasViewingCounter: RX.viewing.test(html),
		hasCookieBanner: RX.cookie.test(html),
		hasChatWidget: RX.chat.test(html),
		hasAutoplayVideo: RX.autoplayVideo.test(html),
		hasH1: h1Text.length >= 5,
		hasPixMention: RX.pixMention.test(html),
		hasWhatsappContact: RX.whatsapp.test(html),
		aboveFoldCtaCount: stripTagsForCount(html),
		totalFormFields: countFormFields(html),
	};
}

// ── Concurrency + scan loop ────────────────────

const CONCURRENCY = 3;
const INTER_BATCH_DELAY_MS = 1000;

async function scanOne(url: string): Promise<SiteSignals> {
	try {
		const res = await httpFetch(url);
		if (res.status_code >= 400) {
			return {
				url,
				status: "fetch_error",
				statusCode: res.status_code,
				fetchError: `HTTP ${res.status_code}`,
				hasCountdownTimer: false,
				hasFakeScarcity: false,
				hasViewingCounter: false,
				hasCookieBanner: false,
				hasChatWidget: false,
				hasAutoplayVideo: false,
				hasH1: false,
				hasPixMention: false,
				hasWhatsappContact: false,
				aboveFoldCtaCount: 0,
				totalFormFields: 0,
			};
		}
		return detectSiteSignals(url, res.body, res.status_code);
	} catch (err) {
		return {
			url,
			status: "fetch_error",
			fetchError: err instanceof Error ? err.message : String(err),
			hasCountdownTimer: false,
			hasFakeScarcity: false,
			hasViewingCounter: false,
			hasCookieBanner: false,
			hasChatWidget: false,
			hasAutoplayVideo: false,
			hasH1: false,
			hasPixMention: false,
			hasWhatsappContact: false,
			aboveFoldCtaCount: 0,
			totalFormFields: 0,
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

interface CohortAggregate {
	vertical: string;
	period: string;
	scannedAt: string;
	urlsTotal: number;
	urlsScanned: number;
	urlsSucceeded: number;
	urlsFailed: number;
	prevalence: {
		countdownTimer: number;
		fakeScarcity: number;
		viewingCounter: number;
		cookieBanner: number;
		chatWidget: number;
		autoplayVideo: number;
		visibleH1: number;
		pixMention: number;
		whatsappContact: number;
	};
	averages: {
		aboveFoldCtaCount: number;
		totalFormFields: number;
	};
	sites: SiteSignals[];
}

function aggregate(
	results: SiteSignals[],
	vertical: string,
	period: string,
): CohortAggregate {
	const ok = results.filter((r) => r.status === "ok");
	const denom = ok.length || 1;
	const sumBool = (key: keyof SiteSignals) =>
		ok.filter((r) => (r[key] as boolean) === true).length;
	const avg = (key: keyof SiteSignals) =>
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
			countdownTimer: sumBool("hasCountdownTimer") / denom,
			fakeScarcity: sumBool("hasFakeScarcity") / denom,
			viewingCounter: sumBool("hasViewingCounter") / denom,
			cookieBanner: sumBool("hasCookieBanner") / denom,
			chatWidget: sumBool("hasChatWidget") / denom,
			autoplayVideo: sumBool("hasAutoplayVideo") / denom,
			visibleH1: sumBool("hasH1") / denom,
			pixMention: sumBool("hasPixMention") / denom,
			whatsappContact: sumBool("hasWhatsappContact") / denom,
		},
		averages: {
			aboveFoldCtaCount: Math.round(avg("aboveFoldCtaCount") * 10) / 10,
			totalFormFields: Math.round(avg("totalFormFields") * 10) / 10,
		},
		sites: results,
	};
}

// ── Output ─────────────────────────────────────

function writeCohortDataset(aggregate: CohortAggregate) {
	const outDir = join(process.cwd(), "src/data/vestigio-index/cohorts");
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	const slug = `${aggregate.vertical}-${aggregate.period}`;
	const outFile = join(outDir, `${slug}.ts`);
	const body = `// ──────────────────────────────────────────────
// Vestigio Index cohort dataset — ${aggregate.vertical} ${aggregate.period}
//
// Generated by scripts/seed-vestigio-index-cohort-ecommerce.ts on
// ${aggregate.scannedAt}. Run that script again (manually, no
// schedule) to refresh; results are otherwise stable. Backs the
// numerical claims in the edition essay; can also feed benchmark
// cards inside the authenticated Plano once that wiring lands.
// ──────────────────────────────────────────────

import type { CohortAggregate } from "../cohort-types";

export const COHORT_${aggregate.vertical.replace(/-/g, "_").toUpperCase()}_${aggregate.period.replace(/-/g, "_")}: CohortAggregate = ${JSON.stringify(aggregate, null, "\t")};
`;
	writeFileSync(outFile, body, "utf-8");
	console.log(`\nWrote ${outFile}`);
}

// ── Main ───────────────────────────────────────

async function main() {
	const vertical = "ecommerce";
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
		console.log(`  ${k.padEnd(20)} ${(v * 100).toFixed(0)}% (${Math.round(v * agg.urlsSucceeded)}/${agg.urlsSucceeded})`);
	}
	console.log("\nAverages:");
	for (const [k, v] of Object.entries(agg.averages)) {
		console.log(`  ${k.padEnd(20)} ${v}`);
	}

	writeCohortDataset(agg);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
