import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { resolveOrgContext } from "@/libs/resolve-org";
import { getPlanConfigs } from "@/libs/plan-config";

/**
 * GET /api/billing — authenticated billing info for the current user.
 * Returns org plan, subscription details, and usage counts.
 */
export const GET = withErrorTracking(async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/libs/prismaDb");

  // Fetch user billing fields directly from DB (not exposed in session JWT)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      customerId: true,
      subscriptionId: true,
      priceId: true,
      currentPeriodEnd: true,
    },
  });

  // Resolve org context for plan + org-level data
  const orgCtx = await resolveOrgContext();

  // Fetch org-level counts
  let environmentsCount = 0;
  let membersCount = 0;
  let mcpQueriesUsed = 0;

  if (orgCtx.orgId && orgCtx.orgId !== "demo") {
    const [envCount, memberCount, usageAgg] = await Promise.all([
      prisma.environment.count({
        where: { organizationId: orgCtx.orgId },
      }),
      prisma.membership.count({
        where: { organizationId: orgCtx.orgId },
      }),
      prisma.usage.aggregate({
        where: {
          organizationId: orgCtx.orgId,
          usageType: { in: ["mcp_chat", "mcp_tool", "mcp_daily"] },
          period: new Date().toISOString().slice(0, 7), // YYYY-MM
        },
        _sum: { amount: true },
      }),
    ]);

    environmentsCount = envCount;
    membersCount = memberCount;
    mcpQueriesUsed = usageAgg._sum.amount || 0;
  }

  // Get plan config for limits
  const planConfigs = await getPlanConfigs();
  const currentPlanConfig = planConfigs.find((p) => p.key === orgCtx.plan);

  return NextResponse.json({
    plan: orgCtx.plan,
    status: orgCtx.orgId !== "demo" ? "active" : "none",
    subscriptionId: user?.subscriptionId || null,
    priceId: user?.priceId || null,
    currentPeriodEnd: user?.currentPeriodEnd || null,
    customerId: user?.customerId || null,
    usage: {
      environments: environmentsCount,
      maxEnvironments: currentPlanConfig?.maxEnvironments || 1,
      members: membersCount,
      maxMembers: currentPlanConfig?.maxMembers || 1,
      mcpQueries: mcpQueriesUsed,
      maxMcpQueries: currentPlanConfig?.maxMcpCalls || 50,
    },
  });
}, { endpoint: "/api/billing", method: "GET" });
