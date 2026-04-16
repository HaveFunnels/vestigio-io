/**
 * Commerce Heuristic Extractors — Phase 2.4 Wave 1
 *
 * Covers the two shipped heuristics: payment-gateway detection and
 * discount-abuse exposure. Both should:
 *   - Suppress themselves when commerce integration is available
 *   - Respect sample floors (reject tiny samples)
 *   - Produce expected output shape at the signal-engine boundary
 *
 * Run: npx tsx --test tests/commerce-heuristics.test.ts
 */

import {
	test,
	assert,
	assertEqual,
	printResults,
	resetCounters,
	getResults,
	testScoping,
	testEvidence,
	pageContentEvidence,
	providerEvidence,
} from "./helpers";

import {
	EvidenceType,
	type Evidence,
	type IframePayload,
	type MetaPayload,
	type PageContentPayload,
	type ScriptPayload,
	type TechnologyDetectedPayload,
} from "../packages/domain";

import {
	extractCommerceHeuristicSignals,
} from "../packages/signals/commerce-heuristic";

import { buildGraph } from "../packages/graph";
import { extractSignals } from "../packages/signals";
import type { CommerceContext } from "../packages/integrations/commerce-context";

function emptyCommerceContext(
	overrides: Partial<CommerceContext> = {},
): CommerceContext {
	return {
		abandonment_rate: null,
		abandonment_value_monthly: null,
		repeat_purchase_rate: null,
		new_vs_returning_ratio: null,
		avg_customer_lifetime_value: null,
		total_products: null,
		products_never_sold_30d: null,
		out_of_stock_promoted_count: null,
		top_products_by_revenue: [],
		refund_rate: null,
		discount_usage_rate: null,
		payment_gateway_concentration: null,
		mrr: null,
		subscriber_churn_rate: null,
		failed_payment_rate: null,
		total_ad_spend_monthly: null,
		ad_spend_by_platform: {},
		sources: [],
		basis_type: "data_driven",
		...overrides,
	};
}

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(name: string, fn: () => void): void {
	resetCounters();
	fn();
	const r = getResults();
	printResults(name);
	if (r.failed > 0) suitesFailed++;
	else suitesPassed++;
}

// ──────────────────────────────────────────────
// Helper factories for heuristic-specific evidence
// ──────────────────────────────────────────────

function iframeEvidence(
	pageUrl: string,
	src: string,
	knownProvider: string | null,
): Evidence {
	const host = (() => {
		try {
			return new URL(src).hostname;
		} catch {
			return src;
		}
	})();
	return testEvidence(EvidenceType.Iframe, {
		type: "iframe",
		page_url: pageUrl,
		src,
		host,
		is_external: true,
		known_provider: knownProvider,
	} as IframePayload);
}

function technologyDetectedEvidence(
	category: string,
	key: string,
	displayName: string,
	detectedOn: string[] = ["https://example.com/"],
): Evidence {
	return testEvidence(EvidenceType.TechnologyDetected, {
		type: "technology_detected",
		technology_key: key,
		display_name: displayName,
		category,
		confidence: 80,
		detection_source: "script",
		detected_on: detectedOn,
		logo_key: null,
	} as TechnologyDetectedPayload);
}

function metaEvidenceWithOgTags(
	pageUrl: string,
	ogTags: Record<string, string>,
): Evidence {
	return testEvidence(EvidenceType.Meta, {
		type: "meta",
		page_url: pageUrl,
		robots: null,
		viewport: null,
		og_tags: ogTags,
		structured_data: [],
	} as MetaPayload);
}

function pageContentWithMeta(
	url: string,
	title: string | null,
	metaDescription: string | null,
): Evidence {
	return testEvidence(EvidenceType.PageContent, {
		type: "page_content",
		url,
		title,
		meta_description: metaDescription,
		h1: title,
		canonical_url: null,
		lang: "en",
		has_forms: false,
		form_count: 0,
		script_count: 0,
		external_script_count: 0,
		internal_link_count: 5,
		external_link_count: 0,
	} as PageContentPayload);
}

// ══════════════════════════════════════════════════
// Suppression contract
// ══════════════════════════════════════════════════

runSuite("Commerce Heuristics — Suppression", () => {
	test("returns suppressed_by_integration when commerce integration available", () => {
		const result = extractCommerceHeuristicSignals([], {
			has_commerce_integration: true,
		});
		assertEqual(
			result.suppressed_by_integration,
			true,
			"suppressed flag set",
		);
		assertEqual(
			result.payment_gateway,
			undefined,
			"no payment heuristic emitted",
		);
		assertEqual(
			result.discount_abuse,
			undefined,
			"no discount heuristic emitted",
		);
	});

	test("emits heuristics when no integration", () => {
		const ev = [
			providerEvidence("https://example.com/", "Stripe"),
			providerEvidence("https://example.com/checkout", "Stripe"),
		];
		const result = extractCommerceHeuristicSignals(ev, {
			has_commerce_integration: false,
		});
		assert(result.payment_gateway !== undefined, "payment gateway emitted");
		assertEqual(
			result.suppressed_by_integration,
			undefined,
			"no suppression",
		);
	});
});

