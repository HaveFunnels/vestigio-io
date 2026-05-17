import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
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
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

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

    // ── Audit history (last 20) with per-cycle aggregates ──
    // The admin org page card needs each cycle's outcome at a glance so
    // we can spot regressions (e.g. an env that consistently fails after
    // a deploy) without opening the runner logs.
    //
    // findingCount/evidenceCount are computed via groupBy so we get one
    // round-trip regardless of how many cycles are returned. actionCount
    // is read from the projections cache (the engine doesn't persist
    // actions as a separate Prisma table).
    const recentCycles = await prisma.auditCycle.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        environmentId: true,
        status: true,
        cycleType: true,
        createdAt: true,
        completedAt: true,
        lastError: true,
        lastErrorAt: true,
        retryCount: true,
        projectionsCache: true,
      },
    });

    const cycleIds = recentCycles.map((c) => c.id);
    const [findingCounts, evidenceCounts, actionCounts] = await Promise.all([
      cycleIds.length === 0
        ? Promise.resolve([] as { cycleId: string; _count: number }[])
        : prisma.finding.groupBy({
            by: ["cycleId"],
            where: { cycleId: { in: cycleIds } },
            _count: true,
          }),
      cycleIds.length === 0
        ? Promise.resolve(
            [] as { auditCycleId: string | null; _count: number }[],
          )
        : prisma.evidence.groupBy({
            by: ["auditCycleId"],
            where: { auditCycleId: { in: cycleIds } },
            _count: true,
          }),
      // Wave 18t-B continuation — count actions via the new table when
      // populated. Falls back to JSON-blob length below for cycles
      // predating the dual-write.
      cycleIds.length === 0
        ? Promise.resolve([] as { cycleId: string; _count: number }[])
        : prisma.action.groupBy({
            by: ["cycleId"],
            where: { cycleId: { in: cycleIds } },
            _count: true,
          }),
    ]);

    const findingCountByCycle = new Map<string, number>();
    for (const row of findingCounts) {
      findingCountByCycle.set(row.cycleId, row._count);
    }
    const evidenceCountByCycle = new Map<string, number>();
    for (const row of evidenceCounts) {
      if (row.auditCycleId) {
        evidenceCountByCycle.set(row.auditCycleId, row._count);
      }
    }
    const actionCountByCycle = new Map<string, number>();
    for (const row of actionCounts) {
      actionCountByCycle.set(row.cycleId, row._count);
    }

    function readActionCount(cycleId: string, cache: unknown): number | null {
      // Wave 18t-B continuation — prefer the SQL count when the Action
      // table has rows for this cycle. Falls back to deserializing the
      // JSON blob for cycles that predate the dual-write.
      const sqlCount = actionCountByCycle.get(cycleId);
      if (sqlCount != null && sqlCount > 0) return sqlCount;
      if (!cache || typeof cache !== "object") return null;
      const c = cache as Record<string, unknown>;
      const actions = c.actions;
      if (Array.isArray(actions)) return actions.length;
      return null;
    }

    const envDomainById = new Map(org.environments.map((e) => [e.id, e.domain]));

    const auditHistory = recentCycles.map((c) => ({
      id: c.id,
      environmentId: c.environmentId,
      environmentDomain: envDomainById.get(c.environmentId) ?? null,
      status: c.status,
      cycleType: c.cycleType,
      createdAt: c.createdAt.toISOString(),
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      durationMs: c.completedAt
        ? c.completedAt.getTime() - c.createdAt.getTime()
        : null,
      lastError: c.lastError,
      lastErrorAt: c.lastErrorAt ? c.lastErrorAt.toISOString() : null,
      retryCount: c.retryCount,
      findingCount: findingCountByCycle.get(c.id) ?? 0,
      evidenceCount: evidenceCountByCycle.get(c.id) ?? 0,
      actionCount: readActionCount(c.id, c.projectionsCache),
    }));

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
        orgType: (org as any).orgType || "customer",
        trialEndsAt: (org as any).trialEndsAt ? (org as any).trialEndsAt.toISOString() : null,
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
        auditHistory,
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

