import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { z } from "zod";

// ──────────────────────────────────────────────
// Organization API — GET (details) + PATCH (update)
//
// Authenticates via session, resolves membership,
// returns full org context with environments,
// members, and business profile.
// ──────────────────────────────────────────────

async function resolveUserMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return membership;
}

export const GET = withErrorTracking(async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const membership = await resolveUserMembership(userId);
  if (!membership) {
    return NextResponse.json({ message: "No organization found" }, { status: 404 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: membership.organizationId },
    include: {
      environments: {
        orderBy: { createdAt: "desc" },
      },
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      businessProfile: true,
    },
  });

  if (!organization) {
    return NextResponse.json({ message: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      ownerId: organization.ownerId,
      plan: organization.plan,
      status: organization.status,
      createdAt: organization.createdAt,
    },
    environments: organization.environments.map((env) => ({
      id: env.id,
      domain: env.domain,
      landingUrl: env.landingUrl,
      isProduction: env.isProduction,
      createdAt: env.createdAt,
    })),
    members: organization.memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      createdAt: m.createdAt,
    })),
    businessProfile: organization.businessProfile
      ? {
          id: organization.businessProfile.id,
          businessModel: organization.businessProfile.businessModel,
          monthlyRevenue: organization.businessProfile.monthlyRevenue,
          averageOrderValue: organization.businessProfile.averageOrderValue,
          monthlyTransactions: organization.businessProfile.monthlyTransactions,
          conversionRate: organization.businessProfile.conversionRate,
          conversionModel: organization.businessProfile.conversionModel,
        }
      : null,
    currentUserRole: membership.role,
  });
}, { endpoint: "/api/organization", method: "GET" });

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  businessModel: z.enum(["ecommerce", "lead_gen", "saas", "hybrid"]).optional(),
  monthlyRevenue: z.number().nullable().optional(),
  averageOrderValue: z.number().nullable().optional(),
  monthlyTransactions: z.number().int().nullable().optional(),
  conversionRate: z.number().nullable().optional(),
  conversionModel: z.enum(["checkout", "whatsapp", "form", "external"]).optional(),
});

export const PATCH = withErrorTracking(async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const membership = await resolveUserMembership(userId);
  if (!membership) {
    return NextResponse.json({ message: "No organization found" }, { status: 404 });
  }

  // Only owner or admin can update org
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ message: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const res = patchSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, businessModel, monthlyRevenue, averageOrderValue, monthlyTransactions, conversionRate, conversionModel } = res.data;

  // Update organization name if provided
  if (name) {
    await prisma.organization.update({
      where: { id: membership.organizationId },
      data: { name },
    });
  }

  // Update business profile if any business fields provided
  const businessFields = { businessModel, monthlyRevenue, averageOrderValue, monthlyTransactions, conversionRate, conversionModel };
  const hasBusinessUpdate = Object.values(businessFields).some((v) => v !== undefined);

  if (hasBusinessUpdate) {
    const updateData: Record<string, any> = {};
    if (businessModel !== undefined) updateData.businessModel = businessModel;
    if (monthlyRevenue !== undefined) updateData.monthlyRevenue = monthlyRevenue;
    if (averageOrderValue !== undefined) updateData.averageOrderValue = averageOrderValue;
    if (monthlyTransactions !== undefined) updateData.monthlyTransactions = monthlyTransactions;
    if (conversionRate !== undefined) updateData.conversionRate = conversionRate;
    if (conversionModel !== undefined) updateData.conversionModel = conversionModel;

    await prisma.businessProfile.upsert({
      where: { organizationId: membership.organizationId },
      update: updateData,
      create: {
        organizationId: membership.organizationId,
        ...updateData,
      },
    });
  }

  return NextResponse.json({ message: "Organization updated" });
}, { endpoint: "/api/organization", method: "PATCH" });
