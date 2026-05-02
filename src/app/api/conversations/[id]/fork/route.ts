import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Conversation Fork — POST /api/conversations/[id]/fork
//
// Creates a brand new conversation that copies all messages from the
// source conversation up to and including a specific "fork point"
// message id. The user lands on the new conversation and can
// continue the thread along a different path without losing the
// shared prefix.
//
// **Why:** users testing alternate questions ("what if I ask this
// instead?") used to have only one option — start a new conversation
// from scratch and lose every turn of context they'd already built
// up. Forking preserves the prefix so they can branch off any point.
//
// Body shape:
//   { from_message_id: string }   ← inclusive: this message is the
//                                    LAST one copied into the fork
//
// Response:
//   { conversation: ConversationRecord, message_count: number }
//
// Auth: requires session, validates ownership via membership.
// Auth pattern matches /api/conversations/[id]/route.ts.
// ──────────────────────────────────────────────

export const runtime = "nodejs";

export const POST = withErrorTracking(
  async function POST(
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

    const { id: sourceId } = await params;

    let body: { from_message_id?: string };
    try {
      body = (await request.json()) as { from_message_id?: string };
    } catch {
      return NextResponse.json({ message: "Invalid body" }, { status: 400 });
    }

    const fromMessageId = body.from_message_id?.trim();
    if (!fromMessageId) {
      return NextResponse.json(
        { message: "from_message_id is required" },
        { status: 400 },
      );
    }

    // Validate ownership of the source conversation. Same shape as
    // resolveAndValidate in [id]/route.ts — we re-implement it here
    // rather than refactor that helper out for one extra caller.
    const source = await prisma.conversation.findFirst({
      where: { id: sourceId, status: { not: "deleted" } },
    });
    if (!source) {
      return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId, organizationId: source.organizationId },
    });
    if (!membership) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    // Pull all messages so we can find the fork point and slice up
    // to it. The fork point itself is INCLUDED — copying [0..N] is
    // more useful than [0..N-1] because the user is usually saying
    // "fork from this assistant response and ask something else,
    // keeping that response visible above the new turn".
    const allMessages = await prisma.conversationMessage.findMany({
      where: { conversationId: sourceId },
      orderBy: { createdAt: "asc" },
    });

    const forkIdx = allMessages.findIndex((m) => m.id === fromMessageId);
    if (forkIdx === -1) {
      return NextResponse.json(
        { message: "from_message_id not found in this conversation" },
        { status: 404 },
      );
    }

    const messagesToCopy = allMessages.slice(0, forkIdx + 1);

    // Create the new conversation + clone messages atomically.
    // Title prefixed with "Fork:" so it's recognisable in the
    // sidebar without overwriting the original. messageCount stays
    // in sync with the cloned set; cost totals start at 0 because
    // the costs were already paid on the source conversation and
    // re-attributing them would double-count the user's budget.
    const forkedTitle = source.title
      ? `Fork: ${source.title}`.slice(0, 100)
      : "Fork";

    const result = await prisma.$transaction(async (tx) => {
      const fork = await tx.conversation.create({
        data: {
          organizationId: source.organizationId,
          userId: userId,
          environmentId: source.environmentId,
          title: forkedTitle,
          status: "active",
          messageCount: messagesToCopy.length,
          totalCostCents: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
        },
      });

      // Bulk-clone with createMany. Each row gets the new
      // conversationId; everything else (role, content, model,
      // tokens, cost, toolCalls, purpose, createdAt) carries over
      // verbatim so the rendered fork is byte-identical to the
      // prefix of the source — including the resolved JSON content
      // blocks persisted by the chat route.
      if (messagesToCopy.length > 0) {
        await tx.conversationMessage.createMany({
          data: messagesToCopy.map((m) => ({
            conversationId: fork.id,
            role: m.role,
            content: m.content,
            model: m.model,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            costCents: m.costCents,
            toolCalls: m.toolCalls,
            purpose: m.purpose,
            createdAt: m.createdAt,
          })),
        });
      }

      return fork;
    });

    return NextResponse.json({
      conversation: {
        id: result.id,
        organizationId: result.organizationId,
        userId: result.userId,
        environmentId: result.environmentId,
        title: result.title,
        status: result.status,
        messageCount: result.messageCount,
        totalCostCents: result.totalCostCents,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
      message_count: messagesToCopy.length,
    });
  },
  { endpoint: "/api/conversations/[id]/fork", method: "POST" },
);
