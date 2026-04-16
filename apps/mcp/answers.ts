import {
  FreshnessState,
  DecisionImpact,
  VerificationType,
  makeRef,
} from '../../packages/domain';
import {
  EngineContext,
  getScaleDecision,
  getRevenueDecision,
  getRootCauses,
  getGlobalActions,
  getIntelligence,
  getOverallFreshness,
  getImpactSummary,
  getFindingProjections,
  getActionProjections,
  getProjections,
} from './context';
import {
  McpAnswer,
  McpImpactSummary,
  McpAnswerNavigation,
  McpSuggestions,
  McpContextualFocus,
  McpSessionContext,
  FindingChatContext,
  MultiFindingContext,
  VerificationSuggestion,
} from './types';
import { buildSuggestions, buildFindingChatContext, buildMultiFindingContext, composeFindingAnswer, composeMultiFindingAnswer } from './suggestions';
import { createEmptySession } from './session';
import { planVerification } from './verification';

// ──────────────────────────────────────────────
// Answer Composition Layer
//
// Converts canonical engine outputs into structured
// business-facing MCP answers. This is the cognitive
// response layer behind chat — NOT a chat UI.
//
// Rules:
// - answer-first
// - cite confidence/freshness
// - don't invent missing evidence
// - prefer reuse over execution
// - ALWAYS include suggestions
// ──────────────────────────────────────────────

export function composeScaleReadinessAnswer(ctx: EngineContext, session?: McpSessionContext): McpAnswer {
  const decision = getScaleDecision(ctx);
  const rootCauses = getRootCauses(ctx);
  const freshness = decision.freshness.freshness_state;
  const sess = session || createEmptySession();

  const directAnswer = composeDirectAnswer(decision.decision_key, 'scale');
  const why = composeWhy(decision, rootCauses);
  const nextStep = composeNextStep(decision);
  const verification = suggestVerification(decision, freshness);

  return {
    direct_answer: directAnswer,
    confidence: decision.confidence_score,
    freshness,
    staleness_reason: decision.freshness.staleness_reason,
    why,
    recommended_next_step: nextStep,
    supporting_refs: decision.why.evidence_refs.slice(0, 10),
    optional_verification: verification,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, 'preflight', 'revenue_leakage'),
    suggestions: buildSuggestions(ctx, sess, 'scale'),
    contextual_focus: null,
  };
}

export function composeRevenueIntegrityAnswer(ctx: EngineContext, session?: McpSessionContext): McpAnswer {
  const decision = getRevenueDecision(ctx);
  const rootCauses = getRootCauses(ctx);
  const freshness = decision.freshness.freshness_state;
  const sess = session || createEmptySession();

  const directAnswer = composeDirectAnswer(decision.decision_key, 'revenue');
  const why = composeWhy(decision, rootCauses);
  const nextStep = composeNextStep(decision);
  const verification = suggestVerification(decision, freshness);

  return {
    direct_answer: directAnswer,
    confidence: decision.confidence_score,
    freshness,
    staleness_reason: decision.freshness.staleness_reason,
    why,
    recommended_next_step: nextStep,
    supporting_refs: decision.why.evidence_refs.slice(0, 10),
    optional_verification: verification,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, 'revenue', 'revenue_leakage'),
    suggestions: buildSuggestions(ctx, sess, 'revenue'),
    contextual_focus: null,
  };
}

