// ──────────────────────────────────────────────
// Inference → Pack mapping (standalone, zero deps)
//
// Lives in its own file so BOTH the workspace layer (which needs to
// pre-filter inferences per pack before produceDecision()) AND the
// projections layer (which uses it for FindingProjection.workspace_refs,
// ActionProjection.linked_findings filtering, value-case routing, etc.)
// can import it without creating a circular dependency. The map is the
// single source of truth for "which pack does this inference belong to?"
//
// Adding a new finding: add an entry here keyed by inference_key.
// Removing one: remove from here AND from any pack-specific logic.
//
// Wave 15.4 — extracted from packages/projections/engine.ts so the
// workspace can filter inferences pack-pure before invoking decision
// builders. Previously, all builders saw the global inferences list and
// `has(key)` checks broadcast actions even when the underlying finding
// was actually in a different pack.
// ──────────────────────────────────────────────


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
  // Wave 12 — Brand Echo (off-site reconnaissance). Industry listing
  // voids + SERP visibility findings sit under discoverability because
  // they answer "where buyers find tools." Reputation + hijack
  // findings sit under brand_integrity because they answer "who is
  // representing the brand in the wild."
  g2_listing_void: 'discoverability',
  capterra_listing_void: 'discoverability',
  producthunt_listing_void: 'discoverability',
  wikipedia_listing_void: 'discoverability',
  branded_serp_invisible: 'discoverability',
  category_intent_invisible: 'discoverability',
  hn_tech_audience_invisible: 'discoverability',
  reddit_forum_absence: 'discoverability',
  reddit_category_demand_unmet: 'discoverability',
  competitor_brand_hijack_serp: 'brand_integrity',
  affiliate_outranks_own: 'brand_integrity',
  trustpilot_complaint_cluster: 'brand_integrity',
  trustpilot_response_silence: 'brand_integrity',
  reclame_aqui_reputation_critical: 'brand_integrity',
  // Wave 13 — AI Visibility pack. All map to discoverability since AI
  // search is a new discovery surface in addition to traditional SERP.
  // Positive findings live alongside negative — UI distinguishes via
  // severity_hint="none". Composite score lives here too.
  ai_visibility_score: 'discoverability',
  // Negative findings
  ai_bots_blocked: 'discoverability',
  no_llms_txt: 'discoverability',
  no_machine_readable_pricing: 'discoverability',
  schema_markup_missing_for_product: 'discoverability',
  unfindable_in_comparison_searches: 'discoverability',
  branded_query_ai_overview_competitor: 'discoverability',
  wikipedia_article_thin_or_outdated: 'discoverability',
  // Positive findings (strengths to protect)
  wikipedia_article_authoritative: 'discoverability',
  schema_markup_comprehensive: 'discoverability',
  ai_bot_access_optimal: 'discoverability',
  pricing_machine_readable: 'discoverability',
  branded_query_owns_ai_overview: 'discoverability',
  comparison_page_owns_vs_query: 'discoverability',
  high_authority_third_party_citations: 'discoverability',
  // Wave B: competitive citation intel + action opportunities + trajectory
  competitor_owns_category_query: 'discoverability',
  competitor_owns_comparison: 'discoverability',
  wikipedia_gap_to_fill: 'discoverability',
  llms_txt_quick_win: 'discoverability',
  schema_priority_list: 'discoverability',
  third_party_citation_target: 'discoverability',
  high_leverage_query_unowned: 'discoverability',
  ai_visibility_trajectory_improved: 'discoverability',
  ai_visibility_trajectory_declined: 'discoverability',
  new_citation_detected: 'discoverability',
  lost_citation_detected: 'discoverability',
  // Wave 14 — Cross-pack compound insights. Each maps to the pack
  // where the COMPOUND action is most naturally surfaced. Routing
  // depends on which pack the unified fix gets executed in.
  compound_reputation_blocks_ai_citation: 'brand_integrity', // reputation is the root cause
  compound_invisible_and_unclear: 'discoverability',
  compound_brand_authority_crisis: 'brand_integrity',
  compound_ai_agent_invisibility: 'discoverability',
  compound_mobile_commerce_broken: 'mobile_revenue_exposure',
  compound_funnel_triple_leak: 'revenue_integrity',
  compound_paid_acquisition_burn: 'acquisition_integrity',
  compound_trust_journey_collapse: 'trust_revenue_gap',
  compound_saas_activation_to_expansion_blocked: 'saas_growth_readiness',
  compound_dead_ad_spend: 'acquisition_integrity',
  compound_pricing_unclear_and_unparseable: 'revenue_integrity',
  compound_category_invisible_and_authority_thin: 'discoverability',
  // Wave 3.10: Copy alignment pack
  value_proposition_buried: 'copy_alignment',
  social_proof_ineffective: 'copy_alignment',
  objection_unaddressed: 'copy_alignment',
  cta_competing_or_unclear: 'copy_alignment',
  trust_copy_absent_at_decision: 'copy_alignment',
  copy_funnel_misalignment: 'copy_alignment',
  copy_cross_page_inconsistent: 'copy_alignment',
  // Wave 3.10 Fase 4: Polish enrichments
  localization_persuasion_lost: 'copy_alignment',
  micro_copy_friction_high: 'copy_alignment',
  seo_conversion_conflict: 'copy_alignment',
  copy_stale_references: 'copy_alignment',
  // Wave 8.3: Content Freshness & Decay
  commercial_page_stale: 'content_freshness',
  pricing_page_outdated: 'content_freshness',
  social_proof_expired: 'content_freshness',
  content_decay_progression: 'content_freshness',
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
  open_redirect_indicator: 'money_moment_exposure',
  sensitive_endpoint_exposed: 'money_moment_exposure',
  // Wave 3.3 expansion: cybersecurity pack
  checkout_script_hijack_risk: 'money_moment_exposure',
  buyer_session_theft_risk: 'money_moment_exposure',
  checkout_clickjack_risk: 'money_moment_exposure',
  payment_data_unencrypted: 'money_moment_exposure',
  error_page_information_leak: 'money_moment_exposure',
  email_deliverability_risk: 'money_moment_exposure',
  cors_misconfiguration_risk: 'money_moment_exposure',
  rate_limiting_absent_on_commerce: 'money_moment_exposure',
  predictable_order_urls: 'money_moment_exposure',
  // Wave 4.1: Cybersecurity Phase 2
  information_disclosure: 'money_moment_exposure',
  script_supply_chain_risk: 'money_moment_exposure',
  auth_surface_insecure: 'money_moment_exposure',
  // Wave 3.1 Tier 2: LLM enrichment findings
  social_proof_generic: 'revenue_integrity',
  form_error_messages_unhelpful: 'revenue_integrity',
  onboarding_no_quick_win: 'saas_growth_readiness',
  // Tier 1 Copy Analysis
  checkout_trust_language_absent: 'revenue_integrity',
  cta_clarity_weak_on_commercial: 'revenue_integrity',
  product_page_copy_generic: 'revenue_integrity',
  pricing_page_framing_unclear: 'revenue_integrity',
  // Phase 4A: Commerce context (Shopify-powered)
  checkout_abandonment_revenue_leak: 'revenue_integrity',
  promoted_product_out_of_stock: 'money_moment_exposure',
  high_refund_rate_eroding_revenue: 'chargeback_resilience',
  single_payment_gateway_risk: 'money_moment_exposure',
  discount_abuse_pattern: 'channel_integrity',
  ad_spend_platform_concentration_risk: 'channel_integrity',
  ads_without_conversion_visibility: 'revenue_integrity',
  ad_creative_dead_destination: 'revenue_integrity',
  ad_creative_landing_trust_gap: 'revenue_integrity',
  ad_creative_form_friction_waste: 'revenue_integrity',
  ad_creative_mobile_checkout_degraded: 'revenue_integrity',
  ad_creative_message_mismatch: 'revenue_integrity',
  low_repeat_purchase_rate: 'revenue_integrity',
  dead_weight_products: 'revenue_integrity',
  // Wave 8.1: Payment Health & Involuntary Churn
  failed_payment_revenue_drain: 'payment_health',
  subscriber_churn_unsustainable: 'payment_health',
  payment_diversity_insufficient: 'payment_health',
  mrr_contraction_detected: 'payment_health',
  // Wave 6.1: Revenue Attribution Integrity
  revenue_attribution_mismatch: 'revenue_integrity',
  // Wave 7.11M: pixel coverage gap (measurement integrity for revenue path)
  pixel_coverage_gap: 'revenue_integrity',
  // Triple-source cross-domain findings
  brand_trust_cliff_at_payment: 'revenue_integrity',
  ad_landing_experience_disconnect: 'revenue_integrity',
  checkout_form_mobile_hostile: 'scale_readiness',
  pricing_page_complexity_paralysis: 'revenue_integrity',
  support_promise_impossible_to_fulfill: 'chargeback_resilience',
  trust_journey_inconsistency: 'revenue_integrity',
  multilingual_conversion_leak: 'revenue_integrity',
  // Vertical-specific findings
  size_guide_missing: 'vertical_specific',
  booking_absent_or_phone_only: 'vertical_specific',
  contact_friction_high: 'vertical_specific',
  booking_intake_excessive: 'vertical_specific',
  service_pricing_opaque: 'vertical_specific',
  product_images_insufficient: 'vertical_specific',
  no_urgency_indicators: 'vertical_specific',
  cross_sell_absent: 'vertical_specific',
  return_policy_not_on_product: 'vertical_specific',
  no_free_trial_offered: 'vertical_specific',
  integration_ecosystem_invisible: 'vertical_specific',
  changelog_stale_or_missing: 'vertical_specific',
  annual_discount_not_highlighted: 'vertical_specific',
  no_product_screenshot_visible: 'vertical_specific',
  menu_requires_signup: 'vertical_specific',
  no_food_photos: 'vertical_specific',
  delivery_area_unclear: 'vertical_specific',
  delivery_time_not_shown: 'vertical_specific',
  allergen_info_missing: 'vertical_specific',
  ingredients_not_listed: 'vertical_specific',
  no_clinical_endorsement: 'vertical_specific',
  usage_instructions_absent: 'vertical_specific',
  subscription_not_offered: 'vertical_specific',
  no_results_evidence: 'vertical_specific',
  curriculum_not_visible: 'vertical_specific',
  instructor_credentials_missing: 'vertical_specific',
  completion_certificate_absent: 'vertical_specific',
  time_commitment_unclear: 'vertical_specific',
  no_sample_content: 'vertical_specific',
  no_case_study_with_metrics: 'vertical_specific',
  methodology_not_explained: 'vertical_specific',
  enterprise_signals_missing: 'vertical_specific',
  contact_form_excessive_fields: 'vertical_specific',
  response_time_not_promised: 'vertical_specific',
  // Cross-domain: Static + LLM correlation findings
  meta_promise_content_mismatch: 'cross_signal',
  pricing_terms_contradictory: 'cross_signal',
  urgency_claim_unverifiable: 'cross_signal',
  value_prop_diluted_by_navigation: 'cross_signal',
  checkout_copy_creates_anxiety: 'cross_signal',
  faq_answers_wrong_questions: 'cross_signal',
  testimonials_feel_fabricated: 'cross_signal',
  // Wave 9: Subdomain discovery × cross-domain findings
  staging_environment_publicly_accessible: 'brand_integrity',
  admin_panel_exposed_to_internet: 'brand_integrity',
  subdomain_brand_visual_fragmentation: 'brand_integrity',
  app_subdomain_disconnected_from_site: 'revenue_integrity',
  whatsapp_channel_disconnected: 'channel_integrity',
  multiple_payment_subdomains_fragmenting_trust: 'revenue_integrity',
  // Static + Playwright cross-domain findings
  form_submit_unreachable_mobile: 'scale_readiness',
  trust_badges_invisible_at_checkout: 'revenue_integrity',
  navigation_traps_commercial_flow: 'revenue_integrity',
  // Wave 18g taxonomy fix — social_proof_loads_too_late was bucketed
  // into scale_readiness (it WAS once a perf finding) but it is really
  // about social proof copy positioning. Moved to copy_alignment so
  // it surfaces alongside other social-proof findings instead of
  // hiding in a perf section the customer rarely looks at.
  social_proof_loads_too_late: 'copy_alignment',
  consent_banner_obscures_first_action: 'revenue_integrity',
  price_hidden_behind_interaction: 'revenue_integrity',
  // ── Wave 9 funnel-moment findings split by nature ─────────────
  //
  // Wave 18g taxonomy fix. The original Wave 9 lumped EVERY funnel-
  // moment finding under funnel_journey because that is where the
  // *inference logic* lives (URL classification + funnel position).
  // But ~half of those findings are conceptually copy issues — value
  // prop quality, headline outcome, feature-benefit writing, urgency
  // language, etc. They were just bucketed by inference origin, not
  // by problem domain.
  //
  // The user-visible consequence was a copy_alignment pack with only
  // 1-2 findings while funnel_journey looked overloaded with what
  // customers perceived as "copy issues". Reassigning the writing-
  // quality inferences to copy_alignment gives both packs a fair
  // mix and makes the cross-signal pack grouping (Wave C) coherent.
  //
  // Kept in funnel_journey: structural/flow problems (navigation,
  // page depth, mobile friction, auth/payment plumbing).
  // Moved to copy_alignment: every inference whose *fix* would be
  // rewriting copy rather than restructuring flow.

  // Copy/writing-quality issues — moved to copy_alignment
  hero_outcome_absent: 'copy_alignment',           // headline writes "what" instead of "outcome"
  cognitive_load_first_screen: 'copy_alignment',   // above-fold message competition
  primary_cta_delayed: 'copy_alignment',           // CTA hierarchy / above-fold structure
  specificity_deficit: 'copy_alignment',           // vague language
  proof_of_work_missing: 'copy_alignment',         // expertise/credibility copy
  feature_benefit_disconnect: 'copy_alignment',    // features-as-benefits writing
  comparison_absent: 'copy_alignment',             // competitive positioning copy
  objection_echo_chamber: 'copy_alignment',        // handling objections in copy
  social_channels_decorative: 'copy_alignment',    // social proof signal quality
  pricing_without_context: 'copy_alignment',       // pricing-page copy / anchor
  guarantee_invisible_at_decision: 'copy_alignment', // guarantee/refund copy at conversion
  urgency_mechanics_absent: 'copy_alignment',      // urgency language
  tone_shift_across_journey: 'copy_alignment',     // voice/tone consistency
  trust_gradient_inverted: 'copy_alignment',       // trust signal placement copy

  // Structural / flow problems — kept in funnel_journey
  navigation_dead_ends: 'funnel_journey',
  page_depth_before_conversion: 'funnel_journey',
  checkout_identity_break: 'funnel_journey',
  payment_options_invisible: 'funnel_journey',
  first_value_path_unclear: 'funnel_journey',
  support_response_expectation_gap: 'funnel_journey',
  billing_transparency_absent: 'funnel_journey',
  upgrade_value_gap: 'funnel_journey',
  referral_path_nonexistent: 'funnel_journey',
  success_story_feedback_loop_broken: 'funnel_journey',
  mobile_journey_friction_compound: 'funnel_journey',

  // ── Wave 20.6 invariant sweep (2026-05-22) ──
  // The check-invariants script caught 15 pack-emitted inference keys
  // that had no INFERENCE_TO_PACK entry. They were falling through to
  // the 'unknown' default in projections/engine.ts:1063, so the
  // findings were generated but had no workspace surface. Mapping
  // each to the pack that emits them, by surface affinity.
  urgency_dark_pattern: 'copy_alignment',          // copy-alignment.ts
  onboarding_copy_weak: 'copy_alignment',          // copy-alignment.ts
  navigation_confusing: 'copy_alignment',          // copy-alignment.ts
  above_fold_cluttered: 'copy_alignment',          // copy-alignment.ts
  subscriber_churn_elevated: 'saas_growth_readiness',  // monetization-extensions.ts, SaaS-only
  failed_payment_rate_high: 'revenue_integrity',   // monetization-extensions.ts, applies to all commerce
  pricing_offer_unclear: 'copy_alignment',         // wave-4-extensions.ts (4.2 LLM copy)
  page_purpose_mismatch: 'copy_alignment',         // wave-4-extensions.ts (4.2 LLM copy)
  structured_data_mismatch: 'discoverability',     // wave-4-extensions.ts (4.2 LLM SEO)
  payment_handoff_dropoff: 'revenue_integrity',    // wave-4-extensions.ts (4.6 neglected)
  saas_activation_gap_heuristic: 'saas_growth_readiness', // wave-4-extensions.ts (4.6 neglected)
  oscillation_clustering: 'revenue_integrity',     // wave-4-extensions.ts (4.6 behavioral cluster)
  network_error_weighted: 'revenue_integrity',     // wave-4-extensions.ts (4.6 commercial errors)
  mobile_trust_gap: 'revenue_integrity',           // wave-4-extensions.ts (4.6 mobile-specific)
  behavioral_micro_pattern_cascade: 'revenue_integrity', // wave-4-extensions.ts (4.6 compound)

  // Wave 23.1 — Email deliverability (DMARC/SPF/DKIM/BIMI). Domain-
  // level findings; the pack reads the single EmailAuthRecord
  // evidence and emits at most one finding per rule per env.
  dmarc_record_absent: 'email_deliverability',
  dmarc_policy_weak: 'email_deliverability',
  spf_record_absent: 'email_deliverability',
  spf_includes_too_broad: 'email_deliverability',
  dkim_selector_missing: 'email_deliverability',
  bimi_unconfigured: 'email_deliverability',
  // ── Wave 24 — competitive_lens ──
  copy_mirror_detected: 'competitive_lens',
  trust_posture_lag: 'competitive_lens',
  // ── Wave 25 — competitive_lens offensive radar ──
  brand_serp_encroachment: 'competitive_lens',
  serp_overlap_detected: 'competitive_lens',
  // ── Wave 26 — competitive_lens surface delta ──
  surface_gap_detected: 'competitive_lens',
  // ── Wave 27 — competitive_lens customer voice ──
  customer_voice_delta: 'competitive_lens',
};

