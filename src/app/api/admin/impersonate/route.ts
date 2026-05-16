import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/impersonate
 * Returns the owner email for an organization so the admin
 * can call signIn("impersonate") on the client.
 *
 * Body: { organizationId: string }
 * Returns: { email: string, name: string }
 */
export const POST = withErrorTracking(async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  const { organizationId } = await request.json();
  if (!organizationId) {
    return NextResponse.json({ message: "organizationId required" }, { status: 400 });
  }

  // Find the org owner
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      role: "owner",
    },
    include: {
      user: {
        select: { email: true, name: true },
      },
    },
  });

  if (!membership?.user?.email) {
    return NextResponse.json({ message: "No owner found for this organization" }, { status: 404 });
  }

  // Audit log
  const ip = await getIp();
  logAuditEvent({
    actorId: gate.admin.userId,
    actorEmail: gate.admin.email ?? "unknown",
    action: "org.impersonate",
    targetType: "organization",
    targetId: organizationId,
    targetName: membership.user.name ?? membership.user.email,
    metadata: { impersonatedEmail: membership.user.email },
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({
    email: membership.user.email,
    name: membership.user.name,
  });
}, { endpoint: "/api/admin/impersonate", method: "POST" });
