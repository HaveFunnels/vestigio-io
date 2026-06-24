// ──────────────────────────────────────────────
// BR D2C inferences — detectors backed by the 18-site cohort scan
// in src/data/vestigio-index/cohorts/ecommerce-2026-06.ts.
//
// These were absent from the engine until 2026-06-24 when the
// cohort scan revealed the actual BR ecommerce reality: PIX and
// WhatsApp are the dominant infrastructure (61% and 72% prevalence
// respectively), with their cross-channel analytics layer
// effectively zero. None of those signals were being detected.
//
// Each detector here:
//   - Reads PageContent evidence for the patterns it cares about
//   - Returns 0 or 1 inferences (no per-page fanout — Plano-level
//     vertical findings)
//   - Is dispatched ONLY when env_locale='pt-BR' + vertical
//     includes 'ecommerce' (see vertical-inference.ts wiring)
//
// The cohort prevalence gates whether ABSENCE is meaningful:
//   - PIX discount not visible: high-confidence finding when PIX
//     is mentioned but no discount is signaled (44% of BR cohort
//     show discount; gap is the leak).
//   - WhatsApp attribution missing: high-confidence finding when
//     wa.me links exist but carry no UTM/tracking — true for ~100%
//     of cohort (nobody measures WA-driven revenue).
//   - WhatsApp personal-number weakness: medium-confidence when WA
//     is present and the number pattern looks like a personal cell
//     instead of a Business API endpoint.
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

function joinPageBodies(evidence: readonly Evidence[]): string {
	const pages = getPageContentEvidence(evidence);
	const parts: string[] = [];
	for (const e of pages) {
		const p = e.payload as {
			body_text_snippet?: string | null;
			body_text?: string | null;
			h1?: string | null;
			title?: string | null;
		};
		if (p.body_text_snippet) parts.push(p.body_text_snippet);
		if (p.body_text) parts.push(p.body_text);
		if (p.h1) parts.push(p.h1);
		if (p.title) parts.push(p.title);
	}
	return parts.join("\n").toLowerCase();
}

function stripTagsLocal(s: string): string {
	return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function joinPageRawHtml(evidence: readonly Evidence[]): string {
	// Some signals (WhatsApp wa.me links, UTM params, button class
	// markers) live in raw HTML rather than extracted text. When the
	// pipeline captured raw HTML in the page payload, we read it
	// here. Falls back gracefully when payloads only have text.
	const pages = getPageContentEvidence(evidence);
	const parts: string[] = [];
	for (const e of pages) {
		const p = e.payload as { raw_html?: string | null; body?: string | null };
		if (p.raw_html) parts.push(p.raw_html);
		if (p.body) parts.push(p.body);
	}
	return parts.join("\n");
}

// ── 1. PIX discount visibility ───────────────────

/**
 * Fires when the site mentions PIX explicitly but does NOT signal a
 * discount associated with it.
 *
 * Cohort data (ecommerce 2026-06): 61% of BR D2C sites mention PIX;
 * only 44% show a discount. The 17% gap is the leak — those sites
 * either:
 *   (a) accept PIX and pocket the gateway savings without
 *       converting it into a purchase incentive (margin neutral but
 *       missing conversion lever);
 *   (b) accept PIX silently with no above-fold callout (buyer
 *       discovers it only at checkout, no decision-stage benefit).
 *
 * Either way, the lever is the same: surface the PIX discount above
 * the fold (typical: 5-12% off). Concrete revenue impact per site
 * depends on PIX adoption %, but a 5-7% conversion bump in the PIX-
 * elegible cohort is the standard win.
 */
export function inferPixDiscountNotVisible(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	corpus: string,
): Inference[] {
	// Detect PIX mention — absence = nothing to optimize, skip.
	if (!/\bpix\b/i.test(corpus)) return [];
	// Detect explicit discount: "X% off PIX", "PIX X% off",
	// "desconto PIX", "PIX com desconto", "X% no PIX".
	const discountPatterns = [
		/\bpix\b[^.]{0,40}\b\d{1,2}\s*%\b/i,
		/\b\d{1,2}\s*%\b[^.]{0,40}\bpix\b/i,
		/\bdesconto[^.]{0,20}\bpix\b/i,
		/\bpix[^.]{0,20}\bdesconto\b/i,
		/\bpix\s+(?:com|sem|à\s+vista|com\s+desconto)/i,
	];
	const html = joinPageRawHtml(evidence);
	const fullCorpus = `${corpus}\n${html.toLowerCase()}`;
	for (const rx of discountPatterns) {
		if (rx.test(fullCorpus)) return []; // Discount visible — nothing to fire
	}
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"pix_discount_not_visible",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"high",
			76,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"PIX é mencionado mas sem desconto visível. Você está absorvendo a economia do gateway (2-3% que cartão cobra) sem converter isso em alavanca de conversão. Sites D2C BR que sinalizam '5-10% off no PIX' acima da dobra convertem ~5-7% mais nessa faixa de público que pagaria PIX de qualquer jeito. Sem o callout, o comprador descobre só no checkout — tarde demais pra mover a decisão.",
		),
	];
}

