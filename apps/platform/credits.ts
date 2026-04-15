import { getPlanEntitlements, PlanKey } from '../../packages/plans';
import { prisma } from '../../src/libs/prismaDb';

// ──────────────────────────────────────────────
// Credit System
//
// Verification consumes credits. Credits are per-organization and
// persisted in `OrgCredits`. Two buckets:
//   plan_included  — monthly quota granted by subscription. Resets
//                    every 30 days (cycleStartAt anchor).
//   purchased      — bought via Credit Packs. Never expires. Only
//                    decremented once the plan-included pool is
//                    drained for the current cycle.
//
// Max plan can buy packs. Pro/Starter see an upgrade nudge instead.
//
// Prior to this revision, credits lived in an in-process Map and were
// lost on every deploy. The DB model + CreditTransaction audit trail
// was added when credit packs shipped (see src/app/api/paddle/webhook).
// ──────────────────────────────────────────────

export interface CreditBalance {
  organization_id: string;
  plan_included: number;
  purchased: number;
  consumed: number; // plan-included consumed this cycle — NOT cumulative lifetime
  available: number;
}

const CYCLE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Plan-included credits per cycle. Deliberately kept in code (not
// PlatformConfig) so admins can't silently dial costs away from the
// entitlements gating other features.
const PLAN_CREDITS: Record<PlanKey, number> = {
  vestigio: 0, // no verification
  pro: 50, // limited
  max: 200, // full + can buy more
};

export function planIncludedCredits(plan: PlanKey): number {
  return PLAN_CREDITS[plan] || 0;
}

// Load-or-create the OrgCredits row and roll the cycle if the anchor
// is older than CYCLE_MS. Returns the fresh row.
async function ensureOrgCredits(orgId: string) {
  const row =
    (await prisma.orgCredits.findUnique({ where: { organizationId: orgId } })) ??
    (await prisma.orgCredits.create({ data: { organizationId: orgId } }));

  const age = Date.now() - row.cycleStartAt.getTime();
  if (age < CYCLE_MS) return row;

  // Cycle rollover — reset planConsumedThisCycle and snap the anchor
  // forward by whole cycles so we don't drift. purchasedBalance is
  // untouched (packs don't expire).
  const cyclesPassed = Math.floor(age / CYCLE_MS);
  const newAnchor = new Date(row.cycleStartAt.getTime() + cyclesPassed * CYCLE_MS);
  return prisma.orgCredits.update({
    where: { organizationId: orgId },
    data: { planConsumedThisCycle: 0, cycleStartAt: newAnchor },
  });
}

export async function getCreditBalance(orgId: string, plan: PlanKey): Promise<CreditBalance> {
  const row = await ensureOrgCredits(orgId);
  const planIncluded = planIncludedCredits(plan);
  const remainingPlan = Math.max(0, planIncluded - row.planConsumedThisCycle);
  return {
    organization_id: orgId,
    plan_included: planIncluded,
    purchased: row.purchasedBalance,
    consumed: row.planConsumedThisCycle,
    available: remainingPlan + row.purchasedBalance,
  };
}

export async function canAffordVerification(
  orgId: string,
  plan: PlanKey,
  cost: number,
): Promise<{
  allowed: boolean;
  balance: CreditBalance;
  shortfall: number;
  message: string | null;
}> {
  if (plan === 'vestigio') {
    const balance = await getCreditBalance(orgId, plan);
    return {
      allowed: false,
      balance,
      shortfall: cost,
      message: 'Browser verification requires Vestigio Pro or Max plan.',
    };
  }

  const balance = await getCreditBalance(orgId, plan);

  if (balance.available < cost) {
    const shortfall = cost - balance.available;
    const canBuy = plan === 'max';
    const message = canBuy
      ? `Insufficient credits. Need ${cost}, have ${balance.available}. Purchase ${shortfall} more credits to continue.`
      : `Insufficient credits. Need ${cost}, have ${balance.available}. Upgrade to Max to purchase additional credits.`;
    return { allowed: false, balance, shortfall, message };
  }

  return { allowed: true, balance, shortfall: 0, message: null };
}

/**
 * Consume `amount` credits. Eats plan-included first, then purchased.
 * If the total is insufficient, purchasedBalance is still decremented
 * (caller SHOULD have checked canAffordVerification first) — we don't
 * go negative past zero, but the caller's enforcement is what prevents
 * over-consumption.
 *
 * `plan` must be passed by the caller (the executor already knows it
 * via its scoping context) to avoid a second DB round-trip. Pass a
 * specific `PlanKey` when test-driving.
 */
export async function consumeCredits(
  orgId: string,
  amount: number,
  plan: PlanKey = 'max',
): Promise<void> {
  const row = await ensureOrgCredits(orgId);
  const planIncluded = planIncludedCredits(plan);
  const remainingPlan = Math.max(0, planIncluded - row.planConsumedThisCycle);

  let planBurn: number;
  let purchasedBurn: number;
  if (amount <= remainingPlan) {
    planBurn = amount;
    purchasedBurn = 0;
  } else {
    planBurn = remainingPlan;
    purchasedBurn = Math.min(row.purchasedBalance, amount - planBurn);
  }

  await prisma.$transaction([
    prisma.orgCredits.update({
      where: { organizationId: orgId },
      data: {
        planConsumedThisCycle: { increment: planBurn },
        purchasedBalance: { decrement: purchasedBurn },
      },
    }),
    prisma.creditTransaction.create({
      data: {
        orgCreditsId: row.id,
        kind: 'consume',
        amount,
        note: `plan=${planBurn} purchased=${purchasedBurn}`,
      },
    }),
  ]);
}

/**
 * Credit a pack purchase. Idempotent on paddleTransactionId — if the
 * same transaction is processed twice (Paddle retries the webhook),
 * the unique constraint blocks the second insert and we no-op.
 */
export async function addPurchasedCredits(
  orgId: string,
  amount: number,
  opts: { packKey?: string; paddleTransactionId?: string; note?: string } = {},
): Promise<{ credited: boolean; alreadyProcessed: boolean }> {
  const row = await ensureOrgCredits(orgId);

  if (opts.paddleTransactionId) {
    const existing = await prisma.creditTransaction.findUnique({
      where: { paddleTransactionId: opts.paddleTransactionId },
    });
    if (existing) {
      return { credited: false, alreadyProcessed: true };
    }
  }

  await prisma.$transaction([
    prisma.orgCredits.update({
      where: { organizationId: orgId },
      data: { purchasedBalance: { increment: amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        orgCreditsId: row.id,
        kind: 'purchase',
        amount,
        packKey: opts.packKey,
        paddleTransactionId: opts.paddleTransactionId,
        note: opts.note,
      },
    }),
  ]);
  return { credited: true, alreadyProcessed: false };
}

/** Delete a single org's credit state. Test-only helper. */
export async function resetCredits(orgId: string): Promise<void> {
  await prisma.orgCredits.deleteMany({ where: { organizationId: orgId } });
}

/** Delete ALL credit state. Test-only helper — never call from app code. */
export async function resetAllCredits(): Promise<void> {
  await prisma.creditTransaction.deleteMany({});
  await prisma.orgCredits.deleteMany({});
}
