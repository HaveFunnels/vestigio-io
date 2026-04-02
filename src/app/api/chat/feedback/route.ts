import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";

// ──────────────────────────────────────────────
// Chat Feedback API — POST (submit) + GET (admin list)
//
// Users submit thumbs up/down with optional comment.
// Admin can list all feedback for quality monitoring.
// ──────────────────────────────────────────────

const MAX_COMMENT_LENGTH = 500;

/** Sanitize comment: strip HTML, control chars, truncate */
function sanitizeComment(raw: string): string {
  return raw
    .replace(/[<>&"']/g, "") // strip HTML-significant chars
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .slice(0, MAX_COMMENT_LENGTH)
    .trim();
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: {
    messageId?: string;
    conversationId?: string;
    rating: string;
    comment?: string;
    messagePreview?: string;
    model?: string;
  };

  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Invalid body" }, { status: 400 }); }

  if (!body.rating || !["positive", "negative"].includes(body.rating)) {
    return NextResponse.json({ message: "rating must be 'positive' or 'negative'" }, { status: 400 });
  }

  // Resolve org
  let orgId = "unknown";
  try {
    const { prisma } = await import("@/libs/prismaDb");
    const membership = await prisma.membership.findFirst({
      where: { userId },
      select: { organizationId: true },
    });
    if (membership) orgId = membership.organizationId;

    await prisma.chatFeedback.create({
      data: {
        organizationId: orgId,
        userId,
        conversationId: body.conversationId || null,
        messageId: body.messageId || null,
        rating: body.rating,
        comment: body.comment ? sanitizeComment(body.comment) : null,
        messagePreview: body.messagePreview ? body.messagePreview.slice(0, 200) : null,
        model: body.model || null,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[chat:feedback] Failed to save:", err instanceof Error ? err.message : err);
    return NextResponse.json({ message: "Failed to save feedback" }, { status: 500 });
  }
}

/** GET — Admin-only: list feedback with pagination */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rating = searchParams.get("rating") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const cursor = searchParams.get("cursor") || undefined;

  try {
    const { prisma } = await import("@/libs/prismaDb");

    const feedback = await prisma.chatFeedback.findMany({
      where: rating ? { rating } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const totals = {
      positive: await prisma.chatFeedback.count({ where: { rating: "positive" } }),
      negative: await prisma.chatFeedback.count({ where: { rating: "negative" } }),
      total: await prisma.chatFeedback.count(),
      with_comments: await prisma.chatFeedback.count({ where: { comment: { not: null } } }),
    };

    return NextResponse.json({
      feedback,
      totals,
      next_cursor: feedback.length === limit ? feedback[feedback.length - 1]?.id : null,
    });
  } catch {
    return NextResponse.json({ message: "Failed to fetch feedback" }, { status: 500 });
  }
}
