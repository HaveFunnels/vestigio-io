import { McpServer } from './server';
import { McpRequestScope } from './types';
import { Evidence } from '../../packages/domain';
import { BusinessInputs } from '../../packages/impact';
import { runIngestion, IngestionInput } from '../../workers/ingestion/pipeline';
import { PrismaEvidenceStore } from '../../packages/evidence';

// ──────────────────────────────────────────────
// MCP Context Bootstrap — HARDENED
//
// Deterministic initialization from organization data.
// NEVER silently fallback. NEVER partially initialize.
//
// Rules:
// - same inputs → same context (deterministic cycle_ref)
// - no evidence → explicit BootstrapError
// - no context loaded → server.getContext() returns null
// ──────────────────────────────────────────────

export class BootstrapError extends Error {
  constructor(
    message: string,
    public readonly code: 'no_evidence' | 'no_audit_cycle' | 'ingestion_failed' | 'invalid_input',
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export interface BootstrapInput {
  organization_id: string;
  organization_name: string;
  environment_id: string;
  domain: string;
  landing_url: string;
  is_production: boolean;
  audit_cycle_id?: string;
  business_inputs?: BusinessInputs | null;
  existing_evidence?: Evidence[];
}

export type BootstrapResult =
  | { status: 'ready'; evidence_count: number; cycle_ref: string }
  | { status: 'no_data'; reason: string }
  | { status: 'error'; message: string };

/**
 * Synchronous bootstrap from pre-fetched evidence.
 * Fails explicitly if evidence is empty.
 *
 * Also persists evidence to PostgreSQL (best-effort, async fire-and-forget)
 * so it survives server restarts.
 *
 * Wave 0.7: callers can pass `previousSnapshot` (pre-loaded from
 * PrismaSnapshotStore) so the rehydrated MCP context has change_class
 * populated on findings without anyone hitting Prisma from inside
 * the synchronous engine assembly path.
 */
export function bootstrapMcpContextSync(
  server: McpServer,
  input: BootstrapInput,
  evidence: Evidence[],
  prismaEvidenceStore?: PrismaEvidenceStore,
  translations?: import('../../packages/projections/types').EngineTranslations,
  previousSnapshot?: import('../../packages/change-detection').CycleSnapshot | null,
): BootstrapResult {
  if (!input.organization_id || !input.environment_id || !input.domain) {
    return { status: 'error', message: 'Invalid input: organization_id, environment_id, and domain are required.' };
  }

  if (evidence.length === 0) {
    return { status: 'no_data', reason: 'No evidence available. Run an audit cycle first.' };
  }

  const scope = buildScope(input);
  const cycleRef = buildCycleRef(input);

  server.loadContext(evidence, scope, cycleRef, input.domain, input.landing_url, translations, previousSnapshot);

  // Persist evidence to DB (best-effort, fire-and-forget)
  if (prismaEvidenceStore) {
    prismaEvidenceStore.addMany(evidence).catch(() => {});
  }

  return { status: 'ready', evidence_count: evidence.length, cycle_ref: cycleRef };
}

/**
 * Async bootstrap — tries DB first, then runs ingestion if needed.
 * Returns explicit result, never throws silently.
 *
 * Loading order:
 * 1. Use input.existing_evidence if provided
 * 2. Try loading from PrismaEvidenceStore (DB) for the workspace+environment
 * 3. Fall back to running fresh ingestion
 */
export async function bootstrapMcpContext(
  server: McpServer,
  input: BootstrapInput,
  prismaEvidenceStore?: PrismaEvidenceStore,
): Promise<BootstrapResult> {
  if (!input.organization_id || !input.environment_id || !input.domain) {
    return { status: 'error', message: 'Invalid input: organization_id, environment_id, and domain are required.' };
  }

  const scope = buildScope(input);
  const cycleRef = buildCycleRef(input);

  let evidence: Evidence[];
  let effectiveCycleRef = cycleRef;

  if (input.existing_evidence && input.existing_evidence.length > 0) {
    evidence = input.existing_evidence;
  } else {
    // Try loading from DB first (survives server restarts)
    if (prismaEvidenceStore) {
      try {
        const dbResult = await prismaEvidenceStore.loadLatestCycle(
          scope.workspace_ref,
          scope.environment_ref,
        );
        if (dbResult.evidence.length > 0 && dbResult.cycleRef) {
          evidence = dbResult.evidence;
          effectiveCycleRef = dbResult.cycleRef;

          server.loadContext(evidence, scope, effectiveCycleRef, input.domain, input.landing_url);
          return { status: 'ready', evidence_count: evidence.length, cycle_ref: effectiveCycleRef };
        }
      } catch {
        // DB load failed — fall through to ingestion
      }
    }

    try {
      const ingestionInput: IngestionInput = {
        domain: input.landing_url,
        workspace_ref: scope.workspace_ref,
        environment_ref: scope.environment_ref,
        website_ref: scope.subject_ref || `website:${input.domain}`,
        cycle_ref: cycleRef,
      };
      const result = await runIngestion(ingestionInput);
      evidence = result.evidence;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown ingestion error';
      return { status: 'error', message: `Ingestion failed: ${msg}` };
    }
  }

  if (evidence.length === 0) {
    return { status: 'no_data', reason: 'Ingestion produced no evidence for this domain.' };
  }

  server.loadContext(evidence, scope, effectiveCycleRef, input.domain, input.landing_url);

  // Persist newly ingested evidence to DB (best-effort)
  if (prismaEvidenceStore) {
    prismaEvidenceStore.addMany(evidence).catch(() => {});
  }

  return { status: 'ready', evidence_count: evidence.length, cycle_ref: effectiveCycleRef };
}

// ──────────────────────────────────────────────
// Deterministic helpers
// ──────────────────────────────────────────────

function buildScope(input: BootstrapInput): McpRequestScope {
  return {
    workspace_ref: `workspace:${input.organization_id}`,
    environment_ref: `environment:${input.environment_id}`,
    subject_ref: `website:${input.domain}`,
  };
}

/**
 * Deterministic cycle ref: same org + env + audit_cycle_id → same ref.
 * Falls back to org+env combo if no audit_cycle_id provided.
 */
function buildCycleRef(input: BootstrapInput): string {
  if (input.audit_cycle_id) {
    return `audit_cycle:${input.audit_cycle_id}`;
  }
  return `audit_cycle:${input.organization_id}_${input.environment_id}`;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

export function normalizeLandingUrl(url: string): string {
  if (!url.startsWith('http')) {
    return `https://${url}`;
  }
  return url;
}
