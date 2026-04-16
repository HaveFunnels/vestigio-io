import {
	Evidence,
	EvidenceType,
	type FormPayload,
	type IframePayload,
	type MetaPayload,
	type MobileVerificationResultPayload,
	type PageContentPayload,
	type PolicyPagePayload,
	type ProviderIndicatorPayload,
	type ScriptPayload,
	type StructuredDataItemPayload,
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

/**
 * Crawl-only fallback for `form_excessive_fields_before_conversion`.
 * Counts conversion-proximate forms (payment, signup, lead, contact)
 * whose field list exceeds the friction threshold, then mirrors the
 * behavioral path's numeric_value/severity encoding so the inference
 * engine consumer doesn't branch on source.
 *
 * Suppressed when BehavioralSessionPayload evidence is present —
 * behavioral data is always preferred when available.
 */
export interface FormExcessiveFieldsHeuristic {
	/** Count of conversion-proximate forms exceeding the field floor. */
	form_count: number;
	/** The URLs where those forms were found — helps authors locate them. */
	form_urls: string[];
	/** Max field count observed — tells the story of the worst offender. */
	max_field_count: number;
}

/**
 * Crawl-only fallback for `sensitive_input_trust_gap`. Flags pages
 * that ask for sensitive data (password / card / CPF / etc.) but lack
 * co-located trust signals (structured data, review widgets, security
 * badges, policy references). Page-level proximity is our best
 * approximation — we don't observe DOM coordinates.
 *
 * Suppressed when BehavioralSessionPayload evidence is present (the
 * cohort path's `sensitive_input_abandon_rate` is more precise).
 */
export interface SensitiveInputTrustGapHeuristic {
	/** Pages that collect sensitive data AND show fewer than 2 trust signals. */
	gap_page_count: number;
	/** Total number of sensitive-input pages scanned. */
	sensitive_page_count: number;
	/** Up to 3 gap-page URLs — helps authors see which surfaces to fix. */
	example_urls: string[];
	/** True when at least one gap page has zero trust signals at all. */
	has_zero_trust_page: boolean;
}

/**
 * Crawl-only proxy for `mobile_cta_timing_degraded`. Works from the
 * MobileVerificationResultPayload: when the mobile commercial path is
 * technically reachable but shows step failures or extended duration
 * (vs desktop baseline), we infer CTA timing degradation. This is a
 * journey-level proxy — not the pixel-measured CTA render timing the
 * behavioral cohort path observes directly — so confidence stays low.
 *
 * Suppressed when BehavioralSessionPayload evidence is present.
 */
export interface MobileCtaTimingHeuristic {
	/** Max mobile journey duration in ms observed across results. */
	max_duration_ms: number;
	/** Step failure count summed across mobile verification runs. */
	total_steps_failed: number;
	/** Number of mobile verification runs that triggered the proxy. */
	result_count: number;
}

export interface CommerceHeuristicSignals {
	checkout_abandonment?: CheckoutAbandonmentHeuristic;
	refund_rate?: RefundRateHeuristic;
	payment_gateway?: PaymentGatewayHeuristic;
	discount_abuse?: DiscountAbuseHeuristic;
	repeat_purchase?: RepeatPurchaseHeuristic;
	form_excessive_fields?: FormExcessiveFieldsHeuristic;
	sensitive_input_trust_gap?: SensitiveInputTrustGapHeuristic;
	mobile_cta_timing?: MobileCtaTimingHeuristic;
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
	// Global acquirers / PSPs
	stripe: 'Stripe',
	paypal: 'PayPal',
	braintree: 'Braintree',
	adyen: 'Adyen',
	square: 'Square',
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
	nuvei: 'Nuvei',
	// LATAM — Mercado Pago + EBANX work BR + regional
	mercadopago: 'Mercado Pago',
	mercado_pago: 'Mercado Pago',
	ebanx: 'EBANX',
	// Brazilian acquirers & sub-acquirers
	cielo: 'Cielo',
	rede: 'Rede',
	stone: 'Stone',
	getnet: 'GetNet',
	pagseguro: 'PagSeguro',
	pagarme: 'Pagar.me',
	pagbank: 'PagBank',
	picpay: 'Picpay',
	vindi: 'Vindi',
	iugu: 'Iugu',
	asaas: 'Asaas',
	efi: 'Efí',
	gerencianet: 'Efí',
	appmax: 'Appmax',
	yampi: 'Yampi',
	zoop: 'Zoop',
	koin: 'Koin',
	adiq: 'Adiq',
	// BR infoproduct / digital checkout marketplaces
	hotmart: 'Hotmart',
	eduzz: 'Eduzz',
	monetizze: 'Monetizze',
	braip: 'Braip',
	kiwify: 'Kiwify',
	cartpanda: 'CartPanda',
	abmex: 'Abmex',
	ticto: 'Ticto',
	perfectpay: 'PerfectPay',
	perfect_pay: 'PerfectPay',
};

const PAYMENT_HINT_REGEXES: { regex: RegExp; canonical: string }[] = [
	// Global
	{ regex: /\bstripe\b/i, canonical: 'Stripe' },
	{ regex: /\bpaypal\b/i, canonical: 'PayPal' },
	{ regex: /\bbraintree\b/i, canonical: 'Braintree' },
	{ regex: /\badyen\b/i, canonical: 'Adyen' },
	{ regex: /\bklarna\b/i, canonical: 'Klarna' },
	{ regex: /\bafterpay\b/i, canonical: 'Afterpay' },
	{ regex: /\baffirm\b/i, canonical: 'Affirm' },
	{ regex: /\bshop[\s_-]?pay\b/i, canonical: 'Shop Pay' },
	{ regex: /\bcheckout\.com\b/i, canonical: 'Checkout.com' },
	{ regex: /\bworldpay\b/i, canonical: 'Worldpay' },
	{ regex: /\bnuvei\b/i, canonical: 'Nuvei' },
	// LATAM
	{ regex: /\bmercadopag/i, canonical: 'Mercado Pago' },
	{ regex: /\bebanx\b/i, canonical: 'EBANX' },
	// BR acquirers
	{ regex: /\bpagseguro\b/i, canonical: 'PagSeguro' },
	{ regex: /\bpagar\.?me\b/i, canonical: 'Pagar.me' },
	{ regex: /\bpagbank\b/i, canonical: 'PagBank' },
	{ regex: /\bpicpay\b/i, canonical: 'Picpay' },
	{ regex: /\bcielo\b/i, canonical: 'Cielo' },
	{ regex: /\bgetnet\b/i, canonical: 'GetNet' },
	{ regex: /\bstone\.com\.br\b/i, canonical: 'Stone' },
	{ regex: /\bvindi\b/i, canonical: 'Vindi' },
	{ regex: /\biugu\b/i, canonical: 'Iugu' },
	{ regex: /\basaas\b/i, canonical: 'Asaas' },
	{ regex: /\bgerencianet\b/i, canonical: 'Efí' },
	{ regex: /\bef[ií]\b/i, canonical: 'Efí' },
	{ regex: /\bappmax\b/i, canonical: 'Appmax' },
	{ regex: /\byampi\b/i, canonical: 'Yampi' },
	{ regex: /\bzoop\b/i, canonical: 'Zoop' },
	{ regex: /\bkoin\b/i, canonical: 'Koin' },
	{ regex: /\badiq\b/i, canonical: 'Adiq' },
	// Infoproduct
	{ regex: /\bhotmart\b/i, canonical: 'Hotmart' },
	{ regex: /\beduzz\b/i, canonical: 'Eduzz' },
	{ regex: /\bmonetizze\b/i, canonical: 'Monetizze' },
	{ regex: /\bbraip\b/i, canonical: 'Braip' },
	{ regex: /\bkiwify\b/i, canonical: 'Kiwify' },
	{ regex: /\bcartpanda\b/i, canonical: 'CartPanda' },
	{ regex: /\babmex\b/i, canonical: 'Abmex' },
	{ regex: /\bticto\b/i, canonical: 'Ticto' },
	{ regex: /\bperfect[\s_-]?pay\b/i, canonical: 'PerfectPay' },
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

// ──────────────────────────────────────────────
// Checkout-abandonment heuristic
//
// Proxies cart abandonment via form friction on payment surfaces.
// Research benchmarks: every additional field beyond 6 on a payment
// form lifts abandonment ~2%; forms with 15+ fields routinely see
// 70%+ abandonment. We count payment-field forms and pick the highest-
// friction one as the worst-case abandonment surface.
//
// Signal is conservative: we ONLY emit when the proxy implies a rate
// above the inference-engine threshold (0.60). Marginal friction
// (<10 fields) returns undefined rather than emitting a weak signal
// that just-barely crosses the threshold.
// ──────────────────────────────────────────────

function extractCheckoutAbandonment(
	evidence: Evidence[],
): CheckoutAbandonmentHeuristic | undefined {
	const paymentForms: FormPayload[] = [];

	for (const e of evidence) {
		if (e.evidence_type !== EvidenceType.Form) continue;
		const p = e.payload as FormPayload;
		if (!p.has_payment_fields) continue;
		paymentForms.push(p);
	}

	if (paymentForms.length === 0) return undefined;

	// Worst-case friction: pick the payment form with the most fields.
	// A single bloated form dominates real abandonment because every
	// checkout eventually funnels through it.
	const maxFields = Math.max(
		...paymentForms.map((f) => f.field_names.length),
	);

	// Rate buckets tuned to published cart-abandonment research:
	// - 15+ fields → ~0.75 (critical friction, Baymard-style long forms)
	// - 10-14 fields → ~0.68 (moderate friction, above the 0.60 threshold)
	// - 6-9 fields → skip. Would just-barely cross threshold but the
	//   heuristic isn't precise enough to earn the finding at that edge.
	let rate: number;
	if (maxFields >= 15) rate = 0.75;
	else if (maxFields >= 10) rate = 0.68;
	else return undefined;

	return {
		rate,
		basis: 'form_submit_failure_ratio',
		sample_size: paymentForms.length,
	};
}

// ──────────────────────────────────────────────
// Refund-rate heuristic
//
// Proxies refund rate via policy-surface friction. Deterministic fields
// on PolicyPagePayload (has_return_window, has_refund_process,
// word_count) capture the three friction modes that correlate with
// higher actual refund rates: hostile/vague policies drive disputes,
// over-long policies bury resolution paths, missing refund-process
// language means buyers escalate to chargebacks.
//
// Emits when >= 2 friction indicators fire across the detected refund
// policy pages. Rate pinned at 0.08 — just above the inference-engine
// threshold (0.05) — because the proxy can't precisely estimate magnitude,
// only "friction present vs not". Confidence low (55) to reflect this.
// ──────────────────────────────────────────────

function extractRefundRate(
	evidence: Evidence[],
): RefundRateHeuristic | undefined {
	const refundPolicies: PolicyPagePayload[] = [];

	for (const e of evidence) {
		if (e.evidence_type !== EvidenceType.PolicyPage) continue;
		const p = e.payload as PolicyPagePayload;
		if (!p.detected) continue;
		if (p.policy_type !== 'refund' && p.policy_type !== 'terms') continue;
		refundPolicies.push(p);
	}

	if (refundPolicies.length === 0) return undefined;

	// Friction scoring: accumulate indicators across all refund policies.
	// Treat nullish fields as neutral (unknown), not as positive friction.
	let frictionCount = 0;
	for (const p of refundPolicies) {
		if (p.has_return_window === false) frictionCount++;
		if (p.has_refund_process === false) frictionCount++;
		if (p.word_count != null && p.word_count < 150) frictionCount++;
		if (p.word_count != null && p.word_count > 2000) frictionCount++;
	}

	if (frictionCount < 2) return undefined;

	return {
		rate: 0.08,
		basis: 'policy_mention_density',
		sample_size: refundPolicies.length,
	};
}

// ──────────────────────────────────────────────
// Form-excessive-fields heuristic
//
// Crawl-only fallback for `form_excessive_fields_before_conversion`,
// today only emitted from BehavioralSessionPayload.form_excessive_
// field_count (pixel). Stores without instrumentation never saw the
// finding.
//
// Logic:
//   1. Classify each FormPayload as conversion-proximate via URL tokens
//      (checkout/cart/signup/register/subscribe/trial/contact/quote)
//      OR has_payment_fields === true (overrides URL).
//   2. A form is "excessive" when field_names.length >= 7 (matches the
//      behavioral evidence definition: >6 fields OR sensitive mix).
//      Payment forms get a lower gate of 5+ fields because the sensitive
//      mix alone justifies the finding.
//   3. Emit when the count reaches >= 2 — matches the behavioral path's
//      activation (formStartRate < 0.30 OR count >= 2).
//
// Auto-suppressed when any BehavioralSession evidence is present.
// Behavioral is always preferred — it knows which forms users actually
// reach, we only know which forms exist.
// ──────────────────────────────────────────────

const CONVERSION_URL_TOKENS = [
	'checkout',
	'cart',
	'payment',
	'pagamento',
	'finalizar',
	'signup',
	'sign-up',
	'register',
	'registration',
	'cadastro',
	'subscribe',
	'assinar',
	'trial',
	'start-free',
	'get-started',
	'join',
	'apply',
	'contact',
	'contato',
	'quote',
	'orcamento',
	'orçamento',
	'estimate',
	'demo',
];

function isConversionProximate(form: FormPayload): boolean {
	if (form.has_payment_fields) return true;
	const haystack = `${form.page_url} ${form.action}`.toLowerCase();
	return CONVERSION_URL_TOKENS.some((t) => haystack.includes(t));
}

function isExcessiveFieldCount(form: FormPayload): boolean {
	const n = form.field_names.length;
	if (form.has_payment_fields) return n >= 5;
	return n >= 7;
}

function extractFormExcessiveFields(
	evidence: Evidence[],
): FormExcessiveFieldsHeuristic | undefined {
	// Suppression: behavioral data is always preferred. If any session
	// evidence exists, trust that path — don't duplicate.
	const hasBehavioral = evidence.some(
		(e) => e.evidence_type === EvidenceType.BehavioralSession,
	);
	if (hasBehavioral) return undefined;

	const excessiveForms: FormPayload[] = [];
	for (const e of evidence) {
		if (e.evidence_type !== EvidenceType.Form) continue;
		const p = e.payload as FormPayload;
		if (!isConversionProximate(p)) continue;
		if (!isExcessiveFieldCount(p)) continue;
		excessiveForms.push(p);
	}

	// Activation floor: 2+ excessive forms (matches behavioral path).
	// A single excessive form could be a contact form with a legitimate
	// long application — pattern needs to be systemic.
	if (excessiveForms.length < 2) return undefined;

	const urls = Array.from(new Set(excessiveForms.map((f) => f.page_url))).sort();
	const maxFieldCount = Math.max(
		...excessiveForms.map((f) => f.field_names.length),
	);

	return {
		form_count: excessiveForms.length,
		form_urls: urls,
		max_field_count: maxFieldCount,
	};
}

// ──────────────────────────────────────────────
// Sensitive-input trust-gap heuristic
//
// Crawl-only fallback for `sensitive_input_trust_gap`, today only fires
// from BehavioralCohortPayload.sensitive_input_abandon_rate (pixel).
// Logic:
//   1. Identify pages with sensitive form fields — either has_payment_
//      fields=true (high-priority override) or field_names matching
//      SENSITIVE_FIELD_TOKENS (password, card, cpf, ssn, pin, etc.)
//   2. For each sensitive-input page, count trust-adjacent evidence
//      attached to the SAME page_url. Page-level proximity is a weak
//      proxy for DOM proximity but it's the best deterministic signal
//      we can build from evidence as-is.
//   3. Trust signals counted:
//      - StructuredDataItem with is_trust_signal=true
//      - Script/Iframe with known_provider matching TRUST_PROVIDER
//      - TechnologyDetected with trust-relevant category
//   4. A page is "gap" when trust_count < 2 on that specific page.
//      Activation: at least one gap page.
//
// Auto-suppressed when any BehavioralSession evidence exists — the
// cohort path is more precise (actual abandonment rate vs inferred gap).
// ──────────────────────────────────────────────

const SENSITIVE_FIELD_TOKENS = [
	// Payment
	'card',
	'cvv',
	'cvc',
	'ccv',
	'credit',
	'cartao',
	'cardnumber',
	'numerocartao',
	'creditcard',
	'debitcard',
	// Identity (US + BR common)
	'cpf',
	'cnpj',
	'ssn',
	'passport',
	'nationalid',
	'rg',
	'taxid',
	// Auth
	'password',
	'senha',
	'passwd',
	'passphrase',
	'pin',
	// Sensitive personal
	'dob',
	'birthday',
	'birthdate',
	'dateofbirth',
	'nascimento',
];

const TRUST_PROVIDER_REGEX =
	/trustpilot|yotpo|judge\.?me|stamped|reviews\.?io|ekomi|trustedshops|bazaarvoice|verisign|norton|mcafee|thawte|letsbuy|sealofapproval|shopify_secure|shopify_trust|google_customer_reviews/i;

const TRUST_TECHNOLOGY_CATEGORIES = new Set([
	'reviews',
	'trust_seal',
	'security_badge',
	'ssl_seal',
	'testimonials',
	'compliance',
	'trust',
	'security',
]);

function fieldLooksSensitive(fieldName: string): boolean {
	const normalised = fieldName.toLowerCase().replace(/[_\-\s]/g, '');
	return SENSITIVE_FIELD_TOKENS.some((tok) => normalised.includes(tok));
}

function hasSensitiveFields(form: FormPayload): boolean {
	if (form.has_payment_fields) return true;
	return form.field_names.some(fieldLooksSensitive);
}

function countTrustSignalsOnPage(
	evidence: Evidence[],
	pageUrl: string,
): number {
	let count = 0;

	for (const e of evidence) {
		switch (e.evidence_type) {
			case EvidenceType.StructuredDataItem: {
				const p = e.payload as StructuredDataItemPayload;
				if (p.page_url === pageUrl && p.is_trust_signal) count++;
				break;
			}
			case EvidenceType.Script: {
				const p = e.payload as ScriptPayload;
				if (p.page_url !== pageUrl) break;
				const hay = `${p.known_provider ?? ''} ${p.host} ${p.src}`;
				if (TRUST_PROVIDER_REGEX.test(hay)) count++;
				break;
			}
			case EvidenceType.Iframe: {
				const p = e.payload as IframePayload;
				if (p.page_url !== pageUrl) break;
				const hay = `${p.known_provider ?? ''} ${p.host} ${p.src}`;
				if (TRUST_PROVIDER_REGEX.test(hay)) count++;
				break;
			}
			case EvidenceType.TechnologyDetected: {
				const p = e.payload as TechnologyDetectedPayload;
				if (!TRUST_TECHNOLOGY_CATEGORIES.has(p.category)) break;
				if (p.detected_on.includes(pageUrl)) count++;
				break;
			}
		}
	}

	return count;
}

function extractSensitiveInputTrustGap(
	evidence: Evidence[],
): SensitiveInputTrustGapHeuristic | undefined {
	// Suppression: behavioral cohort is the authoritative path. Skip if
	// any session evidence is present in the cycle.
	const hasBehavioral = evidence.some(
		(e) => e.evidence_type === EvidenceType.BehavioralSession,
	);
	if (hasBehavioral) return undefined;

	// Deduplicate by page_url — multiple forms on the same page count
	// as one "surface with sensitive inputs".
	const sensitivePageUrls = new Set<string>();
	for (const e of evidence) {
		if (e.evidence_type !== EvidenceType.Form) continue;
		const p = e.payload as FormPayload;
		if (!hasSensitiveFields(p)) continue;
		sensitivePageUrls.add(p.page_url);
	}

	if (sensitivePageUrls.size === 0) return undefined;

	const gapUrls: string[] = [];
	let zeroTrust = false;

	for (const url of sensitivePageUrls) {
		const trustCount = countTrustSignalsOnPage(evidence, url);
		if (trustCount < 2) {
			gapUrls.push(url);
			if (trustCount === 0) zeroTrust = true;
		}
	}

	if (gapUrls.length === 0) return undefined;

	return {
		gap_page_count: gapUrls.length,
		sensitive_page_count: sensitivePageUrls.size,
		example_urls: gapUrls.slice(0, 3).sort(),
		has_zero_trust_page: zeroTrust,
	};
}

// ──────────────────────────────────────────────
// Mobile-CTA-timing heuristic
//
// Crawl proxy for `mobile_cta_timing_degraded`, today fired only from
// BehavioralCohortPayload's cta_rendered_late_count (pixel). We can't
// observe render timing from crawl evidence directly, but
// MobileVerificationResultPayload lets us identify a WEAKER proxy:
// mobile commercial journeys that succeed reachability but show step
// failures or protracted duration imply CTA/interaction issues.
//
// Constraints:
//   - Only triggers when checkout is reachable — if the commercial path
//     is blocked entirely, `mobile_commercial_path_blocked` already
//     fires, different signal.
//   - Duration threshold: 8000ms. Typical mobile commercial journeys
//     complete in 3-6s; 8s+ is the degraded zone.
//   - Step-failure threshold: 1+. Any step failure on a reachable path
//     is a CTA/interaction issue surfacing.
//   - Confidence is pinned at 50 — lower than other heuristics because
//     the proxy is indirect (journey friction ≠ late CTA render).
//
// Auto-suppressed when BehavioralSession evidence exists — cohort
// observes CTA render timing directly.
// ──────────────────────────────────────────────

const MOBILE_DURATION_DEGRADATION_MS = 8000;

function extractMobileCtaTiming(
	evidence: Evidence[],
): MobileCtaTimingHeuristic | undefined {
	const hasBehavioral = evidence.some(
		(e) => e.evidence_type === EvidenceType.BehavioralSession,
	);
	if (hasBehavioral) return undefined;

	const mobileResults: MobileVerificationResultPayload[] = [];
	for (const e of evidence) {
		if (e.evidence_type !== EvidenceType.MobileVerificationResult) continue;
		mobileResults.push(e.payload as MobileVerificationResultPayload);
	}

	if (mobileResults.length === 0) return undefined;

	let maxDuration = 0;
	let totalFailures = 0;
	let triggeringResults = 0;

	for (const p of mobileResults) {
		// Only consider journeys where the commercial path was at least
		// reachable — full blocks are already captured by
		// mobile_commercial_path_blocked.
		if (!p.checkout_reachable) continue;

		const isDegradedDuration = p.duration_ms >= MOBILE_DURATION_DEGRADATION_MS;
		const hasFailures = p.steps_failed >= 1;

		if (!isDegradedDuration && !hasFailures) continue;

		maxDuration = Math.max(maxDuration, p.duration_ms);
		totalFailures += p.steps_failed;
		triggeringResults++;
	}

	if (triggeringResults === 0) return undefined;

	return {
		max_duration_ms: maxDuration,
		total_steps_failed: totalFailures,
		result_count: triggeringResults,
	};
}

/**
 * Phase 2.4 Wave 5: seven extractors shipped — payment gateway,
 * discount abuse, checkout abandonment, refund rate, form-excessive-
 * fields, sensitive-input trust gap, mobile CTA timing. Only
 * `repeat_purchase` stays unpopulated (no viable crawl proxy).
 *
 * Short-circuits to `{ suppressed_by_integration: true }` when the
 * caller signals a commerce integration covers the commerce-family
 * signals. The three behavioral-path heuristics (form_excessive_fields,
 * sensitive_input_trust_gap, mobile_cta_timing) suppress themselves
 * internally when BehavioralSession evidence is present.
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

	const checkoutAbandonment = extractCheckoutAbandonment(evidence);
	if (checkoutAbandonment) result.checkout_abandonment = checkoutAbandonment;

	const refundRate = extractRefundRate(evidence);
	if (refundRate) result.refund_rate = refundRate;

	const formExcessive = extractFormExcessiveFields(evidence);
	if (formExcessive) result.form_excessive_fields = formExcessive;

	const trustGap = extractSensitiveInputTrustGap(evidence);
	if (trustGap) result.sensitive_input_trust_gap = trustGap;

	const mobileCta = extractMobileCtaTiming(evidence);
	if (mobileCta) result.mobile_cta_timing = mobileCta;

	return result;
}
