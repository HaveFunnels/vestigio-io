import { signImpersonationToken } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/impersonate
 *
 * Server-gated by requireAdmin(). Returns the target user's display
 * info plus a short-lived HMAC token bound to (adminUserId,
 * targetUserId, expiresAt). The client passes the token to
 * signIn("impersonate", { token }); the CredentialsProvider verifies
 * the HMAC and re-derives both identities from it.
 *
 * Body: { organizationId: string }
 * Returns: { email: string, name: string, token: string }
 *
 * Prior version returned only email/name and expected the client to
 * call signIn("impersonate") with the admin's email + the target's
 * email as credentials. The provider gated only on "is adminEmail
 * an ADMIN in DB", never on the caller's current session — an
 * unauthenticated attacker who knew any admin email could POST
 * directly to /api/auth/callback/impersonate and mint any user's
 * session. This route is now the ONLY mint path; the provider
 * accepts only the token this route produces.
 */
export const POST = withErrorTracking(async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  const body = await request.json();
  const { organizationId, userId } = body as { organizationId?: string; userId?: string };

  // Resolve target user by one of two inputs:
  //  - organizationId → the org's owner (used by /app/admin/organizations)
  //  - userId → the specific user (used by /app/admin/manage-users UserAction)
  let targetUser: { id: string; email: string; name: string | null } | null = null;
  let auditTargetType: "organization" | "user" = "organization";
  let auditTargetId = organizationId ?? userId ?? "unknown";

  if (organizationId) {
    const membership = await prisma.membership.findFirst({
      where: { organizationId, role: "owner" },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!membership?.user?.email) {
      return NextResponse.json({ message: "No owner found for this organization" }, { status: 404 });
    }
    targetUser = { id: membership.user.id, email: membership.user.email, name: membership.user.name };
    auditTargetType = "organization";
    auditTargetId = organizationId;
  } else if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user?.email) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    targetUser = user;
    auditTargetType = "user";
    auditTargetId = userId;
  } else {
    return NextResponse.json(
      { message: "organizationId or userId required" },
      { status: 400 },
    );
  }

  const token = signImpersonationToken(gate.admin.userId, targetUser.id);

  // Audit log
  const ip = await getIp();
  logAuditEvent({
    actorId: gate.admin.userId,
    actorEmail: gate.admin.email ?? "unknown",
    action: "org.impersonate",
    targetType: auditTargetType,
    targetId: auditTargetId,
    targetName: targetUser.name ?? targetUser.email,
    metadata: { impersonatedEmail: targetUser.email },
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({
    email: targetUser.email,
    name: targetUser.name,
    token,
  });
}, { endpoint: "/api/admin/impersonate", method: "POST" });
