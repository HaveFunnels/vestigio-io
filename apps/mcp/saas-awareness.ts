import {
  BusinessProfile,
  SaasAccessConfig,
  SaasAccessStatus,
  BusinessModel,
  FreshnessState,
  VerificationType,
} from '../../packages/domain';
import {
  evaluateSaasPrerequisites,
  isSaasEnvironment,
  formatPrerequisiteSummary,
  SaasPrerequisiteState,
} from '../platform/saas-prerequisites';
import { McpAnswer, McpSuggestions } from './types';
import type { AuthOutcome } from '../../workers/verification/authenticated-runtime';

// ──────────────────────────────────────────────
// MCP SaaS Awareness
//
// When a SaaS target is detected, MCP must:
// - ask for missing prerequisites
// - guide user to complete setup
// - NOT trigger verification if blocked
//
// This module provides:
// - SaaS detection check
// - Prerequisite-aware answer composition
// - Structured checklists for UI
// - Verification gating
// ──────────────────────────────────────────────

export interface SaasSetupChecklist {
  is_saas: boolean;
  prerequisite_state: SaasPrerequisiteState | null;
  can_run_authenticated_verification: boolean;
  setup_summary: string;
  checklist_items: SaasChecklistItem[];
}

export interface SaasChecklistItem {
  key: string;
  label: string;
  completed: boolean;
  blocking: boolean;
}

/**
 * Build a complete SaaS setup checklist for the MCP layer.
 */
export function buildSaasChecklist(
  businessProfile: BusinessProfile | null,
  accessConfig: SaasAccessConfig | null,
): SaasSetupChecklist {
  if (!isSaasEnvironment(businessProfile)) {
    return {
      is_saas: false,
      prerequisite_state: null,
      can_run_authenticated_verification: false,
      setup_summary: 'Not a SaaS target. Standard analysis applies.',
      checklist_items: [],
    };
  }

  const state = evaluateSaasPrerequisites(accessConfig, businessProfile);
  const items = buildChecklistItems(businessProfile, accessConfig, state);

  return {
    is_saas: true,
    prerequisite_state: state,
    can_run_authenticated_verification: state.status === 'ready',
    setup_summary: formatPrerequisiteSummary(state),
    checklist_items: items,
  };
}

/**
 * Compose an MCP answer when SaaS setup is incomplete.
 * Returns null if not SaaS or if ready (caller should use normal answers).
 */
export function composeSaasSetupAnswer(
  businessProfile: BusinessProfile | null,
  accessConfig: SaasAccessConfig | null,
): McpAnswer | null {
  if (!isSaasEnvironment(businessProfile)) return null;

  const state = evaluateSaasPrerequisites(accessConfig, businessProfile);
  if (state.status === 'ready') return null;

  const summary = formatPrerequisiteSummary(state);
  const isBlocked = state.status === 'blocked';

  const directAnswer = isBlocked
    ? 'I understand your SaaS application, but I cannot analyze it yet because critical setup is missing.'
    : 'Your SaaS application is partially configured. Some items need attention before full analysis.';

  const why = state.next_actions.map(a => `Missing: ${a}`);
  if (state.warnings.length > 0) {
    why.push(...state.warnings.map(w => `Warning: ${w}`));
  }

  return {
    direct_answer: directAnswer,
    confidence: 0,
    freshness: FreshnessState.Unknown,
    staleness_reason: null,
    why,
    recommended_next_step: state.next_actions[0] || 'Complete SaaS setup in Settings.',
    supporting_refs: [],
    optional_verification: null,
    impact_summary: null,
    navigation: {
      related_findings: [],
      related_actions: [],
      related_workspace: null,
      suggested_map: null,
      suggestions: ['Go to Settings → Data Sources to complete setup'],
    },
    suggestions: buildSaasSetupSuggestions(state),
    contextual_focus: null,
  };
}

/**
 * Gate check: can an authenticated verification be requested?
 */
