// ──────────────────────────────────────────────
// Environment Context
//
// ALWAYS derive environment from authenticated user
// + active selection. NEVER trust raw query params.
//
// Rules:
// - validate membership before returning context
// - block cross-org access
// - return null if no valid context
// ──────────────────────────────────────────────

export interface EnvironmentContext {
  organization_id: string;
  environment_id: string;
  user_id: string;
  role: string;
}

/**
 * Resolve environment context from DB.
 * Validates that the user has a membership in the environment's org.
 */
export async function resolveEnvironmentContext(
  prisma: any,
  userId: string,
  environmentId: string,
): Promise<EnvironmentContext | null> {
  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { id: true, organizationId: true },
  });

  if (!environment) return null;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: environment.organizationId,
      },
    },
    select: { role: true },
  });

  if (!membership) return null;

  return {
    organization_id: environment.organizationId,
    environment_id: environment.id,
    user_id: userId,
    role: membership.role,
  };
}

/**
 * Validate that an environment belongs to a specific organization.
 * Prevents cross-org data leakage.
 */
export async function validateEnvironmentOwnership(
  prisma: any,
  environmentId: string,
  organizationId: string,
): Promise<boolean> {
  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { organizationId: true },
  });
  return env?.organizationId === organizationId;
}
