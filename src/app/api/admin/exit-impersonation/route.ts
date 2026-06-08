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

  // Clear the active_env cookie. During impersonation, AppSidebarLayout
  // syncs it to the impersonated user's envId (e.g. demo_env). On exit,
  // the session goes back to the admin but the cookie stays — and every
  // client-side env read (notably the strategy page's getEnvironmentId)
  // trusts the cookie blindly, so the next API call carries demo_env
  // and gets 403 (membership-failed). Caught by the [strategy-deny]
  // diagnostic. We clear here as the authoritative reset; the layout
  // also defends-in-depth by always syncing on render.
  const response = NextResponse.json({ adminEmail, token });
  response.cookies.set("active_env", "", { path: "/", maxAge: 0 });
  return response;
}
