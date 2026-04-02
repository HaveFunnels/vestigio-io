import { BusinessProfile } from './workspace';
import { BusinessModel } from './enums';
import { Timestamped } from './common';

// ──────────────────────────────────────────────
// Business Profile Lifecycle
//
// Business profile is not static input — it evolves.
// Decisions must be aware of profile freshness and
// outdated profiles must not distort decisions.
//
// Provides: versioning, drift detection, recalibration triggers.
// ──────────────────────────────────────────────

/**
 * A versioned snapshot of the business profile.
 */
export interface BusinessProfileVersion extends Timestamped {
  version: number;
  profile: BusinessProfile;
  source: ProfileSource;
  change_summary: string | null;
}

export type ProfileSource =
  | 'onboarding'          // initial setup
  | 'user_update'         // explicit user edit
  | 'integration_sync'    // pulled from connected service
  | 'system_inference';   // system detected change

/**
 * Result of checking whether the current profile is still valid.
 */
export interface ProfileFreshnessCheck {
  is_fresh: boolean;
  staleness_days: number;
  drift_detected: boolean;
  drift_signals: ProfileDriftSignal[];
  recalibration_needed: boolean;
  recommendation: string;
}

/**
 * A signal that the profile may have drifted from reality.
 */
export interface ProfileDriftSignal {
  field: string;
  declared_value: string;
  observed_indicator: string;
  confidence: number; // 0..100
  source: string;
}

/**
 * Profile freshness thresholds.
 */
export const PROFILE_FRESHNESS_THRESHOLDS = {
  fresh_days: 30,       // profile is considered fresh for 30 days
  mild_days: 60,        // profile becomes mildly stale after 60 days
  stale_days: 90,       // profile becomes stale after 90 days
  critical_days: 180,   // profile must be recalibrated after 180 days
};

/**
 * Evaluate whether the business profile is still fresh and valid.
 */
export function evaluateProfileFreshness(
  profile: BusinessProfile,
  driftSignals: ProfileDriftSignal[],
  now?: Date,
): ProfileFreshnessCheck {
  const currentTime = now || new Date();
  const lastUpdated = profile.updated_at;
  const daysSinceUpdate = Math.floor(
    (currentTime.getTime() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000),
  );

  const isFresh = daysSinceUpdate <= PROFILE_FRESHNESS_THRESHOLDS.fresh_days;
  const isStale = daysSinceUpdate > PROFILE_FRESHNESS_THRESHOLDS.stale_days;
  const isCritical = daysSinceUpdate > PROFILE_FRESHNESS_THRESHOLDS.critical_days;

  // Drift detection: high-confidence signals that contradict declared profile
  const materialDrift = driftSignals.filter(s => s.confidence >= 60);
  const driftDetected = materialDrift.length > 0;

  const recalibrationNeeded = isCritical || (isStale && driftDetected) || materialDrift.length >= 3;

  let recommendation: string;
  if (isCritical) {
    recommendation = 'Business profile is critically outdated. Impact estimates and prioritization may be unreliable. Recalibrate immediately.';
  } else if (recalibrationNeeded) {
    recommendation = `Profile is ${daysSinceUpdate} days old with ${materialDrift.length} drift signal(s). Update recommended before next analysis.`;
  } else if (isStale) {
    recommendation = `Profile is ${daysSinceUpdate} days old. Consider reviewing for accuracy.`;
  } else if (driftDetected) {
    recommendation = `Profile is fresh but ${materialDrift.length} drift signal(s) detected. Verify: ${materialDrift.map(d => d.field).join(', ')}.`;
  } else {
    recommendation = 'Profile is fresh and consistent with observations.';
  }

  return {
    is_fresh: isFresh,
    staleness_days: daysSinceUpdate,
    drift_detected: driftDetected,
    drift_signals: materialDrift,
    recalibration_needed: recalibrationNeeded,
    recommendation,
  };
}

/**
 * Detect drift between declared business profile and observed evidence.
 * Called with signals extracted from latest analysis cycle.
 */
