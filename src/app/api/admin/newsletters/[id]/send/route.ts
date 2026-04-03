import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/newsletters/[id]/send — send a draft newsletter
 * Updates status from draft -> sending -> sent.
 * Actual email delivery is a future integration.
 */
export const POST = withErrorTracking(async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  try {
    const newsletter = await prisma.newsletter.findUnique({ where: { id } });

    if (!newsletter) {
      return NextResponse.json(
        { message: "Newsletter not found" },
        { status: 404 },
      );
    }

    if (newsletter.status !== "draft") {
      return NextResponse.json(
        { message: `Cannot send a newsletter with status "${newsletter.status}"` },
        { status: 400 },
      );
    }

    // Mark as sending
    await prisma.newsletter.update({
      where: { id },
      data: { status: "sending" },
    });

    // Count recipients based on audience
    const planFilter: Record<string, string | undefined> = {
      all: undefined,
      free: "vestigio",
      pro: "pro",
      max: "max",
    };
    const planValue = planFilter[newsletter.audience];

    let recipientCount = 0;
    if (planValue) {
      recipientCount = await prisma.organization.count({
        where: { plan: planValue, status: "active" },
      });
    } else {
      recipientCount = await prisma.organization.count({
        where: { status: "active" },
      });
    }

    // Mark as sent (actual email sending integration can come later)
    const updated = await prisma.newsletter.update({
      where: { id },
      data: {
        status: "sent",
        recipientCount,
        sentAt: new Date(),
      },
    });

    // Audit log
    const ip = await getIp();
    logAuditEvent({
      actorId: (session.user as any).id,
      actorEmail: (session.user as any).email ?? "unknown",
      action: "newsletter.send",
      targetType: "newsletter",
      targetId: updated.id,
      targetName: updated.subject,
      metadata: { audience: updated.audience, recipientCount },
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json({
      newsletter: {
        id: updated.id,
        subject: updated.subject,
        content: updated.content,
        audience: updated.audience,
        status: updated.status,
        recipientCount: updated.recipientCount,
        sentAt: updated.sentAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to send newsletter" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/newsletters/[id]/send", method: "POST" });
