import { Inference, IdGenerator, makeRef, Ref } from '../domain';
import { RootCause, RootCauseCategory, RootCauseSeverity, ImpactDimension } from './types';
import type { EngineTranslations } from '../projections/types';

// ──────────────────────────────────────────────
// Root Cause Grouping Engine
//
// Inferences that describe the same structural problem
// collapse into a single root cause. Each inference
// belongs to at most one root cause.
// ──────────────────────────────────────────────

// Mapping: inference_key → which root cause group it belongs to
export const INFERENCE_TO_ROOT_CAUSE: Record<string, {
  root_cause_key: string;
  category: RootCauseCategory;
  impact_types: ImpactDimension[];
}> = {
  // Trust failures — shared across scale + revenue
  trust_boundary_crossed:   { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['scale_risk', 'trust_erosion'] },
  checkout_integrity:       { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['scale_risk', 'trust_erosion'] },
  trust_break_in_checkout:  { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['revenue_loss', 'trust_erosion'] },

  // Conversion path fragmentation — shared across scale + revenue
  revenue_path_fragile:          { root_cause_key: 'fragmented_conversion_path', category: 'conversion_fragmentation', impact_types: ['scale_risk', 'revenue_loss'] },
  conversion_flow_fragmented:    { root_cause_key: 'fragmented_conversion_path', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },
  friction_on_critical_path:     { root_cause_key: 'friction_barrier_on_path', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },

  // Measurement gaps — shared across scale + revenue
  measurement_coverage:    { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['scale_risk', 'measurement_blind'] },
  measurement_blindspot:   { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['revenue_loss', 'measurement_blind'] },

  // Policy deficiency — primarily scale, also revenue
  policy_gap:              { root_cause_key: 'policy_deficiency', category: 'policy_deficiency', impact_types: ['scale_risk', 'trust_erosion'] },

  // Revenue-specific leakage
  revenue_leakage:         { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },

  // Conversion clarity — revenue-specific
  unclear_conversion_intent: { root_cause_key: 'weak_conversion_signal', category: 'conversion_clarity', impact_types: ['revenue_loss'] },

  // Chargeback resilience — policy, support, expectation
  refund_policy_gap:         { root_cause_key: 'policy_deficiency', category: 'policy_deficiency', impact_types: ['trust_erosion', 'chargeback_risk'] },
  support_unreachable:       { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['chargeback_risk', 'trust_erosion'] },
  expectation_misalignment:  { root_cause_key: 'expectation_failure', category: 'expectation_failure', impact_types: ['chargeback_risk'] },
  dispute_risk_elevated:     { root_cause_key: 'elevated_dispute_risk', category: 'dispute_exposure', impact_types: ['chargeback_risk', 'trust_erosion'] },

  // Commerce context — informational, not a problem
  commerce_context:        { root_cause_key: '_skip_', category: 'conversion_clarity', impact_types: [] },

  // SaaS Growth Readiness — root cause mappings
  activation_blocked:          { root_cause_key: 'saas_activation_barrier', category: 'saas_activation_failure', impact_types: ['revenue_loss'] },
  activation_friction_high:    { root_cause_key: 'saas_activation_barrier', category: 'saas_activation_failure', impact_types: ['revenue_loss'] },
  unclear_next_step:           { root_cause_key: 'saas_activation_barrier', category: 'saas_activation_failure', impact_types: ['revenue_loss'] },
  empty_state_without_guidance:{ root_cause_key: 'saas_product_experience_gap', category: 'saas_product_friction', impact_types: ['revenue_loss'] },
  navigation_overcomplex:      { root_cause_key: 'saas_product_experience_gap', category: 'saas_product_friction', impact_types: ['revenue_loss'] },
  feature_discovery_poor:      { root_cause_key: 'saas_product_experience_gap', category: 'saas_product_friction', impact_types: ['revenue_loss'] },
  upgrade_invisible:           { root_cause_key: 'saas_expansion_blocked', category: 'saas_product_friction', impact_types: ['revenue_loss'] },
  upgrade_timing_wrong:        { root_cause_key: 'saas_expansion_blocked', category: 'saas_product_friction', impact_types: ['revenue_loss'] },
  no_expansion_path:           { root_cause_key: 'saas_expansion_blocked', category: 'saas_product_friction', impact_types: ['revenue_loss'] },
  landing_app_mismatch:        { root_cause_key: 'saas_activation_barrier', category: 'saas_activation_failure', impact_types: ['revenue_loss', 'trust_erosion'] },

  // Phase 30: New inference-to-root-cause mappings
  critical_path_broken:          { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'scale_risk'] },
  form_data_leaves_domain:       { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  checkout_provider_fragmented:  { root_cause_key: 'fragmented_conversion_path', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },

  // Phase 30B: Extended root cause mappings
  redirect_chain_erodes_checkout_trust: { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  commercial_journey_language_break:    { root_cause_key: 'friction_barrier_on_path', category: 'friction_barrier', impact_types: ['revenue_loss'] },
  commercial_pages_disconnected:        { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },
  untrusted_embeds_near_purchase:       { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion'] },
  platform_checkout_risk_unaddressed:   { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  post_purchase_confirmation_absent:    { root_cause_key: 'expectation_failure', category: 'expectation_failure', impact_types: ['chargeback_risk'] },
  high_intent_surfaces_blind:           { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['revenue_loss', 'measurement_blind'] },
  revenue_path_regressed:               { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'scale_risk'] },

  // Phase 2: Deepened collection findings
  refund_terms_too_thin:                { root_cause_key: 'policy_deficiency', category: 'policy_deficiency', impact_types: ['chargeback_risk', 'trust_erosion'] },
  support_hidden_at_purchase:           { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['chargeback_risk', 'revenue_loss'] },
  trust_surface_too_thin:               { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  tracking_stack_gaps:                  { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['measurement_blind', 'revenue_loss'] },
  consent_undermining_measurement:      { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['measurement_blind'] },

  // Phase 2B: Mobile & runtime
  mobile_commercial_path_blocked:       { root_cause_key: 'friction_barrier_on_path', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },
  mobile_trust_weaker_than_desktop:     { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  runtime_errors_interrupt_purchase:    { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },
  runtime_measurement_broken:           { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['measurement_blind', 'revenue_loss'] },
  secondary_flows_bypass_trust_path:    { root_cause_key: 'fragmented_conversion_path', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'trust_erosion'] },

  // Phase 2C: Split policy + post-purchase
  refund_process_unclear:                { root_cause_key: 'policy_deficiency', category: 'policy_deficiency', impact_types: ['chargeback_risk'] },
  post_purchase_proof_too_weak:          { root_cause_key: 'expectation_failure', category: 'expectation_failure', impact_types: ['chargeback_risk'] },

  // Phase 2C: Composite findings
  support_reassurance_too_late:         { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['chargeback_risk', 'revenue_loss'] },
  reassurance_routes_disconnected:      { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['trust_erosion', 'revenue_loss'] },
  alternate_flows_unmeasured:           { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['measurement_blind', 'revenue_loss'] },
  runtime_breaking_reassurance:         { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['trust_erosion', 'revenue_loss'] },
  checkout_provider_path_weak:          { root_cause_key: 'trust_failure_at_checkout', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  trust_and_measurement_both_absent:    { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'trust_erosion', 'measurement_blind'] },

  // Phase 3A: Channel integrity / abuse exposure
  payment_surface_compromised:          { root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['revenue_loss', 'trust_erosion'] },
  channel_traffic_divertible:           { root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss'] },
  commerce_operations_exposed:          { root_cause_key: 'commerce_continuity_exposure', category: 'commerce_continuity', impact_types: ['revenue_loss', 'scale_risk'] },
  traffic_landing_low_trust_posture:    { root_cause_key: 'weak_channel_posture', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss'] },
  channel_compromise_visible:           { root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss'] },
  commercial_path_abuse_friendly:       { root_cause_key: 'abuse_friendly_channel', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  economic_exploitation_active:         { root_cause_key: 'abuse_friendly_channel', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  checkout_trust_brittle_infrastructure:{ root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss', 'scale_risk'] },

  // Phase 3B: Deep discovery findings
  promotion_logic_exposed:              { root_cause_key: 'deep_commerce_abuse_surface', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  cart_variant_weak_control:            { root_cause_key: 'deep_commerce_abuse_surface', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  hidden_discount_refund_route:         { root_cause_key: 'deep_commerce_abuse_surface', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  guessable_business_endpoint:          { root_cause_key: 'weak_commerce_governance', category: 'abuse_exposure', impact_types: ['revenue_loss', 'scale_risk'] },
  alternate_pricing_safeguard_bypass:   { root_cause_key: 'weak_commerce_governance', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  js_discovered_purchase_variant:       { root_cause_key: 'uncontrolled_commerce_variant', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'trust_erosion'] },
  dynamic_route_weak_control:           { root_cause_key: 'weak_commerce_governance', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  hidden_support_burden:                { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['chargeback_risk'] },
  alternate_variant_control_breakdown:  { root_cause_key: 'uncontrolled_commerce_variant', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'trust_erosion', 'measurement_blind'] },
  deep_commerce_exploitation_risk:      { root_cause_key: 'deep_commerce_abuse_surface', category: 'abuse_exposure', impact_types: ['revenue_loss', 'scale_risk'] },

  // Phase 2D: Network analysis findings
  checkout_api_latency_degraded:        { root_cause_key: 'runtime_commerce_fragility', category: 'friction_barrier', impact_types: ['revenue_loss'] },
  commercial_pages_slow:                { root_cause_key: 'runtime_commerce_fragility', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },
  paid_landing_overloaded:              { root_cause_key: 'runtime_commerce_fragility', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },
  third_party_weight_delays_trust:      { root_cause_key: 'third_party_dependency_risk', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  checkout_brittle_third_party:         { root_cause_key: 'third_party_dependency_risk', category: 'channel_integrity', impact_types: ['revenue_loss'] },
  purchase_blocked_failing_requests:    { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },
  measurement_breaks_revenue_path:      { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['measurement_blind', 'revenue_loss'] },
  purchase_before_deps_ready:           { root_cause_key: 'runtime_commerce_fragility', category: 'friction_barrier', impact_types: ['revenue_loss'] },
  trust_assets_late_load:               { root_cause_key: 'third_party_dependency_risk', category: 'trust_failure', impact_types: ['trust_erosion'] },
  mobile_heavy_runtime_chain:           { root_cause_key: 'runtime_commerce_fragility', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },
  mobile_trust_payment_deps_failing:    { root_cause_key: 'third_party_dependency_risk', category: 'trust_failure', impact_types: ['revenue_loss', 'trust_erosion'] },
  trust_surfaces_unstable_deps:         { root_cause_key: 'third_party_dependency_risk', category: 'channel_integrity', impact_types: ['trust_erosion'] },

  // Phase 3E: Discoverability findings
  commercial_pages_weak_search_representation: { root_cause_key: 'weak_discoverability_signals', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  social_previews_fail_commercial_value:       { root_cause_key: 'weak_discoverability_signals', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  brand_inconsistent_across_surfaces:          { root_cause_key: 'inconsistent_surface_representation', category: 'discoverability_gap', impact_types: ['trust_erosion', 'revenue_loss'] },
  commercial_pages_unlikely_indexed:           { root_cause_key: 'commercial_pages_not_exposed', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  weak_semantic_intent_signals:                { root_cause_key: 'weak_semantic_intent_signaling', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  previews_disconnected_from_conversion:       { root_cause_key: 'inconsistent_surface_representation', category: 'discoverability_gap', impact_types: ['revenue_loss', 'trust_erosion'] },
  commercial_pages_not_exposed_for_discovery:  { root_cause_key: 'commercial_pages_not_exposed', category: 'discoverability_gap', impact_types: ['revenue_loss'] },

  // Phase 3E: Brand integrity findings
  lookalike_domain_competing_for_traffic:      { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss'] },
  external_sites_mimicking_brand:              { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss', 'trust_erosion'] },
  brand_traffic_exposed_to_deceptive_surfaces: { root_cause_key: 'traffic_interception_risk', category: 'brand_impersonation', impact_types: ['revenue_loss'] },
  suspicious_domains_capturing_purchase_intent:{ root_cause_key: 'traffic_interception_risk', category: 'brand_impersonation', impact_types: ['revenue_loss'] },
  customers_exposed_to_phishing_surfaces:      { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss', 'trust_erosion'] },
  brand_presence_diluted_across_variants:      { root_cause_key: 'brand_surface_fragmentation', category: 'brand_impersonation', impact_types: ['trust_erosion', 'revenue_loss'] },

  // Phase 4B: Behavioral intelligence findings
  policy_view_then_abandonment:               { root_cause_key: 'behavioral_hesitation_at_commitment', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss', 'chargeback_risk'] },
  high_intent_detour_before_abandonment:      { root_cause_key: 'behavioral_hesitation_at_commitment', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  support_discovered_too_late_to_convert:     { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  cta_visible_but_behaviorally_dead:          { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  purchase_hesitation_with_backtrack:         { root_cause_key: 'behavioral_hesitation_at_commitment', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  critical_step_retries_before_abandonment:   { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  mobile_fails_first_commercial_action:       { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss', 'scale_risk'] },
  funnel_step_alive_but_not_advancing:        { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  // Phase 4B Hardening: 12 new behavioral findings
  hesitation_before_conversion_missing_trust: { root_cause_key: 'behavioral_hesitation_at_commitment', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  pricing_hesitation_unclear_value:           { root_cause_key: 'behavioral_value_justification_gap', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  policy_detour_before_conversion:            { root_cause_key: 'behavioral_hesitation_at_commitment', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss', 'chargeback_risk'] },
  cta_viewed_not_engaged:                     { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  sensitive_input_abandonment:                { root_cause_key: 'behavioral_trust_failure_at_input', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  form_excessive_fields_before_conversion:    { root_cause_key: 'behavioral_trust_failure_at_input', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  form_submission_retry_friction:             { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  surface_oscillation_before_dropoff:         { root_cause_key: 'behavioral_value_justification_gap', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  conversion_final_step_retry:                { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  cta_late_availability_delays_action:        { root_cause_key: 'behavioral_path_disconnection', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  checkout_abandon_no_feedback:               { root_cause_key: 'behavioral_hesitation_at_commitment', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  sensitive_input_perceived_risk_dropoff:      { root_cause_key: 'behavioral_trust_failure_at_input', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
};

export const ROOT_CAUSE_TITLES: Record<string, string> = {
  trust_failure_at_checkout: 'Trust failure at checkout',
  fragmented_conversion_path: 'Fragmented conversion path',
  friction_barrier_on_path: 'Friction barrier on critical path',
  measurement_blindspot: 'Measurement blind spot',
  policy_deficiency: 'Policy and compliance deficiency',
  active_revenue_leakage: 'Active revenue leakage',
  weak_conversion_signal: 'Weak conversion signal',
  support_gap: 'Support accessibility gap',
  expectation_failure: 'Customer expectation misalignment',
  elevated_dispute_risk: 'Elevated dispute and chargeback risk',
  // Phase 3A
  channel_integrity_compromise: 'Channel integrity compromised',
  commerce_continuity_exposure: 'Commerce continuity threatened by operational exposure',
  weak_channel_posture: 'Weak channel technical posture',
  abuse_friendly_channel: 'Abuse-friendly channel conditions',
  // Phase 3B
  deep_commerce_abuse_surface: 'Deep commerce surfaces exposed to systematic abuse',
  weak_commerce_governance: 'Weak governance on discoverable commerce endpoints',
  uncontrolled_commerce_variant: 'Uncontrolled commerce variants escaping the safeguard model',
  // Phase 2D
  runtime_commerce_fragility: 'Runtime fragility on commerce-critical surfaces',
  third_party_dependency_risk: 'Third-party dependency risk on trust and purchase surfaces',
  // Phase 3D: SaaS
  saas_activation_barrier: 'Activation barrier blocking trial-to-paid conversion',
  saas_product_experience_gap: 'Product experience gap eroding perceived value',
  saas_expansion_blocked: 'Expansion revenue blocked by invisible upgrade path',
  // Phase 3E: Discoverability
  weak_discoverability_signals: 'Weak search and social representation on commercial pages',
  inconsistent_surface_representation: 'Inconsistent brand representation across discovery surfaces',
  commercial_pages_not_exposed: 'Commercial pages not structurally exposed for crawling and discovery',
  weak_semantic_intent_signaling: 'Weak semantic signals preventing search and AI understanding',
  // Phase 3E: Brand integrity
  brand_impersonation_exposure: 'Brand exposed to active impersonation and fraud',
  traffic_interception_risk: 'Brand traffic exposed to interception by lookalike domains',
  brand_surface_fragmentation: 'Brand presence fragmented across competing domain variants',
  // Phase 4B
  behavioral_hesitation_at_commitment: 'Behavioral hesitation at the moment of purchase commitment',
  behavioral_path_disconnection: 'Commercial path disconnected from behavioral reality',
  // Phase 4B Hardening
  behavioral_value_justification_gap: 'Value proposition fails to carry the price at the decision moment',
  behavioral_trust_failure_at_input: 'Trust insufficient at sensitive data capture moment',
};

export const ROOT_CAUSE_DESCRIPTIONS: Record<string, string> = {
  trust_failure_at_checkout: 'Users encounter trust breaks during the checkout flow — off-domain handoffs, unknown providers, or missing trust signals reduce conversion and increase chargeback risk.',
  fragmented_conversion_path: 'The conversion path is structurally fragmented across multiple domains or requires excessive steps, causing drop-off at each transition.',
  friction_barrier_on_path: 'Technical obstacles on the revenue path — slow pages, broken forms, excessive redirects — create friction that directly reduces conversion rate.',
  measurement_blindspot: 'Analytics coverage is insufficient to measure conversion performance. Revenue leakage cannot be quantified or optimized.',
  policy_deficiency: 'Required consumer protection policies (privacy, terms, refund) are missing or incomplete, creating legal and trust risk.',
  active_revenue_leakage: 'Revenue is actively being lost through broken forms, missing conversion paths, or fragmented checkout flows.',
  weak_conversion_signal: 'Users cannot find or understand the primary conversion path. Competing CTAs or missing calls-to-action reduce purchase intent.',
  support_gap: 'Customers cannot reach support effectively. Missing or low-visibility contact methods force dissatisfied customers toward chargeback as their only recourse.',
  // Phase 3A
  channel_integrity_compromise: 'The commercial channel is exposed to compromise through script injection, traffic diversion, or weakly governed infrastructure — creating active fraud exposure and trust collapse on purchase surfaces.',
  commerce_continuity_exposure: 'Operational surfaces (admin panels, debug endpoints, configuration files) are publicly accessible near the commercial footprint — enabling pricing manipulation, checkout disruption, or data extraction.',
  weak_channel_posture: 'The public technical posture of the commercial domain signals weakness to browsers and cautious buyers — missing security indicators, mixed content, or certificate issues suppress conversion before the offer is read.',
  abuse_friendly_channel: 'Exposed APIs, schema introspection, or unprotected business-logic endpoints enable automated fraud, pricing abuse, and inventory manipulation at scale.',
  // Phase 3B
  deep_commerce_abuse_surface: 'Deep-discovered discount, cart, and refund routes expose pricing controls and commercial safeguards to systematic abuse — automated tools exploit discoverable endpoints to manipulate margins, enumerate coupons, and initiate fraudulent refunds.',
  weak_commerce_governance: 'Business-critical commerce endpoints follow predictable patterns and lack safeguards proportional to their importance — guessable billing, order, and account actions are reachable outside the intended protection model.',
  uncontrolled_commerce_variant: 'JavaScript-discovered and dynamically rendered commerce variants operate outside the main trust, measurement, and pricing safeguard model — revenue through these paths is simultaneously unprotected and invisible to analytics.',
  // Phase 2D
  runtime_commerce_fragility: 'The commerce-critical runtime — checkout APIs, payment processing, cart operations — suffers from latency, overloaded dependencies, and sequencing problems that degrade purchase completion under real browser conditions.',
  third_party_dependency_risk: 'Trust, payment, and measurement layers depend on external services that fail, load late, or add excessive weight — making conversion and trust formation fragile to third-party reliability.',
  // Phase 3D: SaaS
  saas_activation_barrier: 'The activation path blocks or frustrates trial users before they reach product value — high-complexity onboarding, missing next steps, or landing-to-app disconnect cause trial-to-paid conversion loss.',
  saas_product_experience_gap: 'The in-product experience fails to demonstrate value — empty states without guidance, buried features, and complex navigation prevent users from discovering what the product can do for them.',
  saas_expansion_blocked: 'Users who would pay cannot find or evaluate the upgrade path — hidden pricing, absent upgrade CTAs, or poorly timed prompts cap revenue at the current tier.',
  // Phase 3E: Discoverability
  weak_discoverability_signals: 'Commercial pages have missing or thin titles, descriptions, and social preview tags — search engines and social platforms cannot properly represent the brand offering, reducing click-through on every discoverable query.',
  inconsistent_surface_representation: 'The brand appears differently across search results, social previews, and AI summaries — inconsistency reduces recognition and trust before buyers reach the site.',
  commercial_pages_not_exposed: 'Revenue-generating pages have indexing problems or no internal links — search crawlers cannot discover them and organic demand for these products is invisible.',
  weak_semantic_intent_signaling: 'Without structured data, search engines and AI assistants cannot understand page purpose — resulting in lower ranking for commercial queries and inaccurate AI-generated summaries.',
  // Phase 3E: Brand integrity
  brand_impersonation_exposure: 'Active lookalike domains with brand similarity and commerce patterns — positioned to intercept traffic, process fraudulent transactions, and damage brand trust through confusion.',
  traffic_interception_risk: 'Typosquat and brand-keyword domains capture mistyped or search-diverted traffic — every intercepted visitor is a direct loss of brand-earned demand.',
  brand_surface_fragmentation: 'The brand presence is split across many domain variants — diluting search authority, splitting ranking signals, and creating buyer confusion about which surface is legitimate.',
  // Phase 4B
  behavioral_hesitation_at_commitment: 'Real user sessions reveal hesitation at the moment of purchase — buyers reach the commercial step, seek reassurance elsewhere, and abandon. The gap between intent and confidence is behaviorally observable and recoverable.',
  behavioral_path_disconnection: 'The commercial path exists structurally but fails behaviorally — funnel steps do not advance sessions, CTAs do not generate engagement, mobile entry points are broken, and critical steps trigger retries instead of progression.',
  // Phase 4B Hardening
  behavioral_value_justification_gap: 'Users view pricing and evaluate the offer but the surrounding context fails to justify the price — they backtrack to product pages, oscillate between surfaces, or abandon. The value proposition is structurally present but behaviorally insufficient to close the gap between price awareness and purchase confidence.',
  behavioral_trust_failure_at_input: 'Forms on conversion-proximate surfaces request sensitive data without adequate trust context — users encounter email, payment, or identity fields but the trust signals (security indicators, privacy reassurance, provider recognition) are insufficient for the sensitivity level. The mismatch between what is asked and what is promised causes immediate dropoff.',
  expectation_failure: 'Customer expectations are not properly set — missing pricing visibility, no order confirmation, or brand disconnect at checkout create confusion about what was purchased.',
  elevated_dispute_risk: 'Multiple structural factors — missing policies, unreachable support, unclear expectations — compound to create elevated chargeback and dispute exposure.',
};

export function groupIntoRootCauses(inferences: Inference[], translations?: EngineTranslations): RootCause[] {
  const ids = new IdGenerator('rc');

  // Group inferences by root cause key
  const groups = new Map<string, Inference[]>();
  for (const inf of inferences) {
    const mapping = INFERENCE_TO_ROOT_CAUSE[inf.inference_key];
    if (!mapping || mapping.root_cause_key === '_skip_') continue;

    // Only include inferences that actually indicate a problem
    // Special case: measurement_coverage uses 'false' to mean "insufficient" (it's a problem)
    const isNegativeMeaning = inf.inference_key === 'measurement_coverage' && inf.conclusion_value === 'false';
    if (!isNegativeMeaning && (inf.conclusion_value === 'false' || inf.conclusion_value === 'none')) continue;
    if (inf.conclusion_value === 'true' && inf.severity_hint === null && inf.confidence < 40) continue;
    // Skip genuinely low-severity inferences with 'low' conclusion
    if (inf.conclusion_value === 'low' && inf.severity_hint === 'low' && inf.confidence < 50) continue;

    const existing = groups.get(mapping.root_cause_key) || [];
    existing.push(inf);
    groups.set(mapping.root_cause_key, existing);
  }

  // Convert groups to RootCause objects
  const rootCauses: RootCause[] = [];

  for (const [key, groupInferences] of groups) {
    if (groupInferences.length === 0) continue;

    // Aggregate severity (take highest)
    const severity = aggregateSeverity(groupInferences);

    // Aggregate confidence (weighted average by severity)
    const confidence = aggregateConfidence(groupInferences);

    // Collect unique impact types from all inferences in this group
    const impactSet = new Set<ImpactDimension>();
    for (const inf of groupInferences) {
      const mapping = INFERENCE_TO_ROOT_CAUSE[inf.inference_key];
      if (mapping) {
        for (const impact of mapping.impact_types) impactSet.add(impact);
      }
    }

    // Determine which packs are affected
    const affectedPacks = new Set<string>();
    for (const inf of groupInferences) {
      const mapping = INFERENCE_TO_ROOT_CAUSE[inf.inference_key];
      if (mapping) {
        if (mapping.impact_types.includes('scale_risk')) affectedPacks.add('scale_readiness_pack');
        if (mapping.impact_types.includes('revenue_loss')) affectedPacks.add('revenue_integrity_pack');
        if (mapping.impact_types.includes('trust_erosion')) {
          affectedPacks.add('scale_readiness_pack');
          affectedPacks.add('revenue_integrity_pack');
        }
        if (mapping.impact_types.includes('measurement_blind')) {
          affectedPacks.add('scale_readiness_pack');
          affectedPacks.add('revenue_integrity_pack');
        }
        if (mapping.impact_types.includes('chargeback_risk')) {
          affectedPacks.add('chargeback_resilience_pack');
        }
      }
    }

    // Collect refs without duplicates
    const signalRefs = new Set<Ref>();
    const evidenceRefs = new Set<Ref>();
    for (const inf of groupInferences) {
      for (const r of inf.signal_refs) signalRefs.add(r);
      for (const r of inf.evidence_refs) evidenceRefs.add(r);
    }

    const category = INFERENCE_TO_ROOT_CAUSE[groupInferences[0].inference_key]?.category || 'conversion_fragmentation';

    rootCauses.push({
      id: ids.next(),
      root_cause_key: key,
      category,
      title: translations?.root_cause_titles?.[key] ?? ROOT_CAUSE_TITLES[key] ?? key.replace(/_/g, ' '),
      description: translations?.root_cause_descriptions?.[key] ?? ROOT_CAUSE_DESCRIPTIONS[key] ?? groupInferences.map(i => i.reasoning).join(' '),
      contributing_inferences: groupInferences.map(i => makeRef('inference', i.id)),
      contributing_signals: Array.from(signalRefs),
      contributing_evidence: Array.from(evidenceRefs),
      severity,
      confidence,
      impact_types: Array.from(impactSet),
      affected_packs: Array.from(affectedPacks),
    });
  }

  // Sort by severity desc, then confidence desc
  return rootCauses.sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const diff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    if (diff !== 0) return diff;
    return b.confidence - a.confidence;
  });
}

function aggregateSeverity(inferences: Inference[]): RootCauseSeverity {
  let maxSeverity = 0;
  for (const inf of inferences) {
    const s = inf.severity_hint;
    if (s === 'high' || inf.conclusion_value === 'high') maxSeverity = Math.max(maxSeverity, 3);
    else if (s === 'medium' || inf.conclusion_value === 'medium') maxSeverity = Math.max(maxSeverity, 2);
    else maxSeverity = Math.max(maxSeverity, 1);
  }

  // Convergence bonus: multiple inferences pointing to same root cause increases severity
  if (inferences.length >= 3 && maxSeverity < 3) maxSeverity++;

  if (maxSeverity >= 4) return 'critical';
  if (maxSeverity >= 3) return 'high';
  if (maxSeverity >= 2) return 'medium';
  return 'low';
}

function aggregateConfidence(inferences: Inference[]): number {
  if (inferences.length === 0) return 0;

  // Weighted average: higher severity inferences get more weight
  let totalWeight = 0;
  let weightedSum = 0;
  for (const inf of inferences) {
    const weight = inf.severity_hint === 'high' ? 3 : inf.severity_hint === 'medium' ? 2 : 1;
    weightedSum += inf.confidence * weight;
    totalWeight += weight;
  }

  // Convergence bonus: more inferences = more confidence (capped)
  const base = Math.round(weightedSum / totalWeight);
  const convergenceBonus = Math.min(10, (inferences.length - 1) * 3);
  return Math.min(100, base + convergenceBonus);
}
