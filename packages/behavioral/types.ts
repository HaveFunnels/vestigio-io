// ──────────────────────────────────────────────
// Behavioral Intelligence — Types
//
// Semantic behavioral signals from first-party snippet.
// NOT session replay. NOT raw telemetry.
//
// This module:
// - normalizes URLs into logical surfaces
// - aggregates sessions into behavioral patterns
// - produces evidence for the decision pipeline
// ──────────────────────────────────────────────

// ── Event Types from Snippet ──

export type BehavioralEventType =
  | 'page_view'
  | 'route_change'
  | 'cta_click'
  | 'scroll_depth'
  | 'form_start'
  | 'form_submit'
  | 'form_error'
  | 'support_open'
  | 'policy_open'
  | 'checkout_open'
  | 'backtrack'
  | 'page_leave'
  | 'dead_click'
  | 'heartbeat'
  | 'step_reached'
  | 'order_bump_seen'
  | 'order_bump_accept'
  | 'upsell_seen'
  | 'upsell_accept'
  // Phase 4B hardening: new event types
  | 'confirmation_seen'
  | 'cta_viewed'
  | 'cta_rendered_late'
  | 'hesitation_pause'
  | 'trusted_handoff'
  | 'field_inventory'
  | 'input_focus_abandon'
  | 'form_retry'
  | 'rapid_backtrack';

export interface RawBehavioralEvent {
  type: BehavioralEventType;
  ts: number;
  session_id: string;
  env_id: string;
  url: string;
  data: Record<string, unknown>;
}

export interface RawBehavioralBatch {
  events: RawBehavioralEvent[];
  attribution: AttributionContext;
  session_id: string;
  env_id: string;
}

// ── Attribution ──

export interface AttributionContext {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landing_url: string | null;
  gclid: string | null;
  fbclid: string | null;
}

export interface MultiTouchAttribution {
  first_touch: AttributionContext;
  latest_touch: AttributionContext;
  touch_count: number;
}

// ── Surface Model ──

/**
 * Logical surface — a normalized page/route/step.
 * NOT a raw URL. Represents the business intent of a page.
 */
export interface Surface {
  /** Stable surface identifier (derived from host + normalized path) */
  surface_id: string;
  /** Display label (e.g. "Pricing Page", "Checkout Step 1") */
  label: string;
  /** Normalized path (e.g. /checkout, /pricing) */
  normalized_path: string;
  /** Host domain */
  host: string;
  /** Commercial intent classification */
  page_type: SurfacePageType;
  /** Whether this surface has commercial intent */
  is_commercial: boolean;
  /** Discovery sources that have seen this surface */
  discovered_by: SurfaceDiscoverySource[];
  /** Last time any session visited this surface */
  last_seen_at: Date | null;
  /** Whether the surface is alive (heartbeat within last 24h) */
  is_live: boolean;
  /** Number of unique sessions that visited this surface */
  session_count: number;
  /** Number of findings associated with this surface */
  finding_count: number;
}

export type SurfacePageType =
  | 'homepage'
  | 'landing'
  | 'product'
  | 'category'
  | 'cart'
  | 'checkout'
  | 'pricing'
  | 'support'
  | 'policy'
  | 'account'
  | 'onboarding'
  | 'thank_you'
  | 'blog'
  | 'unknown';

export type SurfaceDiscoverySource =
  | 'static_crawl'
  | 'katana_crawl'
  | 'browser_verification'
  | 'snippet_observed'
  | 'shopify_landing';

/**
 * Surface variant — a variation of the same logical surface.
 */
export interface SurfaceVariant {
  /** Parent surface ID */
  surface_id: string;
  /** Variant identifier */
  variant_id: string;
  /** What makes this a variant (e.g. A/B test, query param) */
  variant_type: 'ab_test' | 'query_param' | 'experiment' | 'utm_decorated' | 'path_variant';
  /** Raw URL that produced this variant */
  raw_url: string;
  /** Session count for this variant */
  session_count: number;
}

// ── Canonical Milestone Taxonomy ──

/**
 * Canonical progression milestones — substrate for inference quality.
 * NOT customer-facing analytics metrics.
 */
export type CanonicalMilestone =
  | 'awareness_seen'
  | 'consideration_started'
  | 'intent_expressed'
  | 'conversion_started'
  | 'conversion_completed'
  | 'post_conversion_seen';

// ── Field Inventory (structural only, no values) ──

export type FieldKind =
  | 'email'
  | 'phone'
  | 'name'
  | 'company'
  | 'address'
  | 'cpf_cnpj_like'
  | 'password'
  | 'coupon'
  | 'card_like'
  | 'freeform_message'
  | 'other';

export interface FieldInventory {
  field_count: number;
  field_kinds: FieldKind[];
  has_sensitive_fields: boolean;
  has_password: boolean;
  has_card_like: boolean;
  has_freeform_message: boolean;
}

// ── Handoff Context ──

export interface HandoffContext {
  target_host: string;
  provider_guess: string | null;
  source_surface_id: string;
  returned: boolean;
  confirmation_after_return: boolean;
}

// ── Surface Pair (for oscillation detection) ──

export interface SurfacePair {
  surface_a: string;
  surface_b: string;
  oscillation_count: number;
  page_type_a: SurfacePageType;
  page_type_b: SurfacePageType;
}

// ── Session Aggregate ──

/**
 * Aggregated session behavioral summary.
 * NOT a raw event log — a compact behavioral interpretation.
 */
