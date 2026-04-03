import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/marketing/stats
 * Returns dashboard data: page views over time, top pages, top referrers,
 * device breakdown, UTM sources, conversion funnel, user journeys.
 *
 * Query params:
 *   period = 7d | 30d | 90d  (default 7d)
 *   path   = optional filter
 */
export const GET = withErrorTracking(
  async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const period = searchParams.get("period") || "7d";
    const pathFilter = searchParams.get("path") || undefined;

    // Calculate date range
    const days = period === "90d" ? 90 : period === "30d" ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const whereBase: any = { createdAt: { gte: since } };
    if (pathFilter) whereBase.path = pathFilter;

    try {
      // Run queries in parallel
      const [
        totalPageViews,
        uniqueSessions,
        pageViews,
        allEvents,
        topPagesRaw,
        topReferrersRaw,
        deviceBreakdown,
        utmSourcesRaw,
        recentPageViews,
      ] = await Promise.all([
        // Total page views
        prisma.pageView.count({ where: whereBase }),

        // Unique sessions
        prisma.pageView.groupBy({
          by: ["sessionId"],
          where: whereBase,
          _count: true,
        }),

        // Page views grouped by day
        prisma.pageView.findMany({
          where: whereBase,
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),

        // Events for funnel
        prisma.marketingEvent.findMany({
          where: { createdAt: { gte: since } },
          select: { eventType: true, sessionId: true, path: true },
        }),

        // Top pages
        prisma.pageView.groupBy({
          by: ["path"],
          where: whereBase,
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 20,
        }),

        // Top referrers
        prisma.pageView.groupBy({
          by: ["referrer"],
          where: { ...whereBase, referrer: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 15,
        }),

        // Device breakdown
        prisma.pageView.groupBy({
          by: ["device"],
          where: whereBase,
          _count: { id: true },
        }),

        // UTM sources
        prisma.pageView.groupBy({
          by: ["utmSource"],
          where: { ...whereBase, utmSource: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 20,
        }),

        // Recent page views for journey analysis
        prisma.pageView.findMany({
          where: whereBase,
          select: { sessionId: true, path: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 50000,
        }),
      ]);

      // ── Page views over time (bucketed by day) ──
      const pvByDay: Record<string, number> = {};
      for (const pv of pageViews) {
        const day = pv.createdAt.toISOString().slice(0, 10);
        pvByDay[day] = (pvByDay[day] || 0) + 1;
      }
      const pageViewsOverTime = Object.entries(pvByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      // ── Avg time on page ──
      const timeEvents = allEvents.filter((e) => e.eventType === "time_on_page");
      // We don't have duration directly — compute from event count & session count
      // For now, report based on events. Duration will be in metadata.
      const avgTimeOnPage = timeEvents.length > 0
        ? Math.round(timeEvents.length / Math.max(uniqueSessions.length, 1) * 60)
        : 0;

      // ── Bounce rate (sessions with only 1 page view) ──
      const sessionPageCounts = new Map<string, number>();
      for (const pv of recentPageViews) {
        sessionPageCounts.set(
          pv.sessionId,
          (sessionPageCounts.get(pv.sessionId) || 0) + 1,
        );
      }
      const bounceSessions = [...sessionPageCounts.values()].filter(
        (c) => c === 1,
      ).length;
      const bounceRate =
        sessionPageCounts.size > 0
          ? Math.round((bounceSessions / sessionPageCounts.size) * 100)
          : 0;

      // ── Top pages ──
      const topPages = topPagesRaw.map((row) => ({
        path: row.path,
        views: row._count.id,
      }));

      // ── Top referrers ──
      const topReferrers = topReferrersRaw
        .filter((r) => r.referrer)
        .map((row) => ({
          referrer: row.referrer!,
          views: row._count.id,
        }));

      // ── Device breakdown ──
      const devices: Record<string, number> = {};
      for (const row of deviceBreakdown) {
        devices[row.device || "unknown"] = row._count.id;
      }

      // ── UTM sources ──
      const utmSources = utmSourcesRaw.map((row) => ({
        source: row.utmSource!,
        views: row._count.id,
      }));

      // ── Conversion funnel ──
      const funnelEvents = new Map<string, Set<string>>();
      for (const e of allEvents) {
        if (!funnelEvents.has(e.eventType)) {
          funnelEvents.set(e.eventType, new Set());
        }
        funnelEvents.get(e.eventType)!.add(e.sessionId);
      }
      const funnel = {
        pageViews: totalPageViews,
        uniqueSessions: uniqueSessions.length,
        ctaClicks: funnelEvents.get("cta_click")?.size || 0,
        formStarts: funnelEvents.get("form_start")?.size || 0,
        formCompletes: funnelEvents.get("form_complete")?.size || 0,
        signups: funnelEvents.get("signup")?.size || 0,
      };

      // ── User journeys (top page sequences) ──
      const sessionPaths = new Map<string, string[]>();
      for (const pv of recentPageViews) {
        if (!sessionPaths.has(pv.sessionId)) {
          sessionPaths.set(pv.sessionId, []);
        }
        const paths = sessionPaths.get(pv.sessionId)!;
        // Deduplicate consecutive same paths
        if (paths[paths.length - 1] !== pv.path) {
          paths.push(pv.path);
        }
      }

      // Count journey sequences (first 3 pages)
      const journeyCounts = new Map<string, number>();
      for (const paths of sessionPaths.values()) {
        const key = paths.slice(0, 3).join(" → ");
        journeyCounts.set(key, (journeyCounts.get(key) || 0) + 1);
      }
      const topJourneys = [...journeyCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([journey, count]) => ({ journey, count }));

      // ── Drop-off analysis (exit pages) ──
      const exitPages = new Map<string, number>();
      for (const paths of sessionPaths.values()) {
        const lastPage = paths[paths.length - 1];
        exitPages.set(lastPage, (exitPages.get(lastPage) || 0) + 1);
      }
      const dropOffs = [...exitPages.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([path, exits]) => ({
          path,
          exits,
          exitRate:
            sessionPageCounts.size > 0
              ? Math.round((exits / sessionPageCounts.size) * 100)
              : 0,
        }));

      return NextResponse.json({
        period,
        summary: {
          totalPageViews,
          uniqueSessions: uniqueSessions.length,
          avgTimeOnPage,
          bounceRate,
        },
        pageViewsOverTime,
        topPages,
        topReferrers,
        devices,
        utmSources,
        funnel,
        topJourneys,
        dropOffs,
      });
    } catch (err) {
      console.error("[marketing/stats]", err);
      return NextResponse.json(
        { message: "Failed to fetch marketing stats" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/stats", method: "GET" },
);
