import { PlanKey, PlanEntitlements, PlanPricing, PlanLimits } from './types';

// ──────────────────────────────────────────────
// Plan Entitlements — what each plan unlocks
// ──────────────────────────────────────────────

const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  vestigio: { daily_mcp_budget: 5,   audit_frequency: 'none', playwright_budget: 0 },
  pro:      { daily_mcp_budget: 25,  audit_frequency: 'low',  playwright_budget: 5 },
  max:      { daily_mcp_budget: 100, audit_frequency: 'high', playwright_budget: 20 },
};

const PLAN_ENTITLEMENTS: Record<PlanKey, PlanEntitlements> = {
  vestigio: {
    plan: 'vestigio',
    label: 'Vestigio',
    max_mcp_calls_per_month: 50,
    continuous_audits_enabled: false,
    credits_enabled: false,
    max_environments: 1,
    max_members: 1,
    limits: PLAN_LIMITS.vestigio,
  },
  pro: {
    plan: 'pro',
    label: 'Vestigio Pro',
    max_mcp_calls_per_month: 250,
    continuous_audits_enabled: true,
    credits_enabled: false,
    max_environments: 3,
    max_members: 3,
    limits: PLAN_LIMITS.pro,
  },
  max: {
    plan: 'max',
    label: 'Vestigio Max',
    max_mcp_calls_per_month: 1000,
    continuous_audits_enabled: true,
    credits_enabled: true,
    max_environments: 10,
    max_members: 10,
    limits: PLAN_LIMITS.max,
  },
};

export function getPlanEntitlements(plan: PlanKey): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.vestigio;
}

export function getPlanLimits(plan: PlanKey): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.vestigio;
}

export function isPlanKey(value: string): value is PlanKey {
  return value === 'vestigio' || value === 'pro' || value === 'max';
}

// ──────────────────────────────────────────────
// Stripe Price → Plan mapping
// ──────────────────────────────────────────────

const PLAN_PRICING: PlanPricing[] = [
  { plan: 'vestigio', stripe_price_id: 'price_1ObHbkLtGdPVhGLem0CLA5iT', monthly_price_cents: 9900 },
  { plan: 'pro', stripe_price_id: 'price_1ObHcJLtGdPVhGLeBp9hB4nv', monthly_price_cents: 19900 },
  { plan: 'max', stripe_price_id: 'price_1ObHcXLtGdPVhGLejTMpdiT8', monthly_price_cents: 39900 },
];

export function planFromPriceId(priceId: string): PlanKey {
  const match = PLAN_PRICING.find(p => p.stripe_price_id === priceId);
  return match?.plan || 'vestigio';
}

export function priceIdForPlan(plan: PlanKey): string {
  const match = PLAN_PRICING.find(p => p.plan === plan);
  return match?.stripe_price_id || PLAN_PRICING[0].stripe_price_id;
}

export function getAllPlans(): PlanEntitlements[] {
  return Object.values(PLAN_ENTITLEMENTS);
}