export interface SessionAggregate {
  session_id: string;
  env_id: string;
  /** Ordered surfaces visited */
  surface_progression: string[];  // surface_ids in order
  /** Attribution context */
  attribution: MultiTouchAttribution;
  /** Behavioral signals */
  checkout_reached: boolean;
  form_started: boolean;
  form_completed: boolean;
  support_opened: boolean;
  policy_opened: boolean;
  backtrack_count: number;
  dead_click_count: number;
  max_scroll_depth: number;
  /** Duration */
  session_duration_ms: number;
  /** Outcome */
  reached_thank_you: boolean;
  /** Timestamps */
  started_at: Date;
  ended_at: Date;

  // ── Phase 4B Hardening ──

  /** Milestone progression (highest milestone reached) */
  highest_milestone: CanonicalMilestone | null;
  /** Whether confirmation / success was observed */
  confirmation_seen: boolean;
  /** Time from session start to first commercial action (CTA click, checkout, form) */
  time_to_first_commercial_action_ms: number | null;
  /** Time from intent expressed to conversion start */
  time_intent_to_conversion_ms: number | null;
  /** Time from conversion start to confirmation */
  time_conversion_to_confirmation_ms: number | null;

  /** CTA operability */
  cta_viewed_count: number;
  cta_clicked_count: number;
  cta_rendered_late_count: number;

  /** Hesitation / friction patterns */
  hesitation_pause_count: number;
  rapid_backtrack_count: number;
  form_retry_count: number;
  input_focus_abandon_count: number;

  /** Field inventory (structural, no values) */
  field_inventories: FieldInventory[];
  /** Sensitive fields interacted then abandoned */
  sensitive_input_abandon_kinds: FieldKind[];

  /** Handoff continuity */
  handoff_started: boolean;
  handoff_returned: boolean;
  handoff_confirmed: boolean;
  handoff_target_host: string | null;

  /** Surface oscillation pairs detected */
  oscillation_pairs: SurfacePair[];

  /** Policy detour before conversion (policy opened while intent was expressed but before conversion) */
  policy_before_conversion: boolean;
  /** Pricing viewed then backtracked */
  pricing_then_backtrack: boolean;

  /** Journey type classification */
  journey_type: JourneyType | null;
}

export type JourneyType =
  | 'ecommerce'
  | 'lead_gen'
  | 'saas_onboarding'
  | 'support_reassurance'
  | 'checkout_billing'
  | 'informational';

// ── Surface Vitality ──

export interface SurfaceVitality {
  surface_id: string;
  is_live: boolean;
  last_heartbeat_at: Date | null;
  /** Aggregate timing from heartbeat */
  avg_dom_ready_ms: number | null;
  avg_load_ms: number | null;
  js_error_rate: number;  // errors per session
  resource_error_rate: number;
  session_count_24h: number;
}

// ── Funnel Model ──

export interface FunnelStep {
  surface_id: string;
  step_index: number;
  session_count: number;
  drop_off_rate: number;  // % that don't reach next step
  backtrack_rate: number; // % that go backwards
  avg_time_on_step_ms: number;
}

export interface FunnelAnalysis {
  funnel_id: string;
  steps: FunnelStep[];
  total_sessions: number;
  completion_rate: number;
}

// ── Behavioral Cohort Model ──

/**
 * Cohort-level behavioral slice — subset of BehavioralSessionPayload
 * metrics computed for a specific audience segment.
 *
 * Used by pixel-dependent workspaces (First Impression Revenue,
 * Acquisition Integrity, Mobile Revenue Exposure, etc.)
 */
export interface BehavioralCohortSlice {
  session_count: number;
  conversion_rate: number;
  checkout_reached_rate: number;
  avg_time_to_first_commercial_action_ms: number | null;
  avg_time_intent_to_conversion_ms: number | null;
  backtrack_rate: number;
  dead_click_rate: number;
  hesitation_pause_rate: number;
  form_retry_rate: number;
  input_focus_abandon_rate: number;
  cta_viewed_count: number;
  cta_clicked_count: number;
  cta_engagement_rate: number;
  cta_rendered_late_count: number;
  policy_opened_rate: number;
  policy_then_abandon_rate: number;
  support_opened_rate: number;
  sensitive_input_abandon_rate: number;
  sensitive_input_abandon_top_kinds: FieldKind[];
  surface_oscillation_rate: number;
  avg_surface_progression_length: number;
  milestone_awareness_count: number;
  milestone_consideration_count: number;
  milestone_intent_count: number;
  milestone_conversion_start_count: number;
  milestone_conversion_complete_count: number;
  handoff_without_return_rate: number;
  pricing_backtrack_rate: number;
  policy_detour_before_conversion_rate: number;
}

/**
 * Cohort-level behavioral breakdown — computed from SessionAggregate[].
 * Each slice contains the same metrics for a specific audience segment.
 */
export interface BehavioralCohortPayload {
  type: 'behavioral_cohort';
  /** Total sessions used to compute cohorts */
  total_session_count: number;
  cohorts: {
    /** First-time visitors (attribution.touch_count == 1) */
    first_session: BehavioralCohortSlice;
    /** Returning visitors (attribution.touch_count > 1) */
    returning: BehavioralCohortSlice;
    /** Paid traffic (has gclid, fbclid, or utm_campaign) */
    paid_traffic: BehavioralCohortSlice;
    /** Organic traffic (no paid markers) */
    organic_traffic: BehavioralCohortSlice;
    /** Mobile sessions */
    mobile: BehavioralCohortSlice;
    /** Desktop sessions */
    desktop: BehavioralCohortSlice;
  };
}
