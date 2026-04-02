// ──────────────────────────────────────────────
// Nuclei Adapter — Types
//
// Nuclei is a curated evidence source, not a scanner product.
// Every match must be translated into commercial meaning
// before it becomes a customer-facing output.
//
// Raw nuclei results are INTERNAL. Only the commercial
// interpretation surfaces to the customer.
// ──────────────────────────────────────────────

/**
 * Commercial downside families that Nuclei evidence maps into.
 * These are NOT nuclei categories — they are Vestigio's
 * business interpretation of what the exposure means.
 */
export type CommercialDownsideFamily =
  | 'payment_integrity'       // scripts/assets compromising checkout trust
  | 'channel_trust'           // weak public posture on commercial surfaces
  | 'commerce_continuity'     // operational exposure disrupting commerce
  | 'trust_posture'           // visible technical weakness undermining confidence
  | 'abuse_exposure';         // conditions enabling fraud, gaming, or abuse

/**
 * A curated Nuclei check definition.
 * Each check maps a technical detection to a commercial meaning.
 */
export interface CuratedNucleiCheck {
  /** Unique check ID within the Vestigio curated suite */
  check_id: string;
  /** Human-readable name (internal, not customer-facing) */
  name: string;
  /** Which commercial downside family this check supports */
  downside_family: CommercialDownsideFamily;
  /** Nuclei template ID or pattern to run */
  nuclei_template: string;
  /** Whether this affects commercial surfaces specifically */
  commercial_surface_relevant: boolean;
  /** Confidence that a match indicates real commercial downside (0-100) */
  commercial_confidence: number;
  /** Severity weight for business impact (low/medium/high) */
  severity_weight: 'low' | 'medium' | 'high';
  /** What this means commercially (used in reasoning, not as title) */
  commercial_interpretation: string;
}

/**
 * Raw Nuclei execution result for a single match.
 * This is INTERNAL — never exposed to the customer.
 */
export interface NucleiRawMatch {
  template_id: string;
  matched_at: string;   // URL or host
  severity: string;     // nuclei's own severity (info/low/medium/high/critical)
  name: string;
  description: string;
  tags: string[];
  extracted_results: string[];
  timestamp: Date;
}

/**
 * Normalized Nuclei evidence after curation filter + commercial mapping.
 * This is what enters the Vestigio evidence pipeline.
 */
export interface NucleiNormalizedMatch {
  /** Curated check that produced this match */
  check_id: string;
  /** Commercial downside family */
  downside_family: CommercialDownsideFamily;
  /** URL/host where the match was found */
  matched_at: string;
  /** Whether this is on a commercial surface (checkout, pricing, cart, etc.) */
  is_commercial_surface: boolean;
  /** Commercial interpretation (business language, not scanner language) */
  commercial_interpretation: string;
  /** Confidence that this represents real commercial downside (0-100) */
  confidence: number;
  /** Severity weight for impact estimation */
  severity_weight: 'low' | 'medium' | 'high';
  /** Internal technical detail (for evidence ref, not customer display) */
  technical_detail: string;
}

/**
 * Nuclei scan configuration for a target environment.
 */
export interface NucleiScanConfig {
  /** Target domain(s) to scan */
  targets: string[];
  /** Which check families to run */
  families: CommercialDownsideFamily[];
  /** Maximum templates to run (safety limit) */
  max_templates: number;
  /** Timeout per target in seconds */
  timeout_seconds: number;
  /** Rate limit (requests per second) */
  rate_limit: number;
}

export const DEFAULT_SCAN_CONFIG: Partial<NucleiScanConfig> = {
  max_templates: 50,
  timeout_seconds: 120,
  rate_limit: 10,
};
