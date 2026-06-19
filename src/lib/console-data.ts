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

// Cross-tenant serialization mutex around ensureContext.
//
// The MCP server is a process-wide singleton (see src/lib/mcp-client.ts).
// ensureContext has multiple `await` points after `server.loadContext()`
// — notably the persisted-findings fetch which writes back into the
// CURRENT singleton context (`server.getContext().persistedFindings = …`).
// If two requests for different envs are racing, request B can swap the
// singleton out from under request A's persisted-findings write, ending
// up with env A's findings stored against env B's context.
//
// Wave 16's projections-cache fast-path bypasses ensureContext entirely
// for the common case, so this mutex only serializes the rare legacy
// fallback path. Latency cost is negligible; correctness is binary.
//
// The proper fix is to make MCP context per-request (no global singleton).
// That's a multi-day refactor on the roadmap; this mutex bridges until.
let _ensureContextChain: Promise<unknown> = Promise.resolve();

// ──────────────────────────────────────────────
// Wave 16 — projections cache fast path
//
// On every app page load the layout used to call ensureContext() which
// ran recomputeAll() + projectAll() synchronously. That loaded the full
// evidence array into memory (1GB+ on heavy cycles thanks to Wave 13/14
// off_site_recon + ContentEnrichment payloads) and caused app-wide 502
// OOM on serverless cold starts.
//
// Audit-runner now persists the full ProjectionResult as JSONB on the
// cycle row when the audit completes. This loader reads that cache
// directly and lets the layout serve all read pages (inventory,
// findings, actions, workspaces, maps) without ever touching MCP /
// recomputeAll.
//
// Falls back to null when no cache exists (legacy cycles, or the
// audit-runner deploy hasn't run a fresh cycle yet) — layout drops to
// the legacy MCP path in that case.
// ──────────────────────────────────────────────

export interface CachedProjections {
  findings: import('../../packages/projections/types').FindingProjection[];
  actions: import('../../packages/projections/types').ActionProjection[];
  workspaces: import('../../packages/projections/types').WorkspaceProjection[];
  change_report: import('../../packages/projections/types').ChangeReportProjection | null;
  maps: import('../../packages/maps').MapDefinition[];
  coherence_score: number;
  system_health: unknown;
  cached_at: string;
  cycle_ref: string;
}

export async function loadProjectionsCacheForEnv(envId: string): Promise<CachedProjections | null> {
  try {
    const { prisma } = await import('@/libs/prismaDb');
    const row = await prisma.auditCycle.findFirst({
      // Prisma JSON null filter: a null projectionsCache yields a missing
      // value in the row, so we filter at the application layer below.
      where: { environmentId: envId, status: 'complete' },
      orderBy: { completedAt: 'desc' },
      select: { id: true, projectionsCache: true },
    });
    if (!row?.projectionsCache) return null;
    const cached = row.projectionsCache as unknown as CachedProjections;

    // Wave 18t-B continuation — prefer the Action table for the actions
    // slice when it has rows for this cycle. The dual-write in
    // apps/audit-runner/run-cycle.ts populates the table going-forward;
    // legacy cycles (predating the table) still serve from the JSON blob
    // unchanged. The action rows carry the same full ActionProjection
    // payload in `projection` text, so the swap is purely cosmetic from
    // the caller's perspective — just a more queryable source.
    try {
      const actionRows = await prisma.action.findMany({
        where: { cycleId: row.id },
        select: { projection: true, priorityScore: true },
        orderBy: { priorityScore: 'desc' },
      });
      if (actionRows.length > 0) {
        const parsed = actionRows
          .map((r) => {
            try {
              return JSON.parse(r.projection) as CachedProjections['actions'][number];
            } catch {
              return null;
            }
          })
          .filter((a): a is CachedProjections['actions'][number] => a != null);
        if (parsed.length > 0) {
          cached.actions = parsed;
        }
      }
    } catch (err) {
      // Table not migrated yet or query failed — leave JSON-backed actions
      // alone, no regression vs pre-table behavior.
    }

    return cached;
  } catch (err) {
    return null;
  }
}

/**
 * Returns true when a cycle is currently in flight for the env.
 *
 * Used by the layout to short-circuit the legacy ensureContext path
 * when no projectionsCache exists yet AND a cycle is actively running.
 * Without this guard, the layout would try to bootstrap the MCP engine
 * from a partially-written cycle (up to 12k evidence rows + sync engine
 * recompute) — which competes with the audit-runner for Prisma
 * connections and ends up blocking the request for minutes. The
 * impersonation flow surfaced this because admins typically click
 * Impersonate during a first audit while there's no cache fallback.
 */