// ── 2. WhatsApp attribution tracking gap ─────────

/**
 * Fires when wa.me links exist on the site but carry no UTM
 * parameters or tracking query string.
 *
 * Cohort data (ecommerce 2026-06): 72% of BR D2C sites expose
 * WhatsApp contact. Of those, virtually none include UTM tracking
 * on the wa.me URL — meaning revenue attribution to WhatsApp is
 * effectively impossible. Founders don't know if they're earning
 * 5% or 40% of revenue via WhatsApp, which compromises every
 * channel-mix decision.
 *
 * The fix is mechanical: add `?utm_source=site&utm_medium=whatsapp`
 * to every wa.me link, plus a click handler that pings the
 * analytics endpoint with the source surface. ~30 min of dev.
 */
export function inferWhatsappAttributionMissing(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	// Find wa.me links — Brazilian site convention is wa.me/<number>
	// or api.whatsapp.com/send?phone=<number>.
	const waLinkRegex =
		/(?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^\s"'<>]+/gi;
	const waLinks = html.match(waLinkRegex) || [];
	if (waLinks.length === 0) return [];
	// Check whether ANY of the wa.me links carry UTM-style tracking.
	const trackedLink = waLinks.find(
		(link) =>
			/utm_source=/i.test(link) ||
			/utm_medium=/i.test(link) ||
			/\bref=/i.test(link) ||
			/\bsource=/i.test(link),
	);
	if (trackedLink) return [];
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"whatsapp_attribution_missing",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"high",
			80,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Você tem WhatsApp como canal de venda mas zero rastreamento. As URLs wa.me não carregam UTM, então as vendas que entram via WhatsApp aparecem como 'orgânico' ou 'direto' no analytics. Resultado: você não sabe se 5% ou 40% da sua receita vem do WhatsApp, e qualquer decisão de budget de canal vira chute. Fix é mecânico — adicionar ?utm_source=site&utm_medium=whatsapp em cada link wa.me + um ping de evento no clique. ~30min de dev.",
		),
	];
}

// ── 3. WhatsApp personal-number SLA risk ─────────

/**
 * Fires when the WhatsApp number on the site looks like a personal
 * cellphone rather than a WhatsApp Business API endpoint.
 *
 * Heuristic — purely number-pattern + page-context based:
 *   - BR personal cells use +55<DDD>9XXXXYYYY format (9 prefix on
 *     the local number, post-2012 mandatory)
 *   - WhatsApp Business API endpoints typically don't expose the
 *     raw number on the site (the merchant uses a wa.me/<number>
 *     but the number is registered with Meta as a Business asset)
 *   - The differentiator is operational: Business has SLA,
 *     read-receipts, broadcast lists, catalogs, and message
 *     templates — pre-approved transactional flows. Personal
 *     numbers have none of that.
 *
 * Lower confidence than the other two BR detectors (60 vs 76/80)
 * because the heuristic can't directly verify Meta's Business API
 * registration — we infer from the pattern. The finding still
 * surfaces a real conversation-quality risk for the founder to
 * verify.
 */
