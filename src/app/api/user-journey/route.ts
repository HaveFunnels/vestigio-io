import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";

/**
 * GET /api/user-journey — Authenticated.
 * Returns page-to-page flow data for User Journey visualization.
 * Used by both /app/maps (user) and /app/admin/marketing (admin).
 *
 * Returns:
 * - nodes: unique pages (with view count)
 * - edges: transitions between pages (with percentage + count)
 * - referrers: top 10 referrer URLs as entry nodes
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    // Fetch page views ordered by session + time
    const pageViews = await prisma.pageView.findMany({
      where: { createdAt: { gte: since } },
      select: { sessionId: true, path: true, referrer: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 100000,
    });

    // Build session paths
    const sessionPaths = new Map<string, { paths: string[]; referrer: string | null }>();
    for (const pv of pageViews) {
      const existing = sessionPaths.get(pv.sessionId);
      if (!existing) {
        sessionPaths.set(pv.sessionId, {
          paths: [pv.path],
          referrer: pv.referrer || null,
        });
      } else {
        // Only add if different from last (avoid duplicate clicks)
        if (existing.paths[existing.paths.length - 1] !== pv.path) {
          existing.paths.push(pv.path);
        }
      }
    }

    const totalSessions = sessionPaths.size;

    // Count page views per page
    const pageCounts = new Map<string, number>();
    for (const { paths } of sessionPaths.values()) {
      const seen = new Set<string>();
      for (const p of paths) {
        if (!seen.has(p)) {
          pageCounts.set(p, (pageCounts.get(p) || 0) + 1);
          seen.add(p);
        }
      }
    }

    // Count transitions (page A → page B)
    const transitionCounts = new Map<string, number>();
    for (const { paths } of sessionPaths.values()) {
      for (let i = 0; i < paths.length - 1; i++) {
        const key = `${paths[i]}|||${paths[i + 1]}`;
        transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
      }
    }

    // Count referrers (top 10)
    const referrerCounts = new Map<string, number>();
    for (const { referrer } of sessionPaths.values()) {
      if (referrer) {
        try {
          const host = new URL(referrer).hostname;
          referrerCounts.set(host, (referrerCounts.get(host) || 0) + 1);
        } catch {
          referrerCounts.set(referrer.slice(0, 50), (referrerCounts.get(referrer.slice(0, 50)) || 0) + 1);
        }
      }
    }

    // Count dropoffs (sessions that end at each page)
    const dropoffCounts = new Map<string, number>();
    for (const { paths } of sessionPaths.values()) {
      const lastPage = paths[paths.length - 1];
      dropoffCounts.set(lastPage, (dropoffCounts.get(lastPage) || 0) + 1);
    }

    // Build nodes (top 20 pages by views)
    const topPages = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const pageSet = new Set(topPages.map(([p]) => p));

    const nodes = topPages.map(([path, views]) => ({
      id: `page_${path}`,
      type: "page" as const,
      label: path,
      views,
      viewPct: totalSessions > 0 ? Math.round((views / totalSessions) * 100) : 0,
      dropoffs: dropoffCounts.get(path) || 0,
      dropoffPct: views > 0 ? Math.round(((dropoffCounts.get(path) || 0) / views) * 100) : 0,
    }));

    // Build referrer nodes (top 10)
    const topReferrers = [...referrerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const referrerNodes = topReferrers.map(([host, count]) => ({
      id: `ref_${host}`,
      type: "referrer" as const,
      label: host,
      views: count,
      viewPct: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0,
      dropoffs: 0,
      dropoffPct: 0,
    }));

    // Build edges between pages (only for top pages)
    const edges = [...transitionCounts.entries()]
      .filter(([key]) => {
        const [from, to] = key.split("|||");
        return pageSet.has(from) && pageSet.has(to);
      })
      .map(([key, count]) => {
        const [from, to] = key.split("|||");
        const fromViews = pageCounts.get(from) || 1;
        return {
          source: `page_${from}`,
          target: `page_${to}`,
          count,
          percentage: Math.round((count / fromViews) * 100),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Build referrer → first page edges
    const referrerEdges: typeof edges = [];
    for (const [host] of topReferrers) {
      const firstPageCounts = new Map<string, number>();
      for (const { referrer, paths } of sessionPaths.values()) {
        if (referrer) {
          try {
            if (new URL(referrer).hostname === host && paths[0] && pageSet.has(paths[0])) {
              firstPageCounts.set(paths[0], (firstPageCounts.get(paths[0]) || 0) + 1);
            }
          } catch { /* skip */ }
        }
      }
      for (const [page, count] of firstPageCounts) {
        referrerEdges.push({
          source: `ref_${host}`,
          target: `page_${page}`,
          count,
          percentage: Math.round((count / (referrerCounts.get(host) || 1)) * 100),
        });
      }
    }

    return NextResponse.json({
      totalSessions,
      nodes: [...referrerNodes, ...nodes],
      edges: [...referrerEdges, ...edges],
    });
  } catch (err) {
    console.error("[User Journey API]", err);
    return NextResponse.json({ nodes: [], edges: [], totalSessions: 0 });
  }
}
