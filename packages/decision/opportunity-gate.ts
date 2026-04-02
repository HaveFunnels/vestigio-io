import {
  Decision,
  Inference,
  Signal,
  Opportunity,
  OpportunityStatus,
  DecisionImpact,
  DecisionClass,
  EffectiveSeverity,
  Scoping,
  makeRef,
  IdGenerator,
} from '../domain';
import { QuantifiedValueCase } from '../impact';

// ──────────────────────────────────────────────
// Opportunity Gate — rigorous opportunity generation
//
// Opportunities must not be vague suggestions or UI fluff.
// They follow the same rigor as risk:
// signals → inference → evaluation → prioritization
//
// An opportunity is only valid when:
// 1. It has supporting evidence (not just absence of problems)
// 2. Confidence meets minimum threshold
// 3. It is actionable (has a clear next step)
// 4. It is comparable and prioritizable (has quantified upside)
// ──────────────────────────────────────────────

export interface OpportunityCandidate {
  source_decision_ref: string;
  inference_key: string;
  conclusion_value: string;
  confidence: number;
  evidence_refs: string[];
  signal_refs: string[];
}

export interface OpportunityValidation {
  is_valid: boolean;
  rejection_reason: string | null;
  candidate: OpportunityCandidate;
}

export interface OpportunityGenerationResult {
  opportunities: Opportunity[];
  rejected: OpportunityValidation[];
  total_candidates: number;
  total_valid: number;
}

// Minimum thresholds for opportunity validity
const MIN_CONFIDENCE = 35;
const MIN_EVIDENCE_COUNT = 1;
const MIN_UPSIDE_SCORE = 10;

