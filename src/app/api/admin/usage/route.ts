import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { getPlanEntitlements, getPlanLimits, type PlanKey } from "../../../../../packages/plans";
import { getOrgUsageStats, estimateDailyCost, computePlanUnitEconomics } from "../../../../../apps/platform/billing-safety";
import { getUsageLog } from "../../../../../apps/platform/billing-safety";
import { getMcpObservabilityDashboard } from "../../../../../apps/platform/mcp-observability";
import { getAllPlanConfigs, getAllConfigBasedEconomics, getConfigChangeLog } from "../../../../../apps/platform/plan-config-admin";
import { getProductionHealthCheck } from "../../../../../apps/platform/production-state-lock";
import { getTokenLedgerStore } from "../../../../../apps/platform/token-ledger";
import { getPricingForModel, getModelDisplayName, type LlmModel } from "../../../../../apps/platform/token-cost";

/**
 * GET /api/admin/usage — usage per org, cost estimates, unit economics, MCP observability
 * Query params: date (YYYY-MM-DD), view (summary | unit_economics | log | mcp_observability | plan_config | health)
 */
export const GET = withErrorTracking(async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const view = searchParams.get("view") || "summary";
  const date = searchParams.get("date") || undefined;

  // Unit economics view
  if (view === "unit_economics") {
    const plans: PlanKey[] = ["vestigio", "pro", "max"];
    const economics = plans.map((p) => computePlanUnitEconomics(p));
    return NextResponse.json({ economics });
  }

  // Audit log view
  if (view === "log") {
    const orgId = searchParams.get("org_id") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const log = getUsageLog(orgId, limit);
    return NextResponse.json({ log });
  }

  // MCP Observability view — Phase 20
  if (view === "mcp_observability") {
    const dashboard = getMcpObservabilityDashboard();
    return NextResponse.json({ mcp_observability: dashboard });
  }

  // Plan config view — Phase 20
  if (view === "plan_config") {
    const configs = getAllPlanConfigs();
    const economics = getAllConfigBasedEconomics();
    const changeLog = getConfigChangeLog();
    return NextResponse.json({ configs, economics, change_log: changeLog });
  }

  // Production health check — Phase 20
  if (view === "health") {
    const health = getProductionHealthCheck();
    return NextResponse.json({ health });
  }

  // Chat feedback view — admin quality monitoring
  if (view === "chat_feedback") {
    try {
      const rating = searchParams.get("rating") || undefined;
      const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

      const feedback = await prisma.chatFeedback.findMany({
        where: rating ? { rating } : {},
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const totals = {
        positive: await prisma.chatFeedback.count({ where: { rating: "positive" } }),
        negative: await prisma.chatFeedback.count({ where: { rating: "negative" } }),
        total: await prisma.chatFeedback.count(),
        with_comments: await prisma.chatFeedback.count({ where: { comment: { not: null } } }),
      };

      return NextResponse.json({ feedback, totals });
    } catch {
      return NextResponse.json({ message: "Failed to fetch feedback" }, { status: 500 });
    }
  }

  // Token costs view — LLM cost per org
  if (view === "token_costs") {
    const period = searchParams.get("period") || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    try {
      const ledger = getTokenLedgerStore();
      const allOrgs = await ledger.aggregateAllOrgs(period);

      // Sort by cost descending
      allOrgs.sort((a, b) => b.totalCostCents - a.totalCostCents);

      // Enrich with org names
      const orgMap = new Map<string, { name: string; orgType: string }>();
      const orgs = await prisma.organization.findMany({ select: { id: true, name: true, plan: true, orgType: true } });
      for (const org of orgs) orgMap.set(org.id, { name: org.name, orgType: org.orgType || "customer" });

      const enriched = allOrgs.map((agg) => {
        const info = orgMap.get(agg.organizationId);
        return {
          ...agg,
          orgName: info?.name || "Unknown",
          orgType: info?.orgType || "customer",
        };
      });

      // Revenue totals exclude demo orgs
      const billable = enriched.filter((o) => o.orgType !== "demo");

      const totals = {
        totalCostCents: enriched.reduce((s, o) => s + o.totalCostCents, 0),
        billableCostCents: billable.reduce((s, o) => s + o.totalCostCents, 0),
        totalInputTokens: enriched.reduce((s, o) => s + o.totalInputTokens, 0),
        totalOutputTokens: enriched.reduce((s, o) => s + o.totalOutputTokens, 0),
        totalCalls: enriched.reduce((s, o) => s + o.callCount, 0),
        orgCount: enriched.length,
        billableOrgCount: billable.length,
      };

      return NextResponse.json({ period, totals, organizations: enriched });
    } catch {
      return NextResponse.json({ message: "Failed to fetch token costs" }, { status: 500 });
    }
  }

  // Token economics view — margin after LLM costs
  if (view === "token_economics") {
    const period = searchParams.get("period") || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    try {
      const ledger = getTokenLedgerStore();
      const allOrgs = await ledger.aggregateAllOrgs(period);

      const plans: PlanKey[] = ["vestigio", "pro", "max"];
      const orgs = await prisma.organization.findMany({ select: { id: true, plan: true } });
      const orgPlanMap = new Map<string, string>();
      for (const org of orgs) orgPlanMap.set(org.id, org.plan || "vestigio");

      const planCosts = new Map<string, { totalCost: number; orgCount: number }>();
      for (const p of plans) planCosts.set(p, { totalCost: 0, orgCount: 0 });

      for (const agg of allOrgs) {
        const plan = orgPlanMap.get(agg.organizationId) || "vestigio";
        const entry = planCosts.get(plan) || { totalCost: 0, orgCount: 0 };
        entry.totalCost += agg.totalCostCents;
        entry.orgCount += 1;
        planCosts.set(plan, entry);
      }

      const pricing: Record<string, number> = { vestigio: 9900, pro: 19900, max: 39900 }; // cents/month

      const economics = plans.map((p) => {
        const entry = planCosts.get(p) || { totalCost: 0, orgCount: 0 };
        const avgTokenCost = entry.orgCount > 0 ? entry.totalCost / entry.orgCount : 0;
        const monthlyPrice = pricing[p] || 0;
        const marginAfterTokens = monthlyPrice > 0
          ? ((monthlyPrice - avgTokenCost) / monthlyPrice) * 100
          : 100;

        return {
          plan: p,
          monthlyPriceCents: monthlyPrice,
          avgTokenCostPerOrgCents: Math.round(avgTokenCost * 100) / 100,
          orgCount: entry.orgCount,
          marginPctAfterTokens: Math.round(marginAfterTokens * 10) / 10,
        };
      });

      const models: LlmModel[] = ["haiku_4_5", "sonnet_4_6", "opus_4_6"];
      const modelPricing = models.map((m) => ({
        model: m,
        displayName: getModelDisplayName(m),
        pricing: getPricingForModel(m),
      }));

      return NextResponse.json({ period, economics, modelPricing });
    } catch {
      return NextResponse.json({ message: "Failed to compute token economics" }, { status: 500 });
    }
  }

  // Summary view — usage per org
  try {
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true, plan: true, status: true, orgType: true, trialEndsAt: true },
      where: { status: { not: "suspended" } },
      orderBy: { name: "asc" },
    });

    const orgUsage = await Promise.all(
      organizations.map(async (org) => {
        const plan = (org.plan || "vestigio") as PlanKey;
        const stats = await getOrgUsageStats(org.id, plan, date);
        const cost = estimateDailyCost(stats);
        const limits = getPlanLimits(plan);

        return {
          org_id: org.id,
          org_name: org.name,
          plan,
          status: org.status,
          org_type: org.orgType || "customer",
          trial_ends_at: org.trialEndsAt?.toISOString() || null,
          ...stats,
          cost,
          limits,
        };
      })
    );

    // Billable orgs exclude demo accounts
    const billableOrgs = orgUsage.filter((o) => o.org_type !== "demo");

    // Aggregates
    const totals = {
      total_orgs: orgUsage.length,
      total_mcp_queries: orgUsage.reduce((s, o) => s + o.mcp_queries, 0),
      total_playwright_runs: orgUsage.reduce((s, o) => s + o.playwright_runs, 0),
      total_estimated_tokens: orgUsage.reduce((s, o) => s + o.estimated_tokens, 0),
      total_cost_cents: orgUsage.reduce((s, o) => s + o.cost.total_cost_cents, 0),
      // Revenue metrics exclude demo orgs
      billable_cost_cents: billableOrgs.reduce((s, o) => s + o.cost.total_cost_cents, 0),
      billable_orgs: billableOrgs.length,
      demo_orgs: orgUsage.filter((o) => o.org_type === "demo").length,
      trial_orgs: orgUsage.filter((o) => o.org_type === "trial").length,
      customer_orgs: orgUsage.filter((o) => o.org_type === "customer").length,
      orgs_over_mcp_limit: orgUsage.filter((o) => o.is_over_mcp_limit).length,
      orgs_over_playwright_limit: orgUsage.filter((o) => o.is_over_playwright_limit).length,
    };

    return NextResponse.json({ date: date || "today", totals, organizations: orgUsage });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to fetch usage data" },
      { status: 500 }
    );
  }
}, { endpoint: "/api/admin/usage", method: "GET" });
