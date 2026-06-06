import { withErrorTracking } from "@/libs/error-tracker";
import { getPlanConfigs } from "@/libs/plan-config";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Public Pricing API — returns plan configs
// (no auth required, used by onboarding page)
// ──────────────────────────────────────────────

export const GET = withErrorTracking(async function GET() {
  const plans = await getPlanConfigs();

  // Return only the fields needed by the client
  const publicPlans = plans.map((p) => ({
    key: p.key,
    label: p.label,
    monthlyPriceCents: p.monthlyPriceCents,
    // BRL price for MP-fronted markets. The public homepage pricing
    // component picks BRL when present + active provider is MP.
    monthlyPriceCentsBrl: p.monthlyPriceCentsBrl || 0,
    paddlePriceId: p.paddlePriceId || "",
    // Empty when no annual price has been synced yet — the billing
    // page hides the annual toggle unless ALL plans expose a non-empty
    // annual id (see `isAnnualPriceReady` on the billing page).
    paddleAnnualPriceId: p.paddleAnnualPriceId || "",
    maxMcpCalls: p.maxMcpCalls,
    continuousAudits: p.continuousAudits,
    creditsEnabled: p.creditsEnabled,
    maxEnvironments: p.maxEnvironments,
    maxMembers: p.maxMembers,
  }));

  return NextResponse.json({ plans: publicPlans }, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}, { endpoint: "/api/pricing", method: "GET" });
