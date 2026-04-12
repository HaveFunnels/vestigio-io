// ──────────────────────────────────────────────
// Trust Surface Strength Score
//
// Composite 0-10 score aggregating positive trust indicators
// across the site. Enriches preflight readiness by surfacing
// how many trust-related checks the site passes vs. fails.
// ──────────────────────────────────────────────

import type { Inference } from '../domain';

export type TrustGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface TrustSurfaceScore {
  score: number;        // 0-10
  max_score: number;    // always 10
  passing_checks: string[];
  failing_checks: string[];
  grade: TrustGrade;
}

/**
 * The 10 trust-related inference keys that map 1:1 to the score.
 * Each key, when ABSENT from the inferences, contributes +1 to the score.
 * The label is the human-readable check name shown in the UI.
 */
const TRUST_CHECKS = [
  { inference_key: 'mixed_content_exposure',               label: 'HTTPS everywhere' },
  { inference_key: 'security_header_weakness',             label: 'Security headers present' },
  { inference_key: 'clickjack_protection_missing',         label: 'Clickjack protection' },
  { inference_key: 'refund_policy_gap',                    label: 'Refund policy quality' },
  { inference_key: 'policy_deficiency',                    label: 'Policy pages quality' },
  { inference_key: 'trust_break_in_checkout',              label: 'Trust language on checkout' },
  { inference_key: 'sensitive_endpoint_exposed',           label: 'No sensitive endpoints exposed' },
  { inference_key: 'redirect_chain_erodes_checkout_trust', label: 'No redirect trust erosion' },
  { inference_key: 'cta_unclear_or_competing',             label: 'CTA clarity' },
  { inference_key: 'cookie_security_lax',                  label: 'Cookie security' },
  { inference_key: 'cors_misconfiguration',                label: 'CORS configuration' },
] as const;

function gradeFromScore(score: number): TrustGrade {
  if (score >= 9) return 'A';
  if (score >= 7) return 'B';
  if (score >= 5) return 'C';
  if (score >= 3) return 'D';
  return 'F';
}

/**
 * Compute the Trust Surface Strength Score from the current set of inferences.
 *
 * Each of the 10 trust checks maps to a negative inference key. If the inference
 * is NOT present (i.e. the issue was not detected), the check passes and earns
 * one point. The total score is the count of passing checks out of 10.
 */
export function computeTrustSurfaceScore(inferences: Inference[]): TrustSurfaceScore {
  const activeKeys = new Set(inferences.map(i => i.inference_key));

  const passing: string[] = [];
  const failing: string[] = [];

  for (const check of TRUST_CHECKS) {
    if (activeKeys.has(check.inference_key)) {
      failing.push(check.label);
    } else {
      passing.push(check.label);
    }
  }

  const score = passing.length;

  return {
    score,
    max_score: 10,
    passing_checks: passing,
    failing_checks: failing,
    grade: gradeFromScore(score),
  };
}