// Inference keys that can generate opportunities
const OPPORTUNITY_INFERENCE_MAP: Record<string, {
  title: string;
  hypothesis_template: string;
  effort_hint: Opportunity['effort_hint'];
  base_upside_score: number;
}> = {
  // Phase 3D: Previously unmapped core findings
  trust_boundary_crossed: {
    title: 'Eliminate trust boundary breaks in checkout flow',
    hypothesis_template: 'Keeping checkout on-domain or using recognized hosted checkout could recover {pct}% of trust-driven abandonment',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  checkout_integrity: {
    title: 'Strengthen checkout structural integrity',
    hypothesis_template: 'Resolving off-domain handoffs and policy gaps in checkout could improve completion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  policy_gap: {
    title: 'Add missing consumer protection policies',
    hypothesis_template: 'Adding privacy, terms, and refund policies could improve buyer confidence and conversion by {pct}%',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  revenue_path_fragile: {
    title: 'Harden the revenue path against structural fragility',
    hypothesis_template: 'Fixing errors, slow responses, and off-domain redirects on the commercial path could improve conversion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  trust_break_in_checkout: {
    title: 'Restore trust signals at the purchase moment',
    hypothesis_template: 'Adding trust signals and keeping checkout on recognized domains could recover {pct}% of abandoned purchases',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  refund_policy_gap: {
    title: 'Add a clear refund and return policy',
    hypothesis_template: 'A visible refund policy could reduce chargeback-driven disputes by {pct}%',
    effort_hint: 'low',
    base_upside_score: 20,
  },
  dispute_risk_elevated: {
    title: 'Reduce compound chargeback risk factors',
    hypothesis_template: 'Addressing multiple dispute risk factors simultaneously could reduce chargeback rate by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 35,
  },
  form_data_leaves_domain: {
    title: 'Route form submissions through recognized endpoints',
    hypothesis_template: 'Keeping data submission on-domain or through recognized providers could recover {pct}% of trust-driven abandonment',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  platform_checkout_risk_unaddressed: {
    title: 'Address platform-specific checkout configuration risks',
    hypothesis_template: 'Resolving platform checkout misconfigurations could improve conversion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  untrusted_embeds_near_purchase: {
    title: 'Remove unknown embedded content from purchase surfaces',
    hypothesis_template: 'Removing unrecognized third-party embeds from checkout could improve trust and conversion by {pct}%',
    effort_hint: 'low',
    base_upside_score: 20,
  },
  revenue_leakage: {
    title: 'Fix active revenue leakage points',
    hypothesis_template: 'Repairing broken forms, missing conversion paths, and checkout failures could recover {pct}% of lost transactions',
    effort_hint: 'medium',
    base_upside_score: 50,
  },
  consent_undermining_measurement: {
    title: 'Fix consent setup that silently blocks measurement',
    hypothesis_template: 'Implementing consent-aware tag firing could restore {pct}% of silently dropped conversion data',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  mobile_trust_weaker_than_desktop: {
    title: 'Equalize trust experience between mobile and desktop',
    hypothesis_template: 'Restoring mobile trust parity with desktop could improve mobile conversion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 35,
  },
  runtime_measurement_broken: {
    title: 'Fix runtime tracking failures on commercial pages',
    hypothesis_template: 'Resolving JavaScript errors in analytics execution could restore {pct}% of silently dropped conversion data',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  revenue_path_regressed: {
    title: 'Investigate and reverse revenue path regression',
    hypothesis_template: 'Restoring previously healthy commercial path decisions could recover {pct}% of regressed conversion',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  // SaaS opportunities
  activation_blocked: {
    title: 'Remove activation blockers preventing first value',
    hypothesis_template: 'Eliminating prerequisite walls and complexity gates could improve trial-to-paid conversion by {pct}%',
    effort_hint: 'high',
    base_upside_score: 55,
  },
  unclear_next_step: {
    title: 'Add clear next-step guidance throughout onboarding',
    hypothesis_template: 'Adding progress indicators and clear CTAs to onboarding could reduce first-session churn by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 35,
  },
  navigation_overcomplex: {
    title: 'Simplify app navigation to surface core features',
    hypothesis_template: 'Reducing navigation depth and item count could improve feature discovery and retention by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  feature_discovery_poor: {
    title: 'Improve feature discoverability in the product',
    hypothesis_template: 'Making key features more visible could increase perceived value and reduce churn by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  upgrade_timing_wrong: {
    title: 'Show upgrade prompts with value context',
    hypothesis_template: 'Adding value propositions to upgrade CTAs could improve upgrade conversion by {pct}%',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  no_expansion_path: {
    title: 'Add a self-serve upgrade path',
    hypothesis_template: 'Creating a visible path from free to paid could capture {pct}% of users willing to pay',
    effort_hint: 'high',
    base_upside_score: 50,
  },
  landing_app_mismatch: {
    title: 'Align landing page promise with in-app reality',
    hypothesis_template: 'Reducing the expectation gap between marketing and product could improve trial completion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  measurement_coverage: {
    title: 'Improve measurement coverage',
    hypothesis_template: 'Installing analytics on commercial pages enables attribution and optimization, potentially improving conversion by {pct}%',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  measurement_blindspot: {
    title: 'Close measurement blindspots',
    hypothesis_template: 'Revenue path has unmeasured segments. Closing blindspots enables data-driven optimization worth {pct}% improvement',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  unclear_conversion_intent: {
    title: 'Clarify conversion intent',
    hypothesis_template: 'Establishing a clear primary CTA and reducing competing actions could improve conversion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  friction_on_critical_path: {
    title: 'Reduce critical path friction',
    hypothesis_template: 'Removing friction points on the conversion path could recover {pct}% of dropped users',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  conversion_flow_fragmented: {
    title: 'Consolidate conversion flow',
    hypothesis_template: 'Reducing host fragmentation and redirects in checkout could improve completion by {pct}%',
    effort_hint: 'high',
    base_upside_score: 50,
  },
  support_unreachable: {
    title: 'Improve support accessibility',
    hypothesis_template: 'Adding visible support channels reduces disputes and improves trust, potentially reducing chargeback by {pct}%',
    effort_hint: 'low',
    base_upside_score: 20,
  },
  expectation_misalignment: {
    title: 'Align customer expectations',
    hypothesis_template: 'Improving pricing clarity and order confirmation could reduce disputes by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  // SaaS-specific
  activation_friction: {
    title: 'Reduce activation friction',
    hypothesis_template: 'Simplifying the activation path could improve trial-to-paid conversion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 55,
  },
  upgrade_invisible: {
    title: 'Improve upgrade visibility',
    hypothesis_template: 'Making upgrade paths more prominent could increase expansion revenue by {pct}%',
    effort_hint: 'low',
    base_upside_score: 40,
  },
  empty_state_no_guidance: {
    title: 'Add empty state guidance',
    hypothesis_template: 'Guiding new users through empty states could reduce early churn by {pct}%',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  // Phase 30: New opportunities
  critical_path_broken: {
    title: 'Restore broken revenue-critical pages',
    hypothesis_template: 'Fixing HTTP errors on checkout/cart/pricing pages could recover {pct}% of lost transactions immediately',
    effort_hint: 'low',
    base_upside_score: 60,
  },
  checkout_provider_fragmented: {
    title: 'Consolidate payment provider experience',
    hypothesis_template: 'Reducing provider fragmentation and standardizing checkout could improve completion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  // Phase 30B: New opportunities
  redirect_chain_erodes_checkout_trust: {
    title: 'Eliminate redirect hops before checkout',
    hypothesis_template: 'Removing redirect chain on the path to payment could recover {pct}% of dropped buyers',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  commercial_pages_disconnected: {
    title: 'Connect commercial pages to main navigation',
    hypothesis_template: 'Linking checkout/pricing pages from the main journey could capture {pct}% of visitors who currently cannot find how to buy',
    effort_hint: 'low',
    base_upside_score: 50,
  },
  high_intent_surfaces_blind: {
    title: 'Instrument checkout and payment pages',
    hypothesis_template: 'Adding analytics to high-intent surfaces enables optimization worth {pct}% of current revenue',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  post_purchase_confirmation_absent: {
    title: 'Add order confirmation and return terms',
    hypothesis_template: 'Adding post-purchase confirmation and refund visibility could reduce chargeback rate by {pct}%',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  // Phase 2: Deepened collection opportunities
  refund_terms_too_thin: {
    title: 'Expand refund and return policy content',
    hypothesis_template: 'Adding clear return windows, refund processes, and exception handling to the policy page could reduce dispute-driven chargebacks by {pct}%',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  support_hidden_at_purchase: {
    title: 'Show support widget on checkout pages',
    hypothesis_template: 'Making live chat accessible during checkout could convert {pct}% of hesitant buyers who currently abandon with unanswered questions',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  trust_surface_too_thin: {
    title: 'Strengthen trust signals on commercial surfaces',
    hypothesis_template: 'Adding business identity, review signals, and recognized provider badges could improve checkout confidence by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  tracking_stack_gaps: {
    title: 'Complete the tracking and analytics stack',
    hypothesis_template: 'Adding missing analytics and tag management infrastructure could enable optimization worth {pct}% of current revenue',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  // Phase 2B: Mobile & runtime opportunities
  mobile_commercial_path_blocked: {
    title: 'Restore mobile access to commercial paths',
    hypothesis_template: 'Fixing mobile navigation to reach checkout could recover {pct}% of mobile traffic revenue',
    effort_hint: 'medium',
    base_upside_score: 55,
  },
  runtime_errors_interrupt_purchase: {
    title: 'Fix runtime errors blocking purchases',
    hypothesis_template: 'Resolving JavaScript errors interrupting checkout could recover {pct}% of failed transactions',
    effort_hint: 'medium',
    base_upside_score: 50,
  },
  secondary_flows_bypass_trust_path: {
    title: 'Consolidate commercial flows through main trust path',
    hypothesis_template: 'Routing all commercial traffic through the main trust and measurement path could recover {pct}% of untracked revenue',
    effort_hint: 'high',
    base_upside_score: 35,
  },
  // Phase 2C: Policy + post-purchase opportunities
  refund_process_unclear: {
    title: 'Add return window, refund steps, and contact info to refund policy',
    hypothesis_template: 'Making the refund process actionable could redirect {pct}% of dispute-filing customers toward the refund path instead',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  post_purchase_proof_too_weak: {
    title: 'Strengthen confirmation page with order details and next steps',
    hypothesis_template: 'A richer confirmation page with order proof and expected timeline could reduce "did my order go through?" disputes by {pct}%',
    effort_hint: 'low',
    base_upside_score: 20,
  },
  // Phase 2C: Composite opportunities
  support_reassurance_too_late: {
    title: 'Link support into the commercial journey',
    hypothesis_template: 'Making help accessible from checkout and pricing could convert {pct}% of hesitant buyers who abandon with unanswered questions',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  reassurance_routes_disconnected: {
    title: 'Connect reassurance content to the buying path',
    hypothesis_template: 'Linking help, FAQ, and warranty pages from the commercial journey could reduce abandonment by {pct}%',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  alternate_flows_unmeasured: {
    title: 'Instrument all commercial paths with analytics',
    hypothesis_template: 'Tracking all commercial routes could enable optimization worth {pct}% of currently invisible revenue',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  checkout_provider_path_weak: {
    title: 'Strengthen the checkout provider path',
    hypothesis_template: 'Adding recognized provider branding and trust signals to the checkout handoff could improve completion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  // Phase 3A: Channel integrity opportunities
  payment_surface_compromised: {
    title: 'Secure purchase surfaces against script injection',
    hypothesis_template: 'Implementing CSP and script integrity controls on checkout could prevent {pct}% of formjacking and payment interception exposure',
    effort_hint: 'medium',
    base_upside_score: 55,
  },
  commerce_operations_exposed: {
    title: 'Restrict public access to operational surfaces',
    hypothesis_template: 'Removing public access to admin, debug, and configuration endpoints could prevent {pct}% of commerce disruption scenarios',
    effort_hint: 'low',
    base_upside_score: 45,
  },
  traffic_landing_low_trust_posture: {
    title: 'Harden domain security posture for commercial traffic',
    hypothesis_template: 'Fixing certificate, header, and mixed-content issues could recover {pct}% of trust-suppressed conversion',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  commercial_path_abuse_friendly: {
    title: 'Restrict exposed API and business-logic endpoints',
    hypothesis_template: 'Adding authentication to exposed endpoints could prevent {pct}% of automated abuse, pricing manipulation, and fraud',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  economic_exploitation_active: {
    title: 'Secure cart, coupon, and refund endpoints against automation',
    hypothesis_template: 'Adding session validation and rate limiting to business-logic endpoints could prevent {pct}% of margin theft, coupon abuse, and refund fraud',
    effort_hint: 'medium',
    base_upside_score: 50,
  },
  // Phase 3B: Deep discovery opportunities
  promotion_logic_exposed: {
    title: 'Secure promotion and discount endpoints against enumeration',
    hypothesis_template: 'Adding rate limiting and validation to discoverable coupon routes could prevent {pct}% of promotional abuse and margin erosion',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  cart_variant_weak_control: {
    title: 'Unify pricing controls across all cart variants',
    hypothesis_template: 'Standardizing pricing validation across all cart/checkout paths could prevent {pct}% of price manipulation on weaker variants',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  hidden_discount_refund_route: {
    title: 'Gate hidden discount and refund routes with proper authentication',
    hypothesis_template: 'Adding authentication and rate controls to exposed discount/refund endpoints could prevent {pct}% of automated margin theft',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  guessable_business_endpoint: {
    title: 'Protect business-critical endpoints from predictable discovery',
    hypothesis_template: 'Adding authentication and unpredictable identifiers to business endpoints could prevent {pct}% of automated commerce fraud',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  alternate_pricing_safeguard_bypass: {
    title: 'Retire or secure alternate pricing paths',
    hypothesis_template: 'Consolidating pricing through the main safeguard model could prevent {pct}% of transactions from bypassing intended price validation',
    effort_hint: 'high',
    base_upside_score: 45,
  },
  js_discovered_purchase_variant: {
    title: 'Bring JS-discovered checkout variants under the main safeguard model',
    hypothesis_template: 'Routing all commerce through the instrumented and safeguarded primary path could recover {pct}% of currently invisible and unprotected revenue',
    effort_hint: 'high',
    base_upside_score: 40,
  },
  dynamic_route_weak_control: {
    title: 'Strengthen governance on dynamically discoverable commerce routes',
    hypothesis_template: 'Adding consistent safeguards to deeply reachable commerce endpoints could close {pct}% of the protection gap between primary and secondary flows',
    effort_hint: 'medium',
    base_upside_score: 35,
  },
  hidden_support_burden: {
    title: 'Connect support infrastructure to the commercial journey',
    hypothesis_template: 'Linking existing support routes from the buying path could convert {pct}% of hesitant buyers who currently generate post-purchase tickets instead',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  alternate_variant_control_breakdown: {
    title: 'Restore trust, measurement, and pricing controls on alternate variants',
    hypothesis_template: 'Extending the primary safeguard model to all commerce variants could recover {pct}% of currently unprotected and unmeasured revenue',
    effort_hint: 'high',
    base_upside_score: 50,
  },
  deep_commerce_exploitation_risk: {
    title: 'Harden deep commerce surfaces against automated exploitation',
    hypothesis_template: 'Closing the protection gradient between primary and deep commerce endpoints could prevent {pct}% of automated fraud targeting weaker paths',
    effort_hint: 'high',
    base_upside_score: 55,
  },
  // Phase 2D: Network analysis opportunities
  checkout_api_latency_degraded: {
    title: 'Optimize checkout API response times',
    hypothesis_template: 'Reducing checkout API latency below 3s could recover {pct}% of abandonments caused by slow payment processing',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  commercial_pages_slow: {
    title: 'Prioritize performance on commerce-critical pages',
    hypothesis_template: 'Bringing commercial page performance in line with the rest of the site could improve conversion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  paid_landing_overloaded: {
    title: 'Reduce third-party weight on paid landing pages',
    hypothesis_template: 'Deferring or removing non-essential third-party scripts could reduce effective CAC by {pct}% through faster intent capture',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  third_party_weight_delays_trust: {
    title: 'Defer non-essential third-party scripts on commercial paths',
    hypothesis_template: 'Reducing third-party dependency weight on checkout could accelerate trust formation and improve conversion by {pct}%',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  checkout_brittle_third_party: {
    title: 'Add graceful degradation for checkout third-party dependencies',
    hypothesis_template: 'Implementing fallbacks for unstable checkout dependencies could prevent {pct}% of third-party-caused transaction failures',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  purchase_blocked_failing_requests: {
    title: 'Fix failing requests on purchase surfaces',
    hypothesis_template: 'Resolving request failures on checkout could recover {pct}% of blocked purchase attempts immediately',
    effort_hint: 'medium',
    base_upside_score: 55,
  },
  measurement_breaks_revenue_path: {
    title: 'Restore measurement execution on revenue-generating pages',
    hypothesis_template: 'Fixing analytics execution failures on commercial pages could recover {pct}% of currently invisible conversion data',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  purchase_before_deps_ready: {
    title: 'Ensure payment dependencies load before checkout becomes interactive',
    hypothesis_template: 'Preloading critical payment and trust dependencies could prevent {pct}% of checkout failures caused by sequencing gaps',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  trust_assets_late_load: {
    title: 'Prioritize trust and reassurance asset loading on commercial pages',
    hypothesis_template: 'Loading support chat and trust badges before the page is interactive could reduce hesitation-driven abandonment by {pct}%',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  mobile_heavy_runtime_chain: {
    title: 'Optimize mobile runtime dependency chain for commerce paths',
    hypothesis_template: 'Reducing mobile-specific dependency weight could improve mobile conversion rate by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  mobile_trust_payment_deps_failing: {
    title: 'Fix mobile-specific dependency failures on commerce surfaces',
    hypothesis_template: 'Resolving mobile payment and trust dependency failures could recover {pct}% of mobile conversion currently lost to operational gaps',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  trust_surfaces_unstable_deps: {
    title: 'Improve reliability of trust-layer external dependencies',
    hypothesis_template: 'Adding redundancy or graceful degradation for trust assets could maintain buyer confidence through {pct}% of third-party outages',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  // Phase 3E: Discoverability opportunities
  commercial_pages_weak_search_representation: {
    title: 'Optimize search representation on commercial pages',
    hypothesis_template: 'Adding compelling titles and descriptions to commercial pages could increase search click-through by {pct}%',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  social_previews_fail_commercial_value: {
    title: 'Add Open Graph tags to commercial pages for social sharing',
    hypothesis_template: 'Rich social previews with product images and descriptions could increase share-driven traffic by {pct}%',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  brand_inconsistent_across_surfaces: {
    title: 'Standardize brand representation across search and social',
    hypothesis_template: 'Consistent brand signals across all commercial pages could improve recognition and click-through by {pct}%',
    effort_hint: 'low',
    base_upside_score: 20,
  },
  commercial_pages_unlikely_indexed: {
    title: 'Fix indexing barriers on commercial pages',
    hypothesis_template: 'Resolving canonical and noindex issues on revenue pages could make {pct}% of currently invisible demand discoverable',
    effort_hint: 'low',
    base_upside_score: 40,
  },
  weak_semantic_intent_signals: {
    title: 'Add structured data to commercial pages',
    hypothesis_template: 'Product and Organization schema could improve search ranking and AI representation, capturing {pct}% more qualified traffic',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  previews_disconnected_from_conversion: {
    title: 'Align social previews with actual page content',
    hypothesis_template: 'Matching preview content to page content could reduce expectation-mismatch bounce by {pct}%',
    effort_hint: 'low',
    base_upside_score: 20,
  },
  commercial_pages_not_exposed_for_discovery: {
    title: 'Add internal links to isolated commercial pages',
    hypothesis_template: 'Linking commercial pages from navigation could make {pct}% of organic demand visible to search crawlers',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  // Phase 3E: Brand integrity opportunities
  lookalike_domain_competing_for_traffic: {
    title: 'Monitor and challenge lookalike domain registrations',
    hypothesis_template: 'Taking down or monitoring high-risk lookalike domains could recover {pct}% of intercepted brand traffic',
    effort_hint: 'medium',
    base_upside_score: 30,
  },
  external_sites_mimicking_brand: {
    title: 'Take action against brand-mimicking sites',
    hypothesis_template: 'Reporting and removing impersonation surfaces could prevent {pct}% of brand-attributed fraud',
    effort_hint: 'high',
    base_upside_score: 40,
  },
  brand_traffic_exposed_to_deceptive_surfaces: {
    title: 'Acquire or block typosquat domains',
    hypothesis_template: 'Controlling common brand misspelling domains could recover {pct}% of mistyped direct traffic',
    effort_hint: 'medium',
    base_upside_score: 25,
  },
  suspicious_domains_capturing_purchase_intent: {
    title: 'Investigate and shut down impostor storefronts',
    hypothesis_template: 'Removing commerce-enabled lookalike sites could prevent {pct}% of revenue diversion to impostors',
    effort_hint: 'high',
    base_upside_score: 45,
  },
  customers_exposed_to_phishing_surfaces: {
    title: 'Report phishing surfaces and protect customers',
    hypothesis_template: 'Taking down phishing surfaces could prevent {pct}% of fraud-driven chargebacks and legal exposure',
    effort_hint: 'high',
    base_upside_score: 50,
  },
  brand_presence_diluted_across_variants: {
    title: 'Consolidate brand presence by securing key domain variants',
    hypothesis_template: 'Registering and redirecting brand domain variants could concentrate {pct}% of split search authority on the primary domain',
    effort_hint: 'medium',
    base_upside_score: 25,
  },
  // Phase 4B: Behavioral intelligence opportunities
  policy_view_then_abandonment: {
    title: 'Reframe policy content to build confidence instead of triggering doubt',
    hypothesis_template: 'Rewriting policy pages to emphasize buyer protection could reduce policy-driven abandonment by {pct}%',
    effort_hint: 'low',
    base_upside_score: 25,
  },
  high_intent_detour_before_abandonment: {
    title: 'Embed reassurance content directly in the checkout experience',
    hypothesis_template: 'Adding FAQ, trust signals, and support access inline at checkout could recover {pct}% of high-intent detour abandonment',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  support_discovered_too_late_to_convert: {
    title: 'Make support accessible earlier in the commercial journey',
    hypothesis_template: 'Adding support visibility on product and pricing pages could resolve pre-purchase hesitation and recover {pct}% of abandoned sessions',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  cta_visible_but_behaviorally_dead: {
    title: 'Redesign or reposition commercial CTAs for behavioral engagement',
    hypothesis_template: 'Improving CTA copy, placement, or value context could increase click-through by {pct}% on dead surfaces',
    effort_hint: 'low',
    base_upside_score: 40,
  },
  purchase_hesitation_with_backtrack: {
    title: 'Add trust reinforcement at purchase decision points',
    hypothesis_template: 'Adding social proof, guarantees, or value justification at backtrack points could reduce hesitation abandonment by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  critical_step_retries_before_abandonment: {
    title: 'Fix UX errors on the step that triggers retries',
    hypothesis_template: 'Resolving the error or confusion causing retries could recover {pct}% of abandoned sessions at the critical step',
    effort_hint: 'medium',
    base_upside_score: 50,
  },
  mobile_fails_first_commercial_action: {
    title: 'Fix mobile entry point to the commercial flow',
    hypothesis_template: 'Repairing mobile navigation to the first commercial action could recover {pct}% of mobile traffic revenue',
    effort_hint: 'medium',
    base_upside_score: 55,
  },
  funnel_step_alive_but_not_advancing: {
    title: 'Redesign stalled funnel steps to drive progression',
    hypothesis_template: 'Improving CTA clarity and removing friction on stalled steps could advance {pct}% more sessions through the funnel',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  // Phase 4B Hardening: 12 new behavioral opportunities
  hesitation_before_conversion_missing_trust: {
    title: 'Add trust and urgency reinforcement near the decision point',
    hypothesis_template: 'Adding guarantees, social proof, and support access near commercial CTAs could reduce hesitation-driven abandonment by {pct}%',
    effort_hint: 'low',
    base_upside_score: 40,
  },
  pricing_hesitation_unclear_value: {
    title: 'Strengthen value justification on and around the pricing surface',
    hypothesis_template: 'Adding feature comparison, ROI context, and testimonials near pricing could reduce backtrack abandonment by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  policy_detour_before_conversion: {
    title: 'Embed trust-building policy summaries inline at the conversion point',
    hypothesis_template: 'Surfacing key policy terms (refund window, privacy assurance) inline at checkout could reduce policy-seeking detours by {pct}%',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  cta_viewed_not_engaged: {
    title: 'Redesign primary CTA copy, placement, and surrounding context',
    hypothesis_template: 'Improving CTA clarity, value proposition, and visual prominence could increase engagement rate by {pct}%',
    effort_hint: 'low',
    base_upside_score: 45,
  },
  sensitive_input_abandonment: {
    title: 'Add trust context around sensitive data fields',
    hypothesis_template: 'Adding security reassurance, privacy labels, and justification near sensitive fields could reduce input abandonment by {pct}%',
    effort_hint: 'low',
    base_upside_score: 35,
  },
  form_excessive_fields_before_conversion: {
    title: 'Reduce form field count or split into progressive steps',
    hypothesis_template: 'Removing unnecessary fields or progressive disclosure could increase form completion by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 45,
  },
  form_submission_retry_friction: {
    title: 'Fix validation feedback and submission error handling',
    hypothesis_template: 'Adding clear validation messages and submission status could reduce retry-driven abandonment by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 50,
  },
  surface_oscillation_before_dropoff: {
    title: 'Resolve the decision gap between oscillating surfaces',
    hypothesis_template: 'Adding cross-surface value reinforcement and addressing the unresolved question could reduce oscillation abandonment by {pct}%',
    effort_hint: 'medium',
    base_upside_score: 40,
  },
  conversion_final_step_retry: {
    title: 'Fix final-step friction causing repeated conversion attempts',
    hypothesis_template: 'Resolving submission errors and improving feedback at the final step could recover {pct}% of retry-abandoned sessions',
    effort_hint: 'medium',
    base_upside_score: 55,
  },
  cta_late_availability_delays_action: {
    title: 'Prioritize primary CTA rendering in page load sequence',
    hypothesis_template: 'Rendering the primary CTA earlier could reduce time-to-first-action and recover {pct}% of distracted sessions',
    effort_hint: 'low',
    base_upside_score: 30,
  },
  checkout_abandon_no_feedback: {
    title: 'Add immediate progress feedback after checkout initiation',
    hypothesis_template: 'Adding loading states, progress indicators, and next-step previews at checkout could reduce immediate abandonment by {pct}%',
    effort_hint: 'low',
    base_upside_score: 45,
  },
  sensitive_input_perceived_risk_dropoff: {
    title: 'Strengthen trust signals around sensitive data entry surfaces',
    hypothesis_template: 'Adding security badges, provider logos, and encryption reassurance near sensitive fields could reduce perceived-risk dropoff by {pct}%',
    effort_hint: 'low',
    base_upside_score: 40,
  },
};

/**
 * Generate validated opportunities from decisions and inferences.
 * Only opportunities that pass all validity gates are returned.
 */
export function generateOpportunities(
  decisions: Decision[],
  inferences: Inference[],
  valueCases: QuantifiedValueCase[],
  scoping: Scoping,
  cycle_ref: string,
): OpportunityGenerationResult {
  const ids = new IdGenerator('opp');
  const candidates: OpportunityCandidate[] = [];
  const rejected: OpportunityValidation[] = [];
  const opportunities: Opportunity[] = [];

  // Only consider decisions in Optimize or Observe state (not already critical)
  const eligibleDecisions = decisions.filter(d =>
    d.decision_impact === DecisionImpact.Optimize ||
    d.decision_impact === DecisionImpact.Observe,
  );

  // Find inferences that match opportunity patterns
  for (const inference of inferences) {
    const template = OPPORTUNITY_INFERENCE_MAP[inference.inference_key];
    if (!template) continue;

    // Skip inferences that don't indicate an opportunity
    if (inference.conclusion_value === 'false' || inference.conclusion_value === 'none') continue;

    const candidate: OpportunityCandidate = {
      source_decision_ref: findDecisionForInference(inference, eligibleDecisions),
      inference_key: inference.inference_key,
      conclusion_value: inference.conclusion_value,
      confidence: inference.confidence,
      evidence_refs: inference.evidence_refs,
      signal_refs: inference.signal_refs,
    };
    candidates.push(candidate);

    // Validate
    const validation = validateCandidate(candidate);
    if (!validation.is_valid) {
      rejected.push(validation);
      continue;
    }

    // Find matching value case for quantified upside
    const valueCase = valueCases.find(vc => vc.inference_key === inference.inference_key);

    // Compute upside score
    const severityMultiplier = inference.conclusion_value === 'high' ? 1.5
      : inference.conclusion_value === 'medium' ? 1.0
      : 0.7;
    const rawUpside = Math.min(100, Math.round(template.base_upside_score * severityMultiplier));
    const upsideConfidence = Math.round(inference.confidence * 0.85); // slightly conservative

    if (rawUpside < MIN_UPSIDE_SCORE) {
      rejected.push({
        is_valid: false,
        rejection_reason: `Upside score ${rawUpside} below minimum ${MIN_UPSIDE_SCORE}`,
        candidate,
      });
      continue;
    }

    const pctEstimate = valueCase && valueCase.estimated_impact.percentage_delta !== null
      ? `${Math.round(valueCase.estimated_impact.percentage_delta * 100)}` : '5-15';
    const hypothesis = template.hypothesis_template.replace('{pct}', pctEstimate);

    const now = new Date();
    opportunities.push({
      id: ids.next(),
      opportunity_key: `opportunity_${inference.inference_key}`,
      scoping,
      cycle_ref,
      status: OpportunityStatus.Identified,
      title: template.title,
      uplift_hypothesis: hypothesis,
      raw_upside_score: rawUpside,
      upside_confidence_score: upsideConfidence,
      value_case: null, // linked via decision_refs; full ValueCase created in projection layer
      effort_hint: template.effort_hint,
      priority: computePriority(rawUpside, upsideConfidence, template.effort_hint),
      decision_refs: candidate.source_decision_ref
        ? [candidate.source_decision_ref]
        : [],
      evidence_refs: candidate.evidence_refs,
      created_at: now,
      updated_at: now,
    });
  }

  // Sort by priority (lower = higher priority)
  opportunities.sort((a, b) => a.priority - b.priority);

  return {
    opportunities,
    rejected,
    total_candidates: candidates.length,
    total_valid: opportunities.length,
  };
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

function validateCandidate(candidate: OpportunityCandidate): OpportunityValidation {
  if (candidate.confidence < MIN_CONFIDENCE) {
    return {
      is_valid: false,
      rejection_reason: `Confidence ${candidate.confidence} below minimum ${MIN_CONFIDENCE}`,
      candidate,
    };
  }

  if (candidate.evidence_refs.length < MIN_EVIDENCE_COUNT) {
    return {
      is_valid: false,
      rejection_reason: `Insufficient evidence (${candidate.evidence_refs.length} items, minimum ${MIN_EVIDENCE_COUNT})`,
      candidate,
    };
  }

  return { is_valid: true, rejection_reason: null, candidate };
}

function findDecisionForInference(inference: Inference, decisions: Decision[]): string {
  for (const d of decisions) {
    if (d.why.inferences.some(ref => ref.includes(inference.id))) {
      return makeRef('decision', d.id);
    }
  }
  return '';
}

function computePriority(
  upside: number,
  confidence: number,
  effort: Opportunity['effort_hint'],
): number {
  const effortPenalty: Record<string, number> = {
    trivial: 0,
    low: 5,
    medium: 15,
    high: 30,
    very_high: 50,
  };

  // Lower = higher priority
  // High upside + high confidence + low effort = lowest priority number
  return Math.max(1, Math.round(
    100 - upside * 0.5 - confidence * 0.3 + (effortPenalty[effort] || 15)
  ));
}
