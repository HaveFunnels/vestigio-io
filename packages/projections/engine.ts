import { Inference, makeRef } from '../domain';
import { MultiPackResult } from '../workspace';
import { QuantifiedValueCase, ImpactSummary } from '../impact';
import { RootCause, GlobalAction } from '../intelligence';
import type { PackEligibility } from '../classification';
import type { ConflictReport, ResolvedDecision } from '../decision/conflict-resolver';
import {
  FindingProjection,
  ActionProjection,
  WorkspaceProjection,
  WorkspaceProjectionType,
  WorkspaceCoherence,
  ConfidenceNarrative,
  ProjectionResult,
  SystemHealthIndicators,
  FindingTruthContext,
  FindingSuppressionContext,
  EngineTranslations,
  ChangeReportProjection,
  DecisionChangeProjection,
  deriveConfidenceTier,
} from './types';
import type { DecisionChange } from '../change-detection/types';

// ──────────────────────────────────────────────
// Projection Engine
//
// Transforms MultiPackResult → UI-ready projections.
// Deterministic. No logic. Pure mapping.
// ──────────────────────────────────────────────

// Inference → primary pack mapping
export const INFERENCE_TO_PACK: Record<string, string> = {
  commerce_context: 'scale_readiness',
  trust_boundary_crossed: 'scale_readiness',
  policy_gap: 'scale_readiness',
  checkout_integrity: 'scale_readiness',
  revenue_path_fragile: 'scale_readiness',
  measurement_coverage: 'scale_readiness',
  conversion_flow_fragmented: 'revenue_integrity',
  friction_on_critical_path: 'revenue_integrity',
  revenue_leakage: 'revenue_integrity',
  trust_break_in_checkout: 'revenue_integrity',
  measurement_blindspot: 'revenue_integrity',
  unclear_conversion_intent: 'revenue_integrity',
  refund_policy_gap: 'chargeback_resilience',
  support_unreachable: 'chargeback_resilience',
  expectation_misalignment: 'chargeback_resilience',
  dispute_risk_elevated: 'chargeback_resilience',
  // SaaS Growth Readiness
  activation_blocked: 'saas_growth_readiness',
  activation_friction_high: 'saas_growth_readiness',
  unclear_next_step: 'saas_growth_readiness',
  empty_state_without_guidance: 'saas_growth_readiness',
  navigation_overcomplex: 'saas_growth_readiness',
  feature_discovery_poor: 'saas_growth_readiness',
  upgrade_invisible: 'saas_growth_readiness',
  upgrade_timing_wrong: 'saas_growth_readiness',
  no_expansion_path: 'saas_growth_readiness',
  landing_app_mismatch: 'saas_growth_readiness',
  // Phase 30: New findings
  critical_path_broken: 'revenue_integrity',
  form_data_leaves_domain: 'scale_readiness',
  checkout_provider_fragmented: 'revenue_integrity',
  // Phase 30B: Extended findings
  redirect_chain_erodes_checkout_trust: 'revenue_integrity',
  commercial_journey_language_break: 'revenue_integrity',
  commercial_pages_disconnected: 'revenue_integrity',
  untrusted_embeds_near_purchase: 'scale_readiness',
  platform_checkout_risk_unaddressed: 'scale_readiness',
  post_purchase_confirmation_absent: 'chargeback_resilience',
  high_intent_surfaces_blind: 'revenue_integrity',
  revenue_path_regressed: 'scale_readiness',
  // Phase 2: Deepened collection findings
  refund_terms_too_thin: 'chargeback_resilience',
  support_hidden_at_purchase: 'chargeback_resilience',
  trust_surface_too_thin: 'scale_readiness',
  tracking_stack_gaps: 'scale_readiness',
  consent_undermining_measurement: 'revenue_integrity',
  // Phase 2B: Mobile & runtime
  mobile_commercial_path_blocked: 'scale_readiness',
  mobile_trust_weaker_than_desktop: 'revenue_integrity',
  runtime_errors_interrupt_purchase: 'revenue_integrity',
  runtime_measurement_broken: 'revenue_integrity',
  secondary_flows_bypass_trust_path: 'revenue_integrity',
  // Phase 2C
  refund_process_unclear: 'chargeback_resilience',
  post_purchase_proof_too_weak: 'chargeback_resilience',
  support_reassurance_too_late: 'chargeback_resilience',
  reassurance_routes_disconnected: 'revenue_integrity',
  alternate_flows_unmeasured: 'revenue_integrity',
  runtime_breaking_reassurance: 'chargeback_resilience',
  checkout_provider_path_weak: 'scale_readiness',
  trust_and_measurement_both_absent: 'revenue_integrity',
  // Phase 3A: Channel integrity pack
  payment_surface_compromised: 'channel_integrity',
  channel_traffic_divertible: 'channel_integrity',
  commerce_operations_exposed: 'channel_integrity',
  traffic_landing_low_trust_posture: 'channel_integrity',
  channel_compromise_visible: 'channel_integrity',
  commercial_path_abuse_friendly: 'channel_integrity',
  checkout_trust_brittle_infrastructure: 'channel_integrity',
  economic_exploitation_active: 'channel_integrity',
  // Phase 3B: Deep discovery findings
  promotion_logic_exposed: 'channel_integrity',
  cart_variant_weak_control: 'channel_integrity',
  hidden_discount_refund_route: 'channel_integrity',
  guessable_business_endpoint: 'channel_integrity',
  alternate_pricing_safeguard_bypass: 'revenue_integrity',
  js_discovered_purchase_variant: 'revenue_integrity',
  dynamic_route_weak_control: 'channel_integrity',
  hidden_support_burden: 'chargeback_resilience',
  alternate_variant_control_breakdown: 'revenue_integrity',
  deep_commerce_exploitation_risk: 'channel_integrity',
  // Phase 2D: Network analysis findings
  checkout_api_latency_degraded: 'revenue_integrity',
  commercial_pages_slow: 'scale_readiness',
  paid_landing_overloaded: 'scale_readiness',
  third_party_weight_delays_trust: 'scale_readiness',
  checkout_brittle_third_party: 'channel_integrity',
  purchase_blocked_failing_requests: 'revenue_integrity',
  measurement_breaks_revenue_path: 'revenue_integrity',
  purchase_before_deps_ready: 'revenue_integrity',
  trust_assets_late_load: 'chargeback_resilience',
  mobile_heavy_runtime_chain: 'scale_readiness',
  mobile_trust_payment_deps_failing: 'revenue_integrity',
  trust_surfaces_unstable_deps: 'channel_integrity',
  // Phase 3E: Discoverability pack
  commercial_pages_weak_search_representation: 'discoverability',
  social_previews_fail_commercial_value: 'discoverability',
  brand_inconsistent_across_surfaces: 'discoverability',
  commercial_pages_unlikely_indexed: 'discoverability',
  weak_semantic_intent_signals: 'discoverability',
  previews_disconnected_from_conversion: 'discoverability',
  commercial_pages_not_exposed_for_discovery: 'discoverability',
  // Phase 3E: Brand integrity pack
  lookalike_domain_competing_for_traffic: 'brand_integrity',
  external_sites_mimicking_brand: 'brand_integrity',
  brand_traffic_exposed_to_deceptive_surfaces: 'brand_integrity',
  suspicious_domains_capturing_purchase_intent: 'brand_integrity',
  customers_exposed_to_phishing_surfaces: 'brand_integrity',
  brand_presence_diluted_across_variants: 'brand_integrity',
  // Behavioral workspace findings (pixel-dependent)
  first_session_milestone_stall: 'first_impression_revenue',
  first_session_trust_barrier: 'first_impression_revenue',
  first_session_cta_timing_gap: 'first_impression_revenue',
  low_value_action_dominates: 'action_value_map',
  high_value_action_underexposed: 'action_value_map',
  dead_weight_surface_traffic: 'action_value_map',
  paid_traffic_friction_elevated: 'acquisition_integrity',
  paid_traffic_trust_gap: 'acquisition_integrity',
  paid_mobile_compounding_waste: 'acquisition_integrity',
  mobile_conversion_gap: 'mobile_revenue_exposure',
  mobile_form_friction_elevated: 'mobile_revenue_exposure',
  mobile_cta_timing_degraded: 'mobile_revenue_exposure',
  funnel_step_friction_cost: 'friction_tax',
  oscillation_decision_cost: 'friction_tax',
  checkout_entry_friction: 'friction_tax',
  trust_deficit_conversion_drag: 'trust_revenue_gap',
  reassurance_seeking_elevated: 'trust_revenue_gap',
  sensitive_input_trust_gap: 'trust_revenue_gap',
  path_length_exceeds_efficient: 'path_efficiency',
  intent_absorber_detected: 'path_efficiency',
  intent_decay_time_excessive: 'path_efficiency',
  // Phase 4B: Behavioral intelligence findings
  policy_view_then_abandonment: 'chargeback_resilience',
  high_intent_detour_before_abandonment: 'revenue_integrity',
  support_discovered_too_late_to_convert: 'chargeback_resilience',
  cta_visible_but_behaviorally_dead: 'revenue_integrity',
  purchase_hesitation_with_backtrack: 'revenue_integrity',
  critical_step_retries_before_abandonment: 'revenue_integrity',
  mobile_fails_first_commercial_action: 'scale_readiness',
  funnel_step_alive_but_not_advancing: 'revenue_integrity',
  // Phase 4B Hardening: 12 new behavioral findings
  hesitation_before_conversion_missing_trust: 'revenue_integrity',
  pricing_hesitation_unclear_value: 'revenue_integrity',
  policy_detour_before_conversion: 'chargeback_resilience',
  cta_viewed_not_engaged: 'revenue_integrity',
  sensitive_input_abandonment: 'revenue_integrity',
  form_excessive_fields_before_conversion: 'revenue_integrity',
  form_submission_retry_friction: 'revenue_integrity',
  surface_oscillation_before_dropoff: 'revenue_integrity',
  conversion_final_step_retry: 'revenue_integrity',
  cta_late_availability_delays_action: 'revenue_integrity',
  checkout_abandon_no_feedback: 'revenue_integrity',
  sensitive_input_perceived_risk_dropoff: 'revenue_integrity',
  // Wave 3.3: Security posture
  security_header_weakness: 'money_moment_exposure',
  mixed_content_exposure: 'money_moment_exposure',
  sensitive_endpoint_exposed: 'money_moment_exposure',
  // Wave 3.3 expansion: cybersecurity pack
  checkout_script_hijack_risk: 'money_moment_exposure',
  buyer_session_theft_risk: 'money_moment_exposure',
  checkout_clickjack_risk: 'money_moment_exposure',
  payment_data_unencrypted: 'money_moment_exposure',
};

