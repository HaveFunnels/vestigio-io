// ──────────────────────────────────────────────
// Brand Adapter — Types
//
// Brand impersonation is a revenue + fraud intelligence
// concern, NOT a domain scanning product.
//
// Raw domain resolution is INTERNAL. Only commercially
// meaningful impersonation signals reach the customer.
// ──────────────────────────────────────────────

/**
 * Threat classification for a detected lookalike domain.
 */
export type BrandThreatType =
  | 'typosquat'               // edit-distance variation of brand domain
  | 'commercial_keyword'      // brand + commercial suffix (lojabrand, brandatacado)
  | 'tld_variation'           // same name, different TLD
  | 'brand_interception'      // brand keyword in unrelated domain
  | 'phishing_pattern';       // high-similarity content mimicking brand

/**
 * Confidence level for impersonation detection.
 */
export type ImpersonationConfidence = 'high' | 'medium' | 'low';

/**
 * A single detected lookalike domain after analysis.
 */
export interface BrandImpersonationCandidate {
  /** Lookalike domain */
  domain: string;
  /** How it was generated/classified */
  threat_type: BrandThreatType;
  /** Whether the domain resolves (is active) */
  is_active: boolean;
  /** HTTP status code if reachable */
  http_status: number | null;
  /** Domain similarity score (0-100) */
  domain_similarity: number;
  /** Whether brand tokens appear in the domain */
  has_brand_tokens: boolean;
  /** Title similarity score (0-100, null if not fetched) */
  title_similarity: number | null;
  /** Whether the domain appears to have commerce intent */
  has_commerce_signals: boolean;
  /** Whether favicon matches or is similar (null if not checked) */
  favicon_match: boolean | null;
  /** Overall confidence */
  confidence: ImpersonationConfidence;
  /** Overall confidence score (0-100) */
  confidence_score: number;
  /** Business interpretation */
  commercial_interpretation: string;
  // Phase 3E.1: Enhanced scoring signals
  /** Brand keyword density in page content (0-100) */
  brand_keyword_density: number;
  /** Whether URL contains sensitive paths (/login, /checkout, /verify) */
  has_sensitive_path: boolean;
  /** Whether page has credential capture elements (password inputs, login forms) */
  has_credential_capture: boolean;
  /** Whether page has payment capture elements (card inputs, payment forms) */
  has_payment_capture: boolean;
  /** Favicon similarity score (0-100, null if not compared) */
  favicon_similarity_score: number | null;
}

/**
 * Configuration for brand impersonation scan.
 */
export interface BrandScanConfig {
  /** Root domain to protect */
  root_domain: string;
  /** Brand tokens to search for */
  brand_tokens: string[];
  /** Maximum candidate domains to check */
  max_candidates: number;
  /** Timeout per DNS resolution (ms) */
  dns_timeout_ms: number;
  /** Rate limit for HTTP checks */
  rate_limit: number;
  /** Minimum similarity score to include in results */
  min_similarity: number;
  /** Whether to perform deep analysis on high-confidence matches */
  deep_analysis: boolean;
}

export const DEFAULT_BRAND_SCAN_CONFIG: Partial<BrandScanConfig> = {
  max_candidates: 200,
  dns_timeout_ms: 3000,
  rate_limit: 10,
  min_similarity: 40,
  deep_analysis: true,
};

/**
 * Result of a brand impersonation scan.
 */
export interface BrandScanResult {
  candidates_generated: number;
  candidates_resolved: number;
  candidates_active: number;
  high_confidence: BrandImpersonationCandidate[];
  medium_confidence: BrandImpersonationCandidate[];
  low_confidence: BrandImpersonationCandidate[];
  duration_ms: number;
  errors: string[];
}