export function inferWhatsappPersonalNumberWeak(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	// Extract wa.me numbers — Brazilian conventional format is
	// 55<DDD><9-prefix><8-digit>.
	const waNumberMatches = [
		...html.matchAll(/wa\.me\/(\d{10,15})/gi),
		...html.matchAll(/api\.whatsapp\.com\/send\?phone=(\d{10,15})/gi),
	];
	if (waNumberMatches.length === 0) return [];
	// Inspect the first wa.me number. If it starts with 55 (BR
	// country code) and has the 11-digit local-area format, classify
	// the 9-prefix presence as personal-cell signal.
	const first = waNumberMatches[0][1];
	const isBrNumber = first.startsWith("55") && first.length >= 12;
	if (!isBrNumber) return []; // can't classify, don't fire
	// Skip the 55-country-code, inspect the rest.
	const local = first.slice(2);
	// 11-digit BR mobile: 2-digit DDD + 9-prefix + 8 digits.
	const isMobilePersonal = local.length === 11 && local[2] === "9";
	if (!isMobilePersonal) return [];
	// Check whether the site mentions Business API indicators (these
	// would suggest Meta-registered, not personal).
	const businessApiHints =
		/(whatsapp\s*business|business\s*api|catálogo|cardápio\s*online|atendimento\s*automatizado|chatbot\s*whatsapp)/i;
	if (businessApiHints.test(html)) return [];
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"whatsapp_personal_number_no_sla",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"medium",
			60,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"O número de WhatsApp no site parece ser um celular pessoal (formato 55<DDD>9XXXX-XXXX) sem indicadores de WhatsApp Business API. Em prática isso significa: zero SLA garantido, zero read-receipts confiáveis, zero broadcast lists, zero catálogo, zero templates pré-aprovados pra fluxos transacionais. Um lead que chega às 23h não tem confirmação até manhã seguinte. Migrar pra Business API (gratuito até 1k conversas/mês) destrava esses operacionais e abre a integração com Meta Ads / catalogo / commerce — vale verificar.",
		),
	];
}

// ── 4. Parcelamento (installments) not visible ───────

/**
 * Fires when the site doesn't surface parcelamento ("X vezes sem
 * juros") anywhere — homepage, product, cart, checkout.
 *
 * Why this is BR-specific: installments without interest are
 * institutional in the BR retail decision. The default expectation
 * for any purchase above ~R$ 150 is "posso parcelar em 10x sem
 * juros?". A site that doesn't show this above the fold loses the
 * 30-40% of buyers who can't or won't pay upfront. This is
 * culturally distinct from the US (parcelamento essentially doesn't
 * exist there) and from the EU (BNPL is rising but doesn't have
 * the same default-expectation status).
 *
 * The detector is permissive on the format because the language
 * varies — "12x sem juros", "10x s/ juros", "parcele em 6x",
 * "parcelado em até 12x", "interest-free 10x". All count. Only
 * fires when NONE of those appear.
 */
export function inferInstallmentNotVisible(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	const fullCorpus = `${corpus}\n${html.toLowerCase()}`;
	// Direct installment patterns — covers PT-BR and the occasional EN
	// translation. \d{1,2}x catches "1x" through "99x" (typical retail
	// range 1-18x).
	const installmentPatterns = [
		/\b\d{1,2}\s*x\s*(?:de\s+r\$[\d.,]+\s+)?(?:sem\s+juros|s\/?\s*juros|sem\s+acréscimo|interest[\s-]?free)\b/i,
		/\bparcele(?:\s+em)?(?:\s+até)?\s+\d{1,2}\s*x/i,
		/\bparcelado\s+em\s+\d{1,2}\s*x/i,
		/\bparcelamento\s+em\s+(?:até\s+)?\d{1,2}\s*x/i,
		/\bem\s+até\s+\d{1,2}\s*x\s+(?:sem\s+juros|s\/?\s*juros)/i,
		// Just "Xx sem juros" anywhere — looser fallback for catalog/
		// product-grid tiles that often print the parcelamento line
		// without the leading "em" or "parcele".
		/\b\d{1,2}\s*x\s+sem\s+juros\b/i,
	];
	for (const rx of installmentPatterns) {
		if (rx.test(fullCorpus)) return []; // Parcelamento visible — no finding.
	}
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"installment_not_visible",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"high",
			78,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Você não mostra parcelamento sem juros em nenhuma página. No varejo BR, '10x sem juros' é expectativa default acima de R$ 150 — quem não pode pagar à vista (~30-40% do público D2C) abandona antes de chegar no checkout. O fix é exibir o badge '12x sem juros' (ou o que sua máquina aceita) acima da dobra na home + página do produto + carrinho. Custo de implementação: ~2h. Impacto típico: conversão sobe 3-7% na faixa do comprador que precisa parcelar.",
		),
	];
}

// ── 5. WhatsApp buried in footer (position signal) ───

