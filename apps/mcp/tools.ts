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
    input_schema: { pack_key: { type: 'string', enum: ['scale_readiness_pack', 'revenue_integrity_pack', 'saas_growth_readiness'] } },
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
    description: 'Request additional verification to strengthen confidence in a decision. Creates a verification request — does NOT execute collection directly.',
    input_schema: {
      verification_type: { type: 'string', enum: ['reuse_only', 'light_probe', 'browser_verification'] },
      subject_ref: { type: 'string' },
      reason: { type: 'string' },
      decision_ref: { type: 'string', nullable: true },
    },
  },
  {
    name: 'answer_can_i_scale',
    description: 'Answer the business question: "Can I scale traffic?" with structured explanation.',
    input_schema: {},
  },
  {
    name: 'answer_where_losing_money',
    description: 'Answer the business question: "Where am I losing money?" with structured explanation.',
    input_schema: {},
  },
  {
    name: 'answer_underlying_cause',
    description: 'Answer the business question: "What is the underlying cause?" with root cause analysis.',
    input_schema: {},
  },
  {
    name: 'answer_fix_first',
    description: 'Answer the business question: "What should I fix first?" with globally prioritized actions.',
    input_schema: {},
  },
  {
    name: 'get_verification_status',
    description: 'Get the status and result of a verification request.',
    input_schema: { request_id: { type: 'string' } },
  },
  {
    name: 'list_verifications',
    description: 'List all verification requests and their statuses.',
    input_schema: {},
  },
  {
    name: 'get_finding_projections',
    description: 'Get all findings with quantified financial impact, sorted by impact midpoint descending.',
    input_schema: {},
  },
  {
    name: 'get_action_projections',
    description: 'Get all actions with estimated impact, sorted by impact then confidence then severity.',
    input_schema: {},
  },
  {
    name: 'get_workspace_projections',
    description: 'Get workspace projections with impact summaries and scoped findings.',
    input_schema: {},
  },
  {
    name: 'get_change_report',
    description: 'Get the cycle-to-cycle change report projection — regressions, improvements, new issues, resolved items, and overall trend.',
    input_schema: {},
  },
  {
    name: 'get_map',
    description: 'Get a causal visualization map (revenue_leakage, chargeback_risk, or root_cause).',
    input_schema: { map_type: { type: 'string', enum: ['revenue_leakage', 'chargeback_risk', 'root_cause', 'user_journey'] } },
  },
  {
    name: 'discuss_finding',
    description: 'Start a contextual chat about a specific finding. Returns analysis with suggested prompts.',
    input_schema: { finding_id: { type: 'string' } },
  },
  {
    name: 'analyze_findings',
    description: 'Analyze multiple findings together. Detects shared root causes, compounding effects, and combined impact.',
    input_schema: { finding_ids: { type: 'array', items: { type: 'string' } } },
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
  | { type: 'error'; data: { message: string } };

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

    case 'answer_can_i_scale':
      return { type: 'answer', data: composeScaleReadinessAnswer(ctx) };

    case 'answer_where_losing_money':
      return { type: 'answer', data: composeRevenueIntegrityAnswer(ctx) };

    case 'answer_underlying_cause':
      return { type: 'answer', data: composeRootCauseAnswer(ctx) };

    case 'answer_fix_first':
      return { type: 'answer', data: composeFixFirstAnswer(ctx) };

    case 'get_finding_projections':
      return { type: 'finding_projections', data: getFindingProjections(ctx) };

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
      const mapDef = buildCustomMap(name, description, findingIds, projections, ctx.result);
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

    // Verification status tools — these are dispatched via the server
    // which has access to the orchestrator. If they reach here, no orchestrator is loaded.
    case 'get_verification_status':
    case 'list_verifications':
      return { type: 'error', data: { message: 'Verification orchestrator not loaded.' } };

    default:
      return { type: 'error', data: { message: `Unknown tool: ${toolName}` } };
  }
}
