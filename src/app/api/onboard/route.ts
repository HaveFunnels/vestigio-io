import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { absoluteUrl } from "@/libs/uitls";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { withErrorTracking } from "@/libs/error-tracker";
import { checkRateLimit } from "@/libs/limiter";
import { resolvePriceIdForPlan, type PaymentProviderKey } from "@/libs/plan-config";

// ──────────────────────────────────────────────
// Onboarding API — creates org + starts checkout
//
// Flow:
// 1. Validate input
// 2. Create Organization (pending)
// 3. Create Environment
// 4. Create BusinessProfile
// 5. Create Stripe checkout session
// 6. Return checkout URL
//
// On webhook (checkout.session.completed):
// → activate org, create membership, set plan
// ──────────────────────────────────────────────

const onboardSchema = z.object({
  organizationName: z.string().min(1).max(100),
  domain: z.string().min(3).max(253).refine(
    (d) => {
      const cleaned = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
      // Block path traversal, localhost, IPs, and special chars
      if (/^[./]|\.\.|\s|[<>"'`]/.test(cleaned)) return false;
      if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01]))/.test(cleaned)) return false;
      // Must look like a domain (at least one dot, valid chars)
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleaned);
    },
    { message: "Invalid domain format" },
  ),
  businessModel: z.enum(["ecommerce", "lead_gen", "saas", "hybrid"]),
  monthlyRevenue: z.number().nullable().optional(),
  averageOrderValue: z.number().nullable().optional(),
  conversionModel: z.enum(["checkout", "whatsapp", "form", "external"]),
  primaryConcern: z
    .enum([
      "traffic_no_sales",
      "low_conversion",
      "unknown_leak",
      "scale_efficiency",
      "prioritization",
    ])
    .optional()
    .nullable(),
  currentOptimizationMethod: z
    .enum([
      "analytics_tools",
      "session_replay",
      "agency_consultant",
      "team_judgment",
      "spreadsheets",
      "nothing",
    ])
    .optional()
    .nullable(),
  whyNow: z
    .enum([
      "scaling_paid_traffic",
      "recent_drop",
      "prove_roi",
      "competitive_pressure",
      "chronic_pain",
      "exploring",
    ])
    .optional()
    .nullable(),
  // planKey + cadence + paymentProvider are the ONLY billing levers
  // a client controls. The provider-specific priceId is resolved
  // server-side via resolvePriceIdForPlan so a caller can't pass a
  // legacy/promo priceId that still maps to a paid tier via the
  // resolvePlanFromPriceId path at webhook time (plan tampering).
  planKey: z.enum(["vestigio", "pro", "max"]),
  cadence: z.enum(["monthly", "annual"]).default("monthly"),
  paymentProvider: z.enum(["stripe", "paddle"]).optional().default("stripe"),
  // Industry vertical captured in the onboarding "Industry" step. Mirrors
  // the /api/environments/activate shape so the BusinessProfile row carries
  // the value regardless of which path created it.
  targetIndustry: z.string().trim().min(1).optional().nullable(),
  ownershipConfirmed: z.boolean().optional(),
  // SaaS optional fields
  saasLoginUrl: z.string().url().optional(),
  saasEmail: z.string().email().optional(),
  saasAuthMethod: z.enum(["unknown", "password", "oauth", "magic_link"]).optional(),
  saasMfaMode: z.enum(["unknown", "none", "optional", "required"]).optional(),
});

export const POST = withErrorTracking(async function POST(request: Request) {
  const { requireEnv } = await import("@/libs/requireEnv");
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2023-10-16",
  });

  // Rate limit: 3 org creations per hour per IP
  const limited = await checkRateLimit(3, 3600000);
  if (limited) return limited;

  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const res = onboardSchema.safeParse(payload);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const {
    organizationName,
    domain,
    businessModel,
    monthlyRevenue,
    averageOrderValue,
    conversionModel,
    planKey,
    cadence,
    paymentProvider,
    targetIndustry,
    ownershipConfirmed,
    saasLoginUrl,
    saasEmail,
    saasAuthMethod,
    saasMfaMode,
  } = res.data;

  // Server-side price resolution.
  const priceId = await resolvePriceIdForPlan(
    planKey,
    cadence,
    paymentProvider as PaymentProviderKey,
  );
  if (!priceId) {
    return NextResponse.json(
      {
        message: `No ${paymentProvider} ${cadence} priceId configured for plan ${planKey}`,
      },
      { status: 400 },
    );
  }

  // Normalize domain
  const normalizedDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const landingUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  try {
    // Create organization (pending until payment)
    const org = await prisma.organization.create({
      data: {
        name: organizationName,
        ownerId: user.id,
        plan: "vestigio",
        status: "pending",
      },
    });

    // Create environment
    const env = await prisma.environment.create({
      data: {
        organizationId: org.id,
        domain: normalizedDomain,
        landingUrl,
        isProduction: true,
      },
    });

    // Create SaaS access config if provided
    if (saasLoginUrl) {
      await prisma.saasAccessConfig.create({
        data: {
          environmentId: env.id,
          loginUrl: saasLoginUrl,
          email: saasEmail || null,
          authMethod: saasAuthMethod || "unknown",
          mfaMode: saasMfaMode || "unknown",
          status: "configured",
        },
      });
    }

    // Create business profile
    await prisma.businessProfile.create({
      data: {
        organizationId: org.id,
        businessModel,
        monthlyRevenue: monthlyRevenue || null,
        averageOrderValue: averageOrderValue || null,
        conversionModel,
        // Persist the onboarding fields that used to be silently dropped.
        targetIndustry: targetIndustry?.trim() || null,
        ownershipConfirmedAt: ownershipConfirmed ? new Date() : null,
      },
    });

    // If Paddle, skip Stripe checkout — client handles Paddle.Checkout.open()
    if (paymentProvider === "paddle") {
      return NextResponse.json({
        organizationId: org.id,
      });
    }

    // Create Stripe checkout session with org metadata
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: absoluteUrl(`/app/onboarding?payment_success=true&org=${org.id}`),
      cancel_url: absoluteUrl("/app/onboarding?step=5"),
      metadata: {
        userId: user.id,
        organizationId: org.id,
        onboarding: "true",
      },
    });

    return NextResponse.json({
      url: session.url,
      organizationId: org.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}, { endpoint: "/api/onboard", method: "POST" });