/**
 * Fires when wa.me links exist on the site BUT only appear in the
 * footer area (last 30% of the page HTML) and no floating /
 * sticky-positioned button is detected.
 *
 * Cohort data (ecommerce 2026-06): 72% of BR D2C have WhatsApp.
 * The /position/ of that contact matters: a floating button or
 * above-fold CTA converts an order of magnitude better than a
 * link buried in the footer. Sites with only-footer WhatsApp
 * are leaving the channel underused — the comprador discovers it
 * only after a full scroll, by which point most have left.
 *
 * Detection is positional + presence-of-floating heuristics; not
 * perfect, but the false-positive case (floating button uses
 * non-standard CSS markers) just means the finding doesn't fire —
 * never a false-positive fire.
 */
export function inferWhatsappBuriedInFooter(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	const waLinkRegex =
		/(?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^\s"'<>]+/gi;
	const matches = [...html.matchAll(waLinkRegex)];
	if (matches.length === 0) return [];

	// Heuristic 1 — floating / sticky-positioned button present?
	// Common patterns: class with "fixed"/"sticky"/"floating"/"float"
	// near a wa.me reference, OR Brazilian-specific class names like
	// "whatsapp-button" "btn-whatsapp" "wa-float" used by plugins.
	const floatingPatterns = [
		/<[^>]*class\s*=\s*["'][^"']*\b(?:fixed|sticky|floating|float)\b[^"']*["'][^>]*(?:wa\.me|whatsapp)/i,
		/<[^>]*(?:wa\.me|whatsapp)[^>]*class\s*=\s*["'][^"']*\b(?:fixed|sticky|floating|float)\b/i,
		/<[^>]*class\s*=\s*["'][^"']*\b(?:whatsapp-(?:button|btn|float)|wa-(?:float|button|btn|fab)|btn-whatsapp|fab-whatsapp)\b/i,
	];
	if (floatingPatterns.some((rx) => rx.test(html))) return [];

	// Heuristic 2 — position of wa.me links in the HTML. If ALL
	// occurrences land in the last 30% of the document, treat as
	// footer-only.
	const footerThreshold = Math.floor(html.length * 0.7);
	const allInFooter = matches.every((m) => (m.index ?? 0) >= footerThreshold);
	if (!allInFooter) return [];

	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"whatsapp_buried_in_footer",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"medium",
			68,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Você tem WhatsApp no site, mas o link só aparece no rodapé — sem botão flutuante, sem CTA acima da dobra. O comprador BR que precisa de atendimento antes de comprar precisa rolar a página inteira pra encontrar. Floating button (Intercom-style, canto inferior direito) converte ordem de magnitude melhor — destrava lead que sai por dúvida não respondida. Custo: ~1h de dev (plugin pronto pra Shopify/WooCommerce/Nuvemshop).",
		),
	];
}

// ── 6. Reviews present but low specificity ─────

/**
 * Fires when a review widget is present on the site but the
 * server-rendered review text averages < 12 words per review.
 * Short reviews ("Amei!", "Produto bom", "5 estrelas sem palavras")
 * are social proof on paper but don't move conversion — specific
 * reviews ("Sou tamanho M, o caimento ficou solto na cintura, devolvi
 * e troquei pelo P") move it 2-3x more.
 *
 * Detection strategy is conservative — only fires when:
 *   1. A known review widget signature is present (TrustVox,
 *      Yourviews, Judge.me, Stamped, native rating markers)
 *   2. Review text IS extractable from the static HTML (the widget
 *      SSRs at least a snippet); skip when widget is purely
 *      JS-loaded async — we can't measure what we can't see, and
 *      a false-positive "your reviews are bad" is worse than a
 *      missed finding
 *   3. The average snippet length across detected reviews is below
 *      the threshold
 *
 * Confidence is 62 (medium) because we sample whatever the static
 * HTML exposes, which underestimates total reviews. We surface the
 * pattern for the founder to verify rather than declare it
 * definitive.
 */
export function inferReviewsLowSpecificity(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	const widgetSignatures =
		/(trustvox|yourviews|judge\.me|judgeme|stamped\.io|reviewsdotio|loox|okendo|reviewbit|opinew|riberry|reclameaqui)/i;
	if (!widgetSignatures.test(html)) return [];
	// Try to extract review snippets — common containers + microdata.
	// We deliberately read a small window per match to avoid pulling
	// in unrelated copy (nav text, etc).
	const reviewSnippets: string[] = [];
	// Schema.org microdata Review.
	for (const m of html.matchAll(
		/<[^>]+itemtype\s*=\s*["'][^"']*Review["'][^>]*>([\s\S]{0,800}?)<\/[^>]+>/gi,
	)) {
		reviewSnippets.push(m[1]);
	}
	// Class-based containers: class*=review, class*=avaliacao,
	// class*=comment, class*=testimonial.
	for (const m of html.matchAll(
		/<[^>]+class\s*=\s*["'][^"']*\b(?:review[\w-]*|avaliacao|comentario|testimonial)\b[^"']*["'][^>]*>([\s\S]{0,500}?)<\/[^>]+>/gi,
	)) {
		reviewSnippets.push(m[1]);
	}
	if (reviewSnippets.length < 3) return []; // Not enough sample to judge.
	const words = reviewSnippets.map((snippet) =>
		stripTagsLocal(snippet)
			.split(/\s+/)
			.filter((w) => w.length > 1).length,
	);
	const avg = words.reduce((acc, n) => acc + n, 0) / words.length;
	if (avg >= 12) return []; // Reviews are specific enough.
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"reviews_low_specificity",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"medium",
			62,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			`Você tem widget de reviews instalado mas a média das avaliações é ~${Math.round(avg)} palavras por review. Reviews curtas ("Amei!", "5 estrelas") são prova social no papel mas não movem conversão — comprador BR responde a especificidade ("sou tamanho M, manga ficou 2cm maior"), não a contagem. Configure prompts pós-compra que pedem detalhes específicos (tamanho, uso, comparação) — TrustVox/Yourviews/Judge.me têm templates. Eleva tempo de leitura na página de produto e tira dúvidas que hoje viram abandono.`,
		),
	];
}

// ── 7. Customer photos absent from reviews ─────

/**
 * Fires when a review widget is present but no customer-uploaded
 * images appear in the review containers. UGC photos crush stock
 * photos for trust signal — comprador BR confia em "essa pessoa
 * comprou e mostrou o produto" muito mais que na foto profissional
 * do catálogo.
 *
 * Detection: widget signature + look for <img> tags inside review
 * containers. If zero images found, fire (with the caveat that
 * dynamically-loaded photos won't be visible to a static scan —
 * confidence is intentionally low).
 */
export function inferCustomerPhotosAbsentInReviews(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	const widgetSignatures =
		/(trustvox|yourviews|judge\.me|judgeme|stamped\.io|reviewsdotio|loox|okendo|reviewbit|opinew)/i;
	if (!widgetSignatures.test(html)) return [];
	// Look for <img> within review-shaped containers.
	const reviewBlocks: string[] = [];
	for (const m of html.matchAll(
		/<[^>]+class\s*=\s*["'][^"']*\b(?:review[\w-]*|avaliacao|testimonial|customer-photo|user-image)\b[^"']*["'][^>]*>([\s\S]{0,2000}?)<\/[^>]+>/gi,
	)) {
		reviewBlocks.push(m[1]);
	}
	for (const m of html.matchAll(
		/<[^>]+itemtype\s*=\s*["'][^"']*Review["'][^>]*>([\s\S]{0,2000}?)<\/[^>]+>/gi,
	)) {
		reviewBlocks.push(m[1]);
	}
	if (reviewBlocks.length < 3) return [];
	const totalImgs = reviewBlocks.reduce(
		(acc, block) => acc + (block.match(/<img\b/gi) || []).length,
		0,
	);
	// Allow up to 1 image per block for avatar/icon — we want
	// content photos. Threshold: zero genuine content imgs.
	const contentImgsApprox = totalImgs - reviewBlocks.length;
	if (contentImgsApprox > 0) return [];
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"customer_photos_absent_in_reviews",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"medium",
			58,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Seu widget de reviews não exibe fotos de cliente — só texto e estrelas. Foto de comprador real ('Marina usando o produto') vence foto profissional do catálogo em trust signal por margem grande. No checkout BR, é frequentemente a foto-de-cliente que destrava a decisão final de quem está em dúvida sobre cor/tamanho/uso. Configure o prompt pós-compra pra pedir foto (TrustVox/Yourviews/Loox suportam). Não precisa ser viral — 3-5 fotos por produto bestseller já move conversão mensurável.",
		),
	];
}

