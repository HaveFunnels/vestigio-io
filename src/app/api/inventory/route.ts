import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { PrismaFindingStore } from "../../../../packages/projections";

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
// Wave 0.7: finding_count is now real (computed from the Finding table
// for the most recent cycle of this env, joined per-surface). Returns
// 0 (not null) when an env has a complete audit but a particular
// surface has no findings — that's distinct from the Wave 0.5 placeholder
// behavior where the entire column was null because findings didn't
// exist anywhere yet.
//
// session_count is still null until Wave 0.2/0.3 (pixel pipeline)
// ships. The UI hides any column that's 100% null.
// ──────────────────────────────────────────────

const COMMERCIAL_PAGE_TYPES = new Set(["checkout", "cart", "product", "pricing"]);

// Match a PageInventoryItem path to a finding surface. Findings declare
// their surface as a path string (e.g. "/checkout") which may differ
// slightly from the inventory's normalizedUrl. We match in priority:
//   1. Exact normalized path match (`/checkout` === `/checkout`)
//   2. Substring match in the URL (`/checkout` ∈ `/en/checkout/step-1`)
//   3. Surface "/" matches landing inventory items
function buildPathMatcher(surfaceCounts: Map<string, number>) {
  const surfaceList = [...surfaceCounts.entries()];
  return (normalizedUrl: string, path: string): number => {
    let total = 0;
    let matched = false;
    for (const [surface, count] of surfaceList) {
      if (surface === path || surface === normalizedUrl) {
        total += count;
        matched = true;
        continue;
      }
      // "/" surface only counts toward the landing item, not every page.
      if (surface === "/") {
        if (path === "/" || path === "") {
          total += count;
          matched = true;
        }
        continue;
      }
      // Substring fallback so that surface "/checkout" still matches an
      // inventory row at "/en/checkout/step-2".
      if (path.includes(surface)) {
        total += count;
        matched = true;
      }
    }
    return matched ? total : 0;
  };
}

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

  // Wave 0.7: pull real per-surface finding counts from the latest
  // complete cycle. Returns an empty Map if there are no findings yet
  // (e.g. very first audit hasn't completed) — in that case every
  // surface gets finding_count = 0 (visible) instead of null (hidden).
  const findingStore = new PrismaFindingStore(prisma);
  let surfaceCounts = new Map<string, number>();
  let hasFindingData = false;
  try {
    surfaceCounts = await findingStore.countBySurfaceForLatestCycle(environment.id);
    // We have finding data if EITHER the map has entries OR the latest
    // cycle exists with status complete (which means it ran but found 0).
    hasFindingData =
      surfaceCounts.size > 0 ||
      (latestCycle?.status === "complete" && latestCycle.completedAt !== null);
  } catch (err) {
    console.warn("[api/inventory] finding_count lookup failed:", err);
  }
  const matchSurface = buildPathMatcher(surfaceCounts);

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
      // session_count still null until pixel pipeline (Wave 0.2/0.3)
      session_count: null,
      // Wave 0.7: real finding count per surface from the latest cycle.
      // Null only when there's NO finding data at all (first audit
      // hasn't completed). 0 means audit ran and this surface had no
      // findings — which is good news, not missing data.
      finding_count: hasFindingData ? matchSurface(item.normalizedUrl, item.path) : null,
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