export function composeRootCauseAnswer(ctx: EngineContext, session?: McpSessionContext): McpAnswer {
  const intel = getIntelligence(ctx);
  const freshness = getOverallFreshness(ctx);
  const sess = session || createEmptySession();

  if (intel.root_causes.length === 0) {
    return {
      direct_answer: 'No significant underlying problems detected.',
      confidence: 60,
      freshness,
      staleness_reason: null,
      why: ['No inferences triggered root cause grouping.'],
      recommended_next_step: 'Continue monitoring. Re-run analysis periodically.',
      supporting_refs: [],
      optional_verification: null,
      impact_summary: buildImpactSummary(ctx),
      navigation: buildNavigation(ctx, null, 'root_cause'),
      suggestions: buildSuggestions(ctx, sess, 'root_cause'),
      contextual_focus: null,
    };
  }

  const topCause = intel.root_causes[0];
  const crossPackCount = intel.summary.cross_pack_issues.length;

  const directAnswer = crossPackCount > 0
    ? `${intel.root_causes.length} underlying problem(s) found. ${crossPackCount} affect both scale readiness and revenue integrity. Most critical: ${topCause.title}.`
    : `${intel.root_causes.length} underlying problem(s) found. Most critical: ${topCause.title}.`;

  return {
    direct_answer: directAnswer,
    confidence: topCause.confidence,
    freshness,
    staleness_reason: null,
    why: intel.summary.underlying_problems,
    recommended_next_step: intel.summary.fix_first[0] || 'Review identified root causes.',
    supporting_refs: topCause.contributing_evidence.slice(0, 10),
    optional_verification: null,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, null, 'root_cause'),
    suggestions: buildSuggestions(ctx, sess, 'root_cause'),
    contextual_focus: null,
  };
}

export function composeFixFirstAnswer(ctx: EngineContext, session?: McpSessionContext): McpAnswer {
  const intel = getIntelligence(ctx);
  const globalActions = intel.global_actions;
  const freshness = getOverallFreshness(ctx);
  const sess = session || createEmptySession();

  if (globalActions.length === 0) {
    return {
      direct_answer: 'No prioritized actions required at this time.',
      confidence: 60,
      freshness,
      staleness_reason: null,
      why: ['No significant issues detected.'],
      recommended_next_step: 'Continue monitoring.',
      supporting_refs: [],
      optional_verification: null,
      impact_summary: buildImpactSummary(ctx),
      navigation: null,
      suggestions: buildSuggestions(ctx, sess, 'fix_first'),
      contextual_focus: null,
    };
  }

  const top = globalActions.filter(a => a.action_type !== 'verification').slice(0, 3);
  const directAnswer = `${top.length} priority action(s). Fix first: ${top[0].title}`;

  return {
    direct_answer: directAnswer,
    confidence: Math.max(...top.map(a => a.confidence)),
    freshness,
    staleness_reason: null,
    why: top.map(a => {
      const prefix = a.cross_pack_impact > 1 ? '[cross-pack] ' : '';
      return `${prefix}P${a.priority}: ${a.title}`;
    }),
    recommended_next_step: top[0].title,
    supporting_refs: [],
    optional_verification: null,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, null, 'revenue_leakage'),
    suggestions: buildSuggestions(ctx, sess, 'fix_first'),
    contextual_focus: null,
  };
}

// ──────────────────────────────────────────────
// Contextual Chat — single finding
// ──────────────────────────────────────────────

export function composeFindingChatAnswer(
  ctx: EngineContext,
  findingId: string,
  session?: McpSessionContext,
): McpAnswer {
  const sess = session || createEmptySession();
  const freshness = getOverallFreshness(ctx);
  const projections = getProjections(ctx);

  const chatCtx = buildFindingChatContext(findingId, projections);
  if (!chatCtx) {
    return {
      direct_answer: `Finding "${findingId}" not found.`,
      confidence: 0,
      freshness,
      staleness_reason: null,
      why: [],
      recommended_next_step: 'Try selecting a different finding.',
      supporting_refs: [],
      optional_verification: null,
      impact_summary: buildImpactSummary(ctx),
      navigation: null,
      suggestions: buildSuggestions(ctx, sess, 'finding'),
      contextual_focus: null,
    };
  }

  const answer = composeFindingAnswer(chatCtx, projections);
  const finding = projections.findings.find(f => f.id === findingId) ?? null;
  const verification = finding ? suggestVerificationFromFinding(finding) : null;

  return {
    direct_answer: answer.direct_answer,
    confidence: finding?.confidence || 0,
    freshness,
    staleness_reason: null,
    why: answer.why,
    recommended_next_step: answer.recommended_next_step,
    supporting_refs: [],
    optional_verification: verification,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, null, 'root_cause'),
    suggestions: buildSuggestions(ctx, sess, 'finding'),
    contextual_focus: { finding: chatCtx },
  };
}

