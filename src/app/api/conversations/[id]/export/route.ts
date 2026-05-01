import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import {
  formatAsJson,
  formatAsMarkdown,
  formatAsCsv,
  type ConversationWithMessages,
} from "@/lib/conversation-export";

// ──────────────────────────────────────────────
// Conversation Export — GET /api/conversations/[id]/export
//
// Returns the conversation in one of three formats:
//   ?format=json      → application/json download
//   ?format=markdown  → text/markdown download
//   ?format=csv       → text/csv download
//
// Auth: requires session, validates user is member of the org.
// System messages are excluded from the export.
// ──────────────────────────────────────────────

export const runtime = "nodejs";

export const GET = withErrorTracking(
  async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id;
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Parse format query parameter
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json";
    if (!["json", "markdown", "csv"].includes(format)) {
      return NextResponse.json(
        { message: "Invalid format. Use json, markdown, or csv." },
        { status: 400 },
      );
    }

    // Fetch conversation
    const conversation = await prisma.conversation.findFirst({
      where: { id, status: { not: "deleted" } },
    });
    if (!conversation) {
      return NextResponse.json(
        { message: "Conversation not found" },
        { status: 404 },
      );
    }

    // Validate membership
    const membership = await prisma.membership.findFirst({
      where: { userId, organizationId: conversation.organizationId },
    });
    if (!membership) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    // Fetch messages
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
    });

    if (messages.length === 0) {
      return NextResponse.json(
        { message: "No messages to export" },
        { status: 404 },
      );
    }

    // Build the payload
    const payload: ConversationWithMessages = {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        model: m.model,
        createdAt: m.createdAt,
      })),
    };

    // Format and return with appropriate headers
    const slug = (conversation.title || "conversation")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);

    switch (format) {
      case "markdown": {
        const body = formatAsMarkdown(payload);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.md"`,
          },
        });
      }
      case "csv": {
        const body = formatAsCsv(payload);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.csv"`,
          },
        });
      }
      default: {
        // json
        const body = formatAsJson(payload);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.json"`,
          },
        });
      }
    }
  },
  { endpoint: "/api/conversations/[id]/export", method: "GET" },
);
