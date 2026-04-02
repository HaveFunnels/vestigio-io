import { ClassificationState } from './types';
import type { SaasAccessConfig, SaasProfile } from '../domain';

// ──────────────────────────────────────────────
// Eligibility Engine
//
// Determines what packs, findings, verifications,
// and MCP suggestions are valid for a given context.
//
// GLOBAL RULE: Nothing executes without passing
// through eligibility first.
// ──────────────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean;
  confidence: number; // 0-1
  blockers: string[];
  reasons: string[];
}

// ── SaaS Pack ─────────────────────────────────

export function isSaasPackEligible(
  classification: ClassificationState,
  saasProfile: SaasProfile | null,
): EligibilityResult {
  const blockers: string[] = [];
  const reasons: string[] = [];

  const saasScore = classification.business_model.saas;
  const onboardingSaas = saasProfile?.is_saas === true;

  // Eligible if: saas confidence >= 0.6 OR onboarding explicitly says SaaS
  if (saasScore < 0.6 && !onboardingSaas) {
    blockers.push('SaaS confidence too low and not indicated in onboarding');
  }

  if (saasScore >= 0.6) {
    reasons.push(`SaaS confidence: ${(saasScore * 100).toFixed(0)}%`);
  }
  if (onboardingSaas) {
    reasons.push('Business profile indicates SaaS');
  }

  return {
    eligible: blockers.length === 0,
    confidence: saasScore,
    blockers,
    reasons,
  };
}

// ── Authenticated Verification ────────────────

export function isAuthenticatedVerificationEligible(
  classification: ClassificationState,
  saasProfile: SaasProfile | null,
  accessConfig: SaasAccessConfig | null,
): EligibilityResult {
  const blockers: string[] = [];
  const reasons: string[] = [];

  const loginScore = classification.conversion_surfaces.login;

  if (loginScore < 0.3) {
    blockers.push('Login surface confidence too low');
  }

  if (!saasProfile?.is_saas) {
    blockers.push('Business profile does not indicate SaaS');
  }

  if (!accessConfig) {
    blockers.push('No SaaS access config found');
  } else {
    if (accessConfig.status !== 'configured' && accessConfig.status !== 'verified') {
      blockers.push(`Access config status is '${accessConfig.status}' — must be configured or verified`);
    }
    if (accessConfig.mfa_mode === 'required') {
      blockers.push('MFA is required — automated login blocked');
    }
  }

  if (blockers.length === 0) {
    reasons.push('Login surface detected, SaaS profile configured, access ready');
  }

  return {
    eligible: blockers.length === 0,
    confidence: loginScore,
    blockers,
    reasons,
  };
}

// ── Checkout / Revenue Analysis ───────────────

export function isCheckoutAnalysisEligible(
  classification: ClassificationState,
): EligibilityResult {
  const checkoutScore = classification.conversion_surfaces.checkout;
  const ecommerceScore = classification.business_model.ecommerce;

  const blockers: string[] = [];
  const reasons: string[] = [];

  // Checkout analysis relevant when checkout surface exists
  if (checkoutScore < 0.3 && ecommerceScore < 0.3) {
    blockers.push('No checkout surface or ecommerce signals detected');
  }

  if (checkoutScore >= 0.3) reasons.push(`Checkout surface confidence: ${(checkoutScore * 100).toFixed(0)}%`);
  if (ecommerceScore >= 0.3) reasons.push(`Ecommerce model confidence: ${(ecommerceScore * 100).toFixed(0)}%`);

  return {
    eligible: blockers.length === 0,
    confidence: Math.max(checkoutScore, ecommerceScore),
    blockers,
    reasons,
  };
}

// ── Chargeback Analysis ───────────────────────

export function isChargebackRelevant(
  classification: ClassificationState,
): EligibilityResult {
  const checkoutScore = classification.conversion_surfaces.checkout;
  const ecommerceScore = classification.business_model.ecommerce;

  const blockers: string[] = [];
  const reasons: string[] = [];

  // Chargebacks only relevant for businesses with payment processing
  if (checkoutScore < 0.3 && ecommerceScore < 0.3) {
    blockers.push('No payment processing detected — chargebacks not applicable');
  }

  if (blockers.length === 0) {
    reasons.push('Payment processing detected — chargeback analysis applicable');
  }

  return {
    eligible: blockers.length === 0,
    confidence: Math.max(checkoutScore, ecommerceScore),
    blockers,
    reasons,
  };
}

// ── Pack Eligibility Summary ──────────────────

export interface PackEligibility {
  scale_readiness: EligibilityResult;
  revenue_integrity: EligibilityResult;
  chargeback_resilience: EligibilityResult;
  saas_pack: EligibilityResult;
  authenticated_verification: EligibilityResult;
  channel_integrity: EligibilityResult;
  discoverability: EligibilityResult;
  brand_integrity: EligibilityResult;
}

export function computePackEligibility(
  classification: ClassificationState,
  saasProfile: SaasProfile | null,
  accessConfig: SaasAccessConfig | null,
): PackEligibility {
  return {
    // Scale readiness is always eligible (applicable to all businesses)
    scale_readiness: { eligible: true, confidence: 1, blockers: [], reasons: ['Always applicable'] },
    revenue_integrity: isCheckoutAnalysisEligible(classification),
    chargeback_resilience: isChargebackRelevant(classification),
    saas_pack: isSaasPackEligible(classification, saasProfile),
    authenticated_verification: isAuthenticatedVerificationEligible(classification, saasProfile, accessConfig),
    // Channel integrity is always eligible (all sites have a public channel)
    channel_integrity: { eligible: true, confidence: 1, blockers: [], reasons: ['Always applicable — all sites have a public channel'] },
    // Discoverability is always eligible (all sites need to be found)
    discoverability: { eligible: true, confidence: 1, blockers: [], reasons: ['Always applicable — all sites need discoverability'] },
    // Brand integrity is always eligible (all brands have exposure risk)
    brand_integrity: { eligible: true, confidence: 1, blockers: [], reasons: ['Always applicable — all brands face impersonation risk'] },
  };
}
