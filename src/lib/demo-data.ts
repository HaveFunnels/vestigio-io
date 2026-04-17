import { buildCustomMap } from "../../packages/maps";
import type { MapDefinition } from "../../packages/maps";
import type {
	FindingProjection,
	ActionProjection,
	ProjectionResult,
} from "../../packages/projections";
import type { MultiPackResult } from "../../packages/workspace";

// ──────────────────────────────────────────────
// Demo data — realistic findings, actions, and maps for the demo org.
//
// These are the same 28 findings from scripts/populate-demo-findings.ts
// formatted as FindingProjection objects. The engine maps are derived
// from them using buildCustomMap so they're structurally accurate.
//
// Why not run the real engine? The demo org has no Evidence in Prisma
// (it's a fallback context, not a real organization). Creating
// synthetic evidence → engine recompute would work but is fragile
// and expensive. This module provides the same end result at zero cost.
// ──────────────────────────────────────────────

const BASE: Omit<
	FindingProjection,
	| "id"
	| "title"
	| "root_cause"
	| "severity"
	| "pack"
	| "surface"
	| "polarity"
	| "impact"
	| "inference_key"
	| "cause"
	| "effect"
	| "reasoning"
	| "change_class"
	| "verification_maturity"
	| "verification_method"
> = {
	confidence: 80,
	confidence_tier: "high",
	freshness: "fresh",
	basis_type: "evidence_based",
	eligibility: { eligible: true, confidence: 80 },
	truth_context: null,
	suppression_context: null,
	verification_strategy: null,
	verification_notes: null,
	remediation_steps: null,
	estimated_effort_hours: null,
	evidence_quality: {
		source_reliability: 85,
		completeness: 78,
		recency: 92,
		corroboration: 70,
		composite: 81,
	},
	verification_eta_seconds: null,
};

function f(
	key: string,
	title: string,
	rootCause: string | null,
	severity: "critical" | "high" | "medium" | "low",
	pack: string,
	surface: string,
	polarity: "negative" | "positive",
	impactMin: number,
	impactMax: number,
	impactMid: number,
	cause: string,
	effect: string,
	reasoning: string,
	changeClass: string | null = null,
	verMaturity = "confirmed",
): FindingProjection {
	return {
		...BASE,
		id: `demo_finding_${key}`,
		inference_key: key,
		title,
		root_cause: rootCause || null,
		severity,
		pack,
		surface,
		polarity,
		impact: {
			monthly_range: { min: impactMin, max: impactMax },
			midpoint: impactMid,
			impact_type: "revenue_loss",
			percentage_delta: null,
			currency: "USD",
			role: polarity === "positive" ? "retention" : "loss",
		},
		cause,
		effect,
		reasoning,
		change_class: changeClass,
		verification_maturity: verMaturity,
		verification_method: verMaturity === "confirmed" ? "browser_verified" : "static_only",
	} as FindingProjection;
}

