import {
	Evidence,
	EvidenceType,
	type IframePayload,
	type MetaPayload,
	type PageContentPayload,
	type ProviderIndicatorPayload,
	type ScriptPayload,
	type TechnologyDetectedPayload,
} from '../domain';

// ──────────────────────────────────────────────
// Commerce Heuristic Signals
//
// Shape-only module (Phase 1.3). Phase 2.4 ships the extractors.
//
// Why this exists: seven Shopify-driven inferences (cart abandonment
// revenue leak, high refund rate, single payment gateway risk, discount
// abuse, low repeat purchase, promoted-product out-of-stock, dead-
// weight products) only fire today when IntegrationConnection(shopify)
// is connected. Stores on Nuvemshop, WooCommerce, custom stacks, or
// stores that simply haven't integrated yet get a silent dark zone.
//
// The heuristic path uses cheaper signals — form submission failure
// ratios, checkout-step pixel dropoff, support ticket volume, policy
// mentions — to produce a LOW-CONFIDENCE version of the same finding.
// It is NOT a replacement for connected Shopify data (which is
// data_driven with higher confidence multiplier). It's a fallback so
// non-integrated stores see the findings at all with a visible
// confidence penalty and a banner encouraging integration.
//
// Phase 1.3 locks in the shape so Phase 2.4 can wire extractors
// without refactoring consumers. Inference engine consumers should
// import the types from here and treat extractor outputs as optional
// — the field being absent means "we could not heuristically
// determine this" and the consumer should not emit the finding.
// ──────────────────────────────────────────────

export type HeuristicBasis =
	| 'form_submit_failure_ratio'
	| 'checkout_pixel_dropoff'
	| 'support_ticket_ratio'
	| 'policy_mention_density'
	| 'payment_method_probe'
	| 'price_structure_probe'
	| 'sitemap_product_coverage'
	| 'unknown';

export interface CheckoutAbandonmentHeuristic {
	rate: number;
	basis: HeuristicBasis;
	sample_size: number;
}

export interface RefundRateHeuristic {
	rate: number;
	basis: HeuristicBasis;
	sample_size: number;
}

export interface PaymentGatewayHeuristic {
	gateway_count: number;
	basis: HeuristicBasis;
	detected_gateways: string[];
	sample_size: number;
}

export interface DiscountAbuseHeuristic {
	exposure: number;
	basis: HeuristicBasis;
	sample_size: number;
	exposed_codes?: string[];
}

export interface RepeatPurchaseHeuristic {
	rate: number;
	basis: HeuristicBasis;
	sample_size: number;
}

export interface CommerceHeuristicSignals {
	checkout_abandonment?: CheckoutAbandonmentHeuristic;
	refund_rate?: RefundRateHeuristic;
	payment_gateway?: PaymentGatewayHeuristic;
	discount_abuse?: DiscountAbuseHeuristic;
	repeat_purchase?: RepeatPurchaseHeuristic;
	suppressed_by_integration?: boolean;
}

export interface ExtractHeuristicsOptions {
	has_commerce_integration?: boolean;
}

// ──────────────────────────────────────────────
// Payment-gateway heuristic
// Counts distinct payment providers visible in evidence (iframes,
// scripts, technology detections, provider indicators). Only surfaces
// a conclusion when the detected set spans >= 2 commerce pages — a
// single page can easily have partial coverage and generate a false
// "single gateway" positive.
// ──────────────────────────────────────────────

const KNOWN_PAYMENT_GATEWAYS: Record<string, string> = {
	stripe: 'Stripe',
	paypal: 'PayPal',
	braintree: 'Braintree',
	adyen: 'Adyen',
	square: 'Square',
	mercadopago: 'Mercado Pago',
	mercado_pago: 'Mercado Pago',
	pagseguro: 'PagSeguro',
	pagarme: 'Pagar.me',
	ebanx: 'EBANX',
	cielo: 'Cielo',
	rede: 'Rede',
	stone: 'Stone',
	getnet: 'GetNet',
	klarna: 'Klarna',
	afterpay: 'Afterpay',
	affirm: 'Affirm',
	amazonpay: 'Amazon Pay',
	amazon_pay: 'Amazon Pay',
	googlepay: 'Google Pay',
	applepay: 'Apple Pay',
	shop_pay: 'Shop Pay',
	shoppay: 'Shop Pay',
	checkout_com: 'Checkout.com',
	worldpay: 'Worldpay',
	authorize_net: 'Authorize.net',
};

