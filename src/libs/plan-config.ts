import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// Plan Config Resolution
//
// Single source of truth for plan metadata.
// Reads from PlatformConfig (admin-configurable).
// Falls back to defaults when no config exists.
// ──────────────────────────────────────────────

export interface PlanConfig {
  key: string;
  label: string;
  priceId: string;          // Stripe price ID
  paddlePriceId?: string;   // Paddle price ID
  lemonSqueezyPriceId?: string;
  monthlyPriceCents: number;
  maxMcpCalls: number;
  continuousAudits: boolean;
  creditsEnabled: boolean;
  maxEnvironments: number;
  maxMembers: number;
}

const DEFAULT_PLANS: PlanConfig[] = [
  { key: "vestigio", label: "Vestigio", priceId: "", paddlePriceId: "", monthlyPriceCents: 9900, maxMcpCalls: 50, continuousAudits: false, creditsEnabled: false, maxEnvironments: 1, maxMembers: 1 },
  { key: "pro", label: "Vestigio Pro", priceId: "", paddlePriceId: "", monthlyPriceCents: 19900, maxMcpCalls: 250, continuousAudits: true, creditsEnabled: false, maxEnvironments: 3, maxMembers: 3 },
  { key: "max", label: "Vestigio Max", priceId: "", paddlePriceId: "", monthlyPriceCents: 39900, maxMcpCalls: 1000, continuousAudits: true, creditsEnabled: true, maxEnvironments: 10, maxMembers: 10 },
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
