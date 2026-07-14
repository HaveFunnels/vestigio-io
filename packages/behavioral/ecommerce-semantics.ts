// ──────────────────────────────────────────────
// Ecommerce Semantics — signal classifier
//
// Wave 22.9 · Fase 0 — foundation for the "Jornadas que custaram
// dinheiro" section content wave. Behavioral pixel captures raw events
// (page_enter, cta_click with semantic label, form_focus, etc.) but the
// downstream narrator + timeline UI had no way to know that
// `cta_click{ label: "Adicionar ao carrinho" }` is semantically
// different from `cta_click{ label: "Continuar comprando" }`. That
// blindness collapsed every timeline row to "Clicou em CTA" and gave
// the LLM narrator no vocabulary richer than "form_friction" or
// "oscillation".
//
// This module maps (path + cta label + surface_type) → a set of
// ecommerce-native signals (cart_add, coupon_apply, policy_visit,
// pricing_view, payment_step, shipping_step, etc.). Timeline events
// carry these signals; the aggregator counts them; the narrator prompt
// gets them as concrete vocabulary.
//
// Zero pixel changes required — this is purely a downstream classifier
// running against data already captured. The classifier is scoped to
// envs with vertical="ecommerce" (explicit OR auto-detected via path
// evidence). Non-ecommerce envs pass through unchanged.
// ──────────────────────────────────────────────

export type EcommerceSignal =
	| "cart_add"
	| "cart_remove"
	| "variant_toggle"
	| "coupon_apply"
	| "shipping_calc"
	| "checkout_go"
	| "payment_pick"
	| "policy_visit"
	| "signup_gate_hit"
	| "pricing_view"
	| "payment_step"
	| "shipping_step"
	| "cart_step"
	| "confirmation";

// ──────────────────────────────────────────────
// Label patterns (pt-BR + en fallback)
//
// Kept generous — Shopify themes, WooCommerce, VTEX, Loja Integrada,
// Nuvemshop, and custom Next.js e-commerces all use overlapping-but-not-
// identical button copy. Missing a signal fails soft: event stays as
// generic `cta_click`. False positives are worse than misses, so
// patterns are anchored on distinctive phrases, not single loose words.
// ──────────────────────────────────────────────

const LABEL_PATTERNS: Array<{ signal: EcommerceSignal; re: RegExp }> = [
	{ signal: "cart_add",       re: /adicionar ao carrinho|adicionar à sacola|add to (?:cart|bag)|comprar agora|buy now|comprar já/i },
	{ signal: "cart_remove",    re: /^remover$|remover do carrinho|remove(?: item)?$/i },
	{ signal: "variant_toggle", re: /\b(?:tamanho|cor|variante|escolher tamanho|choose (?:size|color))\b/i },
	{ signal: "coupon_apply",   re: /aplicar cupom|apply coupon|desconto|discount code/i },
	{ signal: "shipping_calc",  re: /calcular frete|calcular cep|calcular envio|shipping calc/i },
	{ signal: "checkout_go",    re: /finalizar (?:compra|pedido)|ir (?:para|pro) checkout|checkout|proceed to (?:pay|checkout)|comprar$/i },
	{ signal: "payment_pick",   re: /\b(?:pix|boleto|cart[aã]o|cr[eé]dito|d[eé]bito|pagar com|pay with)\b/i },
];

// ──────────────────────────────────────────────
// Path patterns
// ──────────────────────────────────────────────

const PATH_PATTERNS: Array<{ signal: EcommerceSignal; re: RegExp }> = [
	{ signal: "policy_visit",  re: /\/(politica|trocas?|devolu[cç][aã]o|privacidade|termos|faq|sobre|garantia)/i },
	{ signal: "signup_gate_hit", re: /\/(signin|login|cadastro|registro|register|account|conta|entrar)/i },
	{ signal: "pricing_view",  re: /\/(pricing|precos?|planos|assinar)/i },
	{ signal: "payment_step",  re: /\/checkout\/pay(?:ment)?|\/pagamento/i },
	{ signal: "shipping_step", re: /\/checkout\/(?:frete|shipping|entrega)|\/(?:frete|entrega)/i },
	{ signal: "cart_step",     re: /\/(?:cart|carrinho|sacola|bag)$|^\/(?:cart|carrinho|sacola|bag)\//i },
	{ signal: "confirmation",  re: /\/(?:thank|obrigado|thanks|success|sucesso|order-confirmed|pedido-confirmado|compra-realizada)/i },
];

/** Classify a cta_click event's semantic label into an ecommerce
 *  signal. Returns null when the label doesn't match any known
 *  pattern — caller falls back to generic cta_click. */
export function classifyCtaLabel(label: string | null | undefined): EcommerceSignal | null {
	if (!label) return null;
	for (const { signal, re } of LABEL_PATTERNS) {
		if (re.test(label)) return signal;
	}
	return null;
}

/** Classify a path into a step / visit signal. Returns null when no
 *  known pattern matches. */
export function classifyPath(path: string | null | undefined): EcommerceSignal | null {
	if (!path) return null;
	for (const { signal, re } of PATH_PATTERNS) {
		if (re.test(path)) return signal;
	}
	return null;
}

// ──────────────────────────────────────────────
// Vertical gate — only apply ecommerce semantics when the env is (a)
// explicitly tagged perceivedVertical="ecommerce" OR (b) walked over
// enough ecommerce-shaped paths in this session to auto-classify.
//
// The path evidence branch matters because perceivedVertical is null
// on freshly-onboarded envs until PV.2 lands, but the pixel is
// already recording sessions. Better to autoclassify than gate every
// new env behind a manual field write.
// ──────────────────────────────────────────────

const ECOM_PATH_EVIDENCE = /\/(cart|carrinho|checkout|produto|product|shop|loja|categoria|category|colecao|collection|sacola|bag)/i;

export function shouldApplyEcommerceSemantics(
	explicitVertical: string | null | undefined,
	paths: readonly string[],
): boolean {
	if (explicitVertical === "ecommerce") return true;
	// Auto-detect: 2+ distinct paths in the session match the ecommerce
	// path evidence set → treat as ecommerce for this session's
	// classification purposes. Single-match is too loose (a SaaS marketing
	// site with a /shop-widgets page would misfire).
	const matches = new Set<string>();
	for (const p of paths) {
		if (!p) continue;
		if (ECOM_PATH_EVIDENCE.test(p)) matches.add(p);
		if (matches.size >= 2) return true;
	}
	return false;
}

// ──────────────────────────────────────────────
// Human labels for timeline rendering
// ──────────────────────────────────────────────

const SIGNAL_HUMAN_LABEL_PT_BR: Record<EcommerceSignal, string> = {
	cart_add:        "Adicionou ao carrinho",
	cart_remove:     "Removeu do carrinho",
	variant_toggle:  "Trocou de variante",
	coupon_apply:    "Tentou aplicar cupom",
	shipping_calc:   "Calculou frete",
	checkout_go:     "Foi pro checkout",
	payment_pick:    "Escolheu forma de pagamento",
	policy_visit:    "Foi conferir política",
	signup_gate_hit: "Bateu em tela de cadastro",
	pricing_view:    "Chegou na página de preços",
	payment_step:    "Entrou na etapa de pagamento",
	shipping_step:   "Entrou na etapa de frete",
	cart_step:       "Entrou no carrinho",
	confirmation:    "Confirmou pedido",
};

export function humanizeSignal(sig: EcommerceSignal): string {
	return SIGNAL_HUMAN_LABEL_PT_BR[sig];
}
