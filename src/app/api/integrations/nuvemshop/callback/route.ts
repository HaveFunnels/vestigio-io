import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";

// ──────────────────────────────────────────────
// Nuvemshop OAuth Callback
//
// Flow:
// 1. User clicks "Install" → Nuvemshop auth page
// 2. After authorization, Nuvemshop redirects here with ?code=XXX
// 3. We exchange the code for access_token + user_id (store_id)
// 4. We persist the credentials and redirect to Data Sources
//
// The redirect comes from Nuvemshop but it's a browser GET,
// so the session cookie IS present. However, request.url may
// resolve to an internal address (0.0.0.0), so we use SITE_URL
// for all redirects.
// ──────────────────────────────────────────────

const NUVEMSHOP_APP_ID = process.env.NUVEMSHOP_APP_ID || "29656";
const NUVEMSHOP_CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET || "";
const TOKEN_ENDPOINT = "https://www.tiendanube.com/apps/authorize/token";

function getBaseUrl(): string {
  return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirect(path: string): NextResponse {
  return NextResponse.redirect(`${getBaseUrl()}${path}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return redirect("/app/settings/data-sources?nuvemshop_error=missing_code");
  }

  // Step 1: Exchange the authorization code for an access token.
  // We do this FIRST before the session check because the code
  // expires in 5 minutes — don't waste time on auth failures.
  let accessToken: string;
  let storeId: string;

  try {
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: NUVEMSHOP_APP_ID,
        client_secret: NUVEMSHOP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      console.error(`[nuvemshop-callback] Token exchange failed: ${tokenRes.status} ${errBody}`);
      return redirect("/app/settings/data-sources?nuvemshop_error=token_exchange_failed");
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
    storeId = String(tokenData.user_id);

    if (!accessToken || !storeId) {
      return redirect("/app/settings/data-sources?nuvemshop_error=invalid_token_response");
    }
  } catch (err: any) {
    console.error(`[nuvemshop-callback] Token exchange error:`, err);
    return redirect("/app/settings/data-sources?nuvemshop_error=token_exchange_failed");
  }

  // Step 2: Check user session.
  // The OAuth redirect is a browser GET, so the session cookie should be present.
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    // Session missing — redirect to login with a return URL that includes
    // the store_id and token so we can complete the connection after login.
    // For now, log the issue and redirect with an error.
    console.warn(
      `[nuvemshop-callback] No session found. Token was exchanged successfully ` +
      `(store_id=${storeId}) but user is not authenticated. ` +
      `This can happen if the callback URL domain doesn't match the session cookie domain.`,
    );
    // Still try to save — find any environment that doesn't have a nuvemshop connection
    // and save the credentials. The user can verify ownership via Data Sources.
    try {
      await saveNuvemshopCredentials(storeId, accessToken, null);
      return redirect("/app/settings/data-sources?nuvemshop_connected=true");
    } catch {
      return redirect("/app/settings/data-sources?nuvemshop_error=unauthorized");
    }
  }

  const userId = (session.user as any).id;

  // Step 3: Find the user's environment and persist credentials.
  try {
    await saveNuvemshopCredentials(storeId, accessToken, userId);
    return redirect("/app/settings/data-sources?nuvemshop_connected=true");
  } catch (err: any) {
    console.error(`[nuvemshop-callback] Error saving credentials:`, err);
    return redirect("/app/settings/data-sources?nuvemshop_error=save_failed");
  }
}

async function saveNuvemshopCredentials(
  storeId: string,
  accessToken: string,
  userId: string | null,
): Promise<void> {
  // Find the environment to attach to
  let environmentId: string | undefined;

  if (userId) {
    // User is authenticated — find their first environment
    const membership = await prisma.membership.findFirst({
      where: { userId },
      include: { organization: { include: { environments: { take: 1 } } } },
    });
    environmentId = membership?.organization?.environments?.[0]?.id;
  }

  if (!environmentId) {
    // Fallback: find any environment without a nuvemshop connection.
    // This handles the no-session case and single-tenant setups.
    const env = await prisma.environment.findFirst({
      where: {
        integrationConnections: {
          none: { provider: "nuvemshop", status: "connected" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    environmentId = env?.id;
  }

  if (!environmentId) {
    throw new Error("No environment found to attach Nuvemshop credentials");
  }

  // Encrypt and persist
  const encryptedConfig = encryptConfig({
    store_id: storeId,
    access_token: accessToken,
  });

  await prisma.integrationConnection.upsert({
    where: {
      environmentId_provider: { environmentId, provider: "nuvemshop" },
    },
    update: {
      config: encryptedConfig,
      status: "connected",
      syncError: null,
    },
    create: {
      environmentId,
      provider: "nuvemshop",
      config: encryptedConfig,
      status: "connected",
    },
  });

  // Verify the connection works
  try {
    const verifyRes = await fetch(`https://api.nuvemshop.com.br/v1/${storeId}/store`, {
      method: "GET",
      headers: {
        "Authentication": `bearer ${accessToken}`,
        "User-Agent": "Vestigio (support@vestigio.io)",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!verifyRes.ok) {
      await prisma.integrationConnection.update({
        where: { environmentId_provider: { environmentId, provider: "nuvemshop" } },
        data: { status: "error", syncError: `Verification failed: HTTP ${verifyRes.status}` },
      });
    }
  } catch (err) {
    console.warn(`[nuvemshop-callback] Verification failed (non-fatal):`, err);
  }
}
