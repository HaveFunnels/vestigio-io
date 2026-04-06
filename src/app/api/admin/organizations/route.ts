import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
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
