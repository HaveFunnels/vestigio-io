import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Inventory API — Page Inventory Items
//
// GET → returns all PageInventoryItem rows for the user's first active
//       environment's website, plus the audit_status of the most recent
//       AuditCycle so the UI can show the "audit ongoing" banner.
//
// Auth: requires authenticated user with org membership.
// Scoping: user → membership → org → environment → website → pages
//
// session_count and finding_count are returned as `null` until the
// behavioral pipeline (Wave 0.2/0.3) and findings persistence (Wave 0.7)
// ship. The UI hides the column when 100% of rows are null.
// ──────────────────────────────────────────────

const COMMERCIAL_PAGE_TYPES = new Set(["checkout", "cart", "product", "pricing"]);

export const GET = withErrorTracking(async function GET() {
  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Find user's org via membership
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  if (!membership) {
    return NextResponse.json({
      data: [],
      audit_status: null,
      message: "No organization found",
    });
  }

  // Find the first environment for this org
  const environment = await prisma.environment.findFirst({
    where: { organizationId: membership.organizationId },
    select: { id: true },
  });

  if (!environment) {
    return NextResponse.json({
      data: [],
      audit_status: null,
      message: "No environment found",
    });
  }

  // Pull the latest audit cycle so the UI can show the live status banner.
  const latestCycle = await prisma.auditCycle.findFirst({
    where: { environmentId: environment.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, completedAt: true },
  });

  const auditStatus = latestCycle
    ? {
        cycle_id: latestCycle.id,
        status: latestCycle.status, // pending | running | complete | failed
        started_at: latestCycle.createdAt.toISOString(),
        completed_at: latestCycle.completedAt?.toISOString() ?? null,
      }
    : null;

  // Find the website for this environment
  const website = await prisma.website.findFirst({
    where: { environmentRef: environment.id },
    select: { id: true },
  });

  if (!website) {
    // Website is created lazily by the audit-runner worker. If it doesn't
    // exist yet, return an empty inventory but keep the audit_status so
    // the UI can show "audit pending..." instead of an empty state.
    return NextResponse.json({
      data: [],
      audit_status: auditStatus,
      message: "No website yet — first audit hasn't completed",
    });
  }

  // Query all PageInventoryItem rows for this website
  const items = await prisma.pageInventoryItem.findMany({
    where: { websiteRef: website.id },
    orderBy: { updatedAt: "desc" },
  });

  // Map to InventorySurface shape
  const surfaces = items.map((item) => {
    let host = "";
    try {
      host = new URL(item.normalizedUrl).hostname;
    } catch {
      // If normalizedUrl is a relative path, extract host from path
      const parts = item.normalizedUrl.split("/");
      host = parts[0] || "";
    }

    return {
      surface_id: item.id,
      label: item.title || item.path,
      normalized_path: item.normalizedUrl,
      host,
      page_type: item.pageType,
      is_commercial: COMMERCIAL_PAGE_TYPES.has(item.pageType),
      is_live: item.freshnessState === "fresh",
      last_seen_at: item.updatedAt.toISOString(),
      // Real numbers will arrive once Wave 0.2/0.3 (pixel) and Wave 0.7
      // (findings persistence) ship. The UI hides the column when null.
      session_count: null,
      finding_count: null,
      discovery_sources: ["surface"],
      http_status: item.statusCode ?? null,
      title: item.title ?? null,
      description: null,
      response_time_ms: null,
      tier: item.tier,
    };
  });

  return NextResponse.json({ data: surfaces, audit_status: auditStatus });
}, { endpoint: "/api/inventory", method: "GET" });
