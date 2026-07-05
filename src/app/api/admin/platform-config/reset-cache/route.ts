import { invalidatePlanCache } from "@/libs/plan-config";
import { requireAdmin } from "@/libs/require-admin";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// POST /api/admin/platform-config/reset-cache
//
// Clears the in-memory plan config cache so the
// next call to getPlanConfigs() re-reads from DB.
// Useful after admin edits pricing or plan limits.
// ──────────────────────────────────────────────

export async function POST() {
  try {
    const gate = await requireAdmin();
    if (gate.denied) return gate.denied;

    invalidatePlanCache();

    return NextResponse.json({ ok: true, message: "Cache invalidated" });
  } catch (err: any) {
    console.error("[reset-cache POST]", err);
    return NextResponse.json(
      { message: err?.message || "Internal error" },
      { status: 500 },
    );
  }
}
