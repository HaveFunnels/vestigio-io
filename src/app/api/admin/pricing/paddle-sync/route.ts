import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
import {
  isPaddleConfigured,
  createProduct,
  createPrice,
} from "@/libs/paddle-api";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Manual Paddle Sync
//
// POST → reads plans from DB, creates missing
//         products/prices in Paddle, stores IDs back
// ──────────────────────────────────────────────

const CONFIG_KEY_PLANS = "plan_configs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }
  return session.user;
}

export const POST = withErrorTracking(async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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

      // Create price if missing
      if (!plan.paddlePriceId) {
        const price = await createPrice(
          plan.paddleProductId,
          plan.monthlyPriceCents,
        );
        plan.paddlePriceId = price.id;
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