export function canRequestAuthenticatedVerification(
  businessProfile: BusinessProfile | null,
  accessConfig: SaasAccessConfig | null,
): { allowed: boolean; reason: string } {
  if (!isSaasEnvironment(businessProfile)) {
    return { allowed: false, reason: 'Target is not a SaaS application.' };
  }

  const state = evaluateSaasPrerequisites(accessConfig, businessProfile);
  if (state.status === 'blocked') {
    return {
      allowed: false,
      reason: `SaaS prerequisites not met: ${state.missing_items.join(', ')}`,
    };
  }
  if (state.status === 'partial') {
    return {
      allowed: false,
      reason: `SaaS setup incomplete. Missing: ${state.missing_items.join(', ')}`,
    };
  }
  return { allowed: true, reason: 'SaaS prerequisites satisfied.' };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function buildSaasSetupSuggestions(state: SaasPrerequisiteState): McpSuggestions {
  const questions: string[] = [
    'What do I need to set up for SaaS analysis?',
    'How do I configure test account access?',
  ];

  if (state.missing_items.includes('mfa_required')) {
    questions.push('How can I handle MFA for automated analysis?');
  }

  if (state.missing_items.includes('seed_data_required')) {
    questions.push('What seed data does my test account need?');
  }

  return {
    questions,
    actions: state.next_actions.slice(0, 3),
    navigation: {
      open_workspace: undefined,
      open_map: undefined,
      open_analysis: false,
      open_actions: false,
    },
  };
}

const BLOCKER_KEYS = new Set([
  'missing_login_url',
  'missing_credentials',
  'mfa_required',
  'access_failed',
  'not_saas',
]);

function buildChecklistItems(
  profile: BusinessProfile | null,
  config: SaasAccessConfig | null,
  state: SaasPrerequisiteState,
): SaasChecklistItem[] {
  const saas = profile?.saas;
  const items: SaasChecklistItem[] = [];

  items.push({
    key: 'saas_profile',
    label: 'SaaS profile configured',
    completed: !!saas?.is_saas,
    blocking: true,
  });

  items.push({
    key: 'login_url',
    label: 'Login URL provided',
    completed: !!(saas?.app_login_url || config?.login_url),
    blocking: true,
  });

  items.push({
    key: 'auth_method',
    label: 'Authentication method specified',
    completed: !!saas && saas.auth_method !== 'unknown',
    blocking: false,
  });

  items.push({
    key: 'credentials',
    label: 'Test account credentials configured',
    completed: !!(config?.email && config?.password_encrypted),
    blocking: true,
  });

  items.push({
    key: 'mfa_check',
    label: 'MFA not required (or bypass configured)',
    completed: !!saas && saas.mfa_mode !== 'required',
    blocking: true,
  });

  items.push({
    key: 'test_account',
    label: 'Test account confirmed available',
    completed: saas?.test_account_available === true,
    blocking: false,
  });

  items.push({
    key: 'activation_goal',
    label: 'Activation goal defined',
    completed: !!saas?.activation_goal,
    blocking: false,
  });

  items.push({
    key: 'seed_data',
    label: 'Seed data not required (or provided)',
    completed: saas?.requires_seed_data !== true,
    blocking: false,
  });

  items.push({
    key: 'access_verified',
    label: 'Access verified successfully',
    completed: config?.status === 'verified',
    blocking: false,
  });

  return items;
}

// ──────────────────────────────────────────────
// Runtime-aware answer composition
// ──────────────────────────────────────────────

const OUTCOME_MESSAGES: Record<AuthOutcome, string> = {
  authenticated_success: 'Authenticated analysis completed successfully. Evidence has been collected from your SaaS application.',
  authentication_failed: 'Authentication failed. Please verify your credentials in Settings → Data Sources.',
  awaiting_manual_mfa: 'MFA challenge detected. Please complete the MFA step manually, then retry verification.',
  blocked_by_prerequisite: 'Cannot run authenticated analysis — prerequisites are not met.',
  blocked_by_seed_data: 'Your test account requires seed data before analysis can produce meaningful results.',
  runtime_error: 'A runtime error occurred during authenticated analysis. Please try again.',
};

const OUTCOME_NEXT_STEPS: Record<AuthOutcome, string> = {
  authenticated_success: 'Review authenticated evidence in Analysis.',
  authentication_failed: 'Check credentials in Settings → Data Sources, then retry.',
  awaiting_manual_mfa: 'Complete MFA manually, then request verification again.',
  blocked_by_prerequisite: 'Complete setup in Settings → Data Sources.',
  blocked_by_seed_data: 'Populate seed data in your test account, then retry.',
  runtime_error: 'Check system status and retry. If persistent, contact support.',
};

/**
 * Compose an MCP answer describing an auth runtime outcome.
 */
export function composeAuthOutcomeAnswer(
  outcome: AuthOutcome,
  accessConfig: SaasAccessConfig | null,
): McpAnswer {
  return {
    direct_answer: OUTCOME_MESSAGES[outcome],
    confidence: outcome === 'authenticated_success' ? 80 : 20,
    freshness: outcome === 'authenticated_success' ? FreshnessState.Fresh : FreshnessState.Unknown,
    staleness_reason: null,
    why: [OUTCOME_MESSAGES[outcome]],
    recommended_next_step: OUTCOME_NEXT_STEPS[outcome],
    supporting_refs: [],
    optional_verification: null,
    impact_summary: null,
    navigation: {
      related_findings: [],
      related_actions: [],
      related_workspace: null,
      suggested_map: null,
      suggestions: [
        outcome === 'authenticated_success'
          ? 'View analysis results'
          : 'Go to Settings → Data Sources',
      ],
    },
    suggestions: {
      questions: outcome === 'authenticated_success'
        ? ['What did you find in the authenticated session?', 'Are there onboarding issues?']
        : ['How do I fix this?', 'What is missing?'],
      actions: [OUTCOME_NEXT_STEPS[outcome]],
      navigation: {
        open_analysis: outcome === 'authenticated_success',
      },
    },
    contextual_focus: null,
  };
}

/**
 * Describe the current SaaS access status for MCP display.
 */
export function describeSaasAccessStatus(config: SaasAccessConfig | null): string {
  if (!config) return 'Authenticated analysis is not configured yet. Set it up in Settings → Data Sources.';

  const statusMessages: Record<SaasAccessStatus, string> = {
    unconfigured: 'Authenticated analysis is not configured yet. Set it up in Settings → Data Sources.',
    configured: 'SaaS access is configured but has not been verified yet. Run authenticated verification to validate.',
    verified: `SaaS access is verified and working. Last verified: ${config.last_verified_at?.toISOString() || 'unknown'}.`,
    failed: `SaaS access verification failed: ${config.last_failure_reason || 'unknown reason'}. Fix in Settings → Data Sources.`,
    expired: 'SaaS access verification has expired. Re-run verification to refresh.',
    awaiting_manual_mfa: 'MFA is required before automated analysis can continue. Complete MFA manually, then retry.',
  };

  return statusMessages[config.status] || 'Unknown access status.';
}
