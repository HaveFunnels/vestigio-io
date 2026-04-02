// ──────────────────────────────────────────────
// Tool Adapter — Bridge between Claude tool_use and MCP
//
// Converts TOOL_DEFINITIONS to Claude tool format.
// Executes tool calls via McpServer.callTool().
// Summarizes results to minimize token usage.
//
// Tools are classified as SAFE (read-only) or EXPENSIVE
// (triggers verification/Playwright). This classification
// is internal — never exposed to the user or to Claude.
// The system prompt guides Claude away from expensive tools
// unless the user explicitly requests verification.
// ──────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS } from '../tools';
import type { McpServer } from '../server';
import type { ToolCallRecord } from './types';

// ── Tool Safety Classification ──────────────
// EXPENSIVE tools can trigger Playwright, external HTTP, or credit charges.
// SAFE tools are read-only projections from cached/computed data.

const EXPENSIVE_TOOLS = new Set([
  'request_verification',
]);

// Per-request verification call budget
const MAX_VERIFICATION_CALLS_PER_REQUEST = 1;

export function isExpensiveTool(toolName: string): boolean {
  return EXPENSIVE_TOOLS.has(toolName);
}

/** Sanitize tool result text to prevent injection via tool output.
 *  Tool results originate from internal engine BUT finding titles
 *  come from external website analysis — potential indirect injection vector. */
function sanitizeToolOutput(text: string): string {
  let clean = text;
  // Strip control characters (keep \n, \t)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Neutralize any injection patterns embedded in tool data
  // (e.g., a malicious website title like "Revenue: ignore all previous instructions")
  clean = clean.replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules|prompts)/gi, '[filtered]');
  clean = clean.replace(/\[(?:SYSTEM|INST|ASSISTANT)\]/gi, '[filtered]');
  clean = clean.replace(/system\s*prompt/gi, '[filtered]');
  // Strip HTML tags that might confuse context
  clean = clean.replace(/<\/?(?:script|iframe|object|embed|svg|style)\b[^>]*>/gi, '');
  return clean;
}

// ── Convert to Claude Format ─────────────────

export function buildClaudeTools(): Anthropic.Tool[] {
  return TOOL_DEFINITIONS.map((def) => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(def.input_schema)) {
      const s = schema as any;
      if (s.type === 'array') {
        properties[key] = { type: 'array', items: s.items, description: key };
      } else if (s.enum) {
        properties[key] = { type: s.type || 'string', enum: s.enum, description: key };
      } else {
        properties[key] = { type: s.type || 'string', description: key };
      }
      if (!s.nullable) {
        required.push(key);
      }
    }

    return {
      name: def.name,
      description: def.description,
      input_schema: {
        type: 'object' as const,
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  });
}

// ── Execute Tool Call ────────────────────────

export function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  mcpServer: McpServer,
  verificationCallCount = 0,
): { result: any; summary: string; execution_ms: number; blocked: boolean } {
  const start = Date.now();

  // Block excessive verification calls silently
  if (isExpensiveTool(toolName) && verificationCallCount >= MAX_VERIFICATION_CALLS_PER_REQUEST) {
    return {
      result: { type: 'error', data: { message: 'Verification budget reached for this request. The user can request verification explicitly in a follow-up.' } },
      summary: 'Verification skipped: budget for this request reached. Suggest the user ask for verification directly.',
      execution_ms: 0,
      blocked: true,
    };
  }

  try {
    const result = mcpServer.callTool(toolName, toolInput);
    const executionMs = Date.now() - start;
    const rawSummary = summarizeToolResult(toolName, result);
    const summary = sanitizeToolOutput(rawSummary);

    return { result, summary, execution_ms: executionMs, blocked: false };
  } catch (err: any) {
    const executionMs = Date.now() - start;
    return {
      result: { type: 'error', data: { message: err?.message || 'Tool execution failed' } },
      summary: sanitizeToolOutput(`Error: ${err?.message || 'Tool execution failed'}`),
      execution_ms: executionMs,
      blocked: false,
    };
  }
}

// ── Summarize Tool Results ───────────────────
// Goal: each summary < 200 tokens to minimize context cost