export function detectProfileDrift(
  profile: BusinessProfile,
  observedSignals: { key: string; value: string; confidence: number; source: string }[],
): ProfileDriftSignal[] {
  const driftSignals: ProfileDriftSignal[] = [];

  for (const signal of observedSignals) {
    // Business model drift
    if (signal.key === 'business_model' && signal.value !== profile.business_model) {
      driftSignals.push({
        field: 'business_model',
        declared_value: profile.business_model,
        observed_indicator: signal.value,
        confidence: signal.confidence,
        source: signal.source,
      });
    }

    // Conversion model drift
    if (signal.key === 'conversion_model' && profile.conversion_model && signal.value !== profile.conversion_model) {
      driftSignals.push({
        field: 'conversion_model',
        declared_value: profile.conversion_model,
        observed_indicator: signal.value,
        confidence: signal.confidence,
        source: signal.source,
      });
    }

    // Platform drift
    if (signal.key === 'platform' && profile.platform_hints.length > 0) {
      const declared = profile.platform_hints.map(p => p.toLowerCase());
      if (!declared.some(d => signal.value.toLowerCase().includes(d))) {
        driftSignals.push({
          field: 'platform_hints',
          declared_value: profile.platform_hints.join(', '),
          observed_indicator: signal.value,
          confidence: signal.confidence,
          source: signal.source,
        });
      }
    }

    // Provider drift
    if (signal.key === 'payment_provider' && profile.provider_hints.length > 0) {
      const declared = profile.provider_hints.map(p => p.toLowerCase());
      if (!declared.some(d => signal.value.toLowerCase().includes(d))) {
        driftSignals.push({
          field: 'provider_hints',
          declared_value: profile.provider_hints.join(', '),
          observed_indicator: signal.value,
          confidence: signal.confidence,
          source: signal.source,
        });
      }
    }

    // SaaS-specific drift
    if (profile.saas && signal.key === 'auth_method' && signal.value !== profile.saas.auth_method) {
      driftSignals.push({
        field: 'saas.auth_method',
        declared_value: profile.saas.auth_method,
        observed_indicator: signal.value,
        confidence: signal.confidence,
        source: signal.source,
      });
    }
  }

  return driftSignals;
}

/**
 * Compute confidence penalty for decisions based on profile staleness.
 * Returns a multiplier (0.0 to 1.0) to apply to impact estimates.
 *
 * Graduated bands distinguish 6 staleness levels, each with a drift modifier:
 *   Fresh (≤30d):           1.00 / 0.90 (drift) / 0.80 (heavy drift ≥3 signals)
 *   Mildly stale (31-60d):  0.85 / 0.75 (drift)
 *   Stale (61-90d):         0.75 / 0.65 (drift)
 *   Strongly stale (91-180d): 0.60 / 0.50 (drift)
 *   Critically stale (>180d): 0.50 / 0.40 (drift)
 */
export function profileConfidencePenalty(freshnessCheck: ProfileFreshnessCheck): number {
  const days = freshnessCheck.staleness_days;
  const drift = freshnessCheck.drift_detected;
  const heavyDrift = freshnessCheck.drift_signals.length >= 3;

  // Fresh profile (≤30 days)
  if (freshnessCheck.is_fresh) {
    if (!drift) return 1.0;
    return heavyDrift ? 0.80 : 0.90;
  }

  // Mildly stale (31-60 days)
  if (days <= PROFILE_FRESHNESS_THRESHOLDS.mild_days) {
    return drift ? 0.75 : 0.85;
  }

  // Stale (61-90 days)
  if (days <= PROFILE_FRESHNESS_THRESHOLDS.stale_days) {
    return drift ? 0.65 : 0.75;
  }

  // Strongly stale (91-180 days)
  if (days <= PROFILE_FRESHNESS_THRESHOLDS.critical_days) {
    return drift ? 0.50 : 0.60;
  }

  // Critically stale (>180 days)
  return drift ? 0.40 : 0.50;
}
