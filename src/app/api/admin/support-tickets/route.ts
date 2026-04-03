import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Admin Support Tickets API
// GET   — list tickets with filtering/search
// PATCH — update ticket status/priority/category
// ──────────────────────────────────────────────

// ── GET: List tickets (admin) ──

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: Record<string, unknown> = {};

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: { replies: true },
          },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        userId: t.userId,
        subject: t.subject,
        message: t.message,
        status: t.status,
        priority: t.priority,
        category: t.category,
        replyCount: t._count.replies,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[admin/support-tickets] GET error:", error);
    return NextResponse.json(
      { message: "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}

// ── PATCH: Update a ticket ──

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, status, priority, category } = body as {
      id?: string;
      status?: string;
      priority?: string;
      category?: string;
    };

    if (!id) {
      return NextResponse.json(
        { message: "Ticket id is required" },
        { status: 400 }
      );
    }

    // Validate provided fields
    const validStatuses = ["open", "in_progress", "resolved", "closed", "spam"];
    const validPriorities = ["low", "normal", "high", "urgent"];
    const validCategories = ["general", "bug", "feature", "billing", "security"];

    const data: Record<string, string> = {};

    if (status) {
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      data.status = status;
    }

    if (priority) {
      if (!validPriorities.includes(priority)) {
        return NextResponse.json(
          { message: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` },
          { status: 400 }
        );
      }
      data.priority = priority;
    }

    if (category) {
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { message: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
          { status: 400 }
        );
      }
      data.category = category;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.supportTicket.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ticket: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        userId: updated.userId,
        subject: updated.subject,
        message: updated.message,
        status: updated.status,
        priority: updated.priority,
        category: updated.category,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[admin/support-tickets] PATCH error:", error);
    return NextResponse.json(
      { message: "Failed to update ticket" },
      { status: 500 }
    );
  }
}
