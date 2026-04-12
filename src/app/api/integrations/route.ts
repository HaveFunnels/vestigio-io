import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { encryptConfig, decryptConfig } from "@/libs/integration-crypto";
import { z } from "zod";

// ──────────────────────────────────────────────
// Integrations — POST (connect) + GET (list) + DELETE (disconnect)
// ──────────────────────────────────────────────

const SUPPORTED_PROVIDERS = ["shopify", "stripe", "meta_ads", "google_ads"] as const;

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

// ── Shopify connection verification ──────────

async function verifyShopifyConnection(config: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const { store_url, access_token } = config;

  if (!store_url || !access_token) {
    return { ok: false, error: "store_url and access_token are required for Shopify" };
  }

  // Normalize store URL: ensure it has the myshopify.com domain format
  const normalizedUrl = store_url.replace(/\/+$/, "");
  const shopUrl = `${normalizedUrl}/admin/api/2024-01/shop.json`;

  try {
    const res = await fetch(shopUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Invalid Shopify access token" };
      }
      return { ok: false, error: `Shopify API returned ${res.status}: ${body.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { ok: false, error: "Shopify API request timed out" };
    }
    return { ok: false, error: `Failed to reach Shopify: ${err.message}` };
  }
}

// ── Schemas ──────────────────────────────────

const connectSchema = z.object({
  environmentId: z.string().min(1),
  provider: z.enum(SUPPORTED_PROVIDERS),
  config: z.record(z.string(), z.string()).refine(
    (val) => Object.keys(val).length > 0,
    { message: "config must contain at least one key" },
  ),
});

const disconnectSchema = z.object({
  environmentId: z.string().min(1),
  provider: z.enum(SUPPORTED_PROVIDERS),
});

// ── POST — Connect an integration ────────────

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
  const res = connectSchema.safeParse(body);

  if (!res.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: res.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { environmentId, provider, config } = res.data;

  const accessCheck = await verifyEnvironmentAccess(userId, environmentId);
  if (!accessCheck.ok) {
    return NextResponse.json({ message: accessCheck.message }, { status: 403 });
  }

  // Encrypt the credentials
  const encryptedConfig = encryptConfig(config);

  // Upsert the integration connection
  const connection = await prisma.integrationConnection.upsert({
    where: {
      environmentId_provider: { environmentId, provider },
    },
    update: {
      config: encryptedConfig,
      status: "pending",
      syncError: null,
    },
    create: {
      environmentId,
      provider,
      config: encryptedConfig,
      status: "pending",
    },
  });

  // Verify connection for supported providers
  let verificationResult: { ok: boolean; error?: string } = { ok: true };

  if (provider === "shopify") {
    verificationResult = await verifyShopifyConnection(config);
  }
  // Future: add verification for stripe, meta_ads, google_ads

  // Update status based on verification
  const updatedConnection = await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      status: verificationResult.ok ? "connected" : "error",
      syncError: verificationResult.ok ? null : verificationResult.error,
    },
  });

  return NextResponse.json(
    {
      status: updatedConnection.status,
      provider: updatedConnection.provider,
      installed_at: updatedConnection.installedAt,
      ...(updatedConnection.syncError ? { message: updatedConnection.syncError } : {}),
    },
    { status: verificationResult.ok ? 201 : 200 },
  );
}, { endpoint: "/api/integrations", method: "POST" });

// ── GET — List integrations ──────────────────

export const GET = withErrorTracking(async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const environmentId = searchParams.get("environment_id");

  if (!environmentId) {
    return NextResponse.json({ message: "environment_id query param is required" }, { status: 400 });
  }

  const accessCheck = await verifyEnvironmentAccess(userId, environmentId);
  if (!accessCheck.ok) {
    return NextResponse.json({ message: accessCheck.message }, { status: 403 });
  }

  const integrations = await prisma.integrationConnection.findMany({
    where: { environmentId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    integrations: integrations.map((ic) => ({
      id: ic.id,
      provider: ic.provider,
      status: ic.status,
      syncError: ic.syncError,
      installedAt: ic.installedAt,
      lastSyncedAt: ic.lastSyncedAt,
      createdAt: ic.createdAt,
      // NEVER return decrypted config/tokens
    })),
  });
}, { endpoint: "/api/integrations", method: "GET" });

// ── DELETE — Disconnect an integration ───────

export const DELETE = withErrorTracking(async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const res = disconnectSchema.safeParse(body);

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

  const existing = await prisma.integrationConnection.findUnique({
    where: { environmentId_provider: { environmentId, provider } },
  });

  if (!existing) {
    return NextResponse.json({ message: "Integration not found" }, { status: 404 });
  }

  await prisma.integrationConnection.update({
    where: { id: existing.id },
    data: {
      status: "disconnected",
      config: "", // clear encrypted credentials
      syncError: null,
    },
  });

  return NextResponse.json({ message: "Integration disconnected" });
}, { endpoint: "/api/integrations", method: "DELETE" });