// ── 8. Mobile sticky CTA absent ─────────────────

/**
 * Fires when no sticky/fixed-positioned CTA element is detected on
 * the page. BR commerce is >75% mobile, and a mobile shopper who
 * scrolls past the fold loses the primary CTA — without a sticky
 * variant pinned to the bottom of the viewport, returning to the
 * CTA requires scrolling back up (friction that abandons).
 *
 * Detection is heuristic — looks for the CSS class patterns
 * commonly used for sticky/fixed bottom CTAs (Tailwind 'fixed
 * bottom-', Bootstrap 'sticky-bottom', custom 'mobile-sticky-cta',
 * Nuvemshop / Shopify plugin patterns). Absence of all signals
 * fires the finding.
 *
 * False-positive risk: a site that uses inline styles or non-
 * standard CSS for its sticky CTA would trip the detector. Mitigated
 * by checking multiple pattern families AND requiring the page to
 * be a commercial surface (homepage, product, pricing) — the
 * dispatch already gates on ecommerce vertical so the surface mix
 * is correct.
 */
export function inferMobileStickyCtaAbsent(
	_sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	_corpus: string,
): Inference[] {
	const html = joinPageRawHtml(evidence);
	if (!html) return [];
	const stickyCtaPatterns = [
		// Tailwind-style: 'fixed bottom-' near button/anchor with
		// commercial verbs.
		/<[^>]*class\s*=\s*["'][^"']*\b(?:fixed|sticky)\b[^"']*\bbottom-[^"']*["'][^>]*>[\s\S]{0,300}?(?:comprar|adicionar|buy|checkout|finalizar|carrinho|cart)/i,
		// Plugin-named: mobile-sticky-cta, sticky-buy-button, fab-buy.
		/<[^>]*class\s*=\s*["'][^"']*\b(?:mobile-sticky|sticky-(?:cta|buy|add|checkout)|fab-(?:buy|cta)|bottom-sticky)\b/i,
		// Bootstrap-ish: sticky-bottom / fixed-bottom near CTA.
		/<[^>]*class\s*=\s*["'][^"']*\b(?:sticky-bottom|fixed-bottom)\b[^"']*["'][^>]*>[\s\S]{0,400}?(?:<button|<a[^>]+href)/i,
		// Explicit position style — defensive, catches inline-styled
		// sticky buttons.
		/<[^>]*style\s*=\s*["'][^"']*position:\s*(?:fixed|sticky)[^"']*bottom:[^"']*["'][^>]*>[\s\S]{0,300}?(?:comprar|adicionar|buy|checkout|finalizar)/i,
	];
	if (stickyCtaPatterns.some((rx) => rx.test(html))) return [];
	const pageContent = getPageContentEvidence(evidence);
	return [
		buildInference(
			"mobile_sticky_cta_absent",
			InferenceCategory.ConversionFlow,
			scoping,
			cycleRef,
			"true",
			"high",
			70,
			[],
			pageContent.slice(0, 2).map((e) => makeRef("evidence", e.id)),
			"Seu site não tem CTA sticky no bottom — o comprador mobile (~75% do tráfego BR D2C) que scrolla além da dobra perde o botão de compra de vista. Pra voltar, precisa scrollar tudo de novo, e a maioria não faz. Sticky button mobile fixo no rodapé do viewport ('Comprar — R\\$ X') é o padrão da indústria desde 2018 — plugins prontos pra Shopify (Sticky Add to Cart), Nuvemshop (botão flutuante), WooCommerce (YITH Sticky Add to Cart). Custo: 30min-1h.",
		),
	];
}

// ── Dispatch helper ───────────────────────────

/**
 * Run all BR D2C inferences in sequence and return the combined
 * array. Caller is responsible for the locale='pt-BR' + vertical
 * includes 'ecommerce' gate — this dispatcher trusts that.
 */
export function computeBrD2cInferences(
	sigs: Map<string, Signal>,
	scoping: Scoping,
	cycleRef: string,
	evidence: readonly Evidence[],
	corpus: string,
): Inference[] {
	return [
		...inferPixDiscountNotVisible(sigs, scoping, cycleRef, evidence, corpus),
		...inferWhatsappAttributionMissing(sigs, scoping, cycleRef, evidence, corpus),
		...inferWhatsappPersonalNumberWeak(sigs, scoping, cycleRef, evidence, corpus),
		...inferInstallmentNotVisible(sigs, scoping, cycleRef, evidence, corpus),
		...inferWhatsappBuriedInFooter(sigs, scoping, cycleRef, evidence, corpus),
		...inferReviewsLowSpecificity(sigs, scoping, cycleRef, evidence, corpus),
		...inferCustomerPhotosAbsentInReviews(sigs, scoping, cycleRef, evidence, corpus),
		...inferMobileStickyCtaAbsent(sigs, scoping, cycleRef, evidence, corpus),
	];
}
