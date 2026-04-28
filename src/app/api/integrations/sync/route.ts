import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { decryptConfig } from "@/libs/integration-crypto";
import { z } from "zod";

// ──────────────────────────────────────────────
// Integration Sync — POST (manual trigger)
// ──────────────────────────────────────────────

const SUPPORTED_PROVIDERS = ["shopify", "nuvemshop", "stripe", "meta_ads", "google_ads"] as const;

// ── Authorization helper ─────────────────────

async function verifyEnvironmentAccess(
  userId: string,
  environmentId: string,
): Promise<{ ok: boolean; message: string; organizationId?: string }> {
  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { organizationId: true },
  });

  if (!environment) {
    return { ok: false, message: "Environment not found" };
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: environment.organizationId,
      },
    },
  });

  if (!membership) {
    return { ok: false, message: "You do not have access to this environment" };
  }

  return { ok: true, message: "OK", organizationId: environment.organizationId };
}

// ── Shopify sync ─────────────────────────────

async function syncShopify(config: Record<string, string>): Promise<{ ok: boolean; summary?: Record<string, unknown>; error?: string }> {
  const { store_url, access_token } = config;

  if (!store_url || !access_token) {
    return { ok: false, error: "Missing store_url or access_token in config" };
  }

  const normalizedUrl = store_url.replace(/\/+$/, "");

  try {
    // Verify connection is still valid by fetching shop info
    const shopRes = await fetch(`${normalizedUrl}/admin/api/2024-01/shop.json`, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!shopRes.ok) {
      if (shopRes.status === 401 || shopRes.status === 403) {
        return { ok: false, error: "Invalid or expired Shopify access token" };
      }
      return { ok: false, error: `Shopify API returned ${shopRes.status}` };
    }

    const shopData = await shopRes.json();

    // Fetch recent orders count as a basic sync health check
    const ordersRes = await fetch(`${normalizedUrl}/admin/api/2024-01/orders/count.json?status=any`, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    let orderCount: number | null = null;
    if (ordersRes.ok) {
      const ordersData = await ordersRes.json();
      orderCount = ordersData.count ?? null;
    }

    // Fetch products count
    const productsRes = await fetch(`${normalizedUrl}/admin/api/2024-01/products/count.json`, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    let productCount: number | null = null;
    if (productsRes.ok) {
      const productsData = await productsRes.json();
      productCount = productsData.count ?? null;
    }

    return {
      ok: true,
      summary: {
        shop_name: shopData.shop?.name ?? null,
        shop_domain: shopData.shop?.domain ?? null,
        order_count: orderCount,
        product_count: productCount,
        synced_at: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { ok: false, error: "Shopify API request timed out" };
    }
    return { ok: false, error: `Sync failed: ${err.message}` };
  }
}

// ── Nuvemshop sync ──────────────────────────

async function syncNuvemshop(config: Record<string, string>): Promise<{ ok: boolean; summary?: Record<string, unknown>; error?: string }> {
  const { store_id, access_token } = config;

  if (!store_id || !access_token) {
    return { ok: false, error: "Missing store_id or access_token in config" };
  }

  const baseUrl = `https://api.nuvemshop.com.br/v1/${store_id}`;
  const headers = {
    "Authentication": `bearer ${access_token}`,
    "User-Agent": "Vestigio (support@vestigio.io)",
    "Content-Type": "application/json",
  };

  try {
    // Fetch store info
    const storeRes = await fetch(`${baseUrl}/store`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!storeRes.ok) {
      if (storeRes.status === 401 || storeRes.status === 403) {
        return { ok: false, error: "Token de acesso Nuvemshop inválido ou expirado" };
      }
      return { ok: false, error: `Nuvemshop API retornou ${storeRes.status}` };
    }

    const storeData = await storeRes.json();
    const storeName = typeof storeData.name === 'object'
      ? (storeData.name?.pt || storeData.name?.en || Object.values(storeData.name)[0] || null)
      : storeData.name || null;

    // Fetch order count
    // Nuvemshop uses x-total-count header for counts
    const ordersRes = await fetch(`${baseUrl}/orders?per_page=1&status=any`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    let orderCount: number | null = null;
    if (ordersRes.ok) {
      orderCount = parseInt(ordersRes.headers.get("x-total-count") || "0", 10) || null;
    }

    // Fetch product count
    const productsRes = await fetch(`${baseUrl}/products?per_page=1&published=true`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    let productCount: number | null = null;
    if (productsRes.ok) {
      productCount = parseInt(productsRes.headers.get("x-total-count") || "0", 10) || null;
    }

    return {
      ok: true,
      summary: {
        store_name: storeName,
        store_domain: storeData.original_domain ?? null,
        order_count: orderCount,
        product_count: productCount,
        synced_at: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { ok: false, error: "Nuvemshop API request timed out" };
    }
    return { ok: false, error: `Sync failed: ${err.message}` };
  }
}

// ── Schema ───────────────────────────────────

const syncSchema = z.object({
  environmentId: z.string().min(1),
  provider: z.enum(SUPPORTED_PROVIDERS),
});

// ── POST — Manual sync trigger ───────────────

export const POST = withErrorTracking(async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const res = syncSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { environmentId, provider } = res.data;

  const accessCheck = await verifyEnvironmentAccess(userId, environmentId);
  if (!accessCheck.ok) {
    return NextResponse.json({ message: accessCheck.message }, { status: 403 });
  }

  // Find the integration
  const connection = await prisma.integrationConnection.findUnique({
    where: { environmentId_provider: { environmentId, provider } },
  });

  if (!connection) {
    return NextResponse.json({ message: "Integration not found" }, { status: 404 });
  }

  if (connection.status === "disconnected") {
    return NextResponse.json({ message: "Integration is disconnected. Reconnect before syncing." }, { status: 400 });
  }

  // Decrypt credentials
  let config: Record<string, string>;
  try {
    config = decryptConfig(connection.config);
  } catch {
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: "error", syncError: "Failed to decrypt credentials — re-connect required" },
    });
    return NextResponse.json(
      { message: "Failed to decrypt integration credentials. Please reconnect." },
      { status: 500 },
    );
  }

  // Run the provider-specific sync
  let syncResult: { ok: boolean; summary?: Record<string, unknown>; error?: string };

  switch (provider) {
    case "shopify":
      syncResult = await syncShopify(config);
      break;
    case "nuvemshop":
      syncResult = await syncNuvemshop(config);
      break;
    case "stripe": {
      const { pollStripeData } = await import("../../../../../workers/stripe/poller");
      const stripePollResult = await pollStripeData({
        access_token: config.access_token,
        stripe_user_id: config.stripe_user_id,
      });
      syncResult = {
        ok: stripePollResult.errors.length === 0,
        summary: {
          mrr: stripePollResult.data.mrr,
          revenue: stripePollResult.data.revenue.total,
          currency: stripePollResult.data.revenue.currency,
          charge_count: stripePollResult.data.revenue.charge_count,
          dispute_rate: stripePollResult.data.dispute_rate,
          synced_at: new Date().toISOString(),
        },
        error: stripePollResult.errors[0] || undefined,
      };
      break;
    }
    case "meta_ads": {
      const { pollMetaAdsData: pollMeta } = await import("../../../../../workers/meta-ads/poller");
      const metaPollResult = await pollMeta({
        access_token: config.access_token,
        ad_account_id: config.ad_account_id,
      });
      syncResult = {
        ok: metaPollResult.errors.length === 0,
        summary: {
          ad_spend_30d: metaPollResult.data.ad_spend_30d,
          currency: metaPollResult.data.currency,
          creative_count: metaPollResult.data.creatives.length,
          synced_at: new Date().toISOString(),
        },
        error: metaPollResult.errors[0] || undefined,
      };
      break;
    }
    case "google_ads": {
      const { pollGoogleAdsData: pollGoogle } = await import("../../../../../workers/google-ads/poller");
      const googlePollResult = await pollGoogle({
        developer_token: config.developer_token,
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: config.refresh_token,
        customer_id: config.customer_id,
        login_customer_id: config.login_customer_id || undefined,
      });
      syncResult = {
        ok: googlePollResult.errors.length === 0,
        summary: {
          ad_spend_30d: googlePollResult.data.ad_spend_30d,
          currency: googlePollResult.data.currency,
          campaign_count: googlePollResult.data.campaigns.length,
          synced_at: new Date().toISOString(),
        },
        error: googlePollResult.errors[0] || undefined,
      };
      break;
    }
    default:
      return NextResponse.json(
        { message: `Sync not yet implemented for provider: ${provider}` },
        { status: 501 },
      );
  }

  // Update connection status
  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      status: syncResult.ok ? "connected" : "error",
      syncError: syncResult.ok ? null : syncResult.error,
      lastSyncedAt: syncResult.ok ? new Date() : connection.lastSyncedAt,
    },
  });

  if (!syncResult.ok) {
    return NextResponse.json(
      { status: "error", provider, message: syncResult.error },
      { status: 200 },
    );
  }

  return NextResponse.json({
    status: "connected",
    provider,
    summary: syncResult.summary,
    last_synced_at: new Date().toISOString(),
  });
}, { endpoint: "/api/integrations/sync", method: "POST" });
