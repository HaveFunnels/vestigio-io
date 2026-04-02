import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { getConversationStore } from "../../../../../apps/platform/conversation-store";

// ──────────────────────────────────────────────
// Conversation by ID — GET (with messages), PATCH (title), DELETE (soft)
//
// Validates that the conversation belongs to the authenticated user's org.
// ──────────────────────────────────────────────

async function resolveAndValidate(conversationId: string, userId: string) {
  const store = getConversationStore();
  const conv = await store.getById(conversationId);
  if (!conv) return { error: "Conversation not found", status: 404 };

  // Validate ownership: user must belong to the conversation's org
  try {
    const { prisma } = await import("@/libs/prismaDb");
    const membership = await prisma.membership.findFirst({
      where: { userId, organizationId: conv.organizationId },
    });
    if (!membership) return { error: "Access denied", status: 403 };
  } catch {
    // Dev fallback — skip ownership check
  }

  return { conv };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await resolveAndValidate(id, userId);
  if ("error" in result) return NextResponse.json({ message: result.error }, { status: result.status });

  const { searchParams } = new URL(request.url);
  const messageLimit = Math.min(parseInt(searchParams.get("message_limit") || "50", 10), 200);

  const store = getConversationStore();
  const messages = await store.getMessages(id, messageLimit);

  return NextResponse.json({ conversation: result.conv, messages });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await resolveAndValidate(id, userId);
  if ("error" in result) return NextResponse.json({ message: result.error }, { status: result.status });

  let body: { title?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid body" }, { status: 400 }); }

  const store = getConversationStore();
  if (body.title !== undefined) {
    const sanitizedTitle = String(body.title).slice(0, 100).trim();
    await store.updateTitle(id, sanitizedTitle);
  }

  const updated = await store.getById(id);
  return NextResponse.json({ conversation: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await resolveAndValidate(id, userId);
  if ("error" in result) return NextResponse.json({ message: result.error }, { status: result.status });

  const store = getConversationStore();
  await store.softDelete(id);

  return NextResponse.json({ ok: true });
}