// ──────────────────────────────────────────────
// PATCH /api/admin/organizations/[id]
//
// Update org plan, status, orgType, or trialEndsAt manually.
// Intended for admin overrides outside the Stripe/Paddle flow
// (e.g. granting a comp'd Pro plan, extending a trial, converting
// a trial to customer). All changes are audit-logged.
// ──────────────────────────────────────────────

interface PatchOrgBody {
  plan?: string;
  status?: "pending" | "active" | "suspended";
  orgType?: "customer" | "demo" | "trial";
  trialEndsAt?: string | null;
  name?: string;
}

export const PATCH = withErrorTracking(async function PATCH(
  req: NextRequest,
  context: any,
) {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  const params = await context.params;
  const id = params.id;

  let body: PatchOrgBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate ──
  const updateData: any = {};
  const errors: string[] = [];

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) errors.push("name cannot be empty");
    else updateData.name = trimmed;
  }

  if (body.plan !== undefined) {
    const { getPlanConfigs } = await import("@/libs/plan-config");
    const plans = await getPlanConfigs();
    if (!plans.find((p) => p.key === body.plan)) {
      errors.push(`plan "${body.plan}" not found. Valid: ${plans.map((p) => p.key).join(", ")}`);
    } else {
      updateData.plan = body.plan;
    }
  }

  if (body.status !== undefined) {
    if (!["pending", "active", "suspended"].includes(body.status)) {
      errors.push("status must be pending|active|suspended");
    } else {
      updateData.status = body.status;
    }
  }

  if (body.orgType !== undefined) {
    if (!["customer", "demo", "trial"].includes(body.orgType)) {
      errors.push("orgType must be customer|demo|trial");
    } else {
      updateData.orgType = body.orgType;
      // Clear trialEndsAt when switching away from trial.
      if (body.orgType !== "trial" && body.trialEndsAt === undefined) {
        updateData.trialEndsAt = null;
      }
    }
  }

  if (body.trialEndsAt !== undefined) {
    if (body.trialEndsAt === null) {
      updateData.trialEndsAt = null;
    } else {
      const parsed = new Date(body.trialEndsAt);
      if (isNaN(parsed.getTime())) {
        errors.push("trialEndsAt is not a valid date");
      } else {
        updateData.trialEndsAt = parsed;
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ message: errors.join("; ") }, { status: 400 });
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: "No fields to update" }, { status: 400 });
  }

  try {
    // Snapshot prior values so the audit log captures what actually changed.
    const before = await prisma.organization.findUnique({
      where: { id },
      select: { name: true, plan: true, status: true, orgType: true, trialEndsAt: true },
    });

    if (!before) {
      return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        orgType: true,
        trialEndsAt: true,
        updatedAt: true,
      },
    });

    // ── Audit log — record before/after for each changed field ──
    const changes: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(updateData)) {
      const k = key as keyof typeof before;
      const fromVal = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
      const toVal = updated[k as keyof typeof updated];
      const toValSerialized = toVal instanceof Date ? (toVal as Date).toISOString() : toVal;
      if (fromVal !== toValSerialized) {
        changes[key] = { from: fromVal, to: toValSerialized };
      }
    }

    const ip = await getIp();
    logAuditEvent({
      actorId: gate.admin.userId,
      actorEmail: gate.admin.email ?? "unknown",
      action: "org.update",
      targetType: "organization",
      targetId: updated.id,
      targetName: updated.name,
      metadata: { changes },
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json({
      organization: {
        id: updated.id,
        name: updated.name,
        plan: updated.plan,
        status: updated.status,
        orgType: updated.orgType,
        trialEndsAt: updated.trialEndsAt ? updated.trialEndsAt.toISOString() : null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("[admin.org.update] failed:", err);
    if (err?.code === "P2025") {
      return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Failed to update organization" }, { status: 500 });
  }
}, { endpoint: "/api/admin/organizations/[id]", method: "PATCH" });
