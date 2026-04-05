import { getMcpServer, initMcpServer } from './mcp-client';
import type { FindingProjection, ActionProjection, WorkspaceProjection, ChangeReportProjection } from '../../packages/projections';
import type { MapDefinition } from '../../packages/maps';
import type { McpAnswer } from '../../apps/mcp/types';
import type { SaasSetupChecklist } from '../../apps/mcp/saas-awareness';

// ──────────────────────────────────────────────
// Console Data Provider — HARDENED
//
// Returns DataState<T> — never fake data.
// Possible states: loading, ready, empty, error, not_ready.
// UI pages MUST handle all states explicitly.
//
// Auto-bootstrap: ensureContext() loads the latest
// audit cycle evidence from PostgreSQL when the in-memory
// MCP singleton has no context (server restart, first visit).
// Must be called from a server component or API route.
// ──────────────────────────────────────────────

export type DataState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'not_ready'; reason: string }
  | { status: 'saas_setup_required'; checklist: SaasSetupChecklist };

/**
 * Ensure the MCP server singleton has context loaded.
 *
 * On a fresh server start (or after singleton reset), the in-memory
 * MCP server has no context. This function loads the latest audit
 * cycle's evidence from PostgreSQL and bootstraps the engine.
 *
 * Call from server components / API routes BEFORE any synchronous
 * MCP tool calls. No-ops if context is already loaded.
 */
