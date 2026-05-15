import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { withErrorTracking } from "@/libs/error-tracker";
import { getIp } from "@/libs/get-ip";
import {
  isPaddleConfigured,
  createProduct,
  createPrice,
} from "@/libs/paddle-api";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// Admin Pricing Config API
//
// GET  → read current plan config from PlatformConfig
// POST → save plan config + credit config
// ──────────────────────────────────────────────

const CONFIG_KEY_PLANS = "plan_configs";
const CONFIG_KEY_CREDITS = "credit_config";

const planFeatureSchema = z.object({
  name: z.string(),
  included: z.boolean(),
});

const planSchema = z.object({
  key: z.string(),
  label: z.string(),
  priceId: z.string(),
  paddleProductId: z.string().optional(),
  paddlePriceId: z.string().optional(),
  // Paddle annual price ID. Auto-provisioned by paddle-sync from the
  // monthly price (10× monthly = ~17% off, matching the historical
  // "Save 20%" badge). Stored alongside the monthly so the billing
  // page can pick the right priceId based on the selected cycle.
  paddleAnnualPriceId: z.string().optional(),
  lemonSqueezyPriceId: z.string().optional(),
  monthlyPriceCents: z.number(),
  maxMcpCalls: z.number(),
  continuousAudits: z.boolean(),
  creditsEnabled: z.boolean(),
  maxEnvironments: z.number(),
  maxMembers: z.number(),
  // Admin-configurable per-plan feature list shown in the customer-facing
  // pricing comparison table. Earlier the field was missing from the
  // schema entirely, so Zod stripped it on every save — the admin saw
  // "Saved!", reloaded, and the previous values reappeared.
  features: z.array(planFeatureSchema).optional(),
});

const saveSchema = z.object({
  plans: z.array(planSchema),
  credits: z.object({
    baseCostPerCall: z.number(),
    markupMultiplier: z.number(),
  }),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }
  return session.user;
}

// Default plans (used when no DB config exists yet)
const DEFAULT_PLANS = [
  { key: "vestigio", label: "Vestigio", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", lemonSqueezyPriceId: "", monthlyPriceCents: 9900, maxMcpCalls: 50, continuousAudits: false, creditsEnabled: false, maxEnvironments: 1, maxMembers: 1 },
  { key: "pro", label: "Vestigio Pro", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", lemonSqueezyPriceId: "", monthlyPriceCents: 19900, maxMcpCalls: 250, continuousAudits: true, creditsEnabled: false, maxEnvironments: 3, maxMembers: 3 },
  { key: "max", label: "Vestigio Max", priceId: "", paddleProductId: "", paddlePriceId: "", paddleAnnualPriceId: "", lemonSqueezyPriceId: "", monthlyPriceCents: 39900, maxMcpCalls: 1000, continuousAudits: true, creditsEnabled: true, maxEnvironments: 10, maxMembers: 10 },
];

const DEFAULT_CREDITS = { baseCostPerCall: 0.05, markupMultiplier: 2.0 };

export const GET = withErrorTracking(async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [plansRow, creditsRow] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { configKey: CONFIG_KEY_PLANS } }),
    prisma.platformConfig.findUnique({ where: { configKey: CONFIG_KEY_CREDITS } }),
  ]);

  const plans = plansRow ? JSON.parse(plansRow.value) : DEFAULT_PLANS;
  const credits = creditsRow ? JSON.parse(creditsRow.value) : DEFAULT_CREDITS;

  return NextResponse.json({ plans, credits });
}, { endpoint: "/api/admin/pricing", method: "GET" });

export const POST = withErrorTracking(async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const res = saveSchema.safeParse(payload);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Save to DB first — Paddle sync must not block this
  const plans = [...res.data.plans];

  await Promise.all([
    prisma.platformConfig.upsert({
      where: { configKey: CONFIG_KEY_PLANS },
      create: { configKey: CONFIG_KEY_PLANS, value: JSON.stringify(plans) },
      update: { value: JSON.stringify(plans) },
    }),
    prisma.platformConfig.upsert({
      where: { configKey: CONFIG_KEY_CREDITS },
      create: { configKey: CONFIG_KEY_CREDITS, value: JSON.stringify(res.data.credits) },
      update: { value: JSON.stringify(res.data.credits) },
    }),
  ]);

  // ── Paddle Sync ────────────────────────────────
  // Only run if PADDLE_API_KEY is configured.
  // Failures are non-blocking — we still return success for the DB save.
  let paddleSyncError: string | null = null;

  if (isPaddleConfigured()) {
    try {
      let plansUpdated = false;

      for (const plan of plans) {
        // 1. Create product if missing
        if (!plan.paddleProductId) {
          const product = await createProduct(
            plan.label,
            `${plan.label} subscription plan`,
          );
          plan.paddleProductId = product.id;
          plansUpdated = true;
        }

        // 2. Create monthly price if missing. paddleAnnualPriceId is
        //    provisioned in step 3 — both stay in sync as the admin
        //    edits the plan's monthlyPriceCents.
        if (!plan.paddlePriceId) {
          const price = await createPrice(
            plan.paddleProductId,
            plan.monthlyPriceCents,
            "month",
          );
          plan.paddlePriceId = price.id;
          plansUpdated = true;
        }

        // 3. Create annual price if missing. We import the multiplier
        //    so the discount lives in one place (10× monthly = ~17% off).
        if (!plan.paddleAnnualPriceId) {
          const { annualPriceCentsFromMonthly } = await import(
            "@/libs/plan-config"
          );
          const annualPrice = await createPrice(
            plan.paddleProductId,
            annualPriceCentsFromMonthly(plan.monthlyPriceCents),
            "year",
          );
          plan.paddleAnnualPriceId = annualPrice.id;
          plansUpdated = true;
        }
      }

      // Persist the Paddle IDs back to DB if anything changed
      if (plansUpdated) {
        await prisma.platformConfig.upsert({
          where: { configKey: CONFIG_KEY_PLANS },
          create: { configKey: CONFIG_KEY_PLANS, value: JSON.stringify(plans) },
          update: { value: JSON.stringify(plans) },
        });
      }
    } catch (err: any) {
      console.error("[Paddle Sync] Error:", err);
      paddleSyncError = err.message || "Unknown Paddle sync error";
    }
  }

  // Audit log
  const ip = await getIp();
  logAuditEvent({
    actorId: (admin as any).id,
    actorEmail: (admin as any).email ?? "unknown",
    action: "pricing.update",
    targetType: "config",
    targetName: "pricing",
    metadata: { planCount: plans.length, paddleSyncError },
    ipAddress: ip ?? undefined,
  });

  return NextResponse.json({
    message: "Saved",
    plans,
    paddleSyncError,
  });
}, { endpoint: "/api/admin/pricing", method: "POST" });
