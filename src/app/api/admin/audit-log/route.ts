import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/audit-log — list audit logs with pagination and filters
 *
 * Query params:
 *   limit    — page size (default 50, max 200)
 *   offset   — skip N rows
 *   action   — filter by action (exact match)
 *   actor    — filter by actorEmail (contains, case-insensitive)
 *   targetType — filter by targetType
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;
  const action = url.searchParams.get("action") || undefined;
  const actor = url.searchParams.get("actor") || undefined;
  const targetType = url.searchParams.get("targetType") || undefined;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;
  if (actor) {
    where.actorEmail = { contains: actor, mode: "insensitive" };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, limit, offset });
}
