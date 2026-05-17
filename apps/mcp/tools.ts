import { EngineContext, getFindingProjections, getActionProjections, getWorkspaceProjections, getChangeReport, getMap, getMaps, getProjections } from './context';
import {
  McpToolDefinition,
  McpAnswer,
  WorkspaceSummaryView,
  DecisionExplainabilityView,
  RootCauseSummaryView,
  ActionSummaryView,
  PreflightStatusView,
  RevenueIntegritySummaryView,
  GraphPathSummaryView,
  McpVerificationRequest,
} from './types';
import {
  getWorkspaceSummary,
  getDecisionExplainability,
  getPreflightStatus,
  getRevenueIntegritySummary,
  getRootCausesSummary,
  getPrioritizedActionsSummary,
  getGraphPathSummary,
} from './resources';
import {
  composeScaleReadinessAnswer,
  composeRevenueIntegrityAnswer,
  composePaymentHealthAnswer,
  composeRootCauseAnswer,
  composeFixFirstAnswer,
  composeFindingChatAnswer,
  composeMultiFindingChatAnswer,
} from './answers';
import {
  createVerificationRequest,
  validateVerificationRequest,
} from './verification';
import { VerificationRequest, VerificationType } from '../../packages/domain';
import type { FindingProjection, ActionProjection, WorkspaceProjection, ChangeReportProjection } from '../../packages/projections';
import type { MapDefinition } from '../../packages/maps';
import { buildCustomMap } from '../../packages/maps';
import { searchFindingsSync } from './llm';