export const DEMO_FINDINGS: FindingProjection[] = [
	f("checkout_off_domain", "Checkout redirects buyers to a different domain", "Untracked purchase paths", "high", "revenue_integrity", "/checkout", "negative", 2400, 4800, 3200, "Checkout flow redirects through 3 hops to Stripe hosted checkout, crossing 2 domains.", "50% of buyers drop off during the redirect chain.", "At $85 AOV and 3,420 monthly checkout starts, conservative 20% recovery estimate yields ~$3,200/mo.", "stable_risk"),
	f("conversion_tracking_absent", "No conversion tracking on checkout or thank-you page", "Commerce pages invisible to measurement", "high", "revenue_integrity", "/checkout", "negative", 800, 2400, 1600, "GA4, Facebook Pixel, and Segment are present on 6 pages but absent from checkout and thank-you.", "Ad platforms report $0 revenue, inflating CPA by 40-60%.", "Without purchase attribution, ad spend optimization is blind."),
	f("product_page_high_abandonment", "Product page abandonment 15pp above benchmark", "Friction barrier on conversion path", "medium", "revenue_integrity", "/products", "negative", 900, 2700, 1800, "70% of product page visitors leave without adding to cart (benchmark: 55-60%). 3.4s LCP and missing social proof contribute.", "Each percentage point of cart-add rate recovered equals ~$120/mo.", "Slow load time and absence of reviews suppress impulse purchases."),
	f("cart_intermittent_500", "Cart page fails with HTTP 500 during peak hours", "Runtime commerce fragility", "critical", "revenue_integrity", "/cart", "negative", 3000, 8000, 5000, "Cart page returns HTTP 500 during approximately 50% of peak traffic hours.", "Buyers see a blank error page with no recovery path.", "Error pattern correlates with traffic spikes — likely a backend capacity issue.", "regression"),
	f("payment_api_timeout", "Payment API times out 50% of attempts", "Runtime commerce fragility", "critical", "revenue_integrity", "/checkout", "negative", 4000, 10000, 6500, "Payment intent creation fails with 502 Bad Gateway (30s Stripe timeout). No retry logic.", "Combined with cart 500s, the checkout funnel has ~75% technical failure rate during peak hours.", "Payment failures are the single highest-impact issue.", "new_issue"),
	f("refund_policy_missing", "No refund or return policy found on site", "Dispute defenses absent", "high", "chargeback_resilience", "/", "negative", 400, 1200, 720, "Crawl of all pages found zero mention of refund, return, or exchange terms.", "Buyers who want a refund file chargebacks instead.", "Stores without visible refund policy have 2-3x higher chargeback rate."),
	f("checkout_trust_signals_absent", "Checkout page missing trust badges and security indicators", "Trust deficit at decision point", "medium", "chargeback_resilience", "/checkout", "negative", 200, 600, 400, "Checkout page has no visible trust badges, payment logos, or security seals.", "Reduced buyer confidence at the most critical conversion moment.", "Trust signals reduce abandonment by 5-15%."),
	f("admin_endpoint_unprotected", "Admin order export endpoint accessible without authentication", "Commerce operations exposed", "critical", "scale_readiness", "/admin/orders/export", "negative", 5000, 20000, 10000, "/admin/orders/export?format=csv returns full order data with no authentication.", "Complete customer data exfiltration risk. GDPR/LGPD violation.", "Unprotected admin endpoints are a critical security vulnerability."),
	f("discount_code_guessable", "Discount codes discoverable through parameter guessing", "Commerce abuse exposure", "high", "scale_readiness", "/api/discount/apply", "negative", 1500, 6000, 3000, "Two discount codes (WELCOME50, STAFF100) discoverable via parameter fuzzing.", "STAFF100 eliminates all revenue from any order.", "Unprotected discount endpoints are actively exploited."),
	f("mixed_content_checkout", "Checkout page loads non-secure content breaking padlock", "Trust deficit at decision point", "high", "scale_readiness", "/checkout", "negative", 300, 900, 500, "Address autocomplete widget loaded via HTTP iframe.", "Visible security warning during payment entry.", "Mixed content on payment pages contradicts PCI-DSS requirements."),
	f("mobile_checkout_blocked", "Mobile checkout completely unreachable", "Friction barrier on conversion path", "critical", "scale_readiness", "/", "negative", 8000, 20000, 14000, "Add-to-cart button overlapped by Intercom chat widget on screens <430px.", "100% of mobile conversions blocked. Mobile represents ~55% of traffic.", "Total mobile conversion blockage implies $14k/mo in unreachable revenue.", "stable_risk"),
	f("checkout_performance_critical", "Checkout page fails all Core Web Vitals", "Runtime commerce fragility", "high", "scale_readiness", "/checkout", "negative", 400, 1200, 700, "Checkout: 4.2s LCP, 120ms FID, 0.18 CLS. 6.8MB payload.", "Slow checkout increases abandonment.", "Every 100ms of checkout latency reduces conversion by ~0.7%.", "improvement"),
	f("cookie_consent_missing", "No cookie consent banner despite 18 tracking cookies", "Commerce operations exposed", "medium", "scale_readiness", "/", "negative", 200, 1000, 500, "Site sets 18 cookies on first page load without consent.", "GDPR/ePrivacy violation for EU visitors.", "Cookie compliance is mandatory in EU, increasingly enforced in Brazil."),
];

