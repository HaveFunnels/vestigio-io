import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/organizations/[id]/suspend — toggle org suspension
 * Body: { suspended: boolean }
 */
export const POST = withErrorTracking(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const suspended = body.suspended !== false; // default to true

  try {
    const org = await prisma.organization.findUnique({ where: { id } });

    if (!org) {
      return NextResponse.json({ message: "Organization not found" }, { status: 404 });
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: { status: suspended ? "suspended" : "active" },
      select: { id: true, name: true, status: true },
    });

    // Audit log
    const ip = await getIp();
    logAuditEvent({
      actorId: gate.admin.userId,
      actorEmail: gate.admin.email ?? "unknown",
      action: suspended ? "org.suspend" : "org.reactivate",
      targetType: "organization",
      targetId: updated.id,
      targetName: updated.name,
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json({
      message: `Organization ${suspended ? "suspended" : "reactivated"} successfully`,
      organization: updated,
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Failed to update organization status" },
      { status: 500 },
    );
  }
}, { endpoint: "/api/admin/organizations/[id]/suspend", method: "POST" });
