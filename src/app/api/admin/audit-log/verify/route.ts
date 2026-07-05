import { NextResponse } from "next/server";
import { requireAdmin } from "@/libs/require-admin";
import { verifyAuditLogChain } from "@/libs/audit-log";

// ──────────────────────────────────────────────
// GET /api/admin/audit-log/verify
//
// Verifies the AuditLog hash chain (Wave 18e P3.1). Returns the
// number of rows scanned and any hash mismatches or chain breaks
// discovered. `ok: true` means the chain fully verifies.
//
// Query params:
//   ?limit=10000  (default 10k rows from oldest → newest)
//
// Intended for ops. Read-only. Rate-limited by requireAdmin's DB
// re-check + a caller-level rule outside this endpoint.
// ──────────────────────────────────────────────

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  const url = new URL(request.url);
  const raw = url.searchParams.get("limit");
  const limit = raw ? Math.min(Math.max(parseInt(raw, 10) || 10_000, 1), 100_000) : 10_000;

  const report = await verifyAuditLogChain(limit);
  return NextResponse.json(report);
}