// Inference → typical page surface
const INFERENCE_SURFACES: Record<string, string> = {
  trust_boundary_crossed: '/checkout',
  policy_gap: '/policies',
  checkout_integrity: '/checkout',
  revenue_path_fragile: '/cart → /checkout',
  measurement_coverage: '/ (sitewide)',
  conversion_flow_fragmented: '/cart → /checkout',
  friction_on_critical_path: '/pricing → /checkout',
  revenue_leakage: '/checkout',
  trust_break_in_checkout: '/checkout',
  measurement_blindspot: '/checkout → /thank-you',
  unclear_conversion_intent: '/ → /pricing',
  refund_policy_gap: '/policies',
  support_unreachable: '/contact',
  expectation_misalignment: '/pricing → /checkout',
  dispute_risk_elevated: '/ (sitewide)',
  // SaaS
  activation_blocked: '/app (onboarding)',
  activation_friction_high: '/app (onboarding)',
  unclear_next_step: '/app (onboarding)',
  empty_state_without_guidance: '/app (in-product)',
  navigation_overcomplex: '/app (navigation)',
  feature_discovery_poor: '/app (in-product)',
  upgrade_invisible: '/app (billing)',
  upgrade_timing_wrong: '/app (billing)',
  no_expansion_path: '/app (billing)',
  landing_app_mismatch: '/ → /app (cross-surface)',
  // Phase 30: New findings
  critical_path_broken: '/checkout, /cart, /pricing',
  form_data_leaves_domain: '/checkout → external',
  checkout_provider_fragmented: '/checkout',
  // Phase 30B: Extended findings
  redirect_chain_erodes_checkout_trust: '/ → /checkout (redirect chain)',
  commercial_journey_language_break: '/ → /checkout (language switch)',
  commercial_pages_disconnected: '/checkout, /pricing (orphaned)',
  untrusted_embeds_near_purchase: '/checkout (embedded content)',
  platform_checkout_risk_unaddressed: '/checkout (platform-specific)',
  post_purchase_confirmation_absent: '/checkout → post-purchase',
  high_intent_surfaces_blind: '/checkout, /cart (measurement gap)',
  revenue_path_regressed: '/ (sitewide regression)',
  // Phase 2
  refund_terms_too_thin: '/policies (refund)',
  support_hidden_at_purchase: '/checkout (support gap)',
  trust_surface_too_thin: '/ → /checkout (trust surface)',
  tracking_stack_gaps: '/ (sitewide measurement)',
  consent_undermining_measurement: '/ (consent × analytics)',
  // Phase 2B
  mobile_commercial_path_blocked: '/ → /checkout (mobile)',
  mobile_trust_weaker_than_desktop: '/checkout (mobile trust)',
  runtime_errors_interrupt_purchase: '/checkout (runtime)',
  runtime_measurement_broken: '/checkout (runtime measurement)',
  secondary_flows_bypass_trust_path: '/checkout (alternate flow)',
  // Phase 2C
  refund_process_unclear: '/policies (refund process)',
  post_purchase_proof_too_weak: '/thank-you (confirmation)',
  support_reassurance_too_late: '/checkout, /pricing (support gap)',
  reassurance_routes_disconnected: '/help, /faq (disconnected)',
  alternate_flows_unmeasured: '/checkout (untracked alternate)',
  runtime_breaking_reassurance: '/checkout (widget failure)',
  checkout_provider_path_weak: '/checkout → external (provider)',
  trust_and_measurement_both_absent: '/ (compound trust+measurement)',
  // Phase 3A
  payment_surface_compromised: '/checkout (script exposure)',
  channel_traffic_divertible: '/ (channel diversion)',
  commerce_operations_exposed: '/ (operational exposure)',
  traffic_landing_low_trust_posture: '/ (trust posture)',
  channel_compromise_visible: '/ (multi-exposure pattern)',
  commercial_path_abuse_friendly: '/api (abuse conditions)',
  checkout_trust_brittle_infrastructure: '/checkout (brittle infrastructure)',
  economic_exploitation_active: '/cart, /checkout (business-logic abuse)',
  // Phase 3B
  promotion_logic_exposed: '/coupon, /discount, /promo (deep discovery)',
  cart_variant_weak_control: '/cart, /checkout (alternate variants)',
  hidden_discount_refund_route: '/discount, /refund (hidden routes)',
  guessable_business_endpoint: '/api, /order, /billing (guessable)',
  alternate_pricing_safeguard_bypass: '/checkout (alternate pricing path)',
  js_discovered_purchase_variant: '/checkout (JS-discovered variant)',
  dynamic_route_weak_control: '/ (dynamic routes, weak governance)',
  hidden_support_burden: '/help, /support (disconnected from journey)',
  alternate_variant_control_breakdown: '/checkout (compound control failure)',
  deep_commerce_exploitation_risk: '/cart, /checkout, /api (deep exploitation)',
  // Phase 2D
  checkout_api_latency_degraded: '/checkout (API latency)',
  commercial_pages_slow: '/checkout, /cart, /pricing (runtime)',
  paid_landing_overloaded: '/ (landing page runtime)',
  third_party_weight_delays_trust: '/checkout, /pricing (third-party weight)',
  checkout_brittle_third_party: '/checkout (dependency reliability)',
  purchase_blocked_failing_requests: '/checkout (request failures)',
  measurement_breaks_revenue_path: '/checkout, /cart (measurement runtime)',
  purchase_before_deps_ready: '/checkout (dependency sequencing)',
  trust_assets_late_load: '/checkout (trust timing)',
  mobile_heavy_runtime_chain: '/checkout (mobile runtime)',
  mobile_trust_payment_deps_failing: '/checkout (mobile dependencies)',
  trust_surfaces_unstable_deps: '/ (trust dependency reliability)',
  // Phase 3E: Discoverability
  commercial_pages_weak_search_representation: '/checkout, /pricing, /product (search snippets)',
  social_previews_fail_commercial_value: '/product, /pricing (social sharing)',
  brand_inconsistent_across_surfaces: '/ (sitewide brand consistency)',
  commercial_pages_unlikely_indexed: '/checkout, /product, /pricing (indexing)',
  weak_semantic_intent_signals: '/product, /pricing (structured data)',
  previews_disconnected_from_conversion: '/ (preview content mismatch)',
  commercial_pages_not_exposed_for_discovery: '/product, /pricing (internal linking)',
  // Phase 3E: Brand integrity
  lookalike_domain_competing_for_traffic: '/ (external brand domains)',
  external_sites_mimicking_brand: '/ (external impersonation)',
  brand_traffic_exposed_to_deceptive_surfaces: '/ (typosquat domains)',
  suspicious_domains_capturing_purchase_intent: '/ (impostor storefronts)',
  customers_exposed_to_phishing_surfaces: '/ (phishing domains)',
  brand_presence_diluted_across_variants: '/ (domain variant fragmentation)',
  // Phase 4B
  policy_view_then_abandonment: '/policy → abandonment (behavioral)',
  high_intent_detour_before_abandonment: '/checkout → /faq → abandonment (behavioral)',
  support_discovered_too_late_to_convert: '/checkout → /support (behavioral)',
  cta_visible_but_behaviorally_dead: '/ (CTA engagement, behavioral)',
  purchase_hesitation_with_backtrack: '/checkout → backtrack (behavioral)',
  critical_step_retries_before_abandonment: '/checkout (retries, behavioral)',
  mobile_fails_first_commercial_action: '/ (mobile entry, behavioral)',
  funnel_step_alive_but_not_advancing: '/ (funnel bottleneck, behavioral)',
  // Phase 4B Hardening
  hesitation_before_conversion_missing_trust: '/checkout, /pricing (CTA hesitation, behavioral)',
  pricing_hesitation_unclear_value: '/pricing → /product (backtrack, behavioral)',
  policy_detour_before_conversion: '/checkout → /policy → abandonment (behavioral)',
  cta_viewed_not_engaged: '/ (CTA visibility vs engagement, behavioral)',
  sensitive_input_abandonment: '/checkout, /contact (input abandonment, behavioral)',
  form_excessive_fields_before_conversion: '/checkout, /contact (form friction, behavioral)',
  form_submission_retry_friction: '/checkout, /contact (form retry, behavioral)',
  surface_oscillation_before_dropoff: '/ (oscillation between surfaces, behavioral)',
  conversion_final_step_retry: '/checkout (final step retry, behavioral)',
  cta_late_availability_delays_action: '/ (CTA render timing, behavioral)',
  checkout_abandon_no_feedback: '/checkout (immediate abandon, behavioral)',
  sensitive_input_perceived_risk_dropoff: '/checkout, /billing (sensitive field dropoff, behavioral)',
  // Wave 3.3: Security posture
  security_header_weakness: '/ (sitewide security headers)',
  mixed_content_exposure: '/checkout, /cart (mixed content)',
  sensitive_endpoint_exposed: '/ (exposed files and endpoints)',
  // Wave 3.3 expansion: cybersecurity pack
  checkout_script_hijack_risk: '/checkout, /payment (external scripts)',
  buyer_session_theft_risk: '/checkout, /cart, /account (cookie security)',
  checkout_clickjack_risk: '/checkout, /payment (clickjack protection)',
  payment_data_unencrypted: '/checkout, /payment (form targets)',
};

