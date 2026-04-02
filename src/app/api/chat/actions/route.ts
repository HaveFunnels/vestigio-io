import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";

// ──────────────────────────────────────────────
// Chat Actions API — Save insights from conversation as action items
//
// When Claude discovers a new actionable insight during chat,
// it emits a $$CREATEACTION$$ block. The user clicks "Save as action"
// and this endpoint persists it.
//
// Uses the existing PlatformConfig/finding infrastructure where possible.
// For now, stores as a simple record in the database.
// ──────────────────────────────────────────────

function sanitize(text: string, maxLen: number): string {
  return text
    .replace(/[<>&]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, maxLen)
    .trim();
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: {
    title: string;
    description: string;
    severity: string;
    estimatedImpact?: number;
    conversationId?: string;
  };

  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Invalid body" }, { status: 400 }); }

  if (!body.title || !body.description) {
    return NextResponse.json({ message: "title and description are required" }, { status: 400 });
  }

  const validSeverities = ["critical", "high", "medium", "low"];
  const severity = validSeverities.includes(body.severity) ? body.severity : "medium";

  try {
    const { prisma } = await import("@/libs/prismaDb");

    const membership = await prisma.membership.findFirst({
      where: { userId },
      select: { organizationId: true },
    });

    if (!membership) return NextResponse.json({ message: "No organization" }, { status: 403 });

    // Store as a platform-level note/action using McpPromptEvent table
    // (repurposed — or create a dedicated ChatAction table in future)
    // For now, we use the existing SuppressionRule table pattern to store user-created actions
    // Actually, let's just use a clean approach: store in a simple JSON field on PlatformConfig
    // or create an entry via the MCP engine's action system.

    // Simplest correct approach: create a ConversationMessage of type "action" to persist the action
    // alongside the conversation where it was discovered.
    if (body.conversationId) {
      await prisma.conversationMessage.create({
        data: {
          conversationId: body.conversationId,
          role: "system",
          content: JSON.stringify({
            type: "saved_action",
            title: sanitize(body.title, 200),
            description: sanitize(body.description, 1000),
            severity,
            estimatedImpact: typeof body.estimatedImpact === "number" ? body.estimatedImpact : null,
            savedBy: userId,
            savedAt: new Date().toISOString(),
          }),
          purpose: "action_saved",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      action: {
        title: sanitize(body.title, 200),
        severity,
        estimatedImpact: body.estimatedImpact,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[chat:actions] Failed to save:", err instanceof Error ? err.message : err);
    return NextResponse.json({ message: "Failed to save action" }, { status: 500 });
  }
}
