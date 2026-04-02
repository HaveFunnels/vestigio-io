import { Ref } from '../domain';

// ──────────────────────────────────────────────
// Verification Lifecycle — beyond one-time verification
//
// Verification is not a binary event. It degrades over time,
// must be re-triggered when context changes, and must
// connect to decision confidence evolution.
// ──────────────────────────────────────────────

/**
 * Verification maturity — how verified is this claim over time?
 */
export enum VerificationMaturity {
  Unverified = 'unverified',         // no verification attempted
  PendingVerification = 'pending',   // verification requested but not completed
  PartiallyVerified = 'partially',   // some verification evidence exists
  Verified = 'verified',             // fully verified within freshness window
  DegradedVerification = 'degraded', // was verified, now aging
  StaleVerification = 'stale',       // verification expired, needs re-trigger
}

/**
 * Verification state for a specific decision or evidence claim.
 */
export interface VerificationState {
  subject_ref: Ref;
  decision_ref: Ref | null;
  maturity: VerificationMaturity;
  confidence_at_verification: number;  // confidence when verified
  current_confidence: number;          // degraded confidence now
  verified_at: Date | null;
  expires_at: Date | null;
  degradation_rate: number;            // confidence points lost per day
  re_trigger_reason: string | null;    // why re-verification needed
  verification_count: number;          // how many times verified
  last_verification_ref: Ref | null;
}

/**
 * Configuration for verification freshness windows.
 * Different evidence types have different shelf lives.
 */
export interface VerificationFreshnessConfig {
  evidence_type: string;
  fresh_duration_hours: number;       // how long verification stays fresh
  degradation_start_hours: number;    // when degradation begins
  stale_threshold_hours: number;      // when it becomes stale
  max_confidence_decay: number;       // max confidence loss before re-trigger (0..100)
}

/**
 * Re-trigger evaluation result.
 */
export interface RetriggerEvaluation {
  should_retrigger: boolean;
  reason: string | null;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  recommended_verification_type: string | null;
  current_maturity: VerificationMaturity;
  confidence_gap: number; // how much confidence has been lost
}

/**
 * Verification sufficiency — is the current verification level enough?
 */
export interface VerificationSufficiency {
  is_sufficient: boolean;
  decision_ref: Ref;
  required_maturity: VerificationMaturity;
  actual_maturity: VerificationMaturity;
  confidence_floor: number;     // minimum acceptable confidence
  current_confidence: number;
  gap_analysis: string;         // human-readable explanation
}

/**
 * Default freshness windows per evidence category.
 */
export const DEFAULT_FRESHNESS_CONFIGS: VerificationFreshnessConfig[] = [
  { evidence_type: 'http_response',       fresh_duration_hours: 24,  degradation_start_hours: 12, stale_threshold_hours: 72,  max_confidence_decay: 30 },
  { evidence_type: 'page_content',        fresh_duration_hours: 48,  degradation_start_hours: 24, stale_threshold_hours: 168, max_confidence_decay: 25 },
  { evidence_type: 'policy_page',         fresh_duration_hours: 168, degradation_start_hours: 72, stale_threshold_hours: 720, max_confidence_decay: 15 },
  { evidence_type: 'checkout_indicator',  fresh_duration_hours: 24,  degradation_start_hours: 12, stale_threshold_hours: 72,  max_confidence_decay: 35 },
  { evidence_type: 'provider_indicator',  fresh_duration_hours: 72,  degradation_start_hours: 48, stale_threshold_hours: 168, max_confidence_decay: 20 },
  { evidence_type: 'certificate',         fresh_duration_hours: 720, degradation_start_hours: 336, stale_threshold_hours: 1440, max_confidence_decay: 10 },
  { evidence_type: 'browser_navigation_trace',    fresh_duration_hours: 12,  degradation_start_hours: 6,  stale_threshold_hours: 48, max_confidence_decay: 40 },
  { evidence_type: 'authenticated_page_view',     fresh_duration_hours: 12,  degradation_start_hours: 6,  stale_threshold_hours: 48, max_confidence_decay: 40 },
  { evidence_type: 'authenticated_session_attempt', fresh_duration_hours: 6, degradation_start_hours: 3,  stale_threshold_hours: 24, max_confidence_decay: 50 },
];
