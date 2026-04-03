import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Admin Ticket Replies API
// GET  — list all replies for a ticket
// POST — create a staff reply
// ──────────────────────────────────────────────

/** Allowed HTML tags for staff replies */
const ALLOWED_TAGS = ["b", "i", "p", "br", "ul", "ol", "li", "a"];

/**
 * Sanitize HTML content: strip dangerous tags but allow basic formatting.
 * Keeps only tags in the ALLOWED_TAGS list. Attributes are stripped except
 * href on <a> tags (and only http/https/mailto URLs).
 */
function sanitizeHtml(raw: string): string {
  // First pass: remove script, style, and other dangerous tags entirely (including content)
  let cleaned = raw.replace(
    /<(script|style|iframe|object|embed|form|input|textarea|select|button)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  // Remove self-closing dangerous tags
  cleaned = cleaned.replace(
    /<(script|style|iframe|object|embed|form|input|textarea|select|button)\b[^>]*\/?>/gi,
    ""
  );

  // Remove event handlers from any remaining tags
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // Process remaining tags: keep allowed, strip others
  cleaned = cleaned.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag) => {
    const lowerTag = tag.toLowerCase();

    if (!ALLOWED_TAGS.includes(lowerTag)) {
      return ""; // Strip disallowed tags
    }

    // For <a> tags, preserve href but only for safe protocols
    if (lowerTag === "a") {
      const hrefMatch = match.match(/href\s*=\s*["']?(https?:\/\/[^"'\s>]+|mailto:[^"'\s>]+)["']?/i);
      if (match.startsWith("</")) {
        return "</a>";
      }
      if (hrefMatch) {
        return `<a href="${hrefMatch[1]}">`;
      }
      return "<a>";
    }

    // For all other allowed tags, strip attributes
    if (match.startsWith("</")) {
      return `</${lowerTag}>`;
    }
    // Self-closing tags like <br />
    if (match.endsWith("/>")) {
      return `<${lowerTag} />`;
    }
    return `<${lowerTag}>`;
  });

  return cleaned.trim().slice(0, 10000);
}

// ── GET: List replies for a ticket ──

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id: ticketId } = await params;

  try {
    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { message: "Ticket not found" },
        { status: 404 }
      );
    }

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      replies: replies.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        authorId: r.authorId,
        authorName: r.authorName,
        authorEmail: r.authorEmail,
        content: r.content,
        isStaff: r.isStaff,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[admin/support-tickets/replies] GET error:", error);
    return NextResponse.json(
      { message: "Failed to fetch replies" },
      { status: 500 }
    );
  }
}

// ── POST: Create a staff reply ──

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id: ticketId } = await params;

  try {
    const body = await req.json();
    const { content } = body as { content?: string };

    if (!content || !content.trim()) {
      return NextResponse.json(
        { message: "Content is required" },
        { status: 400 }
      );
    }

    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { message: "Ticket not found" },
        { status: 404 }
      );
    }

    const sanitizedContent = sanitizeHtml(content);

    const adminId = (session.user as any).id as string;
    const adminName = session.user.name || "Staff";
    const adminEmail = session.user.email || "";

    // Create reply and update ticket's updatedAt in a transaction
    const [reply] = await prisma.$transaction([
      prisma.ticketReply.create({
        data: {
          ticketId,
          authorId: adminId,
          authorName: adminName,
          authorEmail: adminEmail,
          content: sanitizedContent,
          isStaff: true,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return NextResponse.json(
      {
        reply: {
          id: reply.id,
          ticketId: reply.ticketId,
          authorId: reply.authorId,
          authorName: reply.authorName,
          authorEmail: reply.authorEmail,
          content: reply.content,
          isStaff: reply.isStaff,
          createdAt: reply.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[admin/support-tickets/replies] POST error:", error);
    return NextResponse.json(
      { message: "Failed to create reply" },
      { status: 500 }
    );
  }
}
