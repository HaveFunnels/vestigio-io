import { buildCustomMap } from "../../packages/maps";
import type { MapDefinition } from "../../packages/maps";
import type {
	FindingProjection,
	ActionProjection,
	WorkspaceProjection,
	ChangeReportProjection,
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
// Phase 3.2: Demo strings are translated to the user's locale using
// the same engine translation dictionaries as the real projection
// engine. English is the fallback when translations are missing.
// ──────────────────────────────────────────────

// ── Translation-aware string resolution ──
// The demo data is built once at module load. To pick up the user's
// locale we accept an optional translations dict from ensureContext.
// When absent, English strings are used (same as pre-3.2).

import type { EngineTranslations } from "../../packages/projections/types";
import { lookupRemediation } from "../../packages/projections/remediation-catalog";

let _translations: EngineTranslations | undefined;

/** Call once from ensureContext (demo branch) to inject the locale. */
export function setDemoTranslations(t: EngineTranslations | undefined): void {
	_translations = t;
	// Force rebuild on next access
	_cachedFindings = null;
	_cachedWorkspaces = null;
	_cachedChangeReport = null;
}

function t_title(key: string, fallback: string): string {
	return _translations?.inference_titles?.[key] ?? fallback;
}
function t_cause(key: string, fallback: string): string {
	return _translations?.inference_causes?.[key] ?? fallback;
}
function t_effect(key: string, fallback: string): string {
	return _translations?.inference_effects?.[key] ?? fallback;
}
function t_rootCause(key: string, fallback: string): string {
	return _translations?.root_cause_titles?.[key] ?? fallback;
}
function t_reasoning(key: string, fallback: string): string {
	return _translations?.reasoning_templates?.[key] ?? fallback;
}
function t_remed(key: string): { steps: string[] | null; notes: string | null } {
	const tR = _translations?.remediation?.[key];
	if (tR) return { steps: tR.remediation_steps, notes: tR.verification_notes };
	const catalog = lookupRemediation(key);
	if (catalog) return { steps: catalog.remediation_steps, notes: catalog.verification_notes };
	return { steps: null, notes: null };
}
function t_workspace(key: string, fallback: string): string {
	return _translations?.workspace_names?.[key] ?? fallback;
}

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
	| "remediation_steps"
	| "verification_notes"
> = {
	confidence: 80,
	confidence_tier: "high",
	freshness: "fresh",
	basis_type: "evidence_based",
	eligibility: { eligible: true, confidence: 80 },
	truth_context: null,
	suppression_context: null,
	verification_strategy: null,
	estimated_effort_hours: null,
	evidence_quality: {
		source_reliability: 85,
		completeness: 78,
		recency: 92,
		corroboration: 70,
		composite: 81,
	},
	verification_eta_seconds: null,
	trend_pattern: null,
	trend_streak: null,
	workspace_refs: [],
	action_refs: [],
	opportunity_ref: null,
};

function f(
	key: string,
	title: string,
	rootCauseKey: string | null,
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
	const remed = t_remed(key);
	return {
		...BASE,
		id: `demo_finding_${key}`,
		inference_key: key,
		title: t_title(key, title),
		root_cause: rootCauseKey ? t_rootCause(rootCauseKey, rootCause || "") : rootCause,
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
		cause: t_cause(key, cause),
		effect: t_effect(key, effect),
		reasoning: t_reasoning(key, reasoning),
		change_class: changeClass,
		verification_maturity: verMaturity,
		verification_method: verMaturity === "confirmed" ? "browser_verified" : "static_only",
		remediation_steps: remed.steps,
		verification_notes: remed.notes,
	} as FindingProjection;
}

function buildFindings(): FindingProjection[] {
	return [
		f("checkout_off_domain", "Checkout redirects buyers to a different domain", "trust_failure_at_checkout", "Untracked purchase paths", "high", "revenue_integrity", "/checkout", "negative", 2400, 4800, 3200, "Checkout flow redirects through 3 hops to Stripe hosted checkout, crossing 2 domains.", "50% of buyers drop off during the redirect chain.", "At $85 AOV and 3,420 monthly checkout starts, conservative 20% recovery estimate yields ~$3,200/mo.", "stable_risk"),
		f("conversion_tracking_absent", "No conversion tracking on checkout or thank-you page", "measurement_gap_commercial", "Commerce pages invisible to measurement", "high", "revenue_integrity", "/checkout", "negative", 800, 2400, 1600, "GA4, Facebook Pixel, and Segment are present on 6 pages but absent from checkout and thank-you.", "Ad platforms report $0 revenue, inflating CPA by 40-60%.", "Without purchase attribution, ad spend optimization is blind."),
		f("product_page_high_abandonment", "Product page abandonment 15pp above benchmark", "friction_blocking_purchase_path", "Friction barrier on conversion path", "medium", "revenue_integrity", "/products", "negative", 900, 2700, 1800, "70% of product page visitors leave without adding to cart (benchmark: 55-60%). 3.4s LCP and missing social proof contribute.", "Each percentage point of cart-add rate recovered equals ~$120/mo.", "Slow load time and absence of reviews suppress impulse purchases."),
		f("cart_intermittent_500", "Cart page fails with HTTP 500 during peak hours", "runtime_commerce_fragility", "Runtime commerce fragility", "critical", "revenue_integrity", "/cart", "negative", 3000, 8000, 5000, "Cart page returns HTTP 500 during approximately 50% of peak traffic hours.", "Buyers see a blank error page with no recovery path.", "Error pattern correlates with traffic spikes — likely a backend capacity issue.", "regression"),
		f("payment_api_timeout", "Payment API times out 50% of attempts", "runtime_commerce_fragility", "Runtime commerce fragility", "critical", "revenue_integrity", "/checkout", "negative", 4000, 10000, 6500, "Payment intent creation fails with 502 Bad Gateway (30s Stripe timeout). No retry logic.", "Combined with cart 500s, the checkout funnel has ~75% technical failure rate during peak hours.", "Payment failures are the single highest-impact issue.", "new_issue"),
		f("refund_policy_missing", "No refund or return policy found on site", "dispute_defenses_absent", "Dispute defenses absent", "high", "chargeback_resilience", "/", "negative", 400, 1200, 720, "Crawl of all pages found zero mention of refund, return, or exchange terms.", "Buyers who want a refund file chargebacks instead.", "Stores without visible refund policy have 2-3x higher chargeback rate."),
		f("checkout_trust_signals_absent", "Checkout page missing trust badges and security indicators", "trust_deficit_at_decision_point", "Trust deficit at decision point", "medium", "chargeback_resilience", "/checkout", "negative", 200, 600, 400, "Checkout page has no visible trust badges, payment logos, or security seals.", "Reduced buyer confidence at the most critical conversion moment.", "Trust signals reduce abandonment by 5-15%."),
		f("admin_endpoint_unprotected", "Admin order export endpoint accessible without authentication", "commerce_operations_exposed", "Commerce operations exposed", "critical", "scale_readiness", "/admin/orders/export", "negative", 5000, 20000, 10000, "/admin/orders/export?format=csv returns full order data with no authentication.", "Complete customer data exfiltration risk. GDPR/LGPD violation.", "Unprotected admin endpoints are a critical security vulnerability."),
		f("discount_code_guessable", "Discount codes discoverable through parameter guessing", "commerce_abuse_exposure", "Commerce abuse exposure", "high", "scale_readiness", "/api/discount/apply", "negative", 1500, 6000, 3000, "Two discount codes (WELCOME50, STAFF100) discoverable via parameter fuzzing.", "STAFF100 eliminates all revenue from any order.", "Unprotected discount endpoints are actively exploited."),
		f("mixed_content_checkout", "Checkout page loads non-secure content breaking padlock", "trust_deficit_at_decision_point", "Trust deficit at decision point", "high", "scale_readiness", "/checkout", "negative", 300, 900, 500, "Address autocomplete widget loaded via HTTP iframe.", "Visible security warning during payment entry.", "Mixed content on payment pages contradicts PCI-DSS requirements."),
		f("mobile_checkout_blocked", "Mobile checkout completely unreachable", "friction_barrier_on_conversion_path", "Friction barrier on conversion path", "critical", "scale_readiness", "/", "negative", 8000, 20000, 14000, "Add-to-cart button overlapped by Intercom chat widget on screens <430px.", "100% of mobile conversions blocked. Mobile represents ~55% of traffic.", "Total mobile conversion blockage implies $14k/mo in unreachable revenue.", "stable_risk"),
		f("checkout_performance_critical", "Checkout page fails all Core Web Vitals", "runtime_commerce_fragility", "Runtime commerce fragility", "high", "scale_readiness", "/checkout", "negative", 400, 1200, 700, "Checkout: 4.2s LCP, 120ms FID, 0.18 CLS. 6.8MB payload.", "Slow checkout increases abandonment.", "Every 100ms of checkout latency reduces conversion by ~0.7%.", "improvement"),
		f("cookie_consent_missing", "No cookie consent banner despite 18 tracking cookies", "commerce_operations_exposed", "Commerce operations exposed", "medium", "scale_readiness", "/", "negative", 200, 1000, 500, "Site sets 18 cookies on first page load without consent.", "GDPR/ePrivacy violation for EU visitors.", "Cookie compliance is mandatory in EU, increasingly enforced in Brazil."),
	];
}

// ── Memoized exports (rebuild on locale change) ──
let _cachedFindings: FindingProjection[] | null = null;
let _cachedWorkspaces: WorkspaceProjection[] | null = null;
let _cachedChangeReport: ChangeReportProjection | null = null;

/** Returns translated demo findings, rebuilding if locale changed. */
export function getDemoFindings(): FindingProjection[] {
	if (!_cachedFindings) _cachedFindings = buildFindings();
	return _cachedFindings;
}

// Legacy named export — kept for backward compat but callers should
// prefer getDemoFindings() for locale-aware data.
export const DEMO_FINDINGS: FindingProjection[] = buildFindings();

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
		{ root_cause_key: "untracked_purchase_paths", title: t_rootCause("untracked_purchase_paths", "Untracked purchase paths"), category: "measurement_gap", severity: "high", confidence: 85, impact_types: ["revenue_loss"], affected_packs: ["revenue_integrity"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "runtime_commerce_fragility", title: t_rootCause("runtime_commerce_fragility", "Runtime commerce fragility"), category: "infrastructure_failure", severity: "critical", confidence: 90, impact_types: ["revenue_loss", "scale_risk"], affected_packs: ["revenue_integrity", "scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "friction_barrier_on_conversion_path", title: t_rootCause("friction_barrier_on_conversion_path", "Friction barrier on conversion path"), category: "ux_friction", severity: "critical", confidence: 95, impact_types: ["revenue_loss"], affected_packs: ["revenue_integrity", "scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "trust_deficit_at_decision_point", title: t_rootCause("trust_deficit_at_decision_point", "Trust deficit at decision point"), category: "trust_failure", severity: "high", confidence: 78, impact_types: ["revenue_loss", "chargeback_risk"], affected_packs: ["chargeback_resilience", "scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "dispute_defenses_absent", title: t_rootCause("dispute_defenses_absent", "Dispute defenses absent"), category: "policy_gap", severity: "high", confidence: 80, impact_types: ["chargeback_risk"], affected_packs: ["chargeback_resilience"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "commerce_operations_exposed", title: t_rootCause("commerce_operations_exposed", "Commerce operations exposed"), category: "security_exposure", severity: "critical", confidence: 88, impact_types: ["revenue_loss", "trust_erosion"], affected_packs: ["scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "commerce_pages_invisible", title: t_rootCause("commerce_pages_invisible", "Commerce pages invisible to measurement"), category: "measurement_gap", severity: "high", confidence: 82, impact_types: ["revenue_loss"], affected_packs: ["revenue_integrity"], contributing_inferences: [], contributing_signals: [], description: "" },
		{ root_cause_key: "commerce_abuse_exposure", title: t_rootCause("commerce_abuse_exposure", "Commerce abuse exposure"), category: "security_exposure", severity: "high", confidence: 85, impact_types: ["revenue_loss"], affected_packs: ["scale_readiness"], contributing_inferences: [], contributing_signals: [], description: "" },
	];

	const findings = _cachedFindings || buildFindings();
	return {
		projections: {
			findings,
			actions: DEMO_ACTIONS,
			workspaces: getDemoWorkspaces(),
			change_report: getDemoChangeReport(),
		} as unknown as ProjectionResult,
		result: {
			intelligence: { root_causes: rootCauses, global_actions: [] },
		} as unknown as MultiPackResult,
	};
}

// ── Demo Workspaces ────────────────────────────

function buildDemoWorkspace(
	id: string, name: string, type: string, packKey: string,
	impact: string, findings: FindingProjection[],
	changeSummary?: WorkspaceProjection["change_summary"],
): WorkspaceProjection {
	const totalMin = findings.reduce((s, f) => s + f.impact.monthly_range.min, 0);
	const totalMax = findings.reduce((s, f) => s + f.impact.monthly_range.max, 0);
	const totalMid = findings.reduce((s, f) => s + (f.impact as any).midpoint, 0);
	return {
		id,
		name,
		type: type as any,
		pack_key: packKey,
		decision_key: `${packKey}_decision`,
		decision_impact: impact,
		category: "core",
		pixel_status: null,
		pixel_progress: null,
		summary: {
			total_loss_range: { min: totalMin, max: totalMax },
			total_loss_mid: totalMid,
			top_issues: findings.slice(0, 3).map((f) => f.title),
			confidence: Math.round(findings.reduce((s, f) => s + f.confidence, 0) / (findings.length || 1)),
			issue_count: findings.filter((f) => f.polarity === "negative").length,
			currency: "USD",
		},
		findings,
		coherence: null,
		confidence_narrative: null,
		change_summary: changeSummary ?? null,
	};
}

function buildWorkspaces(): WorkspaceProjection[] {
	const findings = _cachedFindings || buildFindings();
	const revenue = findings.filter((f) => f.pack === "revenue_integrity");
	const chargeback = findings.filter((f) => f.pack === "chargeback_resilience");
	const scale = findings.filter((f) => f.pack === "scale_readiness");

	return [
		buildDemoWorkspace("preflight", t_workspace("scale_readiness", "Scale Readiness"), "preflight", "scale_readiness_pack", "high", scale, {
			trend: "mixed",
			regression_count: 1,
			improvement_count: 1,
			resolved_count: 0,
		}),
		buildDemoWorkspace("revenue", t_workspace("revenue_integrity", "Revenue Analysis"), "revenue", "revenue_integrity_pack", "critical", revenue, {
			trend: "degrading",
			regression_count: 2,
			improvement_count: 0,
			resolved_count: 0,
		}),
		buildDemoWorkspace("chargeback", t_workspace("chargeback_resilience", "Chargeback Analysis"), "chargeback", "chargeback_resilience_pack", "high", chargeback, {
			trend: "stable",
			regression_count: 0,
			improvement_count: 0,
			resolved_count: 0,
		}),
	];
}

export function buildDemoWorkspaces(): WorkspaceProjection[] {
	return buildWorkspaces();
}

export function getDemoWorkspaces(): WorkspaceProjection[] {
	if (!_cachedWorkspaces) _cachedWorkspaces = buildWorkspaces();
	return _cachedWorkspaces;
}

export const DEMO_WORKSPACES: WorkspaceProjection[] = buildWorkspaces();

function buildDemoChange(f: FindingProjection, changeClass: string): any {
	return {
		decision_key: `${f.pack}_decision`,
		title: f.title,
		change_class: changeClass,
		change_severity: f.severity,
		risk_score_delta: changeClass === "regression" ? 15 : changeClass === "improvement" ? -10 : 5,
		previous_severity: changeClass === "new_issue" ? null : f.severity,
		current_severity: f.severity,
		previous_impact: null,
		current_impact: f.severity,
		contributing_factors: [f.root_cause || ""],
	};
}

function buildChangeReport(): ChangeReportProjection {
	const findings = _cachedFindings || buildFindings();
	const demoRegressions = findings.filter((f) => f.change_class === "regression").map((f) => buildDemoChange(f, "regression"));
	const demoImprovements = findings.filter((f) => f.change_class === "improvement").map((f) => buildDemoChange(f, "improvement"));
	const demoNewIssues = findings.filter((f) => f.change_class === "new_issue").map((f) => buildDemoChange(f, "new_issue"));

	return {
		headline: `${demoRegressions.length} regressions, ${demoImprovements.length} improvements, ${demoNewIssues.length} new issues`,
		overall_trend: demoRegressions.length > demoImprovements.length ? "degrading" : "mixed",
		regression_count: demoRegressions.length,
		improvement_count: demoImprovements.length,
		new_issue_count: demoNewIssues.length,
		resolved_count: 0,
		stable_risk_count: findings.filter((f) => f.change_class === "stable_risk").length,
		regressions: demoRegressions,
		improvements: demoImprovements,
		new_issues: demoNewIssues,
		resolved: [],
		previous_cycle_ref: "demo_cycle:previous",
		current_cycle_ref: "demo_cycle:latest",
		multi_cycle_trend: null,
		trend_alerts_count: 0,
	};
}

export function getDemoChangeReport(): ChangeReportProjection {
	if (!_cachedChangeReport) _cachedChangeReport = buildChangeReport();
	return _cachedChangeReport;
}

export const DEMO_CHANGE_REPORT: ChangeReportProjection = buildChangeReport();

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