// ──────────────────────────────────────────────
// MCP Tool Registry
// ──────────────────────────────────────────────

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'get_workspace_summary',
    description: 'Get a high-level summary of the workspace including all decision packs, root causes, and prioritized actions.',
    input_schema: {},
  },
  {
    name: 'get_decision_explainability',
    description: 'Get detailed explainability for a specific decision pack — why the decision was made, contributing factors, and linked root causes.',
    input_schema: {
      pack_key: {
        type: 'string',
        enum: ['scale_readiness_pack', 'revenue_integrity_pack', 'saas_growth_readiness'],
        description: 'Which decision pack to explain. scale_readiness = traffic scaling. revenue_integrity = leakage/trust. saas_growth_readiness = SaaS-specific.',
      },
    },
  },
  {
    name: 'get_root_causes',
    description: 'Get the underlying root causes that connect problems across decision packs.',
    input_schema: {},
  },
  {
    name: 'get_prioritized_actions',
    description: 'Get globally prioritized actions across all decision packs, deduplicated and ranked by impact.',
    input_schema: {},
  },
  {
    name: 'get_preflight_status',
    description: 'Get the preflight readiness status — blockers, risks, and readiness score for traffic scaling.',
    input_schema: {},
  },
  {
    name: 'get_revenue_integrity_summary',
    description: 'Get the revenue integrity assessment — leakage points, trust issues, measurement gaps, and what to fix first.',
    input_schema: {},
  },
  {
    name: 'get_graph_path_summary',
    description: 'Get a read-only summary of the evidence graph structure — page count, external hosts, providers, redirects.',
    input_schema: {},
  },
  {
    name: 'request_verification',
    description: 'Request additional verification to strengthen confidence in a decision. Creates a verification request — does NOT execute collection directly. Only call when the user explicitly asks to verify, re-check, or collect fresh data.',
    input_schema: {
      verification_type: {
        type: 'string',
        enum: ['reuse_only', 'light_probe', 'browser_verification'],
        description: 'Cost ladder. reuse_only = recompute from existing evidence. light_probe = quick HTTP check. browser_verification = full Playwright run (most expensive).',
      },
      subject_ref: {
        type: 'string',
        description: 'What to verify. Usually a finding id, an inference_key, or a URL/surface ref.',
      },
      reason: {
        type: 'string',
        description: 'One short sentence: why the user wants verification now (e.g. "user shipped fix and asked to re-check").',
      },
      decision_ref: {
        type: 'string',
        nullable: true,
        description: 'Optional: the decision pack id this verification supports (scale_readiness_pack, revenue_integrity_pack).',
      },
    },
  },
  {
    name: 'answer_intent',
    description: 'Answer one of the canonical business questions with a structured McpAnswer (direct answer + confidence + freshness + recommended next step + supporting refs). Preferred over the deprecated answer_can_i_scale / answer_where_losing_money / answer_underlying_cause / answer_fix_first tools — same shape, one tool.',
    input_schema: {
      intent: {
        type: 'string',
        enum: ['can_i_scale', 'where_losing_money', 'payment_health', 'underlying_cause', 'fix_first'],
        description: 'can_i_scale = scale-readiness assessment. where_losing_money = revenue integrity / leakage. payment_health = is payment health (dunning, involuntary churn, MRR risk) creating revenue risk; requires Stripe Connect. underlying_cause = root cause analysis. fix_first = globally prioritized action queue.',
      },
    },
  },
  {
    name: 'get_verification_status',
    description: 'Get the status and result of a verification request — useful after calling request_verification to check if collection has finished and what evidence was gathered.',
    input_schema: {
      request_id: {
        type: 'string',
        description: 'The id returned by a previous request_verification call.',
      },
    },
  },
  {
    name: 'list_verifications',
    description: 'List all verification requests and their statuses.',
    input_schema: {},
  },
  {
    name: 'get_finding_projections',
    description: 'Get findings with quantified financial impact, sorted by impact midpoint descending. Supports optional filters to reduce output size — prefer filters for targeted queries.',
    input_schema: {
      pack: { type: 'string', nullable: true, description: 'Filter by pack (e.g. revenue_integrity, scale_readiness, chargeback_resilience, copy_alignment)' },
      severity: { type: 'string', nullable: true, enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by minimum severity' },
      limit: { type: 'number', nullable: true, description: 'Max findings to return (default: all)' },
    },
  },
  {
    name: 'get_action_projections',
    description: 'Get the global action queue: cross-pack remediation tasks with estimated impact, sorted by impact then confidence then severity. Each action carries a root_cause_key and links to its underlying findings (action_refs). Use when the user asks what to fix, what to prioritize, or what is on the queue.',
    input_schema: {},
  },
  {
    name: 'get_workspace_projections',
    description: 'Get workspace-scoped projections: one entry per workspace (a logical grouping of pages/findings) with an aggregate impact summary and the findings/actions that belong to it. Use when the user wants to compare workspaces or drill into a specific journey/perspective.',
    input_schema: {},
  },
  {
    name: 'get_change_report',
    description: 'Get the cycle-to-cycle change report projection — regressions, improvements, new issues, resolved items, and overall trend.',
    input_schema: {},
  },
  {
    name: 'get_map',
    description: 'Get a causal visualization map definition (nodes + edges) for one of the predefined topologies.',
    input_schema: {
      map_type: {
        type: 'string',
        enum: ['revenue_leakage', 'chargeback_risk', 'root_cause', 'user_journey'],
        description: 'Which map to fetch. revenue_leakage = money exit points. chargeback_risk = dispute drivers. root_cause = shared causes. user_journey = funnel stages.',
      },
    },
  },
  {
    name: 'discuss_finding',
    description: 'Get a focused analysis of one finding plus suggested follow-up prompts. Use when the user pinned a single finding or asked to deep-dive into a specific issue.',
    input_schema: {
      finding_id: {
        type: 'string',
        description: 'The finding id (e.g. "finding_<inference_key>") from get_finding_projections.',
      },
    },
  },
  {
    name: 'analyze_findings',
    description: 'Analyze 2-10 findings together to detect shared root causes, compounding effects, and combined impact. Cross-pack synthesis. Use when the user wants a cohesive story across multiple issues.',
    input_schema: {
      finding_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of finding ids to analyze together (2-10 recommended; more than 10 dilutes synthesis quality).',
      },
    },
  },
  {
    name: 'get_pack',
    description: 'Get a single decision pack composed in one call: findings filtered to that pack + actions whose findings touch the pack + aggregate monthly impact range + severity breakdown. Preferred over filtering get_finding_projections by pack when discussing a specific domain (revenue, chargeback, security_posture, copy_alignment, etc.) — saves 2-3 round-trips.',
    input_schema: {
      pack_key: {
        type: 'string',
        description: 'Pack identifier. Common values: revenue_integrity, scale_readiness, chargeback_resilience, copy_alignment, channel_integrity, discoverability, first_impression, trust_gap, friction_tax, mobile_revenue, payment_health, content_freshness.',
      },
      severity: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low'],
        nullable: true,
        description: 'Optional minimum severity filter on the returned findings.',
      },
    },
  },
  {
    name: 'get_funnel_state',
    description: 'Get the funnel-shaped view of findings: groups every active finding into one of 5 buyer-journey stages (awareness, consideration, decision, conversion, post_purchase), with per-stage impact, severity breakdown, and the top 3 findings driving each stage. Preferred when the user asks "where in my funnel...", "which step is leaking...", or wants a journey overview. Returns unstaged_findings when a finding\'s pack doesn\'t map to any stage.',
    input_schema: {},
  },
  {
    name: 'analyze_copy',
    description: 'Get copy analysis summary. If a URL is provided, returns findings for that specific page. If no URL, returns overall copy health (dimension scores, top issues, grade).',
    input_schema: {
      url: { type: 'string', nullable: true, description: 'Optional URL to get page-specific copy analysis. Omit for overall copy health.' },
    },
  },
  {
    name: 'create_custom_map',
    description: 'Create a custom causal map from a subset of findings. The map shows the selected findings, their root causes, and recommended actions. Appears in the Maps gallery under "Created by you". Use when the user asks to focus on specific findings, create a visualization, or isolate a problem area.',
    input_schema: {
      name: { type: 'string', description: 'Short name for the map (e.g., "Checkout Trust Issues")' },
      description: { type: 'string', description: 'One-sentence description of what the map shows' },
      finding_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of findings to include. Use get_finding_projections first to get IDs.' },
    },
  },
  {
    name: 'search_findings',
    description: 'Search findings by natural language query. Returns semantically similar findings ranked by relevance.',
    input_schema: {
      query: { type: 'string', description: 'Natural language search query' },
    },
  },
  // Wave 7.1
  {
    name: 'get_trend_analysis',
    description: 'Get multi-cycle trend analysis — shows how findings have been evolving over N cycles. Detects patterns like consecutive regressions, sudden spikes, gradual degradation. Ask "how has checkout been trending?" or "what findings are getting worse?"',
    input_schema: {
      lookback_cycles: { type: 'number', description: 'Number of cycles to analyze (3-20, default 10)' },
      filter_pattern: { type: 'string', enum: ['consecutive_regressions', 'gradual_degradation', 'sudden_spike', 'improving', 'oscillating', 'stable'], nullable: true, description: 'Optional: only return findings matching this trend pattern' },
    },
  },
  // Wave 8.3
  {
    name: 'get_content_freshness',
    description: 'Get content freshness analysis — shows which pages have stale content (outdated dates, expired promotions, old social proof) and the revenue impact of content decay. Ask "which pages have stale content?" or "is my content hurting conversions?"',
    input_schema: {},
  },
  // Wave 7.2
  {
    name: 'get_recovery_impact',
    description: 'Get revenue recovery attribution — shows which resolved findings correlate with actual revenue improvements, with confidence scoring. Ask "how much did fixing X actually recover?" or "what is the ROI of our fixes?"',
    input_schema: {
      action_key: { type: 'string', nullable: true, description: 'Optional: filter to a specific action/finding key. Omit for all resolved actions.' },
    },
  },
];

