import { Timestamped } from './common';
import { SaasAuthMethod, SaasMfaMode } from './workspace';

// ──────────────────────────────────────────────
// SaaS Access Config
//
// Stores credentials and access requirements for
// authenticated SaaS analysis. Owned by the control
// plane, consumed by the verification layer.
//
// Status state machine:
//   unconfigured → configured → verified
//                            → failed
//                            → awaiting_manual_mfa
//                            → expired
//
// SENSITIVE: password field must be encrypted at rest.
// Access through SecretService abstraction only.
// ──────────────────────────────────────────────

export type SaasAccessStatus =
  | 'unconfigured'
  | 'configured'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'awaiting_manual_mfa';

export interface SaasAccessConfig extends Timestamped {
  id: string;
  environment_id: string;
  login_url: string;
  email: string | null;
  /** SENSITIVE — stored encrypted. Never expose back to UI. */
  password_encrypted: string | null;
  auth_method: SaasAuthMethod;
  mfa_mode: SaasMfaMode;
  has_trial: boolean | null;
  requires_seed_data: boolean | null;
  test_account_available: boolean | null;
  activation_goal: string | null;
  primary_upgrade_path: string | null;
  last_verified_at: Date | null;
  last_failure_reason: string | null;
  status: SaasAccessStatus;
}

export function createDefaultSaasAccessConfig(environmentId: string): SaasAccessConfig {
  const now = new Date();
  return {
    id: `saas_access:${environmentId}`,
    environment_id: environmentId,
    login_url: '',
    email: null,
    password_encrypted: null,
    auth_method: 'unknown',
    mfa_mode: 'unknown',
    has_trial: null,
    requires_seed_data: null,
    test_account_available: null,
    activation_goal: null,
    primary_upgrade_path: null,
    last_verified_at: null,
    last_failure_reason: null,
    status: 'unconfigured',
    created_at: now,
    updated_at: now,
  };
}

/** Safe public view — never leaks password_encrypted */
export interface SaasAccessPublicView {
  id: string;
  environment_id: string;
  login_url: string;
  email: string | null;
  has_password: boolean;
  auth_method: SaasAuthMethod;
  mfa_mode: SaasMfaMode;
  has_trial: boolean | null;
  requires_seed_data: boolean | null;
  test_account_available: boolean | null;
  activation_goal: string | null;
  primary_upgrade_path: string | null;
  last_verified_at: Date | null;
  last_failure_reason: string | null;
  status: SaasAccessStatus;
}

export function toPublicView(config: SaasAccessConfig): SaasAccessPublicView {
  return {
    id: config.id,
    environment_id: config.environment_id,
    login_url: config.login_url,
    email: config.email,
    has_password: config.password_encrypted !== null && config.password_encrypted.length > 0,
    auth_method: config.auth_method,
    mfa_mode: config.mfa_mode,
    has_trial: config.has_trial,
    requires_seed_data: config.requires_seed_data,
    test_account_available: config.test_account_available,
    activation_goal: config.activation_goal,
    primary_upgrade_path: config.primary_upgrade_path,
    last_verified_at: config.last_verified_at,
    last_failure_reason: config.last_failure_reason,
    status: config.status,
  };
}
