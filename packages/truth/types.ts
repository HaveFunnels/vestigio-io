import { Ref } from '../domain';

// ──────────────────────────────────────────────
// Truth Resolution — source authority & conflict resolution
//
// When multiple sources observe the same subject,
// we need deterministic rules for which source wins,
// how confidence blends, and when contradictions exist.
// ──────────────────────────────────────────────

/**
 * Authority level assigned to each source kind.
 * Higher = more authoritative when sources conflict.
 */
export enum AuthorityLevel {
  Structural = 1,     // static HTML crawl (lowest — sees surface only)
  Heuristic = 2,      // inference from patterns
  RuntimeProbe = 3,   // light HTTP probe (sees real behavior)
  BrowserObserved = 4, // Playwright browser verification
  IntegrationPull = 5, // data from provider APIs (Stripe, etc.)
  Authenticated = 6,  // authenticated session observation (highest)
}

/**
 * Maps SourceKind (from domain) to authority level.
 */
export const SOURCE_AUTHORITY: Record<string, AuthorityLevel> = {
  crawl: AuthorityLevel.Structural,
  http_fetch: AuthorityLevel.Structural,
  pixel: AuthorityLevel.Heuristic,
  heartbeat: AuthorityLevel.Heuristic,
  manual: AuthorityLevel.Heuristic,
  browser_verification: AuthorityLevel.BrowserObserved,
  integration: AuthorityLevel.IntegrationPull,
};

/**
 * A claim is an assertion about a subject from a specific source.
 * Multiple claims about the same attribute may conflict.
 */
export interface TruthClaim {
  claim_key: string;        // what is being claimed (e.g. "checkout.mode")
  value: string;            // the claimed value
  source_authority: AuthorityLevel;
  confidence: number;       // 0..100
  evidence_ref: Ref;
  observed_at: Date;
  freshness_weight: number; // 0..1 — decays with age
}

/**
 * Result of resolving conflicting claims about the same subject.
 */
export interface TruthResolution {
  claim_key: string;
  resolved_value: string;
  resolved_confidence: number;     // 0..100
  resolution_method: ResolutionMethod;
  winning_authority: AuthorityLevel;
  contributing_claims: TruthClaim[];
  contradictions: TruthContradiction[];
  is_contested: boolean;           // true if meaningful disagreement exists
}

export type ResolutionMethod =
  | 'authority_override'    // higher authority wins outright
  | 'confidence_blend'      // similar authority, blend by confidence
  | 'recency_tiebreak'      // same authority + confidence, most recent wins
  | 'unanimous'             // all sources agree
  | 'single_source';        // only one source, no conflict

/**
 * Records a detected contradiction between two claims.
 */
export interface TruthContradiction {
  claim_key: string;
  claim_a: { value: string; authority: AuthorityLevel; confidence: number; evidence_ref: Ref };
  claim_b: { value: string; authority: AuthorityLevel; confidence: number; evidence_ref: Ref };
  severity: 'minor' | 'material' | 'critical';
  resolution_note: string; // e.g. "runtime override structural"
}

/**
 * Aggregate truth state for a subject.
 */
export interface TruthState {
  subject_ref: string;
  resolutions: TruthResolution[];
  total_contradictions: number;
  contested_claims: number;
  overall_truth_confidence: number; // 0..100
  authority_coverage: AuthorityLevel[]; // which levels contributed
}
