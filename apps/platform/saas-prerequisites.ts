import {
  SaasAccessConfig,
  SaasAccessStatus,
  BusinessProfile,
  SaasProfile,
  BusinessModel,
} from '../../packages/domain';

// ──────────────────────────────────────────────
// SaaS Prerequisite Engine
//
// Evaluates whether all requirements are met
// before Vestigio can perform authenticated
// SaaS analysis. Returns structured state with
// missing items, warnings, and guided next actions.
//
// This is a GATE — not an executor.
// It decides IF analysis can proceed, not HOW.
// ──────────────────────────────────────────────

export type SaasPrerequisiteStatus = 'ready' | 'partial' | 'blocked';

export type SaasMissingItem =
  | 'missing_login_url'
  | 'missing_credentials'
  | 'missing_test_account'
  | 'mfa_required'
  | 'seed_data_required'
  | 'missing_activation_goal'
  | 'missing_auth_method'
  | 'access_expired'
  | 'access_failed'
  | 'not_saas';

export interface SaasPrerequisiteState {
  status: SaasPrerequisiteStatus;
  missing_items: SaasMissingItem[];
  warnings: string[];
  next_actions: string[];
}

const MISSING_LABELS: Record<SaasMissingItem, string> = {
  missing_login_url: 'Provide the application login URL',
  missing_credentials: 'Provide test account credentials (email + password)',
  missing_test_account: 'Confirm a test account is available',
  mfa_required: 'MFA is required — automated login is blocked until MFA bypass or TOTP is configured',
  seed_data_required: 'Seed data is required before analysis can produce meaningful results',
  missing_activation_goal: 'Define the activation goal so Vestigio knows what success looks like',
  missing_auth_method: 'Specify the authentication method (password, OAuth, magic link)',
  access_expired: 'Re-verify access — previous verification has expired',
  access_failed: 'Fix access — previous verification attempt failed',
  not_saas: 'Business profile is not marked as SaaS',
};

/** Blockers prevent analysis entirely */
const BLOCKERS = new Set<SaasMissingItem>([
  'missing_login_url',
  'missing_credentials',
  'mfa_required',
  'access_failed',
  'not_saas',
]);

export function evaluateSaasPrerequisites(
  accessConfig: SaasAccessConfig | null,
  businessProfile: BusinessProfile | null,
): SaasPrerequisiteState {
  const missing: SaasMissingItem[] = [];
  const warnings: string[] = [];

  // ── Business profile checks ─────────────────
  const saas = businessProfile?.saas;

  if (!saas || !saas.is_saas) {
    // If business model is SaaS but profile not set, that's a config gap
    if (businessProfile?.business_model === BusinessModel.SaaS) {
      missing.push('not_saas');
      warnings.push('Business model is SaaS but SaaS profile is not configured.');
    } else {
      // Not a SaaS at all — prerequisites don't apply
      return {
        status: 'ready',
        missing_items: [],
        warnings: [],
        next_actions: [],
      };
    }
  }

  // ── SaaS profile completeness ───────────────
  if (saas) {
    if (!saas.app_login_url) {
      missing.push('missing_login_url');
    }

    if (saas.auth_method === 'unknown') {
      missing.push('missing_auth_method');
    }

    if (saas.mfa_mode === 'required') {
      missing.push('mfa_required');
    }

    if (saas.mfa_mode === 'optional') {
      warnings.push('MFA is optional — if enforced for test account, automated login may fail.');
    }

    if (saas.test_account_available === false) {
      missing.push('missing_test_account');
    } else if (saas.test_account_available === null) {
      warnings.push('Test account availability is unknown — confirm before running authenticated analysis.');
    }

    if (saas.requires_seed_data === true) {
      missing.push('seed_data_required');
    }

    if (!saas.activation_goal) {
      missing.push('missing_activation_goal');
      warnings.push('Without an activation goal, Vestigio cannot measure onboarding effectiveness.');
    }
  }

  // ── Access config checks ────────────────────
  if (!accessConfig || accessConfig.status === 'unconfigured') {
    if (!missing.includes('missing_login_url')) {
      // If profile has login URL but no access config, need credentials
      missing.push('missing_credentials');
    }
  } else {
    // Access config exists
    if (!accessConfig.login_url) {
      if (!missing.includes('missing_login_url')) {
        missing.push('missing_login_url');
      }
    }

    if (!accessConfig.email || !accessConfig.password_encrypted) {
      if (!missing.includes('missing_credentials')) {
        missing.push('missing_credentials');
      }
    }

    if (accessConfig.status === 'expired') {
      missing.push('access_expired');
    }

    if (accessConfig.status === 'failed') {
      missing.push('access_failed');
    }
  }

  // ── Compute status ──────────────────────────
  const hasBlockers = missing.some(m => BLOCKERS.has(m));
  const status: SaasPrerequisiteStatus =
    missing.length === 0
      ? 'ready'
      : hasBlockers
        ? 'blocked'
        : 'partial';

  // ── Build next actions ──────────────────────
  const next_actions = missing.map(m => MISSING_LABELS[m]);

  return { status, missing_items: missing, warnings, next_actions };
}

/**
 * Quick check: is this environment a SaaS that needs prerequisites?
 */
export function isSaasEnvironment(businessProfile: BusinessProfile | null): boolean {
  if (!businessProfile) return false;
  if (businessProfile.business_model === BusinessModel.SaaS) return true;
  if (businessProfile.saas?.is_saas) return true;
  return false;
}

/**
 * Human-readable summary for MCP / UI consumption.
 */
export function formatPrerequisiteSummary(state: SaasPrerequisiteState): string {
  if (state.status === 'ready') {
    return 'SaaS access is fully configured. Authenticated analysis can proceed.';
  }

  const lines: string[] = [];
  if (state.status === 'blocked') {
    lines.push('SaaS analysis is BLOCKED. The following must be resolved:');
  } else {
    lines.push('SaaS analysis is partially configured. The following items are missing:');
  }

  for (const action of state.next_actions) {
    lines.push(`  • ${action}`);
  }

  if (state.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of state.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join('\n');
}