// ──────────────────────────────────────────────
// Tool Results
// ──────────────────────────────────────────────

export interface VerificationStatusView {
  request_id: string;
  type: string;
  subject_ref: string;
  status: string;
  evidence_count: number;
  duration_ms: number | null;
  errors: string[];
  completed_at: Date | null;
}

export type ToolResult =
  | { type: 'workspace_summary'; data: WorkspaceSummaryView }
  | { type: 'decision_explainability'; data: DecisionExplainabilityView | null }
  | { type: 'root_causes'; data: RootCauseSummaryView[] }
  | { type: 'prioritized_actions'; data: ActionSummaryView[] }
  | { type: 'preflight_status'; data: PreflightStatusView }
  | { type: 'revenue_integrity'; data: RevenueIntegritySummaryView }
  | { type: 'graph_path_summary'; data: GraphPathSummaryView }
  | { type: 'verification_request'; data: VerificationRequest }
  | { type: 'verification_status'; data: VerificationStatusView | null }
  | { type: 'verification_list'; data: VerificationStatusView[] }
  | { type: 'answer'; data: McpAnswer }
  | { type: 'finding_projections'; data: FindingProjection[] }
  | { type: 'action_projections'; data: ActionProjection[] }
  | { type: 'workspace_projections'; data: WorkspaceProjection[] }
  | { type: 'change_report'; data: ChangeReportProjection | null }
  | { type: 'map'; data: MapDefinition | null }
  | { type: 'custom_map_created'; data: { mapId: string; name: string; nodeCount: number; edgeCount: number; url: string; mapDefinition: MapDefinition } }
  | { type: 'copy_analysis'; data: CopyAnalysisView }
  | { type: 'verification_skipped'; data: VerificationSkippedView }
  | { type: 'search_findings'; data: SearchFindingsView }
  | { type: 'trend_analysis'; data: TrendAnalysisView }
  | { type: 'recovery_impact'; data: RecoveryImpactView }
  | { type: 'content_freshness'; data: ContentFreshnessView }
  | { type: 'pack_summary'; data: PackSummaryDetailView }
  | { type: 'funnel_state'; data: FunnelStateView }
  | { type: 'error'; data: { message: string } };

export interface FunnelStateView {
  /** Five-stage canonical journey: awareness → consideration → decision → conversion → post_purchase. */
  stages: Array<{
    key: 'awareness' | 'consideration' | 'decision' | 'conversion' | 'post_purchase';
    label: string;
    order: number;
    finding_count: number;
    severity_counts: { critical: number; high: number; medium: number; low: number };
    monthly_impact: {
      min_cents: number;
      max_cents: number;
      midpoint_cents: number;
      currency: string;
    };
    /** Top 3 findings by impact midpoint (descending). */
    top_findings: FindingProjection[];
  }>;
  /** Findings whose pack didn't match any stage (eg. operational packs). */
  unstaged_findings: number;
  total_findings: number;
  total_monthly_impact_midpoint_cents: number;
}