// Human-readable titles for inference findings
// Phase 30: Every title rewritten for commercial sharpness
export const INFERENCE_TITLES: Record<string, string> = {
  // ── Scale Readiness ─────────────────────────────
  trust_boundary_crossed: 'Checkout trust continuity broken',
  policy_gap: 'Consumer protection policies missing or incomplete',
  checkout_integrity: 'Checkout structural integrity degraded',
  revenue_path_fragile: 'Revenue path structurally fragile under scale',
  measurement_coverage: 'Measurement infrastructure insufficient for optimization',
  // ── Revenue Integrity ───────────────────────────
  conversion_flow_fragmented: 'Conversion flow scattered across domains',
  friction_on_critical_path: 'Friction barriers on the revenue path',
  revenue_leakage: 'Revenue actively leaking from conversion path',
  trust_break_in_checkout: 'Trust signals absent at the purchase moment',
  measurement_blindspot: 'Blind spot on commercial page measurement',
  unclear_conversion_intent: 'Primary conversion path unclear to visitors',
  // ── Chargeback Resilience ───────────────────────
  refund_policy_gap: 'Refund and return expectations undocumented',
  support_unreachable: 'Customer support channels invisible or missing',
  expectation_misalignment: 'Purchase expectations poorly set before checkout',
  dispute_risk_elevated: 'Compound chargeback risk from multiple deficiencies',
  // ── SaaS Growth Readiness ───────────────────────
  activation_blocked: 'Activation path blocked before first value',
  activation_friction_high: 'Onboarding friction eroding trial-to-paid conversion',
  unclear_next_step: 'Users stranded without clear next action in onboarding',
  empty_state_without_guidance: 'Empty screens driving early-session abandonment',
  navigation_overcomplex: 'App navigation burying core features',
  feature_discovery_poor: 'Key features hidden behind complex navigation',
  upgrade_invisible: 'Upgrade surfaces hidden at value moments',
  upgrade_timing_wrong: 'Upgrade prompts shown without value context',
  no_expansion_path: 'No self-serve path from free to paid',
  landing_app_mismatch: 'Landing page promise disconnected from app reality',
  // ── Phase 30: New findings ──────────────────────
  critical_path_broken: 'Revenue-critical pages unreachable',
  form_data_leaves_domain: 'Buyer data leaving the domain through unrecognized form targets',
  checkout_provider_fragmented: 'Checkout fragmented across competing providers',
  // ── Phase 30B: Extended findings ──────────────
  redirect_chain_erodes_checkout_trust: 'Checkout trust eroded by redirect chain',
  commercial_journey_language_break: 'Commercial journey switches language before conversion',
  commercial_pages_disconnected: 'Commercial pages disconnected from main journey',
  untrusted_embeds_near_purchase: 'Unknown external embeds weakening purchase trust',
  platform_checkout_risk_unaddressed: 'Platform-specific checkout risk left unaddressed',
  post_purchase_confirmation_absent: 'Post-purchase confirmation and return terms both absent',
  high_intent_surfaces_blind: 'High-intent surfaces operating without optimization visibility',
  revenue_path_regressed: 'Revenue path degraded since last audit',
  // Phase 2
  refund_terms_too_thin: 'Refund and return terms too thin to defuse disputes',
  support_hidden_at_purchase: 'Support exists but hidden when buyers need reassurance',
  trust_surface_too_thin: 'Commercial trust signals too thin on high-intent surfaces',
  tracking_stack_gaps: 'High-intent tracking stack incomplete where optimization matters',
  consent_undermining_measurement: 'Consent setup silently undermining measurement continuity',
  // Phase 2B
  mobile_commercial_path_blocked: 'Mobile navigation blocking access to commercial paths',
  mobile_trust_weaker_than_desktop: 'Mobile buyers routed into weaker trust experience than desktop',
  runtime_errors_interrupt_purchase: 'Runtime failures interrupting the purchase journey',
  runtime_measurement_broken: 'Runtime failures weakening measurement on high-intent paths',
  secondary_flows_bypass_trust_path: 'Secondary commercial flows bypassing the main trust path',
  // Phase 2C
  refund_process_unclear: 'Refund process too vague to defuse post-purchase panic',
  post_purchase_proof_too_weak: 'Post-purchase proof too weak to prevent disputes',
  support_reassurance_too_late: 'Support reassurance appears too late in the buying journey',
  reassurance_routes_disconnected: 'Reassurance content disconnected from the commercial journey',
  alternate_flows_unmeasured: 'Alternate commercial flows operating without measurement',
  runtime_breaking_reassurance: 'Runtime failures breaking support where buyers hesitate most',
  checkout_provider_path_weak: 'Checkout sending buyers through a weaker-than-expected provider path',
  trust_and_measurement_both_absent: 'Trust and measurement both absent on commercial paths',
  // Phase 3A: Channel integrity
  payment_surface_compromised: 'Purchase surface exposed to unauthorized script influence',
  channel_traffic_divertible: 'Customer traffic exposed to diversion through weakly governed surfaces',
  commerce_operations_exposed: 'Operational admin surfaces publicly accessible near commercial infrastructure',
  traffic_landing_low_trust_posture: 'Paid traffic landing inside a low-trust technical posture',
  channel_compromise_visible: 'Commercial channel exposed to compromise patterns that trigger distrust',
  commercial_path_abuse_friendly: 'Commercial path exposed to abuse-friendly technical conditions',
  checkout_trust_brittle_infrastructure: 'Checkout trust anchored to brittle public infrastructure',
  economic_exploitation_active: 'Commerce exposed to systematic economic exploitation',
  // Phase 3B: Deep discovery findings
  promotion_logic_exposed: 'Promotion logic exposed to abusive discount behavior',
  cart_variant_weak_control: 'Cart variants allow weaker pricing controls',
  hidden_discount_refund_route: 'Hidden discount or refund routes weaken commercial safeguards',
  guessable_business_endpoint: 'Business-critical commerce actions reachable through predictable paths',
  alternate_pricing_safeguard_bypass: 'Alternate commercial actions bypass intended pricing safeguards',
  js_discovered_purchase_variant: 'Hidden purchase paths operating outside the main safeguard model',
  dynamic_route_weak_control: 'Deeper commerce logic governed more weakly than the visible purchase flow',
  hidden_support_burden: 'Hidden support actions increase burden instead of reducing hesitation',
  alternate_variant_control_breakdown: 'Trust, measurement, and pricing controls break on alternate commerce variants',
  deep_commerce_exploitation_risk: 'Deeply reachable commerce surfaces easier to exploit than the primary flow',
  // Phase 2D: Network analysis findings
  checkout_api_latency_degraded: 'Checkout API latency degrading purchase completion',
  commercial_pages_slow: 'Critical commerce pages slower than the rest of the site',
  paid_landing_overloaded: 'Paid landing overloaded before buyers reach the first meaningful action',
  third_party_weight_delays_trust: 'Third-party request weight delaying the moment of trust and intent',
  checkout_brittle_third_party: 'Checkout reliability depends on brittle third-party services',
  purchase_blocked_failing_requests: 'Purchase flow blocked by failing third-party requests',
  measurement_breaks_revenue_path: 'Measurement continuity breaks on the path that generates revenue',
  purchase_before_deps_ready: 'Buyers reach the purchase moment before critical dependencies are ready',
  trust_assets_late_load: 'Trust and reassurance assets load too late to calm hesitation',
  mobile_heavy_runtime_chain: 'Mobile commerce path degraded by heavy runtime dependency chain',
  mobile_trust_payment_deps_failing: 'Support, payment, or trust layers fail on mobile-first sessions',
  trust_surfaces_unstable_deps: 'Trust-critical surfaces rely on unstable external dependencies',
  // Phase 3E: Discoverability findings
  commercial_pages_weak_search_representation: 'High-intent pages not properly represented in search surfaces',
  social_previews_fail_commercial_value: 'Shared links fail to communicate commercial value',
  brand_inconsistent_across_surfaces: 'Brand appears inconsistently across search and sharing surfaces',
  commercial_pages_unlikely_indexed: 'Commercial pages unlikely to be reliably indexed',
  weak_semantic_intent_signals: 'Search and AI systems receive weak signals about page purpose',
  previews_disconnected_from_conversion: 'Social and search previews disconnected from conversion intent',
  commercial_pages_not_exposed_for_discovery: 'Key commercial pages not structurally exposed for discovery',
  // Phase 3E: Brand integrity findings
  lookalike_domain_competing_for_traffic: 'Lookalike domains competing for brand traffic',
  external_sites_mimicking_brand: 'External sites mimicking brand identity',
  brand_traffic_exposed_to_deceptive_surfaces: 'Brand traffic exposed to deceptive landing surfaces',
  suspicious_domains_capturing_purchase_intent: 'Suspicious domains positioned to capture purchase intent',
  customers_exposed_to_phishing_surfaces: 'Customers exposed to potential phishing surfaces',
  brand_presence_diluted_across_variants: 'Brand presence diluted across competing domain variants',
  // Phase 4B: Behavioral intelligence findings
  policy_view_then_abandonment: 'Users drop off after opening refund or return policies',
  high_intent_detour_before_abandonment: 'High-intent sessions detour into reassurance content before abandonment',
  support_discovered_too_late_to_convert: 'Support is being discovered too late to save the conversion',
  cta_visible_but_behaviorally_dead: 'Commercial CTA is visible but behaviorally dead',
  purchase_hesitation_with_backtrack: 'Users hesitate on the purchase step and backtrack into trust content',
  critical_step_retries_before_abandonment: 'Critical commercial step triggers repeated retries before abandonment',
  mobile_fails_first_commercial_action: 'Mobile users fail to progress past the first commercial action',
  funnel_step_alive_but_not_advancing: 'Funnel step is alive but not advancing sessions',
  // Phase 4B Hardening: 12 new behavioral findings
  hesitation_before_conversion_missing_trust: 'Users hesitate before conversion due to missing trust signals near CTA',
  pricing_hesitation_unclear_value: 'Users delay conversion after viewing pricing due to unclear value justification',
  policy_detour_before_conversion: 'Users open policies before converting due to trust uncertainty',
  cta_viewed_not_engaged: 'Primary CTA is viewed but not engaged',
  sensitive_input_abandonment: 'Users abandon after interacting with sensitive input',
  form_excessive_fields_before_conversion: 'Form requires high-effort input before conversion due to excessive or sensitive fields',
  form_submission_retry_friction: 'Users retry form submission multiple times',
  surface_oscillation_before_dropoff: 'Back-and-forth between surfaces before dropoff due to unresolved decision friction',
  conversion_final_step_retry: 'Conversion attempts require multiple retries due to friction in final steps',
  cta_late_availability_delays_action: 'Users delay action due to late availability of primary CTA',
  checkout_abandon_no_feedback: 'Users abandon after initiating checkout due to lack of immediate feedback or progress indication',
  sensitive_input_perceived_risk_dropoff: 'Users drop off after entering sensitive information due to perceived risk',
  // Wave 3.3: Security posture
  security_header_weakness: 'Browsers signal your site as unsafe to buyers',
  mixed_content_exposure: 'Checkout silently breaks for some visitors',
  sensitive_endpoint_exposed: 'Infrastructure credentials are one search away',
  // Wave 3.3 expansion: cybersecurity pack
  checkout_script_hijack_risk: 'Your checkout can be hijacked by compromised scripts',
  buyer_session_theft_risk: 'Buyer sessions can be stolen on your commercial pages',
  checkout_clickjack_risk: 'Your checkout page can be faked inside another site',
  payment_data_unencrypted: 'Payment data crosses an unencrypted boundary',
};

// ── Parametric Title Resolution ──
// Findings 5 and 8 carry concrete parameters (field kind, surface pair).
// When available, the title is parameterized. When missing, the finding
// was already suppressed at signal/inference level.
const FIELD_KIND_LABELS: Record<string, string> = {
  email: 'email', phone: 'phone number', card_like: 'payment card',
  cpf_cnpj_like: 'identity document', password: 'password', address: 'address',
  name: 'name', company: 'company', coupon: 'coupon',
};

