// ──────────────────────────────────────────────
// Credits — test-only helpers
//
// Isolated from credits.ts so an accidental import from src/ code can
// be linted against. None of these functions are safe in production —
// they wipe data, seed synthetic orgs, or assume a controlled test
// environment.
//
// Guarded at runtime: every helper throws if NODE_ENV === 'production'.
// ──────────────────────────────────────────────

import { PlanKey } from "../../packages/plans";
import { prisma } from "../../src/libs/prismaDb";

function assertNotProduction(fnName: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${fnName} called in production. This helper is test-only and would wipe customer data. ` +
        `Fix the caller; do not relax this guard.`,
    );
  }
}

/** Delete a single org's credit state. */
export async function resetCredits(orgId: string): Promise<void> {
  assertNotProduction("resetCredits");
  await prisma.orgCredits.deleteMany({ where: { organizationId: orgId } });
}

/**
 * Delete ALL credit state. DANGER: wipes every org's credits.
 * Tests run against a shared DB, so prefer file-scoped helpers
 * (seedTestOrg + cleanupTestOrg with namespaced ids). The global
 * wipe also races with parallel test files under `node --test`.
 */
export async function resetAllCredits(): Promise<void> {
  assertNotProduction("resetAllCredits");
  await prisma.creditTransaction.deleteMany({});
  await prisma.orgCredits.deleteMany({});
}

/**
 * Idempotently create a placeholder Organization row for a fake org id.
 * OrgCredits has a FK to Organization, so any test that exercises
 * canAffordVerification / consumeCredits with a synthetic org id must
 * seed the parent row first. Re-runs refresh the plan (so a test that
 * needs plan='pro' overwrites a previously-seeded plan='vestigio').
 *
 * Test ids should be prefixed per file (e.g. 'org_classify_*',
 * 'org_wiring_*') so concurrent test files don't collide on the same
 * row. The shared DB makes the global namespace fragile.
 */
export async function seedTestOrg(orgId: string, plan: PlanKey = "vestigio"): Promise<void> {
  assertNotProduction("seedTestOrg");
  await prisma.organization.upsert({
    where: { id: orgId },
    update: { plan, status: "active" },
    create: {
      id: orgId,
      name: `test-${orgId}`,
      ownerId: `test-owner-${orgId}`,
      plan,
      status: "active",
      orgType: "demo",
    },
  });
}

/** Remove a seeded org and its cascaded credit rows. */
export async function cleanupTestOrg(orgId: string): Promise<void> {
  assertNotProduction("cleanupTestOrg");
  await prisma.organization.deleteMany({ where: { id: orgId } });
}