/**
 * Composed view of one decision pack: findings + actions + aggregate
 * impact for a single MCP call. The pack_key is matched case-insensitively
 * against FindingProjection.pack. Actions are joined via action.action_refs
 * that intersect the pack's findings.
 */
export interface PackSummaryDetailView {
  pack_key: string;
  finding_count: number;
  severity_counts: { critical: number; high: number; medium: number; low: number };
  monthly_impact: {
    min_cents: number;
    max_cents: number;
    midpoint_cents: number;
    currency: string;
  };
  findings: FindingProjection[];
  actions: ActionProjection[];
  /** True when no finding matches the requested pack_key. */
  empty: boolean;
}

export interface CopyAnalysisView {
  overall_grade: string;
  overall_score: number;
  pages_analyzed: number;
  dimensions: { id: string; score: number; issue_count: number }[];
  top_issues: { root_cause: string; count: number; worst_severity: string }[];
  strengths: string[];
  page_findings?: { url: string; title: string; severity: string; root_cause: string | null }[];
}

export interface VerificationSkippedView {
  requested_type: string;
  recommended_type: string;
  reasoning: string;
  value_to_cost_ratio: number;
  alternatives: { type: string; cost: number; value: number; trade_off: string }[];
}

export interface SearchFindingsView {
  query: string;
  results: { id: string; type: 'finding' | 'action'; title: string; severity: string; impact_mid: number; pack: string }[];
}

// Wave 8.3
export interface ContentFreshnessView {
  pages_with_stale_content: number;
  worst_staleness_score: number;
  stale_pages: {
    url: string;
    staleness_score: number;
    stale_elements: { type: string; text: string }[];
    page_type: string;
  }[];
  pack_status: string; // healthy | at_risk | critical
  summary: string;
}

// Wave 7.1
export interface TrendAnalysisView {
  lookback_cycles: number;
  workspace_direction: string;
  volatility: number;
  alerts: {
    finding_key: string;
    pattern: string;
    streak_length: number;
    total_delta: number;
    narrative: string;
  }[];
  summary: string;
}

// Wave 7.2
export interface RecoveryImpactView {
  total_recovery_monthly_cents: number;
  data_source: string;
  estimates: {
    finding_key: string;
    confidence: string;
    estimated_impact_cents: number;
    revenue_delta_cents: number | null;
    narrative: string;
  }[];
  summary: string;
}

// ──────────────────────────────────────────────
// Tool Executor — dispatches tool calls
// ──────────────────────────────────────────────

