import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";
import { decodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Nuvemshop OAuth Callback
//
// Flow:
// 1. User clicks "Install" on /app/settings/data-sources — that hits
//    /api/integrations/nuvemshop/authorize, which mints an HMAC state
//    (envId + userId + provider + timestamp + nonce) and redirects
//    to Nuvemshop.
// 2. Nuvemshop redirects back here with ?code=XXX&state=YYY.
// 3. Verify state signature → verify state matches current session →
//    exchange code for token → persist under state.environmentId.
//
// The prior implementation had NO state parameter. Any store owner
// who installed the app got their access_token persisted into the
// browsing session's first environment (`environments[0]`), even
// if the install was triggered by a different account, and even if
// the target env belonged to another user. CSRF-injectable and
// cross-tenant. Both classes now closed by the state binding.
// ──────────────────────────────────────────────

const NUVEMSHOP_APP_ID = process.env.NUVEMSHOP_APP_ID || "";
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
  const state = searchParams.get("state");

  if (!code) {
    return redirect("/app/settings/data-sources?nuvemshop_error=missing_code");
  }
  if (!state) {
    return redirect("/app/settings/data-sources?nuvemshop_error=missing_state");
  }
  if (!NUVEMSHOP_APP_ID || !NUVEMSHOP_CLIENT_SECRET) {
    return redirect("/app/settings/data-sources?nuvemshop_error=nuvemshop_not_configured");
  }

  // Step 0: Verify signed state BEFORE anything else. Rejecting an
  // unsigned or expired state costs zero — no vendor API calls, no
  // DB writes.
  const decoded = decodeOAuthState(state);
  if (!decoded.ok) {
    return redirect(
      `/app/settings/data-sources?nuvemshop_error=${encodeURIComponent("state:" + decoded.error)}`,
    );
  }
  if (decoded.payload.provider !== "nuvemshop") {
    return redirect("/app/settings/data-sources?nuvemshop_error=state_provider_mismatch");
  }

  // Step 1: Session must match the user who initiated /authorize.
  // Prior code fetched session AFTER the token exchange and then
  // picked `environments[0]` — the state binding replaces both:
  // env is authoritative from the state, user identity is
  // authoritative from the session (verified equal to state.userId).
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId || sessionUserId !== decoded.payload.userId) {
    return redirect("/app/settings/data-sources?nuvemshop_error=state_session_mismatch");
  }

  const environmentId = decoded.payload.environmentId;

  // Step 2: Exchange the authorization code for an access token.
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
      // Bound the error body — Nuvemshop occasionally echoes the
      // OAuth `code` back in its error output; truncating limits
      // the token-code exposure in logs. See M10 H6.
      const errBody = (await tokenRes.text().catch(() => "")).slice(0, 200);
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

  // Step 3: Persist credentials against the env from state.
  try {
    await saveNuvemshopCredentials(environmentId, storeId, accessToken);
    return redirect("/app/settings/data-sources?nuvemshop_connected=true");
  } catch (err: any) {
    console.error(`[nuvemshop-callback] Error saving credentials:`, err);
    return redirect("/app/settings/data-sources?nuvemshop_error=save_failed");
  }
}

async function saveNuvemshopCredentials(
  environmentId: string,
  storeId: string,
  accessToken: string,
): Promise<void> {
  // Encrypt and persist. environmentId comes from the HMAC-verified
  // state payload — the prior "membership.environments[0]" heuristic
  // is gone, so multi-env orgs no longer land the token in the wrong
  // env just because the requesting user happened to belong to more
  // than one environment.
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
  }
}
