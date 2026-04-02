import { BusinessModel } from './enums';
import { Timestamped } from './common';

// ──────────────────────────────────────────────
// Workspace — tenant boundary (control plane owns)
// ──────────────────────────────────────────────

export interface Workspace extends Timestamped {
  id: string;
  name: string;
  tenant_id: string;
  environments: string[]; // environment refs
  business_profile_ref: string | null;
}

// ──────────────────────────────────────────────
// Environment — scoped monitored environment
// ──────────────────────────────────────────────

export interface Environment extends Timestamped {
  id: string;
  workspace_ref: string;
  environment_key: string;
  environment_type: EnvironmentType;
  root_domains: string[];
  path_scopes: string[];
  business_unit: string | null;
  is_customer_facing: boolean;
  is_production: boolean;
}

export type EnvironmentType =
  | 'production'
  | 'staging'
  | 'brand_microsite'
  | 'checkout_subdomain';

// ──────────────────────────────────────────────
// Business Profile — economic/operational profile
// ──────────────────────────────────────────────

export interface BusinessProfile extends Timestamped {
  id: string;
  workspace_ref: string;
  business_model: BusinessModel;
  monthly_revenue_range: RevenueRange | null;
  average_ticket_range: TicketRange | null;
  chargeback_rate_range: PercentageRange | null;
  churn_rate_range: PercentageRange | null;
  traffic_plan_range: TrafficRange | null;
  growth_goal: string | null;
  platform_hints: string[];
  provider_hints: string[];
  conversion_model: ConversionModel | null;
  saas: SaasProfile | null;
}

export type ConversionModel = 'checkout' | 'whatsapp' | 'form' | 'external';

// ──────────────────────────────────────────────
// SaaS-specific profile extensions
// ──────────────────────────────────────────────

export type SaasAuthMethod = 'password' | 'oauth' | 'magic_link' | 'unknown';
export type SaasMfaMode = 'none' | 'optional' | 'required' | 'unknown';

export interface SaasProfile {
  is_saas: boolean;
  app_login_url: string | null;
  auth_method: SaasAuthMethod;
  mfa_mode: SaasMfaMode;
  has_trial: boolean | null;
  activation_goal: string | null;
  primary_upgrade_path: string | null;
  requires_seed_data: boolean | null;
  test_account_available: boolean | null;
}

export interface RevenueRange {
  low: number;
  high: number;
  currency: string;
}

export interface TicketRange {
  low: number;
  high: number;
  currency: string;
}

export interface PercentageRange {
  low: number;
  high: number;
}

export interface TrafficRange {
  low: number;
  high: number;
  unit: 'monthly_sessions' | 'monthly_visitors';
}