export function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  ctx: EngineContext,
): ToolResult {
  switch (toolName) {
    case 'get_workspace_summary':
      return { type: 'workspace_summary', data: getWorkspaceSummary(ctx) };

    case 'get_decision_explainability': {
      const packKey = params.pack_key as string;
      if (!packKey) return { type: 'error', data: { message: 'pack_key is required' } };
      const view = getDecisionExplainability(ctx, packKey);
      return { type: 'decision_explainability', data: view };
    }

    case 'get_root_causes':
      return { type: 'root_causes', data: getRootCausesSummary(ctx) };

    case 'get_prioritized_actions':
      return { type: 'prioritized_actions', data: getPrioritizedActionsSummary(ctx) };

    case 'get_preflight_status':
      return { type: 'preflight_status', data: getPreflightStatus(ctx) };

    case 'get_revenue_integrity_summary':
      return { type: 'revenue_integrity', data: getRevenueIntegritySummary(ctx) };

    case 'get_graph_path_summary':
      return { type: 'graph_path_summary', data: getGraphPathSummary(ctx) };

    case 'request_verification': {
      const req: McpVerificationRequest = {
        verification_type: params.verification_type as VerificationType,
        subject_ref: params.subject_ref as string,
        reason: params.reason as string,
        decision_ref: (params.decision_ref as string) || null,
        requested_by: 'mcp',
      };
      const error = validateVerificationRequest(req);
      if (error) return { type: 'error', data: { message: error } };
      return { type: 'verification_request', data: createVerificationRequest(req) };
    }

    case 'answer_intent': {
      const intent = String(params.intent || '').trim();
      switch (intent) {
        case 'can_i_scale':
          return { type: 'answer', data: composeScaleReadinessAnswer(ctx) };
        case 'where_losing_money':
          return { type: 'answer', data: composeRevenueIntegrityAnswer(ctx) };
        case 'payment_health':
          return { type: 'answer', data: composePaymentHealthAnswer(ctx) };
        case 'underlying_cause':
          return { type: 'answer', data: composeRootCauseAnswer(ctx) };
        case 'fix_first':
          return { type: 'answer', data: composeFixFirstAnswer(ctx) };
        default:
          return {
            type: 'error',
            data: {
              message: `Unknown intent "${intent}". Valid: can_i_scale, where_losing_money, payment_health, underlying_cause, fix_first.`,
            },
          };
      }
    }

    // Deprecated alias cases — kept for one release to avoid breaking
    // older LLM-call patterns. New code should use answer_intent.
    case 'answer_can_i_scale':
      return { type: 'answer', data: composeScaleReadinessAnswer(ctx) };
    case 'answer_where_losing_money':
      return { type: 'answer', data: composeRevenueIntegrityAnswer(ctx) };
    case 'answer_payment_health':
      return { type: 'answer', data: composePaymentHealthAnswer(ctx) };
    case 'answer_underlying_cause':
      return { type: 'answer', data: composeRootCauseAnswer(ctx) };
    case 'answer_fix_first':
      return { type: 'answer', data: composeFixFirstAnswer(ctx) };

    case 'get_finding_projections': {
      const severityOrder = ['critical', 'high', 'medium', 'low'];
      let findings = getFindingProjections(ctx);
      if (params.pack) findings = findings.filter(f => f.pack === params.pack);
      if (params.severity) {
        const minIdx = severityOrder.indexOf(params.severity as string);
        if (minIdx >= 0) findings = findings.filter(f => severityOrder.indexOf(f.severity) <= minIdx);
      }
      if (params.limit && typeof params.limit === 'number') findings = findings.slice(0, params.limit);
      return { type: 'finding_projections', data: findings };
    }

    case 'get_action_projections':
      return { type: 'action_projections', data: getActionProjections(ctx) };

    case 'get_workspace_projections':
      return { type: 'workspace_projections', data: getWorkspaceProjections(ctx) };

    case 'get_change_report':
      return { type: 'change_report', data: getChangeReport(ctx) };

    case 'get_map': {
      const mapType = params.map_type as string;
      if (!mapType) return { type: 'error', data: { message: 'map_type is required' } };
      return { type: 'map', data: getMap(ctx, mapType) };
    }

    case 'discuss_finding': {
      const findingId = params.finding_id as string;
      if (!findingId) return { type: 'error', data: { message: 'finding_id is required' } };
      return { type: 'answer', data: composeFindingChatAnswer(ctx, findingId) };
    }

    case 'analyze_findings': {
      const findingIds = params.finding_ids as string[];
      if (!findingIds || findingIds.length === 0) return { type: 'error', data: { message: 'finding_ids is required' } };
      return { type: 'answer', data: composeMultiFindingChatAnswer(ctx, findingIds) };
    }

    case 'get_pack': {
      const packKey = String(params.pack_key || '').trim();
      if (!packKey) {
        return { type: 'error', data: { message: 'pack_key is required' } };
      }
      const severityFilter = (params.severity as string | undefined) ?? null;
      return { type: 'pack_summary', data: composePackSummary(ctx, packKey, severityFilter) };
    }

    case 'get_funnel_state':
      return { type: 'funnel_state', data: composeFunnelState(ctx) };

    case 'analyze_copy': {
      const url = (params.url as string) || null;
      const allFindings = getFindingProjections(ctx);
      const copyInferenceKeys = new Set([
        'value_proposition_buried',
        'social_proof_ineffective',
        'objection_unaddressed',
        'cta_competing_or_unclear',
        'trust_copy_absent_at_decision',
        'copy_funnel_misalignment',
        'copy_cross_page_inconsistent',
      ]);
      const copyFindings = allFindings.filter(
        f => f.pack === 'copy_alignment' || copyInferenceKeys.has(f.inference_key ?? ''),
      );

      if (url) {
        const pageFindings = copyFindings.filter(f => f.surface === url || f.surface?.includes(url));
        return {
          type: 'copy_analysis',
          data: {
            overall_grade: '--',
            overall_score: 0,
            pages_analyzed: 1,
            dimensions: [],
            top_issues: [],
            strengths: [],
            page_findings: pageFindings.map(f => ({
              url: f.surface || url,
              title: f.title,
              severity: f.severity,
              root_cause: f.root_cause,
            })),
          },
        };
      }

      // Overall copy health
      const DIMS = [
        { id: 'value_prop', key: 'value_proposition_buried' },
        { id: 'headlines', key: 'social_proof_ineffective' },
        { id: 'ctas', key: 'cta_competing_or_unclear' },
        { id: 'visual_hierarchy', key: 'copy_funnel_misalignment' },
        { id: 'trust', key: 'trust_copy_absent_at_decision' },
        { id: 'objections', key: 'objection_unaddressed' },
        { id: 'friction', key: 'copy_cross_page_inconsistent' },
      ];

      const severityScore = (s: string) =>
        s === 'critical' ? 15 : s === 'high' ? 35 : s === 'medium' ? 60 : s === 'low' ? 80 : 100;

      const dimensions = DIMS.map(dim => {
        const neg = copyFindings.filter(f => f.inference_key === dim.key && f.polarity === 'negative');
        const pos = copyFindings.filter(f => f.inference_key === dim.key && f.polarity === 'positive');
        let score = 75;
        if (neg.length > 0) {
          const worst = Math.min(...neg.map(f => severityScore(f.severity)));
          const avg = neg.reduce((s, f) => s + severityScore(f.severity), 0) / neg.length;
          score = Math.round((worst + avg) / 2);
        } else if (pos.length > 0) {
          score = 95;
        }
        return { id: dim.id, score, issue_count: neg.length };
      });

      const overall = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length);
      const grade = overall >= 90 ? 'A' : overall >= 80 ? 'A-' : overall >= 70 ? 'B' : overall >= 60 ? 'C' : overall >= 45 ? 'D' : 'F';
      const surfaces = new Set(copyFindings.map(f => f.surface).filter(Boolean));

      // Group issues
      const negFindings = copyFindings.filter(f => f.polarity === 'negative');
      const issueMap = new Map<string, { count: number; worst: string }>();
      for (const f of negFindings) {
        const rc = f.root_cause || f.inference_key || 'unknown';
        const existing = issueMap.get(rc);
        if (!existing) {
          issueMap.set(rc, { count: 1, worst: f.severity });
        } else {
          existing.count++;
          if (severityScore(f.severity) < severityScore(existing.worst)) existing.worst = f.severity;
        }
      }

      return {
        type: 'copy_analysis',
        data: {
          overall_grade: grade,
          overall_score: overall,
          pages_analyzed: surfaces.size || 1,
          dimensions,
          top_issues: [...issueMap.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 7)
            .map(([rc, v]) => ({ root_cause: rc, count: v.count, worst_severity: v.worst })),
          strengths: copyFindings.filter(f => f.polarity === 'positive').map(f => f.title),
        },
      };
    }

    case 'create_custom_map': {
      const name = params.name as string;
      const description = (params.description as string) || null;
      const findingIds = params.finding_ids as string[];
      if (!name) return { type: 'error', data: { message: 'name is required' } };
      if (!findingIds || findingIds.length === 0) return { type: 'error', data: { message: 'finding_ids is required' } };
      const projections = getProjections(ctx);
      const mapDef = buildCustomMap(name, description, findingIds, projections, ctx.result, ctx.translations);
      return {
        type: 'custom_map_created',
        data: {
          mapId: mapDef.id,
          name,
          nodeCount: mapDef.nodes.length,
          edgeCount: mapDef.edges.length,
          url: '/app/maps',
          mapDefinition: mapDef,
        },
      };
    }

    case 'search_findings': {
      const query = params.query as string;
      if (!query) return { type: 'error', data: { message: 'query is required' } };
      // Derive orgId from workspace_ref (format: "workspace:<org_id>")
      const orgId = ctx.scope.workspace_ref.replace('workspace:', '');
      const results = searchFindingsSync(orgId, query, 10);
      return {
        type: 'search_findings',
        data: {
          query,
          results: results.map((r: { id: string; type: 'finding' | 'action'; metadata: { title: string; severity: string; impact_mid: number; pack: string } }) => ({
            id: r.id,
            type: r.type,
            title: r.metadata.title,
            severity: r.metadata.severity,
            impact_mid: r.metadata.impact_mid,
            pack: r.metadata.pack,
          })),
        },
      };
    }

    // Wave 7.1: Trend analysis — uses change report from the current context
    case 'get_trend_analysis': {
      const filterPattern = (params.filter_pattern as string) || null;
      const changeReport = ctx.result.change_report;

      if (!changeReport) {
        return {
          type: 'trend_analysis',
          data: {
            lookback_cycles: 1,
            workspace_direction: 'stable',
            volatility: 0,
            alerts: [],
            summary: 'Insufficient cycle history for trend analysis. At least 2 cycles are required.',
          },
        };
      }

      // Synthesize trend alerts from change report regressions
      const alerts: { finding_key: string; pattern: string; streak_length: number; total_delta: number; narrative: string }[] = [];

      if (!filterPattern || filterPattern === 'consecutive_regressions') {
        for (const r of changeReport.regressions) {
          alerts.push({
            finding_key: r.decision_key,
            pattern: 'consecutive_regressions',
            streak_length: 2,
            total_delta: r.risk_score_delta,
            narrative: `${r.decision_key} regressed by ${r.risk_score_delta} risk points since last cycle.`,
          });
        }
      }

      // Add improvements if filtering for 'improving'
      if (!filterPattern || filterPattern === 'improving') {
        for (const imp of changeReport.improvements) {
          alerts.push({
            finding_key: imp.decision_key,
            pattern: 'improving',
            streak_length: 2,
            total_delta: imp.risk_score_delta,
            narrative: `${imp.decision_key} improved by ${Math.abs(imp.risk_score_delta)} risk points since last cycle.`,
          });
        }
      }

      return {
        type: 'trend_analysis',
        data: {
          lookback_cycles: 2,
          workspace_direction: changeReport.summary.overall_trend,
          volatility: changeReport.summary.regression_count / Math.max(1, changeReport.summary.total_decisions_compared),
          alerts,
          summary: changeReport.summary.headline,
        },
      };
    }

    // Wave 7.2: Recovery impact — uses pre-computed revenue recovery from engine result
    case 'get_recovery_impact': {
      const actionKey = (params.action_key as string) || null;
      const recovery = ctx.result.revenue_recovery;

      if (!recovery) {
        return {
          type: 'recovery_impact',
          data: {
            total_recovery_monthly_cents: 0,
            data_source: 'none',
            estimates: [],
            summary: 'No revenue recovery data available. Ensure integrations are connected and findings have been resolved.',
          },
        };
      }

      const estimates = recovery.estimates
        .filter(e => !actionKey || e.finding_key === actionKey)
        .map(e => ({
          finding_key: e.finding_key,
          confidence: e.confidence,
          estimated_impact_cents: (e.estimated_impact_at_resolution.min + e.estimated_impact_at_resolution.max) / 2,
          revenue_delta_cents: e.revenue_delta_next_cycle,
          narrative: e.narrative,
        }));

      const totalCents = estimates.reduce((sum, e) => sum + e.estimated_impact_cents, 0);

      return {
        type: 'recovery_impact',
        data: {
          total_recovery_monthly_cents: totalCents,
          data_source: recovery.data_source,
          estimates,
          summary: estimates.length > 0
            ? `${estimates.length} resolved finding(s) tracked. Estimated monthly recovery: $${(totalCents / 100).toFixed(0)}.`
            : 'No resolved findings match the filter.',
        },
      };
    }

    // Wave 8.3: Content freshness — filters findings to content_freshness pack
    case 'get_content_freshness': {
      const allFindings = getFindingProjections(ctx);
      const freshFindings = allFindings.filter(f => f.pack === 'content_freshness');

      if (freshFindings.length === 0) {
        return {
          type: 'content_freshness',
          data: {
            pages_with_stale_content: 0,
            worst_staleness_score: 0,
            stale_pages: [],
            pack_status: 'healthy',
            summary: 'No content freshness issues detected.',
          },
        };
      }

      // Group by surface (URL)
      const pageMap = new Map<string, typeof freshFindings>();
      for (const f of freshFindings) {
        const url = f.surface || 'unknown';
        const existing = pageMap.get(url) || [];
        existing.push(f);
        pageMap.set(url, existing);
      }

      const severityToScore = (s: string) =>
        s === 'critical' ? 95 : s === 'high' ? 75 : s === 'medium' ? 50 : 25;

      const stalePages = [...pageMap.entries()].map(([url, findings]) => ({
        url,
        staleness_score: Math.max(...findings.map(f => severityToScore(f.severity))),
        stale_elements: findings.map(f => ({ type: f.inference_key || 'unknown', text: f.title })),
        page_type: 'page',
      })).sort((a, b) => b.staleness_score - a.staleness_score);

      const worstScore = stalePages.length > 0 ? stalePages[0].staleness_score : 0;
      const packStatus = worstScore >= 75 ? 'critical' : worstScore >= 50 ? 'at_risk' : 'healthy';

      return {
        type: 'content_freshness',
        data: {
          pages_with_stale_content: stalePages.length,
          worst_staleness_score: worstScore,
          stale_pages: stalePages.slice(0, 20),
          pack_status: packStatus,
          summary: `${stalePages.length} page(s) with stale content detected. Worst staleness score: ${worstScore}/100.`,
        },
      };
    }

    // Verification status tools — these are dispatched via the server
    // which has access to the orchestrator. If they reach here, no orchestrator is loaded.
    case 'get_verification_status':
    case 'list_verifications':
      return { type: 'error', data: { message: 'Verification orchestrator not loaded.' } };

    default:
      return { type: 'error', data: { message: `Unknown tool: ${toolName}` } };
  }
}