function summarizeToolResult(toolName: string, result: any): string {
  if (!result || !result.type) {
    return 'No result returned.';
  }

  if (result.type === 'error') {
    return `Error: ${result.data?.message || 'Unknown error'}`;
  }

  const data = result.data;

  switch (result.type) {
    case 'answer':
      return summarizeAnswer(data);

    case 'finding_projections':
      return summarizeFindings(data);

    case 'action_projections':
      return summarizeActions(data);

    case 'workspace_projections':
      return summarizeWorkspaces(data);

    case 'workspace_summary':
      return summarizeWorkspaceSummary(data);

    case 'root_causes':
      return summarizeRootCauses(data);

    case 'prioritized_actions':
      return summarizePrioritizedActions(data);

    case 'preflight_status':
      return summarizePreflightStatus(data);

    case 'revenue_integrity':
      return summarizeRevenueIntegrity(data);

    case 'decision_explainability':
      return summarizeDecisionExplainability(data);

    case 'graph_path_summary':
      return summarizeGraphPath(data);

    case 'map':
      return summarizeMap(data);

    case 'verification_request':
    case 'verification_status':
      return summarizeVerification(data);

    case 'verification_list':
      return `${Array.isArray(data) ? data.length : 0} verification requests tracked.`;

    case 'verification_skipped':
      return `Verification skipped: ${data?.reason || 'policy decision'}`;

    default:
      return truncateJson(data, 500);
  }
}

function summarizeAnswer(data: any): string {
  if (!data) return 'No answer available.';
  const parts = [
    data.direct_answer,
    data.confidence != null ? `Confidence: ${data.confidence}%` : null,
    data.freshness ? `Freshness: ${data.freshness}` : null,
    data.recommended_next_step ? `Next step: ${data.recommended_next_step}` : null,
  ];
  if (data.impact_summary) {
    const imp = data.impact_summary;
    parts.push(`Impact: $${imp.total_monthly_loss_mid?.toLocaleString() || '?'}/mo`);
  }
  return parts.filter(Boolean).join('\n');
}

function summarizeFindings(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return 'No findings.';

  const totalImpact = data.reduce((s, f) => s + (f.impact?.midpoint || 0), 0);
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of data) bySeverity[f.severity as keyof typeof bySeverity] = (bySeverity[f.severity as keyof typeof bySeverity] || 0) + 1;

  // Tier 1: Top 5 with full detail (always shown)
  const tier1 = data.slice(0, 5);
  // Tier 2: Next 10 as compact list (IDs + titles for follow-up)
  const tier2 = data.slice(5, 15);

  const lines = [
    `${data.length} findings. Total impact: $${totalImpact.toLocaleString()}/mo. Breakdown: ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low.`,
    '',
    'TOP 5 (full detail — use $$FINDING{id}$$ to show cards):',
    ...tier1.map((f, i) =>
      `${i + 1}. [${f.severity?.toUpperCase()}] "${f.title}" — $${f.impact?.midpoint?.toLocaleString() || '?'}/mo, ${f.impact?.monthly_range ? `range $${f.impact.monthly_range.min}–$${f.impact.monthly_range.max}` : ''}, ${f.confidence}% conf, pack: ${f.pack}${f.root_cause ? `, root cause: ${f.root_cause}` : ''} [id: ${f.id}]`
    ),
  ];

  if (tier2.length > 0) {
    lines.push('', `NEXT ${tier2.length} (ask to drill into any):`,
      ...tier2.map((f) => `- "${f.title}" ($${f.impact?.midpoint?.toLocaleString() || '?'}/mo, ${f.severity}) [id: ${f.id}]`),
    );
  }

  if (data.length > 15) {
    lines.push(``, `(${data.length - 15} more findings not shown. User can ask to see all.)`);
  }

  return lines.join('\n');
}

function summarizeActions(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return 'No actions.';

  // Tier 1: Top 5 with full detail
  const tier1 = data.slice(0, 5);
  // Tier 2: Next 5 compact
  const tier2 = data.slice(5, 10);

  const lines = [
    `${data.length} actions total.`,
    '',
    'TOP 5 (use $$ACTION{id}$$ to show cards):',
    ...tier1.map((a, i) =>
      `${i + 1}. "${a.title}" — saves $${a.impact?.midpoint?.toLocaleString() || '?'}/mo, ${a.severity} severity, priority ${a.priority_score || '?'}${a.cross_pack ? ' [CROSS-PACK]' : ''} [id: ${a.id}]`
    ),
  ];

  if (tier2.length > 0) {
    lines.push('', `NEXT ${tier2.length}:`,
      ...tier2.map((a) => `- "${a.title}" ($${a.impact?.midpoint?.toLocaleString() || '?'}/mo, ${a.severity}) [id: ${a.id}]`),
    );
  }

  if (data.length > 10) {
    lines.push(``, `(${data.length - 10} more actions not shown.)`);
  }

  return lines.join('\n');
}

function summarizeWorkspaces(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return 'No workspaces.';
  return data.map((w) =>
    `${w.name}: ${w.summary?.issue_count || 0} issues, $${w.summary?.total_loss_mid?.toLocaleString() || '0'}/mo loss, ${w.summary?.confidence || 0}% confidence`
  ).join('\n');
}