// ══════════════════════════════════════════════════
// Payment-gateway extractor
// ══════════════════════════════════════════════════

runSuite("Commerce Heuristics — Payment Gateway", () => {
	test("detects single gateway from provider indicators across 2+ pages", () => {
		const ev = [
			providerEvidence("https://example.com/", "Stripe"),
			providerEvidence("https://example.com/checkout", "Stripe"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		assertEqual(result.payment_gateway!.gateway_count, 1, "one gateway");
		assertEqual(
			result.payment_gateway!.detected_gateways[0],
			"Stripe",
			"canonical name",
		);
		assertEqual(result.payment_gateway!.sample_size, 2, "sample size");
	});

	test("detects multiple gateways from mixed evidence sources", () => {
		const ev = [
			iframeEvidence(
				"https://example.com/cart",
				"https://js.stripe.com/v3",
				"stripe",
			),
			providerEvidence("https://example.com/checkout", "PayPal"),
			providerEvidence("https://example.com/cart", "PayPal"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		assertEqual(
			result.payment_gateway!.gateway_count,
			2,
			"two distinct gateways",
		);
	});

	test("normalises Stripe from iframe, technology, and provider to one canonical entry", () => {
		const ev = [
			iframeEvidence(
				"https://example.com/checkout",
				"https://js.stripe.com/v3",
				"stripe",
			),
			providerEvidence("https://example.com/cart", "stripe"),
			technologyDetectedEvidence(
				"payment_provider",
				"stripe",
				"Stripe",
				["https://example.com/cart", "https://example.com/checkout"],
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		assertEqual(result.payment_gateway!.gateway_count, 1, "collapsed");
		assertEqual(
			result.payment_gateway!.detected_gateways[0],
			"Stripe",
			"canonical",
		);
	});

	test("rejects single-page detection as insufficient sample", () => {
		const ev = [providerEvidence("https://example.com/checkout", "Stripe")];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.payment_gateway,
			undefined,
			"below 2-page floor → no emission",
		);
	});

	test("ignores non-payment technology detections", () => {
		const ev = [
			technologyDetectedEvidence(
				"analytics",
				"google_analytics",
				"Google Analytics",
			),
			technologyDetectedEvidence(
				"support_widget",
				"intercom",
				"Intercom",
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.payment_gateway,
			undefined,
			"analytics/support not counted",
		);
	});

	test("ignores unknown provider strings", () => {
		const ev = [
			providerEvidence("https://example.com/", "SomeUnknownGateway"),
			providerEvidence(
				"https://example.com/checkout",
				"AnotherRandomThing",
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.payment_gateway,
			undefined,
			"unknown names skipped",
		);
	});

	test("picks up Mercado Pago from Brazilian storefront script", () => {
		const ev = [
			testEvidence(EvidenceType.Script, {
				type: "script",
				page_url: "https://loja.com.br/",
				src: "https://sdk.mercadopago.com/js/v2",
				host: "sdk.mercadopago.com",
				is_external: true,
				known_provider: null,
			} as ScriptPayload),
			testEvidence(EvidenceType.Script, {
				type: "script",
				page_url: "https://loja.com.br/checkout",
				src: "https://sdk.mercadopago.com/js/v2",
				host: "sdk.mercadopago.com",
				is_external: true,
				known_provider: null,
			} as ScriptPayload),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		assertEqual(
			result.payment_gateway!.detected_gateways[0],
			"Mercado Pago",
			"canonical BR name",
		);
	});

	test("covers BR infoproduct marketplaces (Hotmart, Kiwify, CartPanda)", () => {
		const ev = [
			providerEvidence("https://curso.com.br/", "Hotmart"),
			providerEvidence("https://curso.com.br/checkout", "Kiwify"),
			providerEvidence("https://curso.com.br/upsell", "CartPanda"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		assertEqual(result.payment_gateway!.gateway_count, 3, "three distinct");
		assert(
			result.payment_gateway!.detected_gateways.includes("Hotmart"),
			"Hotmart",
		);
		assert(
			result.payment_gateway!.detected_gateways.includes("Kiwify"),
			"Kiwify",
		);
		assert(
			result.payment_gateway!.detected_gateways.includes("CartPanda"),
			"CartPanda",
		);
	});

	test("covers BR acquirers via hint regex on iframe hosts", () => {
		const ev = [
			iframeEvidence(
				"https://loja.com.br/checkout",
				"https://checkout.appmax.com.br/finalizar",
				null,
			),
			iframeEvidence(
				"https://loja.com.br/cart",
				"https://secure.vindi.com.br/subscribe",
				null,
			),
			providerEvidence("https://loja.com.br/cart", "Iugu"),
			providerEvidence("https://loja.com.br/checkout", "Asaas"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		const detected = result.payment_gateway!.detected_gateways;
		assert(detected.includes("Appmax"), "Appmax via hint regex");
		assert(detected.includes("Vindi"), "Vindi via hint regex");
		assert(detected.includes("Iugu"), "Iugu");
		assert(detected.includes("Asaas"), "Asaas");
	});

	test("covers Nuvei + Efí (gerencianet alias)", () => {
		const ev = [
			providerEvidence("https://example.com/", "Nuvei"),
			providerEvidence("https://example.com/cart", "gerencianet"),
			providerEvidence("https://example.com/checkout", "Nuvei"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.payment_gateway !== undefined, "emitted");
		const detected = result.payment_gateway!.detected_gateways;
		assert(detected.includes("Nuvei"), "Nuvei canonical");
		assert(
			detected.includes("Efí"),
			"gerencianet collapses to Efí canonical",
		);
	});
});

// ══════════════════════════════════════════════════
// Discount-abuse extractor
// ══════════════════════════════════════════════════

function buildPromoPage(
	url: string,
	title: string | null,
	metaDescription: string | null,
): Evidence {
	return pageContentWithMeta(url, title, metaDescription);
}

function blankPages(count: number, baseUrl: string): Evidence[] {
	const out: Evidence[] = [];
	for (let i = 0; i < count; i++) {
		out.push(pageContentEvidence(`${baseUrl}/page-${i}`, `Page ${i}`));
	}
	return out;
}

runSuite("Commerce Heuristics — Discount Abuse", () => {
	test("detects sitewide promo code in page title and meta", () => {
		const pages = blankPages(15, "https://example.com");
		pages[0] = buildPromoPage(
			"https://example.com/",
			"Welcome — USE CODE SAVE20 for 20% off",
			null,
		);
		pages[1] = buildPromoPage(
			"https://example.com/shop",
			"Shop now",
			"Apply code FIRST10 at checkout",
		);
		const result = extractCommerceHeuristicSignals(pages);
		assert(result.discount_abuse !== undefined, "emitted");
		assertEqual(result.discount_abuse!.sample_size, 15, "pages scanned");
		assert(
			result.discount_abuse!.exposed_codes!.includes("SAVE20"),
			"SAVE20 captured",
		);
		assert(
			result.discount_abuse!.exposed_codes!.includes("FIRST10"),
			"FIRST10 captured",
		);
	});

	test("detects promo codes in OG tags", () => {
		const pages = blankPages(12, "https://shop.example.com");
		pages.push(
			metaEvidenceWithOgTags("https://shop.example.com/home", {
				"og:description":
					"Biggest sale ever — use code BLACKFRIDAY for 30% off",
				"og:title": "Shop — Black Friday",
			}),
		);
		const result = extractCommerceHeuristicSignals(pages);
		assert(result.discount_abuse !== undefined, "emitted");
		assert(
			result.discount_abuse!.exposed_codes!.includes("BLACKFRIDAY"),
			"OG code captured",
		);
	});

	test("respects 10-page sample floor", () => {
		const pages: Evidence[] = [
			buildPromoPage(
				"https://example.com/",
				"USE CODE SAVE10",
				null,
			),
			buildPromoPage(
				"https://example.com/about",
				"USE CODE SAVE10",
				null,
			),
		];
		const result = extractCommerceHeuristicSignals(pages);
		assertEqual(
			result.discount_abuse,
			undefined,
			"under 10 pages → suppressed",
		);
	});

	test("no emission when no promo codes in sample", () => {
		const pages = blankPages(20, "https://clean.example.com");
		const result = extractCommerceHeuristicSignals(pages);
		assertEqual(
			result.discount_abuse,
			undefined,
			"clean site → no emission",
		);
	});

	test("ignores generic stopwords masquerading as codes", () => {
		const pages = blankPages(15, "https://example.com");
		pages[0] = buildPromoPage(
			"https://example.com/",
			"Use code: SHOP and code: CART right now",
			null,
		);
		const result = extractCommerceHeuristicSignals(pages);
		assertEqual(
			result.discount_abuse,
			undefined,
			"stopwords filtered out",
		);
	});

	test("exposure ratio reflects coverage across scanned pages", () => {
		const pages = blankPages(20, "https://example.com");
		pages[0] = buildPromoPage(
			"https://example.com/home",
			"USE CODE SAVE10",
			null,
		);
		pages[1] = buildPromoPage(
			"https://example.com/a",
			"USE CODE SAVE10",
			null,
		);
		pages[2] = buildPromoPage(
			"https://example.com/b",
			"USE CODE SAVE10",
			null,
		);
		pages[3] = buildPromoPage(
			"https://example.com/c",
			"USE CODE SAVE10",
			null,
		);
		const result = extractCommerceHeuristicSignals(pages);
		assert(result.discount_abuse !== undefined, "emitted");
		// 4 pages with code / 20 scanned = 0.20
		const exposure = result.discount_abuse!.exposure;
		assert(
			exposure >= 0.19 && exposure <= 0.21,
			`exposure ~0.20, got ${exposure}`,
		);
	});

	test("picks up Portuguese promo vocabulary (cupom)", () => {
		const pages = blankPages(15, "https://loja.com.br");
		pages[0] = buildPromoPage(
			"https://loja.com.br/",
			null,
			"Cupom PRIMEIRACOMPRA para 15% de desconto",
		);
		const result = extractCommerceHeuristicSignals(pages);
		assert(result.discount_abuse !== undefined, "emitted");
		assert(
			result.discount_abuse!.exposed_codes!.includes("PRIMEIRACOMPRA"),
			"pt-BR code captured",
		);
	});
});

// ══════════════════════════════════════════════════
// Checkout-abandonment extractor
// ══════════════════════════════════════════════════

import { formEvidence } from "./helpers";

function paymentFormEvidence(
	pageUrl: string,
	fieldCount: number,
): Evidence {
	const fields = Array.from({ length: fieldCount }, (_, i) => `field_${i}`);
	return testEvidence(EvidenceType.Form, {
		type: "form",
		page_url: pageUrl,
		action: `${pageUrl}/submit`,
		method: "POST",
		target_host: "example.com",
		is_external: false,
		field_names: fields,
		has_payment_fields: true,
	} as any);
}

runSuite("Commerce Heuristics — Checkout Abandonment", () => {
	test("emits high-abandonment rate for 15+ field payment form", () => {
		const ev = [paymentFormEvidence("https://example.com/checkout", 18)];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.checkout_abandonment !== undefined,
			"emitted",
		);
		assertEqual(
			result.checkout_abandonment!.rate,
			0.75,
			"critical friction rate",
		);
		assertEqual(
			result.checkout_abandonment!.basis,
			"form_submit_failure_ratio",
			"basis",
		);
	});

	test("emits moderate abandonment for 10-14 field payment form", () => {
		const ev = [paymentFormEvidence("https://example.com/checkout", 12)];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.checkout_abandonment !== undefined, "emitted");
		assertEqual(
			result.checkout_abandonment!.rate,
			0.68,
			"moderate friction rate",
		);
	});

	test("skips when payment form has <10 fields", () => {
		const ev = [paymentFormEvidence("https://example.com/checkout", 8)];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.checkout_abandonment,
			undefined,
			"below 10-field floor",
		);
	});

	test("skips when no payment forms detected", () => {
		const ev = [formEvidence("https://example.com/contact", "/submit", false, false)];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.checkout_abandonment,
			undefined,
			"no payment forms",
		);
	});

	test("picks worst-case form when multiple payment forms present", () => {
		const ev = [
			paymentFormEvidence("https://example.com/cart", 8),
			paymentFormEvidence("https://example.com/checkout", 16),
			paymentFormEvidence("https://example.com/confirmation", 5),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.checkout_abandonment !== undefined, "emitted");
		assertEqual(
			result.checkout_abandonment!.rate,
			0.75,
			"picked worst-case (16 fields)",
		);
		assertEqual(
			result.checkout_abandonment!.sample_size,
			3,
			"all payment forms in sample",
		);
	});
});

// ══════════════════════════════════════════════════
// Refund-rate extractor
// ══════════════════════════════════════════════════

function refundPolicyEvidence(
	url: string,
	overrides: Partial<{
		has_return_window: boolean | null;
		has_refund_process: boolean | null;
		word_count: number | null;
		policy_type: string;
	}> = {},
): Evidence {
	return testEvidence(EvidenceType.PolicyPage, {
		type: "policy_page",
		url,
		policy_type: overrides.policy_type ?? "refund",
		detected: true,
		confidence: 75,
		word_count: overrides.word_count ?? 500,
		has_return_window: overrides.has_return_window ?? true,
		has_refund_process: overrides.has_refund_process ?? true,
		has_contact_info: true,
		has_shipping_info: null,
		has_cancellation_terms: null,
		section_count: 3,
	} as any);
}

runSuite("Commerce Heuristics — Refund Rate", () => {
	test("emits elevated rate when return-window AND refund-process missing", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/refund", {
				has_return_window: false,
				has_refund_process: false,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.refund_rate !== undefined, "emitted");
		assertEqual(result.refund_rate!.rate, 0.08, "just-above-threshold rate");
		assertEqual(
			result.refund_rate!.basis,
			"policy_mention_density",
			"basis",
		);
	});

	test("emits when word_count extremes compound with missing return window", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/refund", {
				has_return_window: false,
				word_count: 80,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.refund_rate !== undefined,
			"emitted — short policy + missing window",
		);
	});

	test("skips when only one friction indicator present", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/refund", {
				has_return_window: false,
				has_refund_process: true,
				word_count: 600,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.refund_rate,
			undefined,
			"single indicator insufficient",
		);
	});

	test("skips when refund policy fields are all nullish (not crawled)", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/refund", {
				has_return_window: null,
				has_refund_process: null,
				word_count: null,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.refund_rate,
			undefined,
			"null fields → neutral, not friction",
		);
	});

	test("skips when no refund/terms policy detected", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/privacy", {
				has_return_window: false,
				has_refund_process: false,
				policy_type: "privacy",
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.refund_rate,
			undefined,
			"non-refund policy ignored",
		);
	});

	test("over-long policy (>2000 words) + missing process triggers", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/refund", {
				has_refund_process: false,
				word_count: 3500,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.refund_rate !== undefined,
			"emitted — buried policy + missing process",
		);
	});
});

