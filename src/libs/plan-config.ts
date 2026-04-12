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
  paddlePriceId?: string;   // Paddle price ID
  lemonSqueezyPriceId?: string;
  monthlyPriceCents: number;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
  features?: PlanFeature[]; // Admin-configurable feature list for pricing table
}

const DEFAULT_FEATURES: Record<string, PlanFeature[]> = {
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

const DEFAULT_PLANS: PlanConfig[] = [
  { key: "vestigio", label: "Starter", priceId: "", paddleProductId: "", paddlePriceId: "", monthlyPriceCents: 9900, maxMcpCalls: 50, continuousAudits: false, creditsEnabled: false, maxEnvironments: 1, maxMembers: 1, features: DEFAULT_FEATURES.vestigio },
  { key: "pro", label: "Pro", priceId: "", paddleProductId: "", paddlePriceId: "", monthlyPriceCents: 19900, maxMcpCalls: 250, continuousAudits: true, creditsEnabled: false, maxEnvironments: 3, maxMembers: 3, features: DEFAULT_FEATURES.pro },
  { key: "max", label: "Max", priceId: "", paddleProductId: "", paddlePriceId: "", monthlyPriceCents: 39900, maxMcpCalls: 1000, continuousAudits: true, creditsEnabled: true, maxEnvironments: 10, maxMembers: 10, features: DEFAULT_FEATURES.max },
];

let cached: PlanConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

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

/** Resolve plan key from any provider's price ID */
export async function resolvePlanFromPriceId(priceId: string): Promise<string> {
  const plans = await getPlanConfigs();
  const match = plans.find(
    (p) => p.priceId === priceId || p.paddlePriceId === priceId || p.lemonSqueezyPriceId === priceId,
  );
  return match?.key || "vestigio";
}

/** Get plan config for a specific plan key */
export async function getPlanByKey(key: string): Promise<PlanConfig | undefined> {
  const plans = await getPlanConfigs();
  return plans.find((p) => p.key === key);
}

/** Invalidate cached config (call after admin saves) */
export function invalidatePlanCache() {
  cached = null;
  cacheTime = 0;
}
