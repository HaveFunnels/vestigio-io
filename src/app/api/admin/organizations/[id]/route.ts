import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/organizations/[id] — org detail with members + environments
 */
export const GET = withErrorTracking(async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

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
      },
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to fetch organization details" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/organizations/[id]", method: "GET" });
