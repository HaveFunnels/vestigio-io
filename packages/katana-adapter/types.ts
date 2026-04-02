// ──────────────────────────────────────────────
// Katana Adapter — Types
//
// Katana is a conditional deep-discovery adapter,
// NOT a second crawler. It runs ONLY when static
// discovery is insufficient for abuse/logic analysis.
//
// Raw Katana outputs are INTERNAL. Only commercially
// classified discoveries enter the evidence pipeline.
// ──────────────────────────────────────────────

/**
 * Commercial discovery families that Katana evidence maps into.
 * These are NOT crawler categories — they are Vestigio's
 * business interpretation of what was discovered.
 */
export type CommercialDiscoveryFamily =
  | 'pricing_control'         // discount, coupon, promo, cart manipulation surfaces
  | 'business_logic_abuse'    // guessable or weakly governed commerce endpoints
  | 'commerce_variant'        // JS-discovered alternate purchase/checkout paths
  | 'support_burden'          // help/FAQ/support routes structurally separated from commerce
  | 'safeguard_bypass';       // alternate actions bypassing intended pricing/trust controls

/**
 * Route intent classification for discovered URLs.
 */
export type RouteIntent =
  | 'cart'
  | 'checkout'
  | 'coupon_discount'
  | 'refund_return'
  | 'billing'
  | 'order_confirmation'
  | 'support_help'
  | 'account_action'
  | 'pricing'
  | 'product'
  | 'unknown';

/**
 * Discovery method — how the URL was found.
 */
export type DiscoveryMethod =
  | 'js_crawl'            // JavaScript-rendered link/route discovered by Katana
  | 'form_action'         // discovered through form action parsing
  | 'api_endpoint'        // discovered API or XHR endpoint
  | 'parameter_variant'   // URL parameter variant of known route
  | 'dynamic_route';      // client-side route pattern (e.g., /checkout/:id)

/**
 * A single Katana-discovered route after commercial classification.
 */
export interface KatanaClassifiedRoute {
  /** Discovered URL */
  url: string;
  /** How it was discovered */
  discovery_method: DiscoveryMethod;
  /** Commercial intent classification */
  route_intent: RouteIntent;
  /** Which commercial discovery family this belongs to */
  discovery_family: CommercialDiscoveryFamily;
  /** Whether this URL was already known from static crawl */
  is_net_new: boolean;
  /** Whether this is on a commercial surface */
  is_commercial_surface: boolean;
  /** Confidence in the classification (0-100) */
  confidence: number;
  /** Business-language interpretation */
  commercial_interpretation: string;
  /** Whether this route appears guessable (predictable pattern) */
  appears_guessable: boolean;
  /** Whether this route has visible safeguards (auth, CSRF, rate limit indicators) */
  has_visible_safeguards: boolean;
}

/**
 * Raw Katana output for a single discovered URL.
 * This is INTERNAL — never exposed to the customer.
 */
export interface KatanaRawResult {
  url: string;
  method: string;        // GET, POST, etc.
  source: string;        // how Katana found it (tag, script, xhr, form, etc.)
  status_code: number;
  content_type: string;
  body_length: number;
  timestamp: Date;
}

/**
 * Katana scan configuration.
 */
export interface KatanaScanConfig {
  /** Target URL to start crawling from */
  target: string;
  /** Maximum depth for JS crawl */
  max_depth: number;
  /** Maximum pages to discover */
  max_pages: number;
  /** Timeout in seconds */
  timeout_seconds: number;
  /** Rate limit (requests per second) */
  rate_limit: number;
  /** Restrict to same host */
  same_host_only: boolean;
  /** Commercial priority patterns — URLs matching these get priority */
  priority_patterns: RegExp[];
}

/**
 * Result of a Katana deep discovery run.
 */
export interface KatanaDiscoveryResult {
  /** All classified routes (only commercially relevant ones) */
  classified_routes: KatanaClassifiedRoute[];
  /** Total URLs discovered before filtering */
  total_discovered: number;
  /** Total URLs after commercial relevance filter */
  total_relevant: number;
  /** Discovery families found */
  families_found: CommercialDiscoveryFamily[];
  /** Duration in ms */
  duration_ms: number;
  /** Errors during scan */
  errors: string[];
}

export const DEFAULT_KATANA_CONFIG: Partial<KatanaScanConfig> = {
  max_depth: 3,
  max_pages: 50,
  timeout_seconds: 60,
  rate_limit: 10,
  same_host_only: true,
};

/**
 * Conditions that justify running Katana.
 * Katana is CONDITIONAL — it does not run on every audit.
 */
export interface KatanaExecutionConditions {
  /** Site is SPA-heavy (high script count, low static content) */
  is_spa_heavy: boolean;
  /** Static discovery found few commercial pages (< 5) */
  low_commercial_discovery: boolean;
  /** Evidence of JS-rendered commercial routes (inline router patterns) */
  has_js_commerce_signals: boolean;
  /** Current discovery is insufficient for abuse/logic analysis */
  insufficient_for_abuse_analysis: boolean;
  /** At least one condition must be true to justify Katana */
  should_run: boolean;
}