// ──────────────────────────────────────────────
// Pack composition — get_pack
//
// Filters findings by pack (case-insensitive substring on the
// FindingProjection.pack field) and joins actions whose action_refs
// touch any of those findings. Actions don't carry a pack field
// directly (they're cross-pack by design); the join via action_refs is
// the canonical way to surface them.
// ──────────────────────────────────────────────

function composePackSummary(
  ctx: EngineContext,
  packKey: string,
  severityFilter: string | null,
): PackSummaryDetailView {
  const SEVERITY_RANK: Record<string, number> = {
    low: 1, medium: 2, high: 3, critical: 4,
  };
  const minSev = severityFilter ? SEVERITY_RANK[severityFilter] ?? 0 : 0;
  const normalized = packKey.toLowerCase();

  const allFindings = getFindingProjections(ctx);
  const packFindings = allFindings.filter((f) => {
    const fpack = String(f.pack || '').toLowerCase();
    if (!fpack.includes(normalized) && fpack !== normalized) return false;
    if (minSev > 0 && (SEVERITY_RANK[f.severity] ?? 0) < minSev) return false;
    return true;
  });

  // Aggregate impact
  let min = 0, max = 0, mid = 0;
  let currency = 'USD';
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of packFindings) {
    if (f.impact?.monthly_range) {
      min += f.impact.monthly_range.min ?? 0;
      max += f.impact.monthly_range.max ?? 0;
      mid += f.impact.midpoint ?? 0;
    }
    if (f.impact?.currency) currency = f.impact.currency;
    const sev = f.severity as keyof typeof severityCounts;
    if (sev in severityCounts) severityCounts[sev]++;
  }

  // Join actions via finding.action_refs (each finding lists the action
  // IDs that remediate it). We collect those IDs from the pack's
  // findings and look them up in the global action projection list.
  const actionIdRefs = new Set<string>();
  for (const f of packFindings) {
    if (Array.isArray(f.action_refs)) {
      for (const ref of f.action_refs) {
        if (ref?.id) actionIdRefs.add(ref.id);
      }
    }
  }
  const allActions = getActionProjections(ctx);
  const packActions = allActions.filter((a) => actionIdRefs.has(a.id));

  return {
    pack_key: packKey,
    finding_count: packFindings.length,
    severity_counts: severityCounts,
    monthly_impact: {
      min_cents: min,
      max_cents: max,
      midpoint_cents: mid,
      currency,
    },
    findings: packFindings,
    actions: packActions,
    empty: packFindings.length === 0,
  };
}

