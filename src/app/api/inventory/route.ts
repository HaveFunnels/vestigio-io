import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { PrismaFindingStore } from "../../../../packages/projections";

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
      if (surface === "/") {
        if (path === "/" || path === "") {
          total += count;
          matched = true;
        }
        continue;
      }
      if (path.includes(surface)) {
        total += count;
        matched = true;
      }
    }
    return matched ? total : 0;
  };
}

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
  const includeRemoved = url.searchParams.get("include_removed") === "1";
  const inventoryWhere = includeRemoved
    ? { websiteRef: website.id }
    : { websiteRef: website.id, removedAt: null };
  const [total, items] = await Promise.all([
    prisma.pageInventoryItem.count({ where: inventoryWhere }),
    prisma.pageInventoryItem.findMany({
      where: inventoryWhere,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  // Lookup finding/session counts in parallel with Promise.allSettled so
  // one failure doesn't hide both columns silently.
  const findingStore = new PrismaFindingStore(prisma);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Previous completed cycle for period-over-period deltas
  const prevCyclePromise = prisma.auditCycle.findFirst({
    where: {
      environmentId: environment.id,
      status: "complete",
      NOT: latestCycle ? { id: latestCycle.id } : undefined,
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true },
  });

  const [findingResult, sessionResult, prevCycleResult] = await Promise.allSettled([
    findingStore.countBySurfaceForLatestCycle(environment.id),
    prisma.$queryRaw<Array<{ url: string; session_count: number }>>`
      SELECT url, COUNT(DISTINCT "sessionId")::int AS session_count
      FROM "RawBehavioralEvent"
      WHERE "envId" = ${environment.id}
        AND "occurredAt" >= ${thirtyDaysAgo}
      GROUP BY url
    `,
    prevCyclePromise,
  ]);

  let surfaceCounts = new Map<string, number>();
  let hasFindingData = false;
  let findingsLookupOk = true;
  if (findingResult.status === "fulfilled") {
    surfaceCounts = findingResult.value;
    hasFindingData =
      surfaceCounts.size > 0 ||
      (latestCycle?.status === "complete" && latestCycle.completedAt !== null);
  } else {
    findingsLookupOk = false;
    console.warn("[api/inventory] finding_count lookup failed:", findingResult.reason);
  }

  let sessionCounts = new Map<string, number>();
  let hasSessionData = false;
  let sessionsLookupOk = true;
  if (sessionResult.status === "fulfilled") {
    for (const row of sessionResult.value) {
      sessionCounts.set(row.url, Number(row.session_count));
    }
    hasSessionData = sessionResult.value.length > 0;
  } else {
    sessionsLookupOk = false;
    console.warn("[api/inventory] session_count lookup failed:", sessionResult.reason);
  }

  const matchSurface = buildPathMatcher(surfaceCounts);
  const matchSessions = buildPathMatcher(sessionCounts);

  // Period-over-period deltas: count rows + findings created since previous cycle
  const prevCycle = prevCycleResult.status === "fulfilled" ? prevCycleResult.value : null;
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

  // Pull response time from HttpResponse evidence for paginated rows.
  // We use the most recent evidence per URL with a duration_ms payload.
  let responseTimes = new Map<string, number>();
  if (items.length > 0) {
    try {
      const urls = items.map(i => i.normalizedUrl);
      const evidenceRows = await prisma.evidence.findMany({
        where: {
          environmentRef: environment.id,
          evidenceType: "http_response",
          subjectRef: { in: urls },
        },
        orderBy: { observedAt: "desc" },
        select: { subjectRef: true, payload: true, observedAt: true },
        take: 2000,
      });
      // Keep most recent per URL (orderBy desc, first one wins).
      // Evidence.payload is JSON-as-text — parse to read duration_ms.
      for (const ev of evidenceRows) {
        if (responseTimes.has(ev.subjectRef)) continue;
        try {
          const payload = JSON.parse(ev.payload);
          const duration = payload?.duration_ms;
          if (typeof duration === "number" && duration >= 0) {
            responseTimes.set(ev.subjectRef, Math.round(duration));
          }
        } catch { /* skip malformed */ }
      }
    } catch (err) {
      console.warn("[api/inventory] response_time lookup failed:", err);
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
      session_count: hasSessionData ? matchSessions(item.normalizedUrl, item.path) : null,
      finding_count: hasFindingData ? matchSurface(item.normalizedUrl, item.path) : null,
      // Wave 9.3 — per-URL audit trail.
      discovery_source: item.discoverySource ?? null,
      skip_reason: item.skipReason ?? null,
      ab_test_platform: item.abTestPlatform ?? null,
      locale_code: item.localeCode ?? null,
      http_status: item.statusCode ?? null,
      title: item.title ?? null,
      description: null,
      response_time_ms: responseTimes.get(item.normalizedUrl) ?? null,
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
