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
// Demo mode flag — set by ensureContext when orgId === "demo" so
// downstream loaders return rich demo data instead of empty state.
let _demoMode = false;
export function isDemoMode(): boolean { return _demoMode; }

// Track the DB cycle ref that was last loaded into the MCP server.
// Used to detect when a new cycle completed after the initial load,
// so ensureContext can reload instead of serving stale projections.
let _loadedCycleRef: string | null = null;

export async function ensureContext(orgCtx: {
  orgId: string;
  orgName: string;
  orgType?: string;
  envId: string;
  domain: string;
  engineTranslations?: import('../../packages/projections/types').EngineTranslations;
}): Promise<void> {
  const isDemo =
    orgCtx.orgType === 'demo' ||
    orgCtx.orgId === 'demo' ||
    orgCtx.orgId === 'demo_org';
  if (isDemo) {
    _demoMode = true;
    // Phase 3.2: inject locale translations so demo data renders in the user's language
    const { setDemoTranslations } = require('./demo-data');
    setDemoTranslations(orgCtx.engineTranslations);
    return;
  }
  _demoMode = false;
  try {
    // initMcpServer uses `await import()` to handle the async McpServer module.
    // A synchronous require() fails silently because webpack wraps McpServer
    // in an async module (due to playwright deps), returning undefined exports.
    const server = await initMcpServer();

    // Dynamic imports to keep Prisma out of client bundles
    const { prisma } = await import('@/libs/prismaDb');
    const { PrismaEvidenceStore } = await import('../../packages/evidence');
    const { PrismaSnapshotStore } = await import('../../packages/change-detection');
    const { bootstrapMcpContextSync } = await import('../../apps/mcp/bootstrap');

    const store = new PrismaEvidenceStore(prisma);
    const workspaceRef = `workspace:${orgCtx.orgId}`;
    const environmentRef = `environment:${orgCtx.envId}`;

    const { evidence, cycleRef } = await store.loadLatestCycle(workspaceRef, environmentRef);
    if (evidence.length === 0 || !cycleRef) return; // no persisted data yet

    // Check if context is already loaded AND fresh (same cycle). If a new
    // cycle completed since the last load, we must reload so the UI shows
    // the latest findings/actions/workspaces. Without this check, the MCP
    // singleton stays stale until the next server restart — causing the
    // "copy shows em breve" and "new actions missing" bugs.
    if (server.getContext() && _loadedCycleRef === cycleRef) return;

    // Wave 0.7: load the previous snapshot so the rehydrated MCP context
    // produces a change_report and findings carry change_class. The
    // PrismaSnapshotStore returns null cleanly if no snapshot exists yet
    // (e.g. legacy cycles from before Wave 0.7) — in that case the engine
    // still works, just without change detection.
    let previousSnapshot = null;
    try {
      const snapshotStore = new PrismaSnapshotStore(prisma);
      const prev = await snapshotStore.asyncGetLatest(workspaceRef, environmentRef);
      previousSnapshot = prev?.snapshot ?? null;
    } catch (err) {
      console.warn('[ensureContext] previous snapshot lookup failed:', err);
    }

    const domain = orgCtx.domain.replace(/^https?:\/\//, '').split('/')[0];
    const landingUrl = orgCtx.domain.startsWith('http')
      ? orgCtx.domain
      : `https://${orgCtx.domain}`;

    bootstrapMcpContextSync(server, {
      organization_id: orgCtx.orgId,
      organization_name: orgCtx.orgName,
      environment_id: orgCtx.envId,
      domain,
      landing_url: landingUrl,
      is_production: process.env.NODE_ENV === 'production',
    }, evidence, store, orgCtx.engineTranslations, previousSnapshot);

    // Load persisted findings from DB as supplement for the MCP context.
    // This ensures findings from previous cold cycles (with LLM enrichment)
    // don't disappear when the latest cycle is warm (no LLM).
    try {
      const { PrismaFindingStore } = await import('../../packages/projections');
      const findingStore = new PrismaFindingStore(prisma);
      const result = await findingStore.loadLatestForEnvironment(orgCtx.envId);
      if (result && result.findings.length > 0) {
        const ctx = server.getContext();
        if (ctx) {
          ctx.persistedFindings = result.findings;
        }
      }
    } catch {
      // Non-fatal — hot-path findings still work, just without supplement
    }

    _loadedCycleRef = cycleRef;
  } catch (err) {
    console.error('[ensureContext] Failed to bootstrap MCP context:', err);
  }
}

export function loadFindings(): DataState<FindingProjection[]> {
  if (_demoMode) {
    const { getDemoFindings } = require('./demo-data');
    return { status: 'ready', data: getDemoFindings() };
  }
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
  if (_demoMode) {
    const { DEMO_ACTIONS } = require('./demo-data');
    return { status: 'ready', data: DEMO_ACTIONS };
  }
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
  if (_demoMode) {
    const { getDemoWorkspaces } = require('./demo-data');
    const ws = getDemoWorkspaces();
    return ws.length > 0 ? { status: 'ready', data: ws } : { status: 'empty' };
  }
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
  if (_demoMode) {
    const { getDemoChangeReport } = require('./demo-data');
    const cr = getDemoChangeReport();
    return cr ? { status: 'ready', data: cr } : { status: 'empty' };
  }
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
  if (_demoMode) {
    const { buildDemoEngineMaps } = require('./demo-data');
    const maps = buildDemoEngineMaps();
    return maps.length > 0 ? { status: 'ready', data: maps } : { status: 'empty' };
  }

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
  /** Full canonical URL (https://host/path). Used as a stable identifier. */
  normalized_path: string;
  /** Path portion only (e.g. "/checkout"). Use this for display next to host. */
  path: string;
  host: string;
  page_type: string;
  /** Multi-signal classified type (null if not yet classified). */
  classified_page_type: string | null;
  /** 0-100 agreement ratio between classification signals. */
  classification_confidence: number | null;
  /** Per-signal votes ([{source, vote, weight}, ...]); empty array if not classified. */
  classification_signals: Array<{ source: string; vote: string; weight: number }>;
  is_commercial: boolean;
  is_live: boolean;
  last_seen_at: string | null;
  /** Seconds since last HTTP check (null when never checked). */
  freshness_age: number | null;
  session_count: number | null;
  finding_count: number | null;
  /** Where this URL was first surfaced (homepage_link, sitemap, etc.); null on legacy rows. */
  discovery_source: string | null;
  /** Reason a discovered URL didn't return a fresh fetch this cycle; null on fresh rows. */
  skip_reason: string | null;
  http_status: number | null;
  title: string | null;
  description: string | null;
  response_time_ms: number | null;
  tier: string;
}

export interface InventoryAuditStatus {
  cycle_id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  started_at: string;
  completed_at: string | null;
}

export interface InventoryPagination {
  total: number;
  limit: number;
  offset: number;
}

export interface InventoryDeltas {
  total: number;
  findings: number;
}

export interface InventoryLookups {
  findings: boolean;
  sessions: boolean;
}

export interface InventoryPayload {
  surfaces: InventorySurface[];
  audit_status: InventoryAuditStatus | null;
  pagination: InventoryPagination;
  deltas: InventoryDeltas | null;
  lookups: InventoryLookups;
}

/**
 * Fetch inventory surfaces + the latest audit_status for the live banner.
 * Returns a promise-based DataState. Even when `surfaces` is empty, the
 * caller can still inspect `audit_status` to know whether the audit is
 * in progress (data will arrive shortly) or there genuinely isn't any.
 */
export async function loadInventory(params?: { limit?: number; offset?: number }): Promise<DataState<InventoryPayload>> {
  try {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const res = await fetch('/api/inventory' + (qs.size > 0 ? `?${qs}` : ''));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        return { status: 'not_ready', reason: 'Authentication required. Please sign in.' };
      }
      if (res.status === 404) {
        return { status: 'empty' };
      }
      return { status: 'error', message: body.message || `HTTP ${res.status}` };
    }
    const json = await res.json();
    const surfaces: InventorySurface[] = json.data ?? [];
    const audit_status: InventoryAuditStatus | null = json.audit_status ?? null;
    const pagination: InventoryPagination = json.pagination ?? { total: surfaces.length, limit: 200, offset: 0 };
    const deltas: InventoryDeltas | null = json.deltas ?? null;
    const lookups: InventoryLookups = json.lookups ?? { findings: true, sessions: true };

    if (surfaces.length === 0 && (!audit_status || audit_status.status === 'complete' || audit_status.status === 'failed')) {
      return { status: 'empty' };
    }
    return { status: 'ready', data: { surfaces, audit_status, pagination, deltas, lookups } };
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
