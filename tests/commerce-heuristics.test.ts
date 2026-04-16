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