export async function ensureContext(orgCtx: {
  orgId: string;
  orgName: string;
  envId: string;
  domain: string;
}): Promise<void> {
  try {
    // initMcpServer uses `await import()` to handle the async McpServer module.
    // A synchronous require() fails silently because webpack wraps McpServer
    // in an async module (due to playwright deps), returning undefined exports.
    const server = await initMcpServer();
    if (server.getContext()) return; // already loaded

    // Dynamic imports to keep Prisma out of client bundles
    const { prisma } = await import('@/libs/prismaDb');
    const { PrismaEvidenceStore } = await import('../../packages/evidence');
    const { bootstrapMcpContextSync } = await import('../../apps/mcp/bootstrap');

    const store = new PrismaEvidenceStore(prisma);
    const workspaceRef = `workspace:${orgCtx.orgId}`;
    const environmentRef = `environment:${orgCtx.envId}`;

    const { evidence, cycleRef } = await store.loadLatestCycle(workspaceRef, environmentRef);
    if (evidence.length === 0 || !cycleRef) return; // no persisted data yet

    const domain = orgCtx.domain.replace(/^https?:\/\//, '').split('/')[0];
    const landingUrl = orgCtx.domain.startsWith('http')
      ? orgCtx.domain
      : `https://${orgCtx.domain}`;

    // Load engine translations for the user's locale
    const { loadEngineTranslations } = await import('@/lib/engine-translations');
    const translations = await loadEngineTranslations();

    bootstrapMcpContextSync(server, {
      organization_id: orgCtx.orgId,
      organization_name: orgCtx.orgName,
      environment_id: orgCtx.envId,
      domain,
      landing_url: landingUrl,
      is_production: process.env.NODE_ENV === 'production',
    }, evidence, store, translations);
  } catch (err) {
    console.error('[ensureContext] Failed to bootstrap MCP context:', err);
  }
}

export function loadFindings(): DataState<FindingProjection[]> {
  try {
    const server = getMcpServer();
    if (!server.getContext()) {
      return { status: 'not_ready', reason: 'No analysis context loaded. Complete onboarding or select an environment.' };
    }
    const result = server.callTool('get_finding_projections');
    if (result.type === 'error') {
      return { status: 'error', message: result.data.message };
    }
    if (result.type === 'finding_projections') {
      if (result.data.length === 0) return { status: 'empty' };
      return { status: 'ready', data: result.data };
    }
    return { status: 'error', message: 'Unexpected response type' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error loading findings' };
  }
}

export function loadActions(): DataState<ActionProjection[]> {
  try {
    const server = getMcpServer();
    if (!server.getContext()) {
      return { status: 'not_ready', reason: 'No analysis context loaded. Complete onboarding or select an environment.' };
    }
    const result = server.callTool('get_action_projections');
    if (result.type === 'error') {
      return { status: 'error', message: result.data.message };
    }
    if (result.type === 'action_projections') {
      if (result.data.length === 0) return { status: 'empty' };
      return { status: 'ready', data: result.data };
    }
    return { status: 'error', message: 'Unexpected response type' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error loading actions' };
  }
}

export function loadWorkspaces(): DataState<WorkspaceProjection[]> {
  try {
    const server = getMcpServer();
    if (!server.getContext()) {
      return { status: 'not_ready', reason: 'No analysis context loaded. Complete onboarding or select an environment.' };
    }
    const result = server.callTool('get_workspace_projections');
    if (result.type === 'error') {
      return { status: 'error', message: result.data.message };
    }
    if (result.type === 'workspace_projections') {
      if (result.data.length === 0) return { status: 'empty' };
      return { status: 'ready', data: result.data };
    }
    return { status: 'error', message: 'Unexpected response type' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error loading workspaces' };
  }
}

export function loadChangeReport(): DataState<ChangeReportProjection> {
  try {
    const server = getMcpServer();
    if (!server.getContext()) {
      return { status: 'not_ready', reason: 'No analysis context loaded. Complete onboarding or select an environment.' };
    }
    const result = server.callTool('get_change_report');
    if (result.type === 'error') {
      return { status: 'error', message: result.data.message };
    }
    if (result.type === 'change_report') {
      if (!result.data) return { status: 'empty' };
      return { status: 'ready', data: result.data };
    }
    return { status: 'error', message: 'Unexpected response type' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error loading change report' };
  }
}

export function loadMap(mapType: string): DataState<MapDefinition> {
  try {
    const server = getMcpServer();
    if (!server.getContext()) {
      return { status: 'not_ready', reason: 'No analysis context loaded. Complete onboarding or select an environment.' };
    }
    const result = server.callTool('get_map', { map_type: mapType });
    if (result.type === 'error') {
      return { status: 'error', message: result.data.message };
    }
    if (result.type === 'map') {
      if (!result.data) return { status: 'empty' };
      return { status: 'ready', data: result.data };
    }
    return { status: 'error', message: 'Unexpected response type' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error loading map' };
  }
}

export function loadAllMaps(): DataState<MapDefinition[]> {
  const types = ['revenue_leakage', 'chargeback_risk', 'root_cause'];
  const maps: MapDefinition[] = [];

  for (const t of types) {
    const result = loadMap(t);
    if (result.status === 'not_ready') return result;
    if (result.status === 'error') return result;
    if (result.status === 'ready') maps.push(result.data);
  }

  if (maps.length === 0) return { status: 'empty' };
  return { status: 'ready', data: maps };
}

// ── Inventory ───────────────────────────────────

export interface InventorySurface {
  surface_id: string;
  label: string;
  normalized_path: string;
  host: string;
  page_type: string;
  is_commercial: boolean;
  is_live: boolean;
  last_seen_at: string | null;
  session_count: number;
  finding_count: number;
  discovery_sources: string[];
  http_status: number | null;
  title: string | null;
  description: string | null;
  response_time_ms: number | null;
  tier: string;
}

/**
 * Fetch inventory surfaces from the API endpoint.
 * Returns a promise-based DataState (unlike MCP-based loaders which are synchronous).
 */
export async function loadInventory(): Promise<DataState<InventorySurface[]>> {
  try {
    const res = await fetch('/api/inventory');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        return { status: 'not_ready', reason: 'Authentication required. Please sign in.' };
      }
      return { status: 'error', message: body.message || `HTTP ${res.status}` };
    }
    const json = await res.json();
    const data: InventorySurface[] = json.data ?? [];
    if (data.length === 0) return { status: 'empty' };
    return { status: 'ready', data };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error loading inventory' };
  }
}

export function loadAnswer(toolName: string, params: Record<string, unknown> = {}): DataState<McpAnswer> {
  try {
    const server = getMcpServer();
    if (!server.getContext()) {
      return { status: 'not_ready', reason: 'No analysis context loaded.' };
    }
    const result = server.callTool(toolName, params);
    if (result.type === 'error') {
      return { status: 'error', message: result.data.message };
    }
    if (result.type === 'answer') {
      return { status: 'ready', data: result.data };
    }
    return { status: 'error', message: 'Unexpected response type' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' };
  }
}