export async function hasRunningCycleForEnv(envId: string): Promise<boolean> {
  try {
    const { prisma } = await import('@/libs/prismaDb');
    const running = await prisma.auditCycle.count({
      where: { environmentId: envId, status: 'running' },
    });
    return running > 0;
  } catch (err) {
    // Fail-open: if the check itself errors, fall through to legacy
    // path so we don't break the happy case.
    return false;
  }
}

/**
 * Returns true when at least one completed cycle exists for the env —
 * regardless of whether that cycle wrote a projectionsCache. Used by
 * the layout to distinguish "true first audit ever" (show loading)
 * from "new cycle running but previous cycles have data" (show
 * existing data, don't trap the customer behind a spinner).
 *
 * Previously the layout treated any running cycle as "loading", which
 * locked customers out of /actions, /findings, /workspaces, etc when
 * a new audit started — even when the previous audit's data was still
 * fully populated. The right behavior is to keep showing what we have
 * while the new cycle works, and only block on loading when there's
 * genuinely no prior data anywhere.
 */
export async function hasCompletedCycleForEnv(envId: string): Promise<boolean> {
  try {
    const { prisma } = await import('@/libs/prismaDb');
    const count = await prisma.auditCycle.count({
      where: { environmentId: envId, status: 'complete' },
    });
    return count > 0;
  } catch (err) {
    return false;
  }
}

export async function ensureContext(orgCtx: {
  orgId: string;
  orgName: string;
  orgType?: string;
  envId: string;
  domain: string;
  engineTranslations?: import('../../packages/projections/types').EngineTranslations;
}): Promise<void> {
  // Serialize all ensureContext calls per Node process. See the
  // `_ensureContextChain` comment above for why.
  const previousChain = _ensureContextChain;
  let release!: () => void;
  _ensureContextChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previousChain;
  } catch {
    // previous chain rejected — irrelevant to us
  }
  try {
    return await _ensureContextBody(orgCtx);
  } finally {
    release();
  }
}

