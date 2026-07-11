import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Plan Config Resolution
//
// Single source of truth for plan metadata.
// Reads from PlatformConfig (admin-configurable).
// Falls back to defaults when no config exists.
// ──────────────────────────────────────────────

export interface PlanFeature {
  name: string;
  included: boolean;
}

export interface PlanConfig {
  key: string;
  label: string;
  priceId: string;          // Stripe price ID
  paddleProductId?: string; // Paddle product ID (auto-synced)
  paddlePriceId?: string;   // Paddle monthly price ID
  /**
   * Paddle annual price ID. Optional — when present, the billing page's
   * Annual cycle uses this priceId at checkout. Auto-provisioned by
   * /api/admin/pricing/paddle-sync (annualPriceCents = monthly × 9.6
   * = 20% off, see ANNUAL_DISCOUNT_MULTIPLIER below).
   */
  paddleAnnualPriceId?: string;
  lemonSqueezyPriceId?: string;
  monthlyPriceCents: number;
  /**
   * BRL monthly price (centavos). Used by Mercado Pago billing when
   * provider = "mercadopago". Distinct from monthlyPriceCents (USD)
   * because the markets are priced independently — no FX conversion
   * at runtime, no surprise rounding.
   */
  monthlyPriceCentsBrl?: number;
  /** Mercado Pago PreApproval plan id (monthly cadence). */
  mpPreapprovalPlanId?: string;
  /** Mercado Pago PreApproval plan id (annual cadence). Optional. */
  mpAnnualPreapprovalPlanId?: string;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
  features?: PlanFeature[]; // Admin-configurable feature list for pricing table
}

/**
 * How much the annual price discounts the monthly price. 9.6 = 9.6
 * months of monthly billing for the year (= 20% off vs. paying
 * monthly for 12 months). Matches the "Save 20%" badge shown on the
 * pricing card. Kept here so the derivation is consistent across the
 * admin paddle-sync, mp-sync, and any UI that displays the discount.
 *
 * Historical note: through 2026-07 this was 10 (~17% off) because
 * the pricing card overpromised — badge said 20 but math said 17.
 * Aligned to 20% at Luis's request when the payment provider flipped
 * back to Paddle.
 */
export const ANNUAL_DISCOUNT_MULTIPLIER = 9.6;

export function annualPriceCentsFromMonthly(monthlyCents: number): number {
  return Math.round(monthlyCents * ANNUAL_DISCOUNT_MULTIPLIER);
}

/**
 * Wave 5 Fase 3 — cycle cadence by plan.
 *
 * Cold is mandatory for every plan (weekly minimum) so no env ever
 * drifts without a baseline reset. Hot + warm are the incremental
 * tiers that Pro/Max pay for.
 *
 * minIntervalMs = 0 means "not scheduled for this plan". The scheduler
 * skips tiers at 0 rather than emitting cycles at infinity.
 *
 * Intentionally kept out of `PlanConfig` itself (which is admin-
 * configurable via /app/admin/pricing) because exposing cadence as a
 * tunable would let an admin silently dial down engine-level behavior
 * without understanding downstream costs. Cadence is code-defined and
 * requires a deploy to change.
 */
export interface CycleCadence {
  hotMs: number;  // 0 = no hot cycles
  warmMs: number; // 0 = no warm cycles
  coldMs: number; // cold is always >0 (weekly floor for Starter)
}

export const PLAN_CADENCE: Record<string, CycleCadence> = {
  vestigio: {
    hotMs: 0,
    warmMs: 0,
    coldMs: 7 * 24 * 60 * 60 * 1000, // 1 week
  },
  pro: {
    hotMs: 60 * 60 * 1000,      // 1h
    warmMs: 4 * 60 * 60 * 1000, // 4h
    coldMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  },
  max: {
    hotMs: 15 * 60 * 1000,      // 15min
    warmMs: 60 * 60 * 1000,     // 1h
    coldMs: 24 * 60 * 60 * 1000, // 1 day
  },
};

/** Fallback cadence for plans not in PLAN_CADENCE (unknown plan key).
 *  Same as Starter — conservative weekly baseline only. */