function resolveParameterizedTitle(inferenceKey: string, conclusionValue: string, fallback: string, translations?: EngineTranslations): string {
  if (inferenceKey === 'sensitive_input_abandonment') {
    // conclusion_value = "severity:field_kind"
    const parts = conclusionValue.split(':');
    const fieldKind = parts[1];
    const label = translations?.field_kind_labels?.[fieldKind] ?? FIELD_KIND_LABELS[fieldKind];
    if (fieldKind && label) {
      const template = translations?.parametric_titles?.sensitive_input_abandonment;
      return template
        ? template.replace('{field_kind}', label)
        : `Users abandon after interacting with ${label} input`;
    }
  }
  if (inferenceKey === 'surface_oscillation_before_dropoff') {
    // conclusion_value = "severity:surfaceA:surfaceB"
    const parts = conclusionValue.split(':');
    if (parts.length >= 3) {
      const surfaceA = parts[1];
      const surfaceB = parts[2];
      if (surfaceA && surfaceB) {
        const template = translations?.parametric_titles?.surface_oscillation_before_dropoff;
        return template
          ? template.replace('{surfaceA}', surfaceA).replace('{surfaceB}', surfaceB)
          : `Back-and-forth between ${surfaceA} and ${surfaceB} before dropoff due to unresolved decision friction`;
      }
    }
  }
  return fallback;
}

export function projectAll(result: MultiPackResult, translations?: EngineTranslations): ProjectionResult {
  const findings = projectFindings(result, translations);
  const actions = projectActions(result, translations);
  const workspaces = projectWorkspaces(result, findings, translations);
  const coherenceScore = result.conflict_report?.resolved_decisions?.coherence_score ?? 100;
  const systemHealth = buildSystemHealth(result);
  const changeReport = projectChangeReport(result);
  return { findings, actions, workspaces, coherence_score: coherenceScore, system_health: systemHealth, change_report: changeReport };
}

export function projectFindings(result: MultiPackResult, translations?: EngineTranslations): FindingProjection[] {
  const valueCases = result.impact.value_cases;
  const rootCauses = result.intelligence.root_causes;
  const inferences = result.inferences;

  // Index inferences by key for fast lookup
  const inferenceByKey = new Map<string, Inference>();
  for (const inf of inferences) {
    inferenceByKey.set(inf.inference_key, inf);
  }

  const findings: FindingProjection[] = [];

  for (const vc of valueCases) {
    const inf = inferenceByKey.get(vc.inference_key);
    if (!inf) continue;

    // Find root cause for this inference
    const infRef = makeRef('inference', inf.id);
    const rc = rootCauses.find(r => r.contributing_inferences.includes(infRef));

    const midpoint = Math.round((vc.estimated_impact.range.min + vc.estimated_impact.range.max) / 2);

    const packKey = INFERENCE_TO_PACK[vc.inference_key] || 'unknown';

    // Compute finding eligibility based on its pack
    const packElig = result.pack_eligibility;
    let findingEligible = true;
    let findingEligConf = 1;

    if (packKey === 'revenue_integrity') {
      findingEligible = packElig.revenue_integrity.eligible;
      findingEligConf = packElig.revenue_integrity.confidence;
    } else if (packKey === 'chargeback_resilience') {
      findingEligible = packElig.chargeback_resilience.eligible;
      findingEligConf = packElig.chargeback_resilience.confidence;
    } else if (packKey === 'saas_growth_readiness') {
      findingEligible = packElig.saas_pack.eligible;
      findingEligConf = packElig.saas_pack.confidence;
    } else if (packKey === 'channel_integrity') {
      findingEligible = packElig.channel_integrity.eligible;
      findingEligConf = packElig.channel_integrity.confidence;
    } else if (packKey === 'discoverability') {
      findingEligible = packElig.discoverability.eligible;
      findingEligConf = packElig.discoverability.confidence;
    } else if (packKey === 'brand_integrity') {
      findingEligible = packElig.brand_integrity.eligible;
      findingEligConf = packElig.brand_integrity.confidence;
    } else if (
      // Behavioral packs share a single pixel-data eligibility gate.
      // When pack_eligibility.behavioral_workspaces is false, every
      // behavioral finding is marked ineligible so the UI knows the
      // result is not load-bearing. The pack key strings come from
      // INFERENCE_TO_PACK in this same file.
      packKey === 'first_impression_revenue' ||
      packKey === 'action_value_map' ||
      packKey === 'acquisition_integrity' ||
      packKey === 'mobile_revenue_exposure' ||
      packKey === 'friction_tax' ||
      packKey === 'trust_revenue_gap' ||
      packKey === 'path_efficiency'
    ) {
      findingEligible = packElig.behavioral_workspaces.eligible;
      findingEligConf = packElig.behavioral_workspaces.confidence;
    }
    // scale_readiness, channel_integrity, discoverability, brand_integrity are always eligible

    // Phase 27: Build truth context from harmonization data
    const truthContext = buildFindingTruthContext(inf, result);

    // Phase 27: Build suppression context
    const suppressionContext = buildFindingSuppressionContext(inf, result);

    // Phase 0 UX: Build verification, change, and evidence quality context
    const verificationCtx = buildFindingVerificationContext(inf, result);
    const changeClass = buildFindingChangeClass(vc.inference_key, result);
    const evidenceQualityCtx = buildFindingEvidenceQuality(inf, result);

    // Parameterize titles for findings that carry concrete parameters
    let title = translations?.inference_titles?.[vc.inference_key] ?? INFERENCE_TITLES[vc.inference_key] ?? vc.cause;
    if (inf.conclusion_value) {
      title = resolveParameterizedTitle(vc.inference_key, inf.conclusion_value, title, translations);
    }

    // Translate root cause title using the root cause key
    const rootCauseTitle = rc
      ? (translations?.root_cause_titles?.[rc.root_cause_key] ?? rc.title)
      : null;

    findings.push({
      id: `finding_${vc.inference_key}`,
      title,
      root_cause: rootCauseTitle,
      severity: mapSeverityFromInference(inf),
      confidence: vc.confidence,
      confidence_tier: deriveConfidenceTier(vc.confidence),
      impact: {
        monthly_range: vc.estimated_impact.range,
        midpoint,
        impact_type: vc.impact_type,
        percentage_delta: vc.estimated_impact.percentage_delta,
        currency: vc.estimated_impact.currency,
      },
      pack: packKey,
      surface: INFERENCE_SURFACES[vc.inference_key] || '/',
      freshness: inf.freshness.freshness_state,
      inference_key: vc.inference_key,
      reasoning: vc.reasoning,
      cause: vc.cause,
      effect: vc.effect,
      basis_type: vc.basis_type,
      eligibility: {
        eligible: findingEligible,
        confidence: findingEligConf,
      },
      polarity: computePolarity(inf, vc),
      truth_context: truthContext,
      suppression_context: suppressionContext,
      verification_maturity: verificationCtx.maturity,
      verification_method: verificationCtx.method,
      change_class: changeClass,
      evidence_quality: evidenceQualityCtx,
    });
  }

  // ── Add positive findings from healthy signals ──
  addPositiveFindings(findings, inferences, result, translations);

  // Sort: negatives first by impact, then positives, then neutrals
  findings.sort((a, b) => {
    const polarityOrder = { negative: 0, neutral: 1, positive: 2 };
    const pd = polarityOrder[a.polarity] - polarityOrder[b.polarity];
    if (pd !== 0) return pd;
    return b.impact.midpoint - a.impact.midpoint;
  });

  // Wave 2.4: filter `low` confidence_tier findings out of the projection.
  // The engine still processes them (they participate in maps, change
  // detection, calibration, etc.) — they just don't reach the UI. Showing
  // a finding the engine itself isn't sure about is worse than not showing
  // it at all. Threshold lives in deriveConfidenceTier (currently <50).
  return findings.filter((f) => f.confidence_tier !== 'low');
}

export function projectActions(result: MultiPackResult, translations?: EngineTranslations): ActionProjection[] {
  const coherenceScore = result.conflict_report?.resolved_decisions?.coherence_score ?? 100;
  const globalActions = result.intelligence.global_actions;
  const rootCauses = result.intelligence.root_causes;
  const valueCases = result.impact.value_cases;
  const inferences = result.inferences;

  // Build map: root_cause_ref → sum of value case impacts
  const rcImpact = computeRootCauseImpact(rootCauses, valueCases, inferences);

  // Phase 1B: Build decision lookup by ref for decision_status
  const decisionsByRef = new Map<string, { status: string; decision_key: string }>();
  const allDecisions = [
    result.scale_readiness.decision,
    result.revenue_integrity.decision,
    result.chargeback_resilience.decision,
    ...(result.saas_growth_readiness ? [result.saas_growth_readiness.decision] : []),
  ];
  for (const d of allDecisions) {
    decisionsByRef.set(makeRef('decision', d.id), { status: d.status, decision_key: d.decision_key });
  }

  // Phase 1B: Build domain action lookup by ref for effort_hint
  const allDomainActions = [
    ...result.scale_readiness.actions,
    ...result.revenue_integrity.actions,
    ...result.chargeback_resilience.actions,
    ...(result.saas_growth_readiness?.actions || []),
  ];
  const domainActionByRef = new Map<string, { effort_hint: string | null }>();
  for (const da of allDomainActions) {
    domainActionByRef.set(makeRef('action', da.id), da);
  }

  // Phase 1B: Build opportunity lookup by decision_ref for operational_status
  const opportunityByDecisionRef = new Map<string, string>();
  if (result.opportunities?.opportunities) {
    for (const opp of result.opportunities.opportunities) {
      for (const dref of opp.decision_refs) {
        opportunityByDecisionRef.set(dref, opp.status);
      }
    }
  }

  const actions: ActionProjection[] = globalActions.map(action => {
    const rc = action.root_cause_ref
      ? rootCauses.find(r => makeRef('root_cause', r.id) === action.root_cause_ref)
      : null;

    const impact = rc && rcImpact.has(rc.root_cause_key)
      ? rcImpact.get(rc.root_cause_key)!
      : null;

    // Compute priority score: impact midpoint × (confidence/100) × cross-pack multiplier
    // Phase 27: Coherence affects action priority — incoherent actions are less reliable
    const impactMid = impact?.midpoint || 0;
    const crossPackMultiplier = action.cross_pack_impact > 1 ? 1.5 : 1.0;
    const coherenceMultiplier = coherenceScore < 70 ? Math.max(0.7, coherenceScore / 100) : 1.0;
    const priorityScore = Math.round(impactMid * (action.confidence / 100) * crossPackMultiplier * coherenceMultiplier);

    // Translate root cause title using root_cause_key
    const actionRcTitle = rc
      ? (translations?.root_cause_titles?.[rc.root_cause_key] ?? rc.title)
      : null;

    // Phase 1B: Map action_type to category
    const category = mapActionTypeToCategory(action.action_type);

    // Phase 1B: Resolve decision_status from source decisions
    const decisionStatus = resolveDecisionStatus(action.source_decisions, decisionsByRef);

    // Phase 1B: Resolve operational_status from matching incident/opportunity
    const operationalStatus = resolveOperationalStatus(action.source_decisions, category, opportunityByDecisionRef);

    // Phase 1B: Resolve effort_hint from domain actions via merged_from
    const effortHint = resolveEffortHint(action.merged_from, domainActionByRef);

    // Phase 1B: Change class from change report (cross-reference via action_key)
    const changeClass = buildActionChangeClass(action.action_key, result);

    // Phase 1B: Verification maturity (derived from decision lifecycle state)
    const verificationMaturity = buildActionVerificationMaturity(action, decisionsByRef);

    // Phase 1B: Derive resolve_path
    const resolvePath = deriveResolvePath(category, verificationMaturity, decisionStatus);

    return {
      id: action.action_key,
      title: action.title,
      description: action.description,
      root_cause: actionRcTitle,
      root_cause_key: rc?.root_cause_key ?? null,
      impact: impact ? { monthly_range: impact.range, midpoint: impact.midpoint } : null,
      confidence: action.confidence,
      confidence_tier: deriveConfidenceTier(action.confidence),
      cross_pack: action.cross_pack_impact > 1,
      priority_score: priorityScore,
      severity: action.severity,
      action_type: action.action_type,
      category,
      operational_status: operationalStatus,
      decision_status: decisionStatus,
      effort_hint: effortHint,
      change_class: changeClass,
      verification_maturity: verificationMaturity,
      resolve_path: resolvePath,
    };
  });

  // Sort: PRIMARY impact midpoint DESC, SECONDARY confidence DESC, TERTIARY severity
  const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  actions.sort((a, b) => {
    const impactDiff = (b.impact?.midpoint || 0) - (a.impact?.midpoint || 0);
    if (impactDiff !== 0) return impactDiff;
    const confDiff = b.confidence - a.confidence;
    if (confDiff !== 0) return confDiff;
    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
  });

  return actions;
}