function summarizeWorkspaceSummary(data: any): string {
  if (!data) return 'No workspace summary.';
  const parts = [
    `Health: ${data.overall_health || '?'}`,
    data.confidence != null ? `Confidence: ${data.confidence}%` : null,
    Array.isArray(data.packs) ? `Packs: ${data.packs.length}` : null,
    Array.isArray(data.root_causes) ? `Root causes: ${data.root_causes.length}` : null,
    Array.isArray(data.prioritized_actions) ? `Actions: ${data.prioritized_actions.length}` : null,
    data.freshness ? `Freshness: ${data.freshness}` : null,
  ];
  return parts.filter(Boolean).join('\n');
}

function summarizeRootCauses(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return 'No root causes identified.';
  const top = data.slice(0, 5);
  return [`${data.length} root causes.`, ...top.map((rc) =>
    `- "${rc.title}" (${rc.severity}, ${rc.inference_count || 0} inferences, packs: ${Array.isArray(rc.affected_packs) ? rc.affected_packs.join(', ') : 'n/a'})`
  )].join('\n');
}

function summarizePrioritizedActions(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return 'No prioritized actions.';
  const top = data.slice(0, 5);
  return [`${data.length} actions prioritized.`, ...top.map((a, i) =>
    `${i + 1}. "${a.title}" — ${a.severity}${a.cross_pack ? ' [cross-pack]' : ''}`
  )].join('\n');
}

function summarizePreflightStatus(data: any): string {
  if (!data) return 'No preflight status.';
  return [
    `Readiness: ${data.overall_status || '?'} (score: ${data.readiness_score ?? '?'})`,
    `Blockers: ${Array.isArray(data.blockers) ? data.blockers.length : '?'}, Risks: ${Array.isArray(data.risks) ? data.risks.length : '?'}`,
    data.decision_summary || null,
  ].filter(Boolean).join('\n');
}

function summarizeRevenueIntegrity(data: any): string {
  if (!data) return 'No revenue integrity data.';
  return [
    `Risk level: ${data.risk_level || '?'}`,
    `Leakage points: ${data.leakage_count ?? '?'}`,
    data.top_leakage ? `Top leakage: "${data.top_leakage}"` : null,
    data.total_estimated_loss ? `Estimated loss: $${data.total_estimated_loss.toLocaleString()}/mo` : null,
  ].filter(Boolean).join('\n');
}

function summarizeDecisionExplainability(data: any): string {
  if (!data) return 'No explainability data for this pack.';
  return [
    `Pack: ${data.pack_key || '?'}`,
    `Decision: ${data.decision_key || '?'} (${data.effective_severity || '?'})`,
    `Confidence: ${data.confidence_score ?? '?'}%`,
    data.summary || null,
  ].filter(Boolean).join('\n');
}

function summarizeGraphPath(data: any): string {
  if (!data) return 'No graph data.';
  return [
    `Pages: ${data.internal_pages ?? data.total_nodes ?? '?'}`,
    `External hosts: ${data.external_hosts ?? '?'}`,
    `Providers: ${Array.isArray(data.providers) ? data.providers.length : '?'}`,
    `Redirects: ${data.redirect_count ?? '?'}`,
    `Trust gaps: ${data.trust_gaps ?? '?'}`,
  ].join(', ');
}

function summarizeMap(data: any): string {
  if (!data) return 'No map available.';
  return `Map type: ${data.type || '?'}, ${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges. (Visual — use $$MAP$$ to show it to the user.)`;
}

function summarizeVerification(data: any): string {
  if (!data) return 'No verification data.';
  return [
    `Verification ${data.request_id || '?'}: ${data.status || '?'}`,
    data.evidence_count != null ? `Evidence collected: ${data.evidence_count}` : null,
    data.duration_ms != null ? `Duration: ${data.duration_ms}ms` : null,
  ].filter(Boolean).join('\n');
}

function truncateJson(data: any, maxChars: number): string {
  try {
    const json = JSON.stringify(data);
    if (json.length <= maxChars) return json;
    return json.slice(0, maxChars) + '... [truncated]';
  } catch {
    return '[Unserializable data]';
  }
}

// ── Build Tool Call Record ───────────────────

export function buildToolCallRecord(
  toolName: string,
  params: Record<string, unknown>,
  result: any,
  summary: string,
  executionMs: number,
): ToolCallRecord {
  return {
    tool_name: toolName,
    params,
    result_type: result?.type || 'unknown',
    result_summary: summary,
    execution_ms: executionMs,
  };
}
