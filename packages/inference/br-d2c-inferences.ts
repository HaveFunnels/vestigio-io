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
	];
}
