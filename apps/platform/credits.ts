import { getPlanEntitlements, PlanKey } from '../../packages/plans';

// ──────────────────────────────────────────────
// Credit System
//
// Verification consumes credits.
// Credits are per-organization.
// Only Max plan can purchase additional credits.
//
// Credit balance = plan_included + purchased - consumed
// ──────────────────────────────────────────────

export interface CreditBalance {
  organization_id: string;
  plan_included: number;
  purchased: number;
  consumed: number;
  available: number;
}

// In-memory store (production: backed by DB)
const creditStore = new Map<string, { purchased: number; consumed: number }>();

// Plan-included credits per month
const PLAN_CREDITS: Record<PlanKey, number> = {
  vestigio: 0,     // no verification
  pro: 50,         // limited
  max: 200,        // full + can buy more
};

export function getCreditBalance(orgId: string, plan: PlanKey): CreditBalance {
  const record = creditStore.get(orgId) || { purchased: 0, consumed: 0 };
  const planIncluded = PLAN_CREDITS[plan] || 0;
  const available = Math.max(0, planIncluded + record.purchased - record.consumed);

  return {
    organization_id: orgId,
    plan_included: planIncluded,
    purchased: record.purchased,
    consumed: record.consumed,
    available,
  };
}

export function canAffordVerification(orgId: string, plan: PlanKey, cost: number): {
  allowed: boolean;
  balance: CreditBalance;
  shortfall: number;
  message: string | null;
} {
  // Plan gating: vestigio cannot use verification at all
  if (plan === 'vestigio') {
    return {
      allowed: false,
      balance: getCreditBalance(orgId, plan),
      shortfall: cost,
      message: 'Browser verification requires Vestigio Pro or Max plan.',
    };
  }

  const balance = getCreditBalance(orgId, plan);

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

export function consumeCredits(orgId: string, amount: number): void {
  const record = creditStore.get(orgId) || { purchased: 0, consumed: 0 };
  record.consumed += amount;
  creditStore.set(orgId, record);
}

export function addPurchasedCredits(orgId: string, amount: number): void {
  const record = creditStore.get(orgId) || { purchased: 0, consumed: 0 };
  record.purchased += amount;
  creditStore.set(orgId, record);
}

export function resetCredits(orgId: string): void {
  creditStore.delete(orgId);
}

export function resetAllCredits(): void {
  creditStore.clear();
}
