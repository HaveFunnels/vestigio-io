// ──────────────────────────────────────────────
// Impersonation Controller
//
// Admin can impersonate any user/org.
// Session carries impersonation flag.
// Banner shown in UI. Safe exit guaranteed.
// ──────────────────────────────────────────────

export interface ImpersonationSession {
  active: boolean;
  admin_user_id: string;
  impersonated_user_id: string;
  impersonated_org_id: string | null;
  started_at: Date;
}

// Active impersonations (admin_user_id → session)
const activeSessions = new Map<string, ImpersonationSession>();

export function startImpersonation(
  adminUserId: string,
  targetUserId: string,
  targetOrgId: string | null = null,
): ImpersonationSession {
  if (activeSessions.has(adminUserId)) {
    throw new Error('Already impersonating. Exit current session first.');
  }

  const session: ImpersonationSession = {
    active: true,
    admin_user_id: adminUserId,
    impersonated_user_id: targetUserId,
    impersonated_org_id: targetOrgId,
    started_at: new Date(),
  };

  activeSessions.set(adminUserId, session);
  return session;
}

export function endImpersonation(adminUserId: string): void {
  activeSessions.delete(adminUserId);
}

export function getImpersonation(adminUserId: string): ImpersonationSession | null {
  return activeSessions.get(adminUserId) || null;
}

export function isImpersonating(adminUserId: string): boolean {
  return activeSessions.has(adminUserId);
}

export function getActiveImpersonations(): ImpersonationSession[] {
  return [...activeSessions.values()];
}

export function clearAllImpersonations(): void {
  activeSessions.clear();
}
