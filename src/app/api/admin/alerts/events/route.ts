import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET   /api/admin/alerts/events — list alert events with pagination
 * PATCH /api/admin/alerts/events — acknowledge an event
 *
 * Query params (GET):
 *   limit        — page size (default 50, max 200)
 *   offset       — skip N rows
 *   acknowledged — "true" | "false" (optional filter)
 */

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }
  return session.user;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;
  const ackParam = url.searchParams.get("acknowledged");

  const where: Record<string, unknown> = {};
  if (ackParam === "true") where.acknowledged = true;
  if (ackParam === "false") where.acknowledged = false;

  const [events, total] = await Promise.all([
    prisma.alertEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        rule: { select: { name: true, metric: true } },
      },
    }),
    prisma.alertEvent.count({ where }),
  ]);

  return NextResponse.json({ events, total, limit, offset });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  const event = await prisma.alertEvent.update({
    where: { id },
    data: { acknowledged: true },
  });

  return NextResponse.json({ event });
}