// ──────────────────────────────────────────────
// Phase 1B UX: Action projection helpers
// ──────────────────────────────────────────────

function mapActionTypeToCategory(
  actionType: string,
): ActionProjection['category'] {
  switch (actionType) {
    case 'risk_mitigation': return 'incident';
    case 'opportunity_capture': return 'opportunity';
    case 'verification': return 'verification';
    case 'observation': return 'observation';
    default: return 'observation';
  }
}

function resolveDecisionStatus(
  sourceDecisions: string[],
  decisionsByRef: Map<string, { status: string; decision_key: string }>,
): string | null {
  for (const ref of sourceDecisions) {
    const d = decisionsByRef.get(ref);
    if (d) return d.status;
  }
  return null;
}

function resolveOperationalStatus(
  sourceDecisions: string[],
  category: ActionProjection['category'],
  opportunityByDecisionRef: Map<string, string>,
): string | null {
  // For opportunity actions, look up matching opportunity status
  if (category === 'opportunity') {
    for (const ref of sourceDecisions) {
      const status = opportunityByDecisionRef.get(ref);
      if (status) return status;
    }
  }
  // For incidents, we would look up matching incident status, but incidents
  // are not yet part of MultiPackResult. Return null safely.
  return null;
}

function resolveEffortHint(
  mergedFrom: string[],
  domainActionByRef: Map<string, { effort_hint: string | null }>,
): string | null {
  for (const ref of mergedFrom) {
    const da = domainActionByRef.get(ref);
    if (da?.effort_hint) return da.effort_hint;
  }
  return null;
}

function buildActionChangeClass(
  actionKey: string,
  result: MultiPackResult,
): ActionProjection['change_class'] {
  if (!result.change_report) return null;

  const report = result.change_report;

  for (const dc of report.regressions) {
    if (dc.decision_key.includes(actionKey) || actionKey.includes(dc.decision_key)) {
      return 'regression';
    }
  }
  for (const dc of report.improvements) {
    if (dc.decision_key.includes(actionKey) || actionKey.includes(dc.decision_key)) {
      return 'improvement';
    }
  }
  for (const dc of report.new_issues) {
    if (dc.decision_key.includes(actionKey) || actionKey.includes(dc.decision_key)) {
      return 'new_issue';
    }
  }
  for (const dc of report.resolved_issues) {
    if (dc.decision_key.includes(actionKey) || actionKey.includes(dc.decision_key)) {
      return 'resolved';
    }
  }
  for (const dc of report.stable_risks) {
    if (dc.decision_key.includes(actionKey) || actionKey.includes(dc.decision_key)) {
      return 'stable_risk';
    }
  }

  return null;
}

function buildActionVerificationMaturity(
  action: { source_decisions: string[] },
  decisionsByRef: Map<string, { status: string; decision_key: string }>,
): ActionProjection['verification_maturity'] {
  // Map the engine's decision status to the projection-layer
  // VerificationStage union (Wave 2.4 renamed for operator-facing clarity).
  //   'created'   → static_evidence       (real but not yet corroborated)
  //   'confirmed' → confirming            (browser run in progress)
  //   'resolved'  → confirmed             (browser corroborated in runtime)
  //   'stale'     → confirmation_expired  (was confirmed, now too old)
  //   'regressed' → evidence_weakened     (was confirmed, now weaker)
  for (const ref of action.source_decisions) {
    const d = decisionsByRef.get(ref);
    if (!d) continue;
    switch (d.status) {
      case 'created': return 'static_evidence';
      case 'confirmed': return 'confirming';
      case 'resolved': return 'confirmed';
      case 'stale': return 'confirmation_expired';
      case 'regressed': return 'evidence_weakened';
      default: return null;
    }
  }
  return null;
}

function deriveResolvePath(
  category: ActionProjection['category'],
  verificationMaturity: ActionProjection['verification_maturity'],
  decisionStatus: string | null,
): ActionProjection['resolve_path'] {
  if (category === 'incident') {
    if (verificationMaturity === 'confirmed' && decisionStatus === 'resolved') {
      return 'track';
    }
    return 'fix';
  }
  if (category === 'opportunity') return 'verify';
  if (category === 'verification') return 'verify';
  return null;
}

export function projectWorkspaces(
  result: MultiPackResult,
  allFindings?: FindingProjection[],
  translations?: EngineTranslations,
): WorkspaceProjection[] {
  const findings = allFindings || projectFindings(result, translations);
  const conflictReport = result.conflict_report;

  // Build coherence map from conflict report
  const coherenceByDecisionRef = buildCoherenceMap(conflictReport, result);

  // Phase 27: Build confidence narrative from profile/impact state
  const narrative = buildConfidenceNarrative(result, translations);

  // Phase 2 UX: Build workspace-level change summaries
  const changeReport = projectChangeReport(result);
  const changeSummaryMap = buildWorkspaceChangeSummaries(changeReport);

  const scaleFindings = findings.filter(f => f.pack === 'scale_readiness');
  const revenueFindings = findings.filter(f => f.pack === 'revenue_integrity');
  const chargebackFindings = findings.filter(f => f.pack === 'chargeback_resilience');
  const securityFindings = findings.filter(f => f.pack === 'money_moment_exposure');
  const saasFindings = findings.filter(f => f.pack === 'saas_growth_readiness');

  const wn = translations?.workspace_names;

  const workspaces: WorkspaceProjection[] = [
    buildWorkspaceProjection(
      'preflight', wn?.preflight ?? 'Preflight', 'preflight',
      'scale_readiness_pack',
      result.scale_readiness.decision.decision_key,
      result.scale_readiness.decision.decision_impact,
      scaleFindings,
      coherenceByDecisionRef.get(makeRef('decision', result.scale_readiness.decision.id)) || null,
      narrative,
      changeSummaryMap.get('scale_readiness_pack') ?? null,
    ),
    buildWorkspaceProjection(
      'revenue', wn?.revenue ?? 'Revenue Analysis', 'revenue',
      'revenue_integrity_pack',
      result.revenue_integrity.decision.decision_key,
      result.revenue_integrity.decision.decision_impact,
      revenueFindings,
      coherenceByDecisionRef.get(makeRef('decision', result.revenue_integrity.decision.id)) || null,
      narrative,
      changeSummaryMap.get('revenue_integrity_pack') ?? null,
    ),
    buildWorkspaceProjection(
      'chargeback', wn?.chargeback ?? 'Chargeback Analysis', 'chargeback',
      'chargeback_resilience_pack',
      result.chargeback_resilience.decision.decision_key,
      result.chargeback_resilience.decision.decision_impact,
      chargebackFindings,
      coherenceByDecisionRef.get(makeRef('decision', result.chargeback_resilience.decision.id)) || null,
      narrative,
      changeSummaryMap.get('chargeback_resilience_pack') ?? null,
    ),
    buildWorkspaceProjection(
      'security_posture', wn?.security_posture ?? 'Security Posture', 'security_posture',
      'money_moment_exposure_pack',
      result.money_moment_exposure.decision.decision_key,
      result.money_moment_exposure.decision.decision_impact,
      securityFindings,
      coherenceByDecisionRef.get(makeRef('decision', result.money_moment_exposure.decision.id)) || null,
      narrative,
      changeSummaryMap.get('money_moment_exposure_pack') ?? null,
    ),
  ];

  // Add SaaS workspace only if pack is eligible and has findings
  if (result.saas_growth_readiness && saasFindings.length > 0) {
    workspaces.push(
      buildWorkspaceProjection(
        'saas', wn?.saas ?? 'SaaS Growth', 'preflight' as any, // reuses preflight type for workspace
        'saas_growth_readiness_pack',
        result.saas_growth_readiness.decision.decision_key,
        result.saas_growth_readiness.decision.decision_impact,
        saasFindings,
        coherenceByDecisionRef.get(makeRef('decision', result.saas_growth_readiness.decision.id)) || null,
        narrative,
        changeSummaryMap.get('saas_growth_readiness_pack') ?? null,
      ),
    );
  }

  // ── Behavioral workspaces (pixel-dependent) ──
  //
  // Phase B: emit ALL 7 cards always, even when there's no pixel data.
  // The UI uses `pixel_status` to render greyed-out placeholders that
  // direct the user to install the snippet, plus a yellow banner above
  // the Behavioral category. This intentionally goes against the
  // "core" workspaces' filter-when-empty behavior because the missing
  // pixel data is a configuration step the user can act on, not a
  // genuinely empty state.
  const behavioralWorkspaceConfigs: { key: keyof typeof result.behavioral_packs; id: string; name: string; type: import('./types').WorkspaceProjectionType; packKey: string }[] = [
    { key: 'first_impression', id: 'first_impression', name: 'First Impression Revenue', type: 'first_impression', packKey: 'first_impression_revenue_pack' },
    { key: 'action_value', id: 'action_value', name: 'Action Value Map', type: 'action_value', packKey: 'action_value_map_pack' },
    { key: 'acquisition_integrity', id: 'acquisition_integrity', name: 'Acquisition Integrity', type: 'acquisition_integrity', packKey: 'acquisition_integrity_pack' },
    { key: 'mobile_revenue', id: 'mobile_revenue', name: 'Mobile Revenue Exposure', type: 'mobile_revenue', packKey: 'mobile_revenue_exposure_pack' },
    { key: 'friction_tax', id: 'friction_tax', name: 'Friction Tax', type: 'friction_tax', packKey: 'friction_tax_pack' },
    { key: 'trust_gap', id: 'trust_gap', name: 'Trust Revenue Gap', type: 'trust_gap', packKey: 'trust_revenue_gap_pack' },
    { key: 'path_efficiency', id: 'path_efficiency', name: 'Path to Purchase Efficiency', type: 'path_efficiency', packKey: 'path_efficiency_pack' },
  ];

  const BEHAVIORAL_PACK_FILTER: Record<string, string> = {
    first_impression_revenue_pack: 'first_impression_revenue',
    action_value_map_pack: 'action_value_map',
    acquisition_integrity_pack: 'acquisition_integrity',
    mobile_revenue_exposure_pack: 'mobile_revenue_exposure',
    friction_tax_pack: 'friction_tax',
    trust_revenue_gap_pack: 'trust_revenue_gap',
    path_efficiency_pack: 'path_efficiency',
  };

  // Derive pixel status from the pack-eligibility result. computePackEligibility
  // is called with the real behavioralContext from recompute.ts (Phase A.2),
  // so this is authoritative. The required threshold is hard-coded at 20
  // sessions to match isBehavioralPackEligible — if that constant ever
  // moves we should expose it from the eligibility module.
  const REQUIRED_SESSIONS = 20;
  const behavioralElig = result.pack_eligibility.behavioral_workspaces;
  // Reverse-engineer the current session count from the eligibility's
  // confidence (which is min(1, sessionCount/100)). Capped at 100 by the
  // eligibility helper, so we can't recover the exact number above 100,
  // but we can show "100+" via the "active" state which doesn't need it.
  const inferredSessionCount = Math.round(behavioralElig.confidence * 100);
  let pixelStatus: import('./types').PixelStatus;
  let pixelProgress: { current: number; required: number } | null = null;
  if (behavioralElig.eligible) {
    pixelStatus = 'active';
  } else if (behavioralElig.confidence > 0) {
    // confidence > 0 means hasBehavioralEvidence === true → snippet is
    // installed but the session count is below threshold.
    pixelStatus = 'collecting';
    pixelProgress = { current: inferredSessionCount, required: REQUIRED_SESSIONS };
  } else {
    pixelStatus = 'unconfigured';
  }

  for (const bwc of behavioralWorkspaceConfigs) {
    const pack = result.behavioral_packs?.[bwc.key] ?? null;
    const packFilter = BEHAVIORAL_PACK_FILTER[bwc.packKey];
    const packFindings = pack ? findings.filter(f => f.pack === packFilter) : [];

    // Resolve display strings — use the engine's decision when available,
    // fall back to neutral placeholders so the card renders cleanly even
    // when the pack didn't run (no pixel data → no decision).
    const translatedName = wn?.[bwc.id] ?? bwc.name;
    const decisionKey = pack?.decision.decision_key ?? `${bwc.id}_no_data`;
    const decisionImpact = pack?.decision.decision_impact ?? 'observe';
    const coherence = pack
      ? coherenceByDecisionRef.get(makeRef('decision', pack.decision.id)) || null
      : null;

    workspaces.push(
      buildWorkspaceProjection(
        bwc.id,
        translatedName,
        bwc.type,
        bwc.packKey,
        decisionKey,
        decisionImpact,
        packFindings,
        coherence,
        narrative,
        changeSummaryMap.get(bwc.packKey) ?? null,
        'behavioral',
        pixelStatus,
        pixelProgress,
      ),
    );
  }

  return workspaces;
}