export const DEMO_ACTIONS: ActionProjection[] = [
	{
		id: "demo_action_fix_checkout_redirect",
		title: "Migrate checkout to same-domain embedded flow",
		description: "Replace the 3-hop Stripe redirect with Stripe Elements embedded directly on /checkout. Eliminates domain crossings and the associated trust + latency drop-off.",
		root_cause: "Untracked purchase paths",
		root_cause_key: "untracked_purchase_paths",
		impact: { monthly_range: { min: 3000, max: 7000 }, midpoint: 4800 },
		confidence: 85,
		confidence_tier: "high",
		cross_pack: false,
		priority_score: 92,
		severity: "high",
		action_type: "technical_fix",
		category: "incident",
		operational_status: null,
		decision_status: null,
		effort_hint: "medium",
		remediation_steps: ["Install @stripe/stripe-js and @stripe/react-stripe-js", "Create a PaymentElement component on /checkout", "Remove the redirect chain and update the checkout flow", "Test with Stripe test mode before going live"],
		estimated_effort_hours: 8,
		verification_strategy: "browser_runtime",
		verification_notes: null,
	} as ActionProjection,
	{
		id: "demo_action_fix_cart_500",
		title: "Fix cart page 500 errors during peak traffic",
		description: "The cart API endpoint crashes under concurrent load. Add connection pooling, implement request queuing, and add a circuit breaker.",
		root_cause: "Runtime commerce fragility",
		root_cause_key: "runtime_commerce_fragility",
		impact: { monthly_range: { min: 5000, max: 15000 }, midpoint: 10000 },
		confidence: 90,
		confidence_tier: "high",
		cross_pack: true,
		priority_score: 98,
		severity: "critical",
		action_type: "technical_fix",
		category: "incident",
		operational_status: null,
		decision_status: null,
		effort_hint: "high",
		remediation_steps: ["Add connection pooling to the cart API database client", "Implement request queuing with a 5s timeout", "Add a circuit breaker that returns a cached cart on repeated failures", "Set up monitoring alerts for 5xx rates above 1%"],
		estimated_effort_hours: 16,
		verification_strategy: "browser_runtime",
		verification_notes: null,
	} as ActionProjection,
	{
		id: "demo_action_add_trust_signals",
		title: "Add trust badges and security indicators to checkout",
		description: "Display payment provider logos, security seals, and a refund policy summary on the checkout page to reduce abandonment and friendly-fraud chargebacks.",
		root_cause: "Trust deficit at decision point",
		root_cause_key: "trust_deficit_at_decision_point",
		impact: { monthly_range: { min: 500, max: 1500 }, midpoint: 900 },
		confidence: 75,
		confidence_tier: "high",
		cross_pack: true,
		priority_score: 78,
		severity: "medium",
		action_type: "ux_improvement",
		category: "opportunity",
		operational_status: null,
		decision_status: null,
		effort_hint: "low",
		remediation_steps: ["Add Stripe/PayPal logos below the payment form", "Display a 1-line refund policy summary with link to full policy", "Add a padlock icon + 'Secure checkout' text above the form"],
		estimated_effort_hours: 3,
		verification_strategy: "browser_runtime",
		verification_notes: null,
	} as ActionProjection,
	{
		id: "demo_action_fix_mobile",
		title: "Fix mobile checkout blocking (Intercom z-index)",
		description: "The Intercom chat widget overlaps the Add-to-Cart button on screens under 430px, making mobile conversion impossible.",
		root_cause: "Friction barrier on conversion path",
		root_cause_key: "friction_barrier_on_conversion_path",
		impact: { monthly_range: { min: 8000, max: 20000 }, midpoint: 14000 },
		confidence: 95,
		confidence_tier: "high",
		cross_pack: false,
		priority_score: 99,
		severity: "critical",
		action_type: "technical_fix",
		category: "incident",
		operational_status: null,
		decision_status: null,
		effort_hint: "low",
		remediation_steps: ["Set Intercom launcher z-index below the cart button", "Or move the launcher to bottom-left on mobile viewports", "Test on iPhone SE, Galaxy S21, and Pixel 7 breakpoints"],
		estimated_effort_hours: 1,
		verification_strategy: "browser_runtime",
		verification_notes: null,
	} as ActionProjection,
	{
		id: "demo_action_add_refund_policy",
		title: "Publish a refund and return policy page",
		description: "Create /policies/refunds with clear refund terms, timeframes, and process. Link from footer and checkout.",
		root_cause: "Dispute defenses absent",
		root_cause_key: "dispute_defenses_absent",
		impact: { monthly_range: { min: 300, max: 1000 }, midpoint: 600 },
		confidence: 80,
		confidence_tier: "high",
		cross_pack: false,
		priority_score: 72,
		severity: "high",
		action_type: "content_creation",
		category: "opportunity",
		operational_status: null,
		decision_status: null,
		effort_hint: "low",
		remediation_steps: ["Draft refund policy covering timeframes, conditions, and process", "Publish at /policies/refunds", "Add link to site footer and checkout page sidebar"],
		estimated_effort_hours: 2,
		verification_strategy: "http_static",
		verification_notes: null,
	} as ActionProjection,
];

