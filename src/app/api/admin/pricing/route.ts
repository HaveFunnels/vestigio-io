import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
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

const planSchema = z.object({
  key: z.string(),
  label: z.string(),
  priceId: z.string(),
  paddlePriceId: z.string().optional(),
  lemonSqueezyPriceId: z.string().optional(),
  monthlyPriceCents: z.number(),
  maxMcpCalls: z.number(),
  continuousAudits: z.boolean(),
  creditsEnabled: z.boolean(),
  maxEnvironments: z.number(),
  maxMembers: z.number(),
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
  { key: "vestigio", label: "Vestigio", priceId: "", paddlePriceId: "", lemonSqueezyPriceId: "", monthlyPriceCents: 9900, maxMcpCalls: 50, continuousAudits: false, creditsEnabled: false, maxEnvironments: 1, maxMembers: 1 },
  { key: "pro", label: "Vestigio Pro", priceId: "", paddlePriceId: "", lemonSqueezyPriceId: "", monthlyPriceCents: 19900, maxMcpCalls: 250, continuousAudits: true, creditsEnabled: false, maxEnvironments: 3, maxMembers: 3 },
  { key: "max", label: "Vestigio Max", priceId: "", paddlePriceId: "", lemonSqueezyPriceId: "", monthlyPriceCents: 39900, maxMcpCalls: 1000, continuousAudits: true, creditsEnabled: true, maxEnvironments: 10, maxMembers: 10 },
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

  await Promise.all([
    prisma.platformConfig.upsert({
      where: { configKey: CONFIG_KEY_PLANS },
      create: { configKey: CONFIG_KEY_PLANS, value: JSON.stringify(res.data.plans) },
      update: { value: JSON.stringify(res.data.plans) },
    }),
    prisma.platformConfig.upsert({
      where: { configKey: CONFIG_KEY_CREDITS },
      create: { configKey: CONFIG_KEY_CREDITS, value: JSON.stringify(res.data.credits) },
      update: { value: JSON.stringify(res.data.credits) },
    }),
  ]);

  return NextResponse.json({ message: "Saved" });
}, { endpoint: "/api/admin/pricing", method: "POST" });