// ──────────────────────────────────────────────
// Contextual Chat — multiple findings
// ──────────────────────────────────────────────

export function composeMultiFindingChatAnswer(
  ctx: EngineContext,
  findingIds: string[],
  session?: McpSessionContext,
): McpAnswer {
  const sess = session || createEmptySession();
  const freshness = getOverallFreshness(ctx);
  const projections = getProjections(ctx);

  const multiCtx = buildMultiFindingContext(findingIds, projections);
  if (!multiCtx || multiCtx.finding_ids.length === 0) {
    return {
      direct_answer: 'No valid findings found for the given IDs.',
      confidence: 0,
      freshness,
      staleness_reason: null,
      why: [],
      recommended_next_step: 'Try selecting different findings.',
      supporting_refs: [],
      optional_verification: null,
      impact_summary: buildImpactSummary(ctx),
      navigation: null,
      suggestions: buildSuggestions(ctx, sess, 'multi_finding'),
      contextual_focus: null,
    };
  }

  const answer = composeMultiFindingAnswer(multiCtx, projections);
  const matchedFindings = projections.findings.filter(f => findingIds.includes(f.id));
  const avgConf = matchedFindings.length > 0
    ? Math.round(matchedFindings.reduce((s, f) => s + f.confidence, 0) / matchedFindings.length)
    : 0;

  // For multi-finding analysis, pick the highest-impact finding as the
  // verification anchor — user "verify all" is ambiguous so we anchor
  // on the biggest-impact one; the UI can expose per-finding verify
  // separately when the user picks a specific card.
  const anchorFinding =
    matchedFindings.sort((a, b) => b.impact.midpoint - a.impact.midpoint)[0] ??
    null;
  const verification = anchorFinding
    ? suggestVerificationFromFinding(anchorFinding)
    : null;

  return {
    direct_answer: answer.direct_answer,
    confidence: avgConf,
    freshness,
    staleness_reason: null,
    why: answer.why,
    recommended_next_step: answer.recommended_next_step,
    supporting_refs: [],
    optional_verification: verification,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, null, 'root_cause'),
    suggestions: buildSuggestions(ctx, sess, 'multi_finding'),
    contextual_focus: { multi_finding: multiCtx },
  };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function buildImpactSummary(ctx: EngineContext): McpImpactSummary | null {
  const s = getImpactSummary(ctx);
  if (s.issue_count === 0) return null;
  return {
    total_monthly_loss_range: s.total_monthly_loss_range,
    total_monthly_loss_mid: s.total_monthly_loss_mid,
    highest_impact_issue: s.highest_impact_issue,
    highest_impact_value: s.highest_impact_value,
    confidence_level: s.average_confidence,
    currency: s.currency,
  };
}

function composeDirectAnswer(decisionKey: string, domain: 'scale' | 'revenue'): string {
  const answers: Record<string, string> = {
    safe_to_scale: 'Yes, it is safe to scale traffic. No significant risks detected.',
    ready_with_risks: 'Traffic can be scaled with caution. Some risks remain but are not blocking.',
    fix_before_scale: 'Not yet. Issues should be fixed before scaling traffic.',
    unsafe_to_scale_traffic: 'No. Scaling traffic is unsafe. Critical issues must be resolved first.',
    revenue_integrity_stable: 'Revenue integrity is stable. No significant leakage detected.',
    revenue_path_fragile: 'Revenue path is functional but fragile. Optimization opportunities exist.',
    revenue_at_risk: 'Revenue path has significant issues. Fix before increasing ad spend.',
    revenue_leakage_detected: 'Active revenue leakage detected. Conversion path has critical structural issues.',
  };
  return answers[decisionKey] || `Decision: ${decisionKey}`;
}

function composeWhy(
  decision: import('../../packages/domain').Decision,
  rootCauses: import('../../packages/intelligence').RootCause[],
): string[] {
  const reasons: string[] = [];
  reasons.push(decision.why.summary);
  // Wave 2.4: confidence is no longer narrated. Severity carries the
  // qualitative signal the user needs.
  for (const rc of rootCauses.filter(r => r.severity === 'high' || r.severity === 'critical').slice(0, 3)) {
    reasons.push(`Root cause: ${rc.title} (${rc.severity})`);
  }
  return reasons;
}