export const DEFAULT_CADENCE: CycleCadence = PLAN_CADENCE.vestigio;

export function getCadenceForPlan(planKey: string): CycleCadence {
  return PLAN_CADENCE[planKey] || DEFAULT_CADENCE;
}

const DEFAULT_FEATURES: Record<string, PlanFeature[]> = {
  free: [
    { name: "Read-only access to last cycle", included: true },
    { name: "0 environments", included: true },
    { name: "0 team members", included: true },
    { name: "No audit cycles", included: false },
    { name: "Agentic insights", included: false },
    { name: "Email support", included: false },
  ],
  vestigio: [
    { name: "1 environment", included: true },
    { name: "1 team member", included: true },
    { name: "Weekly audit cycles", included: true },
    { name: "Core findings & actions", included: true },
    { name: "Agentic insights", included: true },
    { name: "Email support", included: true },
    { name: "AI Chat assistant", included: false },
    { name: "Revenue integrity maps", included: false },
    { name: "Custom integrations", included: false },
    { name: "SSO / SAML", included: false },
    { name: "SLA guarantee", included: false },
  ],
  pro: [
    { name: "3 environments", included: true },
    { name: "3 team members", included: true },
    { name: "Daily audit cycles", included: true },
    { name: "Advanced findings & actions", included: true },
    { name: "5x more agentic insights", included: true },
    { name: "Priority support", included: true },
    { name: "AI Chat assistant", included: true },
    { name: "Revenue integrity maps", included: true },
    { name: "Custom integrations", included: true },
    { name: "SSO / SAML", included: false },
    { name: "SLA guarantee", included: false },
  ],
  max: [
    { name: "10 environments", included: true },
    { name: "10 team members", included: true },
    { name: "Daily audit cycles", included: true },
    { name: "Full analysis suite", included: true },
    { name: "20x more agentic insights", included: true },
    { name: "Dedicated account manager", included: true },
    { name: "AI Chat assistant", included: true },
    { name: "Revenue integrity maps", included: true },
    { name: "Custom integrations", included: true },
    { name: "SSO / SAML", included: true },
    { name: "SLA guarantee", included: true },
  ],
};

