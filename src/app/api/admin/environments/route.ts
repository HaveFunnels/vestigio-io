import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/environments — all environments with org name and last audit status
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
    const environments = await prisma.environment.findMany({
      where: search
        ? { domain: { contains: search, mode: "insensitive" } }
        : {},
      select: {
        id: true,
        domain: true,
        isProduction: true,
        createdAt: true,
        organization: {
          select: { name: true },
        },
        auditCycles: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = environments.map((env) => ({
      id: env.id,
      domain: env.domain,
      orgName: env.organization.name,
      isProduction: env.isProduction,
      lastAuditStatus: env.auditCycles[0]?.status || "none",
      createdAt: env.createdAt.toISOString(),
    }));

    return NextResponse.json({ environments: rows });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to fetch environments" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/environments", method: "GET" });
