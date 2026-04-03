import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/uptime — return uptime data grouped by service and day
 * for the last 30 days. Admin-only.
 *
 * Response shape:
 * {
 *   services: {
 *     [service: string]: {
 *       days: { date: string; status: "ok" | "degraded" | "down" | "no_data"; checkCount: number }[]
 *       uptimePercent: number
 *     }
 *   }
 * }
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    // Calculate date range: last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Try to query UptimeCheck model
    let checks: any[] = [];
    let modelExists = true;

    try {
      checks = await (prisma as any).uptimeCheck.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: "asc" },
      });
    } catch {
      // Model might not be migrated yet — return empty data gracefully
      modelExists = false;
    }

    if (!modelExists || checks.length === 0) {
      return NextResponse.json({
        services: {},
        empty: true,
        message:
          "No uptime data yet. History will populate as health checks run.",
      });
    }

    // Group by service
    const serviceMap: Record<
      string,
      { date: string; statuses: string[] }[]
    > = {};

    // Build date buckets for last 30 days
    const dateBuckets: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateBuckets.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }

    // Collect all unique services
    const serviceNames = new Set<string>();
    for (const check of checks) {
      serviceNames.add(check.service);
    }

    // Build service data
    const services: Record<
      string,
      {
        days: {
          date: string;
          status: "ok" | "degraded" | "down" | "no_data";
          checkCount: number;
        }[];
        uptimePercent: number;
      }
    > = {};

    for (const service of serviceNames) {
      const serviceChecks = checks.filter(
        (c: any) => c.service === service
      );

      // Group checks by date
      const checksByDate: Record<string, any[]> = {};
      for (const check of serviceChecks) {
        const dateKey = new Date(check.createdAt)
          .toISOString()
          .slice(0, 10);
        if (!checksByDate[dateKey]) checksByDate[dateKey] = [];
        checksByDate[dateKey].push(check);
      }

      let okDays = 0;
      let totalDaysWithData = 0;

      const days = dateBuckets.map((date) => {
        const dayChecks = checksByDate[date] || [];
        if (dayChecks.length === 0) {
          return { date, status: "no_data" as const, checkCount: 0 };
        }

        totalDaysWithData++;

        // Determine day status: worst status wins
        const hasDown = dayChecks.some(
          (c: any) => c.status === "down"
        );
        const hasDegraded = dayChecks.some(
          (c: any) => c.status === "degraded"
        );

        let status: "ok" | "degraded" | "down";
        if (hasDown) {
          status = "down";
        } else if (hasDegraded) {
          status = "degraded";
        } else {
          status = "ok";
          okDays++;
        }

        return { date, status, checkCount: dayChecks.length };
      });

      const uptimePercent =
        totalDaysWithData > 0
          ? Math.round((okDays / totalDaysWithData) * 10000) / 100
          : 100;

      services[service] = { days, uptimePercent };
    }

    return NextResponse.json({ services, empty: false });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to fetch uptime data" },
      { status: 500 }
    );
  }
}
