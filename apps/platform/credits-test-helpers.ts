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

/**
 * Prefix synthetic test org ids with the current process PID + a sticky
 * test-run nonce. Two motivations:
 *
 *   1. The test suite runs against the shared Railway DB. If a real
 *      customer ever ends up with id matching a literal like
 *      'org_classify_1', cleanupTestOrg would delete their data.
 *      A PID prefix makes accidental collision effectively impossible.
 *
 *   2. `npm run test:all` runs files concurrently via `node --test`.
 *      Files that hard-code the same org id (e.g. two files both using
 *      'ws_1') race on resetAllCredits()-style global wipes. PID
 *      namespacing keeps each test process in its own lane even when
 *      file-level naming collides.
 *
 * Callers should use `nsOrgId('org_classify_3')` instead of the bare
 * literal. The function is a pass-through in NODE_ENV=test if
 * VESTIGIO_TEST_NO_NAMESPACE=1 is set (escape hatch for tests that
 * intentionally probe shared state).
 */
const TEST_RUN_NONCE = Date.now().toString(36).slice(-4);
export function nsOrgId(localId: string): string {
  if (process.env.VESTIGIO_TEST_NO_NAMESPACE === "1") return localId;
  return `test_${process.pid}_${TEST_RUN_NONCE}_${localId}`;
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

// Real customer orgs use cuid() ids (format: `c` + 24 alphanumerics).
// Test orgs MUST use a prefix that disambiguates from real cuids so
// cleanupTestOrg can never delete a real customer.
const SAFE_TEST_PREFIXES = ["org_", "test_", "demo_", "ws_"];

function assertSyntheticOrgId(orgId: string, fnName: string): void {
  if (SAFE_TEST_PREFIXES.some(p => orgId.startsWith(p))) return;
  throw new Error(
    `${fnName} called with org id '${orgId}' which does not start with a ` +
      `recognized test prefix (${SAFE_TEST_PREFIXES.join("|")}). Real ` +
      `customer orgs use cuid() ids — refusing to operate on what may be ` +
      `a real org row.`,
  );
}

/**
 * Idempotently create a placeholder Organization row for a synthetic
 * test org id. OrgCredits has a FK to Organization, so any test that
 * exercises canAffordVerification / consumeCredits with a synthetic
 * org id must seed the parent row first. Re-runs refresh the plan.
 *
 * Org id MUST start with one of SAFE_TEST_PREFIXES. Real customer
 * orgs use cuid() so they won't pass the prefix check — this is
 * the runtime guarantee that a buggy test cannot delete a paying
 * customer's row.
 *
 * Consider wrapping with `nsOrgId()` to add a per-process namespace
 * if running concurrent test processes against the shared DB.
 */
export async function seedTestOrg(orgId: string, plan: PlanKey = "vestigio"): Promise<void> {
  assertNotProduction("seedTestOrg");
  assertSyntheticOrgId(orgId, "seedTestOrg");
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

/** Remove a seeded org and its cascaded credit rows. Synthetic ids only. */
export async function cleanupTestOrg(orgId: string): Promise<void> {
  assertNotProduction("cleanupTestOrg");
  assertSyntheticOrgId(orgId, "cleanupTestOrg");
  await prisma.organization.deleteMany({ where: { id: orgId } });
}
