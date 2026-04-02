// ──────────────────────────────────────────────
// Technology Registry — Types
//
// Normalized technology identification for the entire system.
// Used by: evidence, signals, projections, frontend.
//
// A technology is any recognizable platform, provider, tool,
// or service detected on a site. Detection is supporting
// context for decisions — not a finding by itself.
// ──────────────────────────────────────────────

export type TechnologyCategory =
  | 'platform'           // Shopify, WordPress, WooCommerce, Magento, Wix, Squarespace
  | 'payment_provider'   // Stripe, PayPal, Mercado Pago, Adyen, Square, Braintree
  | 'analytics'          // Google Analytics, PostHog, Mixpanel, Amplitude, Heap, Segment
  | 'tag_manager'        // GTM, Tealium, Segment (dual-role)
  | 'support_widget'     // Intercom, Drift, Zendesk, Crisp, Tidio, LiveChat, Freshdesk, tawk.to
  | 'consent_manager'    // OneTrust, Cookiebot, Quantcast Choice, Didomi
  | 'error_tracking'     // Sentry, Bugsnag, Datadog RUM, LogRocket
  | 'ab_testing'         // Optimizely, VWO, LaunchDarkly, Google Optimize
  | 'cdn'                // Cloudflare, Fastly, Akamai, CloudFront
  | 'email_marketing'    // Mailchimp, Klaviyo, HubSpot
  | 'other';

export interface TechnologyDefinition {
  /** Normalized key — lowercase, no spaces, no special chars. e.g. 'google_analytics' */
  key: string;
  /** Display name. e.g. 'Google Analytics' */
  display_name: string;
  /** Category for grouping in UI */
  category: TechnologyCategory;
  /** Optional website URL for the technology */
  website: string | null;
  /**
   * Logo filename (without path or extension).
   * Frontend resolves to: /logos/technologies/{logo_key}.svg (or .png)
   * If null, frontend should render a text fallback.
   */
  logo_key: string | null;
  /** Detection patterns — scripts, iframes, HTML patterns, inline script patterns */
  detection: TechnologyDetectionPattern[];
}

export interface TechnologyDetectionPattern {
  /** What to match against */
  source: 'script_src' | 'iframe_src' | 'html_content' | 'inline_script' | 'meta_tag' | 'header';
  /** Regex pattern */
  pattern: RegExp;
  /** Confidence when this pattern matches (0-100) */
  confidence: number;
}

/**
 * A detected technology instance — produced by collection, consumed by projections/frontend.
 */
export interface DetectedTechnology {
  /** Normalized key from TechnologyDefinition */
  key: string;
  /** Display name */
  display_name: string;
  /** Category */
  category: TechnologyCategory;
  /** Detection confidence (0-100) */
  confidence: number;
  /** Where it was detected */
  detection_source: string;
  /** Logo key for frontend rendering */
  logo_key: string | null;
  /** Page URL(s) where detected */
  detected_on: string[];
}

/**
 * Technology stack summary — projected for frontend rendering.
 * This is the data contract the frontend uses to render the "Technology Stack" card.
 */
export interface TechnologyStackProjection {
  /** All detected technologies, grouped by category */
  technologies: DetectedTechnology[];
  /** Technologies grouped by category for UI rendering */
  by_category: Record<TechnologyCategory, DetectedTechnology[]>;
  /** Total count */
  total_detected: number;
  /** Summary for workspace/overview cards */
  summary: {
    has_analytics: boolean;
    has_tag_manager: boolean;
    has_support_widget: boolean;
    has_consent_manager: boolean;
    has_error_tracking: boolean;
    payment_providers: string[];
    platforms: string[];
  };
}
