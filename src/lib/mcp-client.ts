// Dynamic import to prevent Playwright from being bundled in client components.
// McpServer → workers/verification → playwright is a server-only chain.
// Using dynamic import() allows webpack to tree-shake it from "use client" pages.
import type { ToolResult } from '../../apps/mcp/tools';
import type { McpRequestScope } from '../../apps/mcp/types';
import type {
  WorkspaceSummaryView,
  DecisionExplainabilityView,
  PreflightStatusView,
  RevenueIntegritySummaryView,
  RootCauseSummaryView,
  ActionSummaryView,
  GraphPathSummaryView,
  McpAnswer,
} from '../../apps/mcp/types';
import type { VerificationRequest } from '../../packages/domain';
import type { FindingProjection, ActionProjection, WorkspaceProjection, ChangeReportProjection } from '../../packages/projections';
import type { MapDefinition } from '../../packages/maps';
import type { McpSessionContext } from '../../apps/mcp/types';

/**
 * MCP Client — the UI's only interface to the engine.
 * All data fetching goes through here. No direct engine access.
 *
 * In this foundation phase, we use in-process MCP calls.
 * Future: replace with HTTP/stdio transport to MCP server.
 */

let serverInstance: any = null;

export function getMcpServer(): any {
  if (!serverInstance) {
    // Dynamic require to keep Playwright out of client bundles.
    // This file is imported by "use client" components but McpServer
    // only runs server-side. At build time, webpack skips the require.
    try {
      const { McpServer } = require('../../apps/mcp/server');
      serverInstance = new McpServer();
    } catch {
      // Client-side: return a stub that throws on use
      serverInstance = new Proxy({}, {
        get: (_, prop) => {
          if (prop === 'callTool') return () => ({ type: 'error', data: { message: 'MCP not available on client' } });
          return () => null;
        },
      });
    }
  }
  return serverInstance;
}

export function resetMcpServer(): void {
  serverInstance = null;
}

// Typed wrappers around MCP tool calls
export function fetchWorkspaceSummary(): WorkspaceSummaryView | null {
  const result = getMcpServer().callTool('get_workspace_summary');
  return result.type === 'workspace_summary' ? result.data : null;
}

export function fetchDecisionExplainability(packKey: string): DecisionExplainabilityView | null {
  const result = getMcpServer().callTool('get_decision_explainability', { pack_key: packKey });
  return result.type === 'decision_explainability' ? result.data : null;
}

export function fetchPreflightStatus(): PreflightStatusView | null {
  const result = getMcpServer().callTool('get_preflight_status');
  return result.type === 'preflight_status' ? result.data : null;
}

export function fetchRevenueIntegrity(): RevenueIntegritySummaryView | null {
  const result = getMcpServer().callTool('get_revenue_integrity_summary');
  return result.type === 'revenue_integrity' ? result.data : null;
}

export function fetchRootCauses(): RootCauseSummaryView[] {
  const result = getMcpServer().callTool('get_root_causes');
  return result.type === 'root_causes' ? result.data : [];
}

export function fetchPrioritizedActions(): ActionSummaryView[] {
  const result = getMcpServer().callTool('get_prioritized_actions');
  return result.type === 'prioritized_actions' ? result.data : [];
}

export function fetchGraphSummary(): GraphPathSummaryView | null {
  const result = getMcpServer().callTool('get_graph_path_summary');
  return result.type === 'graph_path_summary' ? result.data : null;
}

export function askCanIScale(): McpAnswer | null {
  const result = getMcpServer().callTool('answer_can_i_scale');
  return result.type === 'answer' ? result.data : null;
}

export function askWhereLosing(): McpAnswer | null {
  const result = getMcpServer().callTool('answer_where_losing_money');
  return result.type === 'answer' ? result.data : null;
}

export function askUnderlyingCause(): McpAnswer | null {
  const result = getMcpServer().callTool('answer_underlying_cause');
  return result.type === 'answer' ? result.data : null;
}

export function askFixFirst(): McpAnswer | null {
  const result = getMcpServer().callTool('answer_fix_first');
  return result.type === 'answer' ? result.data : null;
}

export function requestVerification(params: {
  verification_type: string;
  subject_ref: string;
  reason: string;
  decision_ref?: string;
}): VerificationRequest | null {
  const result = getMcpServer().callTool('request_verification', params);
  return result.type === 'verification_request' ? result.data : null;
}

// Projection fetch functions
export function fetchFindingProjections(): FindingProjection[] {
  const result = getMcpServer().callTool('get_finding_projections');
  return result.type === 'finding_projections' ? result.data : [];
}

export function fetchActionProjections(): ActionProjection[] {
  const result = getMcpServer().callTool('get_action_projections');
  return result.type === 'action_projections' ? result.data : [];
}

export function fetchWorkspaceProjections(): WorkspaceProjection[] {
  const result = getMcpServer().callTool('get_workspace_projections');
  return result.type === 'workspace_projections' ? result.data : [];
}

export function fetchChangeReport(): ChangeReportProjection | null {
  const result = getMcpServer().callTool('get_change_report');
  return result.type === 'change_report' ? result.data : null;
}

export function fetchMap(mapType: string): MapDefinition | null {
  const result = getMcpServer().callTool('get_map', { map_type: mapType });
  return result.type === 'map' ? result.data : null;
}

// Contextual chat functions
export function discussFinding(findingId: string): McpAnswer | null {
  const result = getMcpServer().callTool('discuss_finding', { finding_id: findingId });
  return result.type === 'answer' ? result.data : null;
}

export function analyzeFindings(findingIds: string[]): McpAnswer | null {
  const result = getMcpServer().callTool('analyze_findings', { finding_ids: findingIds });
  return result.type === 'answer' ? result.data : null;
}

// Session context
export function updateSession(updates: Partial<McpSessionContext>): void {
  getMcpServer().updateSession(updates);
}

export function getSession(): McpSessionContext {
  return getMcpServer().getSession();
}