// ══════════════════════════════════════════════════
// Form-excessive-fields extractor
// ══════════════════════════════════════════════════

function longForm(
	pageUrl: string,
	action: string,
	fieldCount: number,
	hasPaymentFields: boolean = false,
): Evidence {
	const fields = Array.from({ length: fieldCount }, (_, i) => `f_${i}`);
	return testEvidence(EvidenceType.Form, {
		type: "form",
		page_url: pageUrl,
		action,
		method: "POST",
		target_host: null,
		is_external: false,
		field_names: fields,
		has_payment_fields: hasPaymentFields,
	} as any);
}

runSuite("Commerce Heuristics — Form Excessive Fields", () => {
	test("emits when 2+ conversion-proximate forms exceed field floor", () => {
		const ev = [
			longForm(
				"https://example.com/checkout",
				"https://example.com/checkout/submit",
				12,
				true,
			),
			longForm(
				"https://example.com/signup",
				"https://example.com/signup/submit",
				9,
				false,
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.form_excessive_fields !== undefined, "emitted");
		assertEqual(result.form_excessive_fields!.form_count, 2, "2 forms");
		assertEqual(
			result.form_excessive_fields!.max_field_count,
			12,
			"max field count",
		);
	});

	test("skips when only 1 excessive form found", () => {
		const ev = [
			longForm(
				"https://example.com/checkout",
				"https://example.com/checkout/submit",
				12,
				true,
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.form_excessive_fields,
			undefined,
			"single form insufficient",
		);
	});

	test("ignores non-conversion-proximate forms (e.g. admin/search)", () => {
		const ev = [
			longForm(
				"https://example.com/admin/settings",
				"/admin/save",
				15,
				false,
			),
			longForm(
				"https://example.com/search",
				"/search",
				10,
				false,
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.form_excessive_fields,
			undefined,
			"non-conversion URLs skipped",
		);
	});

	test("classifies payment form as conversion-proximate regardless of URL", () => {
		const ev = [
			longForm("https://example.com/pay", "/api/pay", 6, true),
			longForm("https://example.com/finalize", "/api/go", 6, true),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.form_excessive_fields !== undefined,
			"payment forms classify as proximate",
		);
		assertEqual(result.form_excessive_fields!.form_count, 2, "both counted");
	});

	test("payment forms use lower 5-field threshold", () => {
		const ev = [
			longForm("https://example.com/cart", "/cart/submit", 4, true),
			longForm("https://example.com/checkout", "/submit", 4, true),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.form_excessive_fields,
			undefined,
			"4 fields below payment floor",
		);
	});

	test("non-payment forms require 7+ fields", () => {
		const ev = [
			longForm("https://example.com/signup", "/signup", 6, false),
			longForm("https://example.com/contact", "/contact", 6, false),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.form_excessive_fields,
			undefined,
			"6 fields below non-payment floor",
		);
	});

	test("detects pt-BR conversion URLs (cadastro, orcamento, pagamento)", () => {
		const ev = [
			longForm("https://loja.com.br/cadastro", "/api/cadastro", 9),
			longForm("https://loja.com.br/orcamento", "/api/orcamento", 8),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.form_excessive_fields !== undefined,
			"BR tokens recognized",
		);
	});

	test("suppresses when BehavioralSession evidence present", () => {
		const ev = [
			longForm("https://example.com/checkout", "/submit", 12, true),
			longForm("https://example.com/signup", "/signup", 9, false),
			testEvidence(EvidenceType.BehavioralSession, {
				type: "behavioral_session",
				session_count: 50,
				form_excessive_field_count: 0,
			} as any),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.form_excessive_fields,
			undefined,
			"behavioral path takes priority",
		);
	});

	test("collects urls deduped + sorted", () => {
		const ev = [
			longForm("https://example.com/checkout", "/submit", 12, true),
			longForm("https://example.com/checkout", "/submit-v2", 11, true),
			longForm("https://example.com/signup", "/signup", 9, false),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.form_excessive_fields !== undefined, "emitted");
		assertEqual(
			result.form_excessive_fields!.form_urls.length,
			2,
			"deduped urls",
		);
		assertEqual(
			result.form_excessive_fields!.form_urls[0],
			"https://example.com/checkout",
			"sorted — checkout first",
		);
	});
});

// ══════════════════════════════════════════════════
// Sensitive-input trust-gap extractor
// ══════════════════════════════════════════════════

function sensitiveForm(
	pageUrl: string,
	options: {
		payment?: boolean;
		sensitiveFieldName?: string;
		extraFields?: string[];
	} = {},
): Evidence {
	const fields = [...(options.extraFields ?? ['email'])];
	if (options.sensitiveFieldName) fields.push(options.sensitiveFieldName);
	return testEvidence(EvidenceType.Form, {
		type: "form",
		page_url: pageUrl,
		action: `${pageUrl}/submit`,
		method: "POST",
		target_host: null,
		is_external: false,
		field_names: fields,
		has_payment_fields: options.payment ?? false,
	} as any);
}

function structuredDataTrustEvidence(pageUrl: string): Evidence {
	return testEvidence(EvidenceType.StructuredDataItem, {
		type: "structured_data_item",
		page_url: pageUrl,
		schema_type: "Organization",
		name: "Example Org",
		is_trust_signal: true,
		is_commerce_signal: false,
	} as any);
}

function trustScriptEvidence(pageUrl: string, src: string): Evidence {
	return testEvidence(EvidenceType.Script, {
		type: "script",
		page_url: pageUrl,
		src,
		host: (() => {
			try {
				return new URL(src).hostname;
			} catch {
				return src;
			}
		})(),
		is_external: true,
		known_provider: null,
	} as any);
}

runSuite("Commerce Heuristics — Sensitive Input Trust Gap", () => {
	test("emits gap when payment form has no co-located trust signals", () => {
		const ev = [sensitiveForm("https://example.com/checkout", { payment: true })];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.sensitive_input_trust_gap !== undefined,
			"emitted",
		);
		assertEqual(
			result.sensitive_input_trust_gap!.gap_page_count,
			1,
			"one gap page",
		);
		assertEqual(
			result.sensitive_input_trust_gap!.has_zero_trust_page,
			true,
			"zero trust → high severity",
		);
	});

	test("detects sensitive fields by name tokens (password, cpf, card)", () => {
		const ev = [
			sensitiveForm("https://example.com/login", {
				sensitiveFieldName: "password",
			}),
			sensitiveForm("https://example.com/cadastro", {
				sensitiveFieldName: "cpf",
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.sensitive_input_trust_gap !== undefined, "emitted");
		assertEqual(
			result.sensitive_input_trust_gap!.gap_page_count,
			2,
			"both pages flagged",
		);
	});

	test("suppresses emission when page has 2+ trust signals", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			structuredDataTrustEvidence("https://example.com/checkout"),
			trustScriptEvidence(
				"https://example.com/checkout",
				"https://widget.trustpilot.com/bootstrap.js",
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.sensitive_input_trust_gap,
			undefined,
			"enough trust signals → no gap",
		);
	});

	test("emits medium when page has exactly 1 trust signal", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			structuredDataTrustEvidence("https://example.com/checkout"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.sensitive_input_trust_gap !== undefined, "emitted");
		assertEqual(
			result.sensitive_input_trust_gap!.has_zero_trust_page,
			false,
			"has one signal → not zero-trust",
		);
	});

	test("ignores non-sensitive forms (contact with only name+email)", () => {
		const ev = [
			testEvidence(EvidenceType.Form, {
				type: "form",
				page_url: "https://example.com/contact",
				action: "/contact",
				method: "POST",
				target_host: null,
				is_external: false,
				field_names: ["name", "email", "message"],
				has_payment_fields: false,
			} as any),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.sensitive_input_trust_gap,
			undefined,
			"contact form not sensitive",
		);
	});

	test("counts trust signals from technology detections", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			technologyDetectedEvidence(
				"reviews",
				"trustpilot",
				"Trustpilot",
				["https://example.com/checkout"],
			),
			technologyDetectedEvidence(
				"trust_seal",
				"norton_seal",
				"Norton Secured",
				["https://example.com/checkout"],
			),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.sensitive_input_trust_gap,
			undefined,
			"2 trust techs → no gap",
		);
	});

	test("counts trust iframe (Trustpilot widget)", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			iframeEvidence(
				"https://example.com/checkout",
				"https://widget.trustpilot.com/trustboxes/v1",
				"trustpilot",
			),
			structuredDataTrustEvidence("https://example.com/checkout"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.sensitive_input_trust_gap,
			undefined,
			"trust iframe + structured data → enough",
		);
	});

	test("trust signal on different URL does NOT count", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			structuredDataTrustEvidence("https://example.com/about"),
			structuredDataTrustEvidence("https://example.com/policies"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(
			result.sensitive_input_trust_gap !== undefined,
			"emitted — signals on other pages don't count",
		);
	});

	test("suppresses when BehavioralSession evidence present", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			testEvidence(EvidenceType.BehavioralSession, {
				type: "behavioral_session",
				session_count: 50,
			} as any),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.sensitive_input_trust_gap,
			undefined,
			"behavioral takes priority",
		);
	});

	test("deduplicates multiple forms on same page", () => {
		const ev = [
			sensitiveForm("https://example.com/checkout", { payment: true }),
			sensitiveForm("https://example.com/checkout", {
				sensitiveFieldName: "cpf",
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.sensitive_input_trust_gap !== undefined, "emitted");
		assertEqual(
			result.sensitive_input_trust_gap!.sensitive_page_count,
			1,
			"single page despite 2 forms",
		);
	});
});