function composeNextStep(decision: import('../../packages/domain').Decision): string {
  if (decision.actions.primary) return decision.actions.primary;
  return 'Review findings and monitor for changes.';
}

function buildNavigation(
  ctx: EngineContext,
  workspace: string | null,
  suggestedMap: string | null,
): McpAnswerNavigation {
  const findings = getFindingProjections(ctx);
  const actions = getActionProjections(ctx);

  const suggestions: string[] = [];
  if (findings.length > 0) suggestions.push('View highest impact issues in Analysis');
  if (actions.length > 0) suggestions.push('View prioritized actions');
  if (workspace) suggestions.push(`Inspect ${workspace} workspace`);
  if (suggestedMap === 'revenue_leakage') suggestions.push('Open revenue leakage map');
  if (suggestedMap === 'chargeback_risk') suggestions.push('Open chargeback risk map');
  if (suggestedMap === 'root_cause') suggestions.push('Open root cause map');

  return {
    related_findings: findings.slice(0, 5).map(f => f.id),
    related_actions: actions.slice(0, 5).map(a => a.id),
    related_workspace: workspace,
    suggested_map: suggestedMap,
    suggestions,
  };
}

/**
 * Build a VerificationSuggestion from a finding's verification strategy.
 * Replaces the previous null-always behavior in discuss_finding and
 * analyze_findings — now every finding surfaces a verification plan,
 * even if the plan is "can't be re-verified, here's why".
 *
 * The suggestion's `verification_type` + `reason` + `expected_benefit`
 * are derived from the strategy taxonomy (planVerification above).
 * For strategies that don't dispatch a request (pixel_accumulation,
 * heuristic_recompute, not_verifiable_explain) we still return a
 * VerificationSuggestion — the UI knows to render a non-clickable
 * status chip rather than a Verify button.
 */
function suggestVerificationFromFinding(
  finding: import('../../packages/projections').FindingProjection,
): VerificationSuggestion | null {
  const plan = planVerification(
    finding.verification_strategy,
    finding.verification_notes,
    finding.verification_eta_seconds,
  );
  switch (plan.kind) {
    case 'dispatch':
      return {
        verification_type: plan.verification_type,
        reason:
          finding.verification_notes ||
          `Re-verification for this finding dispatches ${plan.verification_type}.`,
        expected_benefit:
          plan.expected_eta_seconds != null
            ? `Completes in approximately ${plan.expected_eta_seconds}s and returns fresh evidence.`
            : 'Returns fresh evidence for this specific finding.',
      };
    case 'status':
      // No request created, but still surface the explanation so the
      // UI / user sees why verification can't be dispatched.
      return {
        verification_type: VerificationType.ReuseOnly,
        reason: plan.message,
        expected_benefit:
          plan.reason === 'pixel_accumulation'
            ? 'Re-check happens automatically as sessions accumulate.'
            : 'This finding is documented as not re-verifiable from public surfaces.',
      };
    case 'recompute':
      return {
        verification_type: VerificationType.ReuseOnly,
        reason: plan.message,
        expected_benefit: 'Refreshes projection immediately over current evidence.',
      };
    case 'unclassified':
      // Legacy findings whose inference_key isn't yet in the catalog.
      // Return null so the UI falls back to the generic freshness-based
      // suggestion path.
      return null;
  }
}

function suggestVerification(
  decision: import('../../packages/domain').Decision,
  freshness: FreshnessState,
): VerificationSuggestion | null {
  if (freshness === FreshnessState.Stale || freshness === FreshnessState.Expired) {
    return {
      verification_type: VerificationType.LightProbe,
      reason: 'Evidence is stale. A light probe would confirm current state.',
      expected_benefit: 'Refresh freshness and increase confidence.',
    };
  }
  if (decision.confidence_score < 50 && decision.decision_impact !== DecisionImpact.Observe) {
    return {
      verification_type: VerificationType.BrowserVerification,
      reason: 'Confidence is low for a material decision. Browser verification would strengthen the conclusion.',
      expected_benefit: 'Confirm checkout flow behavior and trust handoffs with runtime evidence.',
    };
  }
  return null;
}