// `free` is the fallback status. Users land here when they haven't
// paid yet (just signed up) or after a lapse (PIX missed, chargeback,
// cancellation). It has no MP plan and no checkout — to leave `free`
// the user has to pick Starter/Pro/Max via the billing page.
//
// `vestigio` is the Starter PAID tier (R$ 99 / mo). Historical naming
// — the key kept its original brand name to avoid a destructive
// rename across DB rows. Label is "Starter" in the UI.
const DEFAULT_PLANS: PlanConfig[] = [
  { key: "free", label: "Free", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", monthlyPriceCents: 0, monthlyPriceCentsBrl: 0, mpPreapprovalPlanId: "", mpAnnualPreapprovalPlanId: "", maxMcpCalls: 0, continuousAudits: false, creditsEnabled: false, maxEnvironments: 0, maxMembers: 0, features: DEFAULT_FEATURES.free },
  { key: "vestigio", label: "Starter", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", monthlyPriceCents: 9900, monthlyPriceCentsBrl: 9900, mpPreapprovalPlanId: "", mpAnnualPreapprovalPlanId: "", maxMcpCalls: 50, continuousAudits: false, creditsEnabled: false, maxEnvironments: 1, maxMembers: 1, features: DEFAULT_FEATURES.vestigio },
  { key: "pro", label: "Pro", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", monthlyPriceCents: 19900, monthlyPriceCentsBrl: 19900, mpPreapprovalPlanId: "", mpAnnualPreapprovalPlanId: "", maxMcpCalls: 250, continuousAudits: true, creditsEnabled: false, maxEnvironments: 3, maxMembers: 3, features: DEFAULT_FEATURES.pro },
  { key: "max", label: "Max", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", monthlyPriceCents: 39900, monthlyPriceCentsBrl: 39900, mpPreapprovalPlanId: "", mpAnnualPreapprovalPlanId: "", maxMcpCalls: 1000, continuousAudits: true, creditsEnabled: true, maxEnvironments: 10, maxMembers: 10, features: DEFAULT_FEATURES.max },
];

let cached: PlanConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 3_600_000; // 1 hour

export async function getPlanConfigs(): Promise<PlanConfig[]> {
  if (cached && Date.now() - cacheTime < CACHE_TTL) return cached;

  try {
    const row = await prisma.platformConfig.findUnique({
      where: { configKey: "plan_configs" },
    });
    if (row) {
      cached = JSON.parse(row.value);
      cacheTime = Date.now();
      return cached!;
    }
  } catch {
    // DB unavailable — use defaults
  }
  return DEFAULT_PLANS;
}

/** Resolve plan key from any provider's price ID (monthly or annual).
 *  Falls back to "free" — the lapsed-status sentinel — when no match
 *  exists. This is safer than falling back to a paid tier: an
 *  unrecognized price id never accidentally grants Starter access. */
export async function resolvePlanFromPriceId(priceId: string): Promise<string> {
  const plans = await getPlanConfigs();
  const match = plans.find(
    (p) =>
      p.priceId === priceId ||
      p.paddlePriceId === priceId ||
      p.paddleAnnualPriceId === priceId ||
      p.lemonSqueezyPriceId === priceId ||
      p.mpPreapprovalPlanId === priceId ||
      p.mpAnnualPreapprovalPlanId === priceId,
  );
  return match?.key || "free";
}

/** Get plan config for a specific plan key */
export async function getPlanByKey(key: string): Promise<PlanConfig | undefined> {
  const plans = await getPlanConfigs();
  return plans.find((p) => p.key === key);
}

/**
 * FORWARD lookup: (planKey, cadence, provider) → canonical priceId.
 *
 * Server-side authoritative resolution — callers MUST use this instead
 * of accepting a raw priceId from client bodies. The raw-priceId intake
 * pattern let attackers hit /api/paddle/change-plan or /api/onboard with
 * legacy or promo priceIds (e.g. an old $0.99 Starter launch price that
 * was never removed from Paddle's price catalog) that still mapped to
 * a "max" tier via resolvePlanFromPriceId, resulting in bill-at-$0.99
 * → grant-max plan tampering. Every intake surface now takes a plan
 * key (from the fixed enum "vestigio"|"pro"|"max") plus a cadence and
 * we resolve to the priceId currently configured for that (plan,
 * cadence, provider) tuple.
 *
 * Returns null when the plan config is missing or the requested
 * provider/cadence combination hasn't been configured — callers
 * should surface a 400 rather than fall back to any priceId.
 */
export type Cadence = "monthly" | "annual";
export type PaymentProviderKey = "stripe" | "paddle" | "lemon_squeezy" | "mercadopago";

export async function resolvePriceIdForPlan(
  planKey: string,
  cadence: Cadence,
  provider: PaymentProviderKey,
): Promise<string | null> {
  const plan = await getPlanByKey(planKey);
  if (!plan) return null;
  switch (provider) {
    case "stripe": {
      // Stripe carries a single priceId in the config; cadence
      // splits (annual vs monthly) were never rolled out for Stripe
      // before the migration to Paddle+MP. If a caller requests
      // annual Stripe pricing they get null — that's a schema
      // mismatch, not a fallback opportunity.
      return cadence === "monthly" && plan.priceId ? plan.priceId : null;
    }
    case "paddle": {
      const id =
        cadence === "annual" ? plan.paddleAnnualPriceId : plan.paddlePriceId;
      return id || null;
    }
    case "lemon_squeezy": {
      return cadence === "monthly" && plan.lemonSqueezyPriceId
        ? plan.lemonSqueezyPriceId
        : null;
    }
    case "mercadopago": {
      const id =
        cadence === "annual"
          ? plan.mpAnnualPreapprovalPlanId
          : plan.mpPreapprovalPlanId;
      return id || null;
    }
  }
}

/** Invalidate cached config (call after admin saves) */
export function invalidatePlanCache() {
  cached = null;
  cacheTime = 0;
}
