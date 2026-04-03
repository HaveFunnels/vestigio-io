import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/marketing/ab-tests — list all A/B tests
 * POST /api/admin/marketing/ab-tests — create or update an A/B test
 */

export const GET = withErrorTracking(
  async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const tests = await prisma.aBTest.findMany({
        orderBy: { createdAt: "desc" },
      });

      // Enrich with variant performance from PageView data
      const enriched = await Promise.all(
        tests.map(async (test) => {
          let variants: any[] = [];
          try {
            variants = JSON.parse(test.variants || "[]");
          } catch {}

          // Get performance for each variant
          const variantPerformance = await Promise.all(
            variants.map(async (v: any) => {
              const views = await prisma.pageView.count({
                where: { abVariant: v.id },
              });
              const conversions = await prisma.marketingEvent.count({
                where: {
                  eventType: "signup",
                  sessionId: {
                    in: (
                      await prisma.pageView.findMany({
                        where: { abVariant: v.id },
                        select: { sessionId: true },
                        distinct: ["sessionId"],
                      })
                    ).map((p) => p.sessionId),
                  },
                },
              });
              return {
                ...v,
                views,
                conversions,
                conversionRate: views > 0 ? Math.round((conversions / views) * 10000) / 100 : 0,
              };
            }),
          );

          return {
            ...test,
            variantPerformance,
          };
        }),
      );

      return NextResponse.json({ tests: enriched });
    } catch (err) {
      console.error("[ab-tests GET]", err);
      return NextResponse.json(
        { message: "Failed to fetch A/B tests" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/ab-tests", method: "GET" },
);

export const POST = withErrorTracking(
  async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      const body = await req.json();
      const { id, name, description, status, startDate, endDate, variants } = body;

      if (!name) {
        return NextResponse.json(
          { message: "name is required" },
          { status: 400 },
        );
      }

      if (id) {
        // Update existing
        const updated = await prisma.aBTest.update({
          where: { id },
          data: {
            name,
            description: description || null,
            status: status || "draft",
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            variants: typeof variants === "string" ? variants : JSON.stringify(variants || []),
          },
        });
        return NextResponse.json({ test: updated });
      }

      // Create new
      const created = await prisma.aBTest.create({
        data: {
          name,
          description: description || null,
          status: status || "draft",
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          variants: typeof variants === "string" ? variants : JSON.stringify(variants || []),
        },
      });
      return NextResponse.json({ test: created }, { status: 201 });
    } catch (err) {
      console.error("[ab-tests POST]", err);
      return NextResponse.json(
        { message: "Failed to save A/B test" },
        { status: 500 },
      );
    }
  },
  { endpoint: "/api/admin/marketing/ab-tests", method: "POST" },
);