// ──────────────────────────────────────────────
// SaaS Growth Readiness Answer
// ──────────────────────────────────────────────

export function composeSaasGrowthAnswer(ctx: EngineContext, session?: McpSessionContext): McpAnswer {
  const freshness = getOverallFreshness(ctx);
  const sess = session || createEmptySession();
  const projections = getProjections(ctx);
  const saasFindings = projections.findings.filter(f => f.pack === 'saas_growth_readiness');

  if (saasFindings.length === 0) {
    return {
      direct_answer: 'No SaaS-specific issues detected. Your application appears healthy from an activation and growth perspective.',
      confidence: 60,
      freshness,
      staleness_reason: null,
      why: ['No SaaS findings triggered by current evidence.'],
      recommended_next_step: 'Run authenticated verification to analyze behind-login-wall experience.',
      supporting_refs: [],
      optional_verification: {
        verification_type: VerificationType.AuthenticatedJourneyVerification,
        reason: 'Authenticated analysis needed to evaluate onboarding, activation, and upgrade paths.',
        expected_benefit: 'Discover hidden SaaS growth blockers with real browser evidence.',
      },
      impact_summary: buildImpactSummary(ctx),
      navigation: buildNavigation(ctx, null, null),
      suggestions: buildSuggestions(ctx, sess, 'saas'),
      contextual_focus: null,
    };
  }

  const topIssues = saasFindings.slice(0, 3);
  const totalImpactMin = saasFindings.reduce((s, f) => s + f.impact.monthly_range.min, 0);
  const totalImpactMax = saasFindings.reduce((s, f) => s + f.impact.monthly_range.max, 0);
  const totalImpactMid = Math.round((totalImpactMin + totalImpactMax) / 2);

  const categories = {
    activation: saasFindings.filter(f => ['activation_blocked', 'activation_friction_high', 'unclear_next_step'].includes(f.inference_key)),
    ux: saasFindings.filter(f => ['empty_state_without_guidance', 'navigation_overcomplex', 'feature_discovery_poor'].includes(f.inference_key)),
    monetization: saasFindings.filter(f => ['upgrade_invisible', 'upgrade_timing_wrong', 'no_expansion_path'].includes(f.inference_key)),
    mismatch: saasFindings.filter(f => f.inference_key === 'landing_app_mismatch'),
  };

  const parts: string[] = [];
  parts.push(`${saasFindings.length} SaaS growth issue(s) found, with estimated impact of $${formatK(totalImpactMid)}/mo.`);
  if (categories.activation.length > 0) parts.push(`Activation: ${categories.activation.length} issue(s) blocking trial-to-paid conversion.`);
  if (categories.ux.length > 0) parts.push(`Product UX: ${categories.ux.length} issue(s) affecting retention.`);
  if (categories.monetization.length > 0) parts.push(`Monetization: ${categories.monetization.length} issue(s) limiting expansion revenue.`);
  if (categories.mismatch.length > 0) parts.push(`Cross-surface: Landing page vs app experience mismatch detected.`);

  return {
    direct_answer: parts.join(' '),
    confidence: Math.round(saasFindings.reduce((s, f) => s + f.confidence, 0) / saasFindings.length),
    freshness,
    staleness_reason: null,
    why: topIssues.map(f => `${f.title}: $${formatK(f.impact.midpoint)}/mo potential impact`),
    recommended_next_step: topIssues[0]?.title || 'Review SaaS findings in Analysis.',
    supporting_refs: [],
    optional_verification: null,
    impact_summary: buildImpactSummary(ctx),
    navigation: buildNavigation(ctx, null, null),
    suggestions: {
      questions: [
        'Why are users not upgrading?',
        'Where is onboarding failing?',
        'What should I fix first to improve activation?',
        'Does my landing page align with the app experience?',
      ],
      actions: topIssues.map(f => f.title),
      navigation: { open_analysis: true },
    },
    contextual_focus: null,
  };
}

function formatK(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(value);
}