// ──────────────────────────────────────────────
// Funnel composition — get_funnel_state
//
// Buckets every active finding into one of 5 canonical buyer-journey
// stages by mapping its pack. Operational packs (scale_readiness,
// preflight, security_posture) live OUTSIDE the journey and count as
// unstaged. The 5 stages match the funnel-moment-inference taxonomy
// the engine already produces.
// ──────────────────────────────────────────────

type FunnelStageKey =
  | 'awareness'
  | 'consideration'
  | 'decision'
  | 'conversion'
  | 'post_purchase';

const PACK_TO_STAGE: Record<string, FunnelStageKey> = {
  // Awareness — visitor lands, first 5 seconds
  first_impression: 'awareness',
  discoverability: 'awareness',
  hero_clarity: 'awareness',

  // Consideration — exploring, trust-building
  trust_gap: 'consideration',
  social_proof: 'consideration',
  content_freshness: 'consideration',
  copy_alignment: 'consideration',

  // Decision — pricing / comparison / cart
  revenue_integrity: 'decision',
  mobile_revenue: 'decision',
  friction_tax: 'decision',
  payment_health: 'decision',

  // Conversion — checkout / signup
  channel_integrity: 'conversion',
  chargeback_resilience: 'conversion',
  path_efficiency: 'conversion',
  acquisition_integrity: 'conversion',

  // Post-purchase — retention, expansion, onboarding
  action_value: 'post_purchase',
};

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  awareness: 'Awareness',
  consideration: 'Consideration',
  decision: 'Decision',
  conversion: 'Conversion',
  post_purchase: 'Post-purchase',
};