const PAYMENT_HINT_REGEXES: { regex: RegExp; canonical: string }[] = [
	{ regex: /\bstripe\b/i, canonical: 'Stripe' },
	{ regex: /\bpaypal\b/i, canonical: 'PayPal' },
	{ regex: /\bbraintree\b/i, canonical: 'Braintree' },
	{ regex: /\badyen\b/i, canonical: 'Adyen' },
	{ regex: /\bmercadopag/i, canonical: 'Mercado Pago' },
	{ regex: /\bpagseguro\b/i, canonical: 'PagSeguro' },
	{ regex: /\bpagar\.?me\b/i, canonical: 'Pagar.me' },
	{ regex: /\bebanx\b/i, canonical: 'EBANX' },
	{ regex: /\bcielo\b/i, canonical: 'Cielo' },
	{ regex: /\bgetnet\b/i, canonical: 'GetNet' },
	{ regex: /\bklarna\b/i, canonical: 'Klarna' },
	{ regex: /\bafterpay\b/i, canonical: 'Afterpay' },
	{ regex: /\baffirm\b/i, canonical: 'Affirm' },
	{ regex: /\bshop[\s_-]?pay\b/i, canonical: 'Shop Pay' },
	{ regex: /\bcheckout\.com\b/i, canonical: 'Checkout.com' },
	{ regex: /\bworldpay\b/i, canonical: 'Worldpay' },
];

function normaliseProviderName(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const lower = trimmed.toLowerCase().replace(/\s+/g, '_');
	if (KNOWN_PAYMENT_GATEWAYS[lower]) return KNOWN_PAYMENT_GATEWAYS[lower];
	for (const { regex, canonical } of PAYMENT_HINT_REGEXES) {
		if (regex.test(trimmed)) return canonical;
	}
	return null;
}

function extractPaymentGateway(
	evidence: Evidence[],
): PaymentGatewayHeuristic | undefined {
	const gateways = new Set<string>();
	const commercePages = new Set<string>();

	for (const e of evidence) {
		switch (e.evidence_type) {
			case EvidenceType.ProviderIndicator: {
				const p = e.payload as ProviderIndicatorPayload;
				const canonical = normaliseProviderName(p.provider_name);
				if (canonical) {
					gateways.add(canonical);
					commercePages.add(p.page_url);
				}
				break;
			}
			case EvidenceType.TechnologyDetected: {
				const p = e.payload as TechnologyDetectedPayload;
				if (p.category !== 'payment_provider') break;
				const canonical =
					normaliseProviderName(p.technology_key) ??
					normaliseProviderName(p.display_name);
				if (canonical) {
					gateways.add(canonical);
					for (const url of p.detected_on) commercePages.add(url);
				}
				break;
			}
			case EvidenceType.Iframe: {
				const p = e.payload as IframePayload;
				const canonical =
					normaliseProviderName(p.known_provider) ??
					normaliseProviderName(p.host) ??
					normaliseProviderName(p.src);
				if (canonical) {
					gateways.add(canonical);
					commercePages.add(p.page_url);
				}
				break;
			}
			case EvidenceType.Script: {
				const p = e.payload as ScriptPayload;
				if (!p.is_external) break;
				const canonical =
					normaliseProviderName(p.known_provider) ??
					normaliseProviderName(p.host);
				if (canonical) {
					gateways.add(canonical);
					commercePages.add(p.page_url);
				}
				break;
			}
		}
	}

	if (commercePages.size < 2) return undefined;
	if (gateways.size === 0) return undefined;

	return {
		gateway_count: gateways.size,
		basis: 'payment_method_probe',
		detected_gateways: Array.from(gateways).sort(),
		sample_size: commercePages.size,
	};
}

