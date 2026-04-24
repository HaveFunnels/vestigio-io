import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { randomBytes } from "node:crypto";
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
// Admin-driven org provisioning.
//
// Two modes, controlled by whether `domain` is provided:
//
//   (A) Shell mode — no domain supplied.
//       Creates only Organization + owner User + Membership. The owner
//       finishes setup (env + BusinessProfile + first audit cycle) via
//       the onboarding flow after impersonation or login. This is the
//       preferred mode because it lets the owner contribute their own
//       revenue/AOV/business-model data instead of the admin guessing.
//
//   (B) Provisioned mode — domain + business fields supplied.
//       Also creates Environment + BusinessProfile inline. Useful when
//       the admin already has trustworthy business data (e.g. pulled
//       from a sales conversation) and wants a one-shot setup. The env
//       is NOT marked `activated=true` in this mode — the owner still
//       has to hit the activate endpoint to trigger the first cycle so
//       we never dispatch audits from an admin screen without the
//       owner's review.
//
// Plan/status/orgType/trialEndsAt are chosen manually and bypass the
// Stripe/Paddle funnel. The owner User is created with a null password
// — admin enters the org via the impersonation flow; the customer can
// later set a password via the standard password-reset route.
// ──────────────────────────────────────────────

interface CreateOrgBody {
  name: string;
  plan: string;          // "vestigio" | "pro" | "max" (validated against getPlanConfigs)
  orgType?: "customer" | "demo" | "trial";
  status?: "pending" | "active" | "suspended";
  trialEndsAt?: string | null;  // ISO date, required if orgType="trial"
  ownerEmail: string;
  ownerName?: string | null;
  // Mode (B) fields — all optional; presence of `domain` flips to provisioned mode.
  domain?: string | null;
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

  // ── Validate required fields (shell mode is the baseline) ──
  const errors: string[] = [];
  if (!body.name || !body.name.trim()) errors.push("name is required");
  if (!body.plan || !body.plan.trim()) errors.push("plan is required");
  if (!body.ownerEmail || !body.ownerEmail.trim()) errors.push("ownerEmail is required");

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

  // Provisioned-mode fields are only validated when `domain` is present.
  // In shell mode these are ignored.
  const provisionedMode = !!(body.domain && body.domain.trim());
  const businessModel = body.businessModel || "ecommerce";
  const conversionModel = body.conversionModel || "checkout";
  if (provisionedMode) {
    if (!["ecommerce", "lead_gen", "saas", "hybrid"].includes(businessModel)) {
      errors.push("businessModel must be ecommerce|lead_gen|saas|hybrid");
    }
    if (!["checkout", "whatsapp", "form", "external"].includes(conversionModel)) {
      errors.push("conversionModel must be checkout|whatsapp|form|external");
    }
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

  const normalizedDomain = provisionedMode ? normalizeDomain(body.domain!) : null;
  const landingUrl = provisionedMode && normalizedDomain
    ? deriveLandingUrl(normalizedDomain, body.landingUrl)
    : null;
  const isProduction = body.isProduction !== false; // default true

  // ── Create everything in a transaction ──
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create owner User. New users get a null password —
      //    admin impersonates to enter; customer can set a password
      //    later via password-reset.
      let owner = await tx.user.findUnique({ where: { email: ownerEmail } });
      let ownerCreated = false;
      let activationToken: string | null = null;
      if (!owner) {
        // Generate activation token so the owner can set a password
        // or link OAuth when they receive the activation email.
        activationToken = randomBytes(32).toString("hex");
        const tokenTTL = 7 * 24 * 60 * 60 * 1000; // 7 days for admin-provisioned
        owner = await tx.user.create({
          data: {
            email: ownerEmail,
            name: body.ownerName?.trim() || null,
            role: "USER",
            activationToken,
            activationTokenExpiresAt: new Date(Date.now() + tokenTTL),
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

      // Shell mode stops here — owner finishes setup via onboarding.
      let environment: { id: string; domain: string } | null = null;
      if (provisionedMode && normalizedDomain && landingUrl) {
        // 4. Create Environment (not yet activated; owner still has to
        //    click "Activate Environment" from onboarding to trigger
        //    the first cycle. Admin provisioning the domain doesn't
        //    imply admin wants to run an audit against it right now).
        environment = await tx.environment.create({
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
      }

      return { org, owner, environment, ownerCreated, activationToken };
    });

    // ── Send activation email (fire-and-forget) ──
    // Only for newly created users — existing users already have auth.
    if (result.ownerCreated && result.activationToken) {
      import("@/libs/notification-triggers")
        .then(({ sendActivationEmail }) =>
          sendActivationEmail(
            ownerEmail,
            result.activationToken!,
            normalizedDomain || result.org.name,
          ),
        )
        .catch((err) => console.error("[admin.org.create] activation email failed:", err));
    }

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
        mode: provisionedMode ? "provisioned" : "shell",
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
        environment: result.environment
          ? { id: result.environment.id, domain: result.environment.domain }
          : null,
        mode: provisionedMode ? "provisioned" : "shell",
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