const STAGE_ORDER: FunnelStageKey[] = [
  'awareness',
  'consideration',
  'decision',
  'conversion',
  'post_purchase',
];

function composeFunnelState(ctx: EngineContext): FunnelStateView {
  const allFindings = getFindingProjections(ctx);

  // Group by stage
  const buckets: Record<FunnelStageKey, FindingProjection[]> = {
    awareness: [],
    consideration: [],
    decision: [],
    conversion: [],
    post_purchase: [],
  };
  let unstaged = 0;
  let totalImpact = 0;

  for (const f of allFindings) {
    const stage = PACK_TO_STAGE[String(f.pack || '').toLowerCase()];
    if (stage) {
      buckets[stage].push(f);
    } else {
      unstaged++;
    }
    totalImpact += f.impact?.midpoint ?? 0;
  }

  const stages = STAGE_ORDER.map((key, idx) => {
    const findings = buckets[key];
    // Aggregate
    let min = 0, max = 0, mid = 0;
    let currency = 'USD';
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      if (f.impact?.monthly_range) {
        min += f.impact.monthly_range.min ?? 0;
        max += f.impact.monthly_range.max ?? 0;
        mid += f.impact.midpoint ?? 0;
      }
      if (f.impact?.currency) currency = f.impact.currency;
      const sev = f.severity as keyof typeof severityCounts;
      if (sev in severityCounts) severityCounts[sev]++;
    }
    // Top 3 by impact midpoint
    const topFindings = [...findings]
      .sort((a, b) => (b.impact?.midpoint ?? 0) - (a.impact?.midpoint ?? 0))
      .slice(0, 3);

    return {
      key,
      label: STAGE_LABELS[key],
      order: idx,
      finding_count: findings.length,
      severity_counts: severityCounts,
      monthly_impact: {
        min_cents: min,
        max_cents: max,
        midpoint_cents: mid,
        currency,
      },
      top_findings: topFindings,
    };
  });

  return {
    stages,
    unstaged_findings: unstaged,
    total_findings: allFindings.length,
    total_monthly_impact_midpoint_cents: totalImpact,
  };
}
