import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Admin Feedback API
// GET   — list feedback with filtering/search + grouped counts
// PATCH — update feedback status/category
// ──────────────────────────────────────────────

// ── GET: List feedback (admin) ──

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: Record<string, unknown> = {};

  if (type) where.type = type;
  if (status) where.status = status;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
      { userEmail: { contains: search, mode: "insensitive" } },
      { userName: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [feedbacks, total, groupedByType] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.feedback.count({ where }),
      prisma.feedback.groupBy({
        by: ["type"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
    ]);

    return NextResponse.json({
      feedbacks: feedbacks.map((f) => ({
        id: f.id,
        userId: f.userId,
        userEmail: f.userEmail,
        userName: f.userName,
        type: f.type,
        category: f.category,
        title: f.title,
        content: f.content,
        rating: f.rating,
        page: f.page,
        status: f.status,
        metadata: f.metadata,
        createdAt: f.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
      groupedByType: groupedByType.map((g) => ({
        type: g.type,
        count: g._count.id,
      })),
    });
  } catch (error) {
    console.error("[admin/feedback] GET error:", error);
    return NextResponse.json(
      { message: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

// ── PATCH: Update feedback ──

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, status, category } = body as {
      id?: string;
      status?: string;
      category?: string;
    };

    if (!id) {
      return NextResponse.json(
        { message: "Feedback id is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["new", "reviewed", "acknowledged", "actioned", "dismissed"];

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

    if (category !== undefined) {
      // Category is a free-form groupable field set by admin
      data.category = category;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      feedback: {
        id: updated.id,
        userId: updated.userId,
        userEmail: updated.userEmail,
        userName: updated.userName,
        type: updated.type,
        category: updated.category,
        title: updated.title,
        content: updated.content,
        rating: updated.rating,
        page: updated.page,
        status: updated.status,
        metadata: updated.metadata,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[admin/feedback] PATCH error:", error);
    return NextResponse.json(
      { message: "Failed to update feedback" },
      { status: 500 }
    );
  }
}
