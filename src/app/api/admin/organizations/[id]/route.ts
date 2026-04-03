import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/organizations/[id] — org detail with members, environments,
 * last audit date, usage stats (MCP queries + Playwright runs), and plan/billing.
 */
export const GET = withErrorTracking(async function GET(
  req: NextRequest,
  context: any,
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // Next.js 15: params may be a Promise
  const params = await context.params;
  const id = params.id;

  try {
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        environments: {
          orderBy: { createdAt: "asc" },
        },
        businessProfile: true,
      },
    });

    if (!org) {
      return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    }

    // ── Last audit date ──
    const lastAudit = await prisma.auditCycle.findFirst({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, completedAt: true, status: true },
    });

    // ── Usage stats: current period (YYYY-MM) ──
    const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    const usageAgg = await prisma.usage.groupBy({
      by: ["usageType"],
      where: { organizationId: id, period: currentPeriod },
      _sum: { amount: true },
    });

    const mcpQueries =
      usageAgg
        .filter((u) => u.usageType === "mcp_chat" || u.usageType === "mcp_tool")
        .reduce((s, u) => s + (u._sum.amount || 0), 0);
    const playwrightRuns =
      usageAgg
        .filter((u) => u.usageType === "credits")
        .reduce((s, u) => s + (u._sum.amount || 0), 0);

    // ── Plan / billing info from the org owner's user record ──
    const owner = await prisma.user.findUnique({
      where: { id: org.ownerId },
      select: {
        customerId: true,
        subscriptionId: true,
        priceId: true,
        currentPeriodEnd: true,
      },
    });

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        ownerId: org.ownerId,
        plan: org.plan || "vestigio",
        status: org.status || "active",
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        members: org.memberships.map((m) => ({
          id: m.id,
          role: m.role,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          userRole: m.user.role,
          joinedAt: m.createdAt.toISOString(),
        })),
        environments: org.environments.map((e) => ({
          id: e.id,
          domain: e.domain,
          landingUrl: e.landingUrl,
          isProduction: e.isProduction,
          createdAt: e.createdAt.toISOString(),
        })),
        businessProfile: org.businessProfile
          ? {
              businessModel: org.businessProfile.businessModel,
              monthlyRevenue: org.businessProfile.monthlyRevenue,
            }
          : null,
        lastAudit: lastAudit
          ? {
              date: (lastAudit.completedAt || lastAudit.createdAt).toISOString(),
              status: lastAudit.status,
            }
          : null,
        usageStats: {
          period: currentPeriod,
          mcpQueries,
          playwrightRuns,
        },
        billing: owner
          ? {
              customerId: owner.customerId,
              subscriptionId: owner.subscriptionId,
              priceId: owner.priceId,
              currentPeriodEnd: owner.currentPeriodEnd
                ? owner.currentPeriodEnd.toISOString()
                : null,
            }
          : null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to fetch organization details" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/organizations/[id]", method: "GET" });