// ──────────────────────────────────────────────
// Phase 2 UX: Workspace-level change summaries
// ──────────────────────────────────────────────

/** Map decision_key values to their owning pack_key. */
const DECISION_KEY_TO_PACK: Record<string, string> = {
  // Scale Readiness
  unsafe_to_scale_traffic: 'scale_readiness_pack',
  fix_before_scale: 'scale_readiness_pack',
  ready_with_risks: 'scale_readiness_pack',
  safe_to_scale: 'scale_readiness_pack',
  // Revenue Integrity
  revenue_leakage_detected: 'revenue_integrity_pack',
  revenue_at_risk: 'revenue_integrity_pack',
  revenue_path_fragile: 'revenue_integrity_pack',
  revenue_integrity_stable: 'revenue_integrity_pack',
  // Chargeback Resilience
  high_chargeback_risk: 'chargeback_resilience_pack',
  moderate_chargeback_risk: 'chargeback_resilience_pack',
  low_chargeback_risk: 'chargeback_resilience_pack',
  chargeback_resilience_strong: 'chargeback_resilience_pack',
  // SaaS Growth Readiness
  is_saas_growth_ready_result: 'saas_growth_readiness_pack',
  // Channel Integrity
  is_channel_integrity_compromised_result: 'channel_integrity_pack',
  // Behavioral workspaces (pixel-dependent)
  first_session_conversion_critically_low: 'first_impression_revenue_pack',
  first_session_conversion_below_benchmark: 'first_impression_revenue_pack',
  first_session_conversion_improvable: 'first_impression_revenue_pack',
  first_session_conversion_healthy: 'first_impression_revenue_pack',
  actions_disconnected_from_revenue: 'action_value_map_pack',
  action_value_misaligned: 'action_value_map_pack',
  action_value_improvable: 'action_value_map_pack',
  action_value_aligned: 'action_value_map_pack',
  paid_traffic_wasted: 'acquisition_integrity_pack',
  paid_traffic_friction_high: 'acquisition_integrity_pack',
  paid_traffic_improvable: 'acquisition_integrity_pack',
  acquisition_integrity_strong: 'acquisition_integrity_pack',
  mobile_revenue_critically_exposed: 'mobile_revenue_exposure_pack',
  mobile_revenue_gap_significant: 'mobile_revenue_exposure_pack',
  mobile_revenue_gap_moderate: 'mobile_revenue_exposure_pack',
  mobile_experience_healthy: 'mobile_revenue_exposure_pack',
  friction_tax_critical: 'friction_tax_pack',
  friction_tax_elevated: 'friction_tax_pack',
  friction_tax_moderate: 'friction_tax_pack',
  friction_tax_low: 'friction_tax_pack',
  trust_gap_blocking_revenue: 'trust_revenue_gap_pack',
  trust_gap_significant: 'trust_revenue_gap_pack',
  trust_gap_moderate: 'trust_revenue_gap_pack',
  trust_confidence_strong: 'trust_revenue_gap_pack',
  path_critically_inefficient: 'path_efficiency_pack',
  path_inefficiency_high: 'path_efficiency_pack',
  path_improvable: 'path_efficiency_pack',
  path_efficiency_good: 'path_efficiency_pack',
  // Wave 3.3: Security posture
  security_posture_critical: 'money_moment_exposure_pack',
  security_posture_elevated: 'money_moment_exposure_pack',
  security_posture_weak: 'money_moment_exposure_pack',
  security_posture_adequate: 'money_moment_exposure_pack',
};

function resolvePackKeyForDecision(decisionKey: string): string | null {
  if (DECISION_KEY_TO_PACK[decisionKey]) return DECISION_KEY_TO_PACK[decisionKey];
  // Fallback: try suffix-based heuristic for dynamic question_key_result patterns
  if (decisionKey.includes('scale') || decisionKey.includes('preflight')) return 'scale_readiness_pack';
  if (decisionKey.includes('revenue')) return 'revenue_integrity_pack';
  if (decisionKey.includes('chargeback')) return 'chargeback_resilience_pack';
  if (decisionKey.includes('saas') || decisionKey.includes('growth')) return 'saas_growth_readiness_pack';
  if (decisionKey.includes('channel')) return 'channel_integrity_pack';
  if (decisionKey.includes('security_posture')) return 'money_moment_exposure_pack';
  return null;
}