// ──────────────────────────────────────────────
// Discount-abuse heuristic
// Scans visible marketing copy (page titles, meta descriptions, OG
// tags) for publicly-exposed promo codes. Multiple distinct codes
// across the site → discounting has become the default purchase path,
// which the inference-engine consumer reads as "discount usage
// elevated". Only code-word-anchored matches count.
// ──────────────────────────────────────────────

const CODE_WORDS = [
	'use code',
	'with code',
	'apply code',
	'enter code',
	'promo code',
	'discount code',
	'coupon code',
	'code:',
	'codigo',
	'cupom',
	'cupon',
	'gutschein',
	'gutscheincode',
	'rabattcode',
];
const CODE_WORD_REGEX = new RegExp(
	`(?:${CODE_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[\\s:]*([A-Z][A-Z0-9]{2,13})\\b`,
	'gi',
);

const GENERIC_WORDS = new Set([
	'SHOP', 'CART', 'HOME', 'MENU', 'HELP', 'BLOG', 'NEWS', 'CODE', 'SALE',
	'NEW', 'HOT', 'FREE', 'DEAL', 'OFFER', 'PROMO', 'GIFT', 'CLUB', 'VIP',
]);

function extractCodesFromText(text: string | null | undefined): string[] {
	if (!text) return [];
	const found: string[] = [];
	const normalised = text.replace(/\s+/g, ' ');
	let match: RegExpExecArray | null;
	CODE_WORD_REGEX.lastIndex = 0;
	while ((match = CODE_WORD_REGEX.exec(normalised)) !== null) {
		const code = match[1].toUpperCase();
		if (GENERIC_WORDS.has(code)) continue;
		found.push(code);
	}
	return found;
}

function extractDiscountAbuse(
	evidence: Evidence[],
): DiscountAbuseHeuristic | undefined {
	const codes = new Set<string>();
	const pagesWithCode = new Set<string>();
	let pagesScanned = 0;

	for (const e of evidence) {
		if (e.evidence_type === EvidenceType.PageContent) {
			const p = e.payload as PageContentPayload;
			pagesScanned += 1;
			const texts = [p.title, p.meta_description];
			let pageHadCode = false;
			for (const t of texts) {
				const found = extractCodesFromText(t);
				for (const c of found) {
					codes.add(c);
					pageHadCode = true;
				}
			}
			if (pageHadCode) pagesWithCode.add(p.url);
		} else if (e.evidence_type === EvidenceType.Meta) {
			const p = e.payload as MetaPayload;
			const texts = Object.values(p.og_tags ?? {});
			let pageHadCode = false;
			for (const t of texts) {
				const found = extractCodesFromText(t);
				for (const c of found) {
					codes.add(c);
					pageHadCode = true;
				}
			}
			if (pageHadCode) pagesWithCode.add(p.page_url);
		}
	}

	// Sample floor: need at least 10 pages to avoid false highs from
	// tiny sites where a single banner dominates.
	if (pagesScanned < 10) return undefined;
	if (codes.size === 0) return undefined;

	const exposure = Math.min(1, pagesWithCode.size / pagesScanned);

	return {
		exposure,
		basis: 'policy_mention_density',
		sample_size: pagesScanned,
		exposed_codes: Array.from(codes).sort(),
	};
}

/**
 * Phase 2.4 implementation: ships two extractors — payment gateway
 * detection and discount-abuse exposure. The other three heuristic
 * fields (checkout_abandonment, refund_rate, repeat_purchase) stay
 * unpopulated until their probe stacks land; consumers null-check.
 *
 * Short-circuits to `{ suppressed_by_integration: true }` when the
 * caller signals that a commerce integration is already covering the
 * same signals at full confidence.
 */
export function extractCommerceHeuristicSignals(
	evidence: Evidence[],
	opts?: ExtractHeuristicsOptions,
): CommerceHeuristicSignals {
	if (opts?.has_commerce_integration) {
		return { suppressed_by_integration: true };
	}

	const result: CommerceHeuristicSignals = {};

	const paymentGateway = extractPaymentGateway(evidence);
	if (paymentGateway) result.payment_gateway = paymentGateway;

	const discountAbuse = extractDiscountAbuse(evidence);
	if (discountAbuse) result.discount_abuse = discountAbuse;

	return result;
}
