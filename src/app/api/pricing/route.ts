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
    paddlePriceId: p.paddlePriceId || "",
    maxMcpCalls: p.maxMcpCalls,
    continuousAudits: p.continuousAudits,
    creditsEnabled: p.creditsEnabled,
    maxEnvironments: p.maxEnvironments,
  }));

  return NextResponse.json({ plans: publicPlans });
}, { endpoint: "/api/pricing", method: "GET" });
