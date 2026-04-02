import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/organizations — all organizations with member/env counts
 * Query params: search (string)
 */
export const GET = withErrorTracking(async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || "";

  try {
    const organizations = await prisma.organization.findMany({
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : {},
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
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
