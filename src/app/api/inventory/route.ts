import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Inventory API — Page Inventory Items
//
// GET → returns all PageInventoryItem rows for the
//       user's first active environment's website,
//       mapped to InventorySurface shape.
//
// Auth: requires authenticated user with org membership.
// Scoping: user → membership → org → environment → website → pages
// ──────────────────────────────────────────────

const COMMERCIAL_PAGE_TYPES = new Set(["checkout", "cart", "product", "pricing"]);

// TODO: Replace with real session tracking once analytics integration is live.
// For now, generate realistic demo counts based on page type.
const MOCK_SESSION_COUNTS: Record<string, number> = {
  landing: 1200,
  product: 450,
  checkout: 380,
  cart: 290,
  pricing: 320,
  blog: 180,
};
const DEFAULT_SESSION_COUNT = 50;

// TODO: Replace with real finding counts from Evidence query once
// evidence ↔ page path mapping is robust.
const MOCK_FINDING_COUNTS: Record<string, number> = {
  checkout: 4,
  cart: 2,
  product: 1,
  pricing: 1,
};
const DEFAULT_FINDING_COUNT = 0;

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
    return NextResponse.json({ data: [], message: "No organization found" });
  }

  // Find the first environment for this org
  const environment = await prisma.environment.findFirst({
    where: { organizationId: membership.organizationId },
    select: { id: true },
  });

  if (!environment) {
    return NextResponse.json({ data: [], message: "No environment found" });
  }

  // Find the website for this environment
  const website = await prisma.website.findFirst({
    where: { environmentRef: environment.id },
    select: { id: true },
  });

  if (!website) {
    return NextResponse.json({ data: [], message: "No website found" });
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
      session_count: MOCK_SESSION_COUNTS[item.pageType] ?? DEFAULT_SESSION_COUNT,
      finding_count: MOCK_FINDING_COUNTS[item.pageType] ?? DEFAULT_FINDING_COUNT,
      discovery_sources: ["surface"],
      http_status: item.statusCode ?? null,
      title: item.title ?? null,
      description: null,
      response_time_ms: null,
      tier: item.tier,
    };
  });

  return NextResponse.json({ data: surfaces });
}, { endpoint: "/api/inventory", method: "GET" });