async function _ensureContextBody(orgCtx: {
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
  /** Detected A/B test platform (optimizely, vwo, google_optimize, …); null when none detected. */
  ab_test_platform: string | null;
  /** Locale code from <html lang="…">; null if not set. Used to surface multi-locale variants. */
  locale_code: string | null;
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
 * Server-side inventory loader. Mirrors GET /api/inventory but skips the
 * auth/membership/active_env steps the API route does (the layout's
 * resolveOrgContext already handed us the envId). Use this from server
 * components to preload inventory into McpDataProvider on first paint —
 * avoids the dev-mode cold-compile hang on /api/inventory where the
 * page would sit on "Carregando inventário…" for 30+ seconds even
 * though the underlying query takes under a second.
 *
 * Keep this in sync with the route at src/app/api/inventory/route.ts.
 */
export async function loadInventoryForEnv(envId: string): Promise<DataState<InventoryPayload>> {
  const limit = 200;
  const offset = 0;
  try {
    const { prisma } = await import('@/libs/prismaDb');
    const { isCommercialPageType } = await import('@/lib/page-type-colors');

    const latestCycle = await prisma.auditCycle.findFirst({
      where: { environmentId: envId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true, completedAt: true },
    });
    const audit_status: InventoryAuditStatus | null = latestCycle
      ? {
          cycle_id: latestCycle.id,
          status: latestCycle.status as InventoryAuditStatus['status'],
          started_at: latestCycle.createdAt.toISOString(),
          completed_at: latestCycle.completedAt?.toISOString() ?? null,
        }
      : null;

    const website = await prisma.website.findFirst({
      where: { environmentRef: envId },
      select: { id: true },
    });
    if (!website) {
      return {
        status: 'empty',
      };
    }

    // Same orphan + speculative-critical-path filter as the API route.
    // Keep these in sync by hand for now; the alternative is exporting
    // the where clause from the route, which couples server vs route
    // imports in ways that have caused subtle bugs.
    const inventoryWhere: Record<string, unknown> = {
      websiteRef: website.id,
      removedAt: null,
      NOT: {
        AND: [
          { discoverySource: 'critical_path' },
          {
            OR: [
              { statusCode: null },
              { statusCode: 0 },
              { statusCode: { gte: 400 } },
            ],
          },
        ],
      },
    };

    const [total, items] = await Promise.all([
      prisma.pageInventoryItem.count({ where: inventoryWhere as never }),
      prisma.pageInventoryItem.findMany({
        where: inventoryWhere as never,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const hasFindingData =
      items.some((it) => it.aggregatesUpdatedAt !== null) &&
      latestCycle?.status === 'complete' &&
      latestCycle.completedAt !== null;
    const hasSessionData = items.some(
      (it) => it.aggregatesUpdatedAt !== null && it.sessionCount30d > 0,
    );

    const prevCycle = await prisma.auditCycle.findFirst({
      where: {
        environmentId: envId,
        status: 'complete',
        NOT: latestCycle ? { id: latestCycle.id } : undefined,
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true, completedAt: true },
    });

    let deltas: InventoryDeltas | null = null;
    if (prevCycle?.completedAt) {
      try {
        const [newPages, newFindings] = await Promise.all([
          prisma.pageInventoryItem.count({
            where: { websiteRef: website.id, createdAt: { gt: prevCycle.completedAt } },
          }),
          prisma.finding.count({
            where: { environmentId: envId, createdAt: { gt: prevCycle.completedAt } },
          }),
        ]);
        deltas = { total: newPages, findings: newFindings };
      } catch (err) {
      }
    }

    const surfaces: InventorySurface[] = items.map((item) => {
      let host = '';
      try {
        host = new URL(item.normalizedUrl).hostname;
      } catch {
        host = item.normalizedUrl.split('/')[0] || '';
      }
      const effectiveType = item.classifiedPageType || item.pageType;
      return {
        surface_id: item.id,
        label: item.title || item.path,
        normalized_path: item.normalizedUrl,
        path: item.path,
        host,
        page_type: effectiveType,
        classified_page_type: item.classifiedPageType ?? null,
        classification_confidence: item.classificationConfidence ?? null,
        classification_signals: (() => {
          if (!item.classificationSignals) return [];
          try {
            const parsed = JSON.parse(item.classificationSignals);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        is_commercial: isCommercialPageType(effectiveType),
        is_live: item.freshnessState === 'fresh',
        last_seen_at: item.updatedAt.toISOString(),
        freshness_age: item.freshnessAge ?? null,
        session_count: hasSessionData ? item.sessionCount30d : null,
        finding_count: hasFindingData ? item.findingCount : null,
        discovery_source: item.discoverySource ?? null,
        skip_reason: item.skipReason ?? null,
        ab_test_platform: item.abTestPlatform ?? null,
        locale_code: item.localeCode ?? null,
        http_status: item.statusCode ?? null,
        title: item.title ?? null,
        description: null,
        response_time_ms: item.lastResponseTimeMs ?? null,
        tier: item.tier,
      };
    });

    if (
      surfaces.length === 0 &&
      (!audit_status || audit_status.status === 'complete' || audit_status.status === 'failed')
    ) {
      return { status: 'empty' };
    }

    return {
      status: 'ready',
      data: {
        surfaces,
        audit_status,
        pagination: { total, limit, offset },
        deltas,
        lookups: { findings: true, sessions: true },
      },
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error preloading inventory',
    };
  }
}

/**
 * Fetch inventory surfaces + the latest audit_status for the live banner.
 * Returns a promise-based DataState. Even when `surfaces` is empty, the
 * caller can still inspect `audit_status` to know whether the audit is
 * in progress (data will arrive shortly) or there genuinely isn't any.
 */
export async function loadInventory(params?: { limit?: number; offset?: number }): Promise<DataState<InventoryPayload>> {
  // Bounded fetch so a hung server (Prisma deadlock, audit-runner pegged
  // on CPU, upstream outage) never leaves the inventory page spinning
  // forever. After 45s we surface an error state with a retry button
  // instead of an infinite "Carregando inventário…".
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  try {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const res = await fetch('/api/inventory' + (qs.size > 0 ? `?${qs}` : ''), {
      signal: controller.signal,
    });
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
    const aborted = (err as { name?: string } | null)?.name === 'AbortError';
    return {
      status: 'error',
      message: aborted
        ? 'Tempo limite atingido carregando o inventário. Tente novamente em alguns segundos.'
        : err instanceof Error
          ? err.message
          : 'Unknown error loading inventory',
    };
  } finally {
    clearTimeout(timeoutId);
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
