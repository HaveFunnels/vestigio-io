import {
  CollectionMethod,
  EvidenceType,
  FreshnessState,
  SourceKind,
} from './enums';
import { Freshness, Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Evidence — canonical observation entity
// ──────────────────────────────────────────────

export interface Evidence extends Timestamped {
  id: string;
  evidence_key: string;
  evidence_type: EvidenceType;
  subject_ref: string;
  scoping: Scoping;
  cycle_ref: string;
  freshness: Freshness;
  source_kind: SourceKind;
  collection_method: CollectionMethod;
  payload: EvidencePayload;
  quality_score: number; // 0..100
  // Wave 5 Fase 3 — SHA-1 of the source asset (currently only set for
  // HttpResponse evidence, where it's the hash of the normalized HTML
  // body). Null for everything else. Incremental cycles consult this
  // to decide whether to re-parse a page or carry the previous cycle's
  // evidence forward. Optional so existing evidence producers don't break.
  content_hash?: string | null;
}

// Typed payload — never loose JSON as source of truth
export type EvidencePayload =
  | HttpResponsePayload
  | PageContentPayload
  | RedirectPayload
  | ScriptPayload
  | FormPayload
  | LinkPayload
  | IframePayload
  | MetaPayload
  | CertificatePayload
  | PolicyPagePayload
  | CheckoutIndicatorPayload
  | ProviderIndicatorPayload
  | PlatformIndicatorPayload
  | BrowserNavigationTracePayload
  | BrowserCheckoutConfirmationPayload
  | BrowserFailureEventPayload
  | BrowserRedirectChainPayload
  | AuthenticatedSessionAttemptPayload
  | AuthenticationBlockedEventPayload
  | PrerequisiteMissingEventPayload
  | AuthenticatedPageViewPayload
  | ActivationStepObservedPayload
  | EmptyStateObservedPayload
  | UpgradeSurfaceObservedPayload
  | NavigationStructureObservedPayload
  | InlineScriptContentPayload
  | StructuredDataItemPayload
  | TechnologyDetectedPayload
  | MobileVerificationResultPayload
  | ClassifiedRuntimeErrorsPayload
  | NucleiMatchPayload
  | KatanaDiscoveryPayload
  | NetworkAnalysisPayload
  | BrandImpersonationMatchPayload
  | ShopifyStoreMetricsPayload
  | BehavioralSessionPayload
  | SurfaceVitalityPayload
  | ContentEnrichmentPayload
  | CopyElementsPayload
  | OffSiteReconPayload
  | EmailAuthRecordPayload
  | CompetitorPageSnapshotPayload
  | CompetitorDeepSnapshotPayload
  | SerpResultsPayload
  | CustomerVoiceSnapshotPayload;

export interface HttpResponsePayload {
  type: 'http_response';
  url: string;
  status_code: number;
  headers: Record<string, string>;
  response_time_ms: number;
  content_type: string | null;
  content_length: number | null;
}

export interface PageContentPayload {
  type: 'page_content';
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  canonical_url: string | null;
  lang: string | null;
  has_forms: boolean;
  form_count: number;
  script_count: number;
  external_script_count: number;
  internal_link_count: number;
  external_link_count: number;
  // Phase 2C: body word count for content depth assessment
  body_word_count: number;
  // Wave 18a — visible body text excerpt (up to 2000 chars). Stripped of
  // HTML tags + script/style blocks + collapsed whitespace. Sourced from
  // either the raw HTML or, when the page is SPA-detected, from the
  // Playwright-rendered DOM (staged-pipeline.ts re-parses `finalHtml`
  // after Playwright runs).
  //
  // 2000 chars is the safe cap for Postgres + downstream LLM prompts
  // (Haiku 4.5 handles 200K input; 32 pages × 2000 chars + framework
  // spec fits comfortably). Pages with no extractable body text (404,
  // redirects, asset URLs) get null.
  body_text_snippet: string | null;
  // Wave 18a — heading hierarchy in document order. Capped at 50
  // entries. Used by the engine to detect "value proposition buried"
  // (no h1 above the fold), "social proof absent" (no h2 mentions
  // customers), etc.
  headings: Array<{ level: 1 | 2 | 3; text: string }>;
}

export interface RedirectPayload {
  type: 'redirect';
  source_url: string;
  target_url: string;
  status_code: number;
  hop_count: number;
  chain: RedirectHop[];
}

export interface RedirectHop {
  url: string;
  status_code: number;
  host: string;
}

export interface ScriptPayload {
  type: 'script';
  page_url: string;
  src: string;
  host: string;
  is_external: boolean;
  known_provider: string | null;
  integrity?: string | null;
}

export interface FormPayload {
  type: 'form';
  page_url: string;
  action: string;
  method: string;
  target_host: string | null;
  is_external: boolean;
  field_names: string[];
  has_payment_fields: boolean;
  field_types?: Record<string, string>;
}

export interface LinkPayload {
  type: 'link';
  page_url: string;
  href: string;
  text: string | null;
  is_external: boolean;
  target_host: string;
  rel: string | null;
}

export interface IframePayload {
  type: 'iframe';
  page_url: string;
  src: string;
  host: string;
  is_external: boolean;
  known_provider: string | null;
}

export interface MetaPayload {
  type: 'meta';
  page_url: string;
  robots: string | null;
  viewport: string | null;
  og_tags: Record<string, string>;
  structured_data: unknown[];
}

export interface CertificatePayload {
  type: 'certificate';
  host: string;
  issuer: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  is_valid: boolean;
  protocol: string | null;
}

export interface PolicyPagePayload {
  type: 'policy_page';
  url: string;
  policy_type: PolicyType;
  detected: boolean;
  confidence: number;
  word_count: number | null;
  // Phase 2C fix: Rich policy content analysis (null when page not fetched)
  has_return_window: boolean | null;
  has_refund_process: boolean | null;
  has_contact_info: boolean | null;
  has_shipping_info: boolean | null;
  has_cancellation_terms: boolean | null;
  section_count: number | null;
}

export type PolicyType =
  | 'privacy'
  | 'terms'
  | 'refund'
  | 'shipping'
  | 'cookie'
  | 'security';

export interface CheckoutIndicatorPayload {
  type: 'checkout_indicator';
  page_url: string;
  indicator_source: 'link' | 'form' | 'script' | 'iframe' | 'button' | 'data_attribute';
  target_url: string | null;
  target_host: string | null;
  is_external: boolean;
  checkout_mode: string | null;
  confidence: number;
  tokens_matched: string[];
}

export interface ProviderIndicatorPayload {
  type: 'provider_indicator';
  page_url: string;
  provider_name: string;
  detection_source: 'script' | 'iframe' | 'form_action' | 'redirect' | 'data_attribute';
  confidence: number;
  domain_match: string | null;
}

export interface PlatformIndicatorPayload {
  type: 'platform_indicator';
  platform_name: string;
  detection_source: 'html' | 'script' | 'meta' | 'header' | 'url_pattern';
  confidence: number;
  matched_pattern: string;
}

// ──────────────────────────────────────────────
// Browser Verification Evidence Payloads
// ──────────────────────────────────────────────

export interface BrowserNavigationTracePayload {
  type: 'browser_navigation_trace';
  start_url: string;
  final_url: string;
  redirect_chain: string[];
  steps_executed: number;
  steps_succeeded: number;
  duration_ms: number;
  title: string | null;
}

export interface BrowserCheckoutConfirmationPayload {
  type: 'browser_checkout_confirmation';
  checkout_url: string;
  confirmed: boolean;
  method: string;
}

export interface BrowserFailureEventPayload {
  type: 'browser_failure_event';
  url: string;
  failed_steps: { step: string; error: string }[];
  console_errors: string[];
  network_errors: string[];
}

export interface BrowserRedirectChainPayload {
  type: 'browser_redirect_chain';
  chain: string[];
  final_url: string;
  crosses_domain: boolean;
}

// ──────────────────────────────────────────────
// SaaS Authentication Evidence Payloads
// (Phase 17A: types only — no collection yet)
// ──────────────────────────────────────────────

export interface AuthenticatedSessionAttemptPayload {
  type: 'authenticated_session_attempt';
  login_url: string;
  auth_method: string;
  success: boolean;
  failure_reason: string | null;
  duration_ms: number;
}

export interface AuthenticationBlockedEventPayload {
  type: 'authentication_blocked_event';
  login_url: string;
  blocked_reason: string;
  blocker_type: 'mfa' | 'captcha' | 'ip_block' | 'rate_limit' | 'unknown';
}

export interface PrerequisiteMissingEventPayload {
  type: 'prerequisite_missing_event';
  missing_items: string[];
  environment_id: string;
  evaluated_at: Date;
}

// ──────────────────────────────────────────────
// SaaS Intelligence Evidence Payloads
// (from authenticated sessions)
// ──────────────────────────────────────────────

export interface AuthenticatedPageViewPayload {
  type: 'authenticated_page_view';
  url: string;
  title: string | null;
  page_type: string; // dashboard | settings | onboarding | feature | billing | empty_state
  has_empty_state: boolean;
  has_upgrade_cta: boolean;
  has_onboarding_prompt: boolean;
  nav_items_count: number;
}

export interface ActivationStepObservedPayload {
  type: 'activation_step_observed';
  step_url: string;
  step_name: string;
  step_index: number;
  has_clear_cta: boolean;
  has_progress_indicator: boolean;
  estimated_complexity: 'low' | 'medium' | 'high';
}

export interface EmptyStateObservedPayload {
  type: 'empty_state_observed';
  url: string;
  has_guidance: boolean;
  has_cta: boolean;
  has_sample_data_option: boolean;
  context: string; // e.g. "projects list", "dashboard"
}

export interface UpgradeSurfaceObservedPayload {
  type: 'upgrade_surface_observed';
  url: string;
  visibility: 'prominent' | 'subtle' | 'hidden';
  context: string; // where in the app this appears
  has_pricing_info: boolean;
  has_value_proposition: boolean;
}

export interface NavigationStructureObservedPayload {
  type: 'navigation_structure_observed';
  total_nav_items: number;
  depth_levels: number;
  has_search: boolean;
  has_help: boolean;
  primary_sections: string[];
}

// ──────────────────────────────────────────────
// Phase 2: Deepened Collection Payloads
// ──────────────────────────────────────────────

export interface InlineScriptContentPayload {
  type: 'inline_script_content';
  page_url: string;
  /** Detected initializations / patterns found in inline scripts */
  detected_patterns: {
    pattern_name: string;     // e.g. 'gtag_init', 'fbq_init', 'intercom_boot'
    technology_key: string;   // normalized key from technology registry
    snippet: string;          // relevant snippet (max 200 chars)
    confidence: number;
  }[];
  /** Total inline scripts found on this page */
  total_inline_scripts: number;
}

export interface StructuredDataItemPayload {
  type: 'structured_data_item';
  page_url: string;
  /** Schema.org type: Product, Organization, FAQPage, etc. */
  schema_type: string;
  /** Name/title from the structured data */
  name: string | null;
  /** Whether this is a trust-relevant type (Organization, Product, Review) */
  is_trust_signal: boolean;
  /** Whether this is a commerce-relevant type (Product, Offer) */
  is_commerce_signal: boolean;
}

export interface TechnologyDetectedPayload {
  type: 'technology_detected';
  /** Normalized key from technology registry */
  technology_key: string;
  /** Display name */
  display_name: string;
  /** Category: platform, payment_provider, analytics, support_widget, etc. */
  category: string;
  /** Detection confidence */
  confidence: number;
  /** How it was detected */
  detection_source: string;
  /** Page(s) where detected */
  detected_on: string[];
  /** Logo key for frontend rendering */
  logo_key: string | null;
}

// ──────────────────────────────────────────────
// Phase 2B: Mobile & Runtime Evidence Payloads
// ──────────────────────────────────────────────

export interface MobileVerificationResultPayload {
  type: 'mobile_verification_result';
  target_url: string;
  /** Whether the commercial path was reachable on mobile */
  commercial_path_reachable: boolean;
  /** Whether checkout/CTA was found and interactable */
  checkout_reachable: boolean;
  /** Steps that succeeded */
  steps_succeeded: number;
  /** Steps that failed */
  steps_failed: number;
  /** Console errors classified by business impact */
  commercial_errors_count: number;
  /** Whether trust indicators differ from desktop */
  trust_degraded_vs_desktop: boolean;
  /** Duration in ms */
  duration_ms: number;
  /** Final URL after navigation */
  final_url: string;
}

export interface ClassifiedRuntimeErrorsPayload {
  type: 'classified_runtime_errors';
  page_url: string;
  viewport: 'desktop' | 'mobile';
  /** Classified errors by business bucket */
  errors: {
    bucket: string;
    count: number;
    is_commercial_impact: boolean;
    sample_message: string;
  }[];
  /** Total errors with commercial impact */
  total_commercial_errors: number;
  /** Total errors overall */
  total_errors: number;
}

// ──────────────────────────────────────────────
// Phase 3A: Nuclei-Derived Evidence Payload
// ──────────────────────────────────────────────

export interface NucleiMatchPayload {
  type: 'nuclei_match';
  /** Vestigio curated check ID */
  check_id: string;
  /** Commercial downside family */
  downside_family: 'payment_integrity' | 'channel_trust' | 'commerce_continuity' | 'trust_posture' | 'abuse_exposure';
  /** URL or host where the match was found */
  matched_at: string;
  /** Whether this is on a checkout/payment/commercial surface */
  is_commercial_surface: boolean;
  /** Business-language interpretation (NOT scanner jargon) */
  commercial_interpretation: string;
  /** Confidence that this represents real commercial downside (0-100) */
  confidence: number;
  /** Severity weight for impact estimation */
  severity_weight: 'low' | 'medium' | 'high';
  /** Internal technical detail (for evidence ref, not customer display) */
  technical_detail: string;
}

// ──────────────────────────────────────────────
// Phase 3B: Katana Deep Discovery Evidence Payload
// ──────────────────────────────────────────────

export interface KatanaDiscoveryPayload {
  type: 'katana_discovery';
  /** Discovered URL */
  discovered_url: string;
  /** How the URL was found (js_crawl, form_action, api_endpoint, parameter_variant, dynamic_route) */
  discovery_method: string;
  /** Commercial intent classification (cart, checkout, coupon_discount, refund_return, billing, etc.) */
  route_intent: string;
  /** Commercial discovery family (pricing_control, business_logic_abuse, commerce_variant, support_burden, safeguard_bypass) */
  discovery_family: string;
  /** Whether this URL was NOT found by static crawl */
  is_net_new: boolean;
  /** Whether this is on a checkout/payment/commercial surface */
  is_commercial_surface: boolean;
  /** Whether the URL follows a guessable/predictable pattern */
  appears_guessable: boolean;
  /** Whether the URL shows visible safeguards (auth, CSRF, rate limit) */
  has_visible_safeguards: boolean;
  /** Confidence in classification (0-100) */
  confidence: number;
  /** Business-language interpretation (NOT crawler jargon) */
  commercial_interpretation: string;
}

// ──────────────────────────────────────────────
// Phase 2D: Network Analysis Evidence Payload
// ──────────────────────────────────────────────

export interface NetworkAnalysisPayload {
  type: 'network_analysis';
  /** Page URL where network was captured */
  page_url: string;
  /** Viewport mode (desktop or mobile) */
  viewport: 'desktop' | 'mobile';
  /** Whether the page is a commercial surface */
  is_commercial_surface: boolean;
  /** Total requests observed */
  total_requests: number;
  /** Total failed requests */
  total_failed: number;
  /** Total third-party requests */
  total_third_party: number;
  /** Payment-critical request health */
  payment_requests_total: number;
  payment_requests_failed: number;
  payment_avg_duration_ms: number;
  payment_slowest_ms: number;
  /** Measurement-critical request health */
  measurement_requests_total: number;
  measurement_requests_failed: number;
  measurement_avg_duration_ms: number;
  /** Trust/reassurance request health */
  trust_requests_total: number;
  trust_requests_failed: number;
  trust_latest_start_ms: number;
  /** Third-party dependency weight */
  third_party_total_weight_ms: number;
  third_party_failed: number;
  /** Commerce content health */
  commerce_content_failed: number;
  commerce_avg_duration_ms: number;
  /** Timing */
  slowest_critical_request_ms: number;
  /** Classified problems (business-relevant only) */
  problem_count: number;
  payment_failures: number;
  payment_slow: number;
  measurement_failures: number;
  trust_late_loads: number;
  third_party_failures: number;
}

// ──────────────────────────────────────────────
// Phase 3E: Brand Impersonation Evidence Payload
// ──────────────────────────────────────────────

export interface BrandImpersonationMatchPayload {
  type: 'brand_impersonation_match';
  /** Lookalike domain detected */
  lookalike_domain: string;
  /** Threat type classification */
  threat_type: 'typosquat' | 'commercial_keyword' | 'tld_variation' | 'brand_interception' | 'phishing_pattern';
  /** Whether the domain is active/resolving */
  is_active: boolean;
  /** Domain similarity score (0-100) */
  domain_similarity: number;
  /** Whether brand tokens appear in domain name */
  has_brand_tokens: boolean;
  /** Title similarity to root domain (0-100, null if not checked) */
  title_similarity: number | null;
  /** Whether the domain shows commerce intent */
  has_commerce_signals: boolean;
  /** Overall confidence score (0-100) */
  confidence_score: number;
  /** Business-language interpretation */
  commercial_interpretation: string;
  // Phase 3E.1: Enhanced scoring signals
  /** Brand keyword density in page content */
  brand_keyword_density: number;
  /** Whether URL contains sensitive paths (/login, /checkout, /verify) */
  has_sensitive_path: boolean;
  /** Whether page has credential capture elements (password inputs) */
  has_credential_capture: boolean;
  /** Whether page has payment capture elements (card inputs) */
  has_payment_capture: boolean;
  /** Favicon similarity score (0-100, null if not compared) */
  favicon_similarity_score: number | null;
  /**
   * Wave 23 P1.1 — bytes-match favicon. True quando os bytes do favicon
   * do candidato batem exatamente com os do root (clone visual de
   * arquivo idêntico). Null = não verificado.
   */
  favicon_bytes_match?: boolean | null;
}

// ──────────────────────────────────────────────
// Phase 4A: Shopify Store Metrics Evidence Payload
// ──────────────────────────────────────────────

export interface ShopifyStoreMetricsPayload {
  type: 'shopify_store_metrics';
  /** Metrics window (7d, 30d, 90d) */
  window: '7d' | '30d' | '90d';
  /** Revenue summary */
  revenue_total: number;
  revenue_currency: string;
  order_count: number;
  average_order_value: number;
  /** Refund summary */
  refund_count: number;
  refund_amount: number;
  refund_rate: number;
  /** Transaction health */
  transaction_total: number;
  transaction_failed: number;
  transaction_failure_rate: number;
  /** Top landing pages (path → order count) */
  top_landing_pages: { url: string; order_count: number }[];
  /** Top referrers (source → order count) */
  top_referrers: { source: string; order_count: number }[];
  /** When this snapshot was computed */
  computed_at: string;
  // Phase 4A.1: Enhanced aggregates
  /** Order status breakdown */
  cancellation_rate: number;
  pending_order_count: number;
  fulfilled_count: number;
  unfulfilled_count: number;
  /** Discount usage */
  discount_usage_rate: number;
  total_discount_amount: number;
  average_discount_per_order: number;
  /** Payment method concentration */
  top_payment_gateway: string | null;
  payment_concentration_ratio: number;
  payment_method_count: number;
}

// ──────────────────────────────────────────────
// Phase 4B: Behavioral Intelligence Evidence Payloads
// ──────────────────────────────────────────────

export interface BehavioralSessionPayload {
  type: 'behavioral_session';
  /** Aggregated session count in time window */
  session_count: number;
  /** Sessions that reached checkout */
  checkout_reached_count: number;
  checkout_reached_rate: number;
  /** Sessions that completed purchase (reached thank-you) */
  conversion_count: number;
  conversion_rate: number;
  /** Sessions that opened support */
  support_opened_count: number;
  support_opened_rate: number;
  /** Sessions that opened policy pages */
  policy_opened_count: number;
  policy_opened_rate: number;
  /** Sessions with backtracking behavior */
  backtrack_session_count: number;
  backtrack_rate: number;
  /** Dead clicks detected */
  dead_click_session_count: number;
  dead_click_rate: number;
  /** Average session duration */
  avg_session_duration_ms: number;
  /** Sessions where support was opened AFTER checkout was reached (too late) */
  support_after_checkout_count: number;
  /** Sessions with policy view followed by abandonment (no further commercial action) */
  policy_then_abandon_count: number;
  /** Sessions with high-intent detour: checkout → reassurance → abandonment */
  high_intent_detour_count: number;
  /** CTA surfaces with high views but low click-through */
  dead_cta_surface_count: number;
  /** Sessions with repeated retries on the same step before abandoning */
  retry_then_abandon_count: number;
  /** Mobile session metrics */
  mobile_session_count: number;
  mobile_first_action_failure_rate: number;
  /** Funnel step alive but not advancing (high visit count, low next-step rate) */
  stalled_step_count: number;

  // ── Phase 4B Hardening: extended behavioral aggregates ──

  /** Milestone progression */
  milestone_awareness_count: number;
  milestone_consideration_count: number;
  milestone_intent_count: number;
  milestone_conversion_start_count: number;
  milestone_conversion_complete_count: number;
  /** Average time to first commercial action (ms) */
  avg_time_to_first_commercial_action_ms: number | null;
  /** Average time from intent expressed to conversion start (ms) */
  avg_time_intent_to_conversion_ms: number | null;

  /** Confirmation / success evidence */
  confirmation_seen_count: number;
  confirmation_seen_rate: number;

  /** Hesitation near CTA: sessions with hesitation pause before CTA on conversion-proximate surfaces */
  hesitation_before_cta_count: number;
  /** Pricing view then hesitation / backtrack */
  pricing_then_hesitation_count: number;
  pricing_backtrack_count: number;
  /** Policy detour before conversion (policy opened after intent but before conversion) */
  policy_detour_before_conversion_count: number;

  /** CTA operability */
  cta_viewed_count: number;
  cta_clicked_count: number;
  cta_engagement_rate: number;  // clicked / viewed
  cta_rendered_late_count: number;

  /** Form friction */
  form_retry_session_count: number;
  form_retry_rate: number;
  form_excessive_field_count: number;  // forms with >6 fields or sensitive mix

  /** Sensitive input dropoff */
  sensitive_input_abandon_count: number;
  sensitive_input_abandon_top_kinds: string[];  // e.g. ['email', 'phone', 'cpf_cnpj_like']

  /** Surface oscillation (back-and-forth between two surfaces) */
  surface_oscillation_count: number;
  surface_oscillation_top_pairs: Array<{ surface_a: string; surface_b: string; count: number }>;

  /** Conversion final-step retries */
  conversion_retry_count: number;

  /** Checkout immediate abandonment (conversion started, quick abandon, no feedback) */
  checkout_immediate_abandon_count: number;

  /** Handoff continuity */
  handoff_without_return_count: number;
  handoff_without_confirmation_count: number;

  /** Sensitive field dropoff (interaction with sensitive fields → abandonment) */
  sensitive_field_dropoff_count: number;
  sensitive_field_dropoff_top_kinds: string[];

  // ── Wave 7.11: Pixel coverage metadata ──
  /** Page types observed across any session in this window.
   *  Used to gate signals that depend on specific page types being instrumented.
   *  e.g. if 'checkout' is not in this array, checkout_reached_rate=0 is meaningless. */
  pixel_coverage_page_types: string[];
}

export interface SurfaceVitalityPayload {
  type: 'surface_vitality';
  /** Surface identifier */
  surface_id: string;
  /** Normalized path */
  normalized_path: string;
  /** Whether surface is live (heartbeat received within 24h) */
  is_live: boolean;
  /** Last heartbeat timestamp */
  last_heartbeat_at: string | null;
  /** Average DOM ready time (ms) */
  avg_dom_ready_ms: number | null;
  /** Average page load time (ms) */
  avg_load_ms: number | null;
  /** JS error rate per session */
  js_error_rate: number;
  /** Resource error rate per session */
  resource_error_rate: number;
  /** Session count in last 24h */
  session_count_24h: number;
  /** Page type classification */
  page_type: string;
  /** Whether this is a commercial surface */
  is_commercial: boolean;
}

// ──────────────────────────────────────────────
// Wave 3.1: LLM Content Enrichment Evidence Payload
// ──────────────────────────────────────────────

export interface ContentEnrichmentPayload {
  type: 'content_enrichment';
  enrichment_type:
    | 'policy_quality'
    | 'checkout_trust'
    | 'cta_clarity'
    | 'product_page_quality'
    | 'pricing_page_framing'
    | 'ad_message_match'
    // Wave 3.10 Copy Analysis Pack
    | 'homepage_hero'
    | 'social_proof_placement'
    | 'objection_handling'
    | 'urgency_scarcity'
    | 'onboarding_copy'
    | 'error_page_recovery'
    | 'navigation_clarity'
    | 'above_fold_density'
    // Wave 3.10 Fase 3 — High-value enrichments
    | 'cross_page_consistency'
    | 'pricing_psychology'
    // Wave 3.10 Fase 4 — Polish enrichments
    | 'localization_quality'
    | 'micro_copy'
    | 'seo_conversion_tension'
    | 'copy_staleness'
    // Wave 4.2 — LLM enrichment
    | 'page_purpose_validation'
    | 'structured_data_validation'
    // Wave 26 — Competitive Lens: surface inventory
    | 'surface_inventory';
  source_evidence_key: string;
  source_url: string;
  scores: { clarity_score: number; readability_grade: string };
  flags: { ambiguity_flags: string[]; regulatory_gaps: string[] };
  missing_elements: string[];
  /** Flexible results map for type-specific enrichment output */
  results: Record<string, unknown>;
  confidence: number;
  model_used: string;
  cached: boolean;
}

// ──────────────────────────────────────────────
// Wave 3.10: Copy Elements Evidence Payload
//
// Extracted copy/content elements from a page, used by the
// copy-analysis Haiku to evaluate messaging quality, CTA
// clarity, trust-signal density, and funnel-stage alignment.
// Produced by the regex-based copy-elements-extractor (no LLM).
// ──────────────────────────────────────────────

export interface CopyElementsPayload {
  type: 'copy_elements';
  url: string;
  page_type: string;   // homepage, landing_page, pricing, product, checkout, etc.
  funnel_stage: string; // awareness, consideration, decision, retention

  // Extracted elements
  h1: string | null;
  subheadline: string | null;
  cta_texts: string[];            // All button/link CTAs found
  primary_cta: string | null;     // Best guess at primary CTA
  social_proof_elements: string[]; // Testimonials, logos, metrics found
  trust_signals: string[];         // Security badges, guarantees, certifications
  urgency_indicators: string[];    // Timers, stock counts, "limited" language
  above_fold_text: string;         // First ~500 chars of visible content
  navigation_labels: string[];     // Top-level menu items
  body_text: string;               // Full body text (up to 2000 chars)

  // Metadata
  word_count: number;
  cta_count: number;
  has_form: boolean;
  has_pricing_table: boolean;
  has_faq: boolean;
}

// ──────────────────────────────────────────────
// Wave 12 — Brand Echo (Off-Site Reconnaissance)
//
// Signals collected from OUTSIDE the customer's domain. One evidence
// entry per source per cycle. The `source` field discriminates
// downstream — inferences read the relevant slice and ignore the rest.
//
// Cost discipline: every source must be zero-cost (DDG HTML scrape,
// public APIs, HEAD checks). No paid APIs, no free-tier with limits
// that scale per-customer.
// ──────────────────────────────────────────────

export type OffSiteReconSource =
  // Industry listings — simple presence checks (HTTP HEAD)
  | 'industry_listing_g2'
  | 'industry_listing_capterra'
  | 'industry_listing_producthunt'
  | 'industry_listing_wikipedia'
  // Off-site discoverability — SERP scraping (DuckDuckGo HTML)
  | 'serp_branded_search'
  | 'serp_category_intent'
  // Off-site reputation — review platforms + forums
  | 'reputation_trustpilot'
  | 'reputation_reclame_aqui'
  | 'reputation_hackernews'
  | 'reputation_reddit'
  // Wave 13 — AI Visibility audit. These probe whether AI assistants
  // (ChatGPT, Perplexity, Google AI Overviews, Claude) can find, parse,
  // and recommend the brand.
  | 'ai_bot_access'              // robots.txt: are GPTBot/ClaudeBot/PerplexityBot allowed?
  | 'ai_machine_readable'        // /llms.txt + /pricing.md / pricing.txt presence + content
  | 'ai_schema_audit'            // JSON-LD coverage (Organization, Product, FAQ, HowTo, Article)
  | 'ai_wikipedia_depth'         // Wikipedia article length, last-edit, link density
  | 'ai_comparison_ownership';   // does the brand own "<brand> vs <competitor>" queries?

export interface OffSiteReconPayload {
  type: 'off_site_recon';
  source: OffSiteReconSource;
  /** Brand token used to query (e.g. "havefunnels"). */
  brand_token: string;
  /** True when the source was reachable and parsed; false when fetch
   *  failed or response was unexpected. Inferences gate on this. */
  reachable: boolean;
  /** Whatever the recon source returned, in a normalized shape.
   *  Inferences read specific keys per source. Stays loose-typed
   *  (Record<string, unknown>) on purpose — schemas evolve per
   *  source and we don't want a payload union explosion. */
  data: Record<string, unknown>;
  /** The URL we fetched (for evidence audit trail). */
  fetched_url: string;
  /** Error category when reachable=false. */
  error_kind?: 'timeout' | 'http_error' | 'parse_error' | 'rate_limited' | 'auth_missing' | 'unknown';
}

/**
 * Wave 23.1 — Email authentication record.
 *
 * One evidence row per env per cycle, carrying the env's DMARC / SPF
 * / DKIM / BIMI DNS records (raw TXT strings + parsed structure).
 * Drives the email_deliverability inference pack. Findings are
 * domain-level (not URL-bound) — the pack reads this single record
 * and emits at most one finding per rule per env.
 *
 * Collected by workers/ingestion/enrichment/email-deliverability.ts
 * via node:dns/promises. Best-effort: DNS timeouts mark the affected
 * record as `lookup_failed=true` rather than emitting a partial
 * finding (the pack treats lookup_failed as "we couldn't check" and
 * suppresses the rule that depends on it).
 */
export interface EmailAuthRecordPayload {
  type: 'email_auth_record';
  /** Apex domain queried (e.g. 'havefunnels.com'). DMARC selector is
   *  always `_dmarc.<apex>`; BIMI is `default._bimi.<apex>`. */
  apex_domain: string;
  /** DMARC record at `_dmarc.<apex>`. */
  dmarc: {
    found: boolean;
    /** Raw TXT record value (the v=DMARC1 line). */
    raw: string | null;
    /** Parsed policy: 'none' | 'quarantine' | 'reject'. Null when
     *  no DMARC record or when the `p=` tag is missing/invalid. */
    policy: 'none' | 'quarantine' | 'reject' | null;
    /** Aggregate reporting URI (`rua=`) — used to confirm whether
     *  the owner is actually monitoring DMARC reports. */
    rua: string | null;
    /** Subdomain policy (`sp=`). Falls back to `policy` per RFC. */
    subdomain_policy: 'none' | 'quarantine' | 'reject' | null;
    /** Whether the DNS lookup itself failed (timeout, NXDOMAIN
     *  for the _dmarc selector). Distinct from `found=false` which
     *  means "we got a response but no DMARC record." */
    lookup_failed: boolean;
  };
  /** SPF record on the apex domain. */
  spf: {
    found: boolean;
    raw: string | null;
    /** Number of `include:` mechanisms — SPF has a 10-lookup limit. */
    include_count: number;
    /** Whether the record terminates with `+all` (permissive — any
     *  sender can spoof) or `~all` / `-all` (restrictive). */
    all_qualifier: '+' | '-' | '~' | '?' | null;
    lookup_failed: boolean;
  };
  /** DKIM selectors probed. We try a handful of common defaults
   *  (default, google, selector1, selector2, k1, k2, mail) and
   *  report whichever resolved. A `found_selectors.length > 0`
   *  means at least one selector returned a v=DKIM1 record. */
  dkim: {
    probed_selectors: string[];
    found_selectors: string[];
    /** Raw DKIM TXT values per found selector, keyed by selector. */
    raw_by_selector: Record<string, string>;
    lookup_failed: boolean;
  };
  /** BIMI record at `default._bimi.<apex>`. Brand logo visibility
   *  in Gmail / Yahoo / Apple Mail. */
  bimi: {
    found: boolean;
    raw: string | null;
    /** The `l=` (logo URL) tag value if present. */
    logo_url: string | null;
    /** The `a=` (VMC URL) tag value if present — VMC is the paid
     *  Verified Mark Certificate that unlocks BIMI in Gmail. */
    vmc_url: string | null;
    lookup_failed: boolean;
  };
}

// ──────────────────────────────────────────────
// CompetitorPageSnapshotPayload — Wave 24
//
// One row per (env, competitor_domain, cycle). Captured by the
// competitor-fetch enrichment pass: HTTP GET of the competitor's
// homepage + structural parse + lightweight DNS lookup for trust
// posture comparison.
//
// "Lightweight" by design — we do NOT run nuclei, katana, or any
// authenticated path against competitor sites; this is a polite
// observation pass equivalent to opening their homepage in a
// browser. ~2-3s per competitor; caps at 10 competitors per cycle.
// ──────────────────────────────────────────────
export interface CompetitorPageSnapshotPayload {
  type: 'competitor_page_snapshot';
  /** Apex (lowercase, no scheme). Matches CompetitorDomain.domain. */
  competitor_domain: string;
  /** The URL actually fetched (canonical home page). */
  url_fetched: string;
  /** True if the home-page fetch failed entirely (DNS, timeout,
   *  non-2xx). When true, all other fields are nullish and the
   *  signal extractor skips this snapshot. */
  fetch_failed: boolean;
  fetch_error: string | null;
  http_status: number | null;
  /** Page content — used for copy fingerprint comparison. */
  title: string | null;
  h1: string | null;
  meta_description: string | null;
  /** First ~500 chars of visible body text (above-fold approximation). */
  hero_text: string | null;
  /** Up to 2000 chars of visible body text, HTML/scripts stripped. */
  body_text_snippet: string | null;
  /** Heading hierarchy, capped at 30 entries. */
  headings: Array<{ level: 1 | 2 | 3; text: string }>;
  /** Visible CTA button/link texts, capped at 20 entries. */
  cta_texts: string[];
  /** Trust mini-snapshot — derived from response headers + DNS. We
   *  don't ship full security_headers_score for competitors (would
   *  require headless render); these flags are header-presence only. */
  trust_snapshot: {
    https_redirect: boolean;
    hsts_present: boolean;
    csp_present: boolean;
    x_frame_options_present: boolean;
    x_content_type_options_present: boolean;
    referrer_policy_present: boolean;
    permissions_policy_present: boolean;
    /** 0-100 — composite of the 6 flags above, 100/6 each. */
    headers_score: number;
    /** DMARC presence + policy strength. */
    dmarc_present: boolean;
    dmarc_policy: 'none' | 'quarantine' | 'reject' | null;
    spf_present: boolean;
  };
  fetched_at: string;
}

// ──────────────────────────────────────────────
// SerpResultsPayload — Wave 25
//
// One row per (env, cycle, query) capturing organic search results
// from the env's locale-appropriate SERP provider (Tavily Search).
// Drives competitive_lens "offensive radar" rules:
//
//   - brand_serp_encroachment — competitor ranks top-5 organic when
//     someone searches for YOUR brand name
//   - serp_overlap_detected   — competitor co-occurs with you in
//     top-10 for ≥2 category-keyword queries
//
// Auto-discovery side effect: domains seen in SERP top-5 across
// multiple queries (and not already curated) are promoted to
// CompetitorDomain rows with discoveryMethod='auto', active=false.
// ──────────────────────────────────────────────
export interface SerpResultsPayload {
  type: 'serp_results';
  /** Provider name — 'tavily' as of Wave 25. */
  provider: string;
  /** Query as sent to the provider. */
  query: string;
  /** Locale string (BCP-47-ish). Drives Tavily's country mapping. */
  locale: string;
  /** Query intent classification — 'brand' when this is a search for
   *  the env's own brand name, 'category' for industry/keyword
   *  searches, 'competitor' (future) for searches comparing peers. */
  query_intent: 'brand' | 'category' | 'competitor';
  /** True when the provider classifies the query as navigational
   *  (the user typed a brand to reach it, not to explore). */
  is_navigational: boolean;
  /** Organic results, 1-indexed by rank. Capped at 20. */
  results: Array<{
    rank: number;
    url: string;
    /** Host with leading "www." stripped, lowercase. */
    host: string;
    title: string;
    snippet: string;
    is_paid: boolean;
  }>;
  /** Related queries the provider suggested — keyword expansion seeds. */
  related: string[];
  total_results: number;
  fetched_at: string;
  /** Whether this row was served from cache vs a live API call.
   *  Diagnostic only; downstream consumers ignore it. */
  from_cache: boolean;
}

// ──────────────────────────────────────────────
// CustomerVoiceSnapshotPayload — Wave 27
//
// One row per (env, source_label, cycle, platform). source_label is
// 'self' for the env's own brand or 'competitor:<domain>' for each
// curated peer the customer-voice enricher inspected.
//
// Wave 27 ships Reclame Aqui only — the BR consumer complaint
// platform. Future waves can add Trustpilot, G2, etc by emitting
// additional rows with different `platform` values; the signal
// extractor aggregates across platforms when present.
//
// Data is sourced via DDG `site:reclameaqui.com.br "<brand>"`
// because Reclame Aqui is a Cloudflare-protected React SPA with no
// public API. DDG SERP snippets carry the rendered reputation badge
// + index in the title/snippet text. Less rich than direct scraping
// would be, but stable and zero-marginal-cost vs maintaining auth'd
// scrapers.
// ──────────────────────────────────────────────
export interface CustomerVoiceSnapshotPayload {
  type: 'customer_voice_snapshot';
  /** 'self' or 'competitor:<apex>'. Matches the enricher's source labeling. */
  source_label: string;
  /** Brand token sent to the platform (derived from domain first-label). */
  brand_token: string;
  /** Platform identifier. Wave 27: 'reclame_aqui' only. */
  platform: 'reclame_aqui';
  /** True when the platform was reachable AND a brand profile was
   *  found. False when DDG returned nothing or no /empresa/ page hit. */
  listed: boolean;
  /** Canonical company page URL when listed=true, else null. */
  company_page_url: string | null;
  /** Reclame Aqui reputation badge: 'RA1000' | 'Ótimo' | 'Bom' |
   *  'Regular' | 'Ruim' | 'Não recomendada' | 'Sem reputação' | null. */
  reputation_label: string | null;
  /** Normalized resolution index on a 0–10 scale (Reclame Aqui's
   *  "Índice de Solução"). Null when not detected in the snippet. */
  resolution_index: number | null;
  /** Total complaint count when detectable in the snippet. Null
   *  when the snippet doesn't carry it explicitly. */
  complaints_total: number | null;
  /** Up to 300 chars of the DDG snippet text — preserved for
   *  audit + LLM topic synthesis in future waves. */
  snippet_excerpt: string | null;
  /** Reason when listed=false (e.g. 'no_reclame_aqui_profile_in_serp',
   *  'http_error'). Used for diagnostics + suppressing false-negatives. */
  unlisted_reason: string | null;
  fetched_at: string;
  /** URL we actually fetched (DDG SERP URL). For audit trail. */
  fetched_url: string;
}

// ──────────────────────────────────────────────
// Wave 23 P0.2/P1.2 — CompetitorDeepSnapshotPayload
//
// Snapshot dos sinais "profundos" de um concorrente que NÃO vivem
// na homepage: pricing tiers + content velocity (blog post count +
// data mais recente). Drive de sinais como "concorrente subiu preço"
// ou "concorrente acelerou publicação 3x" que o CompetitorPageSnapshot
// (homepage-only) não pega.
// ──────────────────────────────────────────────

export interface CompetitorDeepSnapshotPayload {
  type: 'competitor_deep_snapshot';
  competitor_domain: string;

  // ── Pricing ──
  /** URL da pricing page detectada (null se nenhum path comum bateu). */
  pricing_url: string | null;
  pricing_fetch_failed: boolean;
  pricing_error: string | null;
  /** Tiers detectados (regex sobre money + heading proximity). */
  pricing_tiers: Array<{
    label: string | null;       // "Free", "Pro", "Enterprise", "Starter"
    amount: number | null;      // valor numérico (ex: 49)
    currency: string | null;    // "USD" | "BRL" | "EUR" | etc
    interval: 'month' | 'year' | 'one_time' | null;
    amount_raw: string;         // string original ex: "$49/mo" pra audit
  }>;
  /** True quando "free", "grátis", "$0/mo" detectado entre os tiers. */
  has_free_tier: boolean;
  /** Total de tiers distintos. */
  tier_count: number;

  // ── Content velocity ──
  /** URL da blog index detectada (null se nenhum path bateu). */
  blog_url: string | null;
  blog_fetch_failed: boolean;
  blog_error: string | null;
  /** Aproximação do número de posts no índice (count de <article>,
   *  links matching post-URL pattern). Null = não conseguiu inferir. */
  blog_post_count: number | null;
  /** Data ISO do post mais recente extraído via meta/article (best effort). */
  blog_latest_post_date: string | null;

  fetched_at: string;
}