// ══════════════════════════════════════════════════
// Mobile-CTA-timing extractor
// ══════════════════════════════════════════════════

function mobileVerificationEvidence(
	targetUrl: string,
	overrides: Partial<{
		commercial_path_reachable: boolean;
		checkout_reachable: boolean;
		steps_succeeded: number;
		steps_failed: number;
		trust_degraded_vs_desktop: boolean;
		duration_ms: number;
	}> = {},
): Evidence {
	return testEvidence(EvidenceType.MobileVerificationResult, {
		type: "mobile_verification_result",
		target_url: targetUrl,
		commercial_path_reachable: overrides.commercial_path_reachable ?? true,
		checkout_reachable: overrides.checkout_reachable ?? true,
		steps_succeeded: overrides.steps_succeeded ?? 4,
		steps_failed: overrides.steps_failed ?? 0,
		commercial_errors_count: 0,
		trust_degraded_vs_desktop: overrides.trust_degraded_vs_desktop ?? false,
		duration_ms: overrides.duration_ms ?? 3000,
		final_url: targetUrl,
	} as any);
}

runSuite("Commerce Heuristics — Mobile CTA Timing", () => {
	test("emits when mobile journey has step failures", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				steps_failed: 2,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.mobile_cta_timing !== undefined, "emitted");
		assertEqual(
			result.mobile_cta_timing!.total_steps_failed,
			2,
			"2 failures",
		);
	});

	test("emits when mobile duration exceeds 8000ms", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				duration_ms: 12000,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.mobile_cta_timing !== undefined, "emitted");
		assertEqual(
			result.mobile_cta_timing!.max_duration_ms,
			12000,
			"captured duration",
		);
	});

	test("skips when mobile journey is fast and clean", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				duration_ms: 4500,
				steps_failed: 0,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.mobile_cta_timing,
			undefined,
			"no friction → skip",
		);
	});

	test("skips when checkout unreachable (different signal fires)", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				checkout_reachable: false,
				steps_failed: 3,
				duration_ms: 20000,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.mobile_cta_timing,
			undefined,
			"blocked path → mobile_commercial_path_blocked handles this",
		);
	});

	test("aggregates across multiple mobile results", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				steps_failed: 1,
				duration_ms: 5000,
			}),
			mobileVerificationEvidence("https://example.com/cart", {
				steps_failed: 2,
				duration_ms: 11000,
			}),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assert(result.mobile_cta_timing !== undefined, "emitted");
		assertEqual(
			result.mobile_cta_timing!.result_count,
			2,
			"both triggered",
		);
		assertEqual(
			result.mobile_cta_timing!.total_steps_failed,
			3,
			"summed failures",
		);
		assertEqual(
			result.mobile_cta_timing!.max_duration_ms,
			11000,
			"max duration",
		);
	});

	test("suppresses when BehavioralSession evidence present", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				steps_failed: 2,
			}),
			testEvidence(EvidenceType.BehavioralSession, {
				type: "behavioral_session",
				session_count: 50,
			} as any),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.mobile_cta_timing,
			undefined,
			"behavioral takes priority",
		);
	});

	test("no emission when no mobile verification evidence", () => {
		const ev = [
			pageContentEvidence("https://example.com/"),
		];
		const result = extractCommerceHeuristicSignals(ev);
		assertEqual(
			result.mobile_cta_timing,
			undefined,
			"no mobile evidence → skip",
		);
	});
});

