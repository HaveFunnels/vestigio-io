import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/marketing/stats
 * Returns dashboard data: page views over time, top pages, top referrers,
 * device breakdown, UTM sources, conversion funnel, user journeys, blog
 * performance, live visitor count, geographic breakdown, goals, and
 * optional comparison data.
 *
 * Query params:
 *   period  = 7d | 30d | 90d  (default 7d)
 *   from    = ISO date string (custom range start, overrides period)
 *   to      = ISO date string (custom range end, overrides period)
 *   path    = optional filter
 *   compare = true — include previous-period comparison data
 */
export const GET = withErrorTracking(
  async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const period = searchParams.get("period") || "7d";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const pathFilter = searchParams.get("path") || undefined;
    const compare = searchParams.get("compare") === "true";

    // Calculate date range — custom from/to takes precedence over period
    let since: Date;
    let until: Date | undefined;
    let days: number;

    if (fromParam) {
      since = new Date(fromParam);
      if (toParam) {
        until = new Date(toParam);
        // Set to end of day
        until.setHours(23, 59, 59, 999);
      }
      days = until
        ? Math.round((until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24))
        : 7;
    } else {
      days = period === "90d" ? 90 : period === "30d" ? 30 : period === "1d" ? 1 : 7;
      since = new Date();
      since.setDate(since.getDate() - days);
    }

    const whereBase: any = {
      createdAt: until ? { gte: since, lte: until } : { gte: since },
    };
    if (pathFilter) whereBase.path = pathFilter;

    try {
      // Live visitors: sessions with a page view in the last 5 minutes
      const fiveMinAgo = new Date();
      fiveMinAgo.setMinutes(fiveMinAgo.getMinutes() - 5);

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
        liveSessionsRaw,
        blogPageViews,
        countriesRaw,
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
          where: until
            ? { createdAt: { gte: since, lte: until } }
            : { createdAt: { gte: since } },
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

        // Live visitors (distinct sessions in last 5 min)
        prisma.pageView.groupBy({
          by: ["sessionId"],
          where: { createdAt: { gte: fiveMinAgo } },
          _count: true,
        }),

        // Blog page views (for Blog tab)
        prisma.pageView.findMany({
          where: {
            ...whereBase,
            path: { startsWith: "/blog/" },
          },
          select: {
            path: true,
            sessionId: true,
            duration: true,
            scrollDepth: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 50000,
        }),

        // Geographic breakdown — group by country, top 10
        prisma.pageView.groupBy({
          by: ["country"],
          where: { ...whereBase, country: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 10,
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

      // ── Live visitors ──
      const liveVisitors = liveSessionsRaw.length;

      // ── Blog performance ──
      const blogByPath = new Map<
        string,
        {
          views: number;
          durations: number[];
          scrollDepths: number[];
          sessions: Set<string>;
        }
      >();

      for (const pv of blogPageViews) {
        if (!blogByPath.has(pv.path)) {
          blogByPath.set(pv.path, {
            views: 0,
            durations: [],
            scrollDepths: [],
            sessions: new Set(),
          });
        }
        const entry = blogByPath.get(pv.path)!;
        entry.views += 1;
        entry.sessions.add(pv.sessionId);
        if (pv.duration != null) entry.durations.push(pv.duration);
        if (pv.scrollDepth != null) entry.scrollDepths.push(pv.scrollDepth);
      }

      // Count sessions that visited signup after a blog page
      const blogSessionPaths = new Map<string, string[]>();
      for (const pv of recentPageViews) {
        if (!blogSessionPaths.has(pv.sessionId)) {
          blogSessionPaths.set(pv.sessionId, []);
        }
        blogSessionPaths.get(pv.sessionId)!.push(pv.path);
      }

      const blogConversions = new Map<string, number>();
      for (const [, paths] of blogSessionPaths.entries()) {
        const blogPaths = paths.filter((p) => p.startsWith("/blog/"));
        const visitedSignup = paths.some(
          (p) =>
            p.includes("signup") ||
            p.includes("register") ||
            p.includes("sign-up"),
        );
        if (visitedSignup) {
          for (const bp of blogPaths) {
            blogConversions.set(bp, (blogConversions.get(bp) || 0) + 1);
          }
        }
      }

      // Bounce rate per blog post: sessions with only 1 page view that was this blog post
      const blogBounces = new Map<string, number>();
      for (const [, paths] of blogSessionPaths.entries()) {
        if (paths.length === 1 && paths[0].startsWith("/blog/")) {
          blogBounces.set(paths[0], (blogBounces.get(paths[0]) || 0) + 1);
        }
      }

      const totalBlogViews = blogPageViews.length;
      const allBlogDurations = blogPageViews
        .filter((pv) => pv.duration != null)
        .map((pv) => pv.duration!);
      const avgBlogDuration =
        allBlogDurations.length > 0
          ? Math.round(
              allBlogDurations.reduce((a, b) => a + b, 0) /
                allBlogDurations.length,
            )
          : 0;
      const allBlogScrolls = blogPageViews
        .filter((pv) => pv.scrollDepth != null)
        .map((pv) => pv.scrollDepth!);
      const avgBlogScrollDepth =
        allBlogScrolls.length > 0
          ? Math.round(
              (allBlogScrolls.reduce((a, b) => a + b, 0) /
                allBlogScrolls.length) *
                100,
            )
          : 0;

      // Find top converting blog post
      let topConvertingPost = "";
      let topConvRate = 0;
      for (const [path, entry] of blogByPath.entries()) {
        const convCount = blogConversions.get(path) || 0;
        const rate =
          entry.sessions.size > 0 ? convCount / entry.sessions.size : 0;
        if (rate > topConvRate) {
          topConvRate = rate;
          topConvertingPost = path;
        }
      }

      const blogPosts = [...blogByPath.entries()]
        .sort(([, a], [, b]) => b.views - a.views)
        .slice(0, 20)
        .map(([path, entry]) => {
          const avgDuration =
            entry.durations.length > 0
              ? Math.round(
                  entry.durations.reduce((a, b) => a + b, 0) /
                    entry.durations.length,
                )
              : 0;
          const avgScroll =
            entry.scrollDepths.length > 0
              ? Math.round(
                  (entry.scrollDepths.reduce((a, b) => a + b, 0) /
                    entry.scrollDepths.length) *
                    100,
                )
              : 0;
          const convCount = blogConversions.get(path) || 0;
          const convRate =
            entry.sessions.size > 0
              ? Math.round((convCount / entry.sessions.size) * 100)
              : 0;
          const bounceCount = blogBounces.get(path) || 0;
          const bounceRateBlog =
            entry.sessions.size > 0
              ? Math.round((bounceCount / entry.sessions.size) * 100)
              : 0;
          return {
            path,
            views: entry.views,
            avgDuration,
            avgScrollDepth: avgScroll,
            bounceRate: bounceRateBlog,
            conversionRate: convRate,
          };
        });

      // ── Geographic breakdown — compute sessions per country ──
      const countrySessionsRaw = await prisma.pageView.groupBy({
        by: ["country", "sessionId"],
        where: { ...whereBase, country: { not: null } },
      });
      const countrySessionCounts = new Map<string, Set<string>>();
      for (const row of countrySessionsRaw) {
        if (!row.country) continue;
        if (!countrySessionCounts.has(row.country)) {
          countrySessionCounts.set(row.country, new Set());
        }
        countrySessionCounts.get(row.country)!.add(row.sessionId);
      }
      const countries = countriesRaw.map((row) => ({
        country: row.country || "Unknown",
        views: row._count.id,
        sessions: countrySessionCounts.get(row.country || "")?.size || 0,
      }));

      // ── Goals: compute this-month metrics ──
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [goalSignups, goalBlogViewsCount, goalDemoRequests] =
        await Promise.all([
          prisma.marketingEvent.count({
            where: { eventType: "signup", createdAt: { gte: monthStart } },
          }),
          prisma.pageView.count({
            where: {
              path: { startsWith: "/blog" },
              createdAt: { gte: monthStart },
            },
          }),
          prisma.marketingEvent.count({
            where: {
              eventType: "form_complete",
              createdAt: { gte: monthStart },
            },
          }),
        ]);

      const goals = {
        signupsThisMonth: goalSignups,
        blogViewsThisMonth: goalBlogViewsCount,
        demoRequestsThisMonth: goalDemoRequests,
      };

      // ── Comparison mode: compute previous period stats ──
      let previousSummary: {
        totalPageViews: number;
        uniqueSessions: number;
        avgTimeOnPage: number;
        bounceRate: number;
      } | null = null;

      if (compare) {
        const prevUntil = new Date(since.getTime());
        const prevSince = new Date(since.getTime());
        prevSince.setDate(prevSince.getDate() - days);

        const prevWhere: any = {
          createdAt: { gte: prevSince, lt: prevUntil },
        };
        if (pathFilter) prevWhere.path = pathFilter;

        const [prevTotal, prevSessions, prevPageViews] = await Promise.all([
          prisma.pageView.count({ where: prevWhere }),
          prisma.pageView.groupBy({
            by: ["sessionId"],
            where: prevWhere,
            _count: true,
          }),
          prisma.pageView.findMany({
            where: prevWhere,
            select: { sessionId: true, path: true },
            take: 50000,
          }),
        ]);

        // Previous bounce rate
        const prevSessionPageCounts = new Map<string, number>();
        for (const pv of prevPageViews) {
          prevSessionPageCounts.set(
            pv.sessionId,
            (prevSessionPageCounts.get(pv.sessionId) || 0) + 1,
          );
        }
        const prevBounceSessions = [...prevSessionPageCounts.values()].filter(
          (c) => c === 1,
        ).length;
        const prevBounceRate =
          prevSessionPageCounts.size > 0
            ? Math.round(
                (prevBounceSessions / prevSessionPageCounts.size) * 100,
              )
            : 0;

        // Previous avg time on page
        const prevEvents = await prisma.marketingEvent.findMany({
          where: {
            createdAt: { gte: prevSince, lt: prevUntil },
            eventType: "time_on_page",
          },
          select: { sessionId: true },
        });
        const prevAvgTimeOnPage =
          prevEvents.length > 0
            ? Math.round(
                (prevEvents.length / Math.max(prevSessions.length, 1)) * 60,
              )
            : 0;

        previousSummary = {
          totalPageViews: prevTotal,
          uniqueSessions: prevSessions.length,
          avgTimeOnPage: prevAvgTimeOnPage,
          bounceRate: prevBounceRate,
        };
      }

      return NextResponse.json({
        period: fromParam ? "custom" : period,
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
        liveVisitors,
        countries,
        goals,
        ...(previousSummary ? { previous: { summary: previousSummary } } : {}),
        blog: {
          totalViews: totalBlogViews,
          avgDuration: avgBlogDuration,
          avgScrollDepth: avgBlogScrollDepth,
          topConvertingPost,
          posts: blogPosts,
        },
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
