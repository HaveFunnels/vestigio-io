import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { getSmtpTransport } from "@/libs/email";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

const BATCH_SIZE = 50;

/**
 * POST /api/admin/newsletters/[id]/send — send a draft newsletter
 * Updates status from draft -> sending -> sent.
 * Sends emails in batches of 50 via SMTP (DB config with env var fallback).
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

    // ── Resolve recipient emails based on audience ──────────────
    const planFilter: Record<string, string | undefined> = {
      all: undefined,
      free: "vestigio",
      pro: "pro",
      max: "max",
    };
    const planValue = planFilter[newsletter.audience];

    const orgWhere = planValue
      ? { plan: planValue, status: "active" }
      : { status: "active" as const };

    // Get unique user emails via memberships in matching organisations
    const memberships = await prisma.membership.findMany({
      where: { organization: orgWhere },
      select: { user: { select: { email: true } } },
    });

    const recipientEmails = [
      ...new Set(
        memberships
          .map((m) => m.user.email)
          .filter((e): e is string => Boolean(e)),
      ),
    ];

    const recipientCount = recipientEmails.length;

    if (recipientCount === 0) {
      // Nothing to send — mark as sent with 0 recipients
      const updated = await prisma.newsletter.update({
        where: { id },
        data: { status: "sent", recipientCount: 0, sentAt: new Date() },
      });

      return NextResponse.json({ newsletter: formatNewsletter(updated) });
    }

    // ── Send emails in batches ──────────────────────────────────
    try {
      const { transporter, from } = await getSmtpTransport();

      for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
        const batch = recipientEmails.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((email) =>
            transporter.sendMail({
              from,
              to: email,
              subject: newsletter.subject,
              html: newsletter.content,
            }),
          ),
        );
      }
    } catch (sendError: unknown) {
      // Sending failed — mark newsletter as failed with error info
      const errorMessage =
        sendError instanceof Error ? sendError.message : String(sendError);

      await prisma.newsletter.update({
        where: { id },
        data: { status: "failed" },
      });

      return NextResponse.json(
        { message: `Email delivery failed: ${errorMessage}` },
        { status: 502 },
      );
    }

    // ── Mark as sent ────────────────────────────────────────────
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
      newsletter: formatNewsletter(updated),
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to send newsletter" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/newsletters/[id]/send", method: "POST" });

// ── Helpers ───────────────────────────────────────────────────────
function formatNewsletter(n: {
  id: string;
  subject: string;
  content: string;
  audience: string;
  status: string;
  recipientCount: number | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: n.id,
    subject: n.subject,
    content: n.content,
    audience: n.audience,
    status: n.status,
    recipientCount: n.recipientCount,
    sentAt: n.sentAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}