function buildWorkspaceChangeSummaries(
  changeReport: ChangeReportProjection | null,
): Map<string, WorkspaceProjection['change_summary']> {
  const map = new Map<string, NonNullable<WorkspaceProjection['change_summary']>>();
  if (!changeReport) return map;

  const allChanges = [
    ...changeReport.regressions,
    ...changeReport.improvements,
    ...changeReport.new_issues,
    ...changeReport.resolved,
  ];

  // Accumulate counts per pack_key
  const accum = new Map<string, { regressions: number; improvements: number; resolved: number }>();

  for (const change of allChanges) {
    const packKey = resolvePackKeyForDecision(change.decision_key);
    if (!packKey) continue;

    if (!accum.has(packKey)) {
      accum.set(packKey, { regressions: 0, improvements: 0, resolved: 0 });
    }
    const counts = accum.get(packKey)!;

    if (change.change_class === 'regression') counts.regressions++;
    else if (change.change_class === 'improvement') counts.improvements++;
    else if (change.change_class === 'resolved') counts.resolved++;
    // new_issue is a special case — count as regression for trend purposes
    else if (change.change_class === 'new_issue') counts.regressions++;
  }

  for (const [packKey, counts] of accum) {
    let trend: 'improving' | 'degrading' | 'stable' | 'mixed';
    if (counts.regressions > 0 && counts.improvements === 0 && counts.resolved === 0) {
      trend = 'degrading';
    } else if (counts.regressions === 0 && (counts.improvements > 0 || counts.resolved > 0)) {
      trend = 'improving';
    } else if (counts.regressions > 0 && (counts.improvements > 0 || counts.resolved > 0)) {
      trend = 'mixed';
    } else {
      trend = 'stable';
    }

    map.set(packKey, {
      trend,
      regression_count: counts.regressions,
      improvement_count: counts.improvements,
      resolved_count: counts.resolved,
    });
  }

  return map;
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

// ── Polarity ──────────────────────────────────

function computePolarity(inf: Inference, vc: import('../impact').QuantifiedValueCase): 'negative' | 'positive' | 'neutral' {
  // If the inference indicates a problem, it's negative
  if (inf.conclusion_value === 'false' || inf.conclusion_value === 'none') return 'neutral';
  if (inf.severity_hint === null && inf.confidence < 40) return 'neutral';
  return 'negative'; // all value-case findings are issues by default
}

// ── Positive Findings ─────────────────────────

export const POSITIVE_CHECKS: { key: string; title: string; description: string; pack: string; check: (infs: Inference[], result: MultiPackResult) => boolean }[] = [
  // ── Commerce positive findings ──────────────────
  { key: 'strong_cta_clarity', title: 'Conversion intent is clear and unambiguous', pack: 'scale_readiness',
    description: 'The primary conversion path is identifiable and free of competing calls-to-action. Visitors can find how to purchase.',
    check: (infs) => !infs.some(i => i.inference_key === 'unclear_conversion_intent') },
  { key: 'trust_continuity_good', title: 'Trust continuity maintained through checkout', pack: 'revenue_integrity',
    description: 'The conversion flow stays on-domain with no trust boundary breaks. Users are not redirected to unknown domains during purchase.',
    check: (infs) => !infs.some(i => i.inference_key === 'trust_boundary_crossed' || i.inference_key === 'trust_break_in_checkout') },
  { key: 'policy_coverage_complete', title: 'Consumer protection policies in place', pack: 'scale_readiness',
    description: 'Privacy, terms, and refund policies are present and accessible. This supports buyer confidence and regulatory compliance.',
    check: (infs) => !infs.some(i => i.inference_key === 'policy_gap') },
  { key: 'low_friction_checkout', title: 'Revenue path free of structural friction', pack: 'revenue_integrity',
    description: 'No broken forms, excessive redirects, or slow-loading pages detected on the conversion path. The path from intent to purchase is clean.',
    check: (infs) => !infs.some(i => i.inference_key === 'friction_on_critical_path') },
  { key: 'measurement_covered', title: 'Measurement infrastructure covers commercial paths', pack: 'scale_readiness',
    description: 'Analytics tools are present at sufficient depth to support attribution, optimization, and conversion measurement.',
    check: (infs) => !infs.some(i => i.inference_key === 'measurement_coverage' && i.severity_hint === 'high') },
  { key: 'support_reachable', title: 'Support channels visible and accessible', pack: 'chargeback_resilience',
    description: 'Contact methods are available and discoverable. Customers can resolve issues through support rather than filing disputes.',
    check: (infs) => !infs.some(i => i.inference_key === 'support_unreachable') },
  // ── SaaS positive findings (Phase 30) ───────────
  { key: 'smooth_activation', title: 'Activation flow is clear and low-friction', pack: 'saas_growth_readiness',
    description: 'The onboarding path has clear next steps, progress indicators, and manageable complexity. New users can reach value quickly.',
    check: (infs) => !infs.some(i => i.inference_key === 'activation_blocked' || i.inference_key === 'activation_friction_high' || i.inference_key === 'unclear_next_step') },
  { key: 'navigation_clean', title: 'App navigation is clean and navigable', pack: 'saas_growth_readiness',
    description: 'Navigation structure is manageable in depth and breadth. Users can find core features without being overwhelmed.',
    check: (infs) => !infs.some(i => i.inference_key === 'navigation_overcomplex' || i.inference_key === 'feature_discovery_poor') },
  { key: 'upgrade_path_visible', title: 'Upgrade path is visible with clear value context', pack: 'saas_growth_readiness',
    description: 'Upgrade surfaces are present, prominent, and include value propositions. Users can discover and evaluate paid plans.',
    check: (infs) => !infs.some(i => i.inference_key === 'upgrade_invisible' || i.inference_key === 'upgrade_timing_wrong' || i.inference_key === 'no_expansion_path') },
  { key: 'empty_states_guided', title: 'Empty states provide clear guidance', pack: 'saas_growth_readiness',
    description: 'Empty screens include direction, sample data options, or next-step guidance. New users are not left staring at blank interfaces.',
    check: (infs) => !infs.some(i => i.inference_key === 'empty_state_without_guidance') },
];

function addPositiveFindings(findings: FindingProjection[], inferences: Inference[], result: MultiPackResult, translations?: EngineTranslations): void {
  // Only add positive findings if we have enough evidence to be meaningful
  if (inferences.length < 3) return;

  for (const check of POSITIVE_CHECKS) {
    if (check.check(inferences, result)) {
      // Check pack eligibility
      const packElig = result.pack_eligibility;
      let eligible = true;
      if (check.pack === 'revenue_integrity') eligible = packElig.revenue_integrity.eligible;
      if (check.pack === 'chargeback_resilience') eligible = packElig.chargeback_resilience.eligible;
      if (check.pack === 'saas_growth_readiness') eligible = packElig.saas_pack.eligible;

      if (!eligible) continue;

      const pcTranslation = translations?.positive_checks?.[check.key];
      const title = pcTranslation?.title ?? check.title;
      const description = pcTranslation?.description ?? check.description;

      findings.push({
        id: `positive_${check.key}`,
        title,
        root_cause: null,
        severity: 'none',
        confidence: 60,
        confidence_tier: 'medium',
        impact: { monthly_range: { min: 0, max: 0 }, midpoint: 0, impact_type: 'none', percentage_delta: null, currency: 'USD' },
        pack: check.pack,
        surface: '/',
        freshness: 'fresh',
        inference_key: check.key,
        reasoning: description,
        cause: title,
        effect: description,
        basis_type: 'heuristic',
        eligibility: { eligible: true, confidence: 1 },
        polarity: 'positive',
        truth_context: null,
        suppression_context: null,
        verification_maturity: null,
        verification_method: 'unknown',
        change_class: null,
        evidence_quality: null,
      });
    }
  }
}

function buildWorkspaceProjection(
  id: string,
  name: string,
  type: WorkspaceProjectionType,
  packKey: string,
  decisionKey: string,
  decisionImpact: string,
  findings: FindingProjection[],
  coherence: WorkspaceCoherence | null = null,
  confidenceNarrative: ConfidenceNarrative | null = null,
  changeSummary: WorkspaceProjection['change_summary'] = null,
  // Phase B: category + pixel_status drive the UI grouping (Core / Behavioral)
  // and the greyed-out vs active rendering of behavioral cards.
  category: import('./types').WorkspaceCategory = 'core',
  pixelStatus: import('./types').PixelStatus | null = null,
  pixelProgress: { current: number; required: number } | null = null,
): WorkspaceProjection {
  let totalMin = 0;
  let totalMax = 0;
  let totalConf = 0;

  for (const f of findings) {
    totalMin += f.impact.monthly_range.min;
    totalMax += f.impact.monthly_range.max;
    totalConf += f.confidence;
  }

  const topIssues = findings
    .slice(0, 3)
    .map(f => f.title);

  return {
    id,
    name,
    type,
    pack_key: packKey,
    decision_key: decisionKey,
    decision_impact: decisionImpact,
    category,
    pixel_status: pixelStatus,
    pixel_progress: pixelProgress,
    summary: {
      total_loss_range: { min: Math.round(totalMin), max: Math.round(totalMax) },
      total_loss_mid: Math.round((totalMin + totalMax) / 2),
      top_issues: topIssues,
      confidence: findings.length > 0 ? Math.round(totalConf / findings.length) : 0,
      issue_count: findings.length,
      currency: 'USD',
    },
    findings,
    coherence,
    confidence_narrative: confidenceNarrative,
    change_summary: changeSummary,
  };
}

/**
 * Build coherence annotations per decision from the conflict report.
 */
function buildCoherenceMap(
  conflictReport: ConflictReport | undefined,
  result: MultiPackResult,
): Map<string, WorkspaceCoherence> {
  const map = new Map<string, WorkspaceCoherence>();
  if (!conflictReport) return map;

  const overallScore = conflictReport.resolved_decisions?.coherence_score ?? 100;

  for (const resolved of conflictReport.resolved_decisions?.decisions || []) {
    const annotations: string[] = [];

    // Find conflicts affecting this decision
    for (const conflict of conflictReport.conflicts) {
      if (conflict.decision_a_ref === resolved.decision_ref ||
          conflict.decision_b_ref === resolved.decision_ref) {
        if (conflict.resolution.user_facing_note) {
          annotations.push(conflict.resolution.user_facing_note);
        } else {
          annotations.push(conflict.description);
        }
      }
    }

    map.set(resolved.decision_ref, {
      coherence_score: overallScore,
      has_conflicts: resolved.conflict_refs.length > 0,
      conflict_annotations: annotations,
      suppressed: resolved.suppressed,
    });
  }

  return map;
}

interface RootCauseImpactEntry {
  range: { min: number; max: number };
  midpoint: number;
}

function computeRootCauseImpact(
  rootCauses: RootCause[],
  valueCases: QuantifiedValueCase[],
  inferences: Inference[],
): Map<string, RootCauseImpactEntry> {
  const result = new Map<string, RootCauseImpactEntry>();

  // Index value cases by inference_key
  const vcByKey = new Map<string, QuantifiedValueCase>();
  for (const vc of valueCases) {
    vcByKey.set(vc.inference_key, vc);
  }

  // Index inferences by id ref
  const infById = new Map<string, Inference>();
  for (const inf of inferences) {
    infById.set(makeRef('inference', inf.id), inf);
  }

  for (const rc of rootCauses) {
    let totalMin = 0;
    let totalMax = 0;

    for (const infRef of rc.contributing_inferences) {
      const inf = infById.get(infRef);
      if (!inf) continue;
      const vc = vcByKey.get(inf.inference_key);
      if (!vc) continue;
      totalMin += vc.estimated_impact.range.min;
      totalMax += vc.estimated_impact.range.max;
    }

    if (totalMin > 0 || totalMax > 0) {
      result.set(rc.root_cause_key, {
        range: { min: Math.round(totalMin), max: Math.round(totalMax) },
        midpoint: Math.round((totalMin + totalMax) / 2),
      });
    }
  }

  return result;
}

function mapSeverityFromInference(inf: Inference): string {
  const hint = inf.severity_hint;
  if (hint === 'high' || inf.conclusion_value === 'high' || inf.conclusion_value === 'weak') return 'high';
  if (hint === 'medium' || inf.conclusion_value === 'medium' || inf.conclusion_value === 'fragile') return 'medium';
  return 'low';
}

// ──────────────────────────────────────────────
// Phase 27: Truth context for findings
// ──────────────────────────────────────────────

function buildFindingTruthContext(
  inf: Inference,
  result: MultiPackResult,
): FindingTruthContext | null {
  if (!result.truth_consistency) return null;

  const consistencySummary = result.truth_consistency.consistency_summary;
  if (consistencySummary.harmonized_signals === 0) return null;

  // Check if any of the inference's backing signals had contradictions
  const backingSignalKeys = new Set<string>();
  for (const sigRef of inf.signal_refs) {
    // Extract signal key from ref if possible
    const sig = result.signals.find(s => makeRef('signal', s.id) === sigRef || s.id === sigRef);
    if (sig) backingSignalKeys.add(sig.signal_key);
  }

  let contradictionCount = 0;
  let totalDelta = 0;

  for (const annotated of result.truth_consistency.signals) {
    if (backingSignalKeys.has(annotated.signal_key) && annotated.truth_metadata?.harmonized) {
      contradictionCount += annotated.truth_metadata.contradiction_count;
      totalDelta += annotated.truth_metadata.truth_confidence_delta;
    }
  }

  if (contradictionCount === 0 && totalDelta === 0) return null;

  return {
    has_contradictions: contradictionCount > 0,
    contradiction_count: contradictionCount,
    truth_confidence_delta: totalDelta,
  };
}

// ──────────────────────────────────────────────
// Phase 27: Suppression context for findings
// ──────────────────────────────────────────────

function buildFindingSuppressionContext(
  inf: Inference,
  result: MultiPackResult,
): FindingSuppressionContext | null {
  if (!result.suppression_governance) return null;

  // Check if this inference's key matches any suppression explanation
  const matchingExplanation = result.suppression_governance.explanations.find(e =>
    inf.inference_key.includes(e.match_key) || e.match_key.includes(inf.inference_key),
  );

  if (!matchingExplanation) return null;

  return {
    is_suppressed: matchingExplanation.visibility !== 'visible',
    visibility: matchingExplanation.visibility,
    confidence_reduction: matchingExplanation.confidence_reduction,
    explanation: matchingExplanation.explanation,
  };
}

// ──────────────────────────────────────────────
// Phase 27: Confidence narrative — structural vs economic certainty
// ──────────────────────────────────────────────

function buildConfidenceNarrative(result: MultiPackResult, translations?: EngineTranslations): ConfidenceNarrative | null {
  // Structural confidence: based on evidence quality and truth consistency
  const avgEvidenceQuality = result.evidence_quality.length > 0
    ? result.evidence_quality.reduce((s, eq) => s + eq.composite_score, 0) / result.evidence_quality.length
    : 50;

  const structuralConf: 'high' | 'medium' | 'low' =
    avgEvidenceQuality >= 70 ? 'high' :
    avgEvidenceQuality >= 40 ? 'medium' : 'low';

  // Economic confidence: based on profile freshness and input quality
  const uncertaintyFactors: string[] = [];
  let economicConf: 'high' | 'medium' | 'low' = 'high';

  const cn = translations?.confidence_narrative;

  // Check profile freshness
  if (result.profile_freshness) {
    const pf = result.profile_freshness;
    if (!pf.is_fresh) {
      economicConf = pf.staleness_days > 90 ? 'low' : 'medium';
      const msg = cn?.profile_stale
        ? cn.profile_stale.replace('{days}', String(pf.staleness_days))
        : `Business profile is ${pf.staleness_days} days old`;
      uncertaintyFactors.push(msg);
    }
    if (pf.drift_detected) {
      if (economicConf === 'high') economicConf = 'medium';
      const msg = cn?.drift_detected
        ? cn.drift_detected.replace('{count}', String(pf.drift_signals.length))
        : `${pf.drift_signals.length} profile drift signal(s) detected`;
      uncertaintyFactors.push(msg);
    }
  }

  // Check if using fallback inputs
  const heuristicCount = result.impact.value_cases.filter(vc => vc.basis_type === 'heuristic').length;
  if (heuristicCount > 0) {
    if (economicConf === 'high') economicConf = 'medium';
    const msg = cn?.heuristic_basis
      ? cn.heuristic_basis.replace('{count}', String(heuristicCount))
      : `${heuristicCount} finding(s) using estimated business metrics`;
    uncertaintyFactors.push(msg);
  }

  // Check confidence audit
  if (result.confidence_audit && !result.confidence_audit.is_healthy) {
    if (economicConf === 'high') economicConf = 'medium';
    uncertaintyFactors.push(cn?.confidence_unhealthy ?? 'Confidence pipeline has integrity issues');
  }

  // Build narrative
  let narrative: string;
  if (structuralConf === 'high' && economicConf === 'high') {
    narrative = cn?.high_high ?? 'Analysis is structurally sound and economic estimates are well-calibrated.';
  } else if (structuralConf === 'high' && economicConf !== 'high') {
    narrative = cn?.high_not_high ?? ('Structural analysis is reliable, but economic estimates carry uncertainty. ' +
      'The issues identified are real; the dollar amounts should be treated as directional.');
  } else if (structuralConf !== 'high' && economicConf === 'high') {
    narrative = cn?.not_high_high ?? ('Economic data is strong but structural evidence could be stronger. ' +
      'Consider verification to strengthen confidence in the identified issues.');
  } else {
    narrative = cn?.low_low ?? ('Both structural evidence and economic data carry uncertainty. ' +
      'Findings are directional — verify before taking action on specific dollar estimates.');
  }

  // Only return narrative if there's something meaningful to say
  if (structuralConf === 'high' && economicConf === 'high' && uncertaintyFactors.length === 0) {
    return null; // no narrative needed — everything is high confidence
  }

  return {
    structural_confidence: structuralConf,
    economic_confidence: economicConf,
    narrative,
    uncertainty_factors: uncertaintyFactors,
  };
}

// ──────────────────────────────────────────────
// Phase 1C: Change report projection
// ──────────────────────────────────────────────

function mapDecisionChange(dc: DecisionChange): DecisionChangeProjection {
  return {
    decision_key: dc.decision_key,
    title: dc.summary,
    change_class: dc.change_class,
    change_severity: dc.severity,
    risk_score_delta: dc.risk_score_delta,
    previous_severity: dc.severity_change?.from ?? null,
    current_severity: dc.severity_change?.to ?? null,
    previous_impact: dc.impact_change?.from ?? null,
    current_impact: dc.impact_change?.to ?? null,
    contributing_factors: dc.contributing_factors,
  };
}

export function projectChangeReport(result: MultiPackResult): ChangeReportProjection | null {
  if (!result.change_report) return null;

  const report = result.change_report;
  const summary = report.summary;

  const regressions = report.regressions.map(mapDecisionChange);
  const improvements = report.improvements.map(mapDecisionChange);
  const newIssues = report.new_issues.map(mapDecisionChange);
  const resolved = report.resolved_issues.map(mapDecisionChange);

  return {
    headline: summary.headline,
    overall_trend: summary.overall_trend,
    regression_count: summary.regression_count,
    improvement_count: summary.improvement_count,
    new_issue_count: summary.new_issue_count,
    resolved_count: summary.resolved_count,
    stable_risk_count: summary.stable_risk_count,
    regressions,
    improvements,
    new_issues: newIssues,
    resolved,
    previous_cycle_ref: report.previous_cycle_ref,
    current_cycle_ref: report.current_cycle_ref,
  };
}

// ──────────────────────────────────────────────
// Phase 27: System health indicators
// ──────────────────────────────────────────────

function buildSystemHealth(result: MultiPackResult): SystemHealthIndicators {
  return {
    confidence_healthy: result.confidence_audit?.is_healthy ?? true,
    behavior_valid: result.behavioral_validation?.all_passed ?? true,
    truth_consistent: result.truth_consistency?.fully_consistent ?? true,
    blind_spot_count: result.suppression_governance?.blind_spots.length ?? 0,
    change_trend: result.change_report?.summary.overall_trend ?? null,
  };
}

// ──────────────────────────────────────────────
// Phase 0 UX: Verification context for findings
// ──────────────────────────────────────────────

function buildFindingVerificationContext(
  inf: Inference,
  result: MultiPackResult,
): { maturity: FindingProjection['verification_maturity']; method: FindingProjection['verification_method'] } {
  // Determine verification method from evidence source kinds
  const backingEvidenceRefs = new Set(inf.evidence_refs);
  let hasBrowser = false;
  let hasStatic = false;

  for (const ev of result.signals) {
    const ref = makeRef('signal', ev.id);
    if (backingEvidenceRefs.has(ref) || backingEvidenceRefs.has(ev.id)) {
      // Check signal's backing evidence source kinds
      for (const evRef of ev.evidence_refs) {
        const evidenceId = evRef.replace('evidence:', '');
        // We don't have direct access to evidence objects here, but we can
        // infer from signal keys or the quality adjustments
        if (ev.signal_key.includes('browser_') || ev.signal_key.includes('authenticated_')) {
          hasBrowser = true;
        } else {
          hasStatic = true;
        }
      }
    }
  }

  // Also check from evidence quality data (source reliability correlates with method)
  const qualityData = result.evidence_quality;
  if (qualityData.length > 0) {
    for (const eq of qualityData) {
      if (eq.source_reliability >= 75) hasBrowser = true;
      if (eq.source_reliability < 60) hasStatic = true;
    }
  }

  let method: FindingProjection['verification_method'] = 'unknown';
  if (hasBrowser && hasStatic) method = 'mixed';
  else if (hasBrowser) method = 'browser_verified';
  else if (hasStatic) method = 'static_only';

  // Verification maturity: not yet tracked at finding level in the lifecycle module,
  // so default to null. Future phases will integrate VerificationState per finding.
  return { maturity: null, method };
}

// ──────────────────────────────────────────────
// Phase 0 UX: Change class for findings
// ──────────────────────────────────────────────

function buildFindingChangeClass(
  inferenceKey: string,
  result: MultiPackResult,
): FindingProjection['change_class'] {
  if (!result.change_report) return null;

  // Match by decision_key against change report entries
  const report = result.change_report;

  // Check regressions
  for (const dc of report.regressions) {
    if (dc.decision_key.includes(inferenceKey) || inferenceKey.includes(dc.decision_key)) {
      return 'regression';
    }
  }

  // Check improvements
  for (const dc of report.improvements) {
    if (dc.decision_key.includes(inferenceKey) || inferenceKey.includes(dc.decision_key)) {
      return 'improvement';
    }
  }

  // Check new issues
  for (const dc of report.new_issues) {
    if (dc.decision_key.includes(inferenceKey) || inferenceKey.includes(dc.decision_key)) {
      return 'new_issue';
    }
  }

  // Check resolved issues
  for (const dc of report.resolved_issues) {
    if (dc.decision_key.includes(inferenceKey) || inferenceKey.includes(dc.decision_key)) {
      return 'resolved';
    }
  }

  // Check stable risks
  for (const dc of report.stable_risks) {
    if (dc.decision_key.includes(inferenceKey) || inferenceKey.includes(dc.decision_key)) {
      return 'stable_risk';
    }
  }

  return null;
}

// ──────────────────────────────────────────────
// Phase 0 UX: Evidence quality for findings
// ──────────────────────────────────────────────

function buildFindingEvidenceQuality(
  inf: Inference,
  result: MultiPackResult,
): FindingProjection['evidence_quality'] {
  if (result.evidence_quality.length === 0) return null;

  // Collect quality scores for evidence backing this inference
  const backingEvidenceRefs = new Set(inf.evidence_refs);
  const matchingQuality = result.evidence_quality.filter(eq =>
    backingEvidenceRefs.has(eq.evidence_ref) ||
    backingEvidenceRefs.has(eq.evidence_ref.replace('evidence:', '')),
  );

  // If no direct matches, aggregate all evidence quality as a fallback
  const pool = matchingQuality.length > 0 ? matchingQuality : result.evidence_quality;

  if (pool.length === 0) return null;

  const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  return {
    source_reliability: avg(pool.map(eq => eq.source_reliability)),
    completeness: avg(pool.map(eq => eq.completeness)),
    recency: avg(pool.map(eq => eq.recency)),
    corroboration: avg(pool.map(eq => eq.corroboration)),
    composite: avg(pool.map(eq => eq.composite_score)),
  };
}