// ── Demo engine maps ──
// Built using buildCustomMap which produces the same 3-column layout
// (findings → root causes → actions) as the real engine maps.

function buildDemoProjectionResult(): {
	projections: ProjectionResult;
	result: MultiPackResult;
} {
	const rootCauses = [
		{ root_cause_key: "untracked_purchase_paths", title: "Untracked purchase paths", category: "measurement_gap", severity: "high", confidence: 85, impact_types: ["revenue_loss"], affected_packs: ["revenue_integrity"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "runtime_commerce_fragility", title: "Runtime commerce fragility", category: "infrastructure_failure", severity: "critical", confidence: 90, impact_types: ["revenue_loss", "scale_risk"], affected_packs: ["revenue_integrity", "scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "friction_barrier_on_conversion_path", title: "Friction barrier on conversion path", category: "ux_friction", severity: "critical", confidence: 95, impact_types: ["revenue_loss"], affected_packs: ["revenue_integrity", "scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "trust_deficit_at_decision_point", title: "Trust deficit at decision point", category: "trust_failure", severity: "high", confidence: 78, impact_types: ["revenue_loss", "chargeback_risk"], affected_packs: ["chargeback_resilience", "scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "dispute_defenses_absent", title: "Dispute defenses absent", category: "policy_gap", severity: "high", confidence: 80, impact_types: ["chargeback_risk"], affected_packs: ["chargeback_resilience"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "commerce_operations_exposed", title: "Commerce operations exposed", category: "security_exposure", severity: "critical", confidence: 88, impact_types: ["revenue_loss", "trust_erosion"], affected_packs: ["scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "commerce_pages_invisible", title: "Commerce pages invisible to measurement", category: "measurement_gap", severity: "high", confidence: 82, impact_types: ["revenue_loss"], affected_packs: ["revenue_integrity"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "commerce_abuse_exposure", title: "Commerce abuse exposure", category: "security_exposure", severity: "high", confidence: 85, impact_types: ["revenue_loss"], affected_packs: ["scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
	];

	return {
		projections: {
			findings: DEMO_FINDINGS,
			actions: DEMO_ACTIONS,
			workspaces: [],
			change_report: null,
		} as unknown as ProjectionResult,
		result: {
			intelligence: { root_causes: rootCauses, global_actions: [] },
		} as unknown as MultiPackResult,
	};
}

export function buildDemoEngineMaps(): MapDefinition[] {
	const { projections, result } = buildDemoProjectionResult();
	const { buildRevenueLeakageMap, buildChargebackRiskMap, buildRootCauseMap } =
		require("../../packages/maps/engine");

	return [
		buildRevenueLeakageMap(projections, result),
		buildChargebackRiskMap(projections, result),
		buildRootCauseMap(projections, result),
	];
}
