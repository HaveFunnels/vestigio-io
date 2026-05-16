import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Inventory API — Page Inventory Items
//
// GET → returns paginated PageInventoryItem rows for the user's active
//       environment's website, plus audit status and period-over-period
//       deltas computed from the previous cycle snapshot.
//
// Query params:
//   limit  — page size (1-500, default 200)
//   offset — pagination offset (default 0)
//
// Auth: requires authenticated user with org membership.
// ──────────────────────────────────────────────

import { isCommercialPageType } from "@/lib/page-type-colors";
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export const GET = withErrorTracking(async function GET(request: Request) {
  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Parse pagination params
  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  if (!membership) {
    return NextResponse.json({ message: "No organization found" }, { status: 404 });
  }

  // Respect active_env cookie so users with multiple envs see the right one
  const cookieStore = await import("next/headers").then((m) => m.cookies());
  const activeEnvId = cookieStore.get("active_env")?.value;

  let environment = activeEnvId
    ? await prisma.environment.findFirst({
        where: { id: activeEnvId, organizationId: membership.organizationId },
        select: { id: true },
      })
    : null;
  if (!environment) {
    environment = await prisma.environment.findFirst({
      where: { organizationId: membership.organizationId },
      orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
  }

  if (!environment) {
    return NextResponse.json({ message: "No environment found" }, { status: 404 });
  }

  const latestCycle = await prisma.auditCycle.findFirst({
    where: { environmentId: environment.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, completedAt: true },
  });

  const auditStatus = latestCycle
    ? {
        cycle_id: latestCycle.id,
        status: latestCycle.status,
        started_at: latestCycle.createdAt.toISOString(),
        completed_at: latestCycle.completedAt?.toISOString() ?? null,
      }
    : null;

  const website = await prisma.website.findFirst({
    where: { environmentRef: environment.id },
    select: { id: true },
  });

  if (!website) {
    return NextResponse.json({
      data: [],
      audit_status: auditStatus,
      pagination: { total: 0, limit, offset },
      deltas: null,
      lookups: { findings: false, sessions: false },
      message: "No website yet — first audit hasn't completed",
    });
  }

  // Total count (for pagination) + paginated query in parallel. Filter
  // out orphan-marked rows by default; an opt-in `?include_removed=1`
  // flag surfaces them for forensics.
  //
  // Wave 18n — also hide speculative critical-path probes that
  // never confirmed the URL exists on the customer's domain. The
  // crawler seeds /checkout, /pricing, /about, /contact, etc. as
  // candidates even before knowing the customer's actual layout;
  // when those return 404 (or never get fetched within budget),
  // they were still landing in inventory as "Not checked" rows,
  // confusing customers about what their site actually contains.
  //
  // Rule: hide rows where discoverySource = "critical_path" AND
  // statusCode is null/0/>=400 (we either never confirmed it, or
  // we did confirm it doesn't exist). Critical-path rows that
  // returned 2xx/3xx stay — those are confirmed real surfaces and
  // our speculation happened to be right.
  //
  // All other discovery sources (homepage_link, sitemap, internal_link,
  // pagination, behavioral_event, manual) keep their rows even when
  // statusCode is null — the URL came from the customer's own site
  // data, so it's "real" to them even if we haven't fetched yet.
  //
  // Opt-in via `?include_unchecked=1` for ops debugging.
  const includeRemoved = url.searchParams.get("include_removed") === "1";
  const includeUnchecked = url.searchParams.get("include_unchecked") === "1";
  const inventoryWhere: any = { websiteRef: website.id };
  if (!includeRemoved) inventoryWhere.removedAt = null;
  if (!includeUnchecked) {
    inventoryWhere.NOT = {
      AND: [
        { discoverySource: "critical_path" },
        {
          OR: [
            { statusCode: null },
            { statusCode: 0 },
            { statusCode: { gte: 400 } },
          ],
        },
      ],
    };
  }
  const [total, items] = await Promise.all([
    prisma.pageInventoryItem.count({ where: inventoryWhere }),
    prisma.pageInventoryItem.findMany({
      where: inventoryWhere,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  // Wave 15.3 — aggregates (findingCount, sessionCount30d, response_time)
  // come from denormalized columns on PageInventoryItem (written by the
  // audit-runner at cycle complete). This replaces 3 per-request queries
  // (Evidence findMany + Finding groupBy + RawBehavioralEvent groupBy)
  // with point reads on rows we already have in `items`.
  //
  // `hasFindingData` / `hasSessionData` are derived from whether ANY row
  // has aggregatesUpdatedAt set — a clean way to distinguish "0 means we
  // computed it and it's truly zero" from "0 means we haven't computed
  // yet" without per-cycle bookkeeping.
  const findingsLookupOk = true;
  const sessionsLookupOk = true;
  const hasFindingData = items.some(it => it.aggregatesUpdatedAt !== null) &&
    latestCycle?.status === "complete" && latestCycle.completedAt !== null;
  const hasSessionData = items.some(it => it.aggregatesUpdatedAt !== null && it.sessionCount30d > 0);

  // Previous completed cycle for period-over-period deltas
  const prevCycle = await prisma.auditCycle.findFirst({
    where: {
      environmentId: environment.id,
      status: "complete",
      NOT: latestCycle ? { id: latestCycle.id } : undefined,
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true },
  });

  // Period-over-period deltas: count rows + findings created since previous cycle
  let deltas: { total: number; findings: number } | null = null;
  if (prevCycle?.completedAt) {
    try {
      const [newPages, newFindings] = await Promise.all([
        prisma.pageInventoryItem.count({
          where: { websiteRef: website.id, createdAt: { gt: prevCycle.completedAt } },
        }),
        prisma.finding.count({
          where: { environmentId: environment.id, createdAt: { gt: prevCycle.completedAt } },
        }),
      ]);
      deltas = { total: newPages, findings: newFindings };
    } catch (err) {
      console.warn("[api/inventory] deltas computation failed:", err);
    }
  }

  const surfaces = items.map((item) => {
    let host = "";
    try {
      host = new URL(item.normalizedUrl).hostname;
    } catch {
      const parts = item.normalizedUrl.split("/");
      host = parts[0] || "";
    }

    // Multi-signal classified type takes priority over regex-based pageType
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
      // Parsed signal votes for the drawer's transparency block. We
      // tolerate empty/legacy values (pre-multi-signal rows store "[]"
      // or null) by returning [] in those cases.
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
      is_live: item.freshnessState === "fresh",
      last_seen_at: item.updatedAt.toISOString(),
      freshness_age: item.freshnessAge ?? null,
      // Wave 15.3 — point reads from denormalized columns. null when the
      // audit-runner hasn't computed aggregates for this row yet
      // (aggregatesUpdatedAt === null).
      session_count: hasSessionData ? item.sessionCount30d : null,
      finding_count: hasFindingData ? item.findingCount : null,
      // Wave 9.3 — per-URL audit trail.
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

  return NextResponse.json({
    data: surfaces,
    audit_status: auditStatus,
    pagination: { total, limit, offset },
    deltas,
    lookups: { findings: findingsLookupOk, sessions: sessionsLookupOk },
  });
}, { endpoint: "/api/inventory", method: "GET" });
