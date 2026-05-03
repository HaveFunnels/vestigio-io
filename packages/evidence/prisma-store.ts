import type { Evidence, EvidenceType } from '../domain';
import type { EvidenceQuery } from './store';

// ──────────────────────────────────────────────
// PrismaEvidenceStore — PostgreSQL-backed evidence persistence
//
// Works alongside the in-memory EvidenceStore.
// - add/addMany persist via upsert (cycleRef + evidenceKey)
// - query translates EvidenceQuery to Prisma where clauses
// - payload is JSON.stringify'd on save, JSON.parse'd on read
// ──────────────────────────────────────────────

/**
 * Map a domain Evidence object to a Prisma row for upsert.
 */
function toPrismaData(e: Evidence): Record<string, unknown> {
  return {
    id: e.id,
    evidenceKey: e.evidence_key,
    evidenceType: e.evidence_type,
    subjectRef: e.scoping.subject_ref,
    workspaceRef: e.scoping.workspace_ref,
    environmentRef: e.scoping.environment_ref,
    pathScope: e.scoping.path_scope ?? null,
    cycleRef: e.cycle_ref,
    observedAt: e.freshness.observed_at,
    freshUntil: e.freshness.fresh_until ?? null,
    freshnessState: e.freshness.freshness_state,
    stalenessReason: e.freshness.staleness_reason ?? null,
    sourceKind: e.source_kind,
    collectionMethod: e.collection_method,
    qualityScore: e.quality_score,
    payload: JSON.stringify(e.payload),
    // Wave 5 Fase 3 — null for evidence types that don't have a source
    // body (anything besides HttpResponse today).
    contentHash: e.content_hash ?? null,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

/**
 * Map a Prisma row back to a domain Evidence object.
 */
function fromPrismaRow(row: any): Evidence {
  return {
    id: row.id,
    evidence_key: row.evidenceKey,
    evidence_type: row.evidenceType as EvidenceType,
    subject_ref: row.subjectRef,
    scoping: {
      workspace_ref: row.workspaceRef,
      environment_ref: row.environmentRef,
      subject_ref: row.subjectRef,
      path_scope: row.pathScope ?? null,
    },
    cycle_ref: row.cycleRef,
    freshness: {
      observed_at: row.observedAt,
      fresh_until: row.freshUntil ?? row.observedAt,
      freshness_state: row.freshnessState,
      staleness_reason: row.stalenessReason ?? null,
    },
    source_kind: row.sourceKind,
    collection_method: row.collectionMethod,
    quality_score: row.qualityScore,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    // Wave 5 Fase 3 — roundtrip for incremental reuse lookups.
    content_hash: row.contentHash ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export class PrismaEvidenceStore {
  constructor(private prisma: any) {}

  /**
   * Persist a single evidence item (upsert on cycleRef + evidenceKey).
   */
  async add(evidence: Evidence): Promise<void> {
    const data = toPrismaData(evidence);
    const { id: _id, ...updateData } = data;
    await this.prisma.evidence.upsert({
      where: {
        cycleRef_evidenceKey: {
          cycleRef: evidence.cycle_ref,
          evidenceKey: evidence.evidence_key,
        },
      },
      create: data,
      update: updateData,
    }).catch(() => {});
  }

  /**
   * Persist many evidence items using batched INSERT ... ON CONFLICT DO UPDATE.
   *
   * Wave 7.3 — replaces the sequential upsert loop (N round-trips) with
   * chunked raw SQL (ceil(N/80) round-trips). For 300 evidence items this
   * reduces persistence from ~10-15s to <500ms (10-50x improvement).
   *
   * Batch size 80: each row has 18 columns → 80 × 18 = 1440 params per
   * statement, well within PostgreSQL's 65535 parameter limit.
   */
  async addMany(items: Evidence[]): Promise<void> {
    if (items.length === 0) return;

    const BATCH_SIZE = 80;

    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const batch = items.slice(offset, offset + BATCH_SIZE);
      const params: unknown[] = [];
      const valueRows: string[] = [];

      for (const e of batch) {
        const data = toPrismaData(e);
        const baseIdx = params.length;
        params.push(
          data.id,                // $baseIdx+1
          data.evidenceKey,       // $baseIdx+2
          data.evidenceType,      // $baseIdx+3
          data.subjectRef,        // $baseIdx+4
          data.workspaceRef,      // $baseIdx+5
          data.environmentRef,    // $baseIdx+6
          data.pathScope,         // $baseIdx+7
          data.cycleRef,          // $baseIdx+8
          data.observedAt,        // $baseIdx+9
          data.freshUntil,        // $baseIdx+10
          data.freshnessState,    // $baseIdx+11
          data.stalenessReason,   // $baseIdx+12
          data.sourceKind,        // $baseIdx+13
          data.collectionMethod,  // $baseIdx+14
          data.qualityScore,      // $baseIdx+15
          data.payload,           // $baseIdx+16
          data.contentHash,       // $baseIdx+17
          data.createdAt,         // $baseIdx+18
        );
        const placeholders = Array.from({ length: 18 }, (_, i) => `$${baseIdx + i + 1}`);
        valueRows.push(`(${placeholders.join(', ')})`);
      }

      const sql = `
        INSERT INTO "Evidence" (
          "id", "evidenceKey", "evidenceType", "subjectRef",
          "workspaceRef", "environmentRef", "pathScope", "cycleRef",
          "observedAt", "freshUntil", "freshnessState", "stalenessReason",
          "sourceKind", "collectionMethod", "qualityScore", "payload",
          "contentHash", "createdAt"
        )
        VALUES ${valueRows.join(',\n               ')}
        ON CONFLICT ("cycleRef", "evidenceKey") DO UPDATE SET
          "evidenceType"     = EXCLUDED."evidenceType",
          "subjectRef"       = EXCLUDED."subjectRef",
          "workspaceRef"     = EXCLUDED."workspaceRef",
          "environmentRef"   = EXCLUDED."environmentRef",
          "pathScope"        = EXCLUDED."pathScope",
          "observedAt"       = EXCLUDED."observedAt",
          "freshUntil"       = EXCLUDED."freshUntil",
          "freshnessState"   = EXCLUDED."freshnessState",
          "stalenessReason"  = EXCLUDED."stalenessReason",
          "sourceKind"       = EXCLUDED."sourceKind",
          "collectionMethod" = EXCLUDED."collectionMethod",
          "qualityScore"     = EXCLUDED."qualityScore",
          "payload"          = EXCLUDED."payload",
          "contentHash"      = EXCLUDED."contentHash",
          "updatedAt"        = NOW()
      `;

      await this.prisma.$executeRawUnsafe(sql, ...params);
    }
  }

  /**
   * Get a single evidence item by id.
   */
  async get(id: string): Promise<Evidence | undefined> {
    const row = await this.prisma.evidence.findUnique({ where: { id } });
    return row ? fromPrismaRow(row) : undefined;
  }

  /**
   * Query evidence with filters matching the in-memory EvidenceQuery interface.
   */
  async query(q: EvidenceQuery): Promise<Evidence[]> {
    const where: Record<string, unknown> = {};

    if (q.cycle_ref) where.cycleRef = q.cycle_ref;
    if (q.environment_ref) where.environmentRef = q.environment_ref;
    if (q.subject_ref) where.subjectRef = q.subject_ref;
    if (q.evidence_type) where.evidenceType = q.evidence_type;
    if (q.workspace_ref) where.workspaceRef = q.workspace_ref;

    const rows = await this.prisma.evidence.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(fromPrismaRow);
  }

  /**
   * Get all evidence for a given cycle.
   */
  async getByCycle(cycleRef: string): Promise<Evidence[]> {
    return this.query({ cycle_ref: cycleRef });
  }

  /**
   * Get evidence by cycle and type.
   */
  async getByType(cycleRef: string, type: EvidenceType): Promise<Evidence[]> {
    return this.query({ cycle_ref: cycleRef, evidence_type: type });
  }

  /**
   * Count total evidence rows.
   */
  async count(): Promise<number> {
    return this.prisma.evidence.count();
  }

  /**
   * Delete all evidence rows (use with care).
   */
  async clear(): Promise<void> {
    await this.prisma.evidence.deleteMany({});
  }

  /**
   * Load all evidence for a workspace + environment combination.
   * Useful for restoring context after server restart.
   */
  async loadForContext(workspaceRef: string, environmentRef: string): Promise<Evidence[]> {
    const rows = await this.prisma.evidence.findMany({
      where: { workspaceRef, environmentRef },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(fromPrismaRow);
  }

  /**
   * Load the most recent evidence for a given workspace + environment,
   * grouped by the latest cycle.
   */
  async loadLatestCycle(workspaceRef: string, environmentRef: string): Promise<{
    evidence: Evidence[];
    cycleRef: string | null;
  }> {
    // Find the most recent evidence row to get its cycleRef
    const latest = await this.prisma.evidence.findFirst({
      where: { workspaceRef, environmentRef },
      orderBy: { createdAt: 'desc' },
      select: { cycleRef: true },
    });

    if (!latest) {
      return { evidence: [], cycleRef: null };
    }

    const rows = await this.prisma.evidence.findMany({
      where: { workspaceRef, environmentRef, cycleRef: latest.cycleRef },
      orderBy: { createdAt: 'desc' },
    });

    return {
      evidence: rows.map(fromPrismaRow),
      cycleRef: latest.cycleRef,
    };
  }
}
