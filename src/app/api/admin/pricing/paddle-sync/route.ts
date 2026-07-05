import { withErrorTracking } from "@/libs/error-tracker";
import {
  isPaddleConfigured,
  createProduct,
  createPrice,
} from "@/libs/paddle-api";
import { annualPriceCentsFromMonthly } from "@/libs/plan-config";
import { prisma } from "@/libs/prismaDb";
import { requireAdmin } from "@/libs/require-admin";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Manual Paddle Sync
//
// POST → reads plans from DB, creates missing
//         products/prices in Paddle, stores IDs back
// ──────────────────────────────────────────────

const CONFIG_KEY_PLANS = "plan_configs";

export const POST = withErrorTracking(async function POST() {
  const gate = await requireAdmin();
  if (gate.denied) return gate.denied;

  if (!isPaddleConfigured()) {
    return NextResponse.json(
      { message: "Paddle API key not configured" },
      { status: 400 },
    );
  }

  const plansRow = await prisma.platformConfig.findUnique({
    where: { configKey: CONFIG_KEY_PLANS },
  });

  if (!plansRow) {
    return NextResponse.json(
      { message: "No plans configured yet. Save pricing config first." },
      { status: 400 },
    );
  }

  const plans = JSON.parse(plansRow.value);
  let synced = 0;
  const errors: string[] = [];

  for (const plan of plans) {
    try {
      // Create product if missing
      if (!plan.paddleProductId) {
        const product = await createProduct(
          plan.label,
          `${plan.label} subscription plan`,
        );
        plan.paddleProductId = product.id;
        synced++;
      }

      // Create monthly price if missing
      if (!plan.paddlePriceId) {
        const price = await createPrice(
          plan.paddleProductId,
          plan.monthlyPriceCents,
          "month",
        );
        plan.paddlePriceId = price.id;
        synced++;
      }

      // Create annual price if missing. Discount is derived from the
      // monthly cents via annualPriceCentsFromMonthly so the rate stays
      // consistent with the rest of the codebase.
      if (!plan.paddleAnnualPriceId) {
        const annualPrice = await createPrice(
          plan.paddleProductId,
          annualPriceCentsFromMonthly(plan.monthlyPriceCents),
          "year",
        );
        plan.paddleAnnualPriceId = annualPrice.id;
        synced++;
      }
    } catch (err: any) {
      errors.push(`${plan.label}: ${err.message}`);
    }
  }

  // Persist updated Paddle IDs back to DB
  await prisma.platformConfig.upsert({
    where: { configKey: CONFIG_KEY_PLANS },
    create: { configKey: CONFIG_KEY_PLANS, value: JSON.stringify(plans) },
    update: { value: JSON.stringify(plans) },
  });

  return NextResponse.json({
    message: synced > 0 ? `Synced ${synced} item(s) to Paddle` : "All plans already synced",
    plans,
    errors: errors.length > 0 ? errors : undefined,
  });
}, { endpoint: "/api/admin/pricing/paddle-sync", method: "POST" });
