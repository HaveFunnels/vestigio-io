import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";

// ──────────────────────────────────────────────
// Nuvemshop OAuth Callback
//
// Handles the OAuth redirect from Nuvemshop after
// the store owner authorizes the Vestigio app.
//
// Flow:
// 1. User clicks "Install" on Nuvemshop → redirected to
//    https://www.tiendanube.com/apps/29656/authorize
// 2. After authorization, Nuvemshop redirects to this
//    callback with ?code=XXXXX in the query string
// 3. We exchange the code for an access_token + user_id (store_id)
// 4. We persist the credentials and redirect to Data Sources
// ───────────���──────────────────────────────────

const NUVEMSHOP_APP_ID = process.env.NUVEMSHOP_APP_ID || "29656";
const NUVEMSHOP_CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET || "";
const TOKEN_ENDPOINT = "https://www.tiendanube.com/apps/authorize/token";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/app/settings/data-sources?nuvemshop_error=missing_code", request.url),
    );
  }

  // Verify user is authenticated
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/app/settings/data-sources?nuvemshop_error=unauthorized", request.url),
    );
  }

  const userId = (session.user as any).id;

  // Exchange authorization code for access token
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
      return NextResponse.redirect(
        new URL("/app/settings/data-sources?nuvemshop_error=token_exchange_failed", request.url),
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    const storeId: string = String(tokenData.user_id);

    if (!accessToken || !storeId) {
      return NextResponse.redirect(
        new URL("/app/settings/data-sources?nuvemshop_error=invalid_token_response", request.url),
      );
    }

    // Find the user's environment. For now, pick the first environment
    // the user has access to. In the future, this could be passed via
    // state parameter in the OAuth flow.
    const membership = await prisma.membership.findFirst({
      where: { userId },
      include: { organization: { include: { environments: { take: 1 } } } },
    });

    const environmentId = membership?.organization?.environments?.[0]?.id;

    if (!environmentId) {
      return NextResponse.redirect(
        new URL("/app/settings/data-sources?nuvemshop_error=no_environment", request.url),
      );
    }

    // Encrypt and persist the credentials
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

    // Verify the connection works by fetching store info
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

    // Redirect to Data Sources with success indicator
    return NextResponse.redirect(
      new URL(`/app/settings/data-sources?nuvemshop_connected=true&env=${environmentId}`, request.url),
    );
  } catch (err: any) {
    console.error(`[nuvemshop-callback] Error:`, err);
    return NextResponse.redirect(
      new URL("/app/settings/data-sources?nuvemshop_error=unknown", request.url),
    );
  }
}