// ══════════════════════════════════════════════════
// Signal-engine end-to-end wiring
// ══════════════════════════════════════════════════

runSuite("Commerce Heuristics — Signal Engine Wiring", () => {
	test("extractSignals emits payment_gateway_concentrated at heuristic confidence", () => {
		const ev = [
			providerEvidence("https://example.com/", "Stripe"),
			providerEvidence("https://example.com/checkout", "Stripe"),
		];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "payment_gateway_concentrated",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 65, "heuristic confidence");
		assertEqual(sig!.numeric_value, 100, "100% concentration");
	});

	test("extractSignals emits discount_usage_elevated at heuristic confidence", () => {
		const pages = blankPages(20, "https://example.com");
		pages[0] = buildPromoPage(
			"https://example.com/home",
			"USE CODE SAVE10",
			null,
		);
		pages[1] = buildPromoPage(
			"https://example.com/a",
			"USE CODE SAVE10",
			null,
		);
		pages[2] = buildPromoPage(
			"https://example.com/b",
			"apply code FIRST10 now",
			null,
		);
		pages[3] = buildPromoPage(
			"https://example.com/c",
			"USE CODE SAVE10",
			null,
		);
		const graph = buildGraph(pages, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			pages,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "discount_usage_elevated",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 60, "heuristic confidence");
	});

	test("extractSignals emits checkout_abandonment_rate_high at heuristic confidence", () => {
		const ev = [paymentFormEvidence("https://example.com/checkout", 16)];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "checkout_abandonment_rate_high",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 60, "heuristic confidence");
		assertEqual(sig!.value, "high", "high severity for 75% rate");
	});

	test("extractSignals emits form_excessive_fields_before_conversion at heuristic confidence", () => {
		const ev = [
			longForm("https://example.com/checkout", "/submit", 14, true),
			longForm("https://example.com/signup", "/signup", 8, false),
			longForm("https://example.com/contact", "/contact", 9, false),
		];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "form_excessive_fields_before_conversion",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 55, "heuristic confidence (below behavioral 60)");
		assertEqual(sig!.value, "high", "3 forms → high severity");
		assertEqual(sig!.numeric_value, 3, "numeric_value = form count");
	});

	test("extractSignals emits mobile_cta_timing_degraded at lowest heuristic confidence", () => {
		const ev = [
			mobileVerificationEvidence("https://example.com/checkout", {
				steps_failed: 2,
				duration_ms: 16000,
			}),
		];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "mobile_cta_timing_degraded",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 50, "lowest heuristic confidence");
		assertEqual(sig!.value, "high", "2+ failures → high severity");
	});

	test("extractSignals emits sensitive_input_trust_gap at heuristic confidence", () => {
		const ev = [sensitiveForm("https://example.com/checkout", { payment: true })];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "sensitive_input_trust_gap",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 55, "heuristic confidence (below behavioral 65)");
		assertEqual(sig!.value, "high", "zero-trust page → high severity");
	});

	test("extractSignals emits refund_rate_elevated at heuristic confidence", () => {
		const ev = [
			refundPolicyEvidence("https://example.com/refund", {
				has_return_window: false,
				has_refund_process: false,
			}),
		];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
		);
		const sig = signals.find(
			(s) => s.signal_key === "refund_rate_elevated",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 55, "heuristic confidence");
	});

	test("ads context: emits ad_spend_platform_concentrated when one platform dominates", () => {
		const ev: Evidence[] = [];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
			emptyCommerceContext({
				total_ad_spend_monthly: 10000,
				ad_spend_by_platform: { meta_ads: 9500, google_ads: 500 },
				sources: ['shopify'],
			}),
		);
		const sig = signals.find(
			(s) => s.signal_key === "ad_spend_platform_concentrated",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 90, "data-driven confidence");
		assertEqual(sig!.value, "high", "95% concentration → high severity");
	});

	test("ads context: does NOT emit concentration when spend is balanced", () => {
		const ev: Evidence[] = [];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
			emptyCommerceContext({
				total_ad_spend_monthly: 10000,
				ad_spend_by_platform: { meta_ads: 6000, google_ads: 4000 },
				sources: ['shopify'],
			}),
		);
		const sig = signals.find(
			(s) => s.signal_key === "ad_spend_platform_concentrated",
		);
		assertEqual(sig, undefined, "60% concentration below 70% floor");
	});

	test("ads context: emits ads_active_without_conversion_tracking when no commerce source", () => {
		const ev: Evidence[] = [];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
			emptyCommerceContext({
				total_ad_spend_monthly: 5000,
				ad_spend_by_platform: { meta_ads: 3000, google_ads: 2000 },
				sources: ['meta_ads', 'google_ads'],
			}),
		);
		const sig = signals.find(
			(s) => s.signal_key === "ads_active_without_conversion_tracking",
		);
		assert(sig !== undefined, "signal emitted");
		assertEqual(sig!.confidence, 95, "binary detection → high confidence");
		assertEqual(sig!.numeric_value, 5000, "spend carried as numeric");
	});

	test("ads context: DOES NOT emit conversion-gap when Shopify connected", () => {
		const ev: Evidence[] = [];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
			emptyCommerceContext({
				total_ad_spend_monthly: 5000,
				ad_spend_by_platform: { meta_ads: 3000, google_ads: 2000 },
				sources: ['meta_ads', 'google_ads', 'shopify'],
			}),
		);
		const sig = signals.find(
			(s) => s.signal_key === "ads_active_without_conversion_tracking",
		);
		assertEqual(sig, undefined, "shopify source → conversion tracking present");
	});

	test("ads context: silent when no ad spend data", () => {
		const ev: Evidence[] = [];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
			emptyCommerceContext({ sources: ['shopify'] }),
		);
		assertEqual(
			signals.find((s) => s.signal_key === "ad_spend_platform_concentrated"),
			undefined,
			"no spend → no concentration signal",
		);
		assertEqual(
			signals.find((s) => s.signal_key === "ads_active_without_conversion_tracking"),
			undefined,
			"no spend → no conversion-gap signal",
		);
	});

	test("does not double-emit when commerce_context provided", () => {
		const ev = [
			providerEvidence("https://example.com/", "Stripe"),
			providerEvidence("https://example.com/checkout", "Stripe"),
		];
		const graph = buildGraph(ev, "example.com", "audit_cycle:c1");
		const signals = extractSignals(
			ev,
			graph,
			testScoping(),
			"audit_cycle:c1",
			emptyCommerceContext({
				abandonment_rate: 0.70,
				payment_gateway_concentration: 0.99,
			}),
		);
		const payment = signals.filter(
			(s) => s.signal_key === "payment_gateway_concentrated",
		);
		// Data-driven path emits at confidence 90; heuristic should stay silent.
		assertEqual(payment.length, 1, "single emission");
		assertEqual(
			payment[0].confidence,
			90,
			"data-driven confidence, not heuristic",
		);
	});
});

// Exit code for CI
if (suitesFailed > 0) {
	console.error(`\n✗ ${suitesFailed} suite(s) failed`);
	process.exit(1);
}
console.log(`\n✓ All ${suitesPassed} suite(s) passed`);
