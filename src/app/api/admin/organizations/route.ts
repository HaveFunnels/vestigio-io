import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/organizations — all organizations with member/env counts
 * Query params: search (string), type (customer|demo|trial)
 */
export const GET = withErrorTracking(async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const typeFilter = searchParams.get("type") || ""; // "customer" | "demo" | "trial"

  try {
    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (typeFilter && ["customer", "demo", "trial"].includes(typeFilter)) {
      where.orgType = typeFilter;
    }

    const organizations = await prisma.organization.findMany({
      where,
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        orgType: true,
        trialEndsAt: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            environments: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      plan: org.plan || "vestigio",
      status: org.status || "active",
      orgType: org.orgType || "customer",
      trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
      memberCount: org._count.memberships,
      envCount: org._count.environments,
      createdAt: org.createdAt.toISOString(),
    }));

    return NextResponse.json({ organizations: rows });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to fetch organizations" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/organizations", method: "GET" });

// ──────────────────────────────────────────────
// POST /api/admin/organizations
//
// Admin-driven org provisioning: creates Organization + owner User
// (if email doesn't exist) + Membership + Environment + BusinessProfile
// in a single transaction, with plan/status/orgType chosen manually.
//
// Purpose: onboard customers during demos or trials without routing
// them through the self-service Stripe/Paddle checkout funnel. The
// owner User is created with a null password — admin enters the org
// via the existing impersonation flow; the customer can later set a
// password via the standard password-reset route.
// ──────────────────────────────────────────────

interface CreateOrgBody {
  name: string;
  plan: string;          // "vestigio" | "pro" | "max" (validated against getPlanConfigs)
  orgType?: "customer" | "demo" | "trial";
  status?: "pending" | "active" | "suspended";
  trialEndsAt?: string | null;  // ISO date, required if orgType="trial"
  ownerEmail: string;
  ownerName?: string | null;
  domain: string;
  landingUrl?: string | null;   // derived from domain if omitted
  isProduction?: boolean;
  businessModel?: "ecommerce" | "lead_gen" | "saas" | "hybrid";
  monthlyRevenue?: number | null;
  averageOrderValue?: number | null;
  conversionModel?: "checkout" | "whatsapp" | "form" | "external";
}

function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/\/$/, "");
  return d;
}

function deriveLandingUrl(domain: string, provided?: string | null): string {
  if (provided && provided.trim()) {
    const url = provided.trim();
    return url.startsWith("http") ? url : `https://${url}`;
  }
  return `https://${domain}`;
}

export const POST = withErrorTracking(async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: CreateOrgBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate required fields ──
  const errors: string[] = [];
  if (!body.name || !body.name.trim()) errors.push("name is required");
  if (!body.plan || !body.plan.trim()) errors.push("plan is required");
  if (!body.ownerEmail || !body.ownerEmail.trim()) errors.push("ownerEmail is required");
  if (!body.domain || !body.domain.trim()) errors.push("domain is required");

  const ownerEmail = body.ownerEmail?.trim().toLowerCase();
  if (ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    errors.push("ownerEmail is not a valid email");
  }

  const orgType = body.orgType || "customer";
  if (!["customer", "demo", "trial"].includes(orgType)) {
    errors.push("orgType must be customer|demo|trial");
  }

  const status = body.status || "active";
  if (!["pending", "active", "suspended"].includes(status)) {
    errors.push("status must be pending|active|suspended");
  }

  let trialEndsAt: Date | null = null;
  if (orgType === "trial") {
    if (!body.trialEndsAt) {
      errors.push("trialEndsAt is required when orgType is trial");
    } else {
      const parsed = new Date(body.trialEndsAt);
      if (isNaN(parsed.getTime())) {
        errors.push("trialEndsAt is not a valid date");
      } else {
        trialEndsAt = parsed;
      }
    }
  }

  const businessModel = body.businessModel || "ecommerce";
  if (!["ecommerce", "lead_gen", "saas", "hybrid"].includes(businessModel)) {
    errors.push("businessModel must be ecommerce|lead_gen|saas|hybrid");
  }

  const conversionModel = body.conversionModel || "checkout";
  if (!["checkout", "whatsapp", "form", "external"].includes(conversionModel)) {
    errors.push("conversionModel must be checkout|whatsapp|form|external");
  }

  if (errors.length > 0) {
    return NextResponse.json({ message: errors.join("; ") }, { status: 400 });
  }

  // ── Validate plan exists in PlatformConfig ──
  const { getPlanConfigs } = await import("@/libs/plan-config");
  const plans = await getPlanConfigs();
  if (!plans.find((p) => p.key === body.plan)) {
    return NextResponse.json(
      { message: `plan "${body.plan}" not found. Valid: ${plans.map((p) => p.key).join(", ")}` },
      { status: 400 },
    );
  }

  const normalizedDomain = normalizeDomain(body.domain);
  const landingUrl = deriveLandingUrl(normalizedDomain, body.landingUrl);
  const isProduction = body.isProduction !== false; // default true

  // ── Create everything in a transaction ──
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create owner User. New users get a null password —
      //    admin impersonates to enter; customer can set a password
      //    later via password-reset.
      let owner = await tx.user.findUnique({ where: { email: ownerEmail } });
      let ownerCreated = false;
      if (!owner) {
        owner = await tx.user.create({
          data: {
            email: ownerEmail,
            name: body.ownerName?.trim() || null,
            role: "USER",
          },
        });
        ownerCreated = true;
      }

      // 2. Create Organization
      const org = await tx.organization.create({
        data: {
          name: body.name.trim(),
          ownerId: owner.id,
          plan: body.plan,
          status,
          orgType,
          trialEndsAt,
        },
      });

      // 3. Create Membership (owner role)
      await tx.membership.create({
        data: {
          userId: owner.id,
          organizationId: org.id,
          role: "owner",
        },
      });

      // 4. Create Environment
      const environment = await tx.environment.create({
        data: {
          organizationId: org.id,
          domain: normalizedDomain,
          landingUrl,
          isProduction,
        },
      });

      // 5. Create BusinessProfile (best-effort: only the fields provided)
      await tx.businessProfile.create({
        data: {
          organizationId: org.id,
          businessModel,
          conversionModel,
          monthlyRevenue: body.monthlyRevenue ?? null,
          averageOrderValue: body.averageOrderValue ?? null,
        },
      });

      return { org, owner, environment, ownerCreated };
    });

    // ── Audit log ──
    const ip = await getIp();
    logAuditEvent({
      actorId: (session.user as any).id,
      actorEmail: (session.user as any).email ?? "unknown",
      action: "org.create",
      targetType: "organization",
      targetId: result.org.id,
      targetName: result.org.name,
      metadata: {
        plan: body.plan,
        orgType,
        status,
        ownerEmail,
        ownerCreated: result.ownerCreated,
        domain: normalizedDomain,
      },
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json(
      {
        organization: {
          id: result.org.id,
          name: result.org.name,
          plan: result.org.plan,
          status: result.org.status,
          orgType: result.org.orgType,
        },
        owner: {
          id: result.owner.id,
          email: result.owner.email,
          name: result.owner.name,
          created: result.ownerCreated,
        },
        environment: {
          id: result.environment.id,
          domain: result.environment.domain,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("[admin.org.create] failed:", err);
    const msg = err?.code === "P2002"
      ? "An organization with this email/domain already exists"
      : "Failed to create organization";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}, { endpoint: "/api/admin/organizations", method: "POST" });
