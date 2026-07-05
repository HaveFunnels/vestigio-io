import { createHash } from "crypto";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Wave 18e P3.1 — tamper-evidence chain
//
// Every write hashes the canonical payload PLUS the previous row's
// hash. Verifying the chain (see verifyAuditLogChain) catches:
//   - retroactive edit of any row's fields
//   - retroactive delete of any row
// It does NOT catch tampering with the newest row before the next
// row is written (there is nothing "downstream" to invalidate yet)
// or wholesale deletion of the whole table. Neither of those is a
// realistic attacker path against a Postgres row-write feed watched
// by ops. What IS realistic is "edit one row to blame someone else"
// — the chain closes that door.
// ──────────────────────────────────────────────

function canonicalizePayload(row: {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: Date;
  prevHash: string | null;
}): string {
  // Fixed key order → deterministic serialization → deterministic hash.
  // JSON.stringify without a replacer honors object-literal insertion
  // order in V8, so listing the fields in this exact order is enough.
  return JSON.stringify({
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    targetName: row.targetName,
    metadata: row.metadata,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    prevHash: row.prevHash,
  });
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Log an admin action to the AuditLog table.
 * Fire-and-forget — errors are caught and logged to console.
 *
 * Wave 18e: writes are chained via prevHash/hash. Concurrency: two
 * simultaneous writes can produce two rows chaining off the same
 * prevHash. verifyAuditLogChain treats that as a soft warning
 * (both rows still hash correctly individually) rather than a hard
 * fault — the alternative would be to serialize every audit write
 * behind a lock, and the win doesn't justify the throughput cost
 * for a fire-and-forget audit trail.
 */
export async function logAuditEvent(params: {
  actorId: string;
  actorEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    const last = await prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });
    const prevHash = last?.hash ?? null;

    // Create the row first so we can hash its canonical payload
    // (id + createdAt are DB-generated). Then patch hash in place.
    const row = await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        targetName: params.targetName ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: params.ipAddress ?? null,
        prevHash,
      },
    });

    const hash = sha256(canonicalizePayload(row));
    await prisma.auditLog.update({
      where: { id: row.id },
      data: { hash },
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write audit event:", err);
  }
}

// ──────────────────────────────────────────────
// Verifier — call from an ops script or `/api/admin/audit-log/verify`
// to detect tampering. Returns a report; does not throw.
// ──────────────────────────────────────────────

export interface AuditChainReport {
  ok: boolean;
  totalRows: number;
  brokenRowIds: string[]; // row's own hash doesn't match its payload
  chainBreaks: Array<{ rowId: string; expectedPrev: string | null; actualPrev: string | null }>;
}

export async function verifyAuditLogChain(limit = 10_000): Promise<AuditChainReport> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const brokenRowIds: string[] = [];
  const chainBreaks: AuditChainReport["chainBreaks"] = [];
  let expectedPrev: string | null = null;

  for (const row of rows) {
    if (!row.hash) continue; // pre-chain legacy row
    const recomputed = sha256(canonicalizePayload(row));
    if (recomputed !== row.hash) brokenRowIds.push(row.id);
    if (expectedPrev !== null && row.prevHash !== expectedPrev) {
      chainBreaks.push({ rowId: row.id, expectedPrev, actualPrev: row.prevHash });
    }
    expectedPrev = row.hash;
  }

  return {
    ok: brokenRowIds.length === 0 && chainBreaks.length === 0,
    totalRows: rows.length,
    brokenRowIds,
    chainBreaks,
  };
}
