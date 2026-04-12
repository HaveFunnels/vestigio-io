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
//
// Wave 2.3 (2026-04-07) — vocabulary refinement:
// - Consolidated 3 abuse keys → `commerce_abuse_exposure`
// - Consolidated 4 discoverability keys → 2 (`brand_inconsistent_in_previews` + `commerce_pages_invisible_to_search`)
// - Consolidated 3 brand keys → `brand_impersonation_exposure` (broadened scope)
// - Renamed `elevated_dispute_risk` → `dispute_defenses_absent`
// - Renamed `commerce_continuity_exposure` → `commerce_operations_exposed`
// - Renamed `uncontrolled_commerce_variant` → `untracked_purchase_paths`
// - Moved `runtime_commerce_fragility` from `friction_barrier` → new `runtime_fragility` category
// - `weak_conversion_signal` retitled but kept as a distinct root cause
// Net: 33 → 27 root causes.
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

  // Conversion clarity — kept distinct from friction; "no signal" is different from "obstacle on the path"
  unclear_conversion_intent: { root_cause_key: 'weak_conversion_signal', category: 'conversion_clarity', impact_types: ['revenue_loss'] },

  // Chargeback resilience — policy, support, expectation
  refund_policy_gap:         { root_cause_key: 'policy_deficiency', category: 'policy_deficiency', impact_types: ['trust_erosion', 'chargeback_risk'] },
  support_unreachable:       { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['chargeback_risk', 'trust_erosion'] },
  expectation_misalignment:  { root_cause_key: 'expectation_failure', category: 'expectation_failure', impact_types: ['chargeback_risk'] },
  dispute_risk_elevated:     { root_cause_key: 'dispute_defenses_absent', category: 'dispute_exposure', impact_types: ['chargeback_risk', 'trust_erosion'] },

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

  // Phase 3A: Channel integrity / abuse exposure (Wave 2.3 consolidated abuse keys)
  payment_surface_compromised:          { root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['revenue_loss', 'trust_erosion'] },
  channel_traffic_divertible:           { root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss'] },
  commerce_operations_exposed:          { root_cause_key: 'commerce_operations_exposed', category: 'commerce_continuity', impact_types: ['revenue_loss', 'scale_risk'] },
  traffic_landing_low_trust_posture:    { root_cause_key: 'weak_channel_posture', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss'] },
  channel_compromise_visible:           { root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss'] },
  commercial_path_abuse_friendly:       { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  economic_exploitation_active:         { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  checkout_trust_brittle_infrastructure:{ root_cause_key: 'channel_integrity_compromise', category: 'channel_integrity', impact_types: ['trust_erosion', 'revenue_loss', 'scale_risk'] },

  // Phase 3B: Deep discovery findings (Wave 2.3 consolidated into commerce_abuse_exposure)
  promotion_logic_exposed:              { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  cart_variant_weak_control:            { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  hidden_discount_refund_route:         { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  guessable_business_endpoint:          { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss', 'scale_risk'] },
  alternate_pricing_safeguard_bypass:   { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  js_discovered_purchase_variant:       { root_cause_key: 'untracked_purchase_paths', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'trust_erosion'] },
  dynamic_route_weak_control:           { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss'] },
  hidden_support_burden:                { root_cause_key: 'support_gap', category: 'support_gap', impact_types: ['chargeback_risk'] },
  alternate_variant_control_breakdown:  { root_cause_key: 'untracked_purchase_paths', category: 'conversion_fragmentation', impact_types: ['revenue_loss', 'trust_erosion', 'measurement_blind'] },
  deep_commerce_exploitation_risk:      { root_cause_key: 'commerce_abuse_exposure', category: 'abuse_exposure', impact_types: ['revenue_loss', 'scale_risk'] },

  // Phase 2D: Network analysis findings (Wave 2.3 moved runtime_commerce_fragility to runtime_fragility category)
  checkout_api_latency_degraded:        { root_cause_key: 'runtime_commerce_fragility', category: 'runtime_fragility', impact_types: ['revenue_loss'] },
  commercial_pages_slow:                { root_cause_key: 'runtime_commerce_fragility', category: 'runtime_fragility', impact_types: ['revenue_loss', 'scale_risk'] },
  paid_landing_overloaded:              { root_cause_key: 'runtime_commerce_fragility', category: 'runtime_fragility', impact_types: ['revenue_loss', 'scale_risk'] },
  third_party_weight_delays_trust:      { root_cause_key: 'third_party_dependency_risk', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  checkout_brittle_third_party:         { root_cause_key: 'third_party_dependency_risk', category: 'channel_integrity', impact_types: ['revenue_loss'] },
  purchase_blocked_failing_requests:    { root_cause_key: 'active_revenue_leakage', category: 'conversion_fragmentation', impact_types: ['revenue_loss'] },
  measurement_breaks_revenue_path:      { root_cause_key: 'measurement_blindspot', category: 'measurement_gap', impact_types: ['measurement_blind', 'revenue_loss'] },
  purchase_before_deps_ready:           { root_cause_key: 'runtime_commerce_fragility', category: 'runtime_fragility', impact_types: ['revenue_loss'] },
  trust_assets_late_load:               { root_cause_key: 'third_party_dependency_risk', category: 'trust_failure', impact_types: ['trust_erosion'] },
  mobile_heavy_runtime_chain:           { root_cause_key: 'runtime_commerce_fragility', category: 'runtime_fragility', impact_types: ['revenue_loss', 'scale_risk'] },
  mobile_trust_payment_deps_failing:    { root_cause_key: 'third_party_dependency_risk', category: 'trust_failure', impact_types: ['revenue_loss', 'trust_erosion'] },
  trust_surfaces_unstable_deps:         { root_cause_key: 'third_party_dependency_risk', category: 'channel_integrity', impact_types: ['trust_erosion'] },

  // Phase 3E: Discoverability findings (Wave 2.3 consolidated 4 → 2)
  // - brand/content layer (representation, previews, semantic) → brand_inconsistent_in_previews
  // - structural layer (indexing, exposure) → commerce_pages_invisible_to_search
  commercial_pages_weak_search_representation: { root_cause_key: 'brand_inconsistent_in_previews', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  social_previews_fail_commercial_value:       { root_cause_key: 'brand_inconsistent_in_previews', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  brand_inconsistent_across_surfaces:          { root_cause_key: 'brand_inconsistent_in_previews', category: 'discoverability_gap', impact_types: ['trust_erosion', 'revenue_loss'] },
  commercial_pages_unlikely_indexed:           { root_cause_key: 'commerce_pages_invisible_to_search', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  weak_semantic_intent_signals:                { root_cause_key: 'commerce_pages_invisible_to_search', category: 'discoverability_gap', impact_types: ['revenue_loss'] },
  previews_disconnected_from_conversion:       { root_cause_key: 'brand_inconsistent_in_previews', category: 'discoverability_gap', impact_types: ['revenue_loss', 'trust_erosion'] },
  commercial_pages_not_exposed_for_discovery:  { root_cause_key: 'commerce_pages_invisible_to_search', category: 'discoverability_gap', impact_types: ['revenue_loss'] },

  // Phase 3E: Brand integrity findings (Wave 2.3 consolidated 3 → 1, broadened brand_impersonation_exposure)
  lookalike_domain_competing_for_traffic:      { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss'] },
  external_sites_mimicking_brand:              { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss', 'trust_erosion'] },
  brand_traffic_exposed_to_deceptive_surfaces: { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss'] },
  suspicious_domains_capturing_purchase_intent:{ root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss'] },
  customers_exposed_to_phishing_surfaces:      { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['revenue_loss', 'trust_erosion'] },
  brand_presence_diluted_across_variants:      { root_cause_key: 'brand_impersonation_exposure', category: 'brand_impersonation', impact_types: ['trust_erosion', 'revenue_loss'] },

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

  // Wave 3.3: Security posture (money_moment_exposure)
  security_header_weakness:      { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  mixed_content_exposure:        { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  sensitive_endpoint_exposed:    { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  // Wave 3.3 expansion: cybersecurity pack
  checkout_script_hijack_risk:   { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  buyer_session_theft_risk:      { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  checkout_clickjack_risk:       { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  payment_data_unencrypted:      { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  error_page_information_leak:   { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  // Wave 3.3 expansion: cybersecurity pack (batch 2)
  email_deliverability_risk:     { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  cors_misconfiguration_risk:    { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  rate_limiting_absent_on_commerce: { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },
  predictable_order_urls:        { root_cause_key: 'security_posture_inadequate', category: 'trust_failure', impact_types: ['trust_erosion', 'revenue_loss'] },

  // Phase 5: Behavioral cohort inference mappings

  // first_impression_revenue pack — first session stalls, trust barriers, CTA timing
  first_session_milestone_stall:  { root_cause_key: 'behavioral_first_session_failure', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },
  first_session_trust_barrier:    { root_cause_key: 'behavioral_first_session_failure', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss', 'trust_erosion'] },
  first_session_cta_timing_gap:   { root_cause_key: 'behavioral_first_session_failure', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss'] },

  // action_value_map pack — low-value actions dominate, high-value underexposed
  low_value_action_dominates:     { root_cause_key: 'behavioral_action_value_misalignment', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  high_value_action_underexposed: { root_cause_key: 'behavioral_action_value_misalignment', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  dead_weight_surface_traffic:    { root_cause_key: 'behavioral_action_value_misalignment', category: 'behavioral_path_integrity', impact_types: ['revenue_loss', 'scale_risk'] },

  // acquisition_integrity pack — paid traffic friction and trust gaps
  paid_traffic_friction_elevated:  { root_cause_key: 'paid_acquisition_waste', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },
  paid_traffic_trust_gap:          { root_cause_key: 'paid_acquisition_waste', category: 'friction_barrier', impact_types: ['revenue_loss', 'trust_erosion'] },
  paid_mobile_compounding_waste:   { root_cause_key: 'paid_acquisition_waste', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },

  // mobile_revenue_exposure pack — mobile-specific conversion degradation
  mobile_conversion_gap:           { root_cause_key: 'mobile_conversion_failure', category: 'friction_barrier', impact_types: ['revenue_loss', 'scale_risk'] },
  mobile_form_friction_elevated:   { root_cause_key: 'mobile_conversion_failure', category: 'friction_barrier', impact_types: ['revenue_loss'] },
  mobile_cta_timing_degraded:      { root_cause_key: 'mobile_conversion_failure', category: 'friction_barrier', impact_types: ['revenue_loss'] },

  // friction_tax pack — funnel step friction, oscillation cost, checkout entry
  funnel_step_friction_cost:       { root_cause_key: 'behavioral_friction_tax', category: 'friction_barrier', impact_types: ['revenue_loss'] },
  oscillation_decision_cost:       { root_cause_key: 'behavioral_friction_tax', category: 'friction_barrier', impact_types: ['revenue_loss'] },
  checkout_entry_friction:         { root_cause_key: 'behavioral_friction_tax', category: 'friction_barrier', impact_types: ['revenue_loss'] },

  // trust_revenue_gap pack — trust deficit dragging conversion
  trust_deficit_conversion_drag:   { root_cause_key: 'behavioral_trust_revenue_gap', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss', 'trust_erosion'] },
  reassurance_seeking_elevated:    { root_cause_key: 'behavioral_trust_revenue_gap', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss', 'trust_erosion'] },
  sensitive_input_trust_gap:       { root_cause_key: 'behavioral_trust_revenue_gap', category: 'behavioral_conversion_failure', impact_types: ['revenue_loss', 'trust_erosion'] },

  // path_efficiency pack — path length, intent decay, intent absorbers
  path_length_exceeds_efficient:   { root_cause_key: 'behavioral_path_inefficiency', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  intent_decay_time_excessive:     { root_cause_key: 'behavioral_path_inefficiency', category: 'behavioral_path_integrity', impact_types: ['revenue_loss'] },
  intent_absorber_detected:        { root_cause_key: 'behavioral_path_inefficiency', category: 'behavioral_path_integrity', impact_types: ['revenue_loss', 'scale_risk'] },
};

// Wave 2.3 (2026-04-07) — operator-facing titles. Every title speaks to a
// business outcome the buyer would recognize, not engine-internal jargon.
// 27 root causes total (down from 33 in Wave 2.2).
export const ROOT_CAUSE_TITLES: Record<string, string> = {
  trust_failure_at_checkout: 'Buyers lose trust at the checkout moment',
  fragmented_conversion_path: 'Your purchase flow is split across too many places',
  friction_barrier_on_path: 'Friction blocking buyers on the path to purchase',
  measurement_blindspot: "You can't measure what's happening on your purchase pages",
  policy_deficiency: 'Required policies are missing or hard to find',
  active_revenue_leakage: 'Revenue is leaking out of your purchase flow',
  weak_conversion_signal: "Visitors can't see how to buy from you",
  support_gap: "Customers can't reach support when they need it most",
  expectation_failure: "Buyers don't know what they're paying for",
  // Wave 2.3 rename: was elevated_dispute_risk
  dispute_defenses_absent: 'Nothing protects you from chargeback disputes',
  // Phase 3A
  channel_integrity_compromise: 'Your store is exposed to fraud and tampering',
  // Wave 2.3 rename: was commerce_continuity_exposure
  commerce_operations_exposed: "Your store's admin tools are publicly visible",
  weak_channel_posture: 'Your site signals weakness to cautious buyers',
  // Wave 2.3 consolidation: was abuse_friendly_channel + deep_commerce_abuse_surface + weak_commerce_governance
  commerce_abuse_exposure: 'Discount, refund, and pricing logic exposed to abuse',
  // Wave 2.3 rename: was uncontrolled_commerce_variant
  untracked_purchase_paths: 'Hidden purchase paths bypass your main safeguards',
  // Phase 2D
  runtime_commerce_fragility: 'Your store breaks for real users in real browsers',
  third_party_dependency_risk: 'Critical buyer experience depends on flaky third parties',
  // Phase 3D: SaaS
  saas_activation_barrier: "Trial users can't reach product value",
  saas_product_experience_gap: 'Your product fails to demonstrate value to new users',
  saas_expansion_blocked: "Users who would pay can't find or evaluate the upgrade",
  // Wave 2.3 consolidations (4 discoverability keys → 2)
  brand_inconsistent_in_previews: 'Your brand looks inconsistent or weak in search and social previews',
  commerce_pages_invisible_to_search: "Search engines can't find or understand your product pages",
  // Wave 2.3 consolidation: was brand_impersonation_exposure + traffic_interception_risk + brand_surface_fragmentation
  brand_impersonation_exposure: 'Your brand is being impersonated or hijacked',
  // Phase 4B
  behavioral_hesitation_at_commitment: 'Real buyers hesitate at the moment of purchase',
  behavioral_path_disconnection: 'Your purchase flow looks fine in code but fails for real users',
  // Phase 4B Hardening
  behavioral_value_justification_gap: "Buyers see your price but can't see the value",
  behavioral_trust_failure_at_input: "Buyers don't trust your forms with sensitive data",
  // Wave 3.3
  security_posture_inadequate: 'Your site looks unsafe to browsers and buyers',
  // Phase 5: Behavioral cohort root causes
  behavioral_first_session_failure: 'First-time visitors stall before reaching a revenue milestone',
  behavioral_action_value_misalignment: 'Low-value actions dominate while high-value actions go unseen',
  paid_acquisition_waste: 'Paid traffic hits friction that compounds into wasted spend',
  mobile_conversion_failure: 'Mobile visitors face conversion barriers desktop users never see',
  behavioral_friction_tax: 'Every funnel step costs more effort than it should',
  behavioral_trust_revenue_gap: 'Buyers want to convert but lack the trust to follow through',
  behavioral_path_inefficiency: 'The path to purchase is longer than buyer intent can sustain',
};

// Wave 2.3 (2026-04-07) — operator-facing descriptions. Each one explains
// WHAT the problem looks like and WHY it matters in plain business language,
// without engine jargon. Remediation guidance lives in the foundation
// articles ([packages/knowledge/foundation-articles.ts]) — descriptions
// here stay diagnostic.
export const ROOT_CAUSE_DESCRIPTIONS: Record<string, string> = {
  trust_failure_at_checkout: "Buyers reach the moment of payment but trust signals around them weaken instead of strengthen. Off-domain handoffs, unrecognized payment providers, and missing security cues at the wrong moment cause buyers to back out — exactly when conversion is closest. The buyer wanted to pay; the experience scared them off.",

  fragmented_conversion_path: "Your purchase flow is split across multiple domains or requires too many steps. Every transition between surfaces is a fresh chance for the buyer to drop. The path that should feel like one continuous experience feels like a relay race with handoffs at every step.",

  friction_barrier_on_path: "Technical obstacles on the path from intent to purchase — slow pages, broken or excessively long forms, redundant redirects — directly suppress conversion. Buyers don't push through friction; they bounce. Every step that asks too much is a step that loses revenue.",

  measurement_blindspot: "The pages that generate revenue aren't being measured. Without analytics on the commerce path, every other improvement is guesswork — you can't optimize what you can't see. Decisions get made on intuition instead of data, and the leaks stay invisible.",

  policy_deficiency: "Required consumer policies (privacy, terms, returns) are missing, incomplete, or buried where buyers can't find them. This creates legal risk, breaks trust at the purchase moment, and blocks paid traffic acceptance on platforms that require policy presence before serving ads.",

  active_revenue_leakage: "Revenue is escaping right now through specific broken paths — dead checkout flows, broken forms, missing conversion routes. This isn't a hypothetical risk; it's money leaving today. Every cycle this remains is direct revenue loss with a quantifiable dollar tag.",

  weak_conversion_signal: "Visitors land on your commercial pages but cannot see how to buy from you. The primary call-to-action is missing, unclear, or competing with louder secondary actions. Even buyers who arrived ready to convert can't find the path — and they leave.",

  support_gap: "Customers can't reach you when something goes wrong. Hidden contact methods, missing chat, no phone or email near the purchase moment — buyers who can't reach support file disputes instead. Every chargeback is a failed conversation that should have been a support ticket.",

  expectation_failure: "Buyers complete the purchase without knowing exactly what they bought, when it ships, or how to return it. The mismatch between expectation and reality is the precondition for chargebacks. Confirmation, transparency, and brand continuity at checkout aren't optional — they're the contract that prevents disputes.",

  // Wave 2.3 rename
  dispute_defenses_absent: "The structural defenses that prevent chargebacks — clear policies, reachable support, transparent expectations, brand continuity at payment — are missing in combination. Each defense alone reduces dispute rate; their simultaneous absence compounds risk into elevated chargeback exposure.",

  // Phase 3A
  channel_integrity_compromise: "Your store is exposed to script tampering, traffic diversion, or weakly governed infrastructure. Third-party scripts running on payment pages, unrecognized form targets, or unprotected endpoints turn your commercial channel into an attack surface. The buyer experience is at the mercy of code you don't fully control.",

  // Wave 2.3 rename: was commerce_continuity_exposure
  commerce_operations_exposed: "Admin panels, debug endpoints, configuration files, and operational tools meant for internal use are publicly accessible from your commerce domain. These surfaces enable pricing manipulation, checkout disruption, and data extraction by anyone who finds them. Your internal tools are part of your public attack surface whether you realize it or not.",

  weak_channel_posture: "Your site's public technical posture signals weakness to cautious buyers and to browsers. Missing security indicators, mixed content warnings, or certificate issues suppress conversion before the offer is even read. The buyer's browser tells them something is wrong — they trust the browser more than they trust you.",

  // Wave 2.3 consolidation (3 → 1)
  commerce_abuse_exposure: "Discount codes, refund flows, cart logic, and pricing endpoints are exposed to automated abuse. Bots and scripts exploit predictable URLs, missing rate limits, or weak governance to drain margins, enumerate coupons, or trigger fraudulent refunds at scale. The abuse compounds silently — by the time you notice the loss, you've already paid for it.",

  // Wave 2.3 rename: was uncontrolled_commerce_variant
  untracked_purchase_paths: "JavaScript-discovered or dynamically-rendered commerce variants operate outside your main trust, measurement, and pricing safeguard model. Revenue flowing through these paths is simultaneously unprotected and invisible to your analytics — you can't measure them, can't trust them, and may not even know they exist.",

  // Phase 2D
  runtime_commerce_fragility: "Your commerce pages fail or stall when real users open them in real browsers. Slow checkout APIs, overloaded landing pages, sequencing problems where buyers reach the purchase step before critical scripts are ready — the technical reality of the page degrades the conversion that static analysis can't see. The page works for you in dev. It breaks for them in production.",

  third_party_dependency_risk: "Critical buyer experience — payment, trust badges, support widgets, measurement — depends on external services that fail, load late, or add too much weight. When a third party hiccups, your conversion path breaks with it. Reliability you don't control is reliability you can't promise to your buyer.",

  // Phase 3D: SaaS
  saas_activation_barrier: "New trial users can't reach the moment where the product proves its value. High-complexity onboarding, missing next-step guidance, or a disconnect between landing promise and in-app reality kills trial-to-paid conversion before users see what they're paying for. They sign up curious and leave unconvinced.",

  saas_product_experience_gap: "Once inside the product, users can't discover what it does for them. Empty states without guidance, buried features, and complex navigation prevent the activation moment. The product is capable; the experience hides that capability. Users churn for products that aren't actually better — just better at showing their value.",

  saas_expansion_blocked: "Users who would happily pay for more cannot find the upgrade path or evaluate it. Hidden pricing, missing upgrade CTAs, or prompts shown without value context cap revenue at the current tier even when willingness-to-pay is higher. Money is leaving on the table because the path to give it to you isn't visible.",

  // Wave 2.3 consolidation (2 → 1, content/brand layer)
  brand_inconsistent_in_previews: "Your brand appears inconsistently — or weakly — in search results, social previews, and AI assistant summaries. The first impression of your business is being shaped by missing titles, thin descriptions, and conflicting metadata across surfaces. Recognition and trust erode before buyers ever reach the site.",

  // Wave 2.3 consolidation (2 → 1, structural layer)
  commerce_pages_invisible_to_search: "Search engines and AI assistants cannot find or properly understand your product and pricing pages. Missing indexing signals, no internal links, and absent structured data make your commercial inventory invisible to organic and AI-driven discovery. Every uncaptured query is direct demand you'll never see.",

  // Wave 2.3 consolidation (3 → 1, broadened)
  brand_impersonation_exposure: "Your brand is being actively impersonated. Lookalike domains, typosquats, phishing surfaces, or fragmented brand variants intercept traffic, run fraudulent transactions, or capture mistyped visits. Every intercepted buyer is direct revenue you earned but never saw — and every fraudulent transaction damages the brand trust you spent years building.",

  // Phase 4B
  behavioral_hesitation_at_commitment: "Real session data shows buyers reaching the moment of purchase, hesitating, seeking reassurance elsewhere on the site, and abandoning. The gap between intent and confidence is observable in their behavior — and recoverable. They wanted to buy. Something stopped them, and it shows up in the session replay.",

  behavioral_path_disconnection: "Your purchase flow looks fine in the code but fails for real users. Funnel steps show traffic but never advance. CTAs are visible but never engaged. Mobile entry points are broken. Critical steps trigger silent retries instead of progression. The path exists structurally and fails behaviorally — and only the pixel sees it.",

  // Phase 4B Hardening
  behavioral_value_justification_gap: "Buyers see your price but cannot see the value that justifies it. They view the pricing page, backtrack to features, oscillate between surfaces, and abandon. The value proposition is structurally present but behaviorally insufficient to close the gap between price awareness and purchase confidence. They left not because the price was too high, but because nothing told them it was worth it.",

  behavioral_trust_failure_at_input: "Forms on conversion-proximate pages ask for sensitive data — payment, identity, contact — without enough trust context around them. The mismatch between what's being asked and what's being promised causes immediate dropoff. The buyer doesn't know enough to feel safe handing over their information, and they back out at the field.",

  security_posture_inadequate: "Your buyers see signals that your site is unsafe — and they leave. Browsers remove the padlock, show 'Not Secure' warnings, and silently block payment scripts when security headers are missing or content is mixed. Checkout forms stop submitting. Trust badges disappear. The buyer clicks 'Pay' and nothing happens. Meanwhile, exposed configuration files and admin panels mean one breach away from total commerce shutdown. These are not hypothetical risks — they cost you conversions every day and create catastrophic downside if exploited.",

  // Phase 5: Behavioral cohort root causes
  behavioral_first_session_failure: "First-time visitors arrive with intent but stall before reaching any revenue milestone. Session data shows new users hitting trust barriers, missing CTAs, or encountering dead-end flows within their first interaction. The first session is the highest-leverage conversion window — when it fails, the buyer rarely returns. Every first-session stall is a permanent loss of the cheapest conversion you'll ever get.",

  behavioral_action_value_misalignment: "Visitor behavior concentrates on low-value actions while the high-value actions that drive revenue remain underexposed or buried. Traffic flows to surfaces that don't advance the purchase, and the pages that matter most receive the least engagement. The site is busy but unproductive — activity without advancement. Revenue-generating actions need to be where the attention already is, not where you wish it were.",

  paid_acquisition_waste: "Paid traffic lands on experiences with elevated friction, trust gaps, or mobile-compounding issues that suppress the conversion you paid to create. The acquisition cost is fixed but the conversion rate is degraded — every friction point on the paid path multiplies your effective cost per acquisition. You're paying full price for half the result, and the waste scales linearly with spend.",

  mobile_conversion_failure: "Mobile visitors encounter conversion barriers that desktop users never see — broken CTAs, form friction, timing gaps between intent and action. The mobile experience systematically underperforms against the same offer, same traffic quality, same buyer intent. Since mobile is typically the majority of traffic, this gap represents the single largest segment-level revenue loss most sites carry.",

  behavioral_friction_tax: "Every step in the funnel costs more effort than it should. Session data shows oscillation between pages, repeated checkout entries, and decision fatigue manifesting as back-and-forth navigation before dropoff. The cumulative friction across the path acts as an invisible tax on conversion — no single step is broken, but the sum of all steps exceeds what buyers are willing to endure.",

  behavioral_trust_revenue_gap: "Buyers demonstrate clear purchase intent but abandon at conversion-proximate moments because trust signals are insufficient. Session patterns show elevated reassurance-seeking behavior — policy page visits, support lookups, trust badge scanning — followed by abandonment. The gap between willingness to buy and willingness to trust is measurable and recoverable. These buyers wanted to convert; they needed one more reason to feel safe.",

  behavioral_path_inefficiency: "The path from first interaction to purchase is longer than buyer intent can sustain. Too many intermediate pages, excessive time between intent signals and conversion opportunities, and intent-absorbing surfaces that capture attention without advancing the purchase all contribute to decay. By the time the buyer reaches the conversion point, the urgency that brought them has dissipated. Shorter paths convert; longer paths leak.",
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
