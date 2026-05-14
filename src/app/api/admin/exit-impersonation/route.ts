import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, signRestoreToken } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { getIp } from "@/libs/get-ip";

// ──────────────────────────────────────────────
// POST /api/admin/exit-impersonation
//
// Used by the "Exit impersonation" button in the user menu. Returns a
// short-lived restore token + the admin email so the client can call
// signIn("restore-admin", { token, adminEmail }) without forcing the
// admin to re-authenticate.
//
// Security gates:
//   1. Caller must be in an impersonation session (token.isImpersonating).
//   2. The originalAdminEmail must be present on the session token
//      (captured at impersonation start).
// If either check fails, returns 403 — the request is treated as if
// the user tried to call restore-admin from a non-impersonation
// session, which would be a privilege-escalation attempt.
// ──────────────────────────────────────────────

export async function POST() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!user || !user.isImpersonating || !user.originalAdminEmail) {
    return NextResponse.json(
      { message: "No impersonation session to exit" },
      { status: 403 },
    );
  }

  const adminEmail = String(user.originalAdminEmail).toLowerCase();
  const token = signRestoreToken(adminEmail);

  // Audit log — pair with the original "org.impersonate" event so
  // audit reviewers can match start/end of each impersonation.
  const ip = await getIp();
  logAuditEvent({
    actorId: user.id ?? "unknown",
    actorEmail: adminEmail,
    action: "org.impersonate.exit",
    targetType: "user",
    targetId: user.id ?? "unknown",
    targetName: user.email ?? "unknown",
    metadata: { impersonatedEmail: user.email },
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({ adminEmail, token });
}
