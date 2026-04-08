// ──────────────────────────────────────────────
// Demo Account — Single Source of Truth
//
// Identifies the demo account so write/destructive operations can
// refuse to touch it.
//
// **Why this file exists:** there used to be 5+ places across the
// codebase checking `email?.includes("demo-")` (with a hyphen) as a
// "is this the demo user" guard. But the real demo email is
// `demo@vestigio.io` — no hyphen — so every one of those guards
// silently passed through and the demo account had no protection at
// all. The demo data loss incident (2026-04-07) traced back to this:
// the demo user/org could be deleted, password-changed, or profile-
// updated by anyone hitting the relevant route. This module
// consolidates the check so the bug can't happen again — every
// caller now references the same constants and predicates, and
// future demo identifiers (additional emails, slugs, IDs) only need
// to be added here.
//
// The seed at prisma/seed.ts also sets `orgType: "demo"` on the
// demo organization, so `isDemoOrg()` matches both via the hardcoded
// id AND via the orgType column — resilient to either path being
// modified independently.
// ──────────────────────────────────────────────

export const DEMO_USER_EMAIL = "demo@vestigio.io";
export const DEMO_ORG_ID = "demo_org";
export const DEMO_ENV_ID = "demo_env";

/** True if this email belongs to the demo account. */
export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === DEMO_USER_EMAIL;
}

/** True if this organization is the demo org (by id OR by orgType). */
export function isDemoOrg(
  org: { id?: string | null; orgType?: string | null } | null | undefined,
): boolean {
  if (!org) return false;
  if (org.id === DEMO_ORG_ID) return true;
  if (org.orgType === "demo") return true;
  return false;
}

/** True if this environment belongs to the demo org. */
export function isDemoEnvironment(
  env: {
    id?: string | null;
    organizationId?: string | null;
    organization?: { id?: string | null; orgType?: string | null } | null;
  } | null | undefined,
): boolean {
  if (!env) return false;
  if (env.id === DEMO_ENV_ID) return true;
  if (env.organizationId === DEMO_ORG_ID) return true;
  if (env.organization && isDemoOrg(env.organization)) return true;
  return false;
}
